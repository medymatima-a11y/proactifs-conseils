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

---

## MENU-2A — Mega-menu desktop (prototype, 16/09/2026)

Phase **desktop uniquement**, appliquée via le système centralisé (aucun second système de navigation créé). Le mobile reste le système MENU-1.5 (menu plat), inchangé — la refonte mobile est prévue pour MENU-3. Prototype sur 4 pages seulement : `index.html`, `immobilier.html`, `immobilier/estimation-colombes.html`, `immobilier/succession-colombes.html`. Les ~47 autres pages ne sont pas migrées.

### Architecture desktop finale

Barre : `LOGO` · **Patrimoine ▾** · **Immobilier ▾** · Simulateurs · Le cabinet · **Ressources ▾** · `CTA`.
Logo à gauche, liens centrés, CTA à droite. Fond ivoire, hauteur 72 px (64 px au scroll), accent par univers. Les entrées « Notre approche », « Témoignages » et « Contact » ne sont plus des entrées de premier niveau desktop (les pages/ancres existent toujours ; elles restent présentes dans le menu mobile inchangé). Elles pourront être rattachées à « Le cabinet » ou au footer dans une phase ultérieure.

Trois déclencheurs ouvrent un panneau (`<button class="nav-trigger">`), deux liens simples (`Simulateurs`, `Le cabinet`). « Patrimoine » et « Ressources » n'ont pas de page propre : ce sont des ouvreurs de menu. « Immobilier » aussi est un ouvreur ; la page `/immobilier` est atteinte via « Vendre mon bien » dans le panneau.

### Liens — Patrimoine (mega, 3 colonnes)

- Gérer & optimiser : Bilan patrimonial `/bilan-patrimonial` · Optimisation fiscale `/optimisation-fiscale-ile-de-france` · Déclarer mes impôts `/declaration-impots-ile-de-france` · RSU & stock-options `/fiscalite-rsu-stock-options`
- Investir & préparer : Placements financiers `/placements-financiers` · Préparation retraite `/preparation-retraite`
- Transmettre & entreprendre : Transmission de patrimoine `/transmission` · Cession d'entreprise `/cession-entreprise`

### Liens — Immobilier (mega, 3 colonnes)

- Vendre votre bien : Estimer mon bien `/immobilier/estimation-colombes` · Vendre mon bien `/immobilier` · Succession Sérénité 360 `/immobilier/succession-colombes`
- Investir & financer : Investissement immobilier `/investissement-immobilier` · SCPI `/investissement-scpi-hauts-de-seine` · Financement / Courtage `/courtage-credit-immobilier`
- Carte commerciale : « Vous avez un bien à Colombes ? » → CTA « Estimer mon bien → » `/immobilier/estimation-colombes`

### Liens — Ressources (dropdown simple)

- Blog `/blog`

Aucune entrée « YouTube / Guides / Actualités » (pas de page réelle). Toutes les destinations ci-dessus ont été vérifiées comme existantes avant intégration.

### CTA contextuels (par prototype)

- `index.html` → « Prendre rendez-vous » (`/bilan-patrimonial`)
- `/immobilier` → « Faire estimer mon bien » (`#estimation`)
- `/immobilier/estimation-colombes` → « Estimer mon bien » (`#estimation`, `data-track="estimate_hero_cta"` conservé)
- `/immobilier/succession-colombes` → « Diagnostic Succession 360 » (`#diagnostic`, libellé court pour ne pas écraser la nav)

### États actifs

Mécanisme : attribut `aria-current="page"` injecté par token sur le déclencheur/lien concerné, stylé par `.nav-trigger[aria-current="page"]` / `.nav-link[aria-current="page"]` (soulignement accent). Tokens disponibles : `PATRIMOINE_ACTIVE_DESKTOP`, `IMMOBILIER_ACTIVE_DESKTOP`, `RESSOURCES_ACTIVE_DESKTOP`, `CABINET_ACTIVE_DESKTOP` (+ variantes mobiles conservées). Pour MENU-2A : Immobilier actif sur les 3 pages Immobilier ; aucun actif sur l'accueil. Patrimoine/Ressources actifs prévus pour les pages patrimoine / le blog lors de la propagation.

### Comportement des mega-menus (`assets/js/navigation.js`)

Ouverture au survol et au focus clavier ; maintien ouvert lors du passage du déclencheur au panneau ; fermeture différée (140 ms) pour éviter les fermetures accidentelles ; `Escape` ferme et rend le focus au déclencheur ; clic hors du menu ferme ; un seul menu ouvert à la fois ; `aria-expanded` synchronisé. Sans JS, repli CSS : ouverture au `:hover` et au `:focus-within` (la classe `nav-js` sur `<html>` bascule entre les deux modes). Aucune bibliothèque externe.

### Design & positionnement

Panneau blanc, coins arrondis (`--r-md`), bordure discrète, ombre légère ; titres de colonnes petits/sobres ; liens espacés. Mega centré sous la barre, largeur `min(1000px, 100vw − 48px)` → aucun débordement de 1024 à 1920 px. Accent de survol par panneau : Patrimoine → or, Immobilier → corail, sur toutes les pages (via `--pat-accent` / `--immo-accent` définis dans les deux CSS). L'accent de la barre elle-même (liens, CTA, actif) suit l'univers de la page : or sur les pages patrimoine, corail sur les pages Immobilier.

### Fin du drift Immobilier

`immobilier.html` utilisait une variante de nav légèrement différente (CSS inline : logo 40 px, `#nav` z-index 100, hauteur 68 px au scroll…). Son CSS de nav inline a été retiré ; la page utilise désormais `assets/css/navigation-immobilier.css`, comme succession et estimation. Les surcharges responsives inline `#nav { height: 64px }` (< 600 px) ont été retirées des 3 pages Immobilier. `navigation.css` (or) et `navigation-immobilier.css` (corail) ont désormais un **corps strictement identique** ; seul le bloc `:root` d'accent diffère (2 lignes). z-index unifié : `#nav` 1000, panneaux 1001 (max constaté ailleurs : 500). Résultat : une seule architecture de header, deux accents.

### Reste pour MENU-3 / propagation

- Refonte de la navigation mobile (niveau 2 : accordéons/panneaux Patrimoine & Immobilier). Le menu mobile actuel reste plat et liste encore les anciennes entrées (Contact, Témoignages, Notre approche) — volontairement inchangé à ce stade.
- Propagation du nouveau header aux ~47 autres pages (ajout au manifeste `scripts/nav-pages.json` + application des thèmes).
- Nettoyage optionnel : les blocs `@media (max-width:900px) { .nav-links{display:none}; … }` restent inline dans les pages (redondants avec le CSS centralisé, même point de rupture, sans effet visuel).
- Rattachement éventuel de « Notre approche » / « Témoignages » / « Contact » sous « Le cabinet » ou au footer.

---

## MENU-2B — Finitions desktop (16/09/2026)

Ajustements visuels desktop sur les 4 prototypes, sans toucher au contenu, au SEO, aux URLs ni au mobile. Toujours via le système centralisé (aucun nouveau système de navigation).

**Header / logo.** Gouttières responsives `padding: 0 clamp(24px, 4vw, 48px)` + `box-sizing: border-box` sur `#nav` ; logo et CTA en `flex-shrink: 0`, `.nav-links` en `min-width: 0`. Le logo garde sa taille (44 px), reste entièrement visible avec une marge gauche confortable et ne peut plus être rogné ni compressé de 1024 à 1920 px. Disposition LOGO | navigation centrée | CTA conservée.

**Mega-menus plus compacts et harmonisés.** Largeur partagée ramenée de 1000 à **820 px** (`min(820px, calc(100vw − 48px))`), padding `22px 26px` (au lieu de `26px 30px`), gouttière de colonnes 26 px, titre→liens et interligne des liens resserrés. Patrimoine ne donne plus l'impression d'une grande boîte partiellement vide ; Immobilier partage exactement les mêmes dimensions/grille/rayon/ombre/bordure/titres. `navigation.css` (or) et `navigation-immobilier.css` (corail) conservent un corps strictement identique — seul l'accent `:root` diffère.

**Accès à /immobilier.** Le déclencheur « Immobilier » reste l'ouvreur du mega-menu (comportement inchangé). Dans le panneau : « Vendre mon bien » → `/immobilier` conservé, et ajout d'un lien secondaire discret sous la 1re colonne, **« Découvrir Proactifs Immobilier → »** → `/immobilier` (séparé par un filet, plus petit, gris, sans fond au survol). Il reste secondaire et ne concurrence pas « Estimer mon bien » (action commerciale prioritaire).

**Inchangé.** Contact reste hors du premier niveau desktop (CTA + footer). Ressources = Blog uniquement. Accessibilité intacte (aria-haspopup/expanded/current, focus-visible/within, Escape, retour focus, clic extérieur, hover, délai anti-fermeture). Mobile inchangé (MENU-3 à venir).

