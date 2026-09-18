'use strict';
/* Tests de PARITÉ LEGACY — le nouveau moteur reproduit EXACTEMENT le calcul de
 * simulation-pret-immobilier.html LORSQUE les mêmes hypothèses legacy sont passées
 * (endettement 35 %, grille LEGACY_REFERENCE).
 * ⚠ PARITY_LEGACY ≠ VALIDATION MÉTIER : reproduit l'ancien calcul, ne valide ni
 * les taux, ni la règle bancaire, ni un conseil. La page legacy n'est PAS modifiée. */
const test = require('node:test');
const assert = require('node:assert');
const cc = require('../../assets/js/simulators/calc-credit.js');
const rates = require('../../assets/js/simulators/rates.js');

/* Réimplémentation INDÉPENDANTE de la logique legacy (d'après l'audit CS-0.5). */
function wzTauxLegacy(duree) {
  if (duree <= 10) return 3.10;
  if (duree <= 15) return 3.30;
  if (duree <= 20) return 3.45;
  return 3.60;
}
function legacy(s) {
  const revenus = s.revenu1 + (s.revenu2 || 0);
  const credits = s.credits || 0;
  const apport = s.apport || 0;
  const mensMax = Math.max(0, revenus * 0.35 - credits);
  const taux = wzTauxLegacy(s.duree);
  const tm = taux / 100 / 12;
  const nbMois = s.duree * 12;
  const facteur = (1 - Math.pow(1 + tm, -nbMois)) / tm;
  const capacite = Math.round(mensMax * facteur);
  return { taux, capacite, budget: capacite + apport };
}
function engine(s) {
  const revenus = s.revenu1 + (s.revenu2 || 0);
  const taux = rates.resolveRate(rates.LEGACY_REFERENCE, s.duree);
  const capacite = cc.calculateBorrowingCapacity({
    income: revenus, existingDebt: s.credits || 0,
    durationYears: s.duree, annualRate: taux, maxDebtRatio: 0.35
  });
  const budget = cc.calculateBudget({ capacity: capacite, apport: s.apport || 0 });
  return { taux, capacite, budget };
}

const scenarios = [
  { name: 'revenu seul 3500 / 10 ans', revenu1: 3500, duree: 10 },
  { name: 'revenu seul 4000 / 15 ans', revenu1: 4000, duree: 15 },
  { name: 'célibataire 4000 / 20 ans', revenu1: 4000, duree: 20 },
  { name: 'célibataire 4000 / 25 ans', revenu1: 4000, duree: 25 },
  { name: 'longue durée 4000 / 30 ans', revenu1: 4000, duree: 30 },
  { name: 'couple 4000+2500 / 20 ans', revenu1: 4000, revenu2: 2500, duree: 20 },
  { name: 'avec crédits 5000 -600 / 15 ans', revenu1: 5000, credits: 600, duree: 15 },
  { name: 'avec apport 4000 +50k / 25 ans', revenu1: 4000, apport: 50000, duree: 25 },
  { name: 'couple + crédits + apport / 20 ans', revenu1: 3800, revenu2: 2200, credits: 400, apport: 30000, duree: 20 },
  { name: 'dette > capacité (0) / 20 ans', revenu1: 1500, credits: 900, duree: 20 }
];

scenarios.forEach((s) => {
  test('parité legacy — ' + s.name, () => {
    const L = legacy(s);
    const E = engine(s);
    assert.strictEqual(E.taux, L.taux, 'taux');
    assert.strictEqual(E.capacite, L.capacite, 'capacité');
    assert.strictEqual(E.budget, L.budget, 'budget');
  });
});

test('grille LEGACY_REFERENCE : paliers wzTaux', () => {
  assert.strictEqual(rates.resolveRate(rates.LEGACY_REFERENCE, 8), 3.10);
  assert.strictEqual(rates.resolveRate(rates.LEGACY_REFERENCE, 10), 3.10);
  assert.strictEqual(rates.resolveRate(rates.LEGACY_REFERENCE, 15), 3.30);
  assert.strictEqual(rates.resolveRate(rates.LEGACY_REFERENCE, 20), 3.45);
  assert.strictEqual(rates.resolveRate(rates.LEGACY_REFERENCE, 25), 3.60);
  assert.strictEqual(rates.LEGACY_REFERENCE.kind, 'LEGACY_REFERENCE');
  assert.strictEqual(rates.LEGACY_REFERENCE.validated, false);
});
