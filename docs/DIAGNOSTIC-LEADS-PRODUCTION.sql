-- ══════════════════════════════════════════════════════════════════════
-- Diagnostic LECTURE SEULE de public.leads en Production
--
-- Pourquoi ce fichier : l'activation de SUBSCRIBE_IDEMPOTENCY suppose de
-- connaitre le schema REEL de la table, ses contraintes, ses index, son volume
-- et le fonctionnement reel de public.notify_new_lead() — qu'aucun fichier du
-- depot ne definit. Le projet de production (ullnkylrixdvormohryl) n'est pas
-- joignable depuis les connecteurs de la session ou cette PR a ete preparee :
-- seule l'organisation « Proactif conseils TEST » y apparait, avec le seul
-- projet crm-proactifs-TEST. Ce script remplace cette inspection.
--
-- Ce qu'il fait : une seule requete SELECT. Aucun INSERT, UPDATE, DELETE,
-- ALTER, CREATE ni DROP. Rien n'est modifie, rien n'est verrouille.
--
-- ─────────────────────────────────────────────────────────────────────
-- CE SCRIPT NE SORT AUCUN TEXTE DE CORPS DE FONCTION
--
-- Masquer un corps de fonction par expressions regulieres ne garantit pas
-- l'absence de secret : il suffit d'une forme non prevue pour qu'une cle
-- passe. Il n'y a donc ici ni pg_get_functiondef, ni prosrc, ni extrait.
--
-- La section 6 restitue a la place la STRUCTURE et des INDICES de mecanismes,
-- calcules sans rien afficher du texte :
--   - identite : langage, SECURITY DEFINER ou INVOKER, volatilite,
--     search_path impose, nombre de lignes ;
--   - sorties HTTP : nombre d'appels http_post / http_get, et combien sont
--     prefixes par net. (pg_net) ;
--   - mecanismes en oui / non : pg_notify, levee d'exception, bloc de
--     rattrapage, ecriture, suppression, lecture d'un secret dans Vault,
--     lecture d'un reglage, presence d'une URL litterale, presence d'un
--     en-tete d'autorisation ;
--   - tables ecrites, par leur seul identifiant.
--
-- Une URL ou un en-tete detecte est signale par « OUI », jamais affiche.
-- Aucun contenu de ligne ne sort non plus : le volume est un count(*), jamais
-- un echantillon. La section 5 ne sort que les metadonnees des triggers, sans
-- leurs arguments ni leur condition WHEN.
--
-- ⚠ CE QUE CES INDICES NE PROUVENT PAS
-- Les detections de la section 6 sont faites par expressions regulieres sur le
-- texte de la fonction. Elles orientent, elles ne concluent pas :
--   - un appel laisse en COMMENTAIRE est compte comme present ;
--   - un appel passe par une FONCTION INTERMEDIAIRE (un wrapper maison qui
--     appelle lui-meme net.http_post) n'apparait pas ici ;
--   - du SQL DYNAMIQUE (EXECUTE sur une chaine construite) echappe a toute
--     detection textuelle ;
--   - un meme libelle peut apparaitre dans une chaine de caracteres sans etre
--     un appel.
-- Autrement dit : « 0 appel HTTP » ne demontre pas qu'il n'y a pas de sortie
-- HTTP, et « OUI » ne demontre pas qu'elle est atteinte a l'execution. Pour
-- trancher entre comportement synchrone et asynchrone, lire la fonction dans
-- l'editeur SQL — ces indices disent seulement ou regarder.
-- ─────────────────────────────────────────────────────────────────────
--
-- COMMENT L'EXECUTER
--   1. Ouvrir https://supabase.com/dashboard → projet de PRODUCTION
--      (ullnkylrixdvormohryl, et surtout pas crm-proactifs-TEST) → SQL Editor.
--   2. Coller tout le fichier, lancer (Ctrl+Entree). Une seule grille de
--      resultats sort, en trois colonnes : section, rubrique, detail.
--   3. Exporter en CSV, ou recopier le resultat.
--   4. Alternative en ligne de commande, si la chaine de connexion est sous la
--      main — elle contient le mot de passe, ne jamais la coller dans un
--      message :
--        psql "$DATABASE_URL" -f docs/DIAGNOSTIC-LEADS-PRODUCTION.sql
--
-- CE QU'IL FAUT LIRE DANS LE RESULTAT
--   section 1  colonnes : une colonne NOT NULL sans defaut, absente du
--              `record` construit par api/subscribe.js, ferait echouer toute
--              insertion. Comparer avec les champs de ce fichier.
--   section 4  volume et activite : de quoi decider de la forme du
--              `create unique index`. Un `create index` ordinaire prend un
--              verrou qui bloque les ecritures le temps de sa construction ;
--              `concurrently` ne les bloque pas, mais il est plus long, fait
--              deux passes, ne peut pas tourner dans une transaction, et peut
--              laisser un index INVALID a supprimer puis refaire. Le choix
--              depend de la taille de la table, de son activite en ecriture et
--              de l'interruption acceptable — aucune regle automatique ici.
--   section 5  triggers : moment, evenements, portee, etat et fonction
--              appelee. Un trigger DESACTIVE ne notifie rien.
--   section 6  notify_new_lead() : la ligne des appels HTTP oriente vers l'un
--              des deux comportements mesures. Des appels prefixes par net.
--              (pg_net) sortent en asynchrone, apres validation de la
--              transaction : un echec laisse la demande enregistree et perd la
--              notification, sans reprise automatique. Des appels non
--              prefixes, ou une levee d'exception sans rattrapage, agissent
--              dans la transaction : l'echec ANNULE l'insertion, la demande
--              n'est pas enregistree et la cle n'est pas consommee. Ces
--              indices ne tranchent pas a eux seuls : voir l'avertissement
--              ci-dessus, puis lire la fonction. Suite a donner :
--              docs/REPRISE-NOTIFICATIONS-LEADS.md.
--   section 6  autres fonctions citant « leads » : ce sont les autres chemins
--              d'ecriture possibles. Une ecriture qui ne passe pas par
--              api/subscribe.js n'aura pas de cle d'idempotence — ce n'est pas
--              un probleme (index total, NULLS DISTINCT laisse les lignes sans
--              cle libres), mais il faut la connaitre avant d'activer.
--   section 9  extensions : aucune ligne = ni pg_net ni http installes. C'est
--              un indice plus solide que la section 6, puisqu'une sortie HTTP
--              exige l'extension (c'est le cas sur TEST, ou ce script a ete
--              verifie le 22/11/2026).
--   section 10 etat de l'idempotence, objet par objet : deux colonnes, un
--              index, deux contraintes CHECK. Chacun est rendu ABSENT,
--              PRESENT CONFORME ou PRESENT A VERIFIER. Ces cinq objets sont
--              independants : des colonnes presentes ne prouvent pas que
--              l'index et les CHECK le sont, ni que la migration est allee au
--              bout. La migration n'est appliquee que si les cinq repondent
--              PRESENT CONFORME.
-- ══════════════════════════════════════════════════════════════════════

