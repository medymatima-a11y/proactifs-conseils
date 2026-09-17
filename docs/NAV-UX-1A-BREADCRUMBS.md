# NAV-UX-1A — Centralisation des breadcrumbs (moteur + prototype)

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `menu-1.5-centralisation-header`
**Source :** `docs/NAV-UX-0-AUDIT.md` (validé)
**Nature :** construction du moteur de breadcrumbs centralisé + prototype sur **7 pages**. Les 49 pages **ne sont pas** migrées (ce sera NAV-UX-1B).

---

## 1. Architecture retenue

Système de breadcrumbs **généré depuis une source de vérité unique**, totalement **indépendant du header** :

```
scripts/breadcrumb-pages.json   (config : 1 entrée par page)
            │
            ▼
scripts/build-breadcrumbs.js     (générateur + validateur --check)
            │
   ┌────────┴─────────┐
   ▼                  ▼
Fil d'Ariane HTML     BreadcrumbList JSON-LD
(<nav><ol>, visible)  (<head>)
   │                  │
   └── style ─────────┘
   assets/css/breadcrumb.css  (1 règle centrale)
```

Le HTML visible **et** le JSON-LD sont produits à partir de la **même** configuration : ils ne peuvent plus diverger.

## 2. Pourquoi une config séparée (`breadcrumb-pages.json`) plutôt que d'enrichir `nav-pages.json`

- `nav-pages.json` pilote un système **stabilisé et figé** (header MENU-2B/3.1 via `build-header.js`). Y ajouter la logique breadcrumb (parents, labels, trails) le complexifierait et risquerait des régressions sur un système validé.
- Les deux systèmes ont des cycles de vie différents : le header change rarement, les breadcrumbs évolueront page par page en 1B.
- Séparation des responsabilités : `build-header.js` ne connaît pas les breadcrumbs, `build-breadcrumbs.js` ne touche jamais le header.
- `build-breadcrumbs.js` **lit** `nav-pages.json` en lecture seule, uniquement pour **valider** que chaque URL parente existe réellement (pas de destination fictive).

→ Conforme à la préférence exprimée : config séparée, header non complexifié.

## 3. Fichiers créés

| Fichier | Rôle |
|---|---|
| `scripts/breadcrumb-pages.json` | Source de vérité : `file`, `url`, `label`, `trail[]` (ancêtres). 7 pages en 1A. |
| `scripts/build-breadcrumbs.js` | Générateur (seed + fill, idempotent) + mode `--check`. |
| `assets/css/breadcrumb.css` | CSS partagé unique (fond sable, position, typo, responsive, reset liste). |
| `docs/NAV-UX-1A-BREADCRUMBS.md` | Ce document. |

## 4. Fichiers modifiés (7 pages prototypes)

`bilan-patrimonial.html`, `immobilier/estimation-colombes.html`, `investissement-immobilier.html`, `blog/lmnp-2026.html`, `conseiller-patrimoine-asnieres.html`, `declaration-rsu-espp-france.html`, `blog/index.html`.

**Aucun autre fichier touché.** Header, `nav-pages.json`, `build-header.js`, `navigation*.css`, `navigation.js`, sitemap, `vercel.json`, API : **0 modification**.

## 5. Format de configuration

```json
{
  "domain": "https://proactifsconseils.fr",
  "pages": [
    {
      "file": "immobilier/estimation-colombes.html",
      "url": "/immobilier/estimation-colombes",
      "label": "Estimation immobilière Colombes",
      "trail": [
        { "label": "Accueil", "url": "/" },
        { "label": "Immobilier", "url": "/immobilier" }
      ]
    }
  ]
}
```

- `trail` = les **ancêtres** (Accueil en premier). `label`/`url` = la page elle-même (crumb terminal, non cliquable).
- Le crumb terminal reçoit `aria-current="page"`.
- Toute `url` de `trail` doit exister dans `nav-pages.json` (validé par `--check`).

## 6. Fonctionnement du générateur

`node scripts/build-breadcrumbs.js` :

1. **Lien CSS** : ajoute `<link rel="stylesheet" href="/assets/css/breadcrumb.css">` après le lien `navigation*.css` (si absent).
2. **Seed** (1ʳᵉ passe sur une page) : retire l'ancien breadcrumb legacy — `<div class="breadcrumb">`, `<div class="breadcrumb-bar">…</div></div>`, commentaire `<!-- BREADCRUMB -->`, et tout `<script>` `BreadcrumbList` hors marqueurs — puis insère les marqueurs (visible après `<!-- NAV:END -->`, JSON-LD avant `</head>`).
3. **Fill** (toutes passes) : régénère le contenu entre marqueurs depuis la config.
4. **Garde-fous** : abandon si les marqueurs `NAV:START/END` sont altérés, ou si un breadcrumb / BreadcrumbList se retrouve en double.
5. **Idempotent** : une 2ᵉ exécution ne réécrit rien (vérifié : « 0 page écrite »).

