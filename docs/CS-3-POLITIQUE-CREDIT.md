# CS-3 — Couche métier financement Proactifs V1 (`credit-policy.js`)

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-1 `a2decc7`, CS-2/2.1 `87df56a`
**Nature :** couche **métier** indépendante, versionnée et testable, posée **par-dessus** le moteur mathématique CS-1. **N'a pas modifié** l'interface du prototype CS-2. Aucun DOM, aucune API, aucun tracking, aucun réseau. **Aucun verdict bancaire.**

---

## 1. Rôle et périmètre

`credit-policy.js` applique une **politique métier** (rétention des revenus, prise en compte des charges, mensualité disponible, reste à vivre indicatif) en s'appuyant **exclusivement** sur les primitifs CS-1 (`core.js`, `calc-credit.js`). Elle ne recalcule aucune formule financière et ne crée **aucune nouvelle grille de taux** (`LEGACY_REFERENCE` reste inchangé).

**Ce que la couche fait :** structurer et pondérer des entrées, produire des montants **indicatifs** + des **drapeaux de revue** + un **niveau de fiabilité de la simulation**.
**Ce que la couche ne fait jamais :** décider d'un accord/refus, produire un score, une probabilité, ou un statut d'éligibilité.

## 2. Fichiers

**Créés (périmètre exact CS-3) :**
- `assets/js/simulators/credit-policy.js` — la politique + les fonctions pures + l'orchestrateur
- `tests/simulators/credit-policy.test.js` — tests A–X + validation/robustesse
- `docs/CS-3-POLITIQUE-CREDIT.md` — ce document

**Aucun autre fichier modifié.** Prototype (`prototypes/simulateur-capacite-emprunt-v2.html`), `prototype-capacity.js`, `rates.js`, pages de production, header, navigation, API : **inchangés**.

## 3. Politique `PROACTIFS_CREDIT_POLICY_V1`

Objet **gelé récursivement** (`Object.freeze`), immuable à l'exécution.

| Règle | Source | Type | Valeur | Statut |
|---|---|---|---|---|
| Taux d'endettement | **HCSF** | `REFERENCE_STANDARD` (≠ limite d'accord automatique) | `maxDebtRatio = 0.35` | référence |
| Durée max publique | **HCSF** | `REFERENCE_STANDARD` | 25 ans (`publicDurations = [10,15,20,25]`) | 30 ans **exclu du public** (conservé dans CS-1 pour parité) |
| Rétention revenus locatifs | **PROACTIFS** | `PROACTIFS_SIMULATION_ASSUMPTION` / `NOT_REGULATORY_RULE` | `rentalIncomeRetention = 0.70` (décote 30 %) | hypothèse de simulation |
| Assurance emprunteur | — | mode | `insuranceMode = 'USER_PROVIDED_OR_UNKNOWN'` | fournie sinon inconnue |
| Loyer résiduel | Proactifs | prudence | `includeRemainingRent = true` | inclus dans les charges |
| Version / effet / statut | — | métadonnées | `version 1.0.0`, `effectiveDate 2026-09-17`, `status INTERNAL_VALIDATION` | en validation |

> ⚠️ **Le 70 % n'est jamais présenté comme une règle HCSF ou une exigence bancaire.** C'est une hypothèse **interne Proactifs**, tracée comme telle dans `meta.rentalIncomeRetention` et `sources`.
> ⚠️ **Le 35 % est une référence, pas une limite d'accord** (`meta.maxDebtRatio.note = NOT_ABSOLUTE_APPROVAL_LIMIT`).

### Catégories de revenus (`incomeCategories`)

| Catégorie | Rétention | Auto ? | Note |
|---|---|---|---|
| `PRIMARY_INCOME` | 100 % | oui | revenu principal |
| `CO_BORROWER_INCOME` | 100 % | oui | co-emprunteur |
| `EXISTING_RENTAL_INCOME` | 70 % | oui | hypothèse Proactifs |
| `PROJECTED_RENTAL_INCOME` | 70 % | oui | hypothèse Proactifs |
| `OTHER_STABLE_INCOME` | — | **non** | `REQUIRES_MANUAL_REVIEW` — **non compté automatiquement en V1** |

## 4. Fonctions pures

| Fonction | Entrée | Sortie |
|---|---|---|
| `calculateRetainedRentalIncome({existingRentalIncome, projectedRentalIncome, retentionRate})` | revenus locatifs + taux | `{ grossRentalIncome, retainedRentalIncome, excludedRentalIncome, retentionRate }` |
| `calculateRetainedIncome(input, policy)` | revenus | total retenu + décomposition + drapeaux |
| `calculateRetainedCharges(input, policy)` | charges | crédits + loyer résiduel + assurance, sans double comptage + drapeaux |
| `calculateAvailablePayment({totalRetainedIncome, existingLoanPayments, remainingHousingRent, monthlyInsurance, maxDebtRatio})` | revenus + charges | mensualité disponible (plancher 0) — **réutilise `calculateMaxPayment` CS-1** |
| `calculateEstimatedRemainingIncome({...})` | revenus, charges, dispo | reste à vivre **informatif** (aucun seuil, aucun verdict) |
| `evaluateFinancingInputs(input, policy)` | entrée complète | orchestration (voir §6) |
| `validateFinancingInput(input)` | entrée | `{ ok, errors }` (revenu principal > 0, autres ≥ 0) — pour l'interface CS-4 |

