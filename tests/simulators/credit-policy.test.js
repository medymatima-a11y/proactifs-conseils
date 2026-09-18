'use strict';
/* ==========================================================================
 * Tests CS-3 — couche métier financement Proactifs V1 (credit-policy.js).
 * Vérifie la politique, la rétention des revenus/charges, la mensualité
 * disponible, le reste à vivre informatif, la fiabilité, les drapeaux de revue,
 * l'immutabilité et l'ABSENCE de tout verdict bancaire.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');

const policyMod = require('../../assets/js/simulators/credit-policy.js');
const cc = require('../../assets/js/simulators/calc-credit.js');

const P = policyMod.PROACTIFS_CREDIT_POLICY_V1;
const {
  RELIABILITY, REVIEW_FLAGS,
  calculateRetainedRentalIncome, calculateRetainedIncome, calculateRetainedCharges,
  calculateAvailablePayment, calculateEstimatedRemainingIncome,
  evaluateFinancingInputs, validateFinancingInput
} = policyMod;

/* ---- A : politique — identité & valeurs ------------------------------- */
test('A) politique : identité & valeurs de référence', () => {
  assert.strictEqual(P.id, 'PROACTIFS_CREDIT_POLICY_V1');
  assert.strictEqual(P.version, '1.0.0');
  assert.strictEqual(P.effectiveDate, '2026-09-17');
  assert.strictEqual(P.status, 'INTERNAL_VALIDATION');
  assert.strictEqual(P.maxDebtRatio, 0.35);
  assert.strictEqual(P.rentalIncomeRetention, 0.70);
  assert.strictEqual(P.insuranceMode, 'USER_PROVIDED_OR_UNKNOWN');
  assert.strictEqual(P.includeRemainingRent, true);
});

/* ---- B : politique — durées publiques (30 exclu) ---------------------- */
test('B) politique : durées publiques 10/15/20/25, 30 exclu du public', () => {
  assert.deepStrictEqual(P.publicDurations, [10, 15, 20, 25]);
  assert.deepStrictEqual(P.excludedPublicDurations, [30]);
  assert.strictEqual(P.maxPublicDurationYears, 25);
  assert.strictEqual(P.publicDurations.indexOf(30), -1);
});

/* ---- C : politique — immutabilité (Object.freeze récursif) ------------ */
test('C) politique : gelée récursivement, mutation impossible', () => {
  assert.ok(Object.isFrozen(P));
  assert.ok(Object.isFrozen(P.incomeCategories));
  assert.ok(Object.isFrozen(P.incomeCategories.PRIMARY_INCOME));
  assert.ok(Object.isFrozen(P.meta));
  assert.ok(Object.isFrozen(P.sources));
  assert.ok(Object.isFrozen(P.sources[0]));
  try { P.maxDebtRatio = 0.5; } catch (e) { /* strict -> TypeError, toléré */ }
  try { P.incomeCategories.PRIMARY_INCOME.retentionRate = 0.1; } catch (e) {}
  assert.strictEqual(P.maxDebtRatio, 0.35);
  assert.strictEqual(P.incomeCategories.PRIMARY_INCOME.retentionRate, 1.0);
});

/* ---- D : meta — sens des valeurs sensibles (anti-contresens) ---------- */
test('D) meta : 35 % = référence (pas limite d’accord) ; 70 % = hypothèse Proactifs', () => {
  assert.strictEqual(P.meta.maxDebtRatio.kind, 'REFERENCE_STANDARD');
  assert.strictEqual(P.meta.maxDebtRatio.note, 'NOT_ABSOLUTE_APPROVAL_LIMIT');
  assert.strictEqual(P.meta.maxDebtRatio.source, 'HCSF');
  assert.strictEqual(P.meta.rentalIncomeRetention.kind, 'PROACTIFS_SIMULATION_ASSUMPTION');
  assert.strictEqual(P.meta.rentalIncomeRetention.note, 'NOT_REGULATORY_RULE');
  assert.strictEqual(P.meta.rentalIncomeRetention.source, 'PROACTIFS');
});