## 7. Fonctionnement de `--check`

`node scripts/build-breadcrumbs.js --check` (exit 1 si anomalie) détecte :

- page configurée absente du disque ;
- breadcrumb visible manquant (marqueurs absents) ;
- breadcrumb visible différent de la config ;
- BreadcrumbList JSON-LD absent ;
- JSON-LD incohérent avec la config ;
- labels visibles ≠ labels JSON-LD (ordre/texte) ;
- lien CSS manquant ;
- URL parente invalide (malformée) ;
- parent inexistant (absent de `nav-pages.json`) ;
- doublon de configuration (`file` ou `url`).

Résultat 1A : **7/7 conformes, 0 anomalie**.

## 8. CSS centralisé

`assets/css/breadcrumb.css` reproduit **à l'identique** l'ancien style inline et ajoute le reset de liste :

- `background: var(--sand,#F3F1EB)`, `padding: 12px 40px`, `font-size: 13px`, `color: var(--slate,#6B7280)`, `margin-top: 72px` ;
- `ol` : `list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap` (conserve le **wrap naturel**) ;
- séparateur `›` via `li + li::before` (plus dans le HTML) ;
- liens `var(--teal,#1E7A6E)`, hover `var(--gold,#C4973A)`, `:focus-visible` visible ;
- `@media (max-width:600px)` : `padding: 12px 20px; font-size: 12px`.

Variables réutilisées depuis le `:root` de chaque page, **avec valeurs de repli** (thème-safe gold **et** corail). Les anciennes règles `.breadcrumb` / `.breadcrumb-bar` inline restent dans les pages mais sont **surchargées** par le CSS externe (chargé après) — nettoyage prévu en 1B (voir §Limitations).

## 9. Structure HTML accessible

Avant : `<div class="breadcrumb">…</div>` (ou `<div class="breadcrumb-bar">` pour le local).
Après :

```html
<!-- BREADCRUMB:START -->
  <nav class="breadcrumb" aria-label="Fil d'Ariane">
    <ol>
      <li><a href="/">Accueil</a></li>
      <li><a href="/immobilier">Immobilier</a></li>
      <li><span aria-current="page">Estimation immobilière Colombes</span></li>
    </ol>
  </nav>
  <!-- BREADCRUMB:END -->
```

`<nav aria-label>` + liste ordonnée + `aria-current="page"` : sémantique et lecteurs d'écran améliorés, rendu visuel **inchangé**.

## 10. Génération JSON-LD

Bloc `BreadcrumbList` placé en `<head>`, entre `<!-- BREADCRUMB_JSONLD:START/END -->`, URLs **absolues** (`https://proactifsconseils.fr…`), positions 1..n, item terminal inclus. Exemple généré pour Estimation — **identique** au JSON-LD manuel préexistant (aucune dégradation) :

```json
{ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"Accueil","item":"https://proactifsconseils.fr/"},
  {"@type":"ListItem","position":2,"name":"Immobilier","item":"https://proactifsconseils.fr/immobilier"},
  {"@type":"ListItem","position":3,"name":"Estimation immobilière Colombes","item":"https://proactifsconseils.fr/immobilier/estimation-colombes"}
]}
```

## 11. Pages prototypes (7)

| Page | Modèle testé |
|---|---|
| `/bilan-patrimonial` | Patrimoine plat (`Accueil › Service`) |
| `/immobilier/estimation-colombes` | Immobilier existant (modèle A) — à préserver |
| `/investissement-immobilier` | Immobilier racine re-parenté sous `/immobilier` |
| `/blog/lmnp-2026` | Blog + correction du lien « Blog » (→ `/blog`) |
| `/conseiller-patrimoine-asnieres` | Local (parent `/conseiller-patrimoine-colombes`) |
| `/declaration-rsu-espp-france` | RSU imbriqué — correction du breadcrumb malformé |
| `/blog` (index) | Ajout d'un breadcrumb (absent auparavant) |

## 12. Avant / après

| Page | Avant | Après (visible) |
|---|---|---|
| bilan-patrimonial | `Accueil › Bilan patrimonial` (div) | `Accueil › Bilan patrimonial` (nav+ol+JSON-LD) |
| estimation-colombes | `Accueil › Immobilier › Estimation…` (div + JSON-LD manuel) | idem, nav+ol, JSON-LD régénéré **identique** |
| investissement-immobilier | `Accueil › Investissement immobilier` (plat) | `Accueil › Immobilier › Investissement immobilier` (+JSON-LD) |
| blog/lmnp-2026 | `Accueil › Blog › LMNP…` — **« Blog » pointait vers `/`** | `Accueil › Blog › LMNP en 2026` — **« Blog » → `/blog`** (+JSON-LD) |
| conseiller-patrimoine-asnieres | `.breadcrumb-bar` : `Accueil › Conseiller Patrimoine › Asnières-sur-Seine` | `Accueil › Conseiller patrimoine Colombes › Asnières-sur-Seine` (nav+ol+JSON-LD) |
| declaration-rsu-espp-france | **malformé** : `Accueil › Optimisation fiscale Déclarer mes impôts Optimiser mes RSU › Déclaration RSU…` | `Accueil › Fiscalité RSU, stock-options & BSPCE › Déclaration RSU, ESPP` (+JSON-LD) |
| blog/index | *(aucun breadcrumb)* | `Accueil › Blog` (+JSON-LD) |

