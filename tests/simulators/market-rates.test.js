'use strict';
/* ==========================================================================
 * Tests CS-3.5 — référentiel taux marché Proactifs (rates.js / MARKET_REFERENCE).
 * Vérifie les valeurs sept. 2026, la sélection par durée SANS extrapolation,
 * la validation, la fraîcheur, l'immutabilité, l'alias ACTIVE, et confirme que
 * LEGACY_REFERENCE reste strictement inchangé.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const rates = require('../../assets/js/simulators/rates.js');

const REF = rates.PROACTIFS_MARKET_REFERENCE_2026_09;
const { getMarketRate, validateMarketReference, getMarketReferenceFreshness,
  ACTIVE_MARKET_REFERENCE, UNSUPPORTED_MARKET_DURATION, MARKET_FRESHNESS } = rates;

/* ---- A–D : valeurs de référence --------------------------------------- */
test('A) 10 ans = 3.20', () => { assert.strictEqual(getMarketRate(10, REF), 3.20); });
test('B) 15 ans = 3.35', () => { assert.strictEqual(getMarketRate(15, REF), 3.35); });
test('C) 20 ans = 3.50', () => { assert.strictEqual(getMarketRate(20, REF), 3.50); });
test('D) 25 ans = 3.60', () => { assert.strictEqual(getMarketRate(25, REF), 3.60); });

/* ---- E–F : durées non supportées (pas d'extrapolation) ---------------- */
test('E) 30 ans non supporté (jamais 3.60 implicite)', () => {
  assert.strictEqual(getMarketRate(30, REF), UNSUPPORTED_MARKET_DURATION);
});
test('F) 7 ans non supporté', () => {
  assert.strictEqual(getMarketRate(7, REF), UNSUPPORTED_MARKET_DURATION);
});

/* ---- G–K : entrées invalides ------------------------------------------ */
test('G) durée invalide (12/17/22) non supportée', () => {
  [12, 17, 22].forEach(d => assert.strictEqual(getMarketRate(d, REF), UNSUPPORTED_MARKET_DURATION));
});
test('H) null -> non supporté', () => { assert.strictEqual(getMarketRate(null, REF), UNSUPPORTED_MARKET_DURATION); });
test('I) undefined -> non supporté', () => { assert.strictEqual(getMarketRate(undefined, REF), UNSUPPORTED_MARKET_DURATION); });
test('J) NaN -> non supporté', () => { assert.strictEqual(getMarketRate(NaN, REF), UNSUPPORTED_MARKET_DURATION); });
test('K) chaîne -> non supportée (même "25")', () => {
  assert.strictEqual(getMarketRate('25', REF), UNSUPPORTED_MARKET_DURATION);
  assert.strictEqual(getMarketRate('abc', REF), UNSUPPORTED_MARKET_DURATION);
});

/* ---- L–O : validation ------------------------------------------------- */
test('L) référence valide', () => {
  const v = validateMarketReference(REF);
  assert.strictEqual(v.valid, true);
  assert.deepStrictEqual(v.errors, []);
});
test('M) référence sans source -> invalide', () => {
  const bad = Object.assign({}, REF, { sources: [] });
  assert.strictEqual(validateMarketReference(bad).valid, false);
});
test('N) référence sans taux -> invalide', () => {
  const bad = Object.assign({}, REF, { rates: { 10: 3.20, 15: 3.35 } }); // 20 & 25 manquants
  const v = validateMarketReference(bad);
  assert.strictEqual(v.valid, false);
  assert.ok(v.errors.some(e => /20/.test(e)) && v.errors.some(e => /25/.test(e)));
});
test('O) taux négatif -> invalide', () => {
  const bad = Object.assign({}, REF, { rates: { 10: -3.20, 15: 3.35, 20: 3.50, 25: 3.60 } });
  assert.strictEqual(validateMarketReference(bad).valid, false);
});

/* ---- P : hors assurance ------------------------------------------------ */
test('P) insuranceIncluded === false', () => {
  assert.strictEqual(REF.insuranceIncluded, false);
});

/* ---- Q : immutabilité -------------------------------------------------- */
test('Q) référentiel gelé (rates, sources, sous-objets, tableaux)', () => {
  assert.ok(Object.isFrozen(REF));
  assert.ok(Object.isFrozen(REF.rates));
  assert.ok(Object.isFrozen(REF.sources));
  assert.ok(Object.isFrozen(REF.sources[0]));
  assert.ok(Object.isFrozen(REF.qualifiers));
  assert.ok(Object.isFrozen(REF.freshnessPolicy));
  try { REF.rates[10] = 9.99; } catch (e) {}
  try { REF.sources.push({}); } catch (e) {}
  assert.strictEqual(REF.rates[10], 3.20);
  assert.strictEqual(REF.sources.length, 5);
});

