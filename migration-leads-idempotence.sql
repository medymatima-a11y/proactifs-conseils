-- ══════════════════════════════════════════════════════════
-- MIGRATION — clé d'idempotence sur public.leads
--
-- TEST (wzuvyztsohdvarxsixce)       : NON APPLICABLE EN L'ÉTAT.
--   public.leads n'existe pas sur ce projet (vérifié le 22/11/2026 : la liste
--   des tables du schéma public ne la contient pas). Les répétitions ont donc
--   porté sur une table d'essai jetable reproduisant la structure utile, pas
--   sur `leads`. Voir « Répétition sur TEST » plus bas.
-- PRODUCTION (ullnkylrixdvormohryl) : NON APPLIQUÉE. Relève du GO ROUGE.
--
-- Problème traité. Rien n'empêchait deux POST identiques de créer deux lignes
-- dans `leads`. /api/subscribe et /api/subscribe-guide faisaient un simple
-- INSERT, sans clé d'idempotence, sans ON CONFLICT, sans contrainte d'unicité.
-- La garde de réentrance des pages ne protège que le navigateur qui l'exécute :
-- elle ne peut rien contre une réponse perdue en route, un onglet dupliqué, un
-- rejeu réseau. Et chaque ligne insérée déclenche `on_new_lead_notify`, donc
-- une notification interne ET un email de confirmation au visiteur : un doublon
-- n'est pas seulement une ligne de trop, c'est un second email reçu.
--
-- Ce que cette migration fait, et ne fait pas.
--   - Elle ajoute une clé fournie par le navigateur et une empreinte du
--     contenu, puis rend la clé unique. C'est tout.
--   - Elle ne déduplique JAMAIS sur l'email : une même personne peut adresser
--     autant de demandes légitimes qu'elle veut, chacune avec sa propre clé.
--   - Elle n'écrase aucune ligne : le code applicatif utilise
--     `resolution=ignore-duplicates` (INSERT … ON CONFLICT DO NOTHING), jamais
--     `merge-duplicates`. Aucun UPDATE n'est possible par ce chemin.
--
-- Atomicité. Tenue par l'index unique, pas par une lecture applicative
-- préalable. Une seule instruction est émise par requête. Deux requêtes
-- simultanées portant la même clé sont sérialisées par l'index : une insère,
-- l'autre n'insère rien et le serveur le reconnaît au tableau vide que
-- PostgREST lui renvoie. Un « SELECT puis INSERT » côté application aurait
-- laissé la fenêtre de course grande ouverte.
--
-- Effets de bord. `on_new_lead_notify` est un trigger AFTER INSERT FOR EACH
-- ROW. Aucune ligne insérée = aucun déclenchement, donc aucun email rejoué.
-- Vérifié par répétition (voir plus bas).
--
-- Lignes existantes et autres écrivains. L'index est unique mais pas partiel :
-- PostgreSQL considère les NULL comme distincts (NULLS DISTINCT par défaut),
-- donc toute ligne sans clé passe — les lignes déjà en base, les imports
-- manuels, /api/estimation. Aucune de ces écritures n'est contrainte.
-- Un index PARTIEL aurait été plus explicite mais inutilisable : PostgREST
-- n'émet pas le prédicat de l'index dans sa clause ON CONFLICT, et PostgreSQL
-- ne peut alors pas l'inférer (« no unique or exclusion constraint matching
-- the ON CONFLICT specification »). D'où l'index total.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT, IMPÉRATIF
--   1. Déployer le code. La variable SUBSCRIBE_IDEMPOTENCY n'existe pas encore,
--      donc la clé reçue est ignorée et aucune colonne nouvelle n'est écrite :
--      comportement strictement inchangé, même sans cette migration.
--   2. Appliquer ce fichier.
--   3. Créer SUBSCRIBE_IDEMPOTENCY=on. La protection devient active.
--   Inverser 2 et 3 casse les DIX formulaires du site : PostgREST refuserait
--   l'insertion (PGRST204, colonne inconnue) et toute demande échouerait.
--
-- Retour arrière. Retirer SUBSCRIBE_IDEMPOTENCY suffit, sans redéploiement et
-- sans toucher la base : les colonnes restent, inutilisées. Le retrait des
-- colonnes elles-mêmes figure en fin de fichier, et n'est pas nécessaire.
--
-- Idempotent : relançable sans erreur.
-- ══════════════════════════════════════════════════════════

-- ── Colonnes ──────────────────────────────────────────────
-- `idempotency_key` : identifiant de la demande logique, émis par le navigateur
-- (assets/js/idempotence.js). Jamais un secret, jamais une donnée personnelle :
-- un UUID aléatoire, sans lien avec le visiteur.
alter table public.leads add column if not exists idempotency_key text;

-- `payload_fingerprint` : SHA-256 hexadécimal du contenu de la demande,
-- calculé CÔTÉ SERVEUR (api/subscribe.js, empreinteCharge). Il permet de
-- distinguer « même clé, même contenu » — un rejeu, à qui on répond succès sans
-- rien créer — de « même clé, contenu différent » — un conflit, refusé en 409
-- pour ne pas écraser la demande initiale. Il n'est jamais reçu du navigateur :
-- un client fautif ne peut donc pas faire passer un contenu différent pour un
-- rejeu. Ce n'est pas une empreinte à visée de sécurité, mais de comparaison.
alter table public.leads add column if not exists payload_fingerprint text;

