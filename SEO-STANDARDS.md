# Standards SEO — Proactifs Conseils Patrimoine

Référentiel technique appliqué par l'agent SEO éditeur sur proactifsconseils.fr.
Lire ce fichier avant toute optimisation ou création de page.

---

## 1. E-E-A-T pour YMYL Financier

Le site relève du domaine **Your Money or Your Life (YMYL)** — Google applique des critères renforcés.

| Critère | Mise en œuvre concrète |
|---|---|
| **Experience** | Citer des cas clients anonymisés, donner des exemples chiffrés concrets, mentionner les années d'expérience |
| **Expertise** | Signature visible de Medy Matima, mention CIF/ORIAS dans le footer de chaque page |
| **Authoritativeness** | Schema `Person` avec credentials, liens vers profil LinkedIn et page ORIAS |
| **Trustworthiness** | Mentions légales accessibles, page À propos détaillée, conformité RGPD, HTTPS obligatoire |

**À ajouter sur chaque page éditoriale :**
- Auteur visible (Medy Matima) avec lien vers la page À propos
- Date de mise à jour visible et dans le schema (`dateModified`)
- Schema `Person` ou `Author` lié à l'article ou à la page

---

## 2. Core Web Vitals (seuils minimums)

| Métrique | Cible | Action si dépassée |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | Optimiser l'image hero (WebP, dimensions précises, preload) |
| INP (Interaction to Next Paint) | < 200 ms | Réduire JS bloquant, défer les scripts non critiques |
| CLS (Cumulative Layout Shift) | < 0.1 | Définir `width`/`height` sur toutes images, réserver l'espace des fonts |

