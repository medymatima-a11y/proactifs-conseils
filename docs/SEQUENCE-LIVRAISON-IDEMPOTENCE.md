# Séquence de livraison — idempotence des formulaires (PR 28)

État au 22/11/2026 : rien n'est fusionné, rien n'est déployé, aucune migration
Production, `SUBSCRIBE_IDEMPOTENCY` absente des trois environnements. Ce
document est la marche à suivre quand la décision de livrer sera prise.

L'ordre compte : inverser les étapes 2 et 3 casse les onze formulaires
(PostgREST répond `PGRST204` sur une colonne qu'il ne connaît pas).

---

## Étape 0 — relever l'état réel de la base (lecture seule)

Exécuter [`DIAGNOSTIC-LEADS-PRODUCTION.sql`](DIAGNOSTIC-LEADS-PRODUCTION.sql)
dans le SQL Editor du projet de **production** (`ullnkylrixdvormohryl`). Trois
lectures décident de la suite :

| Section | Ce qu'on en tire |
|---|---|
| 1 — colonnes | Une colonne `NOT NULL` sans défaut, absente du `record` de `api/subscribe.js`, ferait échouer toute insertion. |
| 4 — volume | Sous ~100 000 lignes, le `create unique index` de la migration passe en quelques secondes. Au-delà : `CONCURRENTLY`, donc **hors** du `begin/commit`. |
| 6 — `notify_new_lead()` | Asynchrone (`net.http_post`) ⇒ un échec de notification laisse la demande enregistrée et perd la notification. Synchrone, ou capable de lever une exception ⇒ l'échec **annule** l'insertion. Les deux comportements sont mesurés ; celui qui s'applique dépend de cette fonction. |
| 10 — idempotence | Doit répondre « absentes / absent / 0 sur 2 » avant migration. |

Ne pas passer à l'étape 1 avant d'avoir lu ces quatre lignes.

---

## Étape 1 — fusionner et déployer le code, idempotence **désactivée**

1. Fusionner la PR 28 dans `main`. Vercel construit un déploiement de
   production : on l'appellera **D1**.
2. **Ne pas créer `SUBSCRIBE_IDEMPOTENCY`.** Vérifier qu'elle est absente :
   `vercel --scope medymatima-a11ys-projects env ls --project proactifs-conseils`
   (noms seulement, aucune valeur).
3. **Noter l'identifiant de D1** (`dpl_…`, visible dans l'onglet Deployments)
   et son SHA. C'est la cible de retour arrière de l'étape 5 ; sans cette note,
   il faudra la retrouver dans l'historique.

Ce que fait le code à ce stade : le drapeau éteint, `idempotenceState()` rend
`active: false`, la clé reçue du navigateur est ignorée et l'insertion part par
le chemin sans clé (`Prefer: return=minimal`, aucune des deux nouvelles
colonnes dans le corps). **Le code fusionné fonctionne donc sur une base qui
n'a pas encore reçu la migration** — c'est ce qui rend cet ordre possible.

Contrôles après D1 :

- un envoi réel sur un des onze formulaires répond 200 et crée une ligne ;
- les journaux Vercel portent, à chaque envoi,
  `subscribe: cle d'idempotence recue mais dispositif inactif` : c'est la
  preuve que le nouveau code est en place **et** que le drapeau est éteint ;
- les gardes de réentrance côté navigateur sont actives : un double clic sur
  le bouton d'envoi ne produit qu'une requête.

---

## Étape 2 — sauvegarde, puis migration

1. **Sauvegarde.** Relever dans le tableau de bord Supabase le dernier point de
   restauration disponible (Database → Backups) et le noter. En cas de doute
   sur sa fraîcheur, prendre un export explicite de la seule table concernée
   avant de continuer.
2. Appliquer [`migration-leads-idempotence.sql`](../migration-leads-idempotence.sql)
   dans le SQL Editor de production. Si l'étape 0 a montré un gros volume,
   sortir le `create unique index` du `begin/commit` et le passer en
   `create unique index concurrently`.
3. La migration termine par `notify pgrst, 'reload schema'` : sans ce
   rechargement, PostgREST continue d'ignorer les deux colonnes.
