'use strict';
/* ==========================================================================
 * Tests CS-7B/CS-7C — HUB /simulateurs (publication-ready).
 * Couvre : noindex/nofollow, canonical /simulateurs, H1, 3 cartes + 3 URLs,
 * absence de lien imbriqué invalide, CTA financement, FAQPage/ItemList/
 * BreadcrumbList, extension additive ui.js (2 events hub + 5 anciens), tracking
 * carte = { tool } uniquement (capacite/mensualite/endettement), aucune PII/
 * donnée financière, hub PRÉSENT au sitemap et aux registres (CS-7C), header central,
 * Simulateurs cliquable sur les 3 enfants, partials/header.html encore inchangé.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = (p) => path.join(__dirname, '../../', p);
const HUB = fs.readFileSync(R('simulateurs/index.html'), 'utf8');
const HUBJS = fs.readFileSync(R('assets/js/simulators/hub.js'), 'utf8');
const UIJS = fs.readFileSync(R('assets/js/simulators/ui.js'), 'utf8');
const HOME = fs.readFileSync(R('index.html'), 'utf8');
const HEADER_PARTIAL = fs.readFileSync(R('partials/header.html'), 'utf8');

/* ---- A : publication / SEO -------------------------------------------- */
test('A1 — publication : index, follow + aucun noindex résiduel', () => {
  assert.ok(/<meta name="robots" content="index,\s*follow">/.test(HUB));
  assert.ok(!/noindex|nofollow/.test(HUB), 'aucun noindex/nofollow résiduel');
  assert.ok(!/localhost|127\.0\.0\.1|preview local/.test(HUB), 'aucune URL preview/localhost');
});
test('A2 — canonical futur /simulateurs', () => {
  assert.ok(/<link rel="canonical" href="https:\/\/proactifsconseils\.fr\/simulateurs">/.test(HUB));
});
test('A3 — title + H1 hub', () => {
  assert.ok(/<title>Simulateurs de crédit immobilier gratuits \| Proactifs<\/title>/.test(HUB));
  assert.ok(/<h1>Simulateurs de crédit immobilier<\/h1>/.test(HUB));
});

/* ---- B : cartes + URLs ------------------------------------------------- */
test('B1 — 3 cartes premium', () => {
  assert.strictEqual((HUB.match(/class="hub-card"/g) || []).length, 3);
});
test('B2 — 3 URLs enfants exactes', () => {
  ['/simulateurs/capacite-emprunt', '/simulateurs/mensualite-credit', '/simulateurs/taux-endettement']
    .forEach((u) => assert.ok(HUB.includes('href="' + u + '"'), 'URL manquante : ' + u));
});
test('B3 — CTA de carte = span (pas de <a> imbriqué)', () => {
  // aucune ancre ouverte alors qu'une autre est déjà ouverte
  const toks = HUB.match(/<a\b|<\/a>/g) || [];
  let depth = 0, nested = 0;
  toks.forEach((t) => { if (t === '</a>') depth = Math.max(0, depth - 1); else { if (depth > 0) nested++; depth++; } });
  assert.strictEqual(nested, 0, 'liens imbriqués détectés');
  assert.ok(/<span class="hub-cta">/.test(HUB), 'CTA carte rendu en span');
});

/* ---- C : conversion ---------------------------------------------------- */
test('C1 — CTA financement vers /courtage-credit-immobilier', () => {
  assert.ok(/<a class="cta" href="\/courtage-credit-immobilier" data-action="financing-cta">Étudier mon financement<\/a>/.test(HUB));
});
test('C2 — aucun formulaire lead direct sur le hub (V1)', () => {
  assert.ok(!/\/api\/subscribe/.test(HUB), 'pas de lead direct');
  assert.ok(!/<form/.test(HUB), 'pas de formulaire sur le hub');
});

