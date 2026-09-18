'use strict';
/* ==========================================================================
 * Tests CS-5B — prototype simulateur MENSUALITÉ.
 * Couvre : mensualité marché 10/15/20/25, taux perso, assurance connue/inconnue,
 * intérêts, total, comparateur, usage ACTIVE_MARKET_REFERENCE, non-mutation du
 * référentiel, absence de LEGACY dans le parcours, validations, analytics sans
 * PII, source lead, preview noindex. Socles inchangés (couverts ailleurs).
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../../assets/js/simulators/core.js');
const calc = require('../../assets/js/simulators/calc-credit.js');
const rates = require('../../assets/js/simulators/rates.js');
const M = require('../../assets/js/simulators/prototype-mensualite.js');

const PAGE = path.join(__dirname, '../../simulateurs/mensualite-credit.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const ADAPTER = fs.readFileSync(path.join(__dirname, '../../assets/js/simulators/prototype-mensualite.js'), 'utf8');
const ACTIVE = rates.ACTIVE_MARKET_REFERENCE;

function marketPayment(principal, years) {
  return calc.calculateMonthlyPayment({ principal: principal, annualRatePct: rates.getMarketRate(years, ACTIVE), durationYears: years });
}

/* ---- A–D : mensualité marché 10/15/20/25 ------------------------------ */
[10, 15, 20, 25].forEach((y) => {
  test('Mensualité marché ' + y + ' ans = moteur + getMarketRate(ACTIVE)', () => {
    const r = M.computeMensualite({ principal: 300000, durationYears: y, rateMode: 'proactifs', insuranceKnown: false });
    assert.ok(r.valid);
    assert.strictEqual(r.rate, rates.getMarketRate(y, ACTIVE));
    assert.strictEqual(r.paymentHA, core.round(marketPayment(300000, y), 0));
    assert.strictEqual(r.referenceUsed, 'ACTIVE_MARKET_REFERENCE');
  });
});

/* ---- E : taux personnalisé -------------------------------------------- */
test('Taux personnalisé : utilise la valeur saisie comme annualRatePct', () => {
  const r = M.computeMensualite({ principal: 300000, durationYears: 20, rateMode: 'custom', customRate: 4.10, insuranceKnown: false });
  assert.strictEqual(r.rate, 4.10);
  assert.strictEqual(r.rateMode, 'custom');
  assert.strictEqual(r.referenceUsed, null);
  assert.strictEqual(r.paymentHA, core.round(calc.calculateMonthlyPayment({ principal: 300000, annualRatePct: 4.10, durationYears: 20 }), 0));
});

/* ---- F : assurance inconnue ------------------------------------------- */
test('Assurance inconnue : assurance = 0, mensualité totale = HA', () => {
  const r = M.computeMensualite({ principal: 250000, durationYears: 20, rateMode: 'proactifs', insuranceKnown: false });
  assert.strictEqual(r.insuranceKnown, false);
  assert.strictEqual(r.insuranceMonthly, 0);
  assert.strictEqual(r.paymentTotal, r.paymentHA);
  assert.strictEqual(r.insuranceTotal, 0);
});

/* ---- G : assurance connue --------------------------------------------- */
test('Assurance connue : additive à la mensualité (jamais dans les intérêts)', () => {
  const r = M.computeMensualite({ principal: 250000, durationYears: 20, rateMode: 'proactifs', insuranceKnown: true, insuranceMonthly: 40 });
  assert.strictEqual(r.insuranceMonthly, 40);
  assert.strictEqual(r.paymentTotal, r.paymentHA + 40);
  assert.strictEqual(r.insuranceTotal, 40 * r.months);
  assert.strictEqual(r.totalWithInsurance, r.totalHA + r.insuranceTotal);
  // l'assurance n'entre pas dans les intérêts
  const noIns = M.computeMensualite({ principal: 250000, durationYears: 20, rateMode: 'proactifs', insuranceKnown: false });
  assert.strictEqual(r.interest, noIns.interest);
});

/* ---- H : coût des intérêts -------------------------------------------- */
test('Coût des intérêts : cohérent (capital + intérêts = total) et proche de calculateCreditCost', () => {
  const r = M.computeMensualite({ principal: 300000, durationYears: 20, rateMode: 'proactifs', insuranceKnown: false });
  assert.strictEqual(r.principal + r.interest, r.totalHA);
  assert.ok(Math.abs(r.interest - r.creditCostRaw) <= r.months, 'écart ≤ arrondi mensuel × mois');
});

