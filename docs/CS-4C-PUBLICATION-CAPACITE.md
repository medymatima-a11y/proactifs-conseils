# CS-4C — Publication contrôlée : simulateur capacité d'emprunt

**Site :** proactifsconseils.fr · **Date de publication :** 18/09/2026
**Branche :** `credit-simulateurs-v2` · **Base auditée :** CS-4B.1 `dd5c302`
**Page :** `/simulateurs/capacite-emprunt`

---

## PHASE A — Audit pré-publication (lecture seule)

| Domaine | Constat | Verdict |
|---|---|---|
| Git | HEAD `dd5c302`, branche `credit-simulateurs-v2`, `index.html` (préexistant) exclu | GO |
| Socles gelés | `core/calc-credit/calc-immo/credit-policy/rates` diff **vide** ; `computeCapacityV2`/`buildFinancingInput`/`calculateRequiredIncomeForLoan` inchangés ; `ACTIVE_MARKET_REFERENCE`/`LEGACY_REFERENCE` intacts | GO |
| Calcul | endettement 0,35 (CS-3) · locatif 70 % · assurance CS-3 · durées 10/15/20/25 · **aucun verdict bancaire** | GO |
| Taux | `ACTIVE_MARKET_REFERENCE` + `getMarketRate()` · **aucun taux codé dans le HTML** · cards 200/300/400 k€ dynamiques | GO |
| Fraîcheur | `CURRENT` (réf. 2026-09-17, âge 1 j) → publication autorisée | GO |
| Design system | tokens page (forest/teal/gold/ivoire) cohérents ; Fraunces/DM Sans conservés | GO |
| CTA hero/wizard | étaient **teal** → passés en **or** (voir B1) | WARNING → corrigé |
| Hero simulateur | version claire compacte **conservée** (exception outil, cf. §Exception) | GO |
| CTA fin de page | bloc forest + bouton or conservé | GO |
| Logo | `/images/proactifs-logo.png` (chemin absolu, asset réel 15 Ko) — aucun changement | GO |
| Footer | footer scopé cohérent — pas de centralisation (backlog FOOTER-CENTRALISATION) | GO |
| SEO | title / meta / canonical / 1×H1 / 8 H2 / FAQ / BreadcrumbList / FAQPage ; pas de keyword stuffing ; pas de « Colombes » forcé | GO |
| Lead / API | `/api/subscribe` accepte déjà `service:"credit"` → **connectable SANS modification API/Supabase/schéma** | GO |
| Analytics | tag GA4 absent de la page (reste du site l'a) → ajouté (B8) ; events déjà émis par l'adaptateur, sans PII | WARNING → corrigé |
| OG image | pas d'asset dédié → réutilisation de `courtier-credit.webp` (asset de marque valide, thème crédit) | GO (interim) |
| Header | non couvert (pas de marqueurs NAV) → intégré (B4) | WARNING → corrigé |
| Breadcrumb | hand-built → centralisé (B5), Simulateurs non cliquable | WARNING → corrigé |
| Routing | `cleanUrls:true` sert `/simulateurs/capacite-emprunt` — aucun rewrite nécessaire | GO |
| Sitemap | absent → ajouté (B3), lastmod réel 2026-09-18 | WARNING → corrigé |
| Responsive | 0 débordement 320→1920 (page identique à l'état validé CS-4B.1) | GO |
| Accessibilité | 1 H1, aria-live/expanded, fieldset/legend, focus, clavier ; contraste bouton or #D2B41E / texte #241C06 ≈ 8,7:1 (AAA) | GO |

**Verdict Phase A : GO — aucun blocage P0/P1.**

### Exception documentée
`SIMULATEUR / OUTIL → HERO CLAIR COMPACT AUTORISÉ` : le hero forest des pages services n'est **pas** appliqué au simulateur (page outil, action immédiate, réduction de friction). `proactifs-design.skill` **non modifié** ; évolution renvoyée à DESIGN-SYSTEM-V2.

---

## PHASE B — Publication contrôlée

### B1 — CTA primaire → or
Règle `.cap-wrap .sim-cta` : `background:var(--teal)` → `background:var(--gold)` (`#D2B41E`), texte `#241C06`, hover `#E4C63A`.
Concerne : CTA hero, boutons « Continuer » / « Voir mon estimation », submit lead, bouton « Être recontacté ».
**Teal conservé** pour : boutons secondaires « Retour » (`.sim-cta--ghost`), états sélectionnés, progress bar, labels, liens, breadcrumb, accents.
Gold retenu = **#D2B41E** (or de marque vérifié Proactifs), et non `#C4973A` du brief, par cohérence avec le CTA conversion déjà en place et la charte.

### B2 — Robots
`noindex,nofollow` → `index, follow` (convention du site : toutes les pages publiques utilisent `index, follow`).

### B3 — Sitemap
Entrée `https://proactifsconseils.fr/simulateurs/capacite-emprunt` ajoutée via `scripts/generate-sitemap.js`.
Correctifs générateur : récursion dans `simulateurs/` ajoutée ; exclusion des fichiers `*.bak.html` (sauvegardes locales). `lastmod` = **2026-09-18** (date réelle, dérivée du commit).

### B4 — Header centralisé
Page ajoutée à `scripts/nav-pages.json`. Marqueurs `NAV:START/END` + `NAV:CONFIG {"tokens":{"HOME_PREFIX":"/"}}` posés ; header régénéré par `scripts/build-header.js` depuis `partials/header.html` (**partial non modifié**, menu V1 inchangé, aucun mega-menu Crédit/Simulateurs).

### B5 — Breadcrumb centralisé
Page ajoutée à `scripts/breadcrumb-pages.json` : `Accueil > Simulateurs > Capacité d'emprunt`.
« Simulateurs » **non cliquable** (hub inexistant) sans URL fictive. Le générateur `scripts/build-breadcrumbs.js` a été étendu pour supporter un crumb sans `url` : rendu `<span>` (visible) + `ListItem` name-only (JSON-LD, sans `item`). BreadcrumbList régénéré (marqueurs centralisés).

### B6 — Lead réel (sans modification d'infrastructure)
`/api/subscribe` réutilisé tel quel (`service:"credit"` déjà supporté). L'adaptateur `init()` accepte désormais un `leadTransport` injecté ; la page injecte un transport `fetch('/api/subscribe')`. Gestion : `loading` (bouton désactivé), `success` (message), `error` (réactivation), **anti double-submit** (`data-submitting`). Un bouton « Être recontacté par un conseiller » (`data-action="open-lead"`) a été ajouté au résultat pour rendre le formulaire accessible (le formulaire existait mais n'avait aucun déclencheur). **Aucune modification API/Supabase/Brevo/Systeme.io/schéma.**

### B7 — Consentement
Mention réutilisant le pattern du site (« Vos données restent strictement confidentielles et ne sont jamais revendues »), complétée de l'information de transmission à Proactifs Conseils au submit. Pas de nouvelle politique inventée.

### B8/B9 — Analytics (sans PII)
Tag GA4 `G-P53RQGXJZX` (+ `AW-835423035`) ajouté selon la convention du site. Pont `dataLayer → gtag('event',...)` relayant uniquement les 5 événements whitelistés (le site utilise gtag.js direct, pas GTM).
Événements (déjà émis par l'adaptateur, buckets/catégories only) :
- `simulation_started` : passage étape 1→2 (une fois).
- `simulation_completed` : résultat généré.
- `simulation_result` : `{bucket, duree, reliability, freshness}` — **aucun montant**.
- `financing_cta_clicked` : ouverture du formulaire de rappel.
- `financing_lead_submitted` : lead soumis avec succès.
`ui.js` whiteliste ces 5 events et **supprime** toute clé PII (email, nom, prénom, tél, montant, revenu, apport, loanAmount…).

### B10 — Maillage entrant
`/courtage-credit-immobilier` : lien contextuel « Simuler ma capacité d'emprunt » ajouté dans la section « Calculez votre capacité d'emprunt » (ancre naturelle, non sur-optimisée). `/immobilier` : non modifié (contexte jugé non naturel).

### B11 — Maillage sortant
CTA conversion → `/courtage-credit-immobilier` conservé. Liens sortants existants inchangés.

### B12 — Open Graph
`og:image` = `https://proactifsconseils.fr/images/courtier-credit.webp` (asset valide). `og:title/description/url/type` conservés.

### Tests & contrôles
- `node --test tests/simulators/*.test.js` : **191 / 191 PASS, 0 FAIL** (dont nouveau `cs4c-publication.test.js`).
- `build-header.js --check` : 0 désynchronisation.
- `build-breadcrumbs.js --check` : **49/49** conformes.
- `check-mobile-nav.js` : 65 pages, 0 régression.
- Test comportemental headless (lead + analytics, endpoint stubbé, **aucune donnée réelle**) : 1 seul POST `/api/subscribe`, `service:"credit"`, anti double-submit OK, 5 events déclenchés une fois, **aucune PII** dans les events, message succès affiché.

### Socles gelés (diff vide)
CS-1 · CS-3 · CS-3.5 · `computeCapacityV2` · `buildFinancingInput` · `calculateRequiredIncomeForLoan` · `ACTIVE_/LEGACY_REFERENCE`. `partials/header.html` non modifié. `index.html` (modification préexistante) **exclu du commit**.

### Git / publication
- Commit : `CS-4C : publication simulateur capacite emprunt` sur `credit-simulateurs-v2`.
- Merge contrôlé vers `main` (pas de force push, pas de reset).
- Déploiement Vercel (git-connected) → vérification statut réussi.
- Smoke tests production (HTTP 200, canonical, robots index, logo, header, breadcrumb, hero, simulateur, résultat, cards, FAQ, CTA, footer, sitemap public, mobile 390).

### B26 — Google Search Console (action humaine)
Pas de soumission automatique fiable dans le repo → **action humaine** :
Inspecter `https://proactifsconseils.fr/simulateurs/capacite-emprunt` dans GSC → « Demander une indexation ». Vérifier la prise en compte du sitemap.

### B27 — Agent SEO (données à suivre)
URL · date publication 2026-09-18 · mot-clé principal « simulateur capacité d'emprunt » · intentions secondaires (capacité emprunt revenu, calcul capacité emprunt immobilier) · impressions · clics · CTR · position · requêtes émergentes. (Pas de données GSC inventées.)

---

## Backlog (documenté, non implémenté)

**DESIGN-SYSTEM-V2** — mettre `proactifs-design.skill` à jour : navigation V1, mega-menus, drawer mobile, breadcrumbs centralisés, CTA contextuels, pages Immobilier, pattern Simulateurs, hero outil clair, cards simulateurs, footer centralisé.

**FOOTER-CENTRALISATION** — chantier séparé : centraliser le footer (aujourd'hui inline par page).

**Notes complémentaires** : og:image dédiée au simulateur à créer (interim = courtier-credit.webp) ; `source` du lead figé « Quiz bilan patrimonial » côté `/api/subscribe` (libellé générique — nécessiterait une évolution API, hors scope).
