/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — rates.js
 * Gestion des grilles de taux. Aucune dépendance, aucun DOM.
 *
 * ⚠ IMPORTANT : la seule grille fournie ici est LEGACY_REFERENCE — la table
 * hardcodée reprise de simulation-pret-immobilier.html. Elle est NON SOURCÉE,
 * NON DATÉE, NON VALIDÉE comme taux marché. Ce n'est PAS "CURRENT_RATES".
 * Une grille validée pourra être ajoutée plus tard SANS toucher calc-credit.js.
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

  return {
    LEGACY_REFERENCE: LEGACY_REFERENCE,
    resolveRate: resolveRate,
    getRate: getRate,
    isValidGrid: isValidGrid
  };
}));
