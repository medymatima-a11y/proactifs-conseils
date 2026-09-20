/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — hub.js  (CS-7B)
 * Analytics léger du hub /simulateurs (preview). Le HTML des cartes est
 * STATIQUE (SEO/accessibilité) ; ce script ne fait QUE du tracking sans PII.
 *
 * ⚠ Ne modifie aucun socle. S'appuie sur SimUI.track (allow-list étendue CS-7B :
 *   simulator_hub_view, simulator_card_clicked). Aucune donnée financière/PII.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ui.js'));
  } else {
    root.SimHub = factory(root.SimUI);
  }
}(typeof self !== 'undefined' ? self : this, function (ui) {
  'use strict';

  /* Descripteurs des outils (source de vérité pour le tracking).
     tool ∈ {capacite, mensualite, endettement} — jamais de donnée financière. */
  var TOOLS = [
    { key: 'capacite',    title: "Capacité d'emprunt",   url: '/simulateurs/capacite-emprunt' },
    { key: 'mensualite',  title: 'Mensualité de crédit', url: '/simulateurs/mensualite-credit' },
    { key: 'endettement', title: "Taux d'endettement",   url: '/simulateurs/taux-endettement' }
  ];
  var VALID = { capacite: 1, mensualite: 1, endettement: 1 };

  function track(ev, data) { if (ui && typeof ui.track === 'function') ui.track(ev, data || {}); }

  function init() {
    if (typeof document === 'undefined') return null;

    // Vue du hub
    track('simulator_hub_view', {});

    // Clic sur une carte / un lien outil : n'émet QUE { tool }
    document.querySelectorAll('[data-tool]').forEach(function (el) {
      el.addEventListener('click', function () {
        var tool = el.getAttribute('data-tool');
        if (VALID[tool]) track('simulator_card_clicked', { tool: tool });
      });
    });

    // CTA financement : événement existant, sans donnée financière
    document.querySelectorAll('[data-action="financing-cta"]').forEach(function (el) {
      el.addEventListener('click', function () { track('financing_cta_clicked', {}); });
    });

    return { tools: TOOLS };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  return { TOOLS: TOOLS, VALID: VALID, init: init };
}));
