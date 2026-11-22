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
-- La section 6 restitue a la place la STRUCTURE et les MECANISMES, calcules
-- sans rien afficher du texte :
--   - identite : langage, SECURITY DEFINER ou INVOKER, volatilite,
--     search_path impose, nombre de lignes ;
--   - sorties HTTP : nombre d'appels http_post / http_get, et combien sont
--     prefixes par net. (pg_net, asynchrone) — c'est ce qui departage les deux
--     comportements mesures ;
--   - mecanismes presents ou absents, en oui / non : pg_notify, levee
--     d'exception, bloc de rattrapage, ecriture, suppression, lecture d'un
--     secret dans Vault, lecture d'un reglage, presence d'une URL litterale,
--     presence d'un en-tete d'autorisation ;
--   - tables ecrites, par leur seul identifiant.
--
-- Une URL ou un en-tete detecte est signale par « OUI », jamais affiche.
-- Aucun contenu de ligne ne sort non plus : le volume est un count(*), jamais
-- un echantillon.
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
--   section 6  notify_new_lead() : la ligne des appels HTTP decide lequel des
--              deux comportements mesures s'applique. Des appels prefixes par
--              net. (pg_net) sortent en asynchrone, apres validation de la
--              transaction : un echec laisse la demande enregistree et perd la
--              notification, sans reprise automatique. Des appels non
--              prefixes, ou une levee d'exception sans rattrapage, agissent
--              dans la transaction : l'echec ANNULE l'insertion, la demande
--              n'est pas enregistree et la cle n'est pas consommee. Suite a
--              donner : docs/REPRISE-NOTIFICATIONS-LEADS.md.
--   section 6  autres fonctions citant « leads » : ce sont les autres chemins
--              d'ecriture possibles. Une ecriture qui ne passe pas par
--              api/subscribe.js n'aura pas de cle d'idempotence — ce n'est pas
--              un probleme (index total, NULLS DISTINCT laisse les lignes sans
--              cle libres), mais il faut la connaitre avant d'activer.
--   section 9  extensions : aucune ligne = ni pg_net ni http installes, donc
--              aucune sortie HTTP possible depuis la base (c'est le cas sur
--              TEST, ou ce script a ete verifie le 22/11/2026).
--   section 10 etat de l'idempotence : dit si la migration est deja appliquee.
--              Les trois lignes doivent repondre « absent » avant migration.
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

  triggers_leads as (
    select 5 as section,
           row_number() over (order by t.tgname)::int as ord,
           'trigger' as rubrique,
           t.tgname || ' | ' || pg_get_triggerdef(t.oid) as detail
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

  -- STRUCTURE ET MECANISMES, sans afficher une seule ligne de code.
  structure as (
    select 6 as section, f.proname, 1 as sous_ord,
           'langage ' || f.lanname
           || ' | ' || case when f.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
           || ' | ' || case f.provolatile when 'i' then 'IMMUTABLE'
                                          when 's' then 'STABLE'
                                          else 'VOLATILE' end
           || ' | config ' || coalesce(array_to_string(f.proconfig, ' '), '(aucune)')
           || ' | ' || (length(f.src) - length(replace(f.src, E'\n', '')) + 1)::text
           || ' lignes' as detail
    from fonctions f

    union all

    -- La ligne qui departage asynchrone et synchrone.
    select 6, f.proname, 2,
           'appels http_post / http_get : '
           || regexp_count(f.src, 'http_(post|get)', 1, 'i')::text || ' au total, dont '
           || regexp_count(f.src, 'net\.http_', 1, 'i')::text
           || ' prefixes par net. (pg_net, ASYNCHRONE apres validation) ; '
           || greatest(regexp_count(f.src, 'http_(post|get)', 1, 'i')
                       - regexp_count(f.src, 'net\.http_', 1, 'i'), 0)::text
           || ' non prefixes (candidats SYNCHRONES, dans la transaction)'
    from fonctions f

    union all

    select 6, f.proname, 2 + m.rang,
           case when f.src ~* m.motif then 'OUI  ' else 'non  ' end || m.libelle
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
      (12, 'supabase_functions|edge',            'appelle une fonction Edge')
    ) as m(rang, motif, libelle)

    union all

    -- Tables ecrites : identifiants seulement, motif restreint aux caracteres
    -- d'identifiant, donc aucun fragment de valeur ne peut sortir par la.
    select 6, f.proname,
           40 + row_number() over (partition by f.proname order by t.ecrite)::int,
           'ecrit dans ' || t.ecrite
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

  etat_idempotence as (
    select 10 as section, 1 as ord, 'idempotence' as rubrique,
           'colonnes idempotency_key + payload_fingerprint : '
           || case when (select count(*) from information_schema.columns
                         where table_schema = 'public' and table_name = 'leads'
                           and column_name in ('idempotency_key', 'payload_fingerprint')) = 2
                   then 'PRESENTES (migration deja appliquee)' else 'absentes' end as detail
    union all
    select 10, 2, 'idempotence',
           'index unique leads_idempotency_key_uniq : '
           || case when exists (select 1 from pg_indexes
                                where schemaname = 'public'
                                  and indexname = 'leads_idempotency_key_uniq')
                   then 'PRESENT' else 'absent' end
    union all
    select 10, 3, 'idempotence',
           'contraintes CHECK d''idempotence : '
           || (select count(*)::text from pg_constraint
               where conrelid = (select rel from cible) and contype = 'c'
                 and conname in ('leads_idempotency_key_forme', 'leads_idempotence_paire'))
           || ' / 2'
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
