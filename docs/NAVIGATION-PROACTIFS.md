# Navigation centralisée — Proactifs Conseils

_Phase MENU-1.5 (16/09/2026) — centralisation technique du header avant la refonte du menu (MENU-2)._

Ce document décrit l'architecture qui permet de modifier le header (nav desktop + menu mobile) **à un seul endroit** au lieu de le dupliquer dans chaque page HTML. Il ne documente **aucun changement visuel** : le rendu de `index.html`, `immobilier.html`, `immobilier/succession-colombes.html` et `immobilier/estimation-colombes.html` est strictement identique à avant le 16/09/2026.

Contexte : l'audit MENU-1 (voir `phase-menu-1-audit-header-nav-20260915.md`) a montré que le header était dupliqué dans les ~51 pages du site, chacune avec sa propre copie du HTML/CSS/JS de nav. Avant de construire le futur mega-menu (MENU-2), il fallait une source unique — sans migrer vers un framework, le site restant du HTML statique servi tel quel par Vercel (pas de build step).

## 1. Le site reste du HTML statique simple

Il n'y a **pas** de serveur de templating, pas de React/Next.js, pas d'étape de build automatique sur Vercel. Vercel continue de servir chaque fichier `.html` du repo tel quel.

La centralisation fonctionne autrement : chaque page migrée contient toujours son propre `<nav>…</nav>` et son `<div class="mobile-menu">…</div>` en dur dans le HTML (Vercel n'a rien à interpréter), mais ce bloc est **généré une fois, à l'avance, par un script Node** (`scripts/build-header.js`) à partir d'un gabarit unique (`partials/header.html`). Le script s'exécute sur la machine de développement (ou en CI plus tard si besoin), jamais côté serveur au moment de la requête.

Concrètement :
- On édite `partials/header.html` (le gabarit).
- On lance `node scripts/build-header.js`.
- Le script réécrit, dans chaque page listée dans `scripts/nav-pages.json`, le bloc de HTML compris entre deux marqueurs (`<!-- NAV:START -->` / `<!-- NAV:END -->`) — et seulement ce bloc.
- On commit les pages regénérées comme n'importe quel fichier HTML normal.

C'est l'équivalent statique d'un « include », sans dépendance ni build step obligatoire au déploiement.

## 2. Fichiers créés

```
partials/header.html                    gabarit unique du <nav> + menu mobile
assets/css/navigation.css                thème "site patrimoine" (gold) — index.html et pages hors univers Immobilier
assets/css/navigation-immobilier.css     thème "Proactifs Immobilier" (coral) — succession-colombes, estimation-colombes
assets/js/navigation.js                  comportement partagé : scroll (#nav.scrolled), hamburger, fermeture du menu mobile au clic sur un lien
scripts/build-header.js                  régénère les pages du manifeste à partir du gabarit (idempotent, mode --check)
scripts/migrate-header.js                script de migration ponctuel (déjà exécuté sur les 4 pages prototypes — voir section 7, pas destiné à être relancé tel quel)
scripts/nav-pages.json                   manifeste des pages centralisées
docs/NAVIGATION-PROACTIFS.md             ce document
```

### Pourquoi deux fichiers CSS (et un cas particulier) ?

L'audit a révélé que le site contient déjà, avant toute centralisation, **deux systèmes de nav visuellement différents et volontaires** :

- Un thème **« gold / site patrimoine »** (index.html et, a priori, la majorité des ~47 autres pages hors Immobilier) : dropdown "Nos services" avec sections, CTA doré, logo 48px.
- Un thème **« coral / Proactifs Immobilier »** (immobilier.html, succession-colombes.html, estimation-colombes.html), explicitement commenté dans le code comme un accent de marque distinct pour l'univers Immobilier.

En creusant, `immobilier.html` s'est révélée être une **variante légèrement différente** du coral utilisé par `succession-colombes.html` / `estimation-colombes.html` (qui, eux, sont strictement identiques entre eux) : logo 40px vs 48px, état actif en `class="active"` vs `aria-current="page"`, présence/absence de `z-index` et `line-height` sur certaines règles. Ce ne sont pas des bugs — juste un drift qui existait déjà avant MENU-1.5.

Pour respecter la contrainte « aucun changement visuel à ce stade », l'architecture retenue est donc :

- `assets/css/navigation.css` → thème gold, utilisé par `index.html`.
- `assets/css/navigation-immobilier.css` → thème coral « v2 », utilisé par `succession-colombes.html` et `estimation-colombes.html`.
- `immobilier.html` → **CSS de nav volontairement laissée inline, non centralisée à ce stade.** La forcer sur `navigation-immobilier.css` aurait changé son rendu réel (logo, état actif). Seuls son HTML et son JS sont centralisés (voir section 6). Un futur MENU-2 pourra trancher s'il faut unifier ce drift visuellement — ce n'est pas un choix à faire silencieusement pendant une phase « zéro changement visuel ».

## 3. Comment fonctionne le build (`scripts/build-header.js`)

1. Charge le gabarit `partials/header.html`.
2. Charge la liste des pages à traiter dans `scripts/nav-pages.json`.
3. Pour chaque page : lit le commentaire `<!-- NAV:CONFIG {...} -->` présent juste avant le bloc de nav (un JSON par page, voir section 4), puis rend le gabarit avec cette config (remplacement de tokens `{{TOKEN}}` + blocs conditionnels `<!--IF:clé-->…<!--ENDIF:clé-->`).
4. Remplace uniquement le contenu entre `<!-- NAV:START -->` et `<!-- NAV:END -->` par le résultat. Rien d'autre dans la page n'est touché (CSS, contenu, autres scripts).
5. N'écrit le fichier que si le résultat diffère (pas de commit bruit inutile).

Deux modes :
- `node scripts/build-header.js` — régénère et écrit.
- `node scripts/build-header.js --check` — vérifie sans écrire, code de sortie 1 si une page est désynchronisée du gabarit (utile avant un déploiement, ou en CI plus tard).

Le script est **idempotent** : le relancer sans avoir touché ni au gabarit ni à la config d'une page ne modifie aucun fichier (vérifié sur les 4 pages prototypes).

## 4. Gestion des CTA contextuels et de l'état actif

Chaque page garde son propre CTA, ses propres liens actifs et ses propres éléments visibles/masqués via un commentaire JSON placé juste avant son bloc `NAV:START`, par exemple (succession-colombes.html) :

```html
<!-- NAV:CONFIG {"theme":"immobilier","tokens":{"HOME_PREFIX":"/","IMMOBILIER_ACTIVE_DESKTOP":" class=\"active\"","IMMOBILIER_ACTIVE_MOBILE":"","CTA_HREF":"#diagnostic","CTA_LABEL":"Demander mon Diagnostic Succession 360","MOBILE_CTA_HREF":"#diagnostic","MOBILE_CTA_LABEL":"Demander mon Diagnostic Succession 360"},"items":{"temoignages":false}} -->
```

Tokens disponibles (tous ont une valeur par défaut dans `build-header.js`, donc une page peut n'en surcharger que quelques-uns) :

| Token | Rôle | Défaut |
|---|---|---|
| `HOME_PREFIX` | préfixe des liens d'ancre (`#services`, `#contact`…) — `''` sur la page d'accueil, `/` ailleurs | `''` |
| `IMMOBILIER_ACTIVE_DESKTOP` / `IMMOBILIER_ACTIVE_MOBILE` | attribut inséré sur le lien "Immobilier" (` class="active"` ou ` aria-current="page"`, selon la page) | `''` |
| `CABINET_ACTIVE_DESKTOP` / `CABINET_ACTIVE_MOBILE` | idem pour "Le cabinet" (prêt pour une future page qui en aurait besoin) | `''` |
| `CTA_HREF`, `CTA_LABEL`, `CTA_EXTRA` | CTA desktop (`CTA_EXTRA` pour un attribut supplémentaire, ex. `data-track="…"`) | `/bilan-patrimonial`, `Prendre rendez-vous`, `''` |
| `MOBILE_CTA_HREF`, `MOBILE_CTA_LABEL` | CTA du menu mobile — **indépendant** du CTA desktop (certaines pages ont un CTA mobile différent du CTA desktop, d'autres non — reproduit tel quel, pas uniformisé) | `/bilan-patrimonial`, `Prendre rendez-vous` |

Bloc conditionnel disponible : `items.temoignages` (true/false) — inclut ou non le lien "Témoignages" dans le menu (présent sur `immobilier.html`, absent sur les pages succession/estimation, reproduisant leur état actuel).

### Préparation pour un futur état actif "Patrimoine" / "Ressources"

Le mécanisme de tokens (`{{XXX_ACTIVE_DESKTOP}}` / `{{XXX_ACTIVE_MOBILE}}`) est générique : ajouter un état actif "Patrimoine" ou "Ressources" pour MENU-2 consistera à ajouter les tokens correspondants dans `partials/header.html` (sur les bons `<li>`/`<a>`), les déclarer dans `DEFAULT_TOKENS` de `build-header.js`, puis les renseigner dans le `NAV:CONFIG` des pages concernées. Aucune page n'utilise ce mécanisme pour "Patrimoine"/"Ressources" à ce stade — seul "Immobilier" (et "Le cabinet", prêt mais inutilisé) en bénéficie aujourd'hui.

## 5. Exclusions (pages qui ne passent PAS par cette centralisation)

- **`pret-immobilier-index.html`** : écosystème séparé avec sa propre navigation (sous-domaine fonctionnel distinct). Ne sera pas ajouté à `scripts/nav-pages.json` sans décision explicite.
- **Pages de capture / landing / remerciement / lead magnets** (ex. `merci-guide.html`, `merci-avis.html`, pages de `Lead magnets/`) : elles n'utilisent volontairement pas le header principal (nav minimale ou absente, pour ne pas distraire de la conversion). Elles restent hors du manifeste.

Ces exclusions sont también reflétées dans le check `SKIP_NO_MENU` de `scripts/check-mobile-nav.js` pour les pages qui n'ont pas de menu mobile du tout.

## 6. Pages prototypes migrées (état au 16/09/2026)

| Page | CSS nav | HTML nav | JS nav |
|---|---|---|---|
| `index.html` | centralisé → `assets/css/navigation.css` | centralisé (gabarit) | centralisé → `assets/js/navigation.js` |
| `immobilier.html` | **laissée inline** (variante propre, voir section 2) | centralisé (gabarit) | centralisé → `assets/js/navigation.js` |
| `immobilier/succession-colombes.html` | centralisé → `assets/css/navigation-immobilier.css` | centralisé (gabarit) | centralisé → `assets/js/navigation.js` |
| `immobilier/estimation-colombes.html` | centralisé → `assets/css/navigation-immobilier.css` | centralisé (gabarit) | centralisé → `assets/js/navigation.js` |

Ces 4 pages sont listées dans `scripts/nav-pages.json`. **Aucune autre page n'a été touchée.**

## 7. Migrer une page supplémentaire (procédure)

`scripts/migrate-header.js` est un script de **migration ponctuelle**, écrit spécifiquement pour les 4 pages prototypes (chacune avait des différences d'indentation/de structure qu'il fallait traiter au cas par cas). Il ne faut **pas** le relancer tel quel sur une nouvelle page : il lèvera une erreur explicite (`attendu 1 occurrence, trouvé 0`) si le motif attendu ne correspond pas exactement, ce qui est voulu — mieux vaut un échec net qu'une page corrompue.

Pour migrer une page supplémentaire, reproduire manuellement le même schéma (en s'inspirant du code de `migrate-header.js` comme référence, pas en le réexécutant) :

1. **Repérer le bloc de nav** dans la page : de `<nav id="nav">` jusqu'à la fermeture du `<div class="mobile-menu" id="mobileMenu">` qui suit.
2. **Déterminer la config** de la page (thème CSS à utiliser, CTA desktop/mobile, état actif, `items.temoignages`) en observant le HTML existant.
3. **Remplacer ce bloc** par :
   ```html
   <!-- NAV:CONFIG {…json de la page…} -->
   <!-- NAV:START (bloc généré par scripts/build-header.js — ne pas éditer à la main, voir docs/NAVIGATION-PROACTIFS.md) -->
   <!-- NAV:END -->
   ```
4. **Si la page utilise un thème CSS déjà centralisé** (gold ou coral v2) : supprimer son bloc CSS de nav inline (`#nav { … } … .mobile-menu a:hover { … }`) et ajouter `<link rel="stylesheet" href="/assets/css/navigation.css">` (ou `navigation-immobilier.css`) avant `</head>`. **Si son CSS diverge** (comme `immobilier.html`) : le laisser inline et documenter l'écart ici plutôt que de forcer une uniformisation silencieuse.
5. **Remplacer le JS inline** de scroll/hamburger/fermeture-au-clic par `<script src="/assets/js/navigation.js" defer></script>`, en gardant à part tout JS *page-spécifique* qui partageait le même `<script>` (ex. le bouton "retour en haut" `#scrollTop`, qui reste toujours propre à chaque page).
6. **Ajouter la page** à `scripts/nav-pages.json`.
7. **Lancer** `node scripts/build-header.js` puis vérifier avec `git diff` que le seul changement est le bloc de nav (aucune autre partie de la page ne doit bouger).
8. **Lancer** `node scripts/check-mobile-nav.js` pour confirmer l'absence de régression, et relire la page dans un navigateur (desktop + mobile + clavier) avant de commit.

## 8. Tests effectués sur les 4 pages prototypes

- **`node scripts/build-header.js`** : régénération réussie des 4 pages (`[régénéré]` au premier passage).
- **`node scripts/build-header.js --check`** : `[à jour]` sur les 4 pages — confirme l'idempotence (relancer sans rien changer ne modifie aucun fichier).
- **`git diff` (revue manuelle, fichier par fichier)** des 4 pages : dans chaque cas, seul le bloc de nav (CSS pointeur + `<link>`, HTML remplacé par les marqueurs, JS réduit au script partagé) a changé ; le reste de la page (contenu, styles, autres scripts) est strictement inchangé. Les seules différences de formatage HTML observées (balises `<a class="nav-logo">`/`.hamburger` reformatées sur une ligne) sont **sans effet visuel** : ces éléments sont en `display:flex` dans les deux thèmes CSS, qui ignorent les nœuds de texte blancs comme éléments flex.
- **`node scripts/check-mobile-nav.js`** (adapté — voir ci-dessous) : 0 problème sur les 4 pages prototypes. Les 2 pages déjà en défaut avant MENU-1.5 (`Lead magnets/blog-per-vs-assurance-vie-2026.html`, `blog/donation-vivant-vs-testament-strategie-transmission.html`, connues depuis l'audit du 13/09/2026) restent en défaut — non touchées, hors périmètre.
- **Chemins d'assets** : les 4 pages référencent `/assets/css/…` et `/assets/js/…` en chemin absolu (préfixé `/`), exactement comme le reste des assets du site (`/images/…`) — donc résolution identique depuis la racine et depuis `/immobilier/`. Vérifié par grep sur les 4 fichiers : aucune référence relative (`../assets` ou `assets/` sans slash).
- **Dropdown clavier** : `.nav-dropdown:hover, .nav-dropdown:focus-within` inchangé dans les deux CSS extraits — comportement clavier identique à avant.
- **Fermeture du menu mobile au clic sur un lien** : logique reprise à l'identique dans `assets/js/navigation.js`, partagée par les 4 pages.
- Ce qui n'a **pas** pu être testé depuis cet environnement : rendu visuel réel dans un navigateur (pas de serveur HTTP persistant disponible pour ce test) et code HTTP 200 en conditions live. À faire manuellement (ou via une preview Vercel) avant fusion sur `main`.

### Adaptation de `scripts/check-mobile-nav.js`

Le check existant détectait le correctif "fermeture au clic" en cherchant un commentaire inline précis (`correctif audit 13/09/2026`) et la règle `.mobile-menu { … }` directement dans le HTML. Ces deux signaux disparaissent mécaniquement quand on centralise (le JS devient un `<script src="…">`, et le CSS peut vivre dans un fichier externe) — ce qui a fait remonter un faux positif sur `immobilier.html` lors du premier passage. Le script a été adapté pour reconnaître aussi le script partagé (`assets/js/navigation.js`) et pour aller lire le CSS externe lié (`assets/css/navigation.css` / `navigation-immobilier.css`) quand la page n'a plus son style inline. Aucune des 3 règles d'origine n'a été affaiblie — seul le mode de détection a été élargi pour couvrir le nouveau cas de figure.

## 9. Rollback

Toutes ces modifications vivent sur la branche `menu-1.5-centralisation-header`, créée à partir de `main` à jour et **non poussée sur `origin`**. `main` n'a pas été touché.

- **Rollback total (avant validation)** : ne pas fusionner la branche ; la supprimer si besoin (`git branch -D menu-1.5-centralisation-header`). `main` reste inchangé.
- **Rollback partiel (après fusion, si un problème apparaît en prod)** : revert du/des commit(s) de la branche sur `main` — chaque page migrée redevient autonome avec son HTML/CSS/JS en dur, exactement comme avant le 16/09/2026 (aucune suppression de l'ancien code n'a eu lieu ailleurs : les 47 autres pages n'ont jamais été touchées et continuent de fonctionner en autonomie complète, comme avant).
- Les nouveaux fichiers (`partials/`, `assets/css/navigation*.css`, `assets/js/navigation.js`, `scripts/build-header.js`, `scripts/migrate-header.js`, `scripts/nav-pages.json`) n'ont aucun effet sur les pages non listées dans `scripts/nav-pages.json` — les laisser en place sans les utiliser est sans risque.