-- ── Contraintes de forme ──────────────────────────────────
-- Même alphabet et mêmes bornes que IDEM_KEY_RE dans api/subscribe.js : la base
-- refuse ce que l'application refuse déjà, au cas où un autre écrivain
-- apparaîtrait un jour. Les lignes existantes ont les deux colonnes à NULL,
-- la validation passe donc sans réécriture.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_idempotency_key_forme' and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_idempotency_key_forme
      check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$');
  end if;
end $$;

-- Clé et empreinte vont ensemble : une clé sans empreinte ne permettrait pas de
-- distinguer un rejeu d'un conflit, et une empreinte sans clé ne sert à rien.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_idempotence_paire' and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_idempotence_paire
      check ((idempotency_key is null) = (payload_fingerprint is null));
  end if;
end $$;

-- ── Unicité : le cœur du dispositif ───────────────────────
-- C'est cet index, et lui seul, qui garantit qu'une clé ne donne qu'une ligne,
-- y compris pour deux requêtes concurrentes. Index total : les NULL restent
-- distincts entre eux, donc les écritures sans clé ne sont pas contraintes.
create unique index if not exists leads_idempotency_key_uniq
  on public.leads (idempotency_key);

comment on column public.leads.idempotency_key is
  'Identifiant de la demande logique, emis par le navigateur. Unique. NULL pour les ecritures sans cle (lignes anterieures, imports, /api/estimation).';
comment on column public.leads.payload_fingerprint is
  'SHA-256 du contenu de la demande, calcule cote serveur. Distingue un rejeu (meme empreinte, succes sans nouvelle ligne) d un conflit (empreinte differente, 409).';

-- PostgREST met son cache de schéma à jour tout seul (event trigger Supabase).
-- Si une insertion répondait encore PGRST204 quelques secondes après :
--   notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════
-- RÉPÉTITION SUR TEST
--
-- public.leads n'existant pas sur TEST, la migration n'y est pas applicable
-- telle quelle. Ce qui a été éprouvé le 22/11/2026, c'est la SÉMANTIQUE, sur
-- `public.zz_essai_idem` : mêmes colonnes, même index unique, mêmes
-- contraintes, et un trigger AFTER INSERT FOR EACH ROW écrivant dans un journal
-- — il tient le rôle de `notify_new_lead()`. On ne compte pas des emails, on
-- compte les déclenchements qui les produiraient.
--
--   Essai                                      Lignes   Déclenchements
--   1  même clé, même empreinte, ×2              1            1
--      (l'insertion initiale rend 1 ligne, le rejeu en rend 0)
--   2  même clé, empreinte différente            1            1
--      (rien d'inséré ; la ligne reste 'Lea' / 'empreinte-A', intacte)
--   3  clés différentes, MÊME EMAIL              2            2
--      (les deux demandes légitimes de la même personne sont conservées)
--   4  deux écritures sans clé                   4            4
--      (les NULL restent distincts : imports et lignes anciennes passent)
--   5  deux connexions simultanées, même clé     1            1
--      (deux appels lancés ensemble, 1 s de recouvrement ; une seule a inséré)
--   6  même clé SANS clause ON CONFLICT          —            —
--      (erreur 23505 : c'est bien l'index qui refuse, pas une politesse du code)
--   7  clé malformée, puis clé sans empreinte    5            5
--      (les deux refusées par les contraintes CHECK — le total ne bouge pas)
--
-- Le nombre de déclenchements a suivi le nombre de lignes à chaque étape :
-- jamais un déclenchement sans ligne, donc jamais un email rejoué.
-- La table d'essai et son trigger ont été supprimés après vérification ; rien
-- ne subsiste sur TEST.
--
-- Ce qui n'est PAS éprouvé : le comportement sur le schéma réel de `leads`, et
-- l'interaction avec le vrai `notify_new_lead()` en production. Cela demande un
-- GO ROUGE, ou une copie fidèle de `leads` sur TEST.
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — à n'exécuter que délibérément
--
-- Premier réflexe : retirer la variable SUBSCRIBE_IDEMPOTENCY. Le code cesse
-- aussitôt d'écrire ces colonnes, sans redéploiement, et les demandes repassent
-- par le chemin historique. Les colonnes restantes ne gênent rien.
--
-- Retrait complet, si la décision est prise de ne pas garder le dispositif.
-- Il détruit les clés déjà enregistrées : un rejeu tardif ne serait plus
-- reconnu. À ne pas exécuter tant que le code en production envoie des clés.
--
--   drop index if exists public.leads_idempotency_key_uniq;
--   alter table public.leads drop constraint if exists leads_idempotence_paire;
--   alter table public.leads drop constraint if exists leads_idempotency_key_forme;
--   alter table public.leads drop column if exists payload_fingerprint;
--   alter table public.leads drop column if exists idempotency_key;
--   notify pgrst, 'reload schema';
-- ══════════════════════════════════════════════════════════
