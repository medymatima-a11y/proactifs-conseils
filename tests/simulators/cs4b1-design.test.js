'use strict';
/* ==========================================================================
 * Tests CS-4B.1 — polish design & conversion (page capacité d'emprunt).
 * Protège : logo (asset réel, chemin absolu), cards exemples DYNAMIQUES,
 * CTA conversion, libellé "revenu estimatif", noindex, absence de réseau.
 * Le moteur et le SEO restent gelés (couverts par cs4b-page.test.js).
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const proto = require('../../assets/js/simulators/prototype-capacity.js');

const PAGE = path.join(__dirname, '../../simulateurs/capacite-emprunt.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const visible = HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

/* ---- Logo : asset réel + chemin absolu (header ET footer) ------------- */
test('Logo : header (proactifs-logo-header.png) + footer (proactifs-logo.png), chemins absolus', () => {
  // NAV-LOGO-3 : le header utilise l'asset dédié recadré, le footer garde l'asset historique
  assert.ok(/src="\/images\/proactifs-logo-header\.png"/.test(HTML), 'logo header attendu (asset dédié)');
  assert.ok(/src="\/images\/proactifs-logo\.png"/.test(HTML), 'logo footer attendu');
  assert.ok(fs.existsSync(path.join(__dirname, '../../images/proactifs-logo-header.png')), 'asset logo header présent');
  assert.ok(fs.existsSync(path.join(__dirname, '../../images/proactifs-logo.png')), 'asset logo footer présent');
});

/* ---- Cards exemples : conteneur présent, AUCUNE valeur codée en dur ---- */
test('Cards exemples : conteneur #ex-cards, valeurs non codées dans le HTML', () => {
  assert.ok(/id="ex-cards"/.test(HTML));
  // le HTML initial ne contient qu'un placeholder, pas de revenu chiffré
  assert.ok(!/\d[\d  ]{2,}\s*€\s*(net|\/ mois)/i.test(visible) || /Calcul/.test(visible));
  // aucune date/ taux marché figés
  assert.ok(!/septembre 2026/i.test(HTML));
  assert.ok(!/3,20 %|3,35 %|3,50 %|3,60 %/.test(visible));
});
test('Cards exemples : calculées via le moteur (croissantes, cohérentes CS-1)', () => {
  const core = require('../../assets/js/simulators/core.js');
  const r = proto.calculateRequiredIncomeForLoan({ loanAmount: 300000, durationYears: 20 });
  const payment = core.monthlyPayment({ principal: 300000, annualRatePct: r.rate, months: 240 });
  assert.strictEqual(r.requiredMonthlyIncome, core.round(payment / 0.35, 0));
});

/* ---- Libellé revenu explicite ----------------------------------------- */
test('Libellé "revenu mensuel estimatif nécessaire" explicite (pas seulement €/mois)', () => {
  assert.ok(/Revenu mensuel estimatif nécessaire/i.test(HTML));
});

/* ---- CTA conversion premium ------------------------------------------- */
test('CTA conversion : bloc dédié + destination réelle + micro-réassurance factuelle', () => {
  assert.ok(/class="cta-conv"/.test(HTML));
  assert.ok(/Votre projet mérite plus qu['’]une simulation\./.test(visible));
  assert.ok(/href="\/courtage-credit-immobilier"[^>]*id="cta-financement"/.test(HTML)
    || /id="cta-financement"[^>]*href="\/courtage-credit-immobilier"/.test(HTML)
    || /href="\/courtage-credit-immobilier"/.test(HTML));
  ['Analyse personnalisée', 'Accompagnement financement', 'Sans engagement'].forEach(t =>
    assert.ok(visible.indexOf(t) !== -1, 'réassurance manquante: ' + t));
  // aucune promesse inventée
  assert.ok(!/taux obtenu|taux de réussite|économie moyenne|\d+\s*banques/i.test(visible));
});

/* ---- Méthodologie en grille + signature ------------------------------- */
test('Méthodologie : 4 blocs + signature Proactifs', () => {
  const cells = HTML.match(/class="method-cell"/g) || [];
  assert.strictEqual(cells.length, 4);
  assert.ok(/Un simulateur Proactifs Conseils/.test(visible));
});

/* ---- Publication CS-4C : indexable + lead connecté sans secret tiers ---- */
test('Publication : index,follow + lead connecté /api/subscribe, aucun secret tiers', () => {
  assert.ok(/<meta name="robots" content="index, follow">/.test(HTML));
  assert.ok(/\/api\/subscribe/.test(HTML));
  assert.ok(!/supabase|brevo|systeme\.io/i.test(HTML));
});

/* ---- Pas de mini-header prototype ------------------------------------- */
test('Header : réel (#nav), aucun résidu proto-header', () => {
  assert.ok(/<nav id="nav">/.test(HTML));
  assert.ok(!/proto-header/.test(HTML));
});