4. Relancer le script de diagnostic : la section 10 doit répondre
   « PRESENTES / PRESENT / 2 sur 2 ».

Le comportement des formulaires ne change pas à cette étape : le drapeau est
toujours éteint, donc aucune clé n'est envoyée.

---

## Étape 3 — activer la variable, **puis** redéployer

1. Créer `SUBSCRIBE_IDEMPOTENCY` = `on`, **sur l'environnement Production
   seulement**.
2. **Redéployer.** Sur Vercel, un changement de variable n'atteint pas le
   déploiement en cours : *« Changes to environment variables are not applied
   to previous deployments […] You must redeploy your project »*. Sans
   redéploiement, l'étape 3 ne produit aucun effet. Le déploiement obtenu sera
   **D2**.

---

## Étape 4 — contrôles après activation

| Contrôle | Attendu | Si l'attendu n'est pas là |
|---|---|---|
| Un envoi réel | 200, une ligne créée, `idempotency_key` et `payload_fingerprint` renseignés | 500 à l'insertion ou `PGRST204` ⇒ étape 5 |
| Journaux Vercel | plus aucun `dispositif inactif` | la variable n'a pas atteint le déploiement : redéployer |
| Volume quotidien de leads | stable par rapport aux jours précédents | un effondrement signale des envois refusés ⇒ étape 5 |
| `subscribe: cle d'idempotence reutilisee avec un contenu different` (409) | rare, voire absent | fréquent ⇒ l'empreinte est instable ⇒ étape 5 |
| `subscribe: rejeu reconnu, aucune ligne creee` | apparaît quand un visiteur renvoie | — |

Requête de contrôle sans aucune donnée personnelle :

```sql
select count(*) as lignes_24h,
       count(idempotency_key) as avec_cle
from public.leads
where created_at > now() - interval '24 hours';
```

Le rejeu lui-même ne se vérifie pas à la main en production : rejouer la même
requête suppose le même jeton Turnstile, déjà consommé, que le captcha refuse
par un 403 **avant** l'idempotence. Il s'observe donc dans les journaux, pas
par un essai. Il est en revanche mesuré sur TEST : 27 scénarios et 6 × 8
appels simultanés, 0 doublon.

Notification manquée : [`REPRISE-NOTIFICATIONS-LEADS.md`](REPRISE-NOTIFICATIONS-LEADS.md)
— reprise manuelle, sans jamais réinsérer le lead.

---

## Étape 5 — retour arrière

**La cible est D1, le déploiement de l'étape 1.** Il porte les correctifs
navigateur et le code d'idempotence, mais il a été créé **avant** l'existence
de la variable : par la règle citée à l'étape 3, la création ultérieure de
`SUBSCRIBE_IDEMPOTENCY` ne l'a jamais atteint. Y revenir laisse donc
l'idempotence éteinte sans rien perdre d'autre.

- **Immédiat** — Vercel → Deployments → D1 → *Instant Rollback*.
- **Certain** — supprimer `SUBSCRIBE_IDEMPOTENCY`, puis redéployer. Plus lent,
  mais ne dépend d'aucune hypothèse sur ce que D1 a mémorisé.

⚠️ **Ne pas revenir à `dpl_GXeHz3EDL4LKac4KQPBUKGFGb4Yp`** (SHA `be3bd50`,
production actuelle au 22/11/2026). Ce déploiement est antérieur à la PR : y
revenir retirerait aussi les gardes de réentrance des onze formulaires et la
garde d'environnement de la mesure. Tant que l'étape 1 n'a pas eu lieu, il
n'existe aucun déploiement qui porte les correctifs navigateur — c'est
exactement ce que l'étape 1 crée.

**La migration peut rester en place.** Le drapeau éteint, le code n'envoie
jamais les deux colonnes, et l'index unique est total avec `NULLS DISTINCT` :
les lignes sans clé ne se gênent pas entre elles. Ne défaire la migration que
si c'est elle qui pose problème — le bloc de retour arrière est en fin de
`migration-leads-idempotence.sql`.