## 13. Confirmation — aucun bouton Retour

Aucun bouton/lien « Retour » ajouté. Le breadcrumb est la seule navigation parente. Aucun lien `← Retour` créé.

## 14. Confirmation — aucun `history.back()`

Zéro `history.back()` / `window.history.back()` / `javascript:history.back()` introduit. Tous les parents sont des `href` fixes déterministes.

## 15. Résultat desktop (1024 / 1440 / 1920 — rendu headless réel)

Sur les 7 pages : `<nav aria-label>` présent, fond `rgb(243,241,235)` (sable), `margin-top:72px` (bandeau collé sous le header, `top=72`), `padding:12px 40px`, `font-size:13px`, liens `rgb(30,122,110)` (teal), crumb courant `rgb(107,114,128)` (slate). **Aucun débordement horizontal introduit** par le breadcrumb. Hero non déplacé.

## 16. Résultat mobile (320 / 375 / 390 / 430 — rendu headless réel)

- `padding:12px 20px`, `font-size:12px` (media query `≤600px`), fond sable, `top=72`.
- **Wrap naturel** conservé : les libellés longs passent sur 2 lignes (ex. asnieres, estimation, investissement à 320px) — accepté pour V1.
- **Overflow horizontal propre au breadcrumb = 0** à toutes largeurs (mesuré : `scrollWidth == clientWidth`).
- Les débordements de page observés à 320px (`investissement` 16px, `lmnp` 99px, `rsu` 611px) proviennent de **contenus préexistants** (tableaux comparatifs, cartes `.solution-card`) — **hors périmètre**, non introduits par NAV-UX-1A.

## 17. `node scripts/build-header.js --check`

**Exit 0** — 49 pages « à jour », header inchangé.

## 18. `node scripts/check-mobile-nav.js`

**✓ 63 pages scannées, aucune régression mobile détectée.**

## 19. `node scripts/build-breadcrumbs.js --check`

**✓ 7/7 pages conformes, 0 anomalie.** Idempotence vérifiée (2ᵉ passe : 0 page réécrite).

## 20. Confirmation SEO (hors breadcrumb) inchangé

Sur les 7 pages, comptes et valeurs **identiques** avant/après : `<title>`, `meta description`, `canonical`, Open Graph, `<h1>`, `<h2>`, marqueurs `NAV:START/END`. Seuls le breadcrumb visible et le `BreadcrumbList` ont changé. Aucun contenu éditorial, URL, sitemap ni robots touché.

## 21. git diff (résumé)

- **Nouveaux** : `scripts/breadcrumb-pages.json`, `scripts/build-breadcrumbs.js`, `assets/css/breadcrumb.css`, `docs/NAV-UX-1A-BREADCRUMBS.md`.
- **Modifiés** : 7 pages HTML (breadcrumb + lien CSS + JSON-LD uniquement).
- **Inchangés** : header, `nav-pages.json`, `build-header.js`, `navigation*.css`, `navigation.js`, sitemap, `vercel.json`, API, et les 42 autres pages centralisées.

## 22–23. Commit / Push

Commit `NAV-UX-1A : centralisation breadcrumbs prototype` sur `menu-1.5-centralisation-header`. Push depuis PowerShell (voir conversation) si le verrou `.git/index.lock` bloque l'environnement.

## 24. Confirmation — aucune production

Aucun merge `main`, aucun déploiement production. Branche preview uniquement.

---

## Limitations & procédure de migration 1B

**Limitations 1A :**
- Les anciennes règles CSS inline `.breadcrumb` / `.breadcrumb-bar` subsistent dans les pages (surchargées, inoffensives). Nettoyage à faire en 1B.
- Seules 7 pages sont configurées.

**Procédure NAV-UX-1B (à valider) :**
1. Compléter `breadcrumb-pages.json` avec les 42 pages restantes (parents = destinations réelles, cf. tableau §15 de NAV-UX-0).
2. `node scripts/build-breadcrumbs.js` (seed + fill sur toutes).
3. `--check` vert + `build-header --check` + `check-mobile-nav` verts.
4. Corriger les incohérences restantes de l'audit (`placements-financiers` : libellé ; 2 autres blogs `→/blog`).
5. (Optionnel) Retirer les règles CSS inline `.breadcrumb`/`.breadcrumb-bar` devenues inutiles.
6. Contrôles visuels desktop/mobile sur un échantillon élargi.
7. Commit `NAV-UX-1B` + push preview.

**STOP.** NAV-UX-1B non démarré. Crédit V2 / Simulateurs V2 non démarrés. En attente de validation.
