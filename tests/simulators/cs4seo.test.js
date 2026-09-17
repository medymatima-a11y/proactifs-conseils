'use strict';
/* ==========================================================================
 * Tests CS-4SEO — polish UX du prototype capacité d'emprunt.
 * Vérifie header non sticky mobile, suppression du titre redondant, label
 * « Taux indicatif », date dérivée (pas de "septembre 2026" en dur), disclaimer
 * court dans la carte + disclaimer complet dans l'accordéon accessible,
 * mappings UX, et mock lead sans réseau.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const proto = require('../../assets/js/simulators/prototype-capacity.js');

const HTML = fs.readFileSync(path.join(__dirname, '../../prototypes/simulateur-capacite-emprunt-v2.html'), 'utf8');
const visible = HTML.replace(/<!--[\s\S]*?-->/g, '');

/* ---- A1 : header non sticky en mobile --------------------------------- */
test('A1 : header repasse en position static en mobile (≤600px)', () => {
  // règle mobile qui remet le header dans le flux
  assert.ok(/@media\s*\(max-width:600px\)[\s\S]*\.proto-header\s*\{[^}]*position:\s*static/.test(HTML),
    'la media query mobile doit forcer .proto-header en position:static');
});

/* ---- A2 : titre redondant "Votre estimation" supprimé ----------------- */
test('A2 : le titre « Votre estimation » a été retiré de l’étape résultat', () => {
  assert.ok(!/>\s*Votre estimation\s*</.test(visible), 'plus de titre "Votre estimation"');
  // les 3 titres reliability restent disponibles côté code
  assert.strictEqual(proto.mapReliability('STANDARD').title, 'Votre première estimation est prête.');
});

/* ---- A4 : label « Taux indicatif » + date dérivée --------------------- */
test('A4 : label « Taux indicatif » présent, ancien label absent', () => {
  assert.ok(/Taux indicatif/.test(visible));
  assert.ok(!/Taux utilisé pour la simulation/.test(visible));
});
test('A4 : aucune date « septembre 2026 » codée en dur dans le HTML', () => {
  assert.ok(!/septembre 2026/i.test(HTML), 'la date doit être dérivée de effectiveMonth, pas codée en dur');
});
test('A4 : marketMonthLabel dérive la référence depuis effectiveMonth', () => {
  assert.strictEqual(proto.marketMonthLabel('2026-09'), 'septembre 2026');
  assert.strictEqual(proto.marketMonthLabel('2026-12'), 'décembre 2026');
  assert.strictEqual(proto.marketMonthLabel('bad'), '');
});

/* ---- A5 : disclaimer court dans la carte ------------------------------ */
test('A5 : disclaimer court présent dans la carte résultat', () => {
  assert.ok(/Simulation indicative, hors assurance et non contractuelle\./.test(visible));
});

/* ---- A7 : accordéon accessible (button + aria) + disclaimer complet --- */
test('A7 : accordéon = button réel avec aria-expanded + aria-controls', () => {
  assert.ok(/<button[^>]*class="acc-btn"[^>]*aria-expanded="false"[^>]*aria-controls="acc-panel"/.test(HTML)
    || /<button[^>]*class="acc-btn"[^>]*aria-controls="acc-panel"[^>]*aria-expanded="false"/.test(HTML));
  assert.ok(/id="acc-panel"[^>]*hidden/.test(HTML), 'panneau fermé par défaut');
  assert.ok(/Comment avons-nous calculé cette estimation/.test(visible));
});
test('A7 : disclaimer complet présent dans l’accordéon', () => {
  assert.ok(/Taux indicatif utilisé uniquement pour cette simulation, hors assurance\./.test(visible));
  assert.ok(/conditions de l['’]établissement prêteur/.test(visible));
});

/* ---- A8 : CTA reformulé ----------------------------------------------- */
test('A8 : CTA + accroche reformulée', () => {
  assert.ok(/Votre projet mérite plus qu['’]une simulation\./.test(visible));
  assert.ok(/Faites analyser votre projet par Proactifs Conseils/.test(visible));
  assert.ok(/Étudier mon financement/.test(visible));
});

/* ---- Mappings reliability (inchangés) --------------------------------- */
test('Mappings reliability STANDARD / PARTIAL / MANUAL_REVIEW', () => {
  assert.strictEqual(proto.mapReliability('STANDARD').title, 'Votre première estimation est prête.');
  assert.strictEqual(proto.mapReliability('PARTIAL').title, 'Cette estimation peut être affinée.');
  assert.strictEqual(proto.mapReliability('MANUAL_REVIEW').title, 'Votre situation mérite une étude personnalisée.');
});

/* ---- Flags : jamais de code brut affiché ------------------------------ */
test('Flags mappés en messages client (aucun code technique)', () => {
  const msgs = proto.mapReviewFlags(['INSURANCE_NOT_INCLUDED', 'OTHER_INCOME_REQUIRES_REVIEW']);
  assert.strictEqual(msgs.length, 2);
  msgs.forEach(m => assert.ok(!/_[A-Z]/.test(m)));
});

/* ---- Mock lead : toujours sans réseau --------------------------------- */
test('Mock lead : transport local, aucun réseau', async () => {
  const sink = {};
  const res = await proto.makeMockTransport(sink)({ email: 'a@b.fr', tel: '0600000000' });
  assert.deepStrictEqual(res, { ok: true, mock: true });
  assert.strictEqual(sink.lastPayload.email, 'a@b.fr');
  // message prototype présent dans le HTML/JS (aucun endpoint)
  assert.ok(!/api\/subscribe|supabase|brevo|systeme\.io/i.test(HTML));
});

/* ---- noindex conservé ------------------------------------------------- */
test('noindex,nofollow conservé', () => {
  assert.ok(/<meta name="robots" content="noindex,nofollow">/.test(HTML));
});
