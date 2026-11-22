# Bancs d'essai manuels — idempotence des formulaires

Ces deux bancs éprouvent ce que `node --test` ne peut pas éprouver : les
handlers `api/subscribe.js` et `api/subscribe-guide.js` tels quels, **PostgREST
pour de vrai**, l'index unique, et le trigger `on_new_lead_notify`.

Ils ne font **pas** partie de la suite automatique. `node --test` ne les
exécute pas : ils vivent dans `tests/manuel/`, pas en `*.test.js`, parce qu'ils
demandent une base, des clés et un décor — et parce qu'ils **écrivent et
suppriment**.

| Fichier | Ce qu'il éprouve |
|---|---|
| `essai-postgrest-idempotence.js` | 27 scénarios : réponse perdue puis réessai, deux appels simultanés, conflit de contenu, échec Systeme.io / Brevo, jeton Turnstile consommé puis frais, absence de clé, clé malformée, origine refusée, champ piège, et le même parcours sur `/api/subscribe-guide`. |
| `essai-contention-livraison.js` | contention réelle sur l'index (plusieurs tours de N appels simultanés), notification perdue après insertion, et trigger synchrone en échec. |
| `garde-essai.js` | les verrous. Lu avant tout le reste. |
| `reproduction-leads-TEST.sql` | le décor : `leads`, ses politiques, le journal, le trigger neutralisé. |

## ⚠️ Protections contre la Production

Ces bancs **vident `leads` entre chaque scénario**. Lancés par erreur sur la
base de production, ils détruiraient des demandes de clients. Sept verrous,
dans `garde-essai.js` :

1. `ESSAI_SB_URL` et `ESSAI_SB_KEY` doivent être fournies — **par
   l'environnement uniquement**. Aucune valeur n'est écrite dans le dépôt.
2. l'URL doit être exactement `https://<ref>.supabase.co`. Pas de chemin, pas
   de proxy, pas de `localhost` : rien qui puisse masquer la vraie cible.
3. **la référence du projet de production est refusée sans condition.** Aucune
   variable ne lève ce refus.
4. toute autre référence que le projet d'essai connu est refusée, sauf
   `ESSAI_REF_ATTENDUE=<ref>` — et le verrou 3 continue de s'appliquer.
5. `ESSAI_CONFIRME=oui-reproduction-jetable` est obligatoire.
6. la clé doit être **publique** (`anon` / `publishable`). Une clé de service
   est refusée, sauf `ESSAI_ROLE_SERVICE=oui`, et le banc l'écrit alors en clair
   dans sa sortie.
7. la base doit porter la table marqueur `zz_essai_notifications`, qui n'existe
   que sur la reproduction ; `leads` doit contenir moins de 200 lignes ; et
   **chaque ligne doit être une donnée réservée à cette recette**, c'est-à-dire
   une adresse `essai-<scenario>@example.invalid`, écrite par ces bancs. Une
   adresse en `.invalid` ne suffit pas à désigner une ligne supprimable : une
   ligne `.invalid` venue d'un autre essai, ou une ligne sans adresse, arrête
   tout aussi sûrement qu'une adresse qui pourrait être réelle. Le refus
   compte les catégories et **ne recopie aucune adresse**.

La purge suit la même règle : le `DELETE` sur `leads` est borné au motif
réservé, dans la suppression comme dans le contrôle qui la suit. Une ligne
apparue entre le contrôle du décor et la purge n'est donc pas emportée.

Ces verrous sont éprouvés par la suite automatique —
[`tests/garde-bancs-manuels.test.js`](../garde-bancs-manuels.test.js), 12 tests
sans base, sans clé et sans réseau. Un code de sécurité non testé ne protège
que sur le papier.

## Démontage automatique, même après un échec

Les bancs posent `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` et
`SUBSCRIBE_IDEMPOTENCY` dans leur propre processus, et en retirent d'autres. Le
`finally` remet l'environnement **exactement** comme il était — valeur
d'origine, ou absence d'origine —, reprend les lignes réservées et remet le
trigger en mode `normal`. Un essai interrompu au scénario N ne laisse donc plus
la reproduction en `leve_exception`. Seuls les **noms** des variables sont
journalisés, jamais les valeurs ; et une erreur de démontage est signalée sans
jamais remplacer l'erreur d'origine.

En plus, le `fetch` des bancs est cloisonné : seules les requêtes vers le
projet d'essai sortent. Systeme.io et Brevo sont interceptés et répondent
localement ; tout autre hôte lève une erreur au lieu d'être appelé. La seule
exception voulue est `challenges.cloudflare.com` dans le scénario E, avec les
clés d'essai **publiées par Cloudflare** — aucune donnée personnelle, aucun
effet de bord.

Toutes les adresses utilisées sont en `.invalid` (RFC 2606) : elles ne peuvent
pas recevoir de courrier.

## Rejouer sur TEST

### 1. Un projet Supabase jetable

Le 22/11/2026, c'était `crm-proactifs-TEST` (`wzuvyztsohdvarxsixce`), où
`public.leads` n'existait pas. Si la table existe déjà sur le projet visé,
**s'arrêter** : ce n'est pas un décor jetable.

### 2. Monter le décor

Dans l'éditeur SQL du projet d'essai :

1. `tests/manuel/reproduction-leads-TEST.sql` ;
2. `migration-leads-idempotence.sql` (racine du dépôt) ;
3. les **politiques propres à l'essai**, listées en commentaire à la fin de
   `reproduction-leads-TEST.sql`. Elles ouvrent `SELECT` et `DELETE` à `anon`
   et accordent l'exécution de `zz_essai_mode` : nécessaire parce que les bancs
   utilisent la clé publique là où la production utilise la clé de service, qui
   contourne RLS.

