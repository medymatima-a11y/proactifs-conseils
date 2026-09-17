# NAV-UX-1B — Généralisation des breadcrumbs aux 49 pages

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `menu-1.5-centralisation-header`
**Prérequis :** NAV-UX-0 validé, NAV-UX-1A validé (moteur).
**Nature :** extension du système centralisé à **toutes** les pages CENTRALIZED + suppression du CSS breadcrumb legacy. Header figé. Aucune production.

---

## 1. Résultat en une ligne

Les **48** pages CENTRALIZED (hors accueil) ont désormais un fil d'Ariane **généré** (`<nav><ol>` accessible) **et** son `BreadcrumbList` JSON-LD, depuis une **source unique**. Le CSS breadcrumb inline legacy a été **entièrement supprimé** : une seule source de style (`assets/css/breadcrumb.css`).

## 2. Architecture (inchangée depuis 1A)

`scripts/breadcrumb-pages.json` → `scripts/build-breadcrumbs.js` → HTML visible + JSON-LD, stylés par `assets/css/breadcrumb.css`. Moteur non reconstruit ; **seul le `--check` a été renforcé** (validations, jamais de masquage).

## 3. Périmètre

- `scripts/breadcrumb-pages.json` : **7 → 48** pages (index.html volontairement absent = accueil sans breadcrumb).
- Couverture vérifiée : les 48 pages de `nav-pages.json` hors `index.html` sont configurées ; aucune page non autorisée ; aucun doublon.

## 4. Hiérarchies finales (destinations réelles uniquement)

| Univers | Breadcrumb | Parent réel |
|---|---|---|
| Accueil (`/`) | *(aucun)* | — |
| Patrimoine (8 services) | `Accueil › <Service>` | `/` (pas de hub `/patrimoine`) |
| RSU annexe | `Accueil › Fiscalité RSU, stock-options & BSPCE › Déclaration RSU, ESPP` | `/fiscalite-rsu-stock-options` |
| Immobilier hub | `Accueil › Immobilier` | `/` |
| Immobilier (6 enfants) | `Accueil › Immobilier › <Page>` | `/immobilier` |
| Cabinet | `Accueil › Le cabinet` | `/` |
| Local — Colombes (pilier) | `Accueil › Conseiller patrimoine Colombes` | `/` |
| Local — 4 villes | `Accueil › Conseiller patrimoine Colombes › <Ville>` | `/conseiller-patrimoine-colombes` |
| Blog index | `Accueil › Blog` | `/` |
| Blog (25 articles) | `Accueil › Blog › <Article>` | `/blog` |

