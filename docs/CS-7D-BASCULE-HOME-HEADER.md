# CS-7D — Bascule home + header vers l'écosystème Simulateurs V2

**Projet :** Proactifs Conseils — Simulateurs V2
**Date :** 19 septembre 2026
**Statut :** ✅ Bascule réalisée et testée en local — **non commité, non déployé**. En attente de validation ChatGPT avant CS-7E (production).

---

## 1. État git initial + protection index.html

- Branche `main`, HEAD `fdb0580`. CS-7B/CS-7C non commités (accumulés).
- `index.html` portait une **modification locale préexistante** (section Diagnostics `#lead-gen` + autres) **hors CS-7**. Elle a été **intégralement préservée** : seules la section `#simulateurs`, son CSS et son JS legacy ont été modifiés.
- **Aucun** `git checkout/restore/reset/clean/add .` sur index.html. Édition chirurgicale par ancres (jamais de réécriture globale).

## 2. Ancienne section supprimée (widget legacy)

Section home `#simulateurs` = widget à 5 onglets (Crédit, Capacité, Fiscal, SCPI, Retraite) avec calculateurs inline + Chart.js. **Retirée intégralement** :
- **HTML** : `<section id="simulateurs">` legacy (onglets, sliders, panneaux, canvases).
- **CSS** : bloc `.sim-tabs / .sim-tab / .sim-panels / .sim-panel / .sim-form / .sim-results / .field / .range-row / .range-val / .sim-btn / .result-card / .chart-wrap / .result-note` (exclusifs au widget — vérifié : 0 usage ailleurs).
- **Commentaire head** Chart.js retiré.

## 3. Fonctions JS retirées

`switchSim`, `updateRange`, `calcCredit`, `calcFiscal`, `calcScpi`, `calcRetraite`, `calcCapacite`, + `loadChartJs` + l'`IntersectionObserver` `simulObs`. **Vérification préalable** : usages exclusivement liés au widget retiré (0 référence ailleurs). Après retrait : **0 orphelin** (`switchSim/calc*/updateRange/loadChartJs/simulObs/chart*` = 0 dans index.html).

## 4. Chart.js

Recherche `Chart` / `canvas` / `cdnjs.cloudflare.com` : usages **exclusivement** dans le widget legacy. Chargement Chart.js (lazy-load cdnjs 4.4.1) **supprimé**. Après : `cdnjs…Chart` = 0, `new Chart(` = 0, `chartCredit/Capacite/Scpi/Retraite/Fiscal` = 0. Aucune autre section n'en dépendait.

## 5. Nouvelle section home `#simulateurs`

Conserve `<section id="simulateurs" class="sec sec-sand">` (ancre préservée). Plus légère que le hub :
- Eyebrow : **OUTILS & SIMULATEURS** (`.sec-label`).
- **H2** : « Préparez votre projet avec *nos simulateurs* » (pas de nouvelle H1).
- Intro courte.
- **3 cartes V2** (icône + titre + question + CTA), entièrement `<a>`, CTA en `<span>` :
  - Capacité d'emprunt → `/simulateurs/capacite-emprunt`
  - Mensualité de crédit → `/simulateurs/mensualite-credit`
  - Taux d'endettement → `/simulateurs/taux-endettement`
- **CTA secondaire** : « Voir tous les simulateurs → » → `/simulateurs`.
- **Bloc « Besoin d'aller plus loin ? »** : 3 liens **services** (pilules, visuellement distincts des simulateurs) → `/optimisation-fiscale-ile-de-france`, `/investissement-scpi-hauts-de-seine`, `/preparation-retraite`.

Design cohérent avec les pages V2 (tokens `--sand/--teal/--gold`, cartes blanches), section volontairement plus compacte que le hub (pas de recopie du hub).

## 6. Fiscalité / SCPI / Retraite

Anciens calculateurs supprimés (pas de faux simulateurs conservés). **URLs services vérifiées réelles** (présentes dans `nav-pages.json` + rewrites `vercel.json`) avant insertion : optimisation-fiscale-ile-de-france ✓, investissement-scpi-hauts-de-seine ✓, preparation-retraite ✓. Bloc secondaire discret créé, identifié **services/accompagnement**, pas simulateurs.

## 7. Header global

- Source unique `partials/header.html` : `Simulateurs → {{HOME_PREFIX}}#simulateurs` **→ `/simulateurs`** (desktop `nav-link` **et** mobile `m-item`).
- `node scripts/build-header.js` : régénération → **54 pages** portent désormais `Simulateurs → /simulateurs`. `build-header --check` : **exit 0**.
- Aucun header édité à la main.

## 8. Home header (§10)

Après rebuild, la home pointe elle aussi vers **`/simulateurs`** (desktop + mobile), et **non** `#simulateurs` (volontaire). L'ancre `id="simulateurs"` reste **présente** sur la home pour compatibilité avec d'éventuels anciens liens externes.

## 9. Occurrences #simulateurs avant / après (§11)

- **Avant** : ~55, très majoritairement le header central (`/#simulateurs`) + quelques liens éditoriaux.
- **Après rebuild** : header central → `/simulateurs` partout (0 `#simulateurs`). Liens éditoriaux restants classés « voir les simulateurs » → **migrés vers `/simulateurs`** dans 4 fichiers réels :
  - `blog/conseiller-patrimoine-ile-de-france.html`
  - `blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026.html`
  - `blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026.html`
  - `simulation-pret-immobilier.html` (page redirigée 308, cohérence éditoriale)
