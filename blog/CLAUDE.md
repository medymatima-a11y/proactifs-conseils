# Blog Proactifs Conseils — instructions Cowork

> **Tu es dans le dossier `blog/` du site `proactifsconseils.fr`.**
> Mission unique : transformer un brouillon Markdown (issu de l'Agent SEO)
> en page HTML de blog conforme au design Proactifs, prête à pousser.

---

## 1. Avant toute action — lectures obligatoires

À l'ouverture de la session, lis dans cet ordre :

1. **`.claude/skills/proactifs-design/SKILL.md`** — design system complet
   (variables CSS, nav, hero, sections, footer, boilerplate SEO). Aucune
   création de page sans ce skill.
2. **`SITE-CONTEXT.md`** — architecture des pages existantes du site,
   workflow de production, conventions icônes, règles éditoriales.
3. **`SEO-ARTICLES-SUIVI.md`** — articles déjà publiés, mots-clés couverts,
   pages de service pour le maillage interne.
4. Un article récent comme **gabarit de référence** :
   `donation-vivant-2026.html` ou `gestion-patrimoine-entreprise-dirigeants-strategies-2026.html`.

Si une de ces lectures manque, signale-le avant de générer quoi que ce soit.

---

## 2. Workflow standard

L'utilisateur colle un prompt depuis l'Agent SEO (dashboard
`https://agent-seo-proactifs-v2.vercel.app/`) contenant : slug, titre SEO,
meta description, mots-clés, suggestions de maillage et contenu markdown.

Étapes attendues :

1. **Vérifier l'unicité du slug** dans `SEO-ARTICLES-SUIVI.md` et dans le
   listing de ce dossier. Refuser si doublon.
2. **Convertir le markdown en HTML** en suivant strictement le skill
   `proactifs-design` (hero, sections, sidebar, CTA, footer, schema, OG,
   canonical non-www).
3. **Sauvegarder** dans ce dossier sous le nom `<slug>.html`
   (kebab-case, sans accents, sans préfixe `/blog/` dans le nom de fichier).
4. **Mettre à jour `SEO-ARTICLES-SUIVI.md`** : ajouter une ligne dans
   « Articles publiés » + cocher le mot-clé dans la section dédiée.
5. **Proposer la route Vercel** à ajouter dans `../vercel.json` :
   ```json
   { "source": "/blog/<slug>", "destination": "/blog/<slug>.html" }
   ```
   ⚠️ Ce fichier est dans le dossier parent (`site-web/`). Cowork ne l'a
   peut-être pas en lecture. Si tu n'y as pas accès, livre le snippet à
   coller manuellement et signale-le à Medy.
6. **Récap pour le commit** : liste les fichiers créés/modifiés et propose
   un message de commit type `feat(blog): article <slug>`.

---

## 3. Conventions de nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichier HTML | `<slug>.html` dans `blog/` | `lmnp-2026.html` |
| URL publique | `/blog/<slug>` | `https://proactifsconseils.fr/blog/lmnp-2026` |
| Canonical | non-www, sans extension | `<link rel="canonical" href="https://proactifsconseils.fr/blog/lmnp-2026">` |
| OG locale | `fr_FR` | — |
| Image héros | placée dans `../images/`, alt descriptif | — |

Slug en français, kebab-case, sans accents ni mots de liaison
(`investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026`).

---

## 4. Règles MIF2 — non négociables

| ❌ Interdit | ✅ À utiliser |
|---|---|
| "conseiller indépendant" | "conseiller en gestion de patrimoine" |
| "cabinet indépendant" | "cabinet de gestion de patrimoine" |
| "sans conflit d'intérêt" | *(ne pas l'aborder)* |
| "meilleur produit" / "rendement garanti" | "solution adaptée à votre situation" |
| "gratuit" / "offert" / "sans engagement" | *(supprimer — le bilan est payant)* |

**CTA unique autorisé** : « **Prendre rendez-vous** » → lien vers
`/bilan-patrimonial`. Pas de variation, pas de « bilan gratuit ».

Le mot « offert » est banni du site.

---

## 5. Patrimoine & fiscalité — règle d'or

Tout chiffre fiscal, abattement, plafond, article CGI, taux ou délai doit
être **vérifié à une source citable**, dans cet ordre :

1. **MCP `datagouv`** (`mcp__datagouv__search_datasets`, `query_resource_data`…)
   pour les données publiques chiffrées (DVF, Sirene, INSEE, DGFiP).
2. **`WebFetch` / `WebSearch`** sur sources officielles :
   `bofip.impots.gouv.fr` → `legifrance.gouv.fr` → `impots.gouv.fr` →
   `service-public.fr`. Citer l'URL et la date de mise à jour dans l'article.
3. **Skill `patrimoine-fiscal-fr`** s'il est chargé (consolidation interne).
4. Sinon **marquer explicitement comme à vérifier** auprès de Medy, ou
   **demander** avant rédaction.

**Jamais inventer un chiffre.** Mieux vaut une formule prudente
(« sous réserve de vérification ») qu'un nombre faux. Dans le HTML
publié, citer la source en lien sortant `rel="noopener"` quand c'est
pertinent (ex. lien BOFiP sur un BIC ou un abattement).

Style rédactionnel : utiliser le skill `redaction-naturelle-fr` (registre
chaleureux-proche ou institutionnel-distingué selon le sujet), pas le
style « IA standard ».

---

## 6. Maillage interne — règles

Chaque article doit contenir **au minimum** :

- **2 liens** vers des pages de service du site (voir
  `SEO-ARTICLES-SUIVI.md` section « Pages de service existantes »).
- **2 liens** vers d'autres articles du blog (cohérents avec le sujet).
- **1 CTA** vers `/bilan-patrimonial` (« Prendre rendez-vous »).

Sidebar : 2 articles liés + CTA bilan, comme dans les articles existants.

---

## 7. Git — où va le commit

⚠️ Ce dossier `blog/` est un **sous-dossier** du repo principal
`medymatima-a11y/proactifs-conseils` (racine : `../`).

- Si Cowork a accès à `../` : commit + push depuis la racine.
- Sinon : livre à Medy la liste des fichiers à ajouter au commit (avec
  chemins relatifs depuis `site-web/`) et le message proposé.

Format du message :
```
feat(blog): <titre court de l'article>

- Article <slug>.html créé
- Route ajoutée dans vercel.json
- Suivi mis à jour dans blog/SEO-ARTICLES-SUIVI.md
```

Le push sur `main` déclenche un déploiement Vercel automatique
(~30 secondes).

---

## 8. Ce que tu NE fais PAS dans ce dossier

- ❌ Modifier les pages de service du site (elles sont dans `../`).
- ❌ Toucher au design system global (`proactifs-design.skill`) — c'est
  une référence en lecture seule.
- ❌ Inventer une route Vercel sans la proposer pour `../vercel.json`.
- ❌ Publier un article si un doublon de mot-clé existe — propose un
  angle alternatif d'abord.
- ❌ Utiliser les termes interdits MIF2 (section 4) — même dans un
  exemple ou une citation.

---

## 9. Skills utiles (à charger si disponibles)

| Skill | Quand l'utiliser |
|---|---|
| `proactifs-design` | **Toujours** — installé dans `.claude/skills/` |
| `redaction-naturelle-fr` | Tout texte client de plus de 3 phrases |
| `patrimoine-fiscal-fr` | Dès qu'un chiffre ou article CGI est cité |
| `seo-page` / `seo-content` | Pour optimiser headings, meta, schema |
| `seo-schema` | Pour générer le JSON-LD `Article` + `FAQPage` |

---

*Dernière mise à jour : 2026-06-17 (ajout MCP datagouv + sources officielles
pour vérification des chiffres fiscaux).*
