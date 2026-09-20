# CS-7C — Intégration / indexation du HUB /simulateurs

**Projet :** Proactifs Conseils — Simulateurs V2
**Date :** 19 septembre 2026
**Statut :** ✅ Hub prêt à publier/indexer, intégration locale terminée et testée — **non commité, non déployé**. En attente de validation ChatGPT avant CS-7D.

> CS-7C = intégration/indexation locale. La bascule home + lien header global reste réservée à CS-7D. Le hub CS-7B est **gelé** (design/cartes/textes/FAQ/analytics inchangés).

---

## 1. État git initial

- Branche `main`, HEAD `fdb0580` (CS-6 en production). CS-7B non commité.
- `index.html` : modification locale préexistante **hors périmètre — non touchée** (vérifié : le diff ne contient ni le header, ni la section `#simulateurs`, ni `switchSim`/`Chart.js` ; `build-header` la laisse « à jour »).
- Aucun `git add .` / `-A` / `reset --hard` / `clean`.

## 2. Fichiers modifiés (CS-7C)

| Fichier | Changement |
|---|---|
| `simulateurs/index.html` *(nouveau, CS-7B)* | `robots` → **index, follow** ; breadcrumb preview-local → **central** (marqueurs) |
| `simulateurs/capacite-emprunt.html` | breadcrumb : **Simulateurs cliquable** → /simulateurs (builder) |
| `simulateurs/mensualite-credit.html` | idem |
| `simulateurs/taux-endettement.html` | idem |
| `scripts/nav-pages.json` | + `simulateurs/index.html` (enregistrement page) |
| `scripts/breadcrumb-pages.json` | + entrée hub ; + `url:/simulateurs` sur le crumb « Simulateurs » des 3 enfants |
| `sitemap.xml` | + `/simulateurs` (régénéré, 54 URLs) |
| `tests/simulators/cs7-hub.test.js` | preview → publication-ready (24 tests) |
| `tests/simulators/cs4b-page.test.js` · `cs4c-publication.test.js` · `cs6-endettement.test.js` | assertions breadcrumb enfants : Simulateurs **cliquable** |

Reportés de CS-7B (toujours non commités) : `assets/js/simulators/ui.js` (extension additive), `assets/js/simulators/hub.js`.
**`partials/header.html` : NON modifié** (le lien global « Simulateurs » reste `/#simulateurs` — migration = CS-7D).

## 3. Robots / Canonical

- Hub : `robots` = **`index, follow`** · **0** noindex/nofollow résiduel · **0** URL preview/localhost.
- `canonical` = `https://proactifsconseils.fr/simulateurs` (unique).

## 4. Header du hub

- `simulateurs/index.html` ajouté à `nav-pages.json` → **header central** injecté (bloc `NAV:START/END` présent, `build-header --check` **exit 0**).
- `partials/header.html` inchangé → le lien global « Simulateurs » pointe **toujours** `/#simulateurs`. Le hub reçoit le header, mais le header global ne pointe pas encore vers lui (conforme CS-7C).

## 5. Breadcrumb du hub

- Preview-local retiré, **breadcrumb central** seedé via `breadcrumb-pages.json` + builder.
- Fil : **Accueil (lien /) › Simulateurs (page courante, `aria-current`)**.
- `BreadcrumbList` JSON-LD central cohérent (Accueil + Simulateurs avec `item /simulateurs`).

## 6. Breadcrumbs des 3 enfants

- « Simulateurs » devient **cliquable → /simulateurs** sur capacité, mensualité, endettement (résultat déterministe du builder ; pages non éditées à la main).
- Rendu vérifié (ex. capacité) : `Accueil › Simulateurs (lien) › Capacité d'emprunt (courant)`.
- `BreadcrumbList` JSON-LD cohérent : le crumb « Simulateurs » porte désormais `item /simulateurs`.
- `build-breadcrumbs --check` : **52/52 conformes, 0 anomalie**.

## 7. Sitemap

`node scripts/generate-sitemap.js` → **54 URLs** (1 exclue = redirigée). Présents : `/simulateurs`, `/simulateurs/capacite-emprunt`, `/simulateurs/mensualite-credit`, `/simulateurs/taux-endettement`. Toujours **exclu** : `/simulation-pret-immobilier`. Aucune édition manuelle.

## 8. Structured data (hub)

3 blocs JSON-LD valides : **FAQPage** (4 Q/R), **ItemList** (3 outils, URLs correctes, sans preview/localhost), **BreadcrumbList** (central). Pas de `SoftwareApplication`. Une seule H1, un seul canonical.

## 9. Analytics

