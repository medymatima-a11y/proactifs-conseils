/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — rates.js
 * Gestion des grilles de taux. Aucune dépendance, aucun DOM.
 *
 * ⚠ IMPORTANT : la seule grille fournie ici est LEGACY_REFERENCE — la table
 * hardcodée reprise de simulation-pret-immobilier.html. Elle est NON SOURCÉE,
 * NON DATÉE, NON VALIDÉE comme taux marché. Ce n'est PAS "CURRENT_RATES".
 * Une grille validée pourra être ajoutée plus tard SANS toucher calc-credit.js.
 *
 * CS-3.5 : ajout d'un RÉFÉRENTIEL TAUX MARCHÉ Proactifs (MARKET_REFERENCE),
 * indépendant, versionné, daté, sourcé, immuable. NON connecté au prototype.
 * LEGACY_REFERENCE reste STRICTEMENT inchangé.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimRates = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Table LEGACY (référence de parité uniquement — ne pas présenter comme actuelle) */
  var LEGACY_REFERENCE = {
    version: 'legacy-2026-ref',
    effectiveDate: null,                 // inconnue
    source: 'simulation-pret-immobilier.html (hardcodé, non sourcé)',
    validated: false,
    kind: 'LEGACY_REFERENCE',
    rates: [
      { maxYears: 10, ratePct: 3.10 },
      { maxYears: 15, ratePct: 3.30 },
      { maxYears: 20, ratePct: 3.45 },
      { maxYears: Infinity, ratePct: 3.60 }
    ]
  };

  /* Résout le taux (%) pour une durée en années sur une grille à seuils.
     Reproduit wzTaux() : premier palier dont durationYears <= maxYears. */
  function resolveRate(grid, durationYears) {
    if (!grid || !Array.isArray(grid.rates)) return NaN;
    for (var i = 0; i < grid.rates.length; i++) {
      if (durationYears <= grid.rates[i].maxYears) return grid.rates[i].ratePct;
    }
    return grid.rates.length ? grid.rates[grid.rates.length - 1].ratePct : NaN;
  }

  /* Sucre : taux legacy pour une durée (par défaut sur LEGACY_REFERENCE). */
  function getRate(durationYears, grid) {
    return resolveRate(grid || LEGACY_REFERENCE, durationYears);
  }

  /* Validation minimale d'une future grille (structure attendue). */
  function isValidGrid(grid) {
    return !!grid && typeof grid.version === 'string' &&
      Array.isArray(grid.rates) && grid.rates.length > 0 &&
      grid.rates.every(function (r) {
        return typeof r.ratePct === 'number' && typeof r.maxYears === 'number';
      });
  }

  /* ======================================================================
   * CS-3.5 — RÉFÉRENTIEL TAUX MARCHÉ PROACTIFS (MARKET_REFERENCE)
   * ----------------------------------------------------------------------
   * Taux INDICATIFS de simulation Proactifs. Ce ne sont PAS des offres
   * bancaires, PAS des taux garantis, PAS des « meilleurs taux ». Hors
   * assurance. Non connecté au prototype (voir CS-4). Immuable.
   * ==================================================================== */

  /* Gel récursif : le référentiel est immuable une fois figé. */
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  /* Politique de fraîcheur — SEUILS INTERNES PROACTIFS (pas une règle bancaire). */
  var MARKET_FRESHNESS_POLICY = { currentMaxDays: 31, reviewDueMaxDays: 45 };
  var MARKET_FRESHNESS = { CURRENT: 'CURRENT', REVIEW_DUE: 'REVIEW_DUE', STALE: 'STALE' };
  var UNSUPPORTED_MARKET_DURATION = 'UNSUPPORTED_MARKET_DURATION';

  /* Référence de septembre 2026 (première grille marché Proactifs). */
  var PROACTIFS_MARKET_REFERENCE_2026_09 = deepFreeze({
    id: 'PROACTIFS_MARKET_REFERENCE_2026_09',
    version: '1.0.0',

    effectiveMonth: '2026-09',
    effectiveDate: '2026-09-17',
    verifiedDate: '2026-09-17',

    status: 'INTERNAL_VALIDATION',

    currency: 'EUR',
    country: 'FR',

    rateType: 'NOMINAL_FIXED_RATE',
    insuranceIncluded: false,              // HORS assurance emprunteur

    marketScope: 'FRANCE_NATIONAL_INDICATIVE',

    kind: 'MARKET_REFERENCE',
    /* Nature EXPLICITE : hypothèse de simulation, jamais une offre. */
    nature: 'PROACTIFS_SIMULATION_MARKET_REFERENCE',
    qualifiers: ['NOT_BANK_OFFER', 'NOT_GUARANTEED_RATE', 'NOT_BEST_RATE'],

    /* Grille indicative — durées supportées uniquement (pas d'extrapolation). */
    rates: { 10: 3.20, 15: 3.35, 20: 3.50, 25: 3.60 },
    supportedDurations: [10, 15, 20, 25],

    /* Rappel de la politique de fraîcheur attachée à la référence. */
    freshnessPolicy: {
      currentMaxDays: 31,
      reviewDueMaxDays: 45,
      note: 'Seuils internes Proactifs — pas une règle bancaire.'
    },

    /* Traçabilité des sources : baromètres courtiers = comparaison marché ;
       Banque de France = contrôle macro, PAS source directe de la grille. */
    sources: [
      { name: 'CAFPI', type: 'MARKET_BAROMETER', role: 'MARKET_COMPARISON', scope: 'FRANCE_NATIONAL', checkedDate: '2026-09-17' },
      { name: 'Empruntis', type: 'MARKET_BAROMETER', role: 'MARKET_COMPARISON', scope: 'FRANCE_NATIONAL', checkedDate: '2026-09-17' },
      { name: 'Pretto', type: 'MARKET_BAROMETER', role: 'MARKET_COMPARISON', scope: 'FRANCE_NATIONAL', checkedDate: '2026-09-17' },
      { name: 'Meilleurtaux', type: 'MARKET_BAROMETER', role: 'MARKET_COMPARISON', scope: 'FRANCE_NATIONAL', checkedDate: '2026-09-17' },
      { name: 'Banque de France', type: 'OFFICIAL_STATISTICAL_REFERENCE', role: 'MACRO_SANITY_CHECK', scope: 'FRANCE_NATIONAL', checkedDate: '2026-09-17' }
    ],

    disclaimer: 'Taux indicatifs utilisés uniquement pour cette simulation, hors assurance. Le taux réellement proposé dépend du profil de l’emprunteur, du projet et des conditions de l’établissement prêteur.'
  });

  /* Historique mensuel — registre par id. Prêt pour 2026_10, 2026_11, …
     (aucune fausse référence future créée en CS-3.5). */
  var MARKET_REFERENCE_HISTORY = deepFreeze({
    'PROACTIFS_MARKET_REFERENCE_2026_09': PROACTIFS_MARKET_REFERENCE_2026_09
  });

  /* Alias actif : à repointer plus tard sans toucher au moteur. */
  var ACTIVE_MARKET_REFERENCE = PROACTIFS_MARKET_REFERENCE_2026_09;

  /* Sélection par durée — AUCUNE extrapolation silencieuse.
     Durée non listée / type non numérique -> UNSUPPORTED_MARKET_DURATION. */
  function getMarketRate(durationYears, reference) {
    reference = reference || ACTIVE_MARKET_REFERENCE;
    if (!reference || !reference.rates) return UNSUPPORTED_MARKET_DURATION;
    if (typeof durationYears !== 'number' || !Number.isFinite(durationYears)) {
      return UNSUPPORTED_MARKET_DURATION;
    }
    var key = String(durationYears);
    if (!Object.prototype.hasOwnProperty.call(reference.rates, key)) {
      return UNSUPPORTED_MARKET_DURATION;
    }
    return reference.rates[key];
  }

  function isValidDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var t = Date.parse(s + 'T00:00:00Z');
    return !isNaN(t);
  }

  /* Validation structurelle d'un référentiel marché. Retour { valid, errors }. */
  function validateMarketReference(reference) {
    var errors = [];
    if (!reference || typeof reference !== 'object') {
      return { valid: false, errors: ['référence manquante'] };
    }
    if (!reference.id) errors.push('id manquant');
    if (!reference.version) errors.push('version manquante');
    if (!isValidDateStr(reference.effectiveDate)) errors.push('effectiveDate invalide');
    if (!isValidDateStr(reference.verifiedDate)) errors.push('verifiedDate invalide');

    var r = reference.rates;
    if (!r || typeof r !== 'object') {
      errors.push('rates manquants');
    } else {
      [10, 15, 20, 25].forEach(function (d) {
        var k = String(d);
        if (!Object.prototype.hasOwnProperty.call(r, k)) {
          errors.push('taux ' + d + ' manquant');
        } else if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] <= 0) {
          errors.push('taux ' + d + ' invalide');
        }
      });
    }

    if (reference.insuranceIncluded !== false) errors.push('insuranceIncluded doit être false');
    if (!Array.isArray(reference.sources) || reference.sources.length === 0) errors.push('sources manquantes');
    if (!reference.disclaimer) errors.push('disclaimer manquant');

    return { valid: errors.length === 0, errors: errors };
  }

  /* Fraîcheur du référentiel — n'effectue AUCUN fetch, ne modifie AUCUN taux.
     asOfDate : Date ou 'YYYY-MM-DD' (défaut : maintenant). */
  function getMarketReferenceFreshness(reference, asOfDate) {
    reference = reference || ACTIVE_MARKET_REFERENCE;
    var policy = (reference && reference.freshnessPolicy) || MARKET_FRESHNESS_POLICY;
    var currentMax = policy.currentMaxDays, reviewMax = policy.reviewDueMaxDays;

    var baseStr = reference && reference.verifiedDate;
    var d0 = new Date(baseStr + 'T00:00:00Z');
    var d1;
    if (asOfDate instanceof Date) d1 = asOfDate;
    else if (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) d1 = new Date(asOfDate + 'T00:00:00Z');
    else if (asOfDate) d1 = new Date(asOfDate);
    else d1 = new Date();

    if (isNaN(d0.getTime()) || isNaN(d1.getTime())) {
      return { state: null, ageDays: NaN, verifiedDate: baseStr, currentMaxDays: currentMax, reviewDueMaxDays: reviewMax };
    }
    var ageDays = Math.floor((d1.getTime() - d0.getTime()) / 86400000);
    var state = ageDays <= currentMax ? MARKET_FRESHNESS.CURRENT
      : (ageDays <= reviewMax ? MARKET_FRESHNESS.REVIEW_DUE : MARKET_FRESHNESS.STALE);
    return { state: state, ageDays: ageDays, verifiedDate: baseStr, currentMaxDays: currentMax, reviewDueMaxDays: reviewMax };
  }

  return {
    /* Existant CS-1 (inchangé) */
    LEGACY_REFERENCE: LEGACY_REFERENCE,
    resolveRate: resolveRate,
    getRate: getRate,
    isValidGrid: isValidGrid,
    /* CS-3.5 — référentiel marché */
    PROACTIFS_MARKET_REFERENCE_2026_09: PROACTIFS_MARKET_REFERENCE_2026_09,
    MARKET_REFERENCE_HISTORY: MARKET_REFERENCE_HISTORY,
    ACTIVE_MARKET_REFERENCE: ACTIVE_MARKET_REFERENCE,
    MARKET_FRESHNESS: MARKET_FRESHNESS,
    MARKET_FRESHNESS_POLICY: MARKET_FRESHNESS_POLICY,
    UNSUPPORTED_MARKET_DURATION: UNSUPPORTED_MARKET_DURATION,
    getMarketRate: getMarketRate,
    validateMarketReference: validateMarketReference,
    getMarketReferenceFreshness: getMarketReferenceFreshness
  };
}));
