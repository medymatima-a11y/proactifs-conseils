---
name: proactifs-design
description: "Système de design du site proactifsconseils.fr (cabinet de gestion de patrimoine Proactifs Conseils, Colombes 92), aligné sur le dépôt actuel. À lire pour toute création ou modification de page HTML du site (page service, article de blog, page ville, simulateur, landing, refonte de section), APRÈS FRONTEND-RULES.md qui prime en cas de contradiction. Contient la palette et les typographies réelles, les procédures header/breadcrumb centralisés, les pages de référence par famille, les patterns hero/sections/cards/boutons et les pièges connus."
---

# Design System — proactifsconseils.fr (état du dépôt, septembre 2026)

Site statique HTML/CSS/JS, sans build step côté Vercel, déployé depuis la branche `main` du dépôt GitHub `medymatima-a11y/proactifs-conseils`.

## 0. Priorité des sources — à lire en premier

1. **`FRONTEND-RULES.md`** (racine du dépôt) — règlement obligatoire.
2. **Le dépôt actuel** : `partials/header.html`, `assets/css/`, `assets/js/`, `scripts/` et leurs manifestes.
3. **La page de référence** de la famille (§1).
4. `CLAUDE.md`, `SEO-STANDARDS.md`, `docs/`.
5. Ce skill.

Ce skill décrit le site actuel ; s'il contredit le dépôt ou `FRONTEND-RULES.md`, **le dépôt gagne** et l'écart doit être signalé. Ne jamais recopier un bloc de ce skill à la place du code réel d'une page de référence.

## 1. Pages de référence (point de départ obligatoire)

| Famille | Référence |
|---|---|
| Service / fiscalité | `transmission.html` |
| Local / ville | `conseiller-patrimoine-colombes.html` |
| Immobilier (sous-marque Proactifs Immobilier) | `immobilier/estimation-colombes.html` |
| Crédit / courtage | `courtage-credit-immobilier.html` |
| Article de blog | `blog/donation-vivant-2026.html` |
| Simulateur / outil | `simulateurs/mensualite-credit.html` |
| Landing / capture | `guide-5-erreurs-patrimoniaux.html` |
| Accueil, Cabinet | pages uniques — jamais utilisées comme modèle |

**Jamais comme modèle :** `blog/pacte-dutreil-2026-fiscalite-transmission-entreprise.html` (ancienne nav inline), `simulation-pret-immobilier.html` (redirigée, ancienne nav), `pret-immobilier.html` (héritage sous-domaine), `Lead magnets/`, `prototypes/`, `partials/`.

## 2. Variables CSS (`:root` des pages site patrimoine)

Valeurs présentes sur ~53 pages ; copier le `:root` **de la page de référence** (pas celui-ci) lors d'une création.

```css
:root {
  --ivory:      #FAFAF7;   /* fond principal */
  --sand:       #F3F1EB;   /* sections alternées, breadcrumb */
  --forest:     #132D1E;   /* vert profond : hero, CTA, footer blog */
  --forest-mid: #1C3D28;
  --ink:        #111827;   /* texte principal */
  --ink-soft:   #374151;   /* texte secondaire */
  --gold:       #C4973A;   /* or : boutons, em des titres */
  --gold-light: #E8C97A;   /* or clair : em sur fond sombre */
  --gold-pale:  #FBF4E3;
  --teal:       #1E7A6E;   /* teal du site (labels, liens breadcrumb) */
  --teal-light: #2A9D8F;
  --teal-pale:  #E6F4F2;
  --slate:      #6B7280;
  --border:     #E5E2DA;
  --white:      #FFFFFF;
  --shadow-sm:  0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04);
  --shadow-md:  0 4px 16px rgba(17,24,39,.08), 0 2px 6px rgba(17,24,39,.04);
  --shadow-lg:  0 12px 40px rgba(17,24,39,.1),  0 4px 12px rgba(17,24,39,.06);
  --r-sm: 10px; --r-md: 16px; --r-lg: 24px; --r-xl: 32px;
}
```

Palettes spécifiques existantes (ne pas les modifier, ne pas les mélanger) :
- **Simulateurs** : `assets/css/simulators/simulators.css` et `simulators-seo.css` (teal `#006E64`, forest `#0F2E22`, slate `#5B6670`, or `#C4973A`).
- **Proactifs Immobilier** : corail `#E05D3D` (+ `--coral-*`) défini dans les pages de la sous-marque et dans `navigation-immobilier.css`.
- **Fond de footer** : `#080C10` (pages service, villes, accueil, immobilier) ou `var(--forest)` (blog) — ne pas harmoniser.

**Jamais :** `--navy`, `#0d1f3c`, `#c9a84c`/`#C9A84C` (ancien or, encore présent sur quelques landing — ne pas le propager), `#D2B41E` (prototype), Inter, Playfair Display, toute nouvelle couleur hex sans justification.

