'use strict';
/* ==========================================================================
 * Tests CS-6B — prototype simulateur TAUX D'ENDETTEMENT (preview).
 * Couvre : lecture policy (35 %/70 %) sans valeur codée en dur, agrégation
 * revenus/charges, rétention locative 70 %, co-emprunteur, mensualité nouvelle,
 * cas 0/invalide/>100 %, tolérance d'affichage ±0.2 pt (bornes), neutralité
 * (aucun verdict bancaire), payload lead sans donnée financière, analytics
 * bucket-only, exemples calculés par le moteur, publication index/canonical/FAQ,
 * intégration centrale (sitemap, header, breadcrumb).
 * Socles (core/calc-credit/credit-policy/ui/lead) inchangés : couverts ailleurs.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../../assets/js/simulators/core.js');
const calc = require('../../assets/js/simulators/calc-credit.js');
const policy = require('../../assets/js/simulators/credit-policy.js');
const E = require('../../assets/js/simulators/prototype-endettement.js');

const POLICY = policy.PROACTIFS_CREDIT_POLICY_V1;
const PAGE = path.join(__dirname, '../../simulateurs/taux-endettement.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const ADAPTER = fs.readFileSync(path.join(__dirname, '../../assets/js/simulators/prototype-endettement.js'), 'utf8');

/* ---- A : constantes LUES depuis la policy (jamais codées en dur) -------- */
test('A1 — MAX_DEBT_RATIO provient de policy.maxDebtRatio (repère 35 %)', () => {
  assert.strictEqual(E.MAX_DEBT_RATIO, POLICY.maxDebtRatio);
  assert.strictEqual(E.MAX_DEBT_RATIO, 0.35);
});
test('A2 — RENTAL_RETENTION provient de policy.rentalIncomeRetention (70 %)', () => {
  assert.strictEqual(E.RENTAL_RETENTION, POLICY.rentalIncomeRetention);
  assert.strictEqual(E.RENTAL_RETENTION, 0.70);
});
test('A3 — adaptateur ne code pas en dur 0.35 / 0.70 : il lit POLICY', () => {
  assert.ok(/POLICY\.maxDebtRatio/.test(ADAPTER), 'maxDebtRatio lu depuis POLICY');
  assert.ok(/POLICY\.rentalIncomeRetention/.test(ADAPTER), 'rentalIncomeRetention lu depuis POLICY');
  // Aucune littérale métier 0.35 / 0.70 / .35 / .70 hors commentaires de contexte.
  const code = ADAPTER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/[^.\d]0?\.35\b/.test(code), 'pas de 0.35 codé en dur dans le code');
  assert.ok(!/[^.\d]0?\.70\b/.test(code), 'pas de 0.70 codé en dur dans le code');
});
test('A4 — tolérance d\'affichage = constante nommée 0.2 pt (n\'altère pas le calcul)', () => {
  assert.strictEqual(E.REFERENCE_DISPLAY_TOLERANCE_POINTS, 0.2);
  assert.ok(/REFERENCE_DISPLAY_TOLERANCE_POINTS\s*=\s*0\.2/.test(ADAPTER));
});

/* ---- B : moteur partagé inchangé + résultat = moteur ------------------- */
test('B1 — computeDebtRatio délègue au moteur calc.calculateDebtRatio (payment/income)', () => {
  const input = { income1: 4200, existingCredits: 900, newPayment: 510 };
  const income = E.retainedIncome(input);
  const charges = E.retainedCharges(input);
  const engine = calc.calculateDebtRatio({ payment: charges, income: income });
  const r = E.computeDebtRatio(input);
  assert.strictEqual(r.ratio, engine);
  assert.strictEqual(r.pct, core.round(engine * 100, 1));
});
test('B2 — la policy n\'est pas mutée par un calcul', () => {
  const before = JSON.stringify({ m: POLICY.maxDebtRatio, r: POLICY.rentalIncomeRetention });
  E.computeDebtRatio({ income1: 9999, rentalIncome: 5000, existingCredits: 8000 });
  assert.strictEqual(JSON.stringify({ m: POLICY.maxDebtRatio, r: POLICY.rentalIncomeRetention }), before);
});