/* ---- R : ACTIVE_MARKET_REFERENCE -------------------------------------- */
test('R) ACTIVE_MARKET_REFERENCE pointe sur septembre 2026', () => {
  assert.strictEqual(ACTIVE_MARKET_REFERENCE.id, 'PROACTIFS_MARKET_REFERENCE_2026_09');
  assert.strictEqual(ACTIVE_MARKET_REFERENCE, REF);
  assert.strictEqual(getMarketRate(20), 3.50); // défaut = ACTIVE
});

/* ---- S–U : fraîcheur --------------------------------------------------- */
test('S) freshness CURRENT (<= 31 jours)', () => {
  const f = getMarketReferenceFreshness(REF, '2026-09-20'); // 3 jours
  assert.strictEqual(f.state, MARKET_FRESHNESS.CURRENT);
  assert.strictEqual(f.ageDays, 3);
});
test('T) freshness REVIEW_DUE (32–45 jours)', () => {
  const f = getMarketReferenceFreshness(REF, '2026-10-25'); // 38 jours
  assert.strictEqual(f.state, MARKET_FRESHNESS.REVIEW_DUE);
});
test('U) freshness STALE (> 45 jours)', () => {
  const f = getMarketReferenceFreshness(REF, '2026-12-01'); // 75 jours
  assert.strictEqual(f.state, MARKET_FRESHNESS.STALE);
});

/* ---- V : pas d'extrapolation silencieuse ------------------------------ */
test('V) aucune extrapolation : 30 ≠ 25, retour explicite', () => {
  assert.notStrictEqual(getMarketRate(30, REF), 3.60);
  assert.strictEqual(getMarketRate(30, REF), UNSUPPORTED_MARKET_DURATION);
});

/* ---- W : LEGACY_REFERENCE strictement inchangé ------------------------ */
test('W) LEGACY_REFERENCE inchangé (parité CS-1/CS-2)', () => {
  const L = rates.LEGACY_REFERENCE;
  assert.strictEqual(L.kind, 'LEGACY_REFERENCE');
  assert.strictEqual(L.validated, false);
  assert.strictEqual(L.effectiveDate, null);
  assert.deepStrictEqual(L.rates, [
    { maxYears: 10, ratePct: 3.10 },
    { maxYears: 15, ratePct: 3.30 },
    { maxYears: 20, ratePct: 3.45 },
    { maxYears: Infinity, ratePct: 3.60 }
  ]);
  // le référentiel marché n'a pas contaminé la grille legacy
  assert.strictEqual(rates.resolveRate(L, 10), 3.10);
  assert.strictEqual(rates.resolveRate(L, 25), 3.60);
});

/* ---- Nature indicative : jamais une offre ----------------------------- */
test('Nature : PROACTIFS_SIMULATION_MARKET_REFERENCE + NOT_BANK/GUARANTEED/BEST', () => {
  assert.strictEqual(REF.nature, 'PROACTIFS_SIMULATION_MARKET_REFERENCE');
  ['NOT_BANK_OFFER', 'NOT_GUARANTEED_RATE', 'NOT_BEST_RATE'].forEach(q =>
    assert.ok(REF.qualifiers.indexOf(q) !== -1, 'qualifier manquant: ' + q));
});

/* ---- Sources : BdF = macro, courtiers = comparaison ------------------- */
test('Sources : Banque de France = MACRO_SANITY_CHECK ; courtiers = MARKET_COMPARISON', () => {
  const byName = {};
  REF.sources.forEach(s => { byName[s.name] = s; });
  assert.strictEqual(byName['Banque de France'].role, 'MACRO_SANITY_CHECK');
  assert.strictEqual(byName['Banque de France'].type, 'OFFICIAL_STATISTICAL_REFERENCE');
  ['CAFPI', 'Empruntis', 'Pretto', 'Meilleurtaux'].forEach(n => {
    assert.strictEqual(byName[n].role, 'MARKET_COMPARISON');
    assert.strictEqual(byName[n].type, 'MARKET_BAROMETER');
  });
});

/* ---- Disclaimer présent & hors assurance ------------------------------ */
test('Disclaimer : présent et mentionne "hors assurance"', () => {
  assert.ok(typeof REF.disclaimer === 'string' && REF.disclaimer.length > 0);
  assert.ok(/hors assurance/i.test(REF.disclaimer));
});

/* ---- Historique & alias ----------------------------------------------- */
test('Historique : registre contient septembre 2026, prêt pour d’autres mois', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(rates.MARKET_REFERENCE_HISTORY, 'PROACTIFS_MARKET_REFERENCE_2026_09'));
  assert.strictEqual(rates.MARKET_REFERENCE_HISTORY['PROACTIFS_MARKET_REFERENCE_2026_09'], REF);
});
