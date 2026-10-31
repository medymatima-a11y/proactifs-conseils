-- ══════════════════════════════════════════════════════════
-- MIGRATION — table public.rsu_requests (demandes RSU/ESPP du site)
--
-- PRÉPARÉE LOCALEMENT. NON EXÉCUTÉE.
-- Exécution = GO ORANGE, d'abord sur le projet TEST (wzuvyztsohdvarxsixce), puis sur PROD
-- dans une étape distincte. Prérequis : public.is_cabinet_member() présente (vérifiée sur TEST).
--
-- Principes :
--   - RLS activé. Aucun accès anon.
--   - Le CRM (membres du cabinet) ne fait que LIRE. Supabase accorde par défaut TOUS les privilèges
--     à authenticated sur les tables du schéma public : ils sont retirés explicitement ci-dessous
--     (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN). Seul SELECT est rétabli.
--   - La RLS ne remplace pas ces révocations : TRUNCATE et REFERENCES ne lui sont pas soumis.
--   - Aucune politique INSERT : l'endpoint /api/rsu-request écrit avec la clé service (contourne RLS).
--   - Les privilèges par défaut du schéma public ne sont pas modifiés ici : toute nouvelle table
--     doit recevoir la même révocation explicite.
--   - Les listes de valeurs reprennent exactement celles de api/rsu-request.js.
--   - Idempotent : relançable sans erreur.
-- ══════════════════════════════════════════════════════════

create table if not exists public.rsu_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  nom             text not null check (char_length(nom) between 2 and 80),
  email           text not null check (char_length(email) between 5 and 160),
  telephone       text check (telephone is null or char_length(telephone) between 6 and 30),
  source          text not null default 'Analyse RSU/ESPP',
  dispositif      text not null check (dispositif in ('RSU / actions gratuites', 'ESPP', 'Stock-options', 'Plusieurs dispositifs', 'Autre')),
  besoin          text not null check (besoin in ('Comprendre la fiscalité', 'Préparer une vente', 'Déclaration fiscale', 'Mobilité internationale', 'Autre')),
  echeance        text not null check (echeance in ('Dès que possible', 'Dans les prochaines semaines', 'Simple prise d''information')),
  commentaire     text check (commentaire is null or char_length(commentaire) <= 600),
  consent_version text not null,
  consent_at      timestamptz not null,
  statut          text not null default 'nouveau'
);

-- Index utilisés par les limites de l'endpoint (par e-mail et par jour).
create index if not exists rsu_requests_email_created_idx on public.rsu_requests (email, created_at);
create index if not exists rsu_requests_created_idx       on public.rsu_requests (created_at);

-- ── Sécurité ──────────────────────────────────────────────
alter table public.rsu_requests enable row level security;

revoke all on public.rsu_requests from anon;
revoke all on public.rsu_requests from public;
revoke insert, update, delete, truncate, references, trigger, maintain on public.rsu_requests from authenticated;
grant select on public.rsu_requests to authenticated;

drop policy if exists rsu_cabinet_select on public.rsu_requests;
create policy rsu_cabinet_select on public.rsu_requests
  for select to authenticated
  using (public.is_cabinet_member());

-- ── Temps réel pour le CRM (les abonnés respectent RLS) ───
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rsu_requests'
  ) then
    alter publication supabase_realtime add table public.rsu_requests;
  end if;
end $$;

-- ── Retour arrière (à exécuter manuellement si besoin) ────
-- drop policy if exists rsu_cabinet_select on public.rsu_requests;
-- alter publication supabase_realtime drop table public.rsu_requests;
-- drop table if exists public.rsu_requests;
