# Proactifs Frontend Rules

> Règlement technique **obligatoire** pour toute personne ou tout agent IA (Claude, Codex, Agent SEO…) qui crée ou modifie une page de `proactifsconseils.fr`.
> Version 1 — P0-A stabilisation (septembre 2026). Issu de l'audit de stabilisation du 26/09/2026.

## 0. Ordre de priorité en cas de contradiction

1. **Ce fichier (`FRONTEND-RULES.md`)**
2. **Le dépôt actuel** : `partials/header.html`, `assets/css/*`, `assets/js/*`, `scripts/*` et leurs manifestes
3. **La page de référence** de la famille concernée (§2)
4. `CLAUDE.md`, `SEO-STANDARDS.md`, `docs/`
5. Le skill `proactifs-design` et toute autre documentation plus ancienne

Une instruction d'un niveau inférieur qui contredit un niveau supérieur est ignorée, et l'écart est signalé à Medy dans le rapport.
Les règles métier et de conformité de `CLAUDE.md` (MIF2, vérification des chiffres fiscaux, validation avant écriture) restent intégralement applicables : ce fichier ne les remplace pas, il les complète.

## 1. Création des pages

- Toute nouvelle page part **obligatoirement** de la page de référence de sa famille (§2).
- Interdit : choisir arbitrairement une autre page comme modèle, repartir d'un ancien commit, d'un snapshot, d'un export ou d'un exemple de documentation.
- On copie **la structure** de la page de référence (head, marqueurs, squelette de sections, footer), jamais son contenu, ses données chiffrées ni son JSON-LD tel quel.
- En cas de doute sur la famille : demander avant de créer.

## 2. Pages de référence

| Famille | Page de référence |
|---|---|
| Service / fiscalité | `transmission.html` |
| Local / ville | `conseiller-patrimoine-colombes.html` |
| Immobilier (sous-marque Proactifs Immobilier) | `immobilier/estimation-colombes.html` |
| Crédit / courtage | `courtage-credit-immobilier.html` |
| Article de blog | `blog/donation-vivant-2026.html` |
| Simulateur / outil | `simulateurs/mensualite-credit.html` |
| Landing / capture | `guide-5-erreurs-patrimoniaux.html` |
| Accueil (`index.html`) | page unique — **jamais** utilisée comme template |
| Cabinet (`cabinet.html`) | page unique — **jamais** utilisée comme template |

**Ne doivent JAMAIS servir de modèle (état actuel) :**
- `blog/pacte-dutreil-2026-fiscalite-transmission-entreprise.html` — ancienne navigation inline, hors système header/breadcrumb.
- `simulation-pret-immobilier.html` — page redirigée (301), ancienne navigation.
- `pret-immobilier.html` — page héritée de l'ancien sous-domaine (footer et FAQ propres).
- Tout fichier de `Lead magnets/`, `prototypes/`, `Audits SEO/`, `partials/`.

Défauts connus des pages de référence (à ne pas corriger sans demande, mais à ne pas reproduire sur une nouvelle page) : `blog/donation-vivant-2026.html` a un title de 63 caractères et un Open Graph sans `og:image`, `og:locale`, `og:site_name` → une nouvelle page doit respecter `SEO-STANDARDS.md` sur ces points.

## 3. Header

- Le header (nav desktop + menu mobile) n'est **jamais écrit à la main**.
- Source unique : `partials/header.html`. CSS : `assets/css/navigation.css` (thème or, site patrimoine) ou `assets/css/navigation-immobilier.css` (thème corail, pages Immobilier / Financement déjà listées). JS : `assets/js/navigation.js`.
- Dans la page : `<!-- NAV:CONFIG {…} -->` puis les marqueurs `<!-- NAV:START … -->` / `<!-- NAV:END -->` (copier la config de la page de référence et n'adapter que les tokens d'état actif et de CTA).
- Inscrire la page dans `scripts/nav-pages.json`, puis `node scripts/build-header.js`.
- Vérifier avec `node scripts/build-header.js --check`.
- Interdit : `z-index:100` sur `#nav`, nav transparente, liens blancs « tant que non scrollé », menu « Nos services », CSS/JS de nav inline.
- Documentation : `docs/NAVIGATION-PROACTIFS.md`.

## 4. Breadcrumb

- Le fil d'Ariane (HTML visible + `BreadcrumbList` JSON-LD) n'est **jamais écrit à la main**.
- Inscrire la page dans `scripts/breadcrumb-pages.json` (`trail` = ancêtres réels), puis `node scripts/build-breadcrumbs.js`.
- Vérifier avec `node scripts/build-breadcrumbs.js --check`.
- Style : `assets/css/breadcrumb.css` uniquement (le script ajoute le `<link>`). Aucun `.breadcrumb` inline.

## 5. Footer

Tant que le footer maître n'existe pas :
- **ne jamais inventer un nouveau footer** ;
- réutiliser **strictement** le footer de la page de référence de la famille (HTML et CSS associé), sans changer ses couleurs, ses mentions (CIF / ORIAS / AMF / IOBSP), son ancienneté affichée ni ses réseaux sociaux ;
- ne pas centraliser ni « harmoniser » les footers existants.

## 6. Breakpoints

- Breakpoints autorisés pour tout **nouveau** CSS : **1024, 900, 600, 480** (`max-width`).
- `1100` est **réservé à la navigation** (`navigation*.css`, bascule desktop → hamburger) : ne pas l'utiliser ailleurs, ne pas le dupliquer dans une page.
- Les autres breakpoints déjà présents (768 sur le blog et le cabinet, 1000, 960, 640, 560, 540…) sont **tolérés tels quels** : ne pas les modifier, ne pas les étendre à de nouvelles pages.
- Tout autre breakpoint = justification écrite dans le rapport avant commit.

