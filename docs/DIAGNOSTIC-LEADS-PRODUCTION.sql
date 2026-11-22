-- ══════════════════════════════════════════════════════════════════════
-- Diagnostic LECTURE SEULE de public.leads en Production
--
-- Pourquoi ce fichier : l'activation de SUBSCRIBE_IDEMPOTENCY suppose de
-- connaitre le schema REEL de la table, ses contraintes, ses index, son volume
-- et surtout le corps reel de public.notify_new_lead() — qu'aucun fichier du
-- depot ne definit. Le projet de production (ullnkylrixdvormohryl) n'est pas
-- joignable depuis les connecteurs de la session ou cette PR a ete preparee :
-- seule l'organisation « Proactif conseils TEST » y apparait, avec le seul
-- projet crm-proactifs-TEST. Ce script remplace cette inspection.
--
-- Ce qu'il fait : une seule requete SELECT. Aucun INSERT, UPDATE, DELETE,
-- ALTER, CREATE ni DROP. Rien n'est modifie, rien n'est verrouille.
--
-- Ce qu'il NE sort PAS :
--   - aucun contenu de ligne (pas un nom, pas une adresse, pas un montant) ;
--     le volume est un count(*), jamais un echantillon ;
--   - les corps de fonctions passent par un masquage : jetons JWT, cles
--     sb_secret_/sb_publishable_, en-tetes Bearer, adresses e-mail, chaines de
--     plus de 40 caracteres. Le masquage est une precaution, pas une garantie :
--     RELIRE la section 6 avant de recopier le resultat ailleurs.
--
-- COMMENT L'EXECUTER
--   1. Ouvrir https://supabase.com/dashboard → projet de PRODUCTION
--      (ullnkylrixdvormohryl, et surtout pas crm-proactifs-TEST) → SQL Editor.
--   2. Coller tout le fichier, lancer (Ctrl+Entree). Une seule grille de
--      resultats sort, en trois colonnes : section, rubrique, detail.
--   3. Exporter en CSV, ou recopier le resultat. Relire la section 6 avant de
--      le transmettre.
--   4. Alternative en ligne de commande, si la chaine de connexion est sous la
--      main — elle contient le mot de passe, ne jamais la coller dans un
--      message :
--        psql "$DATABASE_URL" -f docs/DIAGNOSTIC-LEADS-PRODUCTION.sql
--
-- CE QU'IL FAUT LIRE DANS LE RESULTAT
--   section 1  colonnes : une colonne NOT NULL sans defaut, absente du
--              `record` construit par api/subscribe.js, ferait echouer toute
--              insertion. Comparer avec les champs de ce fichier.
--   section 4  volume : sous ~100 000 lignes, le `create unique index` de
--              migration-leads-idempotence.sql passe en quelques secondes.
--              Au-dela, le passer en CONCURRENTLY — donc hors du begin/commit
--              de la migration, qui ne l'admet pas dans une transaction.
--   section 6  corps de notify_new_lead() : c'est lui qui decide lequel des
--              deux comportements mesures s'applique. S'il poste en asynchrone
--              (net.http_post de pg_net), un echec de notification laisse la
--              demande enregistree et la notification est perdue, sans reprise
--              automatique. S'il appelle en synchrone (extension http) ou s'il
--              peut lever une exception, l'echec ANNULE l'insertion : la
--              demande n'est pas enregistree et la cle n'est pas consommee.
--              Suite a donner : docs/REPRISE-NOTIFICATIONS-LEADS.md.
--   section 6  autres fonctions citant « leads » : ce sont les autres chemins
--              d'ecriture possibles. Une ecriture qui ne passe pas par
--              api/subscribe.js n'aura pas de cle d'idempotence — ce n'est pas
--              un probleme (index total, NULLS DISTINCT laisse les lignes sans
--              cle libres), mais il faut la connaitre avant d'activer.
--   section 9  extensions : aucune ligne = ni pg_net ni http installes, donc
--              notify_new_lead() ne sort pas de la base par ces chemins (c'est
--              le cas sur TEST, ou ce script a ete verifie le 22/11/2026).
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
  ),

  triggers_leads as (
    select 5 as section,
           row_number() over (order by t.tgname)::int as ord,
           'trigger' as rubrique,
           t.tgname || ' | ' || pg_get_triggerdef(t.oid) as detail
    from pg_trigger t
    where t.tgrelid = (select rel from cible) and not t.tgisinternal
  ),

  corps_brut as (
    select p.proname,
           pg_get_functiondef(p.oid) as def
    from pg_proc p
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

  corps_masque as (
    select proname,
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(def,
                     'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
                     '<<JWT MASQUE>>', 'g'),
                   'sb_(secret|publishable)_[A-Za-z0-9_-]+', '<<CLE MASQUEE>>', 'g'),
                 '(?i)(bearer[[:space:]]+)[A-Za-z0-9._-]{12,}', '\1<<MASQUE>>', 'g'),
               '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<<ADRESSE MASQUEE>>', 'g'),
             '[A-Za-z0-9+/_-]{40,}={0,2}', '<<CHAINE LONGUE MASQUEE>>', 'g') as def
    from corps_brut
  ),

  corps as (
    select 6 as section,
           row_number() over (order by m.proname, t.i)::int as ord,
           'corps ' || m.proname as rubrique,
           t.ligne as detail
    from corps_masque m,
         unnest(string_to_array(m.def, E'\n')) with ordinality as t(ligne, i)
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
           || case when e.extname = 'pg_net' then '  (envoi ASYNCHRONE possible)'
                   when e.extname = 'http'   then '  (envoi SYNCHRONE possible)'
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
