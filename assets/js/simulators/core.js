/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — core.js
 * Socle de calcul GÉNÉRIQUE et PUR. Aucune dépendance.
 * INTERDIT ici : DOM, GA4, formulaire, Supabase, Brevo, réseau.
 * UMD : utilisable via require() (Node) ou window.SimCore (navigateur).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Validation numérique ---------------------------------------------------- */
  function isValidNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  /* Normalisation : "1 234,56 €" / "1,234.56" / number -> number (ou NaN) */
  function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (v === null || v === undefined) return NaN;
    var s = String(v).trim();
    if (s === '') return NaN;
    s = s.replace(/ /g, ' ')            // NBSP
         .replace(/[€%\s]/g, '')             // symboles + espaces
         .replace(/\.(?=\d{3}(\D|$))/g, '')  // séparateur de milliers "."
         .replace(',', '.');                 // virgule décimale FR
    var n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function round(v, decimals) {
    var d = decimals || 0;
    if (!isValidNumber(v)) return NaN;
    var f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  function clampMin(v, min) {
    return v < min ? min : v;
  }

  /* Durée ------------------------------------------------------------------- */
  function monthsFromYears(years) {
    return years * 12;
  }

  /* Taux mensuel à partir du taux annuel en % (ex: 3.6 -> 0.003) */
  function monthlyRate(annualRatePct) {
    return annualRatePct / 100 / 12;
  }

  /* Facteur d'annuité = (1 - (1+tm)^-n) / tm ; si tm=0 -> n
     C'est le multiplicateur mensualité -> capital. */
  function annuityFactor(opts) {
    var months = opts.months;
    var tm = monthlyRate(opts.annualRatePct);
    if (!isValidNumber(months) || months <= 0) return NaN;
    if (tm === 0) return months;
    return (1 - Math.pow(1 + tm, -months)) / tm;
  }

  /* Mensualité d'un prêt (capital -> mensualité) */
  function monthlyPayment(opts) {
    var principal = opts.principal;
    var months = opts.months;
    if (!isValidNumber(principal) || !isValidNumber(months) || months <= 0) return NaN;
    var f = annuityFactor({ annualRatePct: opts.annualRatePct, months: months });
    if (!isValidNumber(f) || f === 0) return NaN;
    return principal / f;
  }

  /* Capital empruntable à partir d'une mensualité (mensualité -> capital) */
  function principalFromPayment(opts) {
    var payment = opts.payment;
    var months = opts.months;
    if (!isValidNumber(payment) || !isValidNumber(months) || months <= 0) return NaN;
    var f = annuityFactor({ annualRatePct: opts.annualRatePct, months: months });
    if (!isValidNumber(f)) return NaN;
    return payment * f;
  }

  /* Coût total du crédit = (mensualité × nb mois) − capital */
  function creditCost(opts) {
    var payment = opts.payment, months = opts.months, principal = opts.principal;
    if (!isValidNumber(payment) || !isValidNumber(months) || !isValidNumber(principal)) return NaN;
    return payment * months - principal;
  }

  return {
    isValidNumber: isValidNumber,
    toNumber: toNumber,
    round: round,
    clampMin: clampMin,
    monthsFromYears: monthsFromYears,
    monthlyRate: monthlyRate,
    annuityFactor: annuityFactor,
    monthlyPayment: monthlyPayment,
    principalFromPayment: principalFromPayment,
    creditCost: creditCost
  };
}));