with
  cible as (
    select to_regclass('public.leads') as rel
  ),

  entete as (
    select 0 as section, 1 as ord, 'contexte' as rubrique,
           'base = ' || current_database()
           || ' | utilisateur = ' || current_user
           || ' | horodatage = ' || now()::text as detail
    union all
    select 0, 2, 'contexte', 'postgres = ' || current_setting('server_version')
    union all
    select 0, 3, 'contexte',
           case when (select rel from cible) is null
                then 'ATTENTION : public.leads est INTROUVABLE dans cette base'
                else 'public.leads trouvee' end
  ),

  colonnes as (
    select 1 as section, c.ordinal_position::int as ord, 'colonne' as rubrique,
           c.column_name
           || ' | ' || c.data_type
           || ' | ' || case when c.is_nullable = 'YES' then 'nullable' else 'NOT NULL' end
           || ' | defaut = ' || coalesce(c.column_default, '(aucun)') as detail
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'leads'
  ),

  contraintes as (
    select 2 as section,
           row_number() over (order by k.contype, k.conname)::int as ord,
           'contrainte' as rubrique,
           k.conname || ' | ' || pg_get_constraintdef(k.oid) as detail
    from pg_constraint k
    where k.conrelid = (select rel from cible)
  ),

  index_leads as (
    select 3 as section,
           row_number() over (order by i.indexname)::int as ord,
           'index' as rubrique,
           i.indexname
           || ' | ' || pg_size_pretty(pg_relation_size(
                (quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))::regclass))
           || ' | ' || i.indexdef as detail
    from pg_indexes i
    where i.schemaname = 'public' and i.tablename = 'leads'
  ),

  volume as (
    select 4 as section, 1 as ord, 'volume' as rubrique,
           (select count(*) from public.leads)::text || ' lignes'
           || ' | table ' || pg_size_pretty(pg_table_size((select rel from cible)))
           || ' | total avec index ' || pg_size_pretty(pg_total_relation_size((select rel from cible)))
           as detail
    union all
    select 4, 2, 'activite',
           'insertions ' || coalesce(s.n_tup_ins::text, '?')
           || ' | mises a jour ' || coalesce(s.n_tup_upd::text, '?')
           || ' | suppressions ' || coalesce(s.n_tup_del::text, '?')
           || ' | lignes vivantes estimees ' || coalesce(s.n_live_tup::text, '?')
           || ' | dernier autovacuum ' || coalesce(s.last_autovacuum::text, '(aucun)')
    from pg_stat_user_tables s
    where s.relid = (select rel from cible)
    union all
    select 4, 3, 'activite',
           'compteurs ci-dessus accumules depuis '
           || coalesce((select d.stats_reset::text from pg_stat_database d
                        where d.datname = current_database()), '(date inconnue)')
  ),

  -- Metadonnees des triggers seulement. Pas de pg_get_triggerdef : sa sortie
  -- porte les arguments du trigger et sa condition WHEN, qui peuvent contenir
  -- des valeurs. Ici, leur presence est signalee, leur contenu jamais.
  triggers_leads as (
    select 5 as section,
           row_number() over (order by t.tgname)::int as ord,
           'trigger' as rubrique,
           t.tgname
           || ' | ' || case when (t.tgtype::int & 64) <> 0 then 'INSTEAD OF'
                            when (t.tgtype::int & 2)  <> 0 then 'BEFORE'
                            else 'AFTER' end
           || ' ' || trim(
                  case when (t.tgtype::int & 4)  <> 0 then 'INSERT ' else '' end
               || case when (t.tgtype::int & 8)  <> 0 then 'DELETE ' else '' end
               || case when (t.tgtype::int & 16) <> 0 then 'UPDATE ' else '' end
               || case when (t.tgtype::int & 32) <> 0 then 'TRUNCATE ' else '' end)
           || ' | ' || case when (t.tgtype::int & 1) <> 0 then 'FOR EACH ROW'
                            else 'FOR EACH STATEMENT' end
           || ' | etat ' || case t.tgenabled
                              when 'O' then 'actif'
                              when 'D' then 'DESACTIVE'
                              when 'R' then 'actif en replica seulement'
                              when 'A' then 'actif toujours'
                              else t.tgenabled::text end
           || ' | fonction ' || t.tgfoid::regproc::text
           || ' | ' || case when t.tgqual is not null
                            then 'avec condition WHEN (non affichee)'
                            else 'sans condition WHEN' end
           || ' | ' || t.tgnargs::text || ' argument(s) (non affiches)' as detail
    from pg_trigger t
    where t.tgrelid = (select rel from cible) and not t.tgisinternal
  ),

  -- Les fonctions a decrire : celles branchees en trigger sur leads, plus
  -- celles qui citent la table (autres chemins d'ecriture).
  fonctions as (
    select p.oid, p.proname, p.prosrc as src, l.lanname,
           p.prosecdef, p.provolatile, p.proconfig
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.oid in (
          select t.tgfoid from pg_trigger t
          where t.tgrelid = (select rel from cible) and not t.tgisinternal
        )
        or p.prosrc ~* '\mleads\M'
      )
  ),

  -- STRUCTURE ET INDICES, sans afficher une seule ligne de code.
  structure as (
    -- Identite. De proconfig, seul search_path est restitue : les autres
    -- reglages peuvent porter des valeurs sans rapport avec ce diagnostic.
    select 6 as section, f.proname, 1 as sous_ord,
           'langage ' || f.lanname
           || ' | ' || case when f.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
           || ' | ' || case f.provolatile when 'i' then 'IMMUTABLE'
                                          when 's' then 'STABLE'
                                          else 'VOLATILE' end
           || ' | ' || coalesce(
                  (select cfg from unnest(f.proconfig) as cfg where cfg like 'search_path=%' limit 1),
                  '(search_path non impose)')
           || ' | ' || (length(f.src) - length(replace(f.src, E'\n', '')) + 1)::text
           || ' lignes' as detail
    from fonctions f

    union all

    -- Avertissement place AVANT les indices, pour qu'il soit lu avec eux.
    select 6, f.proname, 2,
           'ATTENTION : les lignes suivantes sont des INDICES textuels, pas une '
           || 'preuve du comportement — un appel en commentaire compte comme '
           || 'present, un appel passe par une fonction intermediaire n''apparait '
           || 'pas, et du SQL dynamique (EXECUTE) echappe a la detection. '
           || 'Conclure entre synchrone et asynchrone demande de lire la fonction.'
    from fonctions f

    union all

    -- L'indice qui oriente entre asynchrone et synchrone.
    select 6, f.proname, 3,
           'indice, appels http_post / http_get : '
           || regexp_count(f.src, 'http_(post|get)', 1, 'i')::text || ' au total, dont '
           || regexp_count(f.src, 'net\.http_', 1, 'i')::text
           || ' prefixes par net. (pg_net, ASYNCHRONE apres validation) ; '
           || greatest(regexp_count(f.src, 'http_(post|get)', 1, 'i')
                       - regexp_count(f.src, 'net\.http_', 1, 'i'), 0)::text
           || ' non prefixes (candidats SYNCHRONES, dans la transaction) — a confirmer'
    from fonctions f

    union all

    select 6, f.proname, 3 + m.rang,
           'indice ' || case when f.src ~* m.motif then 'OUI  ' else 'non  ' end || m.libelle
    from fonctions f
    cross join (values
      (1,  'pg_notify',                          'notification interne pg_notify'),
      (2,  'raise[[:space:]]+exception',         'peut lever une exception, donc annuler l''insertion'),
      (3,  'exception[[:space:]]+when',          'rattrape ses erreurs (bloc exception)'),
      (4,  'insert[[:space:]]+into',             'ecrit dans une table'),
      (5,  '\mupdate\M|\mdelete\M',              'modifie ou supprime des lignes'),
      (6,  'vault\.|decrypted_secret',           'lit un secret dans Vault'),
      (7,  'current_setting',                    'lit un reglage de session ou de base'),
      (8,  'https?://',                          'contient au moins une URL litterale (NON affichee)'),
      (9,  'authorization|apikey|bearer|api-key','contient un en-tete d''autorisation (NON affiche)'),
      (10, 'dblink|pg_background',               'sort de la transaction par dblink ou pg_background'),
      (11, 'pgmq|\mqueue\M',                     'met en file (pgmq ou table de file)'),
      (12, 'supabase_functions|edge',            'appelle une fonction Edge'),
      (13, '\mexecute\M',                        'contient du SQL dynamique (EXECUTE) : detection non fiable'),
      (14, '\mperform\M[[:space:]]+[a-z_]+\(',   'appelle une autre fonction (la detection peut lui echapper)')
    ) as m(rang, motif, libelle)

    union all

    -- Tables ecrites : identifiants seulement, motif restreint aux caracteres
    -- d'identifiant, donc aucun fragment de valeur ne peut sortir par la.
    select 6, f.proname,
           40 + row_number() over (partition by f.proname order by t.ecrite)::int,
           'indice, ecrit dans ' || t.ecrite
    from fonctions f
    cross join lateral (
      select distinct lower(x[1]) as ecrite
      from regexp_matches(
             f.src,
             'insert[[:space:]]+into[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]{0,30}(\.[a-zA-Z_][a-zA-Z0-9_]{0,30})?)',
             'g') as x
    ) t
  ),

  corps as (
    select 6 as section,
           row_number() over (order by s.proname, s.sous_ord)::int as ord,
           'fonction ' || s.proname as rubrique,
           s.detail
    from structure s
  ),

  droits as (
    select 7 as section,
           row_number() over (order by g.grantee, g.privilege_type)::int as ord,
           'droit' as rubrique,
           g.grantee || ' : ' || g.privilege_type as detail
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'leads'
      and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ),

  rls as (
    select 8 as section, 0 as ord, 'RLS' as rubrique,
           'relrowsecurity = ' || c.relrowsecurity::text
           || ' | relforcerowsecurity = ' || c.relforcerowsecurity::text as detail
    from pg_class c
    where c.oid = (select rel from cible)
    union all
    select 8,
           row_number() over (order by p.policyname)::int,
           'politique RLS',
           p.policyname
           || ' | ' || p.cmd
           || ' | roles = ' || array_to_string(p.roles, ',')
           || ' | USING ' || coalesce(p.qual, '(aucun)')
           || ' | CHECK ' || coalesce(p.with_check, '(aucun)')
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'leads'
  ),

  extensions as (
    select 9 as section,
           row_number() over (order by e.extname)::int as ord,
           'extension' as rubrique,
           e.extname || ' ' || e.extversion
           || case when e.extname = 'pg_net' then '  (sortie HTTP ASYNCHRONE possible)'
                   when e.extname = 'http'   then '  (sortie HTTP SYNCHRONE possible)'
                   else '' end as detail
    from pg_extension e
    where e.extname in ('pg_net', 'http', 'pgmq', 'pg_cron')
  ),

  -- Etat de l'idempotence, objet par objet. Trois reponses possibles par
  -- objet : ABSENT, PRESENT CONFORME, PRESENT A VERIFIER.
  etat_idempotence as (
    select 10 as section, 0 as ord, 'idempotence' as rubrique,
           'cinq objets independants ci-dessous (2 colonnes, 1 index, 2 CHECK). '
           || 'Des colonnes presentes ne prouvent pas que l''index et les CHECK '
           || 'le sont : la migration n''est appliquee que si les cinq repondent '
           || 'PRESENT CONFORME.' as detail

    union all

    -- Les deux colonnes : text, nullable, sans defaut.
    select 10, v.ord, 'idempotence',
           v.nom || ' : ' ||
           case
             when c.column_name is null then 'ABSENT'
             when c.data_type = 'text' and c.is_nullable = 'YES'
                  and c.column_default is null
               then 'PRESENT CONFORME (text, nullable, sans defaut)'
             else 'PRESENT A VERIFIER (' || c.data_type
                  || ', ' || case when c.is_nullable = 'YES' then 'nullable' else 'NOT NULL' end
                  || ', defaut ' || coalesce(c.column_default, 'aucun') || ')'
           end
    from (values (1, 'colonne idempotency_key',     'idempotency_key'),
                 (2, 'colonne payload_fingerprint', 'payload_fingerprint')
         ) as v(ord, nom, col)
    left join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = 'leads'
     and c.column_name = v.col

    union all

    -- L'index : unique, TOTAL (sans predicat), une seule colonne, NULLS
    -- DISTINCT, valide. Un index partiel ne serait pas deduit par PostgREST.
    select 10, 3, 'idempotence',
           'index leads_idempotency_key_uniq : ' ||
           case
             when i.indexrelid is null then 'ABSENT'
             when i.indisunique and i.indpred is null and i.indnkeyatts = 1
                  and not i.indnullsnotdistinct and i.indisvalid
                  and a.attname = 'idempotency_key'
               then 'PRESENT CONFORME (unique, total, sur idempotency_key seule, NULLS DISTINCT, valide)'
             else 'PRESENT A VERIFIER ('
                  || case when i.indisunique then 'unique' else 'NON unique' end
                  || case when i.indpred is null then ', total' else ', PARTIEL' end
                  || ', ' || i.indnkeyatts::text || ' colonne(s) de cle'
                  || ', premiere colonne ' || coalesce(a.attname, '(expression)')
                  || case when i.indnullsnotdistinct then ', NULLS NOT DISTINCT' else ', NULLS DISTINCT' end
                  || case when i.indisvalid then ', valide' else ', INVALID' end || ')'
           end
    from (select 1 as un) z
    left join pg_index i
      on i.indexrelid = to_regclass('public.leads_idempotency_key_uniq')
    left join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = i.indkey[0]

    union all

    -- Un autre index unique sur la seule colonne idempotency_key suffirait a
    -- ON CONFLICT : sa presence change la lecture des lignes ci-dessus.
    select 10, 4, 'idempotence',
           'autres index uniques portant sur la seule colonne idempotency_key : '
           || (select count(*)::text
               from pg_index i2
               join pg_class ic on ic.oid = i2.indexrelid
               where i2.indrelid = (select rel from cible)
                 and i2.indisunique and i2.indnkeyatts = 1
                 and ic.relname <> 'leads_idempotency_key_uniq'
                 and (select a2.attname from pg_attribute a2
                      where a2.attrelid = i2.indrelid and a2.attnum = i2.indkey[0])
                     = 'idempotency_key')

    union all

    -- Les deux CHECK : comparaison a la definition exacte de la migration.
    select 10, v.ord, 'idempotence',
           'contrainte ' || v.nom || ' : ' ||
           case
             when k.conname is null then 'ABSENT'
             when pg_get_constraintdef(k.oid) = v.attendu then 'PRESENT CONFORME'
             else 'PRESENT A VERIFIER — definition differente de celle de la '
                  || 'migration (voir section 2 pour la lire)'
           end
    from (values
      (5, 'leads_idempotency_key_forme',
          'CHECK (((idempotency_key IS NULL) OR (idempotency_key ~ ''^[A-Za-z0-9_-]{16,64}$''::text)))'),
      (6, 'leads_idempotence_paire',
          'CHECK (((idempotency_key IS NULL) = (payload_fingerprint IS NULL)))')
         ) as v(ord, nom, attendu)
    left join pg_constraint k
      on k.conrelid = (select rel from cible)
     and k.contype = 'c' and k.conname = v.nom
  )

select section, rubrique, detail
from (
  select * from entete
  union all select * from colonnes
  union all select * from contraintes
  union all select * from index_leads
  union all select * from volume
  union all select * from triggers_leads
  union all select * from corps
  union all select * from droits
  union all select * from rls
  union all select * from extensions
  union all select * from etat_idempotence
) tout
order by section, ord;
