'use strict';
/* ==========================================================================
 * Tests CS-4A — intégration fonctionnelle capacité d'emprunt V2.
 * Vérifie que le prototype utilise CS-3 (politique) + CS-3.5 (ACTIVE_MARKET_REFERENCE)
 * + CS-1 (moteur), les scénarios A–G, les taux marché, la fraîcheur, les mappings UX,
 * et l'absence de tout verdict bancaire ou de taux legacy visible.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const proto = require('../../assets/js/simulators/prototype-capacity.js');
const rates = require('../../assets/js/simulators/rates.js');
const core = require('../../assets/js/simulators/core.js');

/* Helper : calcul V2 avec une date de référence fixe (fraîcheur déterministe). */
function run(d, asOf) { return proto.computeCapacityV2(d, { asOfDate: asOf || '2026-09-20' }); }

/* ---- Taux marché : ACTIVE, pas de legacy, pas de 30 -------------------- */
test('Taux ACTIVE : 10→3.20, 15→3.35, 20→3.50, 25→3.60', () => {
  assert.strictEqual(run({ income1: 4000, durationYears: 10 }).rate, 3.20);
  assert.strictEqual(run({ income1: 4000, durationYears: 15 }).rate, 3.35);
  assert.strictEqual(run({ income1: 4000, durationYears: 20 }).rate, 3.50);
  assert.strictEqual(run({ income1: 4000, durationYears: 25 }).rate, 3.60);
});
test('Taux V2 ≠ grille legacy (3.45 pour 20 ans exclu)', () => {
  assert.strictEqual(run({ income1: 4000, durationYears: 20 }).rate, 3.50);
  assert.notStrictEqual(run({ income1: 4000, durationYears: 20 }).rate, 3.45);
});
test('30 ans non supporté par le référentiel marché', () => {
  const r = run({ income1: 4000, durationYears: 30 });
  assert.strictEqual(r.rateSupported, false);
  assert.ok(!core.isValidNumber(r.capacity));
  assert.ok(proto.PUBLIC_DURATIONS.indexOf(30) === -1);
});