Implémentation CS-7B **inchangée** : `simulator_hub_view`, `simulator_card_clicked` (`tool` ∈ capacite|mensualite|endettement), `financing_cta_clicked`. Aucune donnée financière, aucune PII (`simulator_card_clicked` n'émet que `{ event, tool }`). `ui.js` non modifié au-delà de l'extension additive CS-7B.

## 10. SEO (vérifié sans réécrire)

- title « Simulateurs de crédit immobilier gratuits | Proactifs » · H1 « Simulateurs de crédit immobilier » · canonical /simulateurs · robots index,follow.
- Une seule H1 · canonical unique · 0 noindex · 0 localhost · FAQ cohérente.
- Maillage : hub → 3 enfants (cartes + « Par où commencer ? ») + `/courtage-credit-immobilier`.

## 11. Tests (totaux exacts)

| Contrôle | Avant | Après CS-7C |
|---|---|---|
| `tests/simulators/*` | 278 | ✅ **281 / 281** |
| `tests/generate-sitemap.test.js` | 4 | ✅ 4 / 4 |
| `build-header.js --check` | exit 0 | ✅ exit 0 |
| `build-breadcrumbs.js --check` | 51/51 | ✅ **52/52**, 0 anomalie |
| `check-mobile-nav.js` | 68 | ✅ **69 pages**, aucune régression |

CS-7 hub : **24 tests** (index,follow + 0 noindex ; canonical ; hub au sitemap ; hub dans nav-pages + breadcrumb-pages ; breadcrumb hub central ; **Simulateurs cliquable /simulateurs sur les 3 enfants** ; BreadcrumbList cohérents ; header hub central ; **`partials/header.html` inchangé** + lien global encore `#simulateurs` ; 3 cartes + 3 URLs ; accessibilité ; FAQPage/ItemList ; analytics sans PII/finance). 3 tests enfants (cs4b/cs4c/cs6) alignés sur le Simulateurs cliquable.

## 12. QA responsive (hub — Playwright, mirror local)

Largeurs **1440 / 1024 / 768 / 430 / 390 / 375 / 320** : **aucun overflow**. Colonnes **3 (≥1024) → 2 (768) → 1 (≤430)**. H1 correct, cartes utilisables, CTA courtage, FAQ, **breadcrumb central** (Simulateurs = page courante), **header central** présent, `simulator_hub_view` émis. Cartes → `/simulateurs/{capacite-emprunt,mensualite-credit,taux-endettement}` (3 URLs correctes).

## 13. Vérification enfants

Seul changement : **« Simulateurs » devient cliquable → /simulateurs**. Aucun changement de calcul, design, contenu, SEO, lead, analytics, policy (breadcrumb régénéré par le builder uniquement ; tests 281/281 garantissent la non-régression du reste).

## 14. Interdits respectés

Non modifiés : `index.html`, home `#simulateurs`, `partials/header.html`, lien header global, widget legacy / Chart.js, liens de contenu `#simulateurs` hors header, moteurs (`core`/`calc-credit`/`calc-immo`/`rates`/`credit-policy`/`lead`), `/api/subscribe`, Supabase/Brevo/Systeme.io, `/courtage-credit-immobilier`, `pret-immobilier-index` + sous-domaine, `vercel.json`. Aucun nouveau simulateur.

## 15. État git final

```
Branche : main   HEAD : fdb0580 (inchangé — aucun commit)

Modifiés (tracked) :
  assets/js/simulators/ui.js                 (CS-7B, additif)
  scripts/nav-pages.json                     (+ hub)
  scripts/breadcrumb-pages.json              (+ hub, + Simulateurs cliquable ×3)
  sitemap.xml                                (+ /simulateurs)
  simulateurs/capacite-emprunt.html          (breadcrumb : Simulateurs cliquable)
  simulateurs/mensualite-credit.html         (idem)
  simulateurs/taux-endettement.html          (idem)
  tests/simulators/cs4b-page.test.js         (breadcrumb enfant)
  tests/simulators/cs4c-publication.test.js  (breadcrumb enfant)
  tests/simulators/cs6-endettement.test.js   (breadcrumb enfant)
  index.html                                 (modif locale préexistante, NON touchée)

Nouveaux (untracked) :
  simulateurs/index.html
  assets/js/simulators/hub.js
  tests/simulators/cs7-hub.test.js
  docs/CS-7A-…  docs/CS-7B-…  docs/CS-7C-PUBLICATION-HUB-SIMULATEURS.md  (+ docs/CS-6D-…)
```

## 16. Écarts

Aucun écart de fond avec CS-7A/CS-7B. La migration breadcrumb (Simulateurs cliquable) a entraîné, comme prévu, la mise à jour déterministe des 3 pages enfants et de 3 tests enfants — sans toucher aux moteurs, au design ni au contenu.

*Fin CS-7C. Hub intégré et indexable en local, vérifié. Aucun commit / push / merge / déploiement. CS-7D non démarré. En attente de validation ChatGPT.*
