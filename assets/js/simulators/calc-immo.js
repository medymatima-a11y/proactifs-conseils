/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — calc-immo.js
 * Socle GÉNÉRIQUE de calculs immobiliers — UNIQUEMENT des formules
 * mathématiques non ambiguës. Fonctions pures.
 *
 * ⚠ NE contient PAS (volontairement, traité séparément plus tard) :
 * frais de notaire, fiscalité plus-value, LMNP, impôt, droits de succession.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.SimCalcImmo = factory(root.SimCore);
  }
}(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';
  var num = core.isValidNumber;

  /* Rendement brut (%) = loyer annuel / prix × 100 */
  function grossYield(p) {
    if (!num(p.annualRent) || !num(p.price) || p.price <= 0) return NaN;
    return p.annualRent / p.price * 100;
  }

  /* Rendement net simple (%) = (loyer annuel − charges annuelles) / prix × 100
     "net simple" = hors fiscalité (assumé explicitement). */
  function netYieldSimple(p) {
    if (!num(p.annualRent) || !num(p.price) || p.price <= 0) return NaN;
    var charges = num(p.annualCharges) ? p.annualCharges : 0;
    return (p.annualRent - charges) / p.price * 100;
  }

  /* Effort d'épargne mensuel = mensualité + charges − loyer perçu
     (> 0 = sortie de trésorerie ; < 0 = cash-flow positif). */
  function savingsEffort(p) {
    if (!num(p.monthlyPayment)) return NaN;
    var charges = num(p.monthlyCharges) ? p.monthlyCharges : 0;
    var rent = num(p.monthlyRent) ? p.monthlyRent : 0;
    return p.monthlyPayment + charges - rent;
  }

  /* Coût total du projet = prix + coûts additionnels EXPLICITES fournis.
     Aucun frais inventé (notaire, etc.) : extraCosts est passé par l'appelant. */
  function totalProjectCost(p) {
    if (!num(p.price)) return NaN;
    var extra = num(p.extraCosts) ? p.extraCosts : 0;
    return p.price + extra;
  }

  return {
    grossYield: grossYield,
    netYieldSimple: netYieldSimple,
    savingsEffort: savingsEffort,
    totalProjectCost: totalProjectCost
  };
}));