## 3. Typographie

- Site principal : **Fraunces** (titres, `em` or italique), **DM Sans** (texte), **DM Mono** (labels `.sec-label`, badges, chiffres). Reprendre l'URL Google Fonts exacte de la page de référence.
- Sous-marque Proactifs Immobilier : **Cormorant Garamond** + **Nunito Sans** (+ Caveat ponctuel).
- `<em>` dans un titre : `color: var(--gold)` ; sur fond sombre `var(--gold-light)`, italique.
- Tailles observées (ne pas modifier l'existant) : H1 services 56 px, H1 articles 52 px, H1 villes `clamp(36px,5vw,56px)`, `.sec-title` 44 px, H3 cartes 20 px, `.sec-label` 12 px DM Mono.

## 4. `<head>`

Copier le `<head>` de la page de référence, puis adapter uniquement :
- `<title>` (50–60 caractères) et `<meta name="description">` (140–160) ;
- `<link rel="canonical" href="https://proactifsconseils.fr/[slug]">` — **toujours sans www** ;
- Open Graph complet (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:locale` = `fr_FR`, `og:site_name` = `Proactifs Conseils`) et `twitter:card` ;
- JSON-LD adapté (voir §10).

Liens obligatoires présents sur les pages de référence (ne pas les retirer) :
```html
<link rel="stylesheet" href="/assets/css/navigation.css">   <!-- ou navigation-immobilier.css -->
<link rel="stylesheet" href="/assets/css/breadcrumb.css">   <!-- ajouté par build-breadcrumbs.js -->
<script src="/assets/js/navigation.js" defer></script>
```
Google tag : reprendre le bloc de la page de référence (`G-P53RQGXJZX` + `AW-835423035`).

## 5. Header — jamais écrit à la main

Le header (nav desktop à mega-menus Patrimoine / Immobilier / Financement / Entreprises & Pro, liens Blog et Cabinet, CTA contextuel, menu mobile 2 niveaux) est généré.

1. Copier depuis la page de référence le commentaire `<!-- NAV:CONFIG {…} -->` et les marqueurs `<!-- NAV:START … -->` / `<!-- NAV:END -->`.
2. Adapter dans `NAV:CONFIG` seulement : `theme` (`site-patrimoine` ou `immobilier`), l'état actif (`PATRIMOINE_ / IMMOBILIER_ / FINANCEMENT_ / ENTREPRISES_ / RESSOURCES_ (= Blog) / CABINET_ACTIVE_DESKTOP|MOBILE` = ` aria-current="page"`), `CTA_HREF` / `CTA_LABEL` / `MOBILE_CTA_*`.
3. Ajouter la page à `scripts/nav-pages.json`.
4. `node scripts/build-header.js` puis `node scripts/build-header.js --check`.

Source : `partials/header.html` ; CSS `assets/css/navigation.css` (or) / `navigation-immobilier.css` (corail) ; JS `assets/js/navigation.js`. Bascule hamburger à **1100 px** (dans ces fichiers uniquement). Détails : `docs/NAVIGATION-PROACTIFS.md`.

**Obsolète — ne jamais reproduire :** nav `background: transparent` avec liens blancs, `#nav:not(.scrolled)`, `z-index:100`, dropdown « Nos services », liens `/#simulateurs`, `/#approche`, CSS/JS de nav inline, CTA vers `/bilan-patrimonial-gratuit`.

## 6. Breadcrumb — jamais écrit à la main

1. Ajouter la page à `scripts/breadcrumb-pages.json` (`file`, `url`, `label`, `trail` avec Accueil en tête ; chaque URL du trail doit être une page réelle).
2. `node scripts/build-breadcrumbs.js` : insère le fil d'Ariane (`<nav class="breadcrumb"><ol>` entre `<!-- BREADCRUMB:START/END -->`), le JSON-LD `BreadcrumbList` (entre `<!-- BREADCRUMB_JSONLD:START/END -->`) et le `<link>` vers `/assets/css/breadcrumb.css`.
3. `node scripts/build-breadcrumbs.js --check`.

Aucun style `.breadcrumb` inline dans la page.

## 7. Footer — pas de footer inventé

Il n'existe pas encore de footer centralisé. Réutiliser **strictement** le footer (HTML + CSS) de la page de référence de la famille, sans modifier couleurs, mentions réglementaires (CIF / ORIAS / AMF / IOBSP), ancienneté affichée ni réseaux sociaux. Sur les pages de type service, le footer porte `id="contact"` (cible des liens `/#contact` et `#contact`).

## 8. Heros et sections (patterns observés)

- **Hero service** (`transmission.html`) : `.svc-hero`, fond `linear-gradient(135deg, #0a1f14 0%, var(--forest) 100%)`, `padding: 80px 40px`, H1 Fraunces 56 px / 700, `.hero-badge`, `.hero-stats` (2–3 chiffres).
- **Hero article** (`blog/donation-vivant-2026.html`) : `.article-hero`, fond `linear-gradient(135deg, #0a1f14 0%, var(--forest) 60%, #1a4030 100%)`, `padding: 80px 40px 100px`, H1 52 px ; layout article + sidebar (TOC, CTA), `author-box`, FAQ, `article-cta`.
- **Hero ville** (`conseiller-patrimoine-colombes.html`) : 2 colonnes, `padding: 120px 80px`, H1 en `clamp()`.
- **Simulateurs** : structure `.cap-wrap` / `.band` / `.wide` / `.read` et primitives `.sim-*` des CSS partagés.
- **Sections** : `.sec` (`padding: 96px 40px`), alternance sand / white, fond forest pour le CTA final ; `.container` `max-width: 1200px`.
- **`.sec-label`** : DM Mono 12 px, teal, uppercase, `letter-spacing: 1px`, barre de 12 px avant.
- **Cartes** : `.solution-card` (`--r-lg`, `--shadow-sm`, survol `--shadow-lg`), `.process-step` (numéro or), `.why-card`, `.key-num-card`.
- **Boutons** : fond `var(--gold)`, texte `var(--ink)`, `border-radius: var(--r-md)` (corail sur la sous-marque Immobilier). Ne jamais utiliser de bouton bleu ou vert.
- **FAQ** : `<details>` natif sur les pages service / fiscalité / immobilier / simulateurs ; accordéon `.faq-question` + JS sur les articles de blog. Suivre le mécanisme de la page de référence.

Copier les valeurs exactes depuis la page de référence plutôt que depuis ce résumé.

## 9. Responsive

- Breakpoints pour tout nouveau CSS : **1024, 900, 600, 480**. `1100` est réservé à la navigation.
- Existants tolérés sans modification : 768 (blog, cabinet), 1000, 960, 640, 560, 540.
- Grilles : jamais de `grid-template-columns` en `style=""` ; classe + media query.
- Jamais `overflow-x:hidden` sur `html`/`body` pour masquer un débordement.
- Validation : 360 / 390 / 768 / 1024 / 1440 px avec `document.documentElement.scrollWidth <= window.innerWidth`.
- Correctifs à ne jamais écraser : liste dans `FRONTEND-RULES.md` §7 (nav mobile, `.lead-cards`, `.why-grid` / `.solution-grid` / `.case-grid`, `.solution-grid.grid-5`, tableau Courbevoie, footer cabinet, ratio hero accueil, fix `.reveal`).

## 10. Schema.org

Partir du JSON-LD de la page de référence de la famille et n'adapter que les champs propres à la page. Ne jamais supprimer un champ existant pour « simplifier ».

| Famille | Types principaux présents sur la référence |
|---|---|
| Service / fiscalité | FinancialService, Service, HowTo, FAQPage, Person, BreadcrumbList |
| Ville | LocalBusiness, FinancialService, Person, City, FAQPage, BreadcrumbList |
| Immobilier | RealEstateAgent, Organization, FAQPage, BreadcrumbList |
| Article | Article, Person, Organization, FAQPage, BreadcrumbList |
| Simulateur | FAQPage, BreadcrumbList |

URLs toujours `https://proactifsconseils.fr/...` (jamais www). `BreadcrumbList` est généré par script (§6).

## 11. Routage et sitemap

- `vercel.json` (`cleanUrls: true`) : ne pas le modifier sans demande explicite ; proposer le snippet de rewrite à Medy si nécessaire.
- `sitemap.xml` est régénéré automatiquement (`scripts/generate-sitemap.js` via GitHub Actions) : ne pas l'éditer à la main.

## 12. Règles d'or

1. Partir de la page de référence de la famille — jamais d'une autre page.
2. Header et breadcrumb uniquement via les scripts de génération.
3. Footer : copie stricte de la page de référence, jamais inventé.
4. `em` italique or dans les titres — signature visuelle du site.
5. Hero forest sur les pages service, ville et article ; sous-marque Immobilier : fond clair et corail.
6. Boutons CTA en or (`var(--gold)`) ; corail sur Proactifs Immobilier.
7. Polices : Fraunces + DM Sans + DM Mono (Cormorant + Nunito sur Immobilier).
8. Paragraphes d'articles : `text-align: justify` sur `.article-content p` / `.article-body p`.
9. `<strong>` sur fond sombre : `color: var(--gold-light)` (ex. `.retenir-block strong`, `.sec-forest strong`).
10. Conformité MIF2 (`CLAUDE.md`) : jamais « indépendant », « gratuit », « offert », « sans engagement », « meilleur produit ».
11. Aucun changement d'URL, canonical, redirection, JSON-LD ou H1 existant sans demande explicite.
12. Avant commit : `build-header.js --check`, `build-breadcrumbs.js --check`, `check-mobile-nav.js`, et vérifier que la page est bien inscrite dans les deux manifestes.
