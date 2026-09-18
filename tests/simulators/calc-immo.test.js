'use strict';
const test = require('node:test');
const assert = require('node:assert');
const immo = require('../../assets/js/simulators/calc-immo.js');

const approx = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps || 1e-6), `${a} ≈ ${b}`);

test('grossYield', () => {
  approx(immo.grossYield({ annualRent: 12000, price: 240000 }), 5);
  assert.ok(Number.isNaN(immo.grossYield({ annualRent: 12000, price: 0 })));
});

test('netYieldSimple', () => {
  approx(immo.netYieldSimple({ annualRent: 12000, annualCharges: 2400, price: 240000 }), 4);
  approx(immo.netYieldSimple({ annualRent: 12000, price: 240000 }), 5); // charges par défaut 0
});

test('savingsEffort : signe correct', () => {
  assert.strictEqual(immo.savingsEffort({ monthlyPayment: 900, monthlyCharges: 100, monthlyRent: 800 }), 200);   // sortie
  assert.strictEqual(immo.savingsEffort({ monthlyPayment: 700, monthlyCharges: 50, monthlyRent: 900 }), -150);   // cash-flow +
  assert.ok(Number.isNaN(immo.savingsEffort({ monthlyCharges: 100, monthlyRent: 800 })));
});

test('totalProjectCost : aucun frais inventé', () => {
  assert.strictEqual(immo.totalProjectCost({ price: 300000 }), 300000);
  assert.strictEqual(immo.totalProjectCost({ price: 300000, extraCosts: 24000 }), 324000);
  assert.ok(Number.isNaN(immo.totalProjectCost({ extraCosts: 24000 })));
});