/* ---- E : sources — HCSF vs Proactifs ---------------------------------- */
test('E) sources : taux d’effort & durée = HCSF ; décote 70 % = PROACTIFS (jamais HCSF)', () => {
  const byRule = {};
  P.sources.forEach(s => { byRule[s.rule] = s; });
  assert.strictEqual(byRule.maxDebtRatio.origin, 'HCSF');
  assert.strictEqual(byRule.maxPublicDurationYears.origin, 'HCSF');
  assert.strictEqual(byRule.rentalIncomeRetention.origin, 'PROACTIFS');
  assert.notStrictEqual(byRule.rentalIncomeRetention.origin, 'HCSF');
  assert.ok(/hypoth[eè]se/i.test(byRule.rentalIncomeRetention.note));
});

/* ---- F : incomeCategories — règles de rétention ----------------------- */
test('F) incomeCategories : 100 % primaire/co, 70 % locatif, autre = revue manuelle', () => {
  const ic = P.incomeCategories;
  assert.strictEqual(ic.PRIMARY_INCOME.retentionRate, 1.0);
  assert.strictEqual(ic.PRIMARY_INCOME.automaticRetention, true);
  assert.strictEqual(ic.CO_BORROWER_INCOME.retentionRate, 1.0);
  assert.strictEqual(ic.CO_BORROWER_INCOME.automaticRetention, true);
  assert.strictEqual(ic.EXISTING_RENTAL_INCOME.retentionRate, 0.70);
  assert.strictEqual(ic.EXISTING_RENTAL_INCOME.automaticRetention, true);
  assert.strictEqual(ic.PROJECTED_RENTAL_INCOME.retentionRate, 0.70);
  assert.strictEqual(ic.OTHER_STABLE_INCOME.automaticRetention, false);
  assert.strictEqual(ic.OTHER_STABLE_INCOME.warning, 'REQUIRES_MANUAL_REVIEW');
});

/* ---- G : calculateRetainedRentalIncome — exemple de référence --------- */
test('G) rétention locative : 1000 + 1200 @0,70 -> brut 2200, retenu 1540, exclu 660', () => {
  const r = calculateRetainedRentalIncome({
    existingRentalIncome: 1000, projectedRentalIncome: 1200, retentionRate: 0.70
  });
  assert.strictEqual(r.grossRentalIncome, 2200);
  assert.strictEqual(r.retainedRentalIncome, 1540);
  assert.strictEqual(r.excludedRentalIncome, 660);
  assert.strictEqual(r.retentionRate, 0.70);
});

/* ---- H : rétention locative — taux par défaut & cas nul --------------- */
test('H) rétention locative : taux invalide -> défaut 0,70 ; tout à 0 -> 0/0/0', () => {
  const def = calculateRetainedRentalIncome({ existingRentalIncome: 1000, projectedRentalIncome: 0 });
  assert.strictEqual(def.retentionRate, 0.70);
  assert.strictEqual(def.retainedRentalIncome, 700);
  const bad = calculateRetainedRentalIncome({ existingRentalIncome: 1000, retentionRate: 5 });
  assert.strictEqual(bad.retentionRate, 0.70); // hors [0,1] -> défaut
  const zero = calculateRetainedRentalIncome({});
  assert.deepStrictEqual(
    [zero.grossRentalIncome, zero.retainedRentalIncome, zero.excludedRentalIncome], [0, 0, 0]
  );
});

/* ---- I : calculateRetainedIncome — composition ------------------------ */
test('I) revenus retenus : primaire+co 100 %, locatif 70 %, autres NON comptés', () => {
  const inc = calculateRetainedIncome({
    primaryIncome: 3000, coBorrowerIncome: 1000,
    existingRentalIncome: 1000, projectedRentalIncome: 1200,
    otherStableIncome: 500
  });
  // 3000 + 1000 + (2200*0.70=1540) = 5540 ; 500 "autres" exclus
  assert.strictEqual(inc.totalRetainedIncome, 5540);
  assert.strictEqual(inc.otherStableIncome, 500);
  assert.strictEqual(inc.otherStableIncomeRetained, 0);
});

