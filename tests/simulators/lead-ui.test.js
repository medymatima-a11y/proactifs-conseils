'use strict';
const test = require('node:test');
const assert = require('node:assert');
const lead = require('../../assets/js/simulators/lead.js');
const ui = require('../../assets/js/simulators/ui.js');

/* ---- lead.js ---- */
test('buildLeadPayload : schéma API existant respecté', () => {
  const p = lead.buildLeadPayload({ prenom: 'Alex', email: 'a@b.fr', tel: '0612345678', situation: 'primo', answers: [1, 2] });
  assert.deepStrictEqual(Object.keys(p).sort(), ['answers', 'email', 'nom', 'prenom', 'service', 'situation', 'tel']);
  assert.strictEqual(p.nom, '');
  assert.strictEqual(p.service, 'credit');
  assert.deepStrictEqual(p.answers, [1, 2]);
});

test('submitLead : SANS transport -> rejet (aucun envoi accidentel prod)', async () => {
  await assert.rejects(() => lead.submitLead({ email: 'a@b.fr', tel: '0612345678' }), /transport requis/);
});

test('submitLead : payload non soumettable -> rejet', async () => {
  await assert.rejects(() => lead.submitLead({ email: 'x', tel: '' }, async () => 'ok'), /non soumettable/);
});

test('submitLead : avec transport injecté -> appelle le transport', async () => {
  let received = null;
  const transport = async (payload) => { received = payload; return { ok: true }; };
  const res = await lead.submitLead({ email: 'a@b.fr', tel: '0612345678' }, transport);
  assert.deepStrictEqual(res, { ok: true });
  assert.strictEqual(received.email, 'a@b.fr');
});

/* ---- ui.js : formatters ---- */
test('formatEuro / formatPercent', () => {
  assert.strictEqual(ui.formatEuro(241883), '241 883 €');
  assert.strictEqual(ui.formatEuro(0), '0 €');
  assert.strictEqual(ui.formatEuro('x'), '');
  assert.strictEqual(ui.formatPercent(3.45), '3,45 %');
  assert.strictEqual(ui.formatPercent(35, 0), '35 %');
});

/* ---- ui.js : tracking (whitelist + anti-PII) ---- */
test('track : événement hors whitelist -> refusé', () => {
  assert.strictEqual(ui.track('n_importe_quoi', {}), false);
  assert.strictEqual(ui.track('simulation_result', { bucket: '200-300k' }), true);
});

test('sanitizeTrackingData : supprime PII et montants exacts', () => {
  const clean = ui.sanitizeTrackingData({
    bucket: '200-300k', duree: 20, email: 'a@b.fr', prenom: 'Alex',
    income: 4000, montant: 241883, tel: '0612345678'
  });
  assert.deepStrictEqual(clean, { bucket: '200-300k', duree: 20 });
  assert.ok(!('email' in clean) && !('income' in clean) && !('montant' in clean) && !('tel' in clean));
});
