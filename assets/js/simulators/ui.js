/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — ui.js
 * Helpers UI réutilisables + abstraction tracking (convention).
 * Les FORMATTERS sont purs et testables. Les helpers DOM sont protégés
 * (no-op hors navigateur) : aucune dépendance à un framework.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimUI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var hasDoc = typeof document !== 'undefined';

  /* --- Formatters (purs) -------------------------------------------------- */
  function formatEuro(v, opts) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    opts = opts || {};
    var dec = opts.decimals || 0;
    var s = Math.abs(v).toFixed(dec);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // espace fine
    var out = parts.join(',') + ' €';
    return (v < 0 ? '-' : '') + out;
  }

  function formatPercent(v, decimals) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    var d = (decimals === undefined) ? 2 : decimals;
    return v.toFixed(d).replace('.', ',') + ' %';
  }

  /* --- Tracking (convention CS-1, sans PII) ------------------------------- */
  var ALLOWED_EVENTS = [
    'simulation_started',
    'simulation_completed',
    'simulation_result',
    'financing_cta_clicked',
    'financing_lead_submitted'
  ];
  // Clés interdites (PII / montants exacts) — jamais transmises au tracking.
  var FORBIDDEN_KEYS = [
    'nom', 'prenom', 'email', 'tel', 'telephone', 'name', 'phone',
    'income', 'revenu', 'revenus', 'montant', 'amount', 'capital',
    'loanAmount', 'apport', 'price', 'prix'
  ];

  function sanitizeTrackingData(data) {
    var clean = {};
    if (!data || typeof data !== 'object') return clean;
    Object.keys(data).forEach(function (k) {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) return;           // drop PII/montants
      var val = data[k];
      if (typeof val === 'object' && val !== null) return;    // pas d'objets imbriqués
      clean[k] = val;                                         // buckets/catégories OK
    });
    return clean;
  }

  /* Abstraction : n'émet QUE les événements whitelistés, sans PII.
     En CS-1, pousse vers window.dataLayer si présent (sinon no-op). */
  function track(eventName, data) {
    if (ALLOWED_EVENTS.indexOf(eventName) === -1) return false;
    var payload = { event: eventName };
    var clean = sanitizeTrackingData(data);
    Object.keys(clean).forEach(function (k) { payload[k] = clean[k]; });
    if (hasDoc && root.dataLayer && typeof root.dataLayer.push === 'function') {
      root.dataLayer.push(payload);
    }
    return true;
  }

  /* --- Helpers DOM (protégés) --------------------------------------------- */
  function showStep(steps, index) {
    if (!hasDoc || !steps) return;
    for (var i = 0; i < steps.length; i++) {
      steps[i].hidden = (i !== index);
    }
  }

  function setProgress(el, current, total) {
    if (!hasDoc || !el || !total) return;
    var pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
    el.style.width = pct + '%';
    el.setAttribute('aria-valuenow', String(pct));
  }

  function setState(el, state, message) {
    // state ∈ 'error' | 'success' | 'idle'
    if (!hasDoc || !el) return;
    el.classList.remove('sim-error', 'sim-success');
    if (state === 'error') el.classList.add('sim-error');
    if (state === 'success') el.classList.add('sim-success');
    if (message !== undefined) el.textContent = message;
  }

  return {
    formatEuro: formatEuro,
    formatPercent: formatPercent,
    track: track,
    sanitizeTrackingData: sanitizeTrackingData,
    ALLOWED_EVENTS: ALLOWED_EVENTS,
    showStep: showStep,
    setProgress: setProgress,
    setState: setState
  };
}));