/* ---- J : calculateRetainedIncome — drapeaux --------------------------- */
test('J) revenus retenus : drapeaux locatif / projeté / autres revenus', () => {
  const inc = calculateRetainedIncome({
    primaryIncome: 3000, existingRentalIncome: 800, projectedRentalIncome: 400, otherStableIncome: 200
  });
  assert.ok(inc.reviewFlags.indexOf(REVIEW_FLAGS.RENTAL_INCOME_ASSUMPTION_USED) !== -1);
  assert.ok(inc.reviewFlags.indexOf(REVIEW_FLAGS.PROJECTED_RENTAL_INCOME_USED) !== -1);
  assert.ok(inc.reviewFlags.indexOf(REVIEW_FLAGS.OTHER_INCOME_REQUIRES_REVIEW) !== -1);
  const simple = calculateRetainedIncome({ primaryIncome: 3000 });
  assert.strictEqual(simple.reviewFlags.length, 0);
});

/* ---- K : calculateRetainedCharges — somme sans double comptage -------- */
test('K) charges : crédits + loyer résiduel + assurance, sans double comptage', () => {
  const c = calculateRetainedCharges({
    existingLoanPayments: 300, remainingHousingRent: 700, monthlyInsurance: 50
  });
  assert.strictEqual(c.existingLoanPayments, 300);
  assert.strictEqual(c.remainingHousingRent, 700);
  assert.strictEqual(c.monthlyInsurance, 50);
  assert.strictEqual(c.totalRetainedCharges, 1050);
});

/* ---- L : charges — assurance fournie ---------------------------------- */
test('L) charges : assurance fournie -> incluse, aucun flag assurance', () => {
  const c = calculateRetainedCharges({ existingLoanPayments: 0, monthlyInsurance: 40 });
  assert.strictEqual(c.insuranceIncluded, true);
  assert.strictEqual(c.monthlyInsurance, 40);
  assert.ok(c.reviewFlags.indexOf(REVIEW_FLAGS.INSURANCE_NOT_INCLUDED) === -1);
});

/* ---- M : charges — assurance absente ---------------------------------- */
test('M) charges : assurance absente -> 0 + drapeau INSURANCE_NOT_INCLUDED', () => {
  const c = calculateRetainedCharges({ existingLoanPayments: 0 });
  assert.strictEqual(c.insuranceIncluded, false);
  assert.strictEqual(c.monthlyInsurance, 0);
  assert.ok(c.reviewFlags.indexOf(REVIEW_FLAGS.INSURANCE_NOT_INCLUDED) !== -1);
});

/* ---- N : charges — loyer résiduel inclus ------------------------------ */
test('N) charges : loyer résiduel > 0 -> drapeau REMAINING_RENT_INCLUDED', () => {
  const c = calculateRetainedCharges({ remainingHousingRent: 850, monthlyInsurance: 0 });
  assert.strictEqual(c.remainingHousingRent, 850);
  assert.ok(c.reviewFlags.indexOf(REVIEW_FLAGS.REMAINING_RENT_INCLUDED) !== -1);
});

/* ---- O : charges — crédit à échéance ne réduit rien ------------------- */
test('O) charges : existingLoansEndingSoon -> drapeau seul, charges non réduites', () => {
  const c = calculateRetainedCharges({
    existingLoanPayments: 300, monthlyInsurance: 0, existingLoansEndingSoon: true
  });
  assert.strictEqual(c.existingLoanPayments, 300);      // NON réduit
  assert.strictEqual(c.totalRetainedCharges, 300);
  assert.ok(c.reviewFlags.indexOf(REVIEW_FLAGS.EXISTING_LOAN_ENDING_SOON_REVIEW) !== -1);
});

/* ---- P : calculateAvailablePayment — formule -------------------------- */
test('P) mensualité disponible : revenus*0,35 − charges', () => {
  const avail = calculateAvailablePayment({
    totalRetainedIncome: 4000, existingLoanPayments: 300, remainingHousingRent: 0,
    monthlyInsurance: 50, maxDebtRatio: 0.35
  });
  // 4000*0.35=1400 ; -300 -50 = 1050
  assert.strictEqual(avail, 1050);
});

