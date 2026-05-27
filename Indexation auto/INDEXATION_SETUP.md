# Auto-indexation Search Console — guide de configuration

Ce repo dispose d'un workflow GitHub Actions qui, à chaque push d'article :
1. Régénère automatiquement `sitemap.xml`
2. Soumet les nouvelles URLs à la **Google Indexing API**
3. Soumet les mêmes URLs à **IndexNow** (Bing, Yandex, Seznam, Naver)
4. Ping le sitemap à Google

Tu as deux choses à faire **une seule fois** pour que ça fonctionne.

---

## 1. Créer le compte de service Google Cloud

### a) Créer un projet et activer l'Indexing API
1. Va sur https://console.cloud.google.com/
2. Crée un nouveau projet : `proactifs-indexing`
3. Menu → **APIs & Services** → **Library** → cherche **"Indexing API"** → **Enable**

### b) Créer un compte de service
1. Menu → **IAM & Admin** → **Service Accounts** → **+ Create service account**
2. Nom : `proactifs-indexing-bot`
3. Description : `Soumet les URLs à l'Indexing API depuis GitHub Actions`
4. **Create and continue**, pas de rôle à attribuer, **Done**

### c) Générer une clé JSON
1. Clique sur le compte de service créé
2. Onglet **Keys** → **Add key** → **Create new key** → format **JSON**
3. Un fichier `.json` est téléchargé. **Garde-le précieusement, on en a besoin à l'étape 3.**

### d) Autoriser le compte de service dans Search Console
1. Ouvre le `.json`, copie la valeur de `client_email`
   (ressemble à `proactifs-indexing-bot@proactifs-indexing.iam.gserviceaccount.com`)
2. Va sur https://search.google.com/search-console
3. Sélectionne la propriété `proactifsconseils.fr`
4. **Paramètres** (en bas à gauche) → **Utilisateurs et autorisations** → **Ajouter un utilisateur**
5. Email : colle le `client_email`
6. Autorisation : **Propriétaire** (obligatoire pour l'Indexing API)
7. Valide

---

## 2. Ajouter les secrets dans GitHub

1. Va sur https://github.com/medymatima-a11y/proactifs-conseils
2. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Nom : `GOOGLE_INDEXING_API_KEY`
4. Valeur : **colle l'intégralité du contenu du fichier `.json`** (de `{` à `}`)
5. **Add secret**

Pas besoin de secret pour IndexNow (la clé est publique par design).

---

## 3. Vérifier que IndexNow fonctionne

Une fois le fichier `cc5c2c356f2cc4936f46810d6ddba8b8.txt` déployé à la racine du site, teste-le :
```
https://proactifsconseils.fr/cc5c2c356f2cc4936f46810d6ddba8b8.txt
```
Tu dois voir la clé `cc5c2c356f2cc4936f46810d6ddba8b8` en clair. Si oui, IndexNow est OK.

---

## 4. Comment ça marche au quotidien

### Cas 1 : tu publies un nouvel article
Tu commit/push un nouveau fichier `.html` (ex: `blog/per-pour-tns.html`). Le workflow :
- détecte le nouveau fichier
- régénère `sitemap.xml` (l'ajoute automatiquement) et le commit
- soumet `https://proactifsconseils.fr/blog/per-pour-tns` à Google + Bing + Yandex
- ping le sitemap à Google

Délai d'indexation typique : **quelques heures pour Google, quelques minutes pour Bing**.

### Cas 2 : tu veux forcer la réindexation d'une URL existante
1. Va sur https://github.com/medymatima-a11y/proactifs-conseils/actions
2. Clique sur **Auto-index on publish** → **Run workflow**
3. Dans le champ `urls`, mets `https://proactifsconseils.fr/page-a-reindexer` (séparées par des espaces si plusieurs)
4. **Run workflow**

### Cas 3 : tu veux tester sans rien envoyer (dry-run)
En local :
```bash
DRY_RUN=1 node scripts/submit-to-google.js https://proactifsconseils.fr/blog/test
DRY_RUN=1 node scripts/submit-to-indexnow.js https://proactifsconseils.fr/blog/test
```

---

## 5. Limites à connaître

**Google Indexing API**
- Quota par défaut : **200 requêtes/jour** (largement suffisant)
- Officiellement réservé à `JobPosting` et `BroadcastEvent` — fonctionne en pratique pour tous types de contenus, mais Google peut décider d'ignorer la demande. Le sitemap reste la garantie.

**IndexNow**
- Quota effectif : **10 000 URLs/jour** par hôte
- Google n'y participe pas. Couvre Bing, Yandex, Seznam, Naver.

**Sitemap**
- Géré 100% automatiquement, plus besoin de l'éditer à la main.
- Si tu veux exclure une page, ajoute son nom de fichier dans la constante `EXCLUDE` de `scripts/generate-sitemap.js`.

---

## 6. Diagnostic en cas de problème

**Le workflow échoue avec "GOOGLE_INDEXING_API_KEY manquante"**
→ Le secret n'a pas été ajouté ou est mal nommé. Vérifie l'orthographe exacte.

**Le workflow log "status 403" sur Google**
→ Le compte de service n'est pas Propriétaire dans Search Console. Refais l'étape 1.d.

**Le workflow log "status 401" sur Google**
→ Le JSON est mal formé dans le secret. Re-télécharge la clé et recolle-la entière.

**IndexNow log "status 422"**
→ Une URL est invalide ou le fichier de clé n'est pas accessible. Vérifie que `https://proactifsconseils.fr/cc5c2c356f2cc4936f46810d6ddba8b8.txt` retourne bien la clé.

**Google n'indexe toujours pas**
→ L'Indexing API ne garantit pas l'indexation, elle accélère la découverte. Vérifie dans Search Console (Inspection d'URL) si la page est explorée. Si "Découverte uniquement", c'est un problème de qualité/maillage interne, pas d'indexation.
