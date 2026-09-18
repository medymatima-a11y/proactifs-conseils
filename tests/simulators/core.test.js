'use strict';
const test = require('node:test');
const assert = require('node:assert');
const core = require('../../assets/js/simulators/core.js');

const approx = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1e-6), `${a} ≈ ${b}`);

test('toNumber : formats FR / EN / invalides', () => {
  assert.strictEqual(core.toNumber(1234.5), 1234.5);
  assert.strictEqual(core.toNumber('1 234,56 €'), 1234.56);
  assert.strictEqual(core.toNumber('1 234,56'), 1234.56);
  assert.strictEqual(core.toNumber('2 000'), 2000);
  assert.strictEqual(core.toNumber('35%'), 35);
  assert.ok(Number.isNaN(core.toNumber('abc')));
  assert.ok(Number.isNaN(core.toNumber('')));
  assert.ok(Number.isNaN(core.toNumber(null)));
  assert.ok(Number.isNaN(core.toNumber(undefined)));
});

test('isValidNumber', () => {
  assert.strictEqual(core.isValidNumber(0), true);
  assert.strictEqual(core.isValidNumber(-3.2), true);
  assert.strictEqual(core.isValidNumber(NaN), false);
  assert.strictEqual(core.isValidNumber(Infinity), false);
  assert.strictEqual(core.isValidNumber('5'), false);
});

test('round', () => {
  assert.strictEqual(core.round(1234.567, 2), 1234.57);
  assert.strictEqual(core.round(2.5, 0), 3);
  assert.strictEqual(core.round(241882.9, 0), 241883);
  assert.ok(Number.isNaN(core.round('x', 2)));
});

test('clampMin', () => {
  assert.strictEqual(core.clampMin(-5, 0), 0);
  assert.strictEqual(core.clampMin(10, 0), 10);
});

test('monthsFromYears / monthlyRate', () => {
  assert.strictEqual(core.monthsFromYears(20), 240);
  approx(core.monthlyRate(3.6), 0.003);
  assert.strictEqual(core.monthlyRate(0), 0);
});

test('annuityFactor : taux nul -> n', () => {
  assert.strictEqual(core.annuityFactor({ annualRatePct: 0, months: 240 }), 240);
});

test('annuityFactor : valeur connue (3.45%, 240 mois)', () => {
  approx(core.annuityFactor({ annualRatePct: 3.45, months: 240 }), 173.1920, 1e-3);
});

test('monthlyPayment : taux nul = principal/mois (exact)', () => {
  assert.strictEqual(core.monthlyPayment({ principal: 120000, annualRatePct: 0, months: 240 }), 500);
});

test('monthlyPayment : valeur connue (200k, 3.6%, 300 mois)', () => {
  approx(core.monthlyPayment({ principal: 200000, annualRatePct: 3.6, months: 300 }), 1011.99, 0.5);
});

test('principalFromPayment : inverse de monthlyPayment (round-trip)', () => {
  const principal = 250000, annualRatePct = 3.3, months = 240;
  const pay = core.monthlyPayment({ principal, annualRatePct, months });
  const back = core.principalFromPayment({ payment: pay, annualRatePct, months });
  approx(back, principal, 1e-4);
});

test('creditCost = mensualité*mois - capital', () => {
  assert.strictEqual(core.creditCost({ payment: 1000, months: 240, principal: 200000 }), 40000);
});

test('cas limites : durée/valeurs invalides -> NaN', () => {
  assert.ok(Number.isNaN(core.monthlyPayment({ principal: 100000, annualRatePct: 3, months: 0 })));
  assert.ok(Number.isNaN(core.monthlyPayment({ principal: 100000, annualRatePct: 3, months: -12 })));
  assert.ok(Number.isNaN(core.monthlyPayment({ principal: 'x', annualRatePct: 3, months: 240 })));
  assert.ok(Number.isNaN(core.annuityFactor({ annualRatePct: 3, months: 0 })));
});

test('grandes valeurs -> fini et positif', () => {
  const pay = core.monthlyPayment({ principal: 1e9, annualRatePct: 3.6, months: 300 });
  assert.ok(Number.isFinite(pay) && pay > 0);
});