---

## MENU-3 — Navigation mobile 2 niveaux (16/09/2026)

Remplacement du menu mobile plat par une navigation premium à 2 niveaux, sur les 4 prototypes, **sans aucun changement desktop** (seules des règles isolées au breakpoint `max-width: 900px` sont ajoutées ; le seul changement du `<nav>` est l'ajout d'attributs ARIA au hamburger, invisibles en desktop). Toujours via le système centralisé.

**Niveau 1.** Patrimoine ›, Immobilier ›, Simulateurs, Le cabinet, Ressources ›, puis le CTA contextuel. « Notre approche », « Témoignages » et « Contact » sont retirés du menu mobile (pages et ancres conservées ; le CTA et le footer assurent le contact).

**Niveau 2 (vraie nouvelle vue qui glisse, 220 ms, `prefers-reduced-motion` respecté).**
- **Patrimoine** : ← Retour + titre + 3 groupes (Gérer & optimiser / Investir & préparer / Transmettre & entreprendre), mêmes URLs que le mega desktop.
- **Immobilier** : ← Retour + Vendre votre bien (Estimer mon bien → /immobilier/estimation-colombes, Vendre mon bien → /immobilier, Succession Sérénité 360 → /immobilier/succession-colombes) + Investir & financer (Investissement immobilier, SCPI, Financement / Courtage) + « Découvrir Proactifs Immobilier → » (/immobilier) + CTA « Estimer mon bien » (/immobilier/estimation-colombes). La carte corail desktop **n'est pas** reprise sur mobile.
- **Ressources** : ← Retour + Blog.

**Comportement.** Hamburger ☰/✕ ; ouverture toujours au niveau 1 ; parents → niveau 2 ; ← Retour → niveau 1 sans fermer ; fermeture par ✕, Escape (focus rendu au hamburger) et clic sur une destination ; scroll de la page bloqué (`body.m-open`), défilement interne par vue.

