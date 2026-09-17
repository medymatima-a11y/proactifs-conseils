'use strict';
/* Tests CS-2 — prototype capacité d'emprunt. Le prototype appelle le moteur CS-1 ;
 * on vérifie parité legacy, validation, buckets tracking et lead mock (aucun envoi). */
const test = require('node:test');
const assert = require('node:assert');
const proto = require('../../assets/js/simulators/prototype-capacity.js');

/* Réimplémentation indépendante de la logique legacy (référence). */
function wzTauxLegacy(d) { if (d <= 10) return 3.10; if (d <= 15) return 3.30; if (d <= 20) return 3.45; return 3.60; }
function legacy(s) {
  const revenus = s.revenu1 + (s.revenu2 || 0);
  const mensMax = Math.max(0, revenus * 0.35 - (s.credits || 0));
  const taux = wzTauxLegacy(s.duree), tm = taux / 100 / 12, n = s.duree * 12;
  const facteur = (1 - Math.pow(1 + tm, -n)) / tm;
  const capacite = Math.round(mensMax * facteur);
  return { taux, capacite, budget: capacite + (s.apport || 0) };
}

const scenarios = [
  { revenu1: 3500, duree: 10 },
  { revenu1: 4000, duree: 15 },
  { revenu1: 4000, duree: 20 },
  { revenu1: 4000, duree: 25 },
  { revenu1: 4000, duree: 30 },
  { revenu1: 4000, revenu2: 2500, duree: 20 },
  { revenu1: 5000, credits: 600, duree: 15 },
  { revenu1: 4000, apport: 50000, duree: 25 },
  { revenu1: 3800, revenu2: 2200, credits: 400, apport: 30000, duree: 20 }
];

scenarios.forEach((s, i) => {
  test('CS-2 parité moteur/legacy #' + (i + 1) + ' (' + s.revenu1 + (s.revenu2 ? '+' + s.revenu2 : '') + ', ' + s.duree + ' ans)', () => {
    const L = legacy(s);
    const R = proto.computeResult({
      income1: s.revenu1, income2: s.revenu2 || 0, couple: !!s.revenu2,
      existingDebt: s.credits || 0, apport: s.apport || 0, durationYears: s.duree
    });
    assert.strictEqual(R.rate, L.taux, 'taux');
    assert.strictEqual(R.capacity, L.capacite, 'capacité');
    assert.strictEqual(R.budget, L.budget, 'budget');
  });
});

test('CS-2 : formats FR acceptés (espaces, virgule)', () => {
  const R = proto.computeResult({ income1: '4 000', couple: false, existingDebt: '', apport: '50 000', durationYears: 25 });
  const L = legacy({ revenu1: 4000, apport: 50000, duree: 25 });
  assert.strictEqual(R.budget, L.budget);
});

test('CS-2 : hypothèses prototype explicites (35 % + grille legacy)', () => {
  assert.strictEqual(proto.PROTOTYPE_ASSUMPTIONS.maxDebtRatio, 0.35);
  assert.strictEqual(proto.PROTOTYPE_ASSUMPTIONS.rateGrid.kind, 'LEGACY_REFERENCE');
});

test('CS-2 : validation étape 2 (revenus > 0)', () => {
  assert.strictEqual(proto.validateStep(2, { income1: '' }).ok, false);
  assert.strictEqual(proto.validateStep(2, { income1: '0' }).ok, false);
  assert.strictEqual(proto.validateStep(2, { income1: '3000' }).ok, true);
  assert.ok(proto.validateStep(2, { income1: '' }).errors.income1.length > 0);
});

test('CS-2 : validation étape 3 (crédits/apport >= 0, durée valide)', () => {
  assert.strictEqual(proto.validateStep(3, { existingDebt: '-5', apport: '0', durationYears: 20 }).ok, false);
  assert.strictEqual(proto.validateStep(3, { existingDebt: '0', apport: '0', durationYears: 99 }).ok, false);
  assert.strictEqual(proto.validateStep(3, { existingDebt: '0', apport: '10000', durationYears: 20 }).ok, true);
});

test('CS-2 : validation étape 1 (projet + situation)', () => {
  assert.strictEqual(proto.validateStep(1, {}).ok, false);
  assert.strictEqual(proto.validateStep(1, { projet: 'residence-principale', situation: 'seul' }).ok, true);
});

test('CS-2 : budgetBucket (aucun montant exact exposé)', () => {
  assert.strictEqual(proto.budgetBucket(120000), '<150k');
  assert.strictEqual(proto.budgetBucket(200000), '150-250k');
  assert.strictEqual(proto.budgetBucket(300000), '250-350k');
  assert.strictEqual(proto.budgetBucket(400000), '350-500k');
  assert.strictEqual(proto.budgetBucket(600000), '500k+');
});

test('CS-2 : lead mock — enregistre le payload, ne renvoie aucun réseau', async () => {
  const sink = {};
  const transport = proto.makeMockTransport(sink);
  const res = await transport({ email: 'a@b.fr', tel: '0612345678', service: 'credit' });
  assert.deepStrictEqual(res, { ok: true, mock: true });
  assert.strictEqual(sink.lastPayload.email, 'a@b.fr');
});

test('CS-2 : init() no-op hors navigateur (pas de document)', () => {
  assert.strictEqual(proto.init(), null);
});

/* ---- CS-2.1 : debug gaté par ?debug=1 ---------------------------------- */
test('CS-2.1 : isDebug — caché par défaut, visible avec ?debug=1', () => {
  assert.strictEqual(proto.isDebug(''), false);
  assert.strictEqual(proto.isDebug('?utm=x'), false);
  assert.strictEqual(proto.isDebug('?debug=0'), false);
  assert.strictEqual(proto.isDebug('?debug=1'), true);
  assert.strictEqual(proto.isDebug('?a=1&debug=1'), true);
  assert.strictEqual(proto.isDebug('?debug=1&b=2'), true);
});

/* ---- CS-2.1 : aucun "legacy" visible dans l'interface normale ---------- */
const fs = require('node:fs');
const path = require('node:path');
test('CS-2.1 : le mot "legacy" n\'apparaît pas dans l\'UI visible (hors commentaires)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../prototypes/simulateur-capacite-emprunt-v2.html'), 'utf8');
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');   // retire les commentaires HTML
  assert.ok(!/legacy/i.test(visible), 'aucun "legacy" ne doit être visible pour le prospect');
  // le second badge legacy a bien été retiré
  assert.ok(!/référence technique legacy/i.test(visible));
  assert.ok(/Taux utilisé pour la simulation/.test(visible));
  assert.ok(/Simulation indicative et non contractuelle/.test(visible));
});
