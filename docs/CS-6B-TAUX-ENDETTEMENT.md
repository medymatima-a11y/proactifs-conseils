# CS-6B — Construction du simulateur TAUX D'ENDETTEMENT (preview)

**Projet :** Proactifs Conseils — Simulateurs V2
**Branche :** `credit-simulateurs-v2` · HEAD `87f390a` (aucun commit en CS-6B)
**Date :** 19 septembre 2026
**Statut :** ✅ Construit, testé, QA rendu OK — **preview `noindex,nofollow`, non publié**. En attente de validation ChatGPT avant CS-6C (publication).

---

## 1. Périmètre livré

3ᵉ simulateur crédit : **taux d'endettement**, en **preview** (non indexable, hors sitemap/nav/hub).
Socle partagé **gelé et réutilisé tel quel** — aucun moteur/policy/UI modifié.

| Fichier | État | Rôle |
|---|---|---|
| `assets/js/simulators/prototype-endettement.js` | **nouveau** (untracked) | Adaptateur UI du taux d'endettement |
| `simulateurs/taux-endettement.html` | **nouveau** (untracked) | Page preview `noindex,nofollow` |
| `tests/simulators/cs6-endettement.test.js` | **nouveau** (untracked) | 33 tests dédiés CS-6 |
| `docs/CS-6B-TAUX-ENDETTEMENT.md` | **nouveau** (untracked) | Ce rapport |

Réutilisés **sans modification** : `core.js`, `calc-credit.js`, `credit-policy.js`, `ui.js`, `lead.js`, `simulators.css`.

## 2. Réutilisation du moteur (aucune règle métier ajoutée)