/* ---- Q : calculateAvailablePayment — plancher 0 ----------------------- */
test('Q) mensualité disponible : jamais négative (plancher 0)', () => {
  const avail = calculateAvailablePayment({
    totalRetainedIncome: 2000, existingLoanPayments: 900, monthlyInsurance: 0, maxDebtRatio: 0.35
  });
  // 2000*0.35=700 ; -900 -> plancher 0
  assert.strictEqual(avail, 0);
});

/* ---- R : calculateAvailablePayment — réutilise CS-1 ------------------- */
test('R) mensualité disponible : identique au primitif CS-1 calculateMaxPayment', () => {
  const income = 5200, charges = 300 + 0 + 45;
  const avail = calculateAvailablePayment({
    totalRetainedIncome: income, existingLoanPayments: 300, monthlyInsurance: 45, maxDebtRatio: 0.35
  });
  const ref = cc.calculateMaxPayment({ income: income, existingDebt: charges, maxDebtRatio: 0.35 });
  // même formule CS-1 ; la couche métier arrondit au centime (évite les artefacts flottants)
  assert.strictEqual(avail, Math.round(ref * 100) / 100);
});

/* ---- S : calculateEstimatedRemainingIncome — informatif --------------- */
test('S) reste à vivre estimé : informatif, revenus − charges − dispo', () => {
  const rav = calculateEstimatedRemainingIncome({
    totalRetainedIncome: 4000, totalRetainedCharges: 350, availableMonthlyPayment: 1050
  });
  assert.strictEqual(rav, 2600); // 4000-350-1050
});

/* ---- T : evaluateFinancingInputs — structure -------------------------- */
test('T) orchestrateur : structure complète du résultat', () => {
  const out = evaluateFinancingInputs({ primaryIncome: 4000, monthlyInsurance: 50 });
  ['retainedIncome', 'retainedCharges', 'availableMonthlyPayment', 'estimatedRemainingIncome',
    'reviewFlags', 'reliability', 'warnings', 'maxDebtRatio', 'policyId', 'policyVersion']
    .forEach(k => assert.ok(Object.prototype.hasOwnProperty.call(out, k), 'champ manquant: ' + k));
  assert.strictEqual(out.policyId, 'PROACTIFS_CREDIT_POLICY_V1');
  assert.strictEqual(out.maxDebtRatio, 0.35);
  assert.strictEqual(out.availableMonthlyPayment, 1350); // 4000*0.35 -50
});

/* ---- U : orchestrateur — fiabilité STANDARD --------------------------- */
test('U) fiabilité STANDARD : assurance fournie, cas simple', () => {
  const out = evaluateFinancingInputs({ primaryIncome: 4000, monthlyInsurance: 50 });
  assert.strictEqual(out.reliability, RELIABILITY.STANDARD);
});

/* ---- V : orchestrateur — fiabilité PARTIAL ---------------------------- */
test('V) fiabilité PARTIAL : assurance inconnue', () => {
  const out = evaluateFinancingInputs({ primaryIncome: 4000 });
  assert.strictEqual(out.reliability, RELIABILITY.PARTIAL);
  assert.ok(out.reviewFlags.indexOf(REVIEW_FLAGS.INSURANCE_NOT_INCLUDED) !== -1);
});

/* ---- W : orchestrateur — fiabilité MANUAL_REVIEW ---------------------- */
test('W) fiabilité MANUAL_REVIEW : autres revenus OU crédit à échéance', () => {
  const a = evaluateFinancingInputs({ primaryIncome: 4000, monthlyInsurance: 50, otherStableIncome: 300 });
  assert.strictEqual(a.reliability, RELIABILITY.MANUAL_REVIEW);
  const b = evaluateFinancingInputs({ primaryIncome: 4000, monthlyInsurance: 50, existingLoansEndingSoon: true });
  assert.strictEqual(b.reliability, RELIABILITY.MANUAL_REVIEW);
});

