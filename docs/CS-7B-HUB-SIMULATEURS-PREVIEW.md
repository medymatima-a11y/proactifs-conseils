# CS-7B — Construction du HUB /simulateurs en preview (noindex)

**Projet :** Proactifs Conseils — Simulateurs V2
**Date :** 19 septembre 2026
**Statut :** ✅ Hub construit et testé en **preview `noindex, nofollow`** — non publié, non déployé. En attente de validation ChatGPT avant CS-7C.

> CS-7B = construction preview uniquement. Aucune modification de la home, du header, des breadcrumbs enfants, du sitemap ni des registres production. Aucun déploiement.

---

## 1. Fichiers créés / modifiés

**Créés :**
```
simulateurs/index.html                       (le hub, preview noindex)
assets/js/simulators/hub.js                  (analytics léger + tableau TOOLS)
tests/simulators/cs7-hub.test.js             (21 tests dédiés CS-7)
docs/CS-7B-HUB-SIMULATEURS-PREVIEW.md        (ce rapport)
```

**Modifiés (strictement encadrés) :**
```
assets/js/simulators/ui.js                   (extension ADDITIVE ALLOWED_EVENTS : +2 events)
tests/simulators/cs4c-publication.test.js    (test-only : liste d'events attendue mise à jour)
```

Aucun autre fichier fonctionnel touché. `index.html` (home) reste en modif locale préexistante, **non touchée**.

## 2. ui.js — modification additive (exception CS-7A/CS-7B validée)

- `ALLOWED_EVENTS` étendu de **+2 événements** : `simulator_hub_view`, `simulator_card_clicked`.
- **Rien d'autre** modifié : `track()`, `FORBIDDEN_KEYS`, `sanitizeTrackingData`, comportement et événements existants **inchangés** (vérifié par tests E1–E3, F1–F2).
- Conséquence : aucun changement de comportement des 3 simulateurs existants. Le test `cs4c-publication` qui figeait la liste exacte a été mis à jour (test-only) pour refléter l'ajout autorisé, en conservant la garantie « aucune PII ne passe ».

## 3. Structure du hub

`<main class="hub-wrap">` : Hero → « Nos outils de simulation » (3 cartes) → « Par où commencer ? » → pont narratif → conversion → FAQ, encadré par le **header central** (bloc `NAV` verbatim) et le **footer** du gabarit V2.

- **Hero :** eyebrow « OUTILS & SIMULATEURS », H1 « Simulateurs de crédit immobilier », sous-titre, réassurance « Gratuit · Sans engagement · Résultat immédiat ». Pas de gros CTA commercial dans le hero.
- **3 cartes premium** (ordre capacité → mensualité → endettement) : icône SVG cohérente, titre, question, description, CTA. **Carte entière = `<a>`, CTA = `<span>`** (aucun lien imbriqué — vérifié).
- **Par où commencer ?** : version compacte, 3 lignes renvoyant chacune vers le bon outil.
- **Pont narratif :** SIMULATION → COMPRÉHENSION → CONSEIL → ACCOMPAGNEMENT.
- **Conversion :** « Une simulation vous donne un chiffre. Une étude personnalisée construit votre financement. » → CTA « Étudier mon financement » vers `/courtage-credit-immobilier`. **Aucun formulaire lead direct** sur le hub (V1).
- **FAQ :** 4 questions génériques, réponses courtes et prudentes.

## 4. SEO (contenu définitif, page en noindex)

- **title :** « Simulateurs de crédit immobilier gratuits | Proactifs »
- **meta description :** capacité, mensualité, taux d'endettement — préparer son projet immobilier, estimation immédiate.
- **H1 :** « Simulateurs de crédit immobilier »
- **H2 :** Nos outils de simulation · Par où commencer ? · De la simulation à l'accompagnement · Questions fréquentes.
- Intention **générique** (pas de recopie des contenus enfants). Maillage : hub → 3 enfants + `/courtage-credit-immobilier`.
- **robots :** `noindex, nofollow` · **canonical (futur) :** `https://proactifsconseils.fr/simulateurs`.

## 5. Structured data

3 blocs JSON-LD valides : **FAQPage** (4 Q/R), **ItemList** (3 outils avec URLs), **BreadcrumbList** preview-local (Accueil › Simulateurs). Pas de `SoftwareApplication`. JSON validé (parse OK).

## 6. Analytics (Option A — système central)

- `hub.js` s'appuie sur `SimUI.track` (allow-list étendue). HTML des cartes **statique** (SEO/accessibilité), JS **uniquement pour le tracking**.
- Événements : `simulator_hub_view` au chargement (payload vide) ; `simulator_card_clicked` au clic carte/lien outil avec **`{ tool }` uniquement** (`capacite` | `mensualite` | `endettement`) ; `financing_cta_clicked` réutilisé sur le CTA financement (non dupliqué).
- **Aucune PII, aucune donnée financière** : vérifié en conditions réelles (rendu navigateur) — `simulator_card_clicked` n'émet que `{ event, tool }` ; `sanitizeTrackingData` retire toute clé interdite injectée.
- Pont GA4 local (`WL`) du hub inclut les 2 nouveaux events pour la remontée gtag.

