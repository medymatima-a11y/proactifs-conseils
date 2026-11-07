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

-- Dernier contact pertinent avec la personne (base du suivi de conservation de 12 mois sans suite).
-- NULL = jamais renseigné. Aucun défaut ni trigger : valeur posée manuellement, jamais à chaque modification.
-- L'endpoint /api/rsu-request n'écrit pas ce champ (insert limité aux champs validés).
alter table public.rsu_requests add column if not exists dernier_contact_at timestamptz null;

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

-- ── Temps réel : RETIRÉ le 06/11/2026 ─────────────────────
-- Cette migration ajoutait ici public.rsu_requests à la publication
-- `supabase_realtime`, celle de postgres_changes. Le CRM ne s'en sert plus pour
-- les demandes RSU : il n'écoute que le canal privé `rsu-demandes-prive`, qui
-- passe par realtime.messages (Broadcast) et sa politique RLS, pas par cette
-- publication. Un test de la suite CRM vérifie qu'aucun repli postgres_changes
-- ne subsiste.
--
-- Publier la table ici n'apportait donc rien, et le script Realtime de
-- production la retirait ensuite : deux écritures sur la production pour un
-- effet nul, plus une fenêtre pendant laquelle le signal d'activité des
-- demandes était observable par tout abonné. L'état visé est « hors
-- publication » ; on l'atteint maintenant sans jamais en sortir.
--
-- Conservé en commentaire parce que le projet TEST (wzuvyztsohdvarxsixce) a été
-- migré AVEC ce bloc, le 03/11/2026 : la table y figure donc dans la
-- publication, et c'est le script Realtime qui l'en retire.
--   do $$
--   begin
--     if not exists (
--       select 1 from pg_publication_tables
--       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rsu_requests'
--     ) then
--       alter publication supabase_realtime add table public.rsu_requests;
--     end if;
--   end $$;

-- ── Retour arrière (à exécuter manuellement si besoin) ────
-- drop policy if exists rsu_cabinet_select on public.rsu_requests;
-- drop table if exists public.rsu_requests;
-- (plus de ligne « alter publication … drop table » : cette migration
--  n'ajoute plus la table à la publication, il n'y a donc rien à défaire.
--  Sur TEST, migré avec l'ancien bloc, le retrait reste à la charge du
--  script Realtime de production.)