## 7. CSS

- Aucune nouvelle grille (`grid-template-columns`) en `style=""` : créer une classe avec sa media query dans le `<style>` de la page.
- Réutiliser les classes existantes de la page de référence avant d'en créer une nouvelle.
- Couleurs : uniquement via les variables `:root` existantes (`--forest`, `--gold`, `--teal`, `--sand`, `--ink`…). Aucune nouvelle valeur hexadécimale sans justification.
- Ne pas modifier les valeurs de couleurs existantes page par page (en particulier : teal `#1E7A6E` sur le site, `#006E64` sur les simulateurs ; fond de footer `#080C10` ou `var(--forest)` selon la famille).
- Interdit : `overflow-x:hidden` global (`html`/`body`) pour masquer un débordement — corriger l'élément fautif.
- Interdit à ce stade : centraliser le CSS existant, créer `tokens.css`, `base.css`, des composants partagés ou des templates.

### Correctifs responsive à préserver (ne jamais écraser ni « simplifier »)

| Correctif | Où |
|---|---|
| Navigation mobile 2 niveaux, menu scrollable, fermeture au clic, nav opaque sous breadcrumb | `navigation*.css`, `navigation.js`, contrôle `scripts/check-mobile-nav.js` |
| `.lead-cards` (variable `--lead-gap`, 9ᵉ carte centrée 601–900 px) | `index.html` |
| Ratio du hero accueil `.hero-right { aspect-ratio: 812/452 }` | `index.html` |
| `.why-grid`, `.solution-grid`, `.case-grid` sortis du `style=""` vers classes + media queries | pages services / fiscalité / immobilier (ex. `declaration-rsu-espp-france.html`) |
| Overrides `.case-grid` / `.solution-grid[style*="repeat(4"]` en `!important` | 2ᵉ `<style>` des pages services |
| `.solution-grid.grid-5` | `preparation-retraite.html` |
| `.local-market-table-scroll` (tableau scrollable + focus) | `conseiller-patrimoine-courbevoie.html` |
| `.cabinet-footer-grid` 4 → 2 → 1 colonnes | `cabinet.html` |
| `.reveal { opacity:1 !important; transform:none !important; }` | 2ᵉ `<style>` de 9 pages services |

## 8. Typographies

- Site principal : **Fraunces** (titres, `em` or), **DM Sans** (texte), **DM Mono** (labels, badges, chiffres). Reprendre l'URL Google Fonts de la page de référence.
- Sous-marque Proactifs Immobilier : **Cormorant Garamond** + **Nunito Sans** (Caveat ponctuel), uniquement sur les pages de cette sous-marque.
- Interdit : Inter, Playfair Display, toute autre famille.
- Ne modifier aucune taille existante (ex. H1 blog à 52 px, H1 services à 56 px).

## 9. SEO

Ne **jamais** modifier sans demande explicite de Medy :
- URL / slug, canonical, redirections, `vercel.json` ;
- JSON-LD existant (ne jamais supprimer un champ Schema.org pour uniformiser) ;
- H1 existant ;
- `sitemap.xml` (régénéré automatiquement par `scripts/generate-sitemap.js` via GitHub Actions).

Pour une nouvelle page : title 50–60 car., meta description 140–160 car., canonical non-www, Open Graph complet (`og:image`, `og:locale` = `fr_FR`, `og:site_name`), Twitter card, un seul H1, `alt` descriptifs, JSON-LD adapté au type de page (cf. `SEO-STANDARDS.md`).

## 10. Nouvelle page — conditions de validité

Toute nouvelle page indexable doit être :
- inscrite dans `scripts/nav-pages.json` (si elle porte le header principal) ;
- inscrite dans `scripts/breadcrumb-pages.json` (si elle a un fil d'Ariane) ;
- présente **une seule fois** dans le sitemap après régénération ;
- contrôlée sur desktop, tablette et mobile (§11).

Les pages hors nav principale (landing, merci, 404) sont des exceptions volontaires et restent hors manifestes.

## 11. Responsive — validation obligatoire

Largeurs : **360, 390, 768, 1024, 1440 px**. À chaque largeur :

```js
document.documentElement.scrollWidth <= window.innerWidth
```

doit être vrai. Vérifier aussi l'ouverture du menu mobile, la lisibilité des tableaux et l'absence de texte coupé.

## 12. Contrôles avant commit

```bash
node scripts/build-header.js --check
node scripts/build-breadcrumbs.js --check
node scripts/check-mobile-nav.js
```

Attention : ces contrôles ne vérifient que les pages inscrites dans les manifestes. Une page absente des manifestes n'est **pas** contrôlée : vérifier manuellement qu'elle y figure.

## 13. Git

- Jamais `git add -A` ni `git add .` (bruit CRLF sur la copie Windows).
- Commits ciblés : `git add <fichiers précis>`.
- Ne jamais ajouter automatiquement les fichiers non suivis.
- Rapport avant commit : fichiers modifiés, contrôles lancés et résultats, largeurs testées, écarts assumés → validation de Medy → commit.

## 14. Conformité (rappel)

Les règles MIF2 de `CLAUDE.md` s'appliquent à tout texte : jamais « indépendant », « gratuit », « offert », « sans engagement », « meilleur produit », « sans conflit d'intérêt ». Ne pas réécrire les contenus commerciaux existants à l'occasion d'une modification technique.