/* ---- I : total remboursé ---------------------------------------------- */
test('Total remboursé = mensualité HA × nombre de mois', () => {
  const r = M.computeMensualite({ principal: 300000, durationYears: 20, rateMode: 'proactifs', insuranceKnown: false });
  assert.strictEqual(r.totalHA, r.paymentHA * r.months);
  assert.strictEqual(r.months, 240);
});

/* ---- J : comparateur 10/15/20/25 -------------------------------------- */
test('Comparateur : 4 durées publiques, mensualité décroissante avec la durée', () => {
  const rows = M.compareDurations(300000);
  assert.deepStrictEqual(rows.map(r => r.durationYears), [10, 15, 20, 25]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].payment < rows[i - 1].payment, 'mensualité baisse quand la durée augmente');
  // intérêts augmentent avec la durée
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].interest > rows[i - 1].interest, 'intérêts montent avec la durée');
});

/* ---- K : comparateur utilise ACTIVE_MARKET_REFERENCE ------------------ */
test('Comparateur : taux = getMarketRate(durée, ACTIVE_MARKET_REFERENCE)', () => {
  const rows = M.compareDurations(300000);
  rows.forEach(r => assert.strictEqual(r.rate, rates.getMarketRate(r.durationYears, ACTIVE)));
});

/* ---- L : taux perso ne modifie pas ACTIVE_MARKET_REFERENCE ------------ */
test('Le taux personnalisé ne modifie jamais ACTIVE_MARKET_REFERENCE', () => {
  const before = JSON.stringify(rates.ACTIVE_MARKET_REFERENCE.rates);
  M.computeMensualite({ principal: 300000, durationYears: 20, rateMode: 'custom', customRate: 9.99, insuranceKnown: false });
  assert.strictEqual(JSON.stringify(rates.ACTIVE_MARKET_REFERENCE.rates), before);
  assert.strictEqual(rates.getMarketRate(20, ACTIVE), 3.5);
});

/* ---- M : aucune LEGACY_REFERENCE dans le parcours visible ------------- */
test('Aucune référence à LEGACY_REFERENCE dans l\'adaptateur ni la page', () => {
  assert.ok(!/LEGACY_REFERENCE/.test(ADAPTER));
  assert.ok(!/LEGACY_REFERENCE/.test(HTML));
});

/* ---- N/O : validations ------------------------------------------------ */
test('Validation : montant invalide rejeté', () => {
  assert.strictEqual(M.validate({ principal: '0', durationYears: '20', rateMode: 'proactifs' }).ok, false);
  assert.strictEqual(M.validate({ principal: 'abc', durationYears: '20', rateMode: 'proactifs' }).ok, false);
  assert.strictEqual(M.validate({ principal: '250000', durationYears: '20', rateMode: 'proactifs' }).ok, true);
});
test('Validation : taux personnalisé invalide rejeté', () => {
  assert.strictEqual(M.validate({ principal: '250000', durationYears: '20', rateMode: 'custom', customRate: '0' }).ok, false);
  assert.strictEqual(M.validate({ principal: '250000', durationYears: '20', rateMode: 'custom', customRate: '40' }).ok, false);
  assert.strictEqual(M.validate({ principal: '250000', durationYears: '20', rateMode: 'custom', customRate: '3,4' }).ok, true);
});
test('Validation : durée hors publicDurations rejetée', () => {
  assert.strictEqual(M.validate({ principal: '250000', durationYears: '30', rateMode: 'proactifs' }).ok, false);
});

/* ---- P : analytics sans PII ------------------------------------------- */
test('Analytics : track() ne laisse passer aucune PII, garde simulator_type', () => {
  global.self = global; global.document = global.document || {}; global.dataLayer = [];
  delete require.cache[require.resolve('../../assets/js/simulators/ui.js')];
  const ui = require('../../assets/js/simulators/ui.js');
  ui.track('simulation_result', { simulator_type: 'monthly_payment', bucket: '250_350k', duree: 20, email: 'a@b.fr', montant: 300000 });
  const last = global.dataLayer[global.dataLayer.length - 1];
  assert.strictEqual(last.event, 'simulation_result');
  assert.strictEqual(last.simulator_type, 'monthly_payment');
  assert.strictEqual(last.bucket, '250_350k');
  ['email', 'montant', 'nom', 'prenom', 'tel'].forEach(k => assert.ok(!(k in last), 'PII fuite: ' + k));
});
test('Analytics : amountBucket ne renvoie jamais le montant exact', () => {
  assert.strictEqual(M.amountBucket(300000), '250_350k');
  assert.strictEqual(M.amountBucket(120000), 'lt_150k');
  assert.strictEqual(M.amountBucket(600000), 'gte_500k');
  assert.ok(!/\d{5,}/.test(M.amountBucket(300000)));
});
test('Adaptateur : emit ajoute simulator_type monthly_payment', () => {
  assert.ok(/simulator_type = 'monthly_payment'/.test(ADAPTER) || /simulator_type = "monthly_payment"/.test(ADAPTER));
});

