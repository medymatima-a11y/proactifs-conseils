/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — calc-credit.js
 * Fonctions PURES de calcul crédit. Aucune dépendance DOM/réseau.
 *
 * PRINCIPE : aucune règle métier cachée. Toute hypothèse (taux d'endettement,
 * taux annuel…) est passée EXPLICITEMENT en paramètre. Le taux d'endettement
 * 35 % et la grille de taux LEGACY ne sont PAS codés en dur ici.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.SimCalcCredit = factory(root.SimCore);
  }
}(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';
  var num = core.isValidNumber;

  /* Mensualité d'un prêt.
     { principal, annualRatePct, durationYears } -> € / mois */
  function calculateMonthlyPayment(p) {
    if (!num(p.principal) || !num(p.durationYears) || p.durationYears <= 0) return NaN;
    return core.monthlyPayment({
      principal: p.principal,
      annualRatePct: p.annualRatePct,
      months: core.monthsFromYears(p.durationYears)
    });
  }

  /* Capacité d'emprunt (capital finançable).
     { income, existingDebt, durationYears, annualRate, maxDebtRatio }
     maxDebtRatio = ratio d'endettement EXPLICITE (ex: 0.35). annualRate en %.
     Reproduit la logique legacy quand maxDebtRatio=0.35 et annualRate=grille legacy :
       mensMax  = max(0, income*maxDebtRatio − existingDebt)
       capital  = round(mensMax × facteurAnnuité) */
  function calculateBorrowingCapacity(p) {
    if (!num(p.income) || !num(p.durationYears) || p.durationYears <= 0) return NaN;
    if (!num(p.maxDebtRatio)) return NaN;
    var existingDebt = num(p.existingDebt) ? p.existingDebt : 0;
    var maxPayment = core.clampMin(p.income * p.maxDebtRatio - existingDebt, 0);
    var factor = core.annuityFactor({
      annualRatePct: p.annualRate,
      months: core.monthsFromYears(p.durationYears)
    });
    if (!num(factor)) return NaN;
    return core.round(maxPayment * factor, 0);
  }

  /* Mensualité maximale soutenable pour un endettement donné (hors capital).
     { income, existingDebt, maxDebtRatio } -> € / mois */
  function calculateMaxPayment(p) {
    if (!num(p.income) || !num(p.maxDebtRatio)) return NaN;
    var existingDebt = num(p.existingDebt) ? p.existingDebt : 0;
    return core.clampMin(p.income * p.maxDebtRatio - existingDebt, 0);
  }

  /* Taux d'endettement d'une mensualité. { payment, income } -> ratio (0..1+) */
  function calculateDebtRatio(p) {
    if (!num(p.payment) || !num(p.income) || p.income <= 0) return NaN;
    return p.payment / p.income;
  }

  /* Coût total du crédit. { principal, annualRatePct, durationYears } */
  function calculateCreditCost(p) {
    var months = core.monthsFromYears(p.durationYears);
    var payment = calculateMonthlyPayment(p);
    if (!num(payment)) return NaN;
    return core.creditCost({ payment: payment, months: months, principal: p.principal });
  }

  /* Budget d'achat = capacité + apport. { capacity, apport } */
  function calculateBudget(p) {
    var capacity = num(p.capacity) ? p.capacity : NaN;
    var apport = num(p.apport) ? p.apport : 0;
    if (!num(capacity)) return NaN;
    return capacity + apport;
  }

  return {
    calculateMonthlyPayment: calculateMonthlyPayment,
    calculateBorrowingCapacity: calculateBorrowingCapacity,
    calculateMaxPayment: calculateMaxPayment,
    calculateDebtRatio: calculateDebtRatio,
    calculateCreditCost: calculateCreditCost,
    calculateBudget: calculateBudget
  };
}));