**Exemple de référence (rétention locative) :** `1000 + 1200` à `0,70` → **brut 2200**, **retenu 1540**, **exclu 660**.

## 5. Charges — règles

- **Somme sans double comptage :** `crédits en cours + loyer résiduel + assurance emprunteur`.
- **Assurance fournie** → ajoutée aux charges, `insuranceIncluded = true`.
- **Assurance absente** → comptée `0`, drapeau `INSURANCE_NOT_INCLUDED`, fiabilité **PARTIAL**.
- **`existingLoansEndingSoon = true`** → drapeau `EXISTING_LOAN_ENDING_SOON_REVIEW` **uniquement** ; les charges **ne sont jamais réduites automatiquement**.

## 6. Orchestrateur `evaluateFinancingInputs`

Retourne un objet **indicatif** :

```
{
  policyId, policyVersion, maxDebtRatio,
  retainedIncome:  { primaryIncome, coBorrowerIncome, rental{…}, otherStableIncome, otherStableIncomeRetained:0, totalRetainedIncome, reviewFlags },
  retainedCharges: { existingLoanPayments, remainingHousingRent, monthlyInsurance, insuranceIncluded, existingLoansEndingSoon, totalRetainedCharges, reviewFlags },
  availableMonthlyPayment,       // = totalRetainedIncome*maxDebtRatio − charges, plancher 0
  estimatedRemainingIncome,      // informatif
  reviewFlags,                   // fusion dédupliquée
  reliability,                   // STANDARD | PARTIAL | MANUAL_REVIEW
  warnings                       // [{code, message}]
}
```

**Aucun champ** `decision` / `eligible` / `approved` / `status` / `score` / `verdict` / `probability`.

### Fiabilité (`reliability`) — **niveau de confiance de la SIMULATION, pas un score bancaire**

Priorité : `MANUAL_REVIEW` > `PARTIAL` > `STANDARD`.

| Valeur | Déclencheur |
|---|---|
| `STANDARD` | données complètes et simples (assurance renseignée) |
| `PARTIAL` | assurance emprunteur inconnue |
| `MANUAL_REVIEW` | autres revenus déclarés **ou** crédit en cours à échéance (cas complexe → conseiller) |

### Drapeaux de revue (`REVIEW_FLAGS`)

`INSURANCE_NOT_INCLUDED`, `OTHER_INCOME_REQUIRES_REVIEW`, `EXISTING_LOAN_ENDING_SOON_REVIEW`, `RENTAL_INCOME_ASSUMPTION_USED`, `REMAINING_RENT_INCLUDED`, `PROJECTED_RENTAL_INCOME_USED`.

## 7. Sources & traçabilité

`policy.sources` rattache chaque règle à son origine :
- `maxDebtRatio` → **HCSF** (taux d'effort) — référence.
- `maxPublicDurationYears` → **HCSF** (durée) — référence.
- `rentalIncomeRetention` (70 %) → **PROACTIFS** — *« Hypothèse interne Proactifs — PAS une règle HCSF ni une exigence bancaire universelle. »*

## 8. Hors périmètre (NON implémenté en CS-3)

TAEG, taux d'usure, garantie/caution/hypothèque, frais de dossier/courtage, PTZ, prêt relais / in fine, différé, lissage, paliers, modulation, assurance selon l'âge, scoring, probabilité d'accord, comparateur de banques. Aucune nouvelle grille de taux.

## 9. Tests (`credit-policy.test.js`)

Catégories **A–X** + validation/robustesse : identité & valeurs de la politique, durées publiques (30 exclu), **immutabilité** (freeze récursif), `meta` anti-contresens, sources HCSF vs Proactifs, catégories de revenus, rétention locative (exemple 2200/1540/660, taux par défaut, cas nul), composition des revenus (autres revenus non comptés) + drapeaux, charges sans double comptage, assurance présente/absente, loyer résiduel, crédit à échéance (charges non réduites), mensualité disponible (formule, plancher 0, **égalité au primitif CS-1**), reste à vivre informatif, structure de l'orchestrateur, fiabilité STANDARD/PARTIAL/MANUAL_REVIEW, **absence de verdict bancaire**, validation, robustesse (undefined/null/NaN/négatif/chaîne), formats FR, avertissements métier.

**Résultat :** suite complète `node --test tests/simulators/*.test.js` → **94 tests PASS** (65 existants CS-1/CS-2 + 29 CS-3), **0 FAIL**.

---

## Git

Diff CS-3 limité à `assets/js/simulators/credit-policy.js`, `tests/simulators/credit-policy.test.js`, `docs/CS-3-POLITIQUE-CREDIT.md`. Commit `CS-3 : politique metier financement V1` sur `credit-simulateurs-v2`. **Aucun merge `main`, aucune production.**

**STOP.** CS-4 non démarré. En attente de validation métier de la politique V1.