Aucune destination fictive (`/patrimoine`, `/ressources`, `/nos-services`, `/credit`, `/simulateurs`) introduite. `courtage-credit-immobilier` reste sous Immobilier (pas d'anticipation Crédit V2).

## 5. Incohérences NAV-UX-0 corrigées

- `placements-financiers` : libellé terminal `Optimisation fiscale` → **`Placements financiers`**.
- `blog/per-vs-assurance-vie-2026` et `blog/reduire-impots-2026` : crumb « Blog » `→ /` → **`/blog`**.
- (`blog/lmnp-2026` déjà corrigé en 1A ; `declaration-rsu-espp-france` malformé déjà reconstruit en 1A.)

## 6. CSS legacy supprimé

**179 règles** CSS inline retirées sur les 48 pages : `.breadcrumb`, `.breadcrumb a`, `.breadcrumb a:hover`, overrides `@media`, et pour les 5 pages locales `.breadcrumb-bar` (+ `small`, `a`, `a:hover`, media). Retrait ciblé (sélecteurs exacts, corps sans accolade imbriquée), **aucune autre règle touchée**. Vérifié : **0 sélecteur `.breadcrumb`/`.breadcrumb-bar` restant** dans les `<style>`. La présentation ne dépend plus que de `assets/css/breadcrumb.css`.

## 7. BreadcrumbList legacy supprimés

L'ancien `BreadcrumbList` manuel de `estimation-colombes`/`succession-colombes` est régénéré à l'identique dans les marqueurs. Vérifié : **exactement 1 `BreadcrumbList` par page**, 0 doublon manuel résiduel.

## 8. Idempotence

2ᵉ passe de `build-breadcrumbs.js` : **0 page réécrite**.

## 9. `build-breadcrumbs.js --check`

**✓ 48/48 pages conformes, 0 anomalie.** Le check vérifie désormais : couverture des 48 pages, page non autorisée, doublon, fichier existant, URL/parent réels, breadcrumb visible conforme, JSON-LD conforme, labels visible↔JSON-LD, CSS chargé, **résidu legacy** (élément `.breadcrumb`/`.breadcrumb-bar`, commentaire), **BreadcrumbList unique**.

## 10. `build-header.js --check`

**Exit 0** — 49 pages header « à jour », header inchangé.

## 11. `check-mobile-nav.js`

**✓ 63 pages scannées, aucune régression mobile.**

## 12. Résultat desktop (1024 / 1440 / 1920)

Échantillon élargi (17 pages) rendu headless réel — **119 contrôles page×largeur, 0 anomalie** : `<nav aria-label="Fil d'Ariane">` + `<ol>`, fond sable `rgb(243,241,235)`, `top=72` (sous le header), `padding 12px 40px`, `13px`, liens teal `rgb(30,122,110)`, crumb courant slate `rgb(107,114,128)`.

## 13. Résultat mobile (320 / 375 / 390 / 430)

Mêmes 119 contrôles : `padding 12px 20px`, `12px`, wrap naturel conservé (2–3 lignes sur libellés longs), **overflow propre au breadcrumb = 0** partout. Pas de `nowrap`/`ellipsis`/scroll horizontal ajouté.

## 14. Overflows préexistants

Les débordements horizontaux de page à 320px déjà relevés (tableaux comparatifs, cartes `.solution-card` sur certains articles/pages) sont **préexistants** et **hors périmètre** : le breadcrumb lui-même ne déborde jamais (`scrollWidth == clientWidth`).

## 15. Aucun bouton Retour

Aucun bouton/lien « Retour », aucun `← Immobilier` / `← Blog` / `← Colombes` / `← Fiscalité RSU`. Le breadcrumb est la seule navigation secondaire.

## 16. Aucun `history.back`

**0** occurrence de `history.back()` / `window.history.back()` / `history.go(-1)` sur l'ensemble des pages.

## 17. Aucune destination fictive

Vérifié programmatiquement : **0** URL de parent absente de `nav-pages.json`.

## 18. SEO hors breadcrumb inchangé

Comparaison avant/après sur les 48 pages : `<title>`, `meta description`, `canonical`, Open Graph, `<h1>`, `<h2>`, marqueurs `NAV:START/END` — **comptes et valeurs identiques**. Seuls breadcrumb visible + `BreadcrumbList` + CSS legacy ont changé. Sitemap, robots, URL, contenu éditorial : intacts.

## 19. Fichiers modifiés

- `scripts/breadcrumb-pages.json` (7 → 48).
- `scripts/build-breadcrumbs.js` (validations `--check` renforcées).
- **48 pages HTML** CENTRALIZED (breadcrumb + JSON-LD + lien CSS + retrait CSS legacy).
- `docs/NAV-UX-1B-BREADCRUMBS.md` (ce doc) + section ajoutée à `docs/NAVIGATION-PROACTIFS.md`.
- (`assets/css/breadcrumb.css` et `docs/NAV-UX-1A-BREADCRUMBS.md` : issus de 1A, non encore committés — inclus dans ce commit.)

Non modifiés : `partials/header.html`, `navigation*.css`, `navigation.js`, `build-header.js`, `nav-pages.json` (lu seulement), sitemap, `vercel.json`, API.

## 20. Inventaire final

| Indicateur | Valeur |
|---|---|
| Pages CENTRALIZED | 49 |
| Accueil sans breadcrumb | oui (index.html) |
| Pages avec breadcrumb visible | **48** |
| BreadcrumbList JSON-LD | **48** |
| Breadcrumb visible sans JSON-LD | 0 |
| JSON-LD sans breadcrumb | 0 |
| Breadcrumb legacy (élément) | 0 |
| BreadcrumbList manuel résiduel | 0 |
| Incohérence parent | 0 |
| Destination fictive | 0 |
| `history.back` | 0 |

## 21. Accessibilité

Modèle 1A conservé partout : `<nav class="breadcrumb" aria-label="Fil d'Ariane"><ol>…<li><span aria-current="page">…</span></li></ol></nav>`. Plus aucun `<div class="breadcrumb">` legacy.

## 22. Note commit

Le commit NAV-UX-1A n'ayant pas été poussé, ce commit **NAV-UX-1B** porte l'ensemble du travail breadcrumbs (moteur 1A + généralisation 1B). Les deux scripts jetables `scripts/gen-breadcrumb-config.cjs` et `scripts/clean-breadcrumb-css.cjs` (helpers de migration one-shot) sont laissés **non suivis** (non committés) — à supprimer librement.

---

**STOP.** NAV-UX-1B terminé. MENU-5 / Crédit V2 / Simulateurs V2 non démarrés. Aucun merge `main`, aucune production. En attente de validation.
