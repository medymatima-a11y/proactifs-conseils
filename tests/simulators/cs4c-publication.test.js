'use strict';
/* ==========================================================================
 * Tests CS-4C — publication contrôlée (page capacité d'emprunt).
 * Protège : robots index, og:image, GA4 + pont dataLayer->gtag (5 events),
 * lead réel connecté /api/subscribe (service credit, sans secret tiers),
 * consentement, CTA primaire or, header/breadcrumb centralisés
 * (Simulateurs non cliquable), analytics sans PII. Moteur/SEO gelés ailleurs.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = path.join(__dirname, '../../simulateurs/capacite-emprunt.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const PROTO = fs.readFileSync(path.join(__dirname, '../../assets/js/simulators/prototype-capacity.js'), 'utf8');

/* ---- Indexabilité ----------------------------------------------------- */
test('Robots : index, follow (convention site)', () => {
  assert.ok(/<meta name="robots" content="index, follow">/.test(HTML));
  assert.ok(!/noindex/.test(HTML));
});
test('Canonical self-référent', () => {
  assert.ok(/<link rel="canonical" href="https:\/\/proactifsconseils\.fr\/simulateurs\/capacite-emprunt">/.test(HTML));
});

/* ---- Open Graph image (asset de marque réel) -------------------------- */
test('og:image : asset de marque existant', () => {
  const m = HTML.match(/<meta property="og:image" content="([^"]+)">/);
  assert.ok(m, 'og:image présent');
  assert.ok(/courtier-credit\.webp/.test(m[1]));
  assert.ok(fs.existsSync(path.join(__dirname, '../../images/courtier-credit.webp')));
});

/* ---- Analytics GA4 + pont sans PII ------------------------------------ */
test('GA4 : tag + pont dataLayer->gtag whitelistant les 5 événements', () => {
  assert.ok(/gtag\/js\?id=G-P53RQGXJZX/.test(HTML));
  assert.ok(/gtag\('config', 'G-P53RQGXJZX'\)/.test(HTML));
  ['simulation_started','simulation_completed','simulation_result','financing_cta_clicked','financing_lead_submitted']
    .forEach(ev => assert.ok(HTML.indexOf(ev) !== -1, 'event manquant dans le pont: ' + ev));
});

test('Analytics : track() ne laisse passer aucune PII (drop email/montant/revenu)', () => {
  global.self = global; global.document = global.document || {}; global.dataLayer = [];
  delete require.cache[require.resolve('../../assets/js/simulators/ui.js')];
  const ui = require('../../assets/js/simulators/ui.js');
  assert.deepStrictEqual(ui.ALLOWED_EVENTS,
    ['simulation_started','simulation_completed','simulation_result','financing_cta_clicked','financing_lead_submitted']);
  ui.track('simulation_result', { bucket: '200-300k', email: 'a@b.fr', montant: 300000, revenu: 4000, prenom: 'X' });
  const last = global.dataLayer[global.dataLayer.length - 1];
  assert.strictEqual(last.event, 'simulation_result');
  assert.strictEqual(last.bucket, '200-300k');
  ['email','montant','revenu','prenom','tel','nom'].forEach(k =>
    assert.ok(!(k in last), 'PII fuite: ' + k));
});

/* ---- Lead réel connecté ----------------------------------------------- */
test('Lead : page connectée à /api/subscribe (endpoint existant), sans secret tiers', () => {
  assert.ok(/fetch\('\/api\/subscribe'/.test(HTML), 'POST /api/subscribe');
  assert.ok(/leadTransport:/.test(HTML), 'transport injecté');
  assert.ok(!/supabase|brevo|systeme\.io|SERVICE_KEY|SUPABASE_/i.test(HTML), 'aucun secret/endpoint tiers côté client');
});
test('Lead : payload au schéma existant, service "credit"', () => {
  assert.ok(/service:\s*'credit'/.test(PROTO));
});
test('Lead : transport injectable + anti double-submit (adaptateur)', () => {
  assert.ok(/opts\.leadTransport/.test(PROTO), 'leadTransport paramétrable');
  assert.ok(/data-submitting/.test(PROTO), 'garde anti double-submit');
});
test('Consentement : mention réutilisant le pattern du site', () => {
  assert.ok(/class="sim-consent"/.test(HTML));
  assert.ok(/jamais revendues/.test(HTML));
});

/* ---- CTA primaire or (Design System) ---------------------------------- */
test('CTA primaire : fond or (hero + wizard) via .sim-cta', () => {
  assert.ok(/\.cap-wrap \.sim-cta \{ background:var\(--gold\); color:#241C06; \}/.test(HTML));
  // ghost/secondaire reste teal
  assert.ok(/\.cap-wrap \.sim-cta--ghost \{ background:transparent; color:var\(--teal\)/.test(HTML));
});

/* ---- Header + breadcrumb centralisés ---------------------------------- */
test('Header : couvert par le build centralisé (marqueurs NAV)', () => {
  assert.ok(/<!-- NAV:START/.test(HTML) && /<!-- NAV:END -->/.test(HTML));
  assert.ok(/<!-- NAV:CONFIG/.test(HTML));
});
test('Breadcrumb : Accueil > Simulateurs (non cliquable) > Capacité', () => {
  const bc = HTML.slice(HTML.indexOf('<!-- BREADCRUMB:START -->'), HTML.indexOf('<!-- BREADCRUMB:END -->'));
  assert.ok(/<a href="\/">Accueil<\/a>/.test(bc));
  assert.ok(/<li><span>Simulateurs<\/span><\/li>/.test(bc), 'Simulateurs non cliquable');
  assert.ok(/<span aria-current="page">Capacité d'emprunt<\/span>/.test(bc));
  // JSON-LD : Simulateurs name-only (pas de item)
  assert.ok(/"position": 2, "name": "Simulateurs"\}/.test(HTML));
});

/* ---- Socles gelés : signatures moteur intactes ------------------------ */
test('Moteur : signatures gelées présentes', () => {
  ['function computeCapacityV2', 'function buildFinancingInput', 'function calculateRequiredIncomeForLoan']
    .forEach(sig => assert.ok(PROTO.indexOf(sig) !== -1, 'manque ' + sig));
});
