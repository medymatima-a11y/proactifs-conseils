-- ══════════════════════════════════════════════════════════
-- ⚠️  NE PAS EXÉCUTER — FICHIER DE RÉFÉRENCE, SUPPLANTÉ LE 06/11/2026
--
-- Pour exécuter cette évolution de schéma, utiliser
-- `migration-rsu-TEST-delta.sql` (dépôt crm-proactifs), qui couvre tout le
-- contenu ci-dessous — mêmes colonnes, mêmes listes de valeurs — et y ajoute
-- les privilèges de colonnes du CRM. Comparaison faite instruction par
-- instruction : aucune des instructions de ce fichier n'y manque.
--
-- Ce fichier reste versionné pour deux raisons :
--   1. `tests/rsu-request.test.js` croise les listes de valeurs de
--      `api/rsu-request.js` avec le SQL. Sur 38 valeurs acceptées par l'API,
--      25 ne figurent QUE dans ce fichier : les six montants, les quatre
--      stades, les cinq situations internationales, et les valeurs élargies
--      de `dispositif` et `besoin`. `migration-rsu-requests.sql` n'en connaît
--      que 13. Retirer cette lecture ferait donc tomber le croisement sur les
--      deux tiers des valeurs, sans rien gagner.
--   2. Le fichier de remplacement vit dans un AUTRE dépôt. Un test du site ne
--      peut pas le lire : un clone du site, ou une CI, ne l'aurait pas.
--      Tant qu'il n'est pas suivi ici, la suite du site ne démarre pas ailleurs
--      que sur ce poste (vérifié : ENOENT au chargement du fichier de tests).
--
-- État réel : le schéma décrit ici est DÉJÀ en place sur le projet TEST
-- (wzuvyztsohdvarxsixce) depuis le 03/11/2026. Il n'est pas en place en
-- production : c'est le delta ci-dessus qui l'y posera.
--
-- Prérequis du contenu : migration-rsu-requests.sql appliquée (table + RLS).
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- MIGRATION — fusion du diagnostic RSU dans public.rsu_requests
--   (contenu d'origine, conservé tel quel — voir l'avertissement ci-dessus)
--
-- Objet : accueillir les réponses du diagnostic en six étapes sans perte.
--   Q1 « type de plan »           -> colonne existante dispositif (liste élargie)
--   Q2 « dimension internationale » -> NOUVELLE colonne dimension_internationale
--   Q3 « montant »                -> NOUVELLE colonne montant_estime
--   Q4 « où en êtes-vous »        -> NOUVELLE colonne stade
--   Q5 « qu'attendez-vous »       -> colonne existante besoin (liste élargie)
--   Étape contact « prénom »      -> NOUVELLE colonne prenom
--
-- Principes :
--   - Strictement additif. Aucune colonne supprimée, aucune donnée déplacée,
--     aucune ligne existante invalidée.
--   - Les 4 nouvelles colonnes sont NULLABLES : les lignes déjà enregistrées
--     restent valides, et une demande incomplète reste enregistrable.
--   - Les listes de valeurs reprennent EXACTEMENT les libellés du diagnostic
--     (champ `s` de actioSteps, sauf Q5 qui n'en a pas et utilise `l`).
--   - Les deux CHECK élargis contiennent l'UNION des anciennes valeurs et des
--     nouvelles : les lignes écrites par le formulaire simplifié restent lisibles.
--   - echeance perd son NOT NULL : le diagnostic ne pose pas cette question, et
--     inventer une échéance à partir du stade serait une donnée fabriquée.
--   - Idempotent : relançable sans erreur.
--   - RLS, politiques et privilèges ne sont PAS modifiés ici.
-- ══════════════════════════════════════════════════════════

-- ── 1. Les quatre nouvelles colonnes ──────────────────────
alter table public.rsu_requests add column if not exists prenom                   text null;
alter table public.rsu_requests add column if not exists montant_estime           text null;
alter table public.rsu_requests add column if not exists stade                    text null;
alter table public.rsu_requests add column if not exists dimension_internationale text null;

-- ── 2. Leurs contraintes de valeurs ───────────────────────
-- Posées séparément des colonnes pour rester relançables (add column if not
-- exists n'ajoute pas de contrainte à une colonne déjà présente).

alter table public.rsu_requests drop constraint if exists rsu_requests_prenom_check;
alter table public.rsu_requests add  constraint rsu_requests_prenom_check
  check (prenom is null or char_length(prenom) between 1 and 80);

alter table public.rsu_requests drop constraint if exists rsu_requests_montant_estime_check;
alter table public.rsu_requests add  constraint rsu_requests_montant_estime_check
  check (montant_estime is null or montant_estime in (
    '< 25 k€',
    '25 à 50 k€',
    '50 à 100 k€',
    '100 à 250 k€',
    '> 250 k€',
    'Montant non précisé'
  ));

alter table public.rsu_requests drop constraint if exists rsu_requests_stade_check;
alter table public.rsu_requests add  constraint rsu_requests_stade_check
  check (stade is null or stade in (
    'En acquisition',
    'Acquises, non vendues',
    'Déjà vendu',
    'Vesting ou vente proche'
  ));

alter table public.rsu_requests drop constraint if exists rsu_requests_dimension_internationale_check;
alter table public.rsu_requests add  constraint rsu_requests_dimension_internationale_check
  check (dimension_internationale is null or dimension_internationale in (
    'France',
    'Plusieurs pays',
    'Arrivée en France',
    'Départ de France',
    'International autre'
  ));

-- ── 3. Élargissement des deux listes existantes ───────────
-- UNION des valeurs du formulaire simplifié (à retirer) et du diagnostic.
-- Les 5 premières de chaque liste sont les anciennes : elles restent acceptées
-- pour que les lignes déjà enregistrées demeurent valides.

alter table public.rsu_requests drop constraint if exists rsu_requests_dispositif_check;
alter table public.rsu_requests add  constraint rsu_requests_dispositif_check
  check (dispositif in (
    'RSU / actions gratuites',
    'ESPP',
    'Stock-options',
    'Plusieurs dispositifs',
    'Autre',
    'RSU',
    'Actions gratuites',
    'Stock-options ou BSPCE',
    'Plan à préciser'
  ));

alter table public.rsu_requests drop constraint if exists rsu_requests_besoin_check;
alter table public.rsu_requests add  constraint rsu_requests_besoin_check
  check (besoin in (
    'Comprendre la fiscalité',
    'Préparer une vente',
    'Déclaration fiscale',
    'Mobilité internationale',
    'Autre',
    'Fiscalité de mes actions',
    'Préparation de ma déclaration',
    'Vente ou conservation de mes actions',
    'Départ ou arrivée en France',
    'Réinvestissement après une vente',
    'Vue d''ensemble de ma situation'
  ));

-- ── 4. echeance devient facultative ───────────────────────
-- Le diagnostic ne pose pas de question d'échéance (consigne : conserver les
-- cinq questions validées). La colonne reste en place pour les lignes déjà
-- enregistrées et pour un éventuel usage futur.
alter table public.rsu_requests alter column echeance drop not null;

-- ── Contrôle post-migration (lecture seule) ───────────────
-- select column_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'rsu_requests' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.rsu_requests'::regclass order by conname;

-- ── Retour arrière (à exécuter manuellement si besoin) ────
-- alter table public.rsu_requests alter column echeance set not null;  -- échoue si des lignes ont echeance null
-- alter table public.rsu_requests drop column if exists dimension_internationale;
-- alter table public.rsu_requests drop column if exists stade;
-- alter table public.rsu_requests drop column if exists montant_estime;
-- alter table public.rsu_requests drop column if exists prenom;
-- (puis restaurer les deux CHECK d'origine depuis migration-rsu-requests.sql)
