-- ══════════════════════════════════════════════════════════
-- Reproduction jetable de public.leads, pour les bancs d'essai manuels
--
-- ⚠️ À N'EXÉCUTER QUE SUR UN PROJET SUPABASE JETABLE.
--    Projet d'essai utilisé le 22/11/2026 : crm-proactifs-TEST
--    (wzuvyztsohdvarxsixce), où `public.leads` n'existait pas.
--    NE JAMAIS exécuter sur la production du site (ullnkylrixdvormohryl) :
--    la table y existe déjà, avec les demandes réelles des visiteurs.
--
-- Ce fichier crée une table `leads` vide, ses politiques, un journal de
-- notifications et un trigger SANS AUCUN APPEL RÉSEAU. Aucune donnée réelle
-- n'est copiée, et rien n'est importé depuis la production.
--
-- D'où vient cette forme :
--   - colonnes : recoupement de ce que le site écrit (api/subscribe.js,
--     api/subscribe-guide.js, api/estimation.js) et de ce que le CRM lit et met
--     à jour (crm-proactifs/crm-interface.html) ;
--   - RLS et politiques : configuration d'accès relevée en production le
--     05/10/2026 dans
--     crm-proactifs/_branche-securite/securite-v2/tests/00-replique-locale.sql ;
--   - trigger : `on_new_lead_notify` AFTER INSERT FOR EACH ROW, avec la garde
--     de consentement de la version corrigée en production le 11/11/2026
--     (voir l'en-tête d'api/subscribe.js).
--
-- Ce que la reproduction N'A PAS : les colonnes que la production porterait en
-- plus, son volume, ses index, et le corps réel de notify_new_lead(), qu'aucun
-- fichier du dépôt ne définit.
--
-- Ordre : ce fichier, PUIS migration-leads-idempotence.sql (racine du dépôt).
-- Idempotent : relançable sans erreur.
-- ══════════════════════════════════════════════════════════

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  prenom          text,
  nom             text,
  email           text,
  telephone       text,
  source          text,
  situation       text,
  preoccupation   text,
  reponses        jsonb,
  statut          text,
  client_id       uuid,
  date_conversion date
);

alter table public.leads enable row level security;

-- ── Politiques relevées en production ─────────────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='leads_insert_public') then
    create policy leads_insert_public on public.leads for insert to public with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='crm_leads_all') then
    create policy crm_leads_all on public.leads for all to authenticated
      using (((auth.jwt() ->> 'is_anonymous')::boolean) is not true)
      with check (((auth.jwt() ->> 'is_anonymous')::boolean) is not true);
  end if;
end $$;

-- ── Journal des notifications : tient le rôle des appels externes ──
-- RLS activée et AUCUNE politique : service_role passe, personne d'autre.
-- C'est aussi la table marqueur que les bancs d'essai exigent (garde-essai.js).
create table if not exists public.zz_essai_notifications (
  id        bigint generated always as identity primary key,
  lead_id   uuid,
  email     text,
  canal     text,
  resultat  text,
  at        timestamptz default now()
);
alter table public.zz_essai_notifications enable row level security;

-- ── notify_new_lead() neutralisée ─────────────────────────
-- Trois modes, pilotés par public.zz_essai_reglage :
--   normal             : tout est « mis_en_file » — équivaut à pg_net, qui
--                        n'émet la requête qu'après le commit ;
--   echec_confirmation : la confirmation échoue APRÈS le commit (notification
--                        perdue, ligne conservée) ;
--   leve_exception     : appel synchrone en erreur — l'insertion est annulée.
-- Aucun appel réseau dans aucun des trois.
create table if not exists public.zz_essai_reglage (id int primary key default 1, mode text not null default 'normal');
insert into public.zz_essai_reglage (id, mode) values (1, 'normal') on conflict (id) do nothing;

create or replace function public.zz_essai_mode(m text) returns text
language plpgsql security definer set search_path = public as $$
begin
  update public.zz_essai_reglage set mode = m where id = 1;
  return m;
end $$;

create or replace function public.notify_new_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text;
begin
  select mode into m from public.zz_essai_reglage where id = 1;
  if m = 'leve_exception' then
    raise exception 'essai: notification synchrone en erreur';
  end if;
  insert into public.zz_essai_notifications (lead_id, email, canal, resultat)
  values (NEW.id, NEW.email, 'notification_interne', 'mis_en_file');
  insert into public.zz_essai_notifications (lead_id, email, canal, resultat)
  values (NEW.id, NEW.email, 'email_confirmation',
          case when m = 'echec_confirmation' then 'echec_http_502' else 'mis_en_file' end);
  if NEW.reponses #>> '{consentement,marketing}' = 'true' then
    insert into public.zz_essai_notifications (lead_id, email, canal, resultat)
    values (NEW.id, NEW.email, 'brevo_liste_23', 'mis_en_file');
  end if;
  return NEW;
end $$;

drop trigger if exists on_new_lead_notify on public.leads;
create trigger on_new_lead_notify after insert on public.leads
  for each row execute function public.notify_new_lead();

-- ══════════════════════════════════════════════════════════
-- POLITIQUES PROPRES À L'ESSAI — à poser avant, à retirer après
--
-- Écart assumé : en production l'endpoint écrit avec SUPABASE_SERVICE_KEY, qui
-- contourne RLS. Les bancs d'essai utilisent la clé anon : il faut donc leur
-- ouvrir le SELECT (return=representation et relecture) et le DELETE (purge
-- entre scénarios), et autoriser l'appel RPC du mode. Cela ne touche ni
-- ON CONFLICT ni le trigger : seule l'autorisation change.
--
-- ⚠️ Tant que ces lignes sont en place, la table est lisible et vidable avec
-- la seule clé publique. Les retirer dès la fin des essais.
--
--   create policy zz_essai_select_anon       on public.leads for select to anon using (true);
--   create policy zz_essai_delete_anon       on public.leads for delete to anon using (true);
--   create policy zz_essai_notif_anon        on public.zz_essai_notifications for select to anon using (true);
--   create policy zz_essai_notif_delete_anon on public.zz_essai_notifications for delete to anon using (true);
--   grant execute on function public.zz_essai_mode(text) to anon;
--
-- Retrait, à la fin :
--   drop policy if exists zz_essai_select_anon       on public.leads;
--   drop policy if exists zz_essai_delete_anon       on public.leads;
--   drop policy if exists zz_essai_notif_anon        on public.zz_essai_notifications;
--   drop policy if exists zz_essai_notif_delete_anon on public.zz_essai_notifications;
--   revoke execute on function public.zz_essai_mode(text) from anon;
--   delete from public.zz_essai_notifications;
--   delete from public.leads;
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- DÉMONTAGE COMPLET du décor d'essai, si l'on veut tout retirer
--
--   drop trigger if exists on_new_lead_notify on public.leads;
--   drop function if exists public.notify_new_lead();
--   drop function if exists public.zz_essai_mode(text);
--   drop table if exists public.zz_essai_reglage;
--   drop table if exists public.zz_essai_notifications;
--   drop table if exists public.leads;   -- SEULEMENT sur le projet jetable
-- ══════════════════════════════════════════════════════════