**Les retirer dès la fin des essais** — le bloc de retrait est juste à côté.
Tant qu'elles sont là, la table est lisible et vidable avec la seule clé
publique.

#### Variante — parcours sous le rôle de service (celui de la production)

C'est la seule forme qui éprouve ce que fait réellement la production :
`SUPABASE_SERVICE_KEY` contourne RLS, là où la clé publique en dépend.

Dans cette variante, **ne pas poser les politiques propres à l'essai** de
l'étape 3 : le rôle de service n'en a pas besoin, et les poser masquerait
justement ce qu'on veut vérifier. Monter donc :

1. `reproduction-leads-TEST.sql` ;
2. la transaction courte de
   [`../../docs/SEQUENCE-LIVRAISON-IDEMPOTENCE.md`](../../docs/SEQUENCE-LIVRAISON-IDEMPOTENCE.md)
   — celle de l'étape 2, avec `lock_timeout` et `statement_timeout` bornés ;
3. rien d'autre.

Puis lancer avec `ESSAI_ROLE_SERVICE=oui` (voir l'étape suivante). La garde
refuse autrement toute clé de service, et le banc écrit le rôle employé dans
son en-tête.

État attendu de `leads` avant de lancer : **vide, ou uniquement des lignes
réservées à cette recette** (`essai-…@example.invalid`), les deux colonnes
d'idempotence à `NULL`. Toute autre ligne fait refuser le banc, avant la
moindre suppression : la retirer à la main, ou monter un décor neuf.

Les quatre lignes neutres qui ont servi à mesurer la migration — forme du
relevé de production du 22/11/2026, aucune donnée de production — ne sont pas
un prérequis des bancs : ceux-ci purgent `leads` entre chaque scénario. Si
elles ne portent pas une adresse réservée, les retirer avant de lancer.

### 3. Lancer

La clé est passée par l'environnement, jamais en argument de ligne de commande
(elle resterait dans l'historique du shell) :

```powershell
$env:ESSAI_SB_URL = "https://<ref-du-projet-jetable>.supabase.co"
$env:ESSAI_SB_KEY = (Read-Host "cle anon du projet d essai" -AsSecureString | ConvertFrom-SecureString -AsPlainText)
$env:ESSAI_CONFIRME = "oui-reproduction-jetable"
node tests/manuel/essai-postgrest-idempotence.js
```

`ConvertFrom-SecureString -AsPlainText` demande **PowerShell 7 ou plus**
(`pwsh`). Sous Windows PowerShell 5.1, la même lecture sans écho s'écrit :

```powershell
$s = Read-Host "cle du projet d essai" -AsSecureString
$env:ESSAI_SB_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
Remove-Variable s
```

```powershell
node tests/manuel/essai-contention-livraison.js
```

Variables facultatives du second banc : `ESSAI_PARALLELE` (8 par défaut) et
`ESSAI_TOURS` (6 par défaut).

**Sous le rôle de service** — même chose, avec la clé de service du projet
d'essai et le drapeau qui la débloque :

```powershell
$env:ESSAI_SB_URL = "https://wzuvyztsohdvarxsixce.supabase.co"
$env:ESSAI_SB_KEY = (Read-Host "cle de SERVICE du projet d essai" -AsSecureString | ConvertFrom-SecureString -AsPlainText)
$env:ESSAI_CONFIRME = "oui-reproduction-jetable"
$env:ESSAI_ROLE_SERVICE = "oui"
node tests/manuel/essai-postgrest-idempotence.js
```

```powershell
node tests/manuel/essai-contention-livraison.js
```

La clé ne doit transiter par aucun message : `Read-Host` la lit dans le
terminal, l'environnement la porte le temps de la session, et la ligne de
nettoyage ci-dessous l'efface. Les services externes restent neutralisés quel
que soit le rôle — `fetchCloisonne` ne laisse passer que le projet d'essai et
refuse tout autre hôte.

Quand c'est fini, effacer la clé de la session :

```powershell
Remove-Item Env:ESSAI_SB_KEY, Env:ESSAI_SB_URL, Env:ESSAI_CONFIRME, Env:ESSAI_ROLE_SERVICE -ErrorAction SilentlyContinue
```

### 4. Démonter

Retirer les politiques d'essai (bloc de la fin de
`reproduction-leads-TEST.sql`), puis, si l'on ne veut rien garder, le bloc
« démontage complet » du même fichier.

## Codes de sortie

| Code | Sens |
|---|---|
| `0` | tous les scénarios passent |
| `1` | au moins un scénario échoue (le détail est imprimé) |
| `2` | **refusé par un verrou** — rien n'a été écrit |
| `3` | interruption technique (base injoignable, décor incomplet) |

## Mesures du 22/11/2026

`essai-postgrest-idempotence.js` : **27 essais, 0 échec**.
`essai-contention-livraison.js` : 6 tours de 8 appels simultanés →
1 ligne et 3 entrées de journal à chaque tour, réponses 1×200 + 7×200/rejeu,
**0 doublon, 0 erreur 5xx**. Notification en échec après insertion : la demande
reste enregistrée, la notification est perdue, le rejeu ne la retente pas.
Trigger synchrone en échec : insertion annulée, 500, 0 ligne, clé non consommée.

Reprise d'une notification manquée : `docs/REPRISE-NOTIFICATIONS-LEADS.md`.
Préalables à l'activation en production : en-tête de
`migration-leads-idempotence.sql`.