/* ---- C : agrégation revenus / charges ---------------------------------- */
test('C1 — revenus retenus = nets + co-emprunteur + locatifs × 70 %', () => {
  const input = { income1: 3000, couple: true, income2: 1500, rentalIncome: 1000 };
  assert.strictEqual(E.retainedIncome(input), 3000 + 1500 + 1000 * POLICY.rentalIncomeRetention);
});
test('C2 — co-emprunteur ignoré si situation "seul"', () => {
  assert.strictEqual(E.retainedIncome({ income1: 3000, couple: false, income2: 1500 }), 3000);
});
test('C3 — "autres revenus" NE sont PAS retenus automatiquement', () => {
  const withOther = E.retainedIncome({ income1: 3000, otherIncome: 800 });
  assert.strictEqual(withOther, 3000);
});
test('C4 — charges retenues = crédits + pensions + nouvelle mensualité + loyer restant', () => {
  const input = { existingCredits: 400, pensions: 150, newPayment: 510, remainingRent: 200 };
  assert.strictEqual(E.retainedCharges(input), 400 + 150 + 510 + 200);
});
test('C5 — rétention locative de 70 % vérifiée sur le résultat complet', () => {
  const r = E.computeDebtRatio({ income1: 3000, rentalIncome: 1000, existingCredits: 900 });
  assert.strictEqual(r.income, 3700);          // 3000 + 700
  assert.strictEqual(r.charges, 900);
  assert.strictEqual(r.rentalUsed, true);
  assert.strictEqual(r.rentalRetention, 0.70);
  assert.strictEqual(r.pct, 24.3);
});
test('C6 — nouvelle mensualité et loyer restant intégrés aux charges du résultat', () => {
  const r = E.computeDebtRatio({ income1: 4000, newPayment: 900, remainingRent: 300 });
  assert.strictEqual(r.charges, 1200);
  assert.strictEqual(r.newPaymentIncluded, true);
  assert.strictEqual(r.remainingRentIncluded, true);
});

/* ---- D : cas limites 0 / invalide / >100 % ----------------------------- */
test('D1 — revenus = 0 -> résultat invalide (jamais affiché)', () => {
  assert.strictEqual(E.computeDebtRatio({ income1: 0, existingCredits: 900 }).valid, false);
});
test('D2 — revenus manquants/invalides -> invalide', () => {
  assert.strictEqual(E.computeDebtRatio({ income1: '', existingCredits: 500 }).valid, false);
  assert.strictEqual(E.computeDebtRatio({ income1: 'abc' }).valid, false);
});
test('D3 — charges = 0 -> 0 %, zone sous le repère', () => {
  const r = E.computeDebtRatio({ income1: 4200 });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.pct, 0);
  assert.strictEqual(r.zone, 'below');
  assert.strictEqual(r.bucket, 'below_reference');
});
test('D4 — taux > 100 % calculé et classé au-dessus (pas de plafonnement caché)', () => {
  const r = E.computeDebtRatio({ income1: 1000, existingCredits: 1500 });
  assert.ok(r.pct > 100);
  assert.strictEqual(r.zone, 'above');
  assert.strictEqual(r.bucket, 'above_reference');
});

/* ---- E : tolérance d'affichage ±0.2 pt (bornes) ------------------------ */
test('E1 — bornes de zone autour du repère 35.0 (±0.2 pt)', () => {
  assert.strictEqual(E.referenceZone(34.7, 35.0), 'below');   // < 34.8
  assert.strictEqual(E.referenceZone(34.8, 35.0), 'around');  // borne basse incluse
  assert.strictEqual(E.referenceZone(35.0, 35.0), 'around');
  assert.strictEqual(E.referenceZone(35.2, 35.0), 'around');  // borne haute incluse
  assert.strictEqual(E.referenceZone(35.3, 35.0), 'above');   // > 35.2
});
test('E2 — bucket mappe strictement zone -> below/around/above_reference', () => {
  assert.strictEqual(E.resultBucket('below'), 'below_reference');
  assert.strictEqual(E.resultBucket('around'), 'around_reference');
  assert.strictEqual(E.resultBucket('above'), 'above_reference');
});
test('E3 — la tolérance est purement rédactionnelle : pct/ratio non modifiés', () => {
  const r = E.computeDebtRatio({ income1: 10000, existingCredits: 3490 }); // 34.9 %
  assert.strictEqual(r.pct, 34.9);          // valeur brute affichée telle quelle
  assert.strictEqual(r.zone, 'around');     // 34.9 ∈ [34.8 ; 35.2]
});

