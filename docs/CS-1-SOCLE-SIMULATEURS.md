# CS-1 — Socle technique des simulateurs V2

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` (à créer depuis `main` prod à jour)
**Nature :** architecture technique commune des futurs simulateurs. **Aucune page publique, aucun header V2, aucune API, aucun calcul de production modifié.**

---

## 0. Périmètre

CS-1 = **socle réutilisable + tests**. On ne construit PAS les simulateurs publics, on ne migre PAS `simulation-pret-immobilier.html`, on ne crée PAS `/credit` ni `/simulateurs`, on ne touche PAS Header V1 ni les formules de production.

## 1. Architecture créée

```
assets/js/simulators/
  core.js         calcul générique pur (aucun DOM/réseau)
  rates.js        grilles de taux (LEGACY_REFERENCE uniquement)
  calc-credit.js  fonctions pures crédit (hypothèses explicites)
  calc-immo.js    fonctions pures immo (maths non ambiguës only)
  lead.js         abstraction lead (build payload, aucun envoi)
  ui.js           formatters + tracking (whitelist, anti-PII) + helpers DOM protégés
assets/css/simulators/
  simulators.css  primitives .sim-* (sobre, responsive, a11y)
tests/simulators/
  core.test.js  calc-credit.test.js  calc-immo.test.js  parity-legacy.test.js  lead-ui.test.js