/* ---- Q : source lead -------------------------------------------------- */
test('Lead : source simulateur_mensualite_credit, service credit, transport injecté', () => {
  assert.ok(/source: 'simulateur_mensualite_credit'/.test(ADAPTER));
  assert.ok(/service: 'credit'/.test(ADAPTER));
  assert.ok(/opts\.leadTransport/.test(ADAPTER));
});

/* ---- R : preview noindex + pas de socle touché ------------------------ */
test('Preview : noindex,nofollow + aucun POST réseau + charge prototype-mensualite', () => {
  assert.ok(/<meta name="robots" content="noindex,nofollow">/.test(HTML));
  assert.ok(/prototype-mensualite\.js/.test(HTML));
  assert.ok(!/PrototypeCapacity/.test(HTML));
  assert.ok(!/fetch\('\/api\/subscribe'/.test(HTML) && !/fetch\("\/api\/subscribe"/.test(HTML));
});
test('Marché : label mois dérivé de effectiveMonth (pas de date figée)', () => {
  assert.strictEqual(M.marketMonthLabel('2026-09'), 'septembre 2026');
  assert.strictEqual(M.marketMonthLabel(ACTIVE.effectiveMonth), 'septembre 2026');
  assert.ok(!/septembre 2026/.test(HTML), 'aucune date de référence figée dans le HTML');
});

/* ---- Marqueurs SEO/structure ----------------------------------------- */
test('SEO preview : H1 mensualité + H2 pédagogiques + FAQ + méthodologie', () => {
  assert.ok(/<h1>Calculez la mensualité de votre crédit immobilier<\/h1>/.test(HTML));
  assert.ok(/id="m-ex-cards"/.test(HTML));
  assert.ok(!/\d[\d  ]{2,}\s*€\s*\/\s*mois/.test(HTML.replace(/<script[\s\S]*?<\/script>/g, '')), 'aucune mensualité figée dans le HTML');
  assert.ok(/Méthodologie du simulateur/.test(HTML));
});

/* ---- CS-5B.1 : polish UX (pas de modif calcul) ------------------------ */
test('CS-5B.1 : message assurance compact "Assurance non incluse"', () => {
  assert.ok(/Assurance non incluse/.test(HTML));
  assert.ok(/Vous pouvez l['’]ajouter dans le simulateur\./.test(HTML));
  assert.ok(/class="men-ins-none"/.test(HTML));
});
test('CS-5B.1 : micro-explication comparateur avant les cartes de durée', () => {
  assert.ok(/class="men-comp-explain"/.test(HTML));
  assert.ok(/Allonger la durée réduit généralement la mensualité, mais augmente le coût total du crédit\./.test(HTML));
});
test('CS-5B.1 : CTA financement après le comparateur, avant le contenu SEO', () => {
  const idxCompare = HTML.indexOf('id="m-compare-rows"');
  const idxCta = HTML.indexOf('Étudier mon financement');
  const idxSeo = HTML.indexOf('<h2>Comment calculer la mensualité');
  assert.ok(idxCompare > 0 && idxCta > 0 && idxSeo > 0);
  assert.ok(idxCompare < idxCta, 'CTA doit suivre le comparateur');
  assert.ok(idxCta < idxSeo, 'CTA doit précéder la section SEO');
});
test('CS-5B.1 : nowrap sur les montants (CSS + spans .nb comparateur)', () => {
  assert.ok(/white-space:nowrap/.test(HTML));
  assert.ok(/men-comp .nb/.test(HTML) || /\.men-comp \.nb/.test(HTML));
  assert.ok(/class="nb"/.test(ADAPTER), 'les valeurs du comparateur sont enveloppées dans .nb');
});
test('CS-5B.1 : aucune modification du moteur de calcul', () => {
  assert.ok(/SimCalcCredit|calculateMonthlyPayment/.test(ADAPTER));
  assert.ok(!/compareLoanDurations/.test(ADAPTER), 'pas de primitive ajoutée au socle');
});
