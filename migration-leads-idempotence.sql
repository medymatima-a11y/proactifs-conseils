-- ══════════════════════════════════════════════════════════
-- MIGRATION — clé d'idempotence sur public.leads
--
-- TEST (wzuvyztsohdvarxsixce)       : APPLIQUÉE le 22/11/2026 sur une
--   REPRODUCTION de public.leads créée pour l'occasion — la table n'existait pas
--   sur ce projet. Forme, contraintes, politiques RLS et trigger reconstitués ;
--   aucune donnée réelle n'a été copiée. Voir « Reproduction sur TEST » plus bas.
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
-- ══════════════════════════════════════════════════════════
-- ⚠️ PRÉALABLES À L'ACTIVATION EN PRODUCTION
--
-- Aucun des trois n'est fait au 22/11/2026. Tant qu'ils ne le sont pas, ce
-- fichier ne doit pas être appliqué en production et SUBSCRIBE_IDEMPOTENCY ne
-- doit pas être créée. Les essais ont porté sur une REPRODUCTION de `leads`
-- (voir plus bas) : ils établissent la sémantique, pas la conformité du
-- schéma réel.
--
--   A. INSPECTER LA BASE DE PRODUCTION
--      - schéma réel de public.leads : toutes ses colonnes, leurs types, leurs
--        contraintes NOT NULL et DEFAULT. La reproduction n'a que les colonnes
--        qu'écrit le site et que lit le CRM ; une colonne NOT NULL sans défaut
--        ferait échouer toute insertion ;
--      - index existants : vérifier qu'aucun index ne porte déjà sur
--        idempotency_key, et mesurer le coût de création de l'index unique sur
--        le volume réel (create unique index CONCURRENTLY si la table est
--        grosse et l'écriture continue) ;
--      - corps réel de public.notify_new_lead() : aucun fichier du dépôt ne le
--        définit. Lire la fonction en base. S'il utilise pg_net, un échec
--        d'envoi ne peut pas annuler l'insertion ; s'il appelle en SYNCHRONE
--        (extension http), un échec ANNULE la demande. Les deux comportements
--        ont été mesurés, et ils ne se valent pas ;
--      - autres triggers et autres écrivains de `leads` (imports, Make.com,
--        /api/estimation) : vérifier qu'aucun n'écrirait idempotency_key.
--
--   B. ÉPROUVER LE PARCOURS AVEC LE RÔLE DE SERVICE
--      Les essais ont utilisé la clé anon, avec des politiques RLS ajoutées
--      pour l'occasion. La production écrit avec SUPABASE_SERVICE_KEY, qui
--      contourne RLS : le comportement de `resolution=ignore-duplicates` et de
--      `return=representation` doit être reconfirmé avec ce rôle, sur une
--      reproduction fidèle du schéma relevé en A.
--      tests/manuel/README.md explique comment (ESSAI_ROLE_SERVICE=oui).
--
--   C. SÉQUENCE D'ACTIVATION, dans cet ordre et pas un autre
--      migration → création de la variable → redéploiement.
--      Détail ci-dessous.
-- ══════════════════════════════════════════════════════════
--
-- ⚠️ ORDRE DE DÉPLOIEMENT, IMPÉRATIF
--   1. Déployer le code. La variable SUBSCRIBE_IDEMPOTENCY n'existe pas encore,
--      donc la clé reçue est ignorée et aucune colonne nouvelle n'est écrite :
--      comportement strictement inchangé, même sans cette migration.
--   2. Appliquer ce fichier.
--   3. Créer SUBSCRIBE_IDEMPOTENCY=on, PUIS redéployer. La protection devient
--      active. (Vérifié absente des trois environnements du projet Vercel
--      `proactifs-conseils` le 22/11/2026.)
--   Inverser 2 et 3 casse les DIX formulaires du site : PostgREST refuserait
--   l'insertion (PGRST204, colonne inconnue) et toute demande échouerait.
--
-- Retour arrière. Il porte sur la variable, pas sur la base : les colonnes
-- peuvent rester, inutilisées. Mais sur Vercel un changement de variable
-- n'atteint PAS le déploiement en cours (voir « Vercel » ci-dessous) : il faut
-- donc soit un Instant Rollback vers le déploiement précédent — construit sans
-- la variable, donc sans le dispositif, et c'est le chemin immédiat —, soit
-- retirer SUBSCRIBE_IDEMPOTENCY puis redéployer. Le retrait des colonnes
-- elles-mêmes figure en fin de fichier, et n'est pas nécessaire.
--
-- ── Vercel : prise en compte des variables ────────────────
-- « Changes to environment variables are not applied to previous deployments,
-- they only apply to new deployments. You must redeploy your project to update
-- the value of any variables you change in the deployment. »
--   vercel.com/docs/environment-variables/managing-environment-variables
--   (page datée du 11/09/2026, relue le 22/11/2026)
-- Et au dépannage : « A change in the dashboard has no effect → […] The running
-- deployment keeps the values it was built with. → Redeploy the project. »
--   vercel.com/docs/environment-variables (17/09/2026, relue le 22/11/2026)
-- Donc : créer comme retirer SUBSCRIBE_IDEMPOTENCY demande un redéploiement.
-- Aucune étape de ce fichier ne suppose une prise en compte immédiate.
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
-- REPRODUCTION SUR TEST, ET CE QU'ELLE A MONTRÉ (22/11/2026)
--
-- `public.leads` n'existait pas sur TEST. Une reproduction y a donc été créée,
-- sans copier aucune donnée de production. Elle est versionnée :
-- tests/manuel/reproduction-leads-TEST.sql, et tests/manuel/README.md dit
-- comment rejouer les bancs d'essai. En résumé :
--   - colonnes : id uuid (gen_random_uuid), created_at, prenom, nom, email,
--     telephone, source, situation, preoccupation, reponses jsonb, statut,
--     client_id, date_conversion. Établies par recoupement de ce que le site
--     écrit (api/subscribe.js, subscribe-guide.js, estimation.js) et de ce que
--     le CRM lit et met à jour (crm-interface.html) ;
--   - RLS activée, politiques `leads_insert_public` (INSERT TO public) et
--     `crm_leads_all` (authenticated, hors sessions anonymes), relevées en
--     production le 05/10/2026 dans
--     crm-proactifs/_branche-securite/securite-v2/tests/00-replique-locale.sql ;
--   - trigger `on_new_lead_notify` AFTER INSERT FOR EACH ROW →
--     `public.notify_new_lead()`, réécrite SANS appel réseau : elle journalise
--     les trois canaux (notification interne, email de confirmation, liste
--     Brevo 23) avec la même garde de consentement que la version corrigée en
--     production le 11/11/2026 ;
--   - puis ce fichier, appliqué tel quel.
-- Les essais passent par le VRAI chemin : les handlers /api/subscribe et
-- /api/subscribe-guide, PostgREST, l'index. Systeme.io et Brevo sont
-- interceptés et n'ont jamais été appelés. Les adresses sont en .invalid.
--
-- 27 scénarios, 0 échec. Les plus parlants :
--   - insertion réussie puis réponse perdue, réessai même clé → 200
--     { rejeu: true }, 1 ligne, 3 entrées de journal sur UN SEUL lead_id ;
--   - 6 tours de 8 appels simultanés portant la même clé → chaque fois 1 ligne
--     et 3 entrées ; réponses 1×200 + 7×200/rejeu ; 0 doublon, 0 erreur 5xx ;
--   - même clé, contenu différent → 409, la ligne initiale intacte (prénom
--     inchangé), aucun UPDATE ;
--   - clé malformée → 400 et rien en base ; origine refusée → 403 et rien en
--     base ; champ piège → 400 et rien en base ;
--   - sans clé, ou variable absente → 2 lignes, clés NULL : chemin historique ;
--   - Turnstile (clés d'essai publiées par Cloudflare) : même clé + jeton frais
--     → 200 { rejeu: true } ; même clé + jeton déjà consommé → 403 au captcha,
--     AVANT l'idempotence.
--
-- ⚠️ DOUBLON ≠ LIVRAISON. Deux mesures le montrent :
--   - canal de notification en échec après l'insertion : la demande reste
--     enregistrée, la notification est perdue, et le rejeu ne la retente pas.
--     Idem pour Systeme.io et Brevo : échec au premier appel, aucune reprise au
--     rejeu (0 appel externe mesuré). Une notification manquée demande donc
--     toujours une reprise manuelle ;
--   - trigger rendu SYNCHRONE et mis en échec : l'insertion est annulée,
--     réponse 500, 0 ligne, clé non consommée — un réessai enregistre
--     normalement. Le dispositif ne perd pas la demande, mais ne la sauve pas.
-- pg_net n'émet la requête qu'après le commit (« HTTP requests are not started
-- until the transaction is committed », supabase.com/docs/guides/database/
-- extensions/pg_net, relu le 22/11/2026), donc un échec d'envoi ne peut pas
-- annuler la ligne ; il ne se lit que dans net._http_response, conservé 6 h.
--
-- Ce qui n'est PAS éprouvé :
--   - le corps réel de `public.notify_new_lead()`. Aucun fichier du dépôt ne le
--     définit et il n'est pas lisible depuis cette session : laquelle des deux
--     formes (asynchrone pg_net ou synchrone) est en production reste à voir ;
--   - les colonnes que `leads` porterait en production en plus de celles
--     ci-dessus. Elles ne gênent pas l'index, mais la reproduction ne les a pas ;
--   - le volume réel et les index existants.
-- Écart assumé de la reproduction : les essais écrivent avec la clé anon, alors
-- que la production écrit avec SUPABASE_SERVICE_KEY, qui contourne RLS. Deux
-- politiques propres à l'essai (SELECT et DELETE pour anon) ont donc été
-- ajoutées le temps des mesures, puis retirées. Cela ne touche ni ON CONFLICT
-- ni le trigger : seule l'autorisation change.
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — à n'exécuter que délibérément
--
-- Premier réflexe : neutraliser la variable SUBSCRIBE_IDEMPOTENCY — Instant
-- Rollback vers le déploiement précédent pour un effet immédiat, ou retrait de
-- la variable PUIS redéploiement. Le code cesse alors d'écrire ces colonnes et
-- les demandes repassent par le chemin historique. Les colonnes restantes ne
-- gênent rien. Un changement de variable seul ne suffit pas : le déploiement en
-- cours garde les valeurs avec lesquelles il a été construit.
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