- Calcul délégué à **`SimCalcCredit.calculateDebtRatio({ payment, income })`** (= `payment / income`, `NaN` si `income ≤ 0`). Jamais réécrit.
- **`maxDebtRatio` (35 %)** et **`rentalIncomeRetention` (70 %)** **lus depuis `PROACTIFS_CREDIT_POLICY_V1`** — jamais codés en dur (test A3 vérifie l'absence de littérales `0.35`/`0.70` dans le code).
- L'adaptateur n'importe ni ne touche `prototype-capacity.js` / `prototype-mensualite.js`.

## 3. Agrégation (dans l'adaptateur, pas dans le socle)

- **Revenus retenus** = revenus nets foyer + co-emprunteur (si « à deux ») + revenus locatifs × `rentalIncomeRetention` (70 %).
  - « Autres revenus » **non retenus automatiquement** (revue manuelle) → avertissement dédié.
- **Charges retenues** = crédits existants + pensions/charges + nouvelle mensualité envisagée + loyer restant à payer.
- Distinction vide / 0 gérée : un champ optionnel vide vaut 0 ; une valeur négative ou non numérique est **refusée** (validation). Revenus nets foyer **requis (> 0)**.

## 4. Repère 35 % — neutralité stricte

- Le 35 % est présenté **exclusivement comme un REPÈRE de simulation**. Les termes « seuil légal », « limite bancaire », « critère d'acceptation » n'apparaissent qu'en **dénégation** (« ni un seuil légal… », « jamais présenté comme… ») — vérifié ligne par ligne (test K3).
- **3 phrases d'interprétation, et rien d'autre** :
  - sous : « Votre taux estimé se situe **sous le repère** utilisé dans cette simulation. »
  - autour : « …se situe **autour du repère** utilisé dans cette simulation. »
  - au-dessus : « …**dépasse le repère** utilisé dans cette simulation. »
- **Interdits absents** (bon/mauvais dossier, éligible/non éligible, finançable, refus probable, accepté/refusé, respecte les critères bancaires) — testés sur les phrases de l'adaptateur (F1) et sur le corps de page (F3).

## 5. Tolérance rédactionnelle ±0,2 pt

- Constante nommée **`REFERENCE_DISPLAY_TOLERANCE_POINTS = 0.2`** — **affichage/adapter uniquement**. Ne modifie **ni** la policy, **ni** `maxDebtRatio`, **ni** le résultat numérique (`pct`/`ratio` affichés bruts).
- Zones autour du repère 35,0 % : `< 34,8` → sous · `34,8–35,2` → autour · `> 35,2` → au-dessus.
- Bornes testées (E1) : 34,7 → sous · 34,8 → autour · 35,0 → autour · 35,2 → autour · 35,3 → au-dessus. Test E3 : 34,9 % s'affiche « 34,9 % » (brut) et zone « autour ».

## 6. Avertissements

- **Locatif** (si saisi) : « Hypothèse de simulation : **70 %** des revenus locatifs sont retenus. » (% **lu depuis la policy**, pas figé).
- **Autres revenus** (si saisis) : « Autres revenus non retenus — ils ne sont pas intégrés automatiquement — une analyse personnalisée peut être nécessaire. »
- **Disclaimer général** : estimation indicative et non contractuelle ; l'étude tient compte du reste à vivre, de l'apport, de l'épargne, de la situation professionnelle, du projet et de la politique du prêteur.

## 7. Conversion (lead réel, zéro donnée financière)

- CTA « Étudier mon financement » → ouvre le formulaire lead → **`POST /api/subscribe`** (transport réel injecté par la page ; mock uniquement si aucun transport fourni).
- Payload via `lead.buildLeadPayload` — schéma inchangé : `{ prenom, nom, email, tel, situation, service:"credit", answers:[{ source:"simulateur_taux_endettement" }] }`.
- **Aucune donnée financière** (revenus, charges, taux, mensualité, ratio) transmise — vérifié (G1 : payload = identité seule + attribution de source, aucun montant chiffré hors téléphone).

## 8. Analytics (bucket only)

- `ui.track` réutilisé ; `simulator_type: "debt_ratio"` sur chaque événement (5 événements : started, completed, result, financing_cta_clicked, financing_lead_submitted).
- **`simulation_result` ne porte QUE `bucket`** ∈ `below_reference` / `around_reference` / `above_reference` — **aucune PII, aucun montant, aucun taux exact** (H1 sur l'adaptateur, H2 sur le filtre `ui.track`).

## 9. SEO / preview

- `robots: noindex,nofollow` · `canonical https://proactifsconseils.fr/simulateurs/taux-endettement`.
- **Non ajouté** : sitemap, header central, breadcrumb central, hub `/simulateurs`, home `#simulateurs`. **Breadcrumb preview-local** (Accueil › Simulateurs › Taux d'endettement, « Simulateurs » non cliquable).
- `FAQPage` JSON-LD (4 Q/R), contenu pédagogique (« Comment se calcule le taux d'endettement ? », « Que signifie le repère de 35 % ? », liens internes courtage/capacité/mensualité), exemples recalculés à l'exécution, méthodologie.
- Scripts chargés : `core`, `calc-credit`, `credit-policy`, `ui`, `lead`, `prototype-endettement` (pas de `rates.js`, pas d'autre adaptateur).

## 10. Tests — `tests/simulators/cs6-endettement.test.js` (33/33 ✅)

Couverture : constantes lues policy + absence de littérale 35/70 (A) · délégation moteur + non-mutation policy (B) · agrégation revenus/charges, 70 % locatif, co-emprunteur, « autres revenus » non retenus, nouvelle mensualité/loyer (C) · cas 0/invalide/charges 0/>100 % (D) · bornes tolérance ±0,2 pt + mapping bucket (E) · neutralité des 3 phrases + interdits absents (F) · lead sans donnée financière (G) · analytics bucket-only (H) · validations (I) · exemples calculés par le moteur (J) · preview noindex/canonical/FAQ/scripts/repère (K).

### Suites & contrôles (tous verts)

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **254/254** (221 socle + 33 CS-6) |
| `node --test tests/generate-sitemap.test.js` | ✅ 4/4 |
| `node scripts/build-header.js --check` | ✅ exit 0 (preview hors registre header, correct) |
| `node scripts/build-breadcrumbs.js --check` | ✅ 50/50, 0 anomalie |
| `node scripts/check-mobile-nav.js` | ✅ 67 pages, aucune régression |

## 11. QA rendu (Playwright chromium, mirror local, fonts/GA4 bloqués)

Largeurs **1440 / 430 / 390 / 375 / 320** — aucun débordement horizontal (`scrollWidth == clientWidth`), `XX,X %` sur **une seule ligne**, formulaire utilisable, panneau résultat compact, aucune erreur JS.

| Scénario | Saisie | Résultat | Vérif |
|---|---|---|---|
| Base (seul) | 4 200 / crédit 900 / nouvelle mens. 510 | **33,6 %** · sous le repère | = moteur, 5 largeurs |
| Locatif + autres (à deux) | 3 000 + 1 500 + locatif 1 000 + autres 500 / crédit 900 | **17,3 %** · revenus 5 200 € · avertissements locatif 70 % **et** autres revenus affichés | 390 px |
| Au-dessus | 4 500 / crédit 1 700 | **37,8 %** · dépasse le repère | 320 px |
| Autour (borne) | 10 000 / crédit 3 490 | **34,9 %** · autour du repère | 375 px, confirme tolérance live |

## 12. Écarts vs CS-6A (conception)

Aucun écart de fond. Conforme à l'audit CS-6A : réutilisation stricte de `calculateDebtRatio`, agrégation dans l'adaptateur, 35 % repère lu policy, 70 % locatif lu policy, neutralité 3 phrases, tolérance d'affichage ±0,2 pt nommée, lead sans donnée financière, analytics bucket-only, preview noindex.

## 13. Volontairement non fait (cadrage CS-6B)

- **Aucun** commit / push / merge / déploiement.
- **Aucun** ajout au sitemap, header, breadcrumb central, hub, home `#simulateurs`.
- **Aucune** modification du socle (core/calc-credit/calc-immo/rates/credit-policy/ui/lead), ni de `index.html` (modif locale préexistante, hors périmètre).
- CS-6C (publication) et hub `/simulateurs` **non démarrés**.

## 14. État git (fin CS-6B)

```
Branche : credit-simulateurs-v2   HEAD : 87f390a   (inchangé)
Nouveaux (untracked) :
  assets/js/simulators/prototype-endettement.js
  simulateurs/taux-endettement.html
  tests/simulators/cs6-endettement.test.js
  docs/CS-6B-TAUX-ENDETTEMENT.md   (+ docs/CS-6A-AUDIT-TAUX-ENDETTEMENT.md, CS-6A)
Modifié hors périmètre : index.html (non stagé, jamais touché)
```

*Fin CS-6B. Preview construite et vérifiée. En attente de validation ChatGPT pour CS-6C (publication : index/follow, sitemap, breadcrumb/header centraux, éventuel hub).*