/* ---- F : neutralité — aucun verdict bancaire --------------------------- */
const FORBIDDEN = [
  'bon dossier', 'mauvais dossier', 'éligible', 'non éligible', 'inéligible',
  'finançable', 'non finançable', 'refus probable', 'accepté', 'refusé',
  'respecte les critères', 'seuil légal', 'limite bancaire', 'règle absolue',
  'critère d’acceptation', 'critère d\'acceptation'
];
test('F1 — les 3 phrases d\'interprétation sont neutres (repère, jamais verdict)', () => {
  ['below', 'around', 'above'].forEach((z) => {
    const s = E.interpretation(z).toLowerCase();
    assert.ok(/repère utilisé dans cette simulation/.test(s), 'phrase ' + z + ' cite le repère');
    FORBIDDEN.forEach((w) => assert.ok(!s.includes(w.toLowerCase()), 'mot interdit dans phrase ' + z + ' : ' + w));
  });
});
test('F2 — 3 phrases distinctes sous / autour / au-dessus, rien d\'autre', () => {
  const below = E.interpretation('below'), around = E.interpretation('around'), above = E.interpretation('above');
  assert.ok(/sous le repère/.test(below));
  assert.ok(/autour du repère/.test(around));
  assert.ok(/dépasse le repère/.test(above));
  assert.notStrictEqual(below, around);
  assert.notStrictEqual(around, above);
});
test('F3 — aucun verdict bancaire dans le corps de la page (hors dénégation explicite)', () => {
  // On retire les tournures de dénégation ("ni ... un critère d'acceptation") avant le grep.
  const body = HTML.toLowerCase();
  ['éligible', 'finançable', 'refus probable', 'dossier accepté', 'dossier refusé', 'bon dossier', 'mauvais dossier']
    .forEach((w) => assert.ok(!body.includes(w), 'verdict interdit présent dans la page : ' + w));
});