**Accessibilité.** `aria-haspopup`/`aria-expanded`/`aria-controls` sur hamburger et parents, `aria-current="page"` (Immobilier sur les 3 pages Immobilier), `aria-label` sur les boutons Retour, `focus-visible`, focus déplacé vers ← Retour à l'ouverture d'un niveau 2 et rendu au parent au retour. Les vues masquées sont neutralisées via `inert` (hors flux Tab et arbre d'accessibilité).

**CTA contextuel mobile (niveau 1).** index → Prendre rendez-vous (/bilan-patrimonial) ; /immobilier → Estimer mon bien (/immobilier/estimation-colombes) ; estimation → Estimer mon bien (#estimation) ; succession → Diagnostic Succession 360 (#diagnostic).

**Design.** Fond ivoire, vert profond, typographies Proactifs, accent or (Patrimoine) / corail (Immobilier), séparateurs fins, zones tactiles ≥ 44 px, CTA arrondi. Breakpoint inchangé (900 px). Desktop MENU-2B figé.

### MENU-3.1 — Correctif scroll/recouvrement des sous-menus mobiles (16/09/2026)

Bug : à l'ouverture d'un sous-menu long (Patrimoine, Immobilier), `back.focus()` faisait défiler horizontalement le conteneur `.mobile-menu` (`overflow:hidden` mais `scrollWidth` ≈ 2× la largeur à cause des vues inactives en `translateX(100%)`), décalant toute la pile de 390 px : la vue active passait hors écran à gauche et une vue inactive (Ressources, dernière dans le DOM) se retrouvait visible par-dessus. Ressources (court) semblait fonctionner car c'était elle qui recouvrait. Correctif : `element.focus({ preventScroll: true })` sur les trois focus du menu mobile (ouverture sous-vue, retour, fermeture). Combiné à la hauteur `100dvh` (MENU-3.1 précédent), le scroll interne des vues longues fonctionne. Desktop et gabarit inchangés (correctif JS isolé au comportement mobile).

---

## MENU-4A — Propagation LOT 1 (pages Patrimoine) (16/09/2026)

Header centralisé (référence MENU-2B desktop + MENU-3.1 mobile) propagé aux 8 pages de services Patrimoine, via le système existant (partials/header.html + build-header.js + navigation.css/js). Aucun header local, aucune variante par page. Le manifeste `scripts/nav-pages.json` compte désormais 12 pages (4 prototypes + 8 LOT 1).

**Pages migrées (8) — toutes en thème « site patrimoine » (or), univers Patrimoine actif (desktop, `aria-current="page"`), HOME_PREFIX `/` :**

| Page | CTA header | Cible |
|---|---|---|
| /bilan-patrimonial | Demander un bilan | `#form` (CTA propre conservé, §5) |
| /optimisation-fiscale-ile-de-france | Prendre rendez-vous | /bilan-patrimonial |
| /declaration-impots-ile-de-france | Prendre rendez-vous | /bilan-patrimonial |
| /fiscalite-rsu-stock-options | Prendre rendez-vous | /bilan-patrimonial |
| /placements-financiers | Prendre rendez-vous | /bilan-patrimonial |
| /preparation-retraite | Prendre rendez-vous | /bilan-patrimonial |
| /transmission | Prendre rendez-vous | /bilan-patrimonial |
| /cession-entreprise | Prendre rendez-vous | /bilan-patrimonial |

Les 7 pages « défaut » avaient déjà « Prendre rendez-vous » → /bilan-patrimonial dans leur ancien header ; bilan-patrimonial avait « Demander un bilan » → `#form`, conservé.

**Procédure appliquée par page** : retrait des règles CSS de nav (sélecteurs `#nav`, `.nav-links`, `.nav-cta-btn`, `.nav-logo`, `.hamburger`, `.mobile-menu`, `.nav-dropdown`, `.dropdown-*`, `.chevron` — ~29-30 règles/page, retrait par analyse d'accolades, sans toucher au CSS de page) ; retrait du JS de nav inline (scroll `#nav.scrolled`, handler hamburger, autoclose) en conservant le JS de page (bouton retour-haut, IntersectionObserver `.reveal`) ; remplacement du `<nav>`+menu mobile par les marqueurs NAV:CONFIG/NAV:START/END ; ajout de `<link navigation.css>` + `<script navigation.js>` ; régénération via build-header.js.

**États actifs** : Patrimoine actif en desktop sur les 8. En mobile, l'architecture MENU-3 ne prévoit pas d'état actif « Patrimoine » (seul Immobilier a un token mobile) — donc pas d'indication active mobile Patrimoine, conformément à §4 (« si prévue par l'architecture »). Aucune variante locale créée.

**Anomalies** : aucune. Variation mineure attendue : fiscalite-rsu-stock-options a 29 règles de nav retirées (vs 30) — simple différence de nombre de règles dans l'ancien header, migration propre.

**SEO/contenu** : aucun title, meta, H1, canonical, schema JSON-LD, contenu, sitemap, URL ni redirect modifié (vérifié par diff : 0 ligne SEO changée ; comptes de sections/titres/formulaires identiques avant/après sur les 8).

**Pages NON migrées (hors LOT 1)** : Immobilier (déjà prototypes), courtage-credit-immobilier, investissement-immobilier, SCPI, pages locales SEO, cabinet, blog, articles, landing/lead magnets, pages merci, pret-immobilier-index.html et sous-domaine prêt. Réservées aux lots MENU-4B/4C/4D.

---

## MENU-4C — CABINET / INSTITUTIONNEL / LOCAL — Inventaire & décisions (16/09/2026)

> **Phase inventaire uniquement.** Aucune page n'est migrée dans cette étape (conformément à §2 du brief : « NE PAS encore modifier les pages pendant cet inventaire »). La migration effective est **suspendue** : MENU-4B (univers Immobilier / financement, jamais exécuté) doit passer **avant** la reprise de MENU-4C. Ce bloc documente seulement le périmètre confirmé et les décisions d'état actif / CTA.

### Périmètre confirmé (pages À MIGRER en 4C)

Toutes ces pages utilisent encore l'ancien header (`<nav id="nav">`, pas de marqueur `NAV:CONFIG`), CTA actuel « Prendre rendez-vous ». Structure identique et migrable (nav#nav + menu déroulant « Nos services » + mobileMenu).

| URL | Fichier | Type | État actif proposé (desktop) | CTA header cible | Statut |
|---|---|---|---|---|---|
| /cabinet | `cabinet.html` | Cabinet / institutionnel | **Le cabinet** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |
| /conseiller-patrimoine-asnieres | `conseiller-patrimoine-asnieres.html` | Local (SEO ville) | **Patrimoine** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |
| /conseiller-patrimoine-colombes | `conseiller-patrimoine-colombes.html` | Local (SEO ville) | **Patrimoine** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |
| /conseiller-patrimoine-courbevoie | `conseiller-patrimoine-courbevoie.html` | Local (SEO ville) | **Patrimoine** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |
| /conseiller-patrimoine-levallois | `conseiller-patrimoine-levallois.html` | Local (SEO ville) | **Patrimoine** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |
| /conseiller-patrimoine-nanterre | `conseiller-patrimoine-nanterre.html` | Local (SEO ville) | **Patrimoine** | Prendre rendez-vous → /bilan-patrimonial | À MIGRER |

### Décisions actées

1. **5 pages locales `conseiller-patrimoine-VILLE`** → état actif **Patrimoine** en desktop (`PATRIMOINE_ACTIVE_DESKTOP`, `aria-current="page"`). Décision validée par le client (« Choix 1 : Patrimoine »). Thème « site patrimoine » (or), HOME_PREFIX `/`. Pas d'état actif mobile (l'architecture MENU-3 ne prévoit pas de token actif Patrimoine mobile — cf. §4).
2. **`cabinet.html`** → état actif **Le cabinet** en desktop (`CABINET_ACTIVE_DESKTOP`). Thème patrimoine (or).
3. CTA header identique pour les 6 : « Prendre rendez-vous » → `/bilan-patrimonial` (déjà le CTA actuel de ces pages).

### Décision EN ATTENTE

| URL | Fichier | Remarque | Statut |
|---|---|---|---|
| /declaration-rsu-espp-france | `declaration-rsu-espp-france.html` | Page fiscalité (RSU/ESPP), thématiquement Patrimoine (proche de `/fiscalite-rsu-stock-options`, déjà dans le méga-menu Patrimoine). Rattachement 4C **non confirmé** par le client (Q2 restée sans réponse). | **À STATUER** — ne pas migrer tant que l'arbitrage (in-scope 4C + état actif Patrimoine ?) n'est pas validé. |

### Bloqueur : MENU-4B non exécuté

MENU-4B (univers **Immobilier / financement**) n'a **jamais été exécuté**. Les pages suivantes restent sur l'ancien header et sont **exclues de 4C** (elles relèvent de 4B, à traiter avant la reprise de 4C) :

- `courtage-credit-immobilier.html`
- `investissement-immobilier.html`
- `investissement-immobilier-ancien.html`
- `investissement-scpi-hauts-de-seine.html`

### Exclusions 4C (confirmées)

- **Blog & articles** → réservés à MENU-4D.
- **Écosystème prêt immobilier** (`pret-immobilier-index.html` et sous-domaine prêt) → hors périmètre.
- **Landing / lead magnets, pages « merci »** → hors périmètre (pas de header principal / parcours dédié).
- **Pages sans header principal** → non concernées.
- `succession-colombes.local.bak.html` → fichier de sauvegarde non suivi, hors périmètre.
- **Ancres, pas des pages** : « Notre approche » (`#approche`), « Contact » (`#contact`), « Simulateurs » (`#simulateurs`) sont des ancres de l'accueil, pas des pages autonomes — rien à migrer.

### Note backlog NAV-UX (post-propagation)

**À traiter après la propagation générale — phase NAV-UX :** harmonisation des fils d'Ariane (breadcrumbs) et de la navigation retour sur l'ensemble des pages migrées (cohérence du retour vers les hubs Patrimoine / Immobilier / Cabinet, et depuis les pages locales / articles). Hors périmètre 4A–4D ; à cadrer une fois le header centralisé propagé partout.

### Statut

**STOP.** Inventaire 4C figé et documenté. Aucune page modifiée. Prochaine étape : **exécuter MENU-4B**, puis reprendre la migration MENU-4C (6 pages confirmées + arbitrage `declaration-rsu-espp-france`).

---

## MENU-4B — Propagation univers Immobilier / financement (16/09/2026)

Header centralisé (MENU-2B desktop + MENU-3.1 mobile) propagé aux 4 pages restantes de l'univers Immobilier / investissement / financement, via le système existant (partials/header.html + build-header.js + navigation-immobilier.css/navigation.js). Aucun header local. Manifeste `scripts/nav-pages.json` : 12 → **16 pages**.

**Pages migrées (4) — thème « immobilier » (corail), univers Immobilier actif (desktop `IMMOBILIER_ACTIVE_DESKTOP` + mobile `IMMOBILIER_ACTIVE_MOBILE`, `aria-current="page"`), HOME_PREFIX `/` :**

| Page | Dans méga-menu « Investir & financer » | CTA header | Cible |
|---|---|---|---|
| /investissement-immobilier | Oui | Prendre rendez-vous | /bilan-patrimonial |
| /investissement-immobilier-ancien | Non (voir note) | Prendre rendez-vous | /bilan-patrimonial |
| /investissement-scpi-hauts-de-seine | Oui (SCPI) | Prendre rendez-vous | /bilan-patrimonial |
| /courtage-credit-immobilier | Oui (Financement / Courtage) | Prendre rendez-vous | /bilan-patrimonial |

**CTA** : le CTA header métier existant de ces 4 pages était déjà « Prendre rendez-vous » → `/bilan-patrimonial` ; conservé tel quel (pas de « Estimer mon bien » forcé, conformément au brief).

**État actif** : Immobilier actif en desktop ET mobile (l'architecture MENU-3 prévoit un token actif Immobilier mobile, contrairement à Patrimoine). Décision `investissement-immobilier-ancien` (non liée dans le méga-menu) : **migrée en Immobilier actif** (validé — éviter qu'une page de l'univers Immobilier reste sur l'ancien header ; non ajoutée au méga-menu).

**Particularité `investissement-immobilier-ancien.html`** : JS de nav divergent (ordre des toggles hamburger inversé, seuil scroll 50 mêlé au toggle du bouton retour-haut). Migrée via une chirurgie ciblée distincte du migrateur commun (retrait `const nav` + ligne `nav.scrolled`, conservation du listener scroll pour `#scrollTop`, retrait du handler hamburger variante, autoclose standard remplacé par navigation.js). JS de page conservé (bouton retour-haut, IntersectionObserver `.reveal`).

**Procédure (3 pages conformes)** : retrait des règles CSS de nav (~30 règles/page, sans toucher au CSS de page) ; retrait du JS de nav inline (scroll `#nav.scrolled`, handler hamburger, autoclose) en conservant le JS de page ; remplacement `<nav>`+menu mobile par les marqueurs NAV:CONFIG/START/END ; ajout `<link navigation-immobilier.css>` + `<script navigation.js>` ; régénération build-header.js.

**Tests** : `build-header.js` → 4 régénérées ; `--check` → idempotent (exit 0) ; `check-mobile-nav.js` → aucune nouvelle régression (seules les 2 pages pré-existantes hors périmètre restent signalées). Rendu headless réel : survol desktop « Immobilier » → panneau `mega-immobilier` en `display:grid` (Patrimoine reste fermé), `aria-expanded=true` ; mobile → ☰ ouvre la racine, sous-menu Immobilier actif. Desktop MENU-2B et mobile MENU-3.1 confirmés.

**SEO/contenu** : aucun title, meta, H1, canonical, schema, contenu, sitemap, URL ni redirect modifié (vérifié par diff : 0 ligne SEO sur les 4 ; comptes sections/H2/formulaires/.reveal identiques avant/après).

**Périmètre figé** : 5 fichiers modifiés (4 pages + nav-pages.json). Prototypes `immobilier`/`estimation-colombes`/`succession-colombes` et assets header (navigation.css, navigation-immobilier.css, navigation.js, header.html, build-header.js) **inchangés**.

**Exclues de 4B** : `simulation-pret-immobilier.html` et `pret-immobilier-index.html` (écosystème prêt, hors périmètre — validé) ; blog/articles (4D) ; cabinet + `conseiller-patrimoine-VILLE` + `declaration-rsu-espp-france` (MENU-4C, non repris). MENU-4C reste documenté et NON migré.

**Commit** : `ebfaba1` sur `menu-1.5-centralisation-header` (+ doc). À pousser sur la branche preview uniquement — jamais main/prod.

---

## MENU-4C — Exécution (migration) (16/09/2026)

Migration effective des 6 pages confirmées à l'inventaire 4C (MENU-4B ayant été exécuté avant, comme prévu). Système centralisé uniquement (partials/header.html + build-header.js + navigation.css/js). Manifeste `scripts/nav-pages.json` : 16 → **22 pages**.

**Pages migrées (6) — thème « site-patrimoine » (or), HOME_PREFIX `/`, CTA « Prendre rendez-vous » → /bilan-patrimonial :**

| URL | Fichier | État actif |
|---|---|---|
| /cabinet | `cabinet.html` | **Le cabinet** (`CABINET_ACTIVE_DESKTOP` + `CABINET_ACTIVE_MOBILE`, `aria-current="page"`) |
| /conseiller-patrimoine-asnieres | `conseiller-patrimoine-asnieres.html` | **Patrimoine** (desktop) |
| /conseiller-patrimoine-colombes | `conseiller-patrimoine-colombes.html` | **Patrimoine** (desktop) |
| /conseiller-patrimoine-courbevoie | `conseiller-patrimoine-courbevoie.html` | **Patrimoine** (desktop) |
| /conseiller-patrimoine-levallois | `conseiller-patrimoine-levallois.html` | **Patrimoine** (desktop) |
| /conseiller-patrimoine-nanterre | `conseiller-patrimoine-nanterre.html` | **Patrimoine** (desktop) |

**Particularité JS** : les 6 pages avaient une indentation JS à 2 espaces (vs 4 pour LOT 1) et un handler hamburger variante (cabinet : ordre des toggles inversé). Migrées via des migrateurs 4C dédiés (retrait `const nav` + ligne `nav.scrolled`, conservation du listener scroll pour `#scrollTop` sur les pages locales, retrait du handler hamburger, autoclose standard → navigation.js). JS de page conservé (bouton retour-haut, reveal).

**État actif** : Patrimoine actif desktop sur les 5 locales (pas de token actif Patrimoine mobile — architecture MENU-3, cf. §4). Cabinet actif desktop + mobile.

**Tests** : `build-header.js` → 6 régénérées ; `--check` → idempotent (exit 0, 22 pages « à jour ») ; `check-mobile-nav.js` → aucune nouvelle régression (2 pages pré-existantes hors périmètre). Rendu headless réel : locale → survol « Patrimoine » ouvre le mega (`display:grid`, `aria-expanded=true`, actif « Patrimoine ») ; cabinet → `aria-current="page"` sur le lien `/cabinet`, CTA « Prendre rendez-vous » ; mobile → ☰ ouvre la racine. Desktop MENU-2B et mobile MENU-3.1 confirmés.

**SEO/contenu** : 0 ligne SEO modifiée sur les 6 (vérifié par diff) ; comptes sections/H2/reveal identiques avant/après.

**Périmètre figé** : 7 fichiers modifiés (6 pages + nav-pages.json). Prototypes, pages MENU-4B et assets header inchangés.

**Non migrée (rappel)** : `declaration-rsu-espp-france.html` reste **À STATUER** (git diff = 0, intouchée). Exclusions inchangées : blog/articles (4D), écosystème prêt, lead magnets, pages merci, pages de capture, pages sans header. NAV-UX non développé (aucun breadcrumb, aucun bouton Retour ajouté).

**Statut MENU-4C : MIGRÉ** (6 pages). Reste en suspens : arbitrage `declaration-rsu-espp-france` ; MENU-4D (blog) non commencé.

---

## MENU-4D — INVENTAIRE BLOG / ARTICLES (16/09/2026)

> **Phase inventaire uniquement.** Aucune page modifiée, aucune migration, aucun commit de migration. Ce bloc recense le contenu éditorial et fige les décisions avant la future migration MENU-4D.

### Périmètre éditorial trouvé (30 pages)

- **26 pages dans `blog/`** (1 index + 25 articles) — toutes sur l'**ancien header** (`<nav id="nav">`, pas de `NAV:CONFIG`), menu mobile plat MENU-1.5, CTA « Prendre rendez-vous » → `/bilan-patrimonial`, **aucune** dans `scripts/nav-pages.json`. → À MIGRER, univers **Ressources** actif.
- **1 lead magnet dupliqué** : `Lead magnets/blog-per-vs-assurance-vie-2026.html` — ancien header, CTA **spécifique** « Bilan sur-mesure » → `/bilan-patrimonial-gratuit`. Écosystème lead magnet → **EXCLUE** (+ anomalie connue).
- **3 aperçus lead magnet** (`Lead magnets/apercu-*.html`) + **`guide-5-erreurs-patrimoniaux.html`** : **sans header principal** → **EXCLUES**.

### Tableau (statut par page)

| Type | URL / fichier | Header actuel | CTA header | Manifeste | Mobile | Statut |
|---|---|---|---|---|---|---|
| Index Blog | `/blog` — `blog/index.html` | Ancien (`nav#nav`) | Prendre rendez-vous → /bilan-patrimonial | Non | Plat MENU-1.5 | À MIGRER (Ressources) |
| Article ×24 (sains) | `blog/*.html` | Ancien (`nav#nav`) | Prendre rendez-vous → /bilan-patrimonial | Non | Plat MENU-1.5 | À MIGRER (Ressources) |
| Article (anomalie) | `blog/donation-vivant-vs-testament-strategie-transmission.html` | Ancien | Prendre rendez-vous → /bilan-patrimonial | Non | **2 défauts** | À MIGRER — la migration corrige l'anomalie |
| Lead magnet (dupliqué) | `Lead magnets/blog-per-vs-assurance-vie-2026.html` | Ancien | **Bilan sur-mesure → /bilan-patrimonial-gratuit** | Non | **3 défauts** | EXCLUE (écosystème lead magnet) — anomalie connue |
| Aperçus / capture | `Lead magnets/apercu-*.html`, `guide-5-erreurs-patrimoniaux.html` | Aucun header | — | Non | Sans menu | EXCLUES (sans header, intentionnel) |

Liste des 25 articles : actions-gratuites-aga-fiscalite-2026 · bspce-fiscalite-startup-2026 · conseiller-patrimoine-ile-de-france · declarer-rsu-formulaires-2026 · donation-vivant-2026 · donation-vivant-vs-testament-strategie-transmission · espp-fiscalite-france-2026 · gestion-patrimoine-entreprise-dirigeants-strategies-2026 · gestion-patrimoine-entreprise-strategies-optimisation-fiscale-2026 · immobilier-complement-retraite-lmnp-scpi-50-ans · investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026 · investir-rsu-patrimoine-2026 · lmnp-2026 · modifier-clause-beneficiaire-assurance-vie-2026 · per-vs-assurance-vie-2026 · preparer-retraite-2026-leviers-patrimoniaux-juin · preparer-retraite-50-ans-leviers-patrimoniaux · quand-vendre-rsu-strategie-2026 · reduire-impots-2026 · rsu-expatriation-fiscalite-2026 · rsu-imposition-france-2026 · rsu-pea-2026 · sci-familiale-2026 · scpi-2026 · stock-options-imposition-strategie-2026.

### Décisions (architecture cible)

- `/blog` (index) et les 25 articles → univers **Ressources** actif (`RESSOURCES_ACTIVE_DESKTOP`, `aria-current="page"`), thème « site-patrimoine » (or).
- CTA header : « Prendre rendez-vous » → `/bilan-patrimonial` (déjà le CTA des 26 pages ; aucun CTA header spécifique à conserver côté blog). Le seul CTA header spécifique relevé (« Bilan sur-mesure ») est sur le lead magnet **exclu**.

### Cause exacte des 2 anomalies check-mobile-nav.js

**1. `blog/donation-vivant-vs-testament-strategie-transmission.html` — 2 défauts :**
- `menu-mobile-deborde` : la règle CSS `.mobile-menu { … }` ne contient ni `max-height` ni `overflow-y` → menu long non défilable sur mobile.
- `menu-ne-se-referme-pas` : aucun script d'auto-fermeture (`hasAutocloseScript`) ne retire `.open` de `.mobile-menu` au clic sur un lien → menu reste ouvert après clic d'ancre.
- Origine : gabarit d'article antérieur au correctif appliqué aux 24 autres articles.

**2. `Lead magnets/blog-per-vs-assurance-vie-2026.html` — 3 défauts :** les 2 ci-dessus **+**
- `nav-invisible-avant-scroll` : règles `#nav:not(.scrolled)` (barre transparente, liens/hamburger blancs avant scroll) + bandeau `.breadcrumb` clair sous la nav → barre et bouton ☰ invisibles avant tout scroll.

Les deux sont **corrigées automatiquement** par la migration vers le header centralisé (menu MENU-3.1 : `max-height`/`overflow-y`, auto-fermeture via `navigation.js`, nav opaque). Le lead magnet étant exclu, son anomalie devra être traitée séparément (hors 4D) si souhaité.

### Découpage en lots recommandé (26 pages)

- **LOT 4D-0 (pré-vol)** : contrôle des variantes JS (indentation, handler hamburger, autoclose) sur les 26 pages — comme en 4B/4C.
- **LOT 4D-1** : `blog/index.html` seul (structure d'index).
- **LOT 4D-2 / 4D-3** : les 25 articles en 2 sous-lots (~12–13), avec `git diff` page par page + `check-mobile-nav.js` après chaque sous-lot.

### Statut

**STOP.** Inventaire 4D figé. Aucune page migrée. `declaration-rsu-espp-france.html` non touchée (hors éditorial, À STATUER). Migration MENU-4D en attente de validation.

---

## MENU-4D-0 — PRÉ-VOL (26 pages blog) (16/09/2026)

Analyse des variantes techniques de l'ancien header sur les 26 pages à migrer. **5 gabarits** identifiés (aucun ne modifie le contenu ; il s'agit de variations de balisage JS/CSS de l'ancien header) :

| Variante | Nb | Indentation JS | Handler hamburger | `const nav` / scrolled | autoclose | CSS mobile (max-height/overflow) |
|---|---|---|---|---|---|---|
| A | 13 | 2 espaces | `this`-first | oui / >20 | oui | oui |
| B | 2 | 4 espaces | `this`-first | oui / >20 | oui | oui |
| C | 9 | — | forme alternative (sans `const nav`/scrolled) | non / non | oui | oui |
| D (index) | 1 | 2 espaces | fonction fléchée + `const hamburger`/`const mobileMenu` | oui / >20 | oui | oui |
| E (anomalie) | 1 | 2 espaces | `this`-first | oui / >20 | **non** | **non** |

- **Variante E** = `blog/donation-vivant-vs-testament-strategie-transmission.html` : seule page présentant les 2 défauts mobiles déjà documentés (menu sans max-height/overflow-y + pas d'auto-fermeture). La migration les corrige. À traiter en 4D-2/4D-3.
- **Variante C (9 pages)** : gabarit sans `const nav`/scrolled et handler hamburger sous une autre forme → nécessitera un migrateur ciblé (pré-vol détaillé au début de 4D-2). Non bloquant.
- **Aucune anomalie bloquante supplémentaire** détectée.

## MENU-4D-1 — INDEX BLOG (16/09/2026)

`blog/index.html` (`/blog`) migré vers le header centralisé. Manifeste `scripts/nav-pages.json` : 22 → **23 pages**.

- **Univers actif** : **Ressources** en desktop (`RESSOURCES_ACTIVE_DESKTOP`, `aria-current="page"`). Pas d'état actif Ressources mobile : l'architecture MENU-3 ne prévoit pas de token `RESSOURCES_ACTIVE_MOBILE` (comme Patrimoine) — le bouton mobile « Ressources › » reste fonctionnel sans marqueur actif.
- **Thème** : « site-patrimoine » (or, `navigation.css`). **CTA** : « Prendre rendez-vous » → `/bilan-patrimonial` (CTA existant conservé).
- **Migration (variante D)** : retrait des règles CSS de nav (35), retrait du bloc JS nav+hamburger (fonction fléchée `const hamburger`/`const mobileMenu`) en **conservant** le JS de page (formulaire newsletter `nl-form`, rendu des cartes), autoclose standard → `navigation.js`, marqueurs NAV:CONFIG/START/END, `<link navigation.css>`.
- **Tests** : `build-header.js` → régénéré ; `--check` → idempotent (exit 0, 23 pages) ; `check-mobile-nav.js` → aucune nouvelle régression (2 pages pré-existantes hors périmètre). Rendu headless réel : desktop 1024/1280/1440/1920 → aucun débordement horizontal, dropdown Ressources ouvert (`aria-expanded=true`, `display:block`), Ressources actif ; mobile 375/390/430/768 → aucun débordement, ☰ ouvre la racine, sous-menu Ressources actif. Desktop MENU-2B et mobile MENU-3.1 conservés.
- **SEO/contenu** : 0 ligne SEO modifiée (diff) ; comptes sections/H2 identiques avant/après. Aucun article, lien éditorial, canonical, schema, OG, sitemap, URL, redirect ni breadcrumb touché.
- **Périmètre** : 2 fichiers modifiés (`blog/index.html` + `nav-pages.json`). Aucun article migré. `donation-vivant-vs-testament`, lead magnets, `declaration-rsu-espp-france`, écosystème prêt non touchés.

**Statut : blog/index.html MIGRÉ.** Reste : 4D-2 (13 articles) + 4D-3 (12 articles) — en attente de validation visuelle.

---

## MENU-4D-2 — ARTICLES LOT 1 (13 articles) (16/09/2026)

13 premiers articles (ordre alphabétique) migrés vers le header centralisé. Manifeste `scripts/nav-pages.json` : 23 → **36 pages**. Univers **Ressources** actif (desktop), CTA « Prendre rendez-vous » → `/bilan-patrimonial`, thème « site-patrimoine » (or). Aucun header local.

| # | Fichier | Variante | Statut |
|---|---|---|---|
| 1 | `blog/actions-gratuites-aga-fiscalite-2026.html` | C | MIGRÉ |
| 2 | `blog/bspce-fiscalite-startup-2026.html` | C | MIGRÉ |
| 3 | `blog/conseiller-patrimoine-ile-de-france.html` | B | MIGRÉ |
| 4 | `blog/declarer-rsu-formulaires-2026.html` | C | MIGRÉ |
| 5 | `blog/donation-vivant-2026.html` | A | MIGRÉ |
| 6 | `blog/donation-vivant-vs-testament-strategie-transmission.html` | E (anomalie) | MIGRÉ — 2 anomalies mobiles corrigées |
| 7 | `blog/espp-fiscalite-france-2026.html` | C | MIGRÉ |
| 8 | `blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026.html` | B | MIGRÉ |
| 9 | `blog/gestion-patrimoine-entreprise-strategies-optimisation-fiscale-2026.html` | A | MIGRÉ |
| 10 | `blog/immobilier-complement-retraite-lmnp-scpi-50-ans.html` | A | MIGRÉ |
| 11 | `blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026.html` | A | MIGRÉ |
| 12 | `blog/investir-rsu-patrimoine-2026.html` | C | MIGRÉ |
| 13 | `blog/lmnp-2026.html` | A | MIGRÉ |

Répartition : A ×5, B ×2, C ×5, E ×1.

**Migrateur ciblé par variante** : retrait JS nav par regex tolérant l'indentation et la minification (variante C minifiée, A/B/E en `this`-first), avec conservation du JS de page (`#scrollTop`, `IntersectionObserver`/reveal, accordéon FAQ). Garde-fou : assertion « aucun `getElementById('hamburger')` / `scrolled` / `const nav` résiduel » après retrait. Autoclose standard → `navigation.js` ; pour la variante E (sans autoclose), `navigation.js` ajouté avant `</body>`.

**Variante E — anomalies corrigées par le header central (sans correctif local)** : rendu headless réel — fermeture du menu mobile au clic sur un lien = OUI (`closeMobile`) ; vues de niveau 2 en `overflow-y:auto` sous `.mobile-menu { max-height: 772px }` → plus de débordement. Les 2 défauts (`menu-mobile-deborde`, `menu-ne-se-referme-pas`) ont disparu ; `check-mobile-nav.js` ne signale plus cette page.

**Tests** : `build-header.js` → 13 régénérées ; `--check` → idempotent (exit 0, 36 pages) ; `check-mobile-nav.js` → **1 seule** page signalée (`Lead magnets/blog-per-vs-assurance-vie-2026.html`, exclue) — donation-vs-testament désormais conforme. Rendu headless (A/B/C/E) : desktop 1024/1440/1920 → aucun débordement, dropdown Ressources ouvert + actif ; mobile 375/390/430 → aucun débordement, ☰ ouvre la racine.

**Contrôle SEO/contenu par article (HEAD vs migré)** : title, meta description, canonical, H1, nombre de H2, nombre de JSON-LD, nombre de breadcrumb **identiques sur les 13**. 0 ligne SEO modifiée (diff). Aucun texte, image, lien éditorial, date ni auteur touché.

**Périmètre** : 14 fichiers modifiés (13 articles + `nav-pages.json`). Non touchés : `Lead magnets/blog-per-vs-assurance-vie-2026.html`, `declaration-rsu-espp-france.html`, lead magnets, pages capture, écosystème prêt, et les 12 articles du lot 4D-3.

**Statut : lot 4D-2 MIGRÉ (13/13).** Reste : 4D-3 (12 articles) — en attente de validation visuelle.

---

## MENU-4D-3 — ARTICLES LOT 2 (12 articles) (16/09/2026)

12 derniers articles migrés vers le header centralisé. Manifeste `scripts/nav-pages.json` : 36 → **48 pages**. Univers **Ressources** actif (desktop), CTA « Prendre rendez-vous » → `/bilan-patrimonial`, thème « site-patrimoine » (or). Même méthode qu'en 4D-2 (migrateur ciblé par variante).

| # | Fichier | Variante | Statut |
|---|---|---|---|
| 14 | `blog/modifier-clause-beneficiaire-assurance-vie-2026.html` | A | MIGRÉ |
| 15 | `blog/per-vs-assurance-vie-2026.html` | A | MIGRÉ |
| 16 | `blog/preparer-retraite-2026-leviers-patrimoniaux-juin.html` | A | MIGRÉ |
| 17 | `blog/preparer-retraite-50-ans-leviers-patrimoniaux.html` | A | MIGRÉ |
| 18 | `blog/quand-vendre-rsu-strategie-2026.html` | C | MIGRÉ |
| 19 | `blog/reduire-impots-2026.html` | A | MIGRÉ |
| 20 | `blog/rsu-expatriation-fiscalite-2026.html` | C | MIGRÉ |
| 21 | `blog/rsu-imposition-france-2026.html` | A | MIGRÉ |
| 22 | `blog/rsu-pea-2026.html` | C | MIGRÉ |
| 23 | `blog/sci-familiale-2026.html` | A | MIGRÉ |
| 24 | `blog/scpi-2026.html` | A | MIGRÉ |
| 25 | `blog/stock-options-imposition-strategie-2026.html` | C | MIGRÉ |

Répartition : A ×8, C ×4 (aucune variante B ni E dans ce lot).

**JS métier conservé** : `#scrollTop`, `IntersectionObserver`/reveal, accordéon FAQ. Retrait limité à l'ancien JS de nav (const nav, scrolled, hamburger, autoclose). Garde-fou anti-résidu par fichier (aucun `getElementById('hamburger')` / `scrolled` / `const nav` restant).

**Tests** : `build-header.js` → 12 régénérées ; `--check` → idempotent (exit 0, 48 pages) ; `check-mobile-nav.js` → **1 seule** page signalée (`Lead magnets/blog-per-vs-assurance-vie-2026.html`, volontairement exclue). Rendu headless (A, C) : desktop 1024/1440/1920 → aucun débordement, dropdown Ressources ouvert + actif ; mobile 375/390/430 → aucun débordement, ☰ ouvre la racine, sous-menu Ressources + retour fonctionnels.

**Contrôle SEO/contenu par article (HEAD vs migré)** : title, meta, canonical, H1, nombre de H2, JSON-LD, breadcrumb, **auteur, date** — identiques sur les 12. 0 ligne SEO modifiée (diff).

**Périmètre** : 13 fichiers modifiés (12 articles + `nav-pages.json`). Non touchés : `Lead magnets/blog-per-vs-assurance-vie-2026.html`, `declaration-rsu-espp-france.html`, lead magnets, pages de capture, écosystème prêt, pages merci.

---

## MENU-4D — BLOG / ARTICLES = TERMINÉ

L'ensemble du blog est migré vers le header centralisé : **`blog/index.html` + les 25 articles = 26 pages** (4D-1 : index ; 4D-2 : 13 articles ; 4D-3 : 12 articles). Univers **Ressources** actif desktop, CTA « Prendre rendez-vous » → `/bilan-patrimonial`, thème site-patrimoine. Aucune régression `check-mobile-nav` (seule reste `Lead magnets/blog-per-vs-assurance-vie-2026.html`, exclue). Aucune modification SEO/contenu/URL.

**Hors périmètre (non traités, volontairement) :** `declaration-rsu-espp-france.html` (À STATUER), le lead magnet exclu, l'écosystème prêt, les pages de capture/merci, et la phase NAV-UX (breadcrumbs / navigation retour) — à cadrer séparément.

---

## MENU-4E — AUDIT GLOBAL DE COUVERTURE (16/09/2026)

> **Phase diagnostique uniquement.** Aucune page modifiée, aucune migration, `nav-pages.json` inchangé. Audit de couverture avant NAV-UX / production.

### Décompte global

- **63 fichiers `.html`** dans le dépôt.
- **5 fichiers techniques / source** (exclus) : `succession-colombes.local.bak.html` (sauvegarde), `Lead magnets/apercu-guide-complet.html`, `Lead magnets/apercu-guide-nouveau-design.html`, `Lead magnets/apercu-images.html` (aperçus), `partials/header.html` (gabarit source du header — normal qu'il contienne `<nav id="nav">` sans `NAV:CONFIG`).
- **58 pages LIVE** restantes.

| État | Nb | Détail |
|---|---|---|
| **HEADER CENTRALISÉ** | 48 | = exactement le manifeste (cohérent) |
| **ANCIEN HEADER** | 4 | declaration-rsu-espp-france · Lead magnets/blog-per-vs-assurance-vie-2026 · pret-immobilier-index · simulation-pret-immobilier |
| **SANS HEADER (intentionnel)** | 6 | 404 · merci-avis · merci-guide · guide-5-erreurs-patrimoniaux (capture, nav légère) · Audits SEO/rapport-audit-site-2026-06-10 (interne) · brevo-architecture-contacts (interne) |
| **À STATUER** | 4 | = les 4 pages en ancien header ci-dessus |

### Pages encore en ANCIEN header (tableau F)

| URL | Fichier | Univers logique | CTA actuel | Reco |
|---|---|---|---|---|
| /declaration-rsu-espp-france | `declaration-rsu-espp-france.html` | Patrimoine (fiscalité RSU) | Prendre rendez-vous | **MIGRER** (Patrimoine) — arbitrage |
| /blog/per-vs-assurance-vie-2026 (lead magnet) | `Lead magnets/blog-per-vs-assurance-vie-2026.html` | Lead magnet / landing | Bilan sur-mesure | **À STATUER** (corriger / exclure / retirer) |
| /pret-immobilier-index | `pret-immobilier-index.html` | Immobilier / financement | Prendre rendez-vous | **À STATUER** (Immobilier vs écosystème) |
| /simulation-pret-immobilier | `simulation-pret-immobilier.html` | Simulateurs / financement | Prendre rendez-vous | **À STATUER** (Simulateurs vs écosystème) |

Aucune page oubliée des lots 4A/4B/4C/4D : les seules pages en ancien header sont ces 4, toutes déjà connues et volontairement hors périmètre jusqu'ici.

### Pages sans header (tableau G)

`404.html` (page erreur), `merci-avis.html` / `merci-guide.html` (pages de remerciement post-formulaire), `guide-5-erreurs-patrimoniaux.html` (landing de capture, nav légère), `Audits SEO/rapport-audit-site-2026-06-10.html` + `brevo-architecture-contacts.html` (documents internes non publics). Sans header par nature — aucune action.

### Vérification du header centralisé

Les 48 pages centralisées ont toutes `NAV:CONFIG` + `NAV:START/END`, un `<link>` cohérent (immobilier = `navigation-immobilier.css` corail pour les 7 pages univers Immobilier ; `navigation.css` or pour les 41 autres) et un thème cohérent. **Aucune incohérence** fichier/manifeste/univers/CTA/thème détectée.

### Cohérence `nav-pages.json`

48 entrées, 48 uniques, **0 doublon**, **0 fichier inexistant**, **0 page centralisée absente du manifeste**, 48 pages centralisées trouvées = 48 entrées. Manifeste parfaitement cohérent.

### Pages à arbitrer (détail)

**A. `declaration-rsu-espp-france.html`** — page SEO autonome « Déclaration RSU, ESPP & Stock-Options France | CGP Colombes 92 », H1 « Déclaration RSU, ESPP et stock-options en France », **canonical auto** (indexée pour elle-même), lie déjà vers `/fiscalite-rsu-stock-options`. Univers logique : **Patrimoine** (angle « déclaration » complémentaire de la page service `/fiscalite-rsu-stock-options` et des articles RSU). Page réelle et indexée → **intérêt de la conserver**, recommandation **MIGRER en Patrimoine** (comme les autres pages fiscalité).

**B. `Lead magnets/blog-per-vs-assurance-vie-2026.html`** — **canonical → `/blog/per-vs-assurance-vie-2026`** (l'article de blog) : c'est un **doublon de capture** de l'article, consolidé SEO vers lui. Contient un formulaire (Tally/Brevo), CTA spécifique « Bilan sur-mesure ». Non lié en interne (atteinte via pub/email). 3 anomalies mobiles (déjà documentées). Recommandation : **À STATUER** — soit corriger son header séparément, soit la retirer/rediriger à terme (redondante avec l'article, déjà canonicalisée vers lui). Pas prioritaire.

**C. `pret-immobilier-index.html`** (« Courtier en Prêt Immobilier Colombes 92 ») et **`simulation-pret-immobilier.html`** (« Simulation Prêt Immobilier ») — pages du **domaine principal** (pas de sous-domaine), ancien header, liées au menu principal mais **non liées DEPUIS le header central**. Univers logique : `pret-immobilier-index` → **Immobilier / financement** (recouvre partiellement « Financement / Courtage » = `/courtage-credit-immobilier`) ; `simulation-pret-immobilier` → **Simulateurs**. Recommandation : **À STATUER** — décider migration (univers Immobilier corail / Simulateurs) vs écosystème indépendant. Candidates pour un futur lot dédié, pas une exclusion définitive.

### Orphelines / pages non liées

Non référencées en interne : **`pret-immobilier-index.html`** et **`Lead magnets/blog-per-vs-assurance-vie-2026.html`** (landing pub/email). `merci-avis` / `merci-guide` = post-formulaire (normal). `index.html` et `blog/index.html` sont liés via `/` et `/blog` (non orphelines). Aucune décision SEO prise — cas signalés seulement.

### Tests

`build-header.js --check` → exit 0 (48 pages à jour, idempotent). `check-mobile-nav.js` → **1 seule** page signalée : `Lead magnets/blog-per-vs-assurance-vie-2026.html` (exclue). Toutes les pages du site public sont conformes.

### Décisions nécessaires avant NAV-UX

1. **declaration-rsu-espp-france** : migrer en Patrimoine (recommandé) ou laisser hors périmètre ?
2. **pret-immobilier-index** : migrer (Immobilier corail) ou écosystème indépendant ?
3. **simulation-pret-immobilier** : migrer (Simulateurs, thème or) ou écosystème indépendant ?
4. **Lead magnet PER** : corriger son header, exclure définitivement, ou rediriger/retirer (doublon canonicalisé) ?

Aucune de ces pages n'est bloquante pour NAV-UX ; ce sont les seuls arbitrages de couverture restants.

**STOP.** Audit figé. Aucune modification.

---

## Référence : audit CRÉDIT & SIMULATEURS V2

Voir `docs/CREDIT-SIMULATEURS-V2.md` (phase CREDIT-SIM-0, 17/09/2026) — audit technique préparatoire à la future architecture Crédit / Simulateurs (diagnostic uniquement, aucune implémentation).

---

## MENU-4F — Clôture couverture Header V1 (17/09/2026)

Finalisation de la propagation du header V1 avant NAV-UX. Header V1 conservé (Patrimoine · Immobilier · Simulateurs · Le cabinet · Ressources · CTA) — **pas de Crédit, pas de Header V2**.

### Page migrée

- **`declaration-rsu-espp-france.html`** (`/declaration-rsu-espp-france`) → header centralisé, univers **Patrimoine** actif (desktop, `PATRIMOINE_ACTIVE_DESKTOP`, `aria-current="page"`), thème « site-patrimoine » (or), CTA « Prendre rendez-vous » → `/bilan-patrimonial` (CTA existant conservé). Pas d'état actif Patrimoine mobile (architecture MENU-3, comme les autres pages Patrimoine). Migration via migrateur regex (retrait CSS/JS nav, marqueurs, `navigation.css`) ; **0 ligne SEO modifiée** (title/meta/canonical/H1/H2/FAQ/JSON-LD/OG intacts ; comptes sections/H2/JSON-LD identiques). Manifeste `nav-pages.json` : 48 → **49 pages**.

### Exceptions intentionnelles (non migrées, figées)

| Fichier | Statut | Raison |
|---|---|---|
| `pret-immobilier-index.html` | INTENTIONAL_LEGACY | Legacy Crédit / landing du sous-domaine `pret-immobilier.proactifsconseils.fr` (rewrite `vercel.json`). Décision SEO (consolidation / 301 / maintien Ads / suppression) **reportée au chantier Crédit V2**. |
| `simulation-pret-immobilier.html` | INTENTIONAL_LEGACY | Legacy Simulateur. Migration prévue vers `/simulateurs/capacite-emprunt` (301) en **CS-4** comme livraison atomique. Inutile de centraliser une page destinée à être migrée. |
| `Lead magnets/blog-per-vs-assurance-vie-2026.html` | LANDING_SPECIAL | Landing d'acquisition (canonical → article `/blog/per-vs-assurance-vie-2026`, formulaire Tally/Brevo, CTA « Bilan sur-mesure »). N'a pas vocation à devenir une page Ressources normale. |

Ces 3 pages : `git diff` = 0. `vercel.json` et `sitemap.xml` inchangés.

### Contrôle mobile — Lead magnet PER

Anomalies **toujours présentes** (inchangées) : `menu-mobile-deborde` (pas de `max-height`/`overflow-y` sur `.mobile-menu`), `menu-ne-se-referme-pas` (pas d'auto-fermeture), `nav-invisible-avant-scroll` (`#nav:not(.scrolled)` transparent + bandeau `.breadcrumb`). **Non corrigées dans MENU-4F** : cette landing est une exception LANDING_SPECIAL en attente d'arbitrage (correction / exclusion / suppression) au chantier Crédit V2 ; la modifier maintenant (CSS/JS) risquerait son funnel/design. Anomalie **documentée, non masquée** dans `check-mobile-nav.js` (conformément à la règle « ne jamais masquer une vraie anomalie »). → décision Medy requise : correctif mobile minimal maintenant, ou report avec l'arbitrage de la page.

### Pages sans header (intentionnel, confirmées)

`404.html`, `merci-avis.html`, `merci-guide.html`, `guide-5-erreurs-patrimoniaux.html` (capture), `Audits SEO/rapport-audit-site-2026-06-10.html` (interne), `brevo-architecture-contacts.html` (interne). Aucune n'a reçu de header.

### Inventaire final par statut (58 pages LIVE + 5 techniques)

| Statut | Nb | Pages |
|---|---|---|
| **CENTRALIZED** | 49 | index + 48 pages centralisées (dont declaration-rsu-espp-france) |
| **INTENTIONAL_LEGACY** | 2 | pret-immobilier-index · simulation-pret-immobilier |
| **LANDING_SPECIAL** | 1 | Lead magnets/blog-per-vs-assurance-vie-2026 |
| **NO_HEADER_INTENTIONAL** | 6 | 404 · merci-avis · merci-guide · guide-5-erreurs-patrimoniaux · Audits SEO/rapport-audit-site-2026-06-10 · brevo-architecture-contacts |
| **TECHNICAL_EXCLUDED** | 5 | succession-colombes.local.bak · 3× Lead magnets/apercu-* · partials/header.html (gabarit source) |

**Aucune page UNKNOWN / À STATUER / FORGOTTEN.** Couverture Header V1 close (49+2+1+6 = 58 live).

### Tests

`build-header.js --check` → exit 0 (49 pages à jour). `check-mobile-nav.js` → 1 page signalée : le lead magnet (exception documentée). Rendu headless réel `declaration-rsu-espp-france` : desktop 1024/1440/1920 → aucun débordement, méga Patrimoine `display:grid`, Patrimoine actif ; mobile 375/390/430 → aucun débordement, `.mobile-menu` `max-height:772px`, sous-menu Patrimoine actif. MENU-2B et MENU-3.1 figés, inchangés.

### Dette reportée

- **Crédit V2** : sort de `pret-immobilier-index` + sous-domaine `pret-immobilier.proactifsconseils.fr` (consolidation / 301 / Ads / suppression). Correctif mobile du lead magnet PER (ou retrait).
- **Simulateurs V2** : migration `simulation-pret-immobilier` → `/simulateurs/capacite-emprunt` (301) en CS-4 ; correction des typos title/H1 (« e » parasite) à cette occasion.

### Prochaine phase : NAV-UX

**Non commencée.** Objectif : harmoniser les fils d'Ariane (breadcrumbs) et la navigation parent/retour sur l'ensemble du site. Aucun breadcrumb / `history.back()` / fil d'Ariane modifié en MENU-4F.

**Statut : couverture Header V1 clôturée.** Header V2 non commencé.

---

## MENU-4F.1 — Correctif mobile landing PER (17/09/2026)

Correctif **mobile minimal** sur la landing spéciale `Lead magnets/blog-per-vs-assurance-vie-2026.html`. La page **reste LANDING_SPECIAL** : header central **non appliqué**, **non ajoutée** à `nav-pages.json`, design/funnel/SEO inchangés.

**3 anomalies corrigées** (cause → correctif) :
1. `menu-mobile-deborde` : `.mobile-menu` sans `max-height`/`overflow-y` → ajout de `max-height: calc(100dvh - 72px)` (+ fallback `vh`) et `overflow-y: auto` (+ `-webkit-overflow-scrolling`). Le menu défile désormais sur écran court.
2. `nav-invisible-avant-scroll` : `#nav { background: transparent }` + règles `#nav:not(.scrolled)` (liens/hamburger blancs) sous un bandeau `.breadcrumb` clair → `#nav` rendu **opaque par défaut** (`rgba(250,250,247,.98)`, comme l'état scrollé) et retrait des 3 règles `#nav:not(.scrolled)` ; liens/hamburger reprennent leur couleur foncée de base (`var(--ink)`) → nav lisible avant scroll.
3. `menu-ne-se-referme-pas` : aucun script d'auto-fermeture → ajout d'un petit script `mobile-menu-autoclose` fermant `.mobile-menu` au clic sur un lien.

**Tests** : `check-mobile-nav.js` → **✓ 0 anomalie sur 63 pages**. `build-header.js --check` → exit 0 (49 pages centralisées inchangées). Rendu headless : desktop 1024/1440/1920 (nav opaque, liens foncés, aucun débordement) ; mobile 375/390/430 (nav+hamburger visibles avant scroll, ouverture/fermeture au clic, `max-height:772px`/`overflow-y:auto`) ; faible hauteur 375×420 (menu défilable, `max-height:348px`).

**SEO/funnel inchangés** : 0 ligne title/meta/canonical/robots/H1/H2/JSON-LD/OG/Tally/Brevo/`/api/` modifiée (diff limité au CSS nav/mobile + script autoclose). URL, formulaire, tracking, CTA « Bilan sur-mesure » préservés.

**Hors périmètre (documenté, non corrigé)** : léger débordement horizontal à **320 px** (élément de contenu de la landing plus large que le viewport) — pré-existant, non lié aux 3 anomalies, non signalé par le checker. À traiter éventuellement lors de l'arbitrage Crédit V2 de cette page.

**Statut** : landing PER conforme mobile, toujours exception LANDING_SPECIAL (header central non appliqué).

## NAV-UX-0 — Audit breadcrumbs & navigation parente (17/09/2026)

Audit en lecture seule des 49 pages centralisées. Voir `docs/NAV-UX-0-AUDIT.md`.
- 47 breadcrumbs visibles, 2 `BreadcrumbList` JSON-LD, 0 `history.back`.
- Classes : A=2, B=40, C=0, D=5, E=2, F=0.
- Breadcrumb = contenu de page (HTML + CSS dupliqués), hors header centralisé.
- Cible : généraliser le JSON-LD, réparer les 5 incohérences, imbriquer l'univers Immobilier sous `/immobilier` — destinations réelles uniquement (pas de /patrimoine ni /ressources).
- NAV-UX-1 non démarré.

## NAV-UX-1 — Breadcrumbs centralisés (17/09/2026)

Système de fil d'Ariane généré, **indépendant du header**. Voir `docs/NAV-UX-1A-BREADCRUMBS.md` (moteur) et `docs/NAV-UX-1B-BREADCRUMBS.md` (généralisation).

- **Source de vérité** : `scripts/breadcrumb-pages.json` (48 pages, index.html exclu).
- **Générateur** : `scripts/build-breadcrumbs.js` → HTML visible `<nav aria-label="Fil d'Ariane"><ol>` (marqueurs `<!-- BREADCRUMB:START/END -->`) **+** `BreadcrumbList` JSON-LD en `<head>` (`<!-- BREADCRUMB_JSONLD:START/END -->`). `--check` valide couverture, cohérence visible↔JSON-LD, résidu legacy, BreadcrumbList unique, parents réels.
- **CSS unique** : `assets/css/breadcrumb.css` (fond sable, 72px sous header, teal/slate, responsive, wrap naturel). CSS inline legacy `.breadcrumb`/`.breadcrumb-bar` supprimé.
- **Hiérarchies** : Patrimoine `Accueil › Service` (pas de hub `/patrimoine`) ; Immobilier `Accueil › Immobilier › Page` ; Blog `Accueil › Blog › Article` ; Local `Accueil › Conseiller patrimoine Colombes › Ville`. Destinations réelles uniquement.
- **Règle UX** : breadcrumb = navigation secondaire unique. Pas de bouton Retour, jamais `history.back()`.
- **Accueil** (`/`) : sans breadcrumb.
- Ne modifie jamais `NAV:START/END` ni le header.

---

## Phase 2A-1a — Restructuration par piliers métier (24/09/2026)

Branche `seo-phase-2a-header-navigation`, base `origin/main` 570423d. Modifications faites **uniquement** via la source centralisée (`partials/header.html` + `scripts/build-header.js`), puis régénération des pages du manifeste.

### Barre desktop
`LOGO` · **Patrimoine ▾** · **Immobilier ▾** · **Financement ▾** · **Entreprises & Pro ▾** · Conseils · Cabinet · `CTA`

- **Patrimoine** (mega 4 colonnes, `.mega-panel--4`) — Gérer & optimiser : Bilan patrimonial, Optimisation fiscale, Déclaration d'impôts · Investir & préparer : Placements financiers, Préparation retraite · Transmettre : Transmission · Actionnariat salarié : RSU & actions gratuites (`/fiscalite-rsu-stock-options`), Déclaration RSU & ESPP (`/declaration-rsu-espp-france`).
- **Immobilier** (mega 2 colonnes, `.mega-panel--2`) — Vendre : Vendre un bien immobilier, Estimation immobilière, Succession immobilière · Investir : Investissement immobilier, Immobilier ancien, SCPI. Retirés de la navigation (pages conservées) : « Découvrir Proactifs Immobilier → », la carte « Vous avez un bien à Colombes ? » et, en mobile, le lien « Découvrir… » et le bouton « Estimer mon bien » de la sous-vue (doublons de « Estimation immobilière »).
- **Financement** (mega 2 colonnes) — Financer votre projet : Courtage crédit immobilier, Prêt immobilier · Simuler votre financement : Tous les simulateurs, Capacité d'emprunt, Mensualité de crédit, Taux d'endettement. Remplace l'entrée autonome « Simulateurs ».
- **Entreprises & Pro** (dropdown `.nav-drop`) — Cession d'entreprise. Prévu pour accueillir plus tard Dirigeants / Professions libérales (ajouter un `<a>` dans `#drop-entreprises` et `#m-entreprises`, uniquement quand les pages existent).
- **Conseils** (lien direct vers `/blog`, ex-dropdown « Ressources » ; arbitrage du 24/09/2026 : pas de niveau intermédiaire tant qu'il n'y a qu'une destination). Même logique en mobile : lien direct, pas de sous-vue.
- **Cabinet** (lien simple, ex-« Le cabinet »).

### Tokens d'état actif (NAV:CONFIG)
Nouveaux : `FINANCEMENT_ACTIVE_DESKTOP/MOBILE`, `ENTREPRISES_ACTIVE_DESKTOP/MOBILE`, `PATRIMOINE_ACTIVE_MOBILE`, `RESSOURCES_ACTIVE_MOBILE`. Les tokens `RESSOURCES_*` pilotent désormais l'entrée « Conseils » (nom conservé pour ne pas toucher les 26 configs d'articles). Configs modifiées : `courtage-credit-immobilier.html` (Immobilier → Financement), `simulateurs/*.html` (Financement), `cession-entreprise.html` (Patrimoine → Entreprises & Pro).

### `/pret-immobilier` intégrée au header commun
Page ajoutée au manifeste (54 pages). Procédure section 7 : suppression du bloc CSS de nav inline, `<link>` vers `assets/css/navigation.css`, bloc NAV:CONFIG/START/END à la place de l'ancienne nav, suppression du JS inline scroll/hamburger/fermeture, `<script src="/assets/js/navigation.js" defer>`. CTA contextuel conservé : « Simuler mon prêt → » (`#simulateur`). Title, meta, H1, canonical, JSON-LD, contenu et fil d'Ariane visuel inchangés. L'exclusion de la section 5 (sous-domaine) n'a plus d'objet : le sous-domaine redirige en 308 depuis le 23/09/2026.

### Responsive
Bascule hamburger à **1100 px** (`@media (max-width: 1100px)`, auparavant 900 px) dans les deux CSS de navigation : desktop ≥ 1101 px, menu mobile sliding ≤ 1100 px (4 sous-vues : Patrimoine, Immobilier, Financement, Entreprises & Pro). À 1101 px, 30-35 px de marge restent entre logo/liens et liens/CTA ; en dessous, « Entreprises & Pro » serrerait la barre. Les règles inline à 900/768 px encore présentes dans certaines pages ne font que masquer la nav desktop : aucun conflit.

### Accessibilité (navigation uniquement)
- Suppression de `role="menu"` / `role="menuitem"` (panneaux) et de `aria-haspopup` (déclencheurs, hamburger, parents mobiles) : modèle « disclosure » (bouton + `aria-expanded` + `aria-controls`), adapté à une navigation de site.
- `<nav aria-label="Navigation principale">`, chevrons `aria-hidden="true"`.
- JS : Escape ne rouvre plus le panneau via `focusin` quand le focus revient au déclencheur ; un clic juste après une ouverture au survol ne referme plus le panneau.

### Outils
`scripts/check-mobile-nav.js` vérifie désormais les 4 sous-vues mobiles (patrimoine, immobilier, financement, entreprises) et le lien direct « Conseils » → `/blog`.