/* ---- X : orchestrateur — AUCUN verdict bancaire ----------------------- */
test('X) aucun verdict bancaire : ni champ décisionnel, ni valeur APPROVED/ELIGIBLE', () => {
  const out = evaluateFinancingInputs({
    primaryIncome: 4000, coBorrowerIncome: 1500, existingRentalIncome: 800,
    projectedRentalIncome: 400, monthlyInsurance: 60, existingLoanPayments: 250
  });
  ['decision', 'eligible', 'eligibility', 'approved', 'status', 'score', 'verdict', 'accepted', 'probability']
    .forEach(k => assert.ok(!Object.prototype.hasOwnProperty.call(out, k), 'champ interdit présent: ' + k));
  const serialized = JSON.stringify(out);
  // Jetons de verdict machine (enums MAJUSCULES) interdits. Sensible à la casse :
  // les avertissements en prose ("ni accord, ni refus") sont voulus et autorisés.
  assert.ok(
    !/\b(APPROVED|DECLINED|DENIED|ELIGIBLE|INELIGIBLE|NOT_ELIGIBLE|REFUSED|ACCEPTED|REJECTED)\b/.test(serialized),
    'jeton de verdict bancaire interdit dans le résultat'
  );
  // reliability n'est pas un score : c'est une des 3 étiquettes de simulation
  assert.ok([RELIABILITY.STANDARD, RELIABILITY.PARTIAL, RELIABILITY.MANUAL_REVIEW].indexOf(out.reliability) !== -1);
});

/* ---- Validation & robustesse ------------------------------------------ */
test('Validation : revenu principal requis > 0, autres >= 0', () => {
  assert.strictEqual(validateFinancingInput({ primaryIncome: 4000 }).ok, true);
  assert.strictEqual(validateFinancingInput({ primaryIncome: 0 }).ok, false);
  assert.strictEqual(validateFinancingInput({}).ok, false);
  assert.strictEqual(validateFinancingInput({ primaryIncome: 4000, existingLoanPayments: -10 }).ok, false);
  assert.strictEqual(validateFinancingInput({ primaryIncome: 4000, monthlyInsurance: 'abc' }).ok, false);
});

test('Robustesse : entrées undefined/null/NaN/négatif/chaîne -> pas de crash, valeurs saines', () => {
  const out = evaluateFinancingInputs({
    primaryIncome: 'x', coBorrowerIncome: null, existingRentalIncome: NaN,
    projectedRentalIncome: -500, otherStableIncome: undefined,
    existingLoanPayments: 'abc', remainingHousingRent: -1, monthlyInsurance: null
  });
  assert.strictEqual(out.retainedIncome.totalRetainedIncome, 0);
  assert.strictEqual(out.availableMonthlyPayment, 0);
  assert.ok(core_isFiniteNumber(out.estimatedRemainingIncome));
});
function core_isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

test('Formats FR : "4 000" et "1 200,50" normalisés', () => {
  const inc = calculateRetainedIncome({ primaryIncome: '4 000', existingRentalIncome: '1 000' });
  // 4000 + 1000*0.70 = 4700
  assert.strictEqual(inc.totalRetainedIncome, 4700);
});

/* ---- Composition avec le moteur CS-1 (capacité) ----------------------- */
test('Composition CS-1 : dispo sans charges = revenus*0,35 (= capacité cohérente)', () => {
  const out = evaluateFinancingInputs({ primaryIncome: 4000, monthlyInsurance: 0 });
  const refPayment = cc.calculateMaxPayment({ income: 4000, existingDebt: 0, maxDebtRatio: 0.35 });
  assert.strictEqual(out.availableMonthlyPayment, refPayment); // 1400
});

/* ---- Warnings : messages métier présents ------------------------------ */
test('Warnings : mention "ni accord, ni refus" + 35 % référence + hypothèse 70 %', () => {
  const out = evaluateFinancingInputs({ primaryIncome: 4000, existingRentalIncome: 1000, monthlyInsurance: 40 });
  const codes = out.warnings.map(w => w.code);
  assert.ok(codes.indexOf('NOT_A_BANK_DECISION') !== -1);
  assert.ok(codes.indexOf('MAX_DEBT_RATIO_REFERENCE') !== -1);
  assert.ok(codes.indexOf('RENTAL_INCOME_ASSUMPTION') !== -1);
  const txt = out.warnings.map(w => w.message).join(' ');
  assert.ok(/ni accord, ni refus/i.test(txt));
});