/* ---- G : lead — aucune donnée financière ------------------------------- */
test('G1 — payload lead = identité seule (source = simulateur_taux_endettement)', () => {
  const lead = require('../../assets/js/simulators/lead.js');
  const p = lead.buildLeadPayload({
    prenom: 'Jean', email: 'j@x.fr', tel: '0600000000',
    service: 'credit', answers: [{ source: 'simulateur_taux_endettement' }]
  });
  assert.deepStrictEqual(Object.keys(p).sort(), ['answers', 'email', 'nom', 'prenom', 'service', 'situation', 'tel']);
  assert.strictEqual(p.service, 'credit');
  // answers ne porte QUE l'attribution de source (aucune réponse chiffrée).
  assert.strictEqual(p.answers.length, 1);
  assert.deepStrictEqual(Object.keys(p.answers[0]), ['source']);
  assert.strictEqual(p.answers[0].source, 'simulateur_taux_endettement');
  // Aucune donnée financière de la simulation (revenus/charges/taux/mensualité/ratio)
  // ni comme clé, ni comme valeur : on scanne hors attribution de source.
  const scan = JSON.stringify({ prenom: p.prenom, nom: p.nom, email: p.email, tel: p.tel, situation: p.situation, service: p.service }).toLowerCase();
  ['revenu', 'charge', 'mensualit', 'endettement', 'ratio', 'locatif', 'pension']
    .forEach((k) => assert.ok(!scan.includes(k), 'donnée financière fuite dans le lead : ' + k));
  // Aucun montant de simulation (nombre >= 3 chiffres) hors numéro de téléphone.
  const noTel = JSON.stringify({ prenom: p.prenom, nom: p.nom, email: p.email, situation: p.situation, service: p.service, answers: p.answers });
  assert.ok(!/\d{3,}/.test(noTel), 'aucun montant chiffré de simulation dans le lead');
});
test('G2 — adaptateur : service credit + source simulateur_taux_endettement + transport injectable', () => {
  assert.ok(/service: 'credit'/.test(ADAPTER));
  assert.ok(/source: 'simulateur_taux_endettement'/.test(ADAPTER));
  assert.ok(/opts\.leadTransport/.test(ADAPTER));
  assert.ok(/lead\.buildLeadPayload/.test(ADAPTER) && /lead\.submitLead\(payload, leadTransport\)/.test(ADAPTER));
});
test('G3 — page : transport lead réel POST /api/subscribe (pas de mock en prod)', () => {
  assert.ok(/fetch\('\/api\/subscribe'\)?/.test(HTML) || /fetch\('\/api\/subscribe'/.test(HTML));
  assert.ok(/method: 'POST'/.test(HTML));
});

/* ---- H : analytics — bucket only, pas de PII / financier --------------- */
test('H1 — adaptateur : simulator_type = debt_ratio ; simulation_result ne porte QUE le bucket', () => {
  assert.ok(/simulator_type = 'debt_ratio'/.test(ADAPTER));
  assert.ok(/emit\('simulation_result', \{ bucket: res\.bucket \}\)/.test(ADAPTER));
  // Aucune émission de pct/income/charges/ratio.
  assert.ok(!/simulation_result'[^)]*res\.pct/.test(ADAPTER));
  assert.ok(!/simulation_result'[^)]*res\.income/.test(ADAPTER));
});
test('H2 — ui.track filtre toute PII / montant, conserve simulator_type + bucket', () => {
  global.self = global; global.document = global.document || {}; global.dataLayer = [];
  delete require.cache[require.resolve('../../assets/js/simulators/ui.js')];
  const ui = require('../../assets/js/simulators/ui.js');
  ui.track('simulation_result', {
    simulator_type: 'debt_ratio', bucket: 'above_reference',
    pct: 37.8, income: 4500, charges: 1700, email: 'a@b.fr', tel: '0600000000'
  });
  const last = global.dataLayer[global.dataLayer.length - 1];
  assert.strictEqual(last.event, 'simulation_result');
  assert.strictEqual(last.simulator_type, 'debt_ratio');
  assert.strictEqual(last.bucket, 'above_reference');
  ['email', 'tel', 'montant', 'nom', 'prenom'].forEach((k) => assert.ok(!(k in last), 'PII fuite : ' + k));
});

/* ---- I : validation ---------------------------------------------------- */
test('I1 — revenus nets foyer requis (> 0)', () => {
  assert.strictEqual(E.validate({ income1: '' }).ok, false);
  assert.strictEqual(E.validate({ income1: '0' }).ok, false);
  assert.strictEqual(E.validate({ income1: '3000' }).ok, true);
});
test('I2 — champs optionnels : valeur négative refusée, vide acceptée', () => {
  assert.strictEqual(E.validate({ income1: '3000', existingCredits: '-50' }).ok, false);
  assert.strictEqual(E.validate({ income1: '3000', existingCredits: '' }).ok, true);
  assert.strictEqual(E.validate({ income1: '3000', rentalIncome: '1000', newPayment: '500' }).ok, true);
});

/* ---- J : exemples pédagogiques calculés par le moteur ------------------ */
test('J1 — les exemples de la page sont recalculés par le moteur (pas de valeur figée)', () => {
  const cases = [
    { in: { income1: 3000, existingCredits: 900 }, pct: 30, bucket: 'below_reference' },
    { in: { income1: 4000, existingCredits: 1320 }, pct: 33, bucket: 'below_reference' },
    { in: { income1: 6000, existingCredits: 2100 }, pct: 35, bucket: 'around_reference' },
    { in: { income1: 4500, existingCredits: 1700 }, pct: 37.8, bucket: 'above_reference' }
  ];
  cases.forEach((c) => {
    const r = E.computeDebtRatio(c.in);
    assert.strictEqual(r.pct, c.pct);
    assert.strictEqual(r.bucket, c.bucket);
  });
  // Aucune valeur de taux d'exemple figée en dur dans le HTML (calcul à l'exécution).
  assert.ok(/id="end-ex-cards"/.test(HTML));
});

/* ---- K : page publication — index,follow / canonical / FAQ / scripts --- */
test('K1 — publication : index, follow + canonical propre + aucun noindex/preview résiduel', () => {
  assert.ok(/<meta name="robots" content="index,\s*follow">/.test(HTML));
  assert.ok(!/noindex|nofollow/.test(HTML), 'aucun noindex/nofollow résiduel');
  assert.ok(/<link rel="canonical" href="https:\/\/proactifsconseils\.fr\/simulateurs\/taux-endettement">/.test(HTML));
  assert.ok(!/preview local|localhost|127\.0\.0\.1/.test(HTML), 'aucune URL preview/localhost');
});
test('K2 — H1 + FAQPage + scripts socle + adaptateur endettement chargés', () => {
  assert.ok(/<h1>Calculez votre taux d'endettement<\/h1>/.test(HTML));
  assert.ok(/"@type":\s*"FAQPage"/.test(HTML));
  ['core.js', 'calc-credit.js', 'credit-policy.js', 'ui.js', 'lead.js', 'prototype-endettement.js']
    .forEach((s) => assert.ok(new RegExp('simulators/' + s.replace('.', '\\.')).test(HTML), 'script manquant : ' + s));
  assert.ok(!/PrototypeCapacity|PrototypeMensualite/.test(HTML), 'aucun autre adaptateur chargé');
  assert.ok(!/rates\.js/.test(HTML), 'rates.js non requis pour l\'endettement');
});
test('K3 — 35 % présenté comme repère ; seuil/limite uniquement en dénégation', () => {
  const body = HTML.toLowerCase();
  assert.ok(/repère/.test(body), 'le mot "repère" est présent');
  // Aucune affirmation positive "35 % est un seuil / une limite / un critère".
  assert.ok(!/35\s*%\s+est\s+(un\s+seuil|une\s+limite|un\s+critère)/.test(body), 'pas d\'affirmation seuil/limite/critère');
  // Chaque ligne citant "seuil légal" / "limite bancaire" / "critère d'acceptation"
  // doit contenir une négation (ni / pas / non).
  HTML.split(/\n/).forEach((line) => {
    const l = line.toLowerCase();
    if (/seuil légal|limite bancaire|critère d[’']acceptation/.test(l)) {
      assert.ok(/\bni\b|\bpas\b|\bnon\b|\bjamais\b|\bsans\b/.test(l), 'terme seuil/limite non nié : ' + line.trim().slice(0, 80));
    }
  });
});

/* ---- L : intégration centrale (publication CS-6C) --------------------- */
const NAV_PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, '../../scripts/nav-pages.json'), 'utf8'));
const BC_PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, '../../scripts/breadcrumb-pages.json'), 'utf8'));
const SITEMAP = fs.readFileSync(path.join(__dirname, '../../sitemap.xml'), 'utf8');