/* ---- D : structured data ---------------------------------------------- */
test('D1 — FAQPage + ItemList + BreadcrumbList présents et valides', () => {
  const blocks = [...HUB.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const types = blocks.map((b) => b['@type']);
  assert.ok(types.includes('FAQPage'));
  assert.ok(types.includes('ItemList'));
  assert.ok(types.includes('BreadcrumbList'));
  assert.ok(!types.includes('SoftwareApplication'), 'pas de SoftwareApplication');
});
test('D2 — ItemList représente les 3 outils', () => {
  const il = [...HUB.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => b['@type'] === 'ItemList');
  assert.strictEqual(il.itemListElement.length, 3);
  const urls = il.itemListElement.map((i) => i.url);
  assert.ok(urls.includes('https://proactifsconseils.fr/simulateurs/capacite-emprunt'));
  assert.ok(urls.includes('https://proactifsconseils.fr/simulateurs/mensualite-credit'));
  assert.ok(urls.includes('https://proactifsconseils.fr/simulateurs/taux-endettement'));
});
test('D3 — breadcrumb central Accueil > Simulateurs (hub = page courante)', () => {
  assert.ok(/<!-- BREADCRUMB:START -->/.test(HUB) && /<!-- BREADCRUMB:END -->/.test(HUB), 'marqueurs breadcrumb centraux');
  assert.ok(/<!-- BREADCRUMB_JSONLD:START -->/.test(HUB), 'marqueurs JSON-LD centraux');
  assert.ok(/<li><a href="\/">Accueil<\/a><\/li>/.test(HUB));
  assert.ok(/<span aria-current="page">Simulateurs<\/span>/.test(HUB), 'Simulateurs = page courante sur le hub');
});

/* ---- E : ui.js — extension additive ------------------------------------ */
test('E1 — ui.js ALLOWED_EVENTS contient les 2 nouveaux events hub', () => {
  assert.ok(/'simulator_hub_view'/.test(UIJS));
  assert.ok(/'simulator_card_clicked'/.test(UIJS));
});
test('E2 — ui.js conserve les 5 anciens events', () => {
  ['simulation_started', 'simulation_completed', 'simulation_result', 'financing_cta_clicked', 'financing_lead_submitted']
    .forEach((e) => assert.ok(new RegExp("'" + e + "'").test(UIJS), 'event manquant : ' + e));
});
test('E3 — ui.js : track/FORBIDDEN_KEYS/sanitize inchangés (présents)', () => {
  assert.ok(/function track\(/.test(UIJS));
  assert.ok(/FORBIDDEN_KEYS/.test(UIJS));
  assert.ok(/function sanitizeTrackingData\(/.test(UIJS));
});

/* ---- F : tracking hub via SimUI.track (comportement réel) -------------- */
function freshUI() {
  global.self = global; global.document = global.document || {}; global.dataLayer = [];
  delete require.cache[require.resolve('../../assets/js/simulators/ui.js')];
  return require('../../assets/js/simulators/ui.js');
}
test('F1 — simulator_hub_view émis, payload sans données', () => {
  const ui = freshUI();
  ui.track('simulator_hub_view', {});
  const last = global.dataLayer[global.dataLayer.length - 1];
  assert.strictEqual(last.event, 'simulator_hub_view');
  assert.deepStrictEqual(Object.keys(last), ['event']);
});
test('F2 — simulator_card_clicked ne transmet que { tool }', () => {
  const ui = freshUI();
  // même si on tente d'injecter de la PII/finance, sanitize la retire
  ui.track('simulator_card_clicked', { tool: 'capacite', email: 'a@b.fr', montant: 300000, revenu: 5000 });
  const last = global.dataLayer[global.dataLayer.length - 1];
  assert.strictEqual(last.event, 'simulator_card_clicked');
  assert.strictEqual(last.tool, 'capacite');
  ['email', 'montant', 'revenu', 'nom', 'prenom', 'tel'].forEach((k) => assert.ok(!(k in last), 'fuite : ' + k));
});
test('F3 — hub.js : valeurs tool limitées à capacite/mensualite/endettement', () => {
  global.self = global; global.document = undefined;
  delete require.cache[require.resolve('../../assets/js/simulators/hub.js')];
  const H = require('../../assets/js/simulators/hub.js');
  assert.deepStrictEqual(Object.keys(H.VALID).sort(), ['capacite', 'endettement', 'mensualite']);
  assert.deepStrictEqual(H.TOOLS.map((t) => t.key), ['capacite', 'mensualite', 'endettement']);
});
test('F4 — hub.js : aucune donnée financière/PII dans le code de tracking', () => {
  assert.ok(/simulator_hub_view/.test(HUBJS) && /simulator_card_clicked/.test(HUBJS));
  assert.ok(/tool: tool/.test(HUBJS), 'clic carte = { tool } uniquement');
  assert.ok(!/revenu|montant|income|email|tel\b/.test(HUBJS), 'aucune clé financière/PII');
});

/* ---- G : intégration production (CS-7C) -------------------------------- */
test('G1 — hub PRÉSENT au sitemap (+ 3 enfants), simulation-pret absent', () => {
  const sm = fs.readFileSync(R('sitemap.xml'), 'utf8');
  assert.ok(sm.includes('https://proactifsconseils.fr/simulateurs</loc>'), 'hub au sitemap');
  ['capacite-emprunt', 'mensualite-credit', 'taux-endettement'].forEach((u) =>
    assert.ok(sm.includes('https://proactifsconseils.fr/simulateurs/' + u + '</loc>'), 'enfant au sitemap : ' + u));
  assert.ok(!/simulation-pret-immobilier/.test(sm), 'source redirigée absente');
});
test('G2 — hub PRÉSENT dans nav-pages.json et breadcrumb-pages.json', () => {
  const nav = JSON.parse(fs.readFileSync(R('scripts/nav-pages.json'), 'utf8'));
  const bc = JSON.parse(fs.readFileSync(R('scripts/breadcrumb-pages.json'), 'utf8'));
  assert.ok(nav.pages.includes('simulateurs/index.html'), 'hub dans nav-pages.json');
  const hub = bc.pages.find((x) => x.file === 'simulateurs/index.html');
  assert.ok(hub, 'hub dans breadcrumb-pages.json');
  assert.strictEqual(hub.url, '/simulateurs');
  assert.strictEqual(hub.label, 'Simulateurs');
  assert.deepStrictEqual(hub.trail, [{ label: 'Accueil', url: '/' }]);
});
test('G3 — hub charge socle minimal (core, ui, hub) + navigation, pas d\'adaptateur simulateur', () => {
  ['core.js', 'ui.js', 'hub.js'].forEach((s) => assert.ok(new RegExp('simulators/' + s.replace('.', '\\.')).test(HUB)));
  assert.ok(/navigation\.js/.test(HUB));
  assert.ok(!/prototype-(capacity|mensualite|endettement)\.js/.test(HUB), 'aucun adaptateur simulateur chargé');
});
test('G4 — Simulateurs devient cliquable vers /simulateurs sur les 3 enfants', () => {
  ['capacite-emprunt', 'mensualite-credit', 'taux-endettement'].forEach((child) => {
    const h = fs.readFileSync(R('simulateurs/' + child + '.html'), 'utf8');
    assert.ok(/<li><a href="\/simulateurs">Simulateurs<\/a><\/li>/.test(h), 'Simulateurs cliquable manquant : ' + child);
    // JSON-LD cohérent : Simulateurs porte bien item /simulateurs
    assert.ok(/"name": "Simulateurs", "item": "https:\/\/proactifsconseils\.fr\/simulateurs"/.test(h), 'JSON-LD Simulateurs incohérent : ' + child);
  });
});
test('G5 — partials/header.html : lien global Simulateurs migré vers /simulateurs (CS-7D)', () => {
  const partial = fs.readFileSync(R('partials/header.html'), 'utf8');
  assert.ok(/href="\/simulateurs"/.test(partial), 'header global pointe /simulateurs');
  assert.ok(!/\{\{HOME_PREFIX\}\}#simulateurs/.test(partial), 'plus de lien #simulateurs dans le partial');
});
test('G6 — hub reçoit le header central (bloc NAV présent)', () => {
  assert.ok(/<!-- NAV:START/.test(HUB) && /<!-- NAV:END -->/.test(HUB), 'header central sur le hub');
});

function s0(str){ return new RegExp(str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')); }


/* ---- H : bascule home + header (CS-7D) -------------------------------- */
test('H1 — home conserve l\'ancre id="simulateurs" (compat anciens liens)', () => {
  assert.ok(/id="simulateurs"/.test(HOME));
});
test('H2 — widget legacy retiré (fonctions + Chart.js absents de la home)', () => {
  ['function switchSim', 'function calcCredit', 'function calcCapacite', 'function calcFiscal', 'function calcScpi', 'function calcRetraite', 'function updateRange', 'loadChartJs']
    .forEach((fn) => assert.ok(!s0(fn).test(HOME), 'legacy présent : ' + fn));
  assert.ok(!/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart/.test(HOME), 'Chart.js encore chargé');
  assert.ok(!/new Chart\(/.test(HOME) && !/chartCredit|chartCapacite|chartScpi|chartRetraite|chartFiscal/.test(HOME), 'canvas/chart legacy présents');
  assert.ok(!/class="sim-tab|class="sim-panel|class="sim-form|class="result-card|class="chart-wrap/.test(HOME), 'markup legacy présent');
});
test('H3 — home oriente vers les 3 outils V2 + hub /simulateurs', () => {
  ['/simulateurs/capacite-emprunt', '/simulateurs/mensualite-credit', '/simulateurs/taux-endettement']
    .forEach((u) => assert.ok(HOME.includes('href="' + u + '"'), 'lien V2 manquant : ' + u));
  assert.ok(/href="\/simulateurs"/.test(HOME), 'CTA hub /simulateurs présent');
  assert.ok(/Voir tous les simulateurs/.test(HOME), 'CTA "Voir tous les simulateurs"');
});
test('H4 — home : aucune H1 supplémentaire (nouvelle section en H2)', () => {
  const h1 = (HOME.match(/<h1\b/g) || []).length;
  assert.strictEqual(h1, 1, 'exactement une H1 sur la home');
});
test('H5 — partials/header.html : Simulateurs -> /simulateurs (desktop + mobile)', () => {
  assert.ok(/<a href="\/simulateurs" class="nav-link">Simulateurs<\/a>/.test(HEADER_PARTIAL), 'desktop nav-link');
  assert.ok(/<a class="m-item" href="\/simulateurs">Simulateurs<\/a>/.test(HEADER_PARTIAL), 'mobile m-item');
  assert.ok(!/\{\{HOME_PREFIX\}\}#simulateurs/.test(HEADER_PARTIAL), 'plus de lien #simulateurs dans le partial');
});
test('H6 — header central régénéré sur la home : Simulateurs -> /simulateurs', () => {
  assert.ok(/<a href="\/simulateurs" class="nav-link">Simulateurs<\/a>/.test(HOME), 'header desktop home');
  assert.ok(/<a class="m-item" href="\/simulateurs">Simulateurs<\/a>/.test(HOME), 'header mobile home');
});
test('H7 — home : cartes analytics-ready (data-tool) sans PII/donnée financière', () => {
  assert.ok(/data-tool="capacite"/.test(HOME) && /data-tool="mensualite"/.test(HOME) && /data-tool="endettement"/.test(HOME));
  // pas de moteur de calcul sur la home
  assert.ok(!/calculateMonthlyPayment|calculateBorrowingCapacity|calculateDebtRatio/.test(HOME), 'aucun moteur de calcul sur la home');
});
test('H8 — redirect legacy /simulation-pret-immobilier toujours configurée', () => {
  const vercel = fs.readFileSync(R('vercel.json'), 'utf8');
  assert.ok(/"source": "\/simulation-pret-immobilier"/.test(vercel) && /"destination": "\/simulateurs\/capacite-emprunt"/.test(vercel));
});
