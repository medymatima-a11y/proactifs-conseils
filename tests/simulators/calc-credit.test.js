'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cc = require('../../assets/js/simulators/calc-credit.js');

const approx = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1), `${a} ≈ ${b}`);

test('calculateMaxPayment : mensualité max (35%)', () => {
  assert.strictEqual(cc.calculateMaxPayment({ income: 4000, existingDebt: 0, maxDebtRatio: 0.35 }), 1400);
  assert.strictEqual(cc.calculateMaxPayment({ income: 4000, existingDebt: 500, maxDebtRatio: 0.35 }), 900);
});

test('calculateMaxPayment : dette > capacité -> 0 (pas de négatif)', () => {
  assert.strictEqual(cc.calculateMaxPayment({ income: 2000, existingDebt: 5000, maxDebtRatio: 0.35 }), 0);
});

test('calculateBorrowingCapacity : célibataire 4000€, 20 ans, 3.45%, 35%', () => {
  const cap = cc.calculateBorrowingCapacity({
    income: 4000, existingDebt: 0, durationYears: 20, annualRate: 3.45, maxDebtRatio: 0.35
  });
  approx(cap, 242469, 1);
});

test('calculateBorrowingCapacity : revenu nul -> 0', () => {
  const cap = cc.calculateBorrowingCapacity({
    income: 0, existingDebt: 0, durationYears: 20, annualRate: 3.45, maxDebtRatio: 0.35
  });
  assert.strictEqual(cap, 0);
});

test('calculateBorrowingCapacity : taux nul -> mensMax * nbMois', () => {
  const cap = cc.calculateBorrowingCapacity({
    income: 4000, existingDebt: 0, durationYears: 20, annualRate: 0, maxDebtRatio: 0.35
  });
  assert.strictEqual(cap, 1400 * 240); // 336000
});

test('calculateBorrowingCapacity : durée invalide -> NaN', () => {
  assert.ok(Number.isNaN(cc.calculateBorrowingCapacity({
    income: 4000, existingDebt: 0, durationYears: 0, annualRate: 3.45, maxDebtRatio: 0.35
  })));
});

test('calculateDebtRatio', () => {
  approx(cc.calculateDebtRatio({ payment: 1400, income: 4000 }), 0.35, 1e-9);
  assert.ok(Number.isNaN(cc.calculateDebtRatio({ payment: 1400, income: 0 })));
});

test('calculateMonthlyPayment', () => {
  approx(cc.calculateMonthlyPayment({ principal: 200000, annualRatePct: 3.6, durationYears: 25 }), 1011.99, 0.5);
  assert.ok(Number.isNaN(cc.calculateMonthlyPayment({ principal: 200000, annualRatePct: 3.6, durationYears: 0 })));
});

test('calculateCreditCost : positif et cohérent', () => {
  const cost = cc.calculateCreditCost({ principal: 200000, annualRatePct: 3.6, durationYears: 25 });
  assert.ok(cost > 0 && cost < 200000);
});

test('calculateBudget = capacité + apport', () => {
  assert.strictEqual(cc.calculateBudget({ capacity: 241883, apport: 50000 }), 291883);
  assert.strictEqual(cc.calculateBudget({ capacity: 241883 }), 241883);
  assert.ok(Number.isNaN(cc.calculateBudget({ apport: 50000 })));
});

test('valeurs non numériques -> NaN', () => {
  assert.ok(Number.isNaN(cc.calculateBorrowingCapacity({ income: 'x', durationYears: 20, annualRate: 3.45, maxDebtRatio: 0.35 })));
  assert.ok(Number.isNaN(cc.calculateMaxPayment({ income: 4000 }))); // maxDebtRatio manquant
});