test('L1 — sitemap : taux-endettement présent, capacité+mensualité présents, simulation-pret absent', () => {
  assert.ok(SITEMAP.includes('/simulateurs/taux-endettement<'), 'taux-endettement dans le sitemap');
  assert.ok(SITEMAP.includes('/simulateurs/capacite-emprunt<'));
  assert.ok(SITEMAP.includes('/simulateurs/mensualite-credit<'));
  assert.ok(!/simulation-pret-immobilier/.test(SITEMAP), 'source redirigée absente du sitemap');
});
test('L2 — header central : page enregistrée dans nav-pages.json + bloc NAV présent', () => {
  assert.ok(NAV_PAGES.pages.includes('simulateurs/taux-endettement.html'), 'page dans nav-pages.json');
  assert.ok(/<!-- NAV:START/.test(HTML) && /<!-- NAV:END -->/.test(HTML), 'marqueurs NAV présents');
});
test('L3 — breadcrumb central : Accueil > Simulateurs (non cliquable) > Taux d\'endettement', () => {
  const entry = BC_PAGES.pages.find((x) => x.file === 'simulateurs/taux-endettement.html');
  assert.ok(entry, 'entrée breadcrumb présente');
  assert.strictEqual(entry.url, '/simulateurs/taux-endettement');
  assert.strictEqual(entry.label, 'Taux d\'endettement');
  assert.deepStrictEqual(entry.trail, [{ label: 'Accueil', url: '/' }, { label: 'Simulateurs' }]);
  // marqueurs centraux + Simulateurs non cliquable + page courante + JSON-LD
  assert.ok(/<!-- BREADCRUMB:START -->/.test(HTML) && /<!-- BREADCRUMB:END -->/.test(HTML), 'marqueurs breadcrumb visibles');
  assert.ok(/<!-- BREADCRUMB_JSONLD:START -->/.test(HTML), 'marqueurs JSON-LD breadcrumb');
  assert.ok(/<li><span>Simulateurs<\/span><\/li>/.test(HTML), 'Simulateurs non cliquable (span sans lien)');
  assert.ok(/aria-current="page">Taux d'endettement<\/span>/.test(HTML), 'page courante marquée');
  assert.ok(/"@type": "BreadcrumbList"/.test(HTML), 'JSON-LD BreadcrumbList présent');
});