docs/CS-1-SOCLE-SIMULATEURS.md
```

Séparation stricte : **calcul** (core/calc-*) · **données/règles** (rates) · **lead** (lead) · **DOM/UI/tracking** (ui). Modules **UMD** : `require()` en Node **et** global navigateur, **sans dépendance ni package.json**.

## 2. Responsabilités par fichier

| Fichier | Rôle | Interdits respectés |
|---|---|---|
| core.js | maths pures | pas de DOM/GA4/form/Supabase/Brevo |
| rates.js | résolution de taux par grille | pas de « taux actuels » inventés |
| calc-credit.js | capacité, mensualité, endettement, coût, budget | aucune règle cachée (35 % passé en paramètre) |
| calc-immo.js | rendement, effort d'épargne, coût projet | pas de notaire/fiscalité/LMNP inventés |
| lead.js | payload lead | aucun endpoint par défaut → aucun envoi accidentel |
| ui.js | formatage €/%, tracking, helpers étapes | tracking sans PII, DOM protégé |

## 3. core.js — fonctions

`isValidNumber`, `toNumber` (formats FR/EN → number|NaN), `round(v,dp)`, `clampMin`, `monthsFromYears`, `monthlyRate(annualPct)`, `annuityFactor({annualRatePct,months})` (taux 0 → n), `monthlyPayment({principal,annualRatePct,months})`, `principalFromPayment({payment,annualRatePct,months})`, `creditCost({payment,months,principal})`. **Aucun DOM/réseau.**

## 4. rates.js — fonctions

`LEGACY_REFERENCE` (grille legacy, `kind:"LEGACY_REFERENCE"`, `validated:false`, `source` = page legacy, `effectiveDate:null`), `resolveRate(grid,durationYears)` (reproduit `wzTaux`), `getRate(durationYears,grid?)`, `isValidGrid(grid)`. Une future grille validée se branche **sans toucher calc-credit.js**.

## 5. calc-credit.js — fonctions (hypothèses explicites)

- `calculateMonthlyPayment({principal, annualRatePct, durationYears})`
- `calculateBorrowingCapacity({income, existingDebt, durationYears, annualRate, maxDebtRatio})`
- `calculateMaxPayment({income, existingDebt, maxDebtRatio})`
- `calculateDebtRatio({payment, income})`
- `calculateCreditCost({principal, annualRatePct, durationYears})`
- `calculateBudget({capacity, apport})`

**Le taux d'endettement (`maxDebtRatio`) et le taux (`annualRate`) sont TOUJOURS des paramètres** — jamais 35 % ni la grille legacy en dur.

## 6. calc-immo.js — fonctions

`grossYield`, `netYieldSimple` (hors fiscalité, assumé), `savingsEffort` (>0 = sortie de trésorerie), `totalProjectCost({price, extraCosts})` (coûts additionnels fournis explicitement). **Aucun** frais de notaire, fiscalité, LMNP, plus-value, succession.

## 7. lead.js — fonctionnement

`buildLeadPayload({prenom,email,tel,situation,answers})` → `{prenom, nom:'', email, tel, situation, service:'credit', answers}` (schéma API existant, **non modifié**). `isSubmittable(payload)`. `submitLead(payload, transport)` : **transport injecté obligatoire, aucun endpoint par défaut** → impossible d'appeler `/api/subscribe` par accident. CS-1 n'envoie aucun vrai lead.

## 8. ui.js — fonctionnement

Formatters purs `formatEuro`, `formatPercent`. `showStep`, `setProgress`, `setState` (DOM protégé, no-op hors navigateur). Tracking : `track(event, data)` n'émet QUE les 5 événements whitelistés et pousse vers `window.dataLayer` s'il existe (sinon no-op). `sanitizeTrackingData` supprime toute clé PII/montant.

## 9. Stratégie tracking (convention, non émise en prod par CS-1)

Événements : `simulation_started`, `simulation_completed`, `simulation_result`, `financing_cta_clicked`, `financing_lead_submitted`. **Jamais de PII ni de montants exacts** (clés `nom/prenom/email/tel/income/montant/prix/…` supprimées). `simulation_result` ne transporte que des **buckets/catégories**. GA4 `G-P53RQGXJZX` / Ads `AW-835423035` de production **non modifiés**.

## 10. Protections données personnelles

Le calcul d'un résultat **ne dépend jamais** de l'identité (nom/prénom/email/tel) — séparation calcul ↔ lead capture. Aucune PII ni montant financier exact envoyé au tracking (garde-fou testé).

## 11. Formule legacy documentée (référence de parité)

```
revenus  = revenu1 + revenu2
mensMax  = max(0, revenus × 0.35 − credits)
taux     = wzTaux(duree)            // table legacy
tm       = taux / 100 / 12
nbMois   = duree × 12
facteur  = (1 − (1 + tm)^(−nbMois)) / tm
capacite = round(mensMax × facteur) // Math.round
budget   = capacite + apport
```

Reproduite **à l'identique** par le moteur quand `maxDebtRatio=0.35` et `annualRate=` grille legacy (tests de parité). **PARITY_LEGACY ≠ VALIDATION MÉTIER.**

## 12. Taux legacy documentés

| Durée | Taux |
|---|---|
| ≤ 10 ans | 3,10 % |
| ≤ 15 ans | 3,30 % |
| ≤ 20 ans | 3,45 % |
| > 20 ans | 3,60 % |

**LEGACY, hardcodés, non sourcés, non datés, non validés comme taux marché.** Exposés sous `LEGACY_REFERENCE`, jamais comme « taux actuels ».

## 13. Limitations métier documentées (non résolues en CS-1)

Endettement fixe 35 % ; assurance emprunteur non intégrée ; revenus locatifs / autres revenus non gérés ; exceptions bancaires non gérées ; taux non personnalisés au profil ; loyer actuel collecté mais non intégré au calcul legacy ; règles bancaires à valider avant CS-4.

## 14. Tests

Runner : **`node:test`** (natif, aucune dépendance ajoutée). Commande :

```
node --test tests/simulators/*.test.js
```

- `core.test.js` — maths, arrondis, cas limites (taux nul, durée invalide, non-numérique, grandes valeurs), round-trip capital↔mensualité.
- `calc-credit.test.js` — capacité, mensualité, endettement, coût, budget, revenu nul, dette>capacité, taux nul, invalides.
- `calc-immo.test.js` — rendements, effort d'épargne (signe), coût projet.
- `parity-legacy.test.js` — 10 scénarios (revenu seul, couple, crédits, apport, 10/15/20/25/30 ans, mixte, dette>capacité) : moteur === logique legacy réimplémentée indépendamment + paliers de taux.
- `lead-ui.test.js` — schéma payload, `submitLead` sans transport = rejet (anti-envoi prod), formatters, tracking whitelist + anti-PII.

**Résultat : 46 tests, 46 PASS, 0 FAIL.**

## 15. Procédure de migration future (indicative, hors CS-1)

CS-2+ : construire les simulateurs publics au-dessus de ce socle ; CS-4 : migrer `simulation-pret-immobilier.html` en injectant les mêmes hypothèses legacy (parité garantie) puis, après validation métier, remplacer `LEGACY_REFERENCE` par une grille sourcée/datée sans réécrire `calc-credit.js`. Aucune page/redirect/API en CS-1.

---

## Non-régression & git

- `simulation-pret-immobilier.html` : **inchangé**. Aucune page HTML de production modifiée. `build-header --check` (49) · `build-breadcrumbs --check` (48/48) · `check-mobile-nav` (63) : **verts**.
- Diff CS-1 = uniquement `assets/js/simulators/*`, `assets/css/simulators/simulators.css`, `tests/simulators/*`, `docs/CS-1-SOCLE-SIMULATEURS.md`. **Pas de `package.json`** (inutile).
- Commit `CS-1 : socle technique simulateurs V2` sur `credit-simulateurs-v2`. **Aucun merge main, aucune production.**

**STOP.** CS-2 / CS-3 / CS-4 non démarrés. En attente de validation.