/* ---- Cohérence moteur : capacité = principalFromPayment(dispo, taux) --- */
test('Capacité cohérente avec CS-1 (principalFromPayment)', () => {
  const r = run({ income1: 4000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  // dispo = 4000*0.35 = 1400 ; taux 3.50 ; 240 mois
  const expected = core.round(core.principalFromPayment({ payment: 1400, annualRatePct: 3.50, months: 240 }), 0);
  assert.strictEqual(r.availableMonthlyPayment, 1400);
  assert.strictEqual(r.capacity, expected);
  assert.strictEqual(r.budget, expected); // apport 0
});

/* ---- SCÉNARIO A : salarié seul, RP, pas de locatif, assurance connue --- */
test('Scénario A : salarié seul, RP, assurance connue → STANDARD', () => {
  const r = run({ projet: 'residence-principale', situation: 'seul', income1: 3500, durationYears: 20, knowsInsurance: 'oui', insurance: 40 });
  assert.strictEqual(r.reliability, 'STANDARD');
  assert.strictEqual(r.reviewFlags.length, 0);
  assert.strictEqual(r.ux.reliability.title, 'Votre première estimation est prête.');
});

/* ---- SCÉNARIO B : couple, RP → co-emprunteur pris en compte ------------ */
test('Scénario B : couple → revenu co-emprunteur intégré (100%)', () => {
  const r = run({ projet: 'residence-principale', situation: 'deux', income1: 4000, income2: 2500, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.strictEqual(r.retainedIncome.totalRetainedIncome, 6500);
  assert.strictEqual(r.availableMonthlyPayment, core.round(6500 * 0.35, 2));
});

/* ---- SCÉNARIO C : investissement locatif, loyer futur ------------------ */
test('Scénario C : investissement locatif → PROJECTED_RENTAL_INCOME_USED', () => {
  const r = run({ projet: 'investissement-locatif', situation: 'seul', income1: 3000, projectedRental: 800, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.ok(r.reviewFlags.indexOf('PROJECTED_RENTAL_INCOME_USED') !== -1);
  assert.ok(r.reviewFlags.indexOf('RENTAL_INCOME_ASSUMPTION_USED') !== -1);
  // 3000 + 800*0.70 = 3560
  assert.strictEqual(r.retainedIncome.totalRetainedIncome, 3560);
});

/* ---- SCÉNARIO D : bailleur existant → locatif 70% --------------------- */
test('Scénario D : bailleur existant → RENTAL_INCOME_ASSUMPTION_USED, 70%', () => {
  const r = run({ projet: 'residence-principale', situation: 'seul', income1: 3000, hasRental: 'oui', rentalExisting: 1000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.ok(r.reviewFlags.indexOf('RENTAL_INCOME_ASSUMPTION_USED') !== -1);
  assert.strictEqual(r.retainedIncome.rental.retainedRentalIncome, 700); // 1000*0.70
  assert.strictEqual(r.retainedIncome.totalRetainedIncome, 3700);
});

/* ---- SCÉNARIO E : locataire réalisant un investissement --------------- */
test('Scénario E : loyer restant → REMAINING_RENT_INCLUDED (dans les charges)', () => {
  const r = run({ projet: 'investissement-locatif', situation: 'seul', income1: 4000, remainTenant: 'oui', remainingRent: 900, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.ok(r.reviewFlags.indexOf('REMAINING_RENT_INCLUDED') !== -1);
  assert.strictEqual(r.retainedCharges.remainingHousingRent, 900);
  // dispo = 4000*0.35 - 900 = 500
  assert.strictEqual(r.availableMonthlyPayment, 500);
});

/* ---- SCÉNARIO F : assurance inconnue → PARTIAL ------------------------ */
test('Scénario F : assurance inconnue → INSURANCE_NOT_INCLUDED + PARTIAL + calcul autorisé', () => {
  const r = run({ projet: 'residence-principale', situation: 'seul', income1: 4000, durationYears: 20, knowsInsurance: 'non' });
  assert.strictEqual(r.reliability, 'PARTIAL');
  assert.ok(r.reviewFlags.indexOf('INSURANCE_NOT_INCLUDED') !== -1);
  assert.ok(core.isValidNumber(r.capacity)); // calcul non bloqué
  assert.strictEqual(r.ux.reliability.title, 'Cette estimation peut être affinée.');
  assert.ok(r.ux.flags.some(m => /assurance/i.test(m)));
});

/* ---- SCÉNARIO G : autres revenus → MANUAL_REVIEW ---------------------- */
test('Scénario G : autres revenus → OTHER_INCOME_REQUIRES_REVIEW + MANUAL_REVIEW, non intégrés', () => {
  const r = run({ projet: 'residence-principale', situation: 'seul', income1: 4000, otherIncome: 500, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.strictEqual(r.reliability, 'MANUAL_REVIEW');
  assert.ok(r.reviewFlags.indexOf('OTHER_INCOME_REQUIRES_REVIEW') !== -1);
  assert.strictEqual(r.retainedIncome.totalRetainedIncome, 4000); // 500 non intégrés
  assert.strictEqual(r.ux.reliability.title, 'Votre situation mérite une étude personnalisée.');
});

/* ---- Crédit à échéance : signalé, charges non réduites ---------------- */
test('Crédit à échéance : EXISTING_LOAN_ENDING_SOON_REVIEW, charges inchangées', () => {
  const r = run({ income1: 4000, existingDebt: 300, loanEndingSoon: true, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.ok(r.reviewFlags.indexOf('EXISTING_LOAN_ENDING_SOON_REVIEW') !== -1);
  assert.strictEqual(r.retainedCharges.existingLoanPayments, 300); // non réduit
  assert.strictEqual(r.reliability, 'MANUAL_REVIEW');
});

/* ---- Fraîcheur : CURRENT / REVIEW_DUE / STALE ------------------------- */
test('Fraîcheur CURRENT (simulation normale, pas de message)', () => {
  const r = run({ income1: 4000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 }, '2026-09-25');
  assert.strictEqual(r.freshness.state, 'CURRENT');
  assert.strictEqual(r.ux.freshness.message, '');
});
test('Fraîcheur REVIEW_DUE (message discret)', () => {
  const r = run({ income1: 4000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 }, '2026-10-25');
  assert.strictEqual(r.freshness.state, 'REVIEW_DUE');
  assert.strictEqual(r.ux.freshness.level, 'info');
  assert.ok(r.ux.freshness.message.length > 0);
});
test('Fraîcheur STALE (message explicite d’actualisation)', () => {
  const r = run({ income1: 4000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 }, '2026-12-15');
  assert.strictEqual(r.freshness.state, 'STALE');
  assert.strictEqual(r.ux.freshness.level, 'warn');
  assert.ok(/actualis/i.test(r.ux.freshness.message));
});

/* ---- Libellé du mois de référence dérivé de effectiveMonth ------------ */
test('Libellé référence dérivé (2026-09 → "septembre 2026")', () => {
  assert.strictEqual(proto.marketMonthLabel('2026-09'), 'septembre 2026');
  const r = run({ income1: 4000, durationYears: 20, knowsInsurance: 'oui', insurance: 0 });
  assert.strictEqual(r.ux.marketLabel, 'septembre 2026');
  assert.strictEqual(r.effectiveMonth, '2026-09');
});

/* ---- Aucun verdict bancaire dans le résultat -------------------------- */
test('Aucun verdict bancaire (ni champ, ni jeton, ni score)', () => {
  const r = run({ projet: 'investissement-locatif', situation: 'deux', income1: 4000, income2: 1500, hasRental: 'oui', rentalExisting: 800, projectedRental: 600, existingDebt: 250, remainTenant: 'oui', remainingRent: 700, knowsInsurance: 'oui', insurance: 60, durationYears: 25 });
  ['decision', 'eligible', 'approved', 'status', 'score', 'verdict', 'probability'].forEach(k =>
    assert.ok(!Object.prototype.hasOwnProperty.call(r, k)));
  const s = JSON.stringify(r);
  assert.ok(!/\b(APPROVED|DECLINED|ELIGIBLE|INELIGIBLE|REFUSED|ACCEPTED|REJECTED)\b/.test(s));
  // reliability reste une des 3 étiquettes de simulation
  assert.ok(['STANDARD', 'PARTIAL', 'MANUAL_REVIEW'].indexOf(r.reliability) !== -1);
});

/* ---- Mapping flags : jamais de code technique brut -------------------- */
test('Mapping flags : messages client, aucun code brut', () => {
  const msgs = proto.mapReviewFlags(['INSURANCE_NOT_INCLUDED', 'RENTAL_INCOME_ASSUMPTION_USED']);
  assert.strictEqual(msgs.length, 2);
  msgs.forEach(m => assert.ok(!/INSURANCE_NOT_INCLUDED|RENTAL_INCOME_ASSUMPTION_USED|_/.test(m)));
});

/* ---- buildFinancingInput : mapping conditionnel ----------------------- */
test('buildFinancingInput : co/locatif/loyer/assurance conditionnels', () => {
  const seul = proto.buildFinancingInput({ situation: 'seul', income1: 4000, income2: 2000 });
  assert.strictEqual(seul.coBorrowerIncome, 0); // co ignoré si seul
  const nonLocatif = proto.buildFinancingInput({ projet: 'residence-principale', projectedRental: 800 });
  assert.strictEqual(nonLocatif.projectedRentalIncome, 0); // projeté ignoré hors investissement
  const insconnue = proto.buildFinancingInput({ knowsInsurance: 'non', insurance: 50 });
  assert.strictEqual(insconnue.monthlyInsurance, undefined); // inconnue → undefined (PARTIAL)
});

/* ---- validateStepV2 : durées publiques, 30 refusé -------------------- */
test('validateStepV2 : durée 30 refusée, 20 acceptée', () => {
  assert.strictEqual(proto.validateStepV2(3, { existingDebt: '0', apport: '0', durationYears: 30 }).ok, false);
  assert.strictEqual(proto.validateStepV2(3, { existingDebt: '0', apport: '0', durationYears: 20 }).ok, true);
});