- **Résultat** : `href*#simulateurs` (hors `.bak`) = **0**.
- **Conservé volontairement** : `id="simulateurs"` (ancre home, compat) ; `succession-colombes.local.bak.html` (2 liens) — **fichier de sauvegarde non servi** (absent de nav-pages/sitemap), non modifié.

## 10. SEO home (inchangé — §12)

- title : « Gestion de Patrimoine à Colombes (92) | Proactifs Conseils » — **inchangé**.
- **H1** : 1 seule (inchangée). Nouvelle section en **H2/H3**.
- canonical : `https://proactifsconseils.fr/` — **inchangé**.
- Pas de recopie de paragraphes SEO du hub.

## 11. Cannibalisation (§13)

La home ne contient **plus aucun moteur de calcul** (mensualité / capacité / endettement) : vérifié `calculateMonthlyPayment/calculateBorrowingCapacity/calculateDebtRatio` = 0 dans index.html. Les calculs se font **uniquement** sur `/simulateurs/capacite-emprunt`, `/mensualite-credit`, `/taux-endettement`. La home **nomme** et **oriente** vers les outils sans y répondre.

## 12. Analytics (§14)

Cartes home dotées de `data-tool="capacite|mensualite|endettement"` (prêtes pour un tracking futur). **Aucun système analytics ajouté** à la home : brancher `SimUI.track` sur la home aurait nécessité d'y charger `ui.js`/`hub.js` (complexification exclue par le cadrage). `sanitize`/`FORBIDDEN_KEYS` **non modifiés**. Aucune donnée financière ni PII. Le tracking du hub reste prioritaire (déjà en place).

## 13. Responsive (§15-16)

Section `#simulateurs` testée **1440 / 1024 / 768 / 430 / 390 / 375 / 320** :

| Largeur | Colonnes cartes | Overflow section |
|---|---|---|
| 1440 / 1024 | 3 | ✅ aucun |
| 768 | 2 | ✅ aucun |
| 430 / 390 / 375 / 320 | 1 | ✅ aucun |

- Header : lien `Simulateurs → /simulateurs` présent **desktop ET mobile** à toutes largeurs ✅. Menus Patrimoine/Immobilier/Ressources inchangés.
- **Bonus** : le scroll horizontal document qui existait à 375/390px (dû au widget legacy retiré) a **disparu**. Reste un léger overflow **document** à 320px, **hors section Simulateurs** (`#simulateurs *` = 0 débordement) et hors périmètre.

## 14. Tests (§17-18)

Tests CS-7 étendus (bloc H — bascule home + header) : ancre `id="simulateurs"` ; widget legacy absent (fonctions + Chart.js + markup) ; 3 URLs V2 + `/simulateurs` ; aucune H1 supplémentaire ; `partials/header.html → /simulateurs` (desktop+mobile) ; header home → /simulateurs ; cartes `data-tool` sans moteur de calcul ; redirect legacy toujours configurée. Test CS-7C `G5` mis à jour (header désormais migré).

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **289 / 289** |
| `node --test tests/generate-sitemap.test.js` | ✅ 4 / 4 |
| `node scripts/build-header.js --check` | ✅ exit 0 |
| `node scripts/build-breadcrumbs.js --check` | ✅ 52 / 52 |
| `node scripts/check-mobile-nav.js` | ✅ 70 pages, aucune régression |

## 15. QA navigation (§19)

Liens vérifiés (statique) :
- HOME → carte Capacité → `/simulateurs/capacite-emprunt` ✅
- HOME → carte Mensualité → `/simulateurs/mensualite-credit` ✅
- HOME → carte Endettement → `/simulateurs/taux-endettement` ✅
- HOME → « Voir tous les simulateurs » → `/simulateurs` ✅
- HEADER (desktop + mobile) → `/simulateurs` ✅
- HUB → 3 enfants ✅ (inchangé) ; enfants → breadcrumb « Simulateurs » → `/simulateurs` ✅ (inchangé)

## 16. État git final

```
Branche : main   HEAD : fdb0580 (inchangé — aucun commit)

Modifiés (tracked) — principaux :
  index.html                                 (widget legacy retiré + nouvelle section + header /simulateurs)
  partials/header.html                       (Simulateurs -> /simulateurs)
  + 53 pages .html                           (header central régénéré -> /simulateurs)
  blog/conseiller-patrimoine-ile-de-france.html
  blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026.html
  blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026.html
  simulation-pret-immobilier.html            (liens éditoriaux -> /simulateurs)
  tests/simulators/cs7-hub.test.js           (bloc H CS-7D + G5)
  + (accumulés CS-7B/C) ui.js, nav-pages.json, breadcrumb-pages.json, sitemap.xml,
    simulateurs/{capacite-emprunt,mensualite-credit,taux-endettement}.html,
    tests cs4b/cs4c/cs6
Nouveaux (untracked) :
  simulateurs/index.html, assets/js/simulators/hub.js, docs/CS-7A..D
Préservé, NON touché : modification locale préexistante d'index.html (Diagnostics, etc.)
```

`git diff --stat` (résumé) : **61 fichiers, +470 / −793** (net −323 lignes ≈ retrait du widget legacy).

## 17. Anomalies

Aucune. La bascule est propre : legacy retiré sans orphelin, home orientée vers les outils V2, header global migré, SEO home préservé, aucun moteur de calcul résiduel sur la home.

*Fin CS-7D. Bascule home + header réalisée et vérifiée en local. Aucun commit / push / merge / déploiement. CS-7E (production + QA) non démarré. En attente de validation ChatGPT.*