Tester via [PageSpeed Insights](https://pagespeed.web.dev/) après chaque modification majeure.

---

## 3. SEO Local — Colombes / Hauts-de-Seine (92)

**NAP cohérent (Name / Address / Phone)** sur toutes les pages :
- Nom : Proactifs Conseils
- Adresse : Colombes (92700)
- Téléphone : numéro unique du cabinet

**Schema LocalBusiness** sur homepage + pages villes :

```json
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "FinancialService"],
  "name": "Proactifs Conseils",
  "url": "https://proactifsconseils.fr",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Colombes",
    "postalCode": "92700",
    "addressCountry": "FR"
  },
  "areaServed": [
    "Colombes",
    "Asnières-sur-Seine",
    "Courbevoie",
    "Levallois-Perret",
    "Nanterre",
    "Hauts-de-Seine",
    "Île-de-France"
  ],
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 48.92,
    "longitude": 2.25
  }
}
```

Sur les pages villes, restreindre `areaServed` à la ville cible + villes voisines pour renforcer la pertinence locale.

---

## 4. Schema.org par type de page

| Type de page | Schemas à inclure |
|---|---|
| Homepage | `LocalBusiness` + `FinancialService` + `Organization` |
| Page ville | `LocalBusiness` avec `areaServed` ciblé sur la ville |
| Page service | `Service` imbriqué dans `FinancialService` + `FAQPage` si Q/R présentes |
| Article blog | `Article` + `author` (Person) + `datePublished` + `dateModified` |
| Page à propos | `Person` (Medy Matima) avec credentials et URL ORIAS |

Valider chaque schema via [Rich Results Test](https://search.google.com/test/rich-results) avant commit.

---

## 5. Balises `<head>` obligatoires

Gabarit minimum à respecter sur toutes les pages :

```html
<!-- SEO de base -->
<title>[Mot-clé principal] | Proactifs Conseils</title>
<meta name="description" content="[140–160 car. — bénéfice + localisation + CTA]">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://proactifsconseils.fr/[slug]">

<!-- Open Graph -->
<meta property="og:title" content="[Titre page]">
<meta property="og:description" content="[Meta description]">
<meta property="og:url" content="https://proactifsconseils.fr/[slug]">
<meta property="og:image" content="https://proactifsconseils.fr/images/og-default.jpg">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">

<!-- Twitter Card (optionnel) -->
<meta name="twitter:card" content="summary_large_image">
```

**Longueurs cibles :**
- `title` : 50-60 caractères, mot-clé principal en début
- `meta description` : 140-160 caractères, contenant un bénéfice clair et un CTA implicite

---

## 6. Canonicals

- Toujours utiliser le format **non-www** : `https://proactifsconseils.fr/[slug]`
- Le redirect `www` → `non-www` est configuré dans `vercel.json`
- Une page = une URL canonique. Pas de versions multiples indexées.

---

## 7. Images

| Règle | Détail |
|---|---|
| Format | WebP en priorité, fallback JPG |
| `alt` | Descriptif obligatoire — jamais vide, jamais juste le nom de fichier |
| Lazy loading | `loading="lazy"` sauf image hero |
| Dimensions | `width` et `height` explicites pour éviter le CLS |
| Compression | Optimiser avant upload (Squoosh ou équivalent) |

**Exemple correct :**
```html
<img src="/images/medy-conseiller-patrimoine.webp"
     alt="Medy Matima, conseiller en gestion de patrimoine à Colombes"
     width="400" height="500" loading="lazy">
```

---

## 8. Maillage interne

**Règles obligatoires :**

| Type de page | Doit pointer vers |
|---|---|
| Page service | `/bilan-patrimonial` (conversion) + 1-2 services complémentaires |
| Article de blog | La page de service la plus proche du sujet + `/bilan-patrimonial` |
| Page ville | Les 2 villes voisines (clustering local) + `/bilan-patrimonial` |
| Homepage | Toutes les pages services + les 5 pages villes |

**Ancres** : varier les ancres (pas toujours "cliquez ici"), inclure le mot-clé cible naturellement.

---

## 9. Checklist Pré-Commit

Avant chaque `git push origin main`, vérifier :

**Contenu**
- [ ] Aucun terme MIF2 interdit (voir CLAUDE.md)
- [ ] CTA conformes (pas de "gratuit", "indépendant", "sans engagement")
- [ ] Auteur visible (Medy Matima) avec lien vers À propos
- [ ] Date de mise à jour visible si page éditoriale

**Technique**
- [ ] Title 50-60 car., mot-clé en début
- [ ] Meta description 140-160 car.
- [ ] Canonical non-www présent
- [ ] OG complet (title, description, image, url, type, locale fr_FR)
- [ ] Schema.org valide ([Rich Results Test](https://search.google.com/test/rich-results))
- [ ] Toutes les images ont `alt` + dimensions
- [ ] Maillage interne respecté

**Performance**
- [ ] Images optimisées (WebP)
- [ ] Pas de JS bloquant ajouté
- [ ] Hero image préchargée si nécessaire

**Local SEO (priorité 2026)**
- [ ] Mention explicite Colombes / 92 / Hauts-de-Seine si pertinent
- [ ] Schema `LocalBusiness` avec `areaServed` correct
- [ ] Lien vers au moins une page ville pertinente

---

## 10. Outils et MCP à utiliser

| Besoin | MCP / Skill |
|---|---|
| Audit SEO d'une page | Skill `seo-page` ou `seo-audit` |
| Vérifier indexation et performance | MCP Google Search Console (`gscServer__*`) |
| Vérifier déploiement Vercel | MCP Vercel (`get_deployment`, `list_deployments`) |
| Pousser un changement | MCP GitHub ou commande Git directe |
| Tester rendu live | MCP Claude in Chrome |
| Rédiger contenu en français | Skill `redaction-naturelle-fr` |
| Données fiscales / patrimoniales | Skill `patrimoine-fiscal-fr` |
| Design / patterns du site | Skill `proactifs-design` |

---

## 11. Versions et révisions

- Créé : juin 2026
- Dernière révision : juin 2026
- Maintenu par : Medy Matima + agent SEO éditeur