## 7. Accessibilité

- Carte entière cliquable en `<a>` avec CTA en `<span>` → **aucun lien imbriqué invalide** (0 détecté).
- `:focus-visible` sur les cartes ; `summary` FAQ au clavier ; contrastes de marque conservés.

## 8. Design

Réutilise l'identité V2 : ivoire, vert profond, or, cartes blanches, coins arrondis, Cormorant Garamond + Nunito Sans, header/footer partagés. Le hub appartient visuellement à la famille Capacité / Mensualité / Taux d'endettement (pas de nouveau design system). Grille de cartes pilotée par données (extensible).

## 9. Responsive / QA (Playwright, mirror local, fonts/GA4 bloqués)

Largeurs **1440 / 1024 / 768 / 430 / 390 / 375 / 320** : **aucun overflow horizontal**, aucune erreur JS. Grille : **3 colonnes** (≥ ~900px) → **2** (≤900px) → **1** (≤640px). CTA lisibles, cartes de hauteur cohérente (flex), H1 non cassé.

- Correctifs QA appliqués : liens « Par où commencer ? » non-`nowrap` (débordaient à 320) ; filet `overflow-x` + `img max-width` sur `.hub-wrap` ; **injection du CSS footer** du gabarit V2 (le footer avait été copié sans ses styles → logo 425px). Après correctifs : 0 overflow de 320 à 1440.
- Tracking vérifié en direct : `simulator_hub_view` émis 1×, `simulator_card_clicked` → `{ event, tool:"capacite" }`.

## 10. Tests

`tests/simulators/cs7-hub.test.js` (**21 tests**) : noindex/nofollow, canonical /simulateurs, title/H1, 3 cartes + 3 URLs, absence de lien imbriqué (+ CTA span), CTA financement vers courtage, pas de lead/form, FAQPage/ItemList/BreadcrumbList (+ pas de SoftwareApplication), breadcrumb preview-local, ui.js contient les 2 nouveaux events + conserve les 5 anciens + track/FORBIDDEN_KEYS/sanitize intacts, `simulator_hub_view` sans données, `simulator_card_clicked` = `{ tool }` uniquement (PII/finance retirées), valeurs `tool` limitées à capacite/mensualite/endettement, hub **absent** du sitemap et des registres (`nav-pages.json`, `breadcrumb-pages.json`), chargement socle minimal sans adaptateur simulateur.

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **278/278** (257 + 21 CS-7) |
| `node --test tests/generate-sitemap.test.js` | ✅ 4/4 |
| `node scripts/build-header.js --check` | ✅ exit 0 (hub hors registre, correct) |
| `node scripts/build-breadcrumbs.js --check` | ✅ 51/51 (hub non enregistré, correct) |
| `node scripts/check-mobile-nav.js` | ✅ 68 pages, aucune régression |

## 11. Preview stricte — vérifications

- `noindex, nofollow` + canonical `/simulateurs` ✅
- **Non** ajouté au sitemap ✅ · **non** ajouté à `nav-pages.json` / `breadcrumb-pages.json` ✅
- `partials/header.html` **non** modifié ✅ · breadcrumbs des 3 enfants **non** modifiés ✅ · home **non** modifiée ✅ · `vercel.json` **non** modifié ✅

## 12. Différences avec CS-7A

Aucune divergence de fond. Conforme à la conception CS-7A (hub-and-spoke, cartes premium, pont narratif, conversion vers courtage, SEO générique, structured data FAQPage/ItemList/BreadcrumbList, analytics Option A). Précision d'implémentation : le footer du gabarit V2 étant stylé **inline par page**, son CSS a dû être injecté dans le hub (constat non anticipé en CS-7A, sans impact sur l'architecture).

## 13. Non touché / non fait (cadrage)

Home `#simulateurs`, `partials/header.html`, `nav-pages.json`, `breadcrumb-pages.json`, `sitemap.xml`, `vercel.json`, les 3 pages simulateurs, moteurs (`core`/`calc-credit`/`calc-immo`/`rates`/`credit-policy`/`lead`), `courtage-credit-immobilier`, `pret-immobilier-index` + sous-domaine, `/api/subscribe`, Supabase/Brevo/Systeme.io. **Aucun commit / push / merge / déploiement. CS-7C non démarré.**

## 14. État git final

```
Branche : main   HEAD : fdb0580 (inchangé — aucun commit)

Modifiés (tracked) :
  assets/js/simulators/ui.js                 (+2 events, additif)
  tests/simulators/cs4c-publication.test.js  (test-only)
  index.html                                 (modif locale préexistante, NON touchée)

Nouveaux (untracked) :
  simulateurs/index.html
  assets/js/simulators/hub.js
  tests/simulators/cs7-hub.test.js
  docs/CS-7B-HUB-SIMULATEURS-PREVIEW.md
```

*Fin CS-7B. Hub construit et vérifié en preview. En attente de validation ChatGPT pour CS-7C (publication).*
