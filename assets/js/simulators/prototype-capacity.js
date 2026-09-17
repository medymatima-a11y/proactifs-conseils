/* ==========================================================================
 * Proactifs Conseils — Prototype CS-2 — prototype-capacity.js
 * Contrôleur du prototype "capacité d'emprunt V2".
 * S'appuie EXCLUSIVEMENT sur le moteur CS-1 (core / rates / calc-credit / lead / ui).
 * Aucune formule recopiée ici. UMD : logique pure testable en Node + init DOM (navigateur).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./core.js'), require('./rates.js'), require('./calc-credit.js'),
      require('./lead.js'), require('./ui.js')
    );
  } else {
    root.PrototypeCapacity = factory(root.SimCore, root.SimRates, root.SimCalcCredit, root.SimLead, root.SimUI);
  }
}(typeof self !== 'undefined' ? self : this, function (core, rates, cc, lead, ui) {
  'use strict';

  /* Hypothèses PROTOTYPE — passées explicitement au moteur (aucun 35 % caché). */
  var PROTOTYPE_ASSUMPTIONS = {
    maxDebtRatio: 0.35,
    rateGrid: rates.LEGACY_REFERENCE,   // référence technique legacy — NON taux actuel
    durations: [10, 15, 20, 25, 30]
  };

  /* ---- Calcul : appelle le moteur CS-1, ne recalcule rien ---------------- */
  function computeResult(input) {
    var income1 = core.toNumber(input.income1);
    var income2 = input.couple ? (core.toNumber(input.income2) || 0) : 0;
    var income = (core.isValidNumber(income1) ? income1 : 0) + income2;
    var existingDebt = core.toNumber(input.existingDebt); existingDebt = core.isValidNumber(existingDebt) ? existingDebt : 0;
    var apport = core.toNumber(input.apport); apport = core.isValidNumber(apport) ? apport : 0;
    var durationYears = Number(input.durationYears);
    var rate = rates.resolveRate(PROTOTYPE_ASSUMPTIONS.rateGrid, durationYears);
    var capacity = cc.calculateBorrowingCapacity({
      income: income, existingDebt: existingDebt, durationYears: durationYears,
      annualRate: rate, maxDebtRatio: PROTOTYPE_ASSUMPTIONS.maxDebtRatio
    });
    var maxPayment = cc.calculateMaxPayment({ income: income, existingDebt: existingDebt, maxDebtRatio: PROTOTYPE_ASSUMPTIONS.maxDebtRatio });
    var budget = cc.calculateBudget({ capacity: capacity, apport: apport });
    return {
      income: income, existingDebt: existingDebt, apport: apport, durationYears: durationYears,
      rate: rate, capacity: capacity, maxPayment: maxPayment, budget: budget
    };
  }

  /* ---- Validation par étape (messages FR clairs) ------------------------- */
  function validateStep(step, data) {
    var errors = {};
    if (step === 1) {
      if (!data.projet) errors.projet = 'Sélectionnez votre type de projet.';
      if (!data.situation) errors.situation = 'Indiquez votre situation.';
    }
    if (step === 2) {
      var r1 = core.toNumber(data.income1);
      if (!core.isValidNumber(r1) || r1 <= 0) errors.income1 = 'Indiquez vos revenus mensuels nets.';
      if (data.couple) {
        var r2 = core.toNumber(data.income2);
        if (!core.isValidNumber(r2) || r2 < 0) errors.income2 = 'Indiquez les revenus du co-emprunteur (ou 0).';
      }
    }
    if (step === 3) {
      var deb = core.toNumber(data.existingDebt);
      if (data.existingDebt !== '' && data.existingDebt !== undefined && (!core.isValidNumber(deb) || deb < 0)) errors.existingDebt = 'Le montant des crédits doit être positif ou nul.';
      var ap = core.toNumber(data.apport);
      if (data.apport !== '' && data.apport !== undefined && (!core.isValidNumber(ap) || ap < 0)) errors.apport = 'L’apport doit être positif ou nul.';
      if (PROTOTYPE_ASSUMPTIONS.durations.indexOf(Number(data.durationYears)) === -1) errors.durationYears = 'Choisissez une durée.';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* ---- Tracking : buckets (aucun montant exact, aucune PII) -------------- */
  function budgetBucket(v) {
    if (!core.isValidNumber(v)) return 'na';
    if (v < 150000) return '<150k';
    if (v < 250000) return '150-250k';
    if (v < 350000) return '250-350k';
    if (v < 500000) return '350-500k';
    return '500k+';
  }

  /* ---- Debug : panneau visible uniquement si l'URL contient ?debug=1 ----- */
  function isDebug(search) {
    return /(?:^|[?&])debug=1(?:&|$)/.test(String(search || ''));
  }

  /* ---- Transport MOCK : ne contacte AUCUN serveur/API -------------------- */
  function makeMockTransport(sink) {
    return function (payload) {
      if (sink) sink.lastPayload = payload;   // observable pour les tests
      return Promise.resolve({ ok: true, mock: true });
    };
  }

  /* ========================================================================
   * init() — liaison DOM (navigateur uniquement, no-op en Node)
   * ===================================================================== */
  function init(opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    var debug = (opts.debug !== undefined) ? !!opts.debug
      : (typeof location !== 'undefined' ? isDebug(location.search) : false);
    var root = document.querySelector('.sim-root');
    if (!root) return null;
    // Panneau debug caché par défaut ; visible seulement avec ?debug=1
    var dbgPanel = root.querySelector('#sim-debug');
    if (dbgPanel) dbgPanel.hidden = !debug;

    var state = { step: 1, data: { situation: 'seul', couple: false, durationYears: 20 }, result: null, mockSink: {} };
    var mockTransport = makeMockTransport(state.mockSink);
    var steps = Array.prototype.slice.call(root.querySelectorAll('[data-step]'));
    var totalSteps = 4;

    function emit(ev, data) {
      ui.track(ev, data);
      if (debug) logDebug(ev, data);
    }
    function logDebug(ev, data) {
      var panel = root.querySelector('#sim-debug-log');
      if (panel) {
        var line = document.createElement('div');
        line.textContent = ev + ' ' + JSON.stringify(data || {});
        panel.appendChild(line);
      }
      if (root.dataLayer === undefined) { try { console.log('[track]', ev, data || {}); } catch (e) {} }
    }

    function readInputs() {
      var d = state.data;
      var q = function (sel) { var el = root.querySelector(sel); return el ? el.value : ''; };
      var checked = function (name) { var el = root.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; };
      d.projet = checked('projet') || d.projet;
      d.situation = checked('situation') || d.situation;
      d.couple = d.situation === 'deux';
      d.income1 = q('#f-income1');
      d.income2 = q('#f-income2');
      d.existingDebt = q('#f-debt');
      d.apport = q('#f-apport');
      var dur = checked('duration'); if (dur) d.durationYears = Number(dur);
      return d;
    }

    function showStep(n) {
      state.step = n;
      steps.forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
      var bar = root.querySelector('.sim-progress__bar');
      if (bar) ui.setProgress(bar, n, totalSteps);
      var ind = root.querySelector('#sim-step-indicator');
      if (ind) ind.textContent = 'Étape ' + Math.min(n, totalSteps) + ' sur ' + totalSteps;
      var firstField = steps[n - 1] && steps[n - 1].querySelector('input, button, [tabindex]');
      if (firstField && firstField.focus) { try { firstField.focus(); } catch (e) {} }
    }

    function showErrors(errors) {
      root.querySelectorAll('[data-err]').forEach(function (el) { ui.setState(el, 'idle', ''); });
      Object.keys(errors).forEach(function (k) {
        var el = root.querySelector('[data-err="' + k + '"]');
        if (el) ui.setState(el, 'error', errors[k]);
      });
    }

    function goNext() {
      readInputs();
      var v = validateStep(state.step, state.data);
      if (!v.ok) { showErrors(v.errors); return; }
      showErrors({});
      if (state.step === 3) { computeAndRender(); showStep(4); emit('simulation_completed', { projet: state.data.projet, duree: state.data.durationYears }); return; }
      if (state.step === 1 && state.step === 1) emit('simulation_started', { projet: state.data.projet });
      showStep(state.step + 1);
    }
    function goBack() { if (state.step > 1) showStep(state.step - 1); }

    function computeAndRender() {
      var res = computeResult(state.data);
      state.result = res;
      var set = function (sel, txt) { var el = root.querySelector(sel); if (el) el.textContent = txt; };
      set('#r-budget', ui.formatEuro(res.budget));
      set('#r-capacity', ui.formatEuro(res.capacity));
      set('#r-payment', ui.formatEuro(res.maxPayment) + ' / mois');
      set('#r-apport', ui.formatEuro(res.apport));
      set('#r-duration', res.durationYears + ' ans');
      set('#r-rate', ui.formatPercent(res.rate));
      emit('simulation_result', { bucket: budgetBucket(res.budget), duree: res.durationYears });
    }

    /* Navigation */
    root.querySelectorAll('[data-action="next"]').forEach(function (b) { b.addEventListener('click', goNext); });
    root.querySelectorAll('[data-action="back"]').forEach(function (b) { b.addEventListener('click', goBack); });

    /* CTA financement -> ouvre le lead */
    var ctaBtn = root.querySelector('[data-action="open-lead"]');
    if (ctaBtn) ctaBtn.addEventListener('click', function () {
      emit('financing_cta_clicked', { bucket: budgetBucket(state.result && state.result.budget) });
      var leadBlock = root.querySelector('#sim-lead');
      if (leadBlock) { leadBlock.hidden = false; leadBlock.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      var pre = root.querySelector('#f-projet-lead'); if (pre) pre.value = state.data.projet || '';
    });

    /* Soumission lead — MOCK uniquement */
    var leadForm = root.querySelector('#sim-lead-form');
    if (leadForm) leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = lead.buildLeadPayload({
        prenom: (root.querySelector('#f-prenom') || {}).value || '',
        email: (root.querySelector('#f-email') || {}).value || '',
        tel: (root.querySelector('#f-tel') || {}).value || '',
        situation: state.data.situation,
        service: 'credit',
        answers: [{ projet: state.data.projet }]
      });
      var msg = root.querySelector('#sim-lead-msg');
      lead.submitLead(payload, mockTransport).then(function () {
        emit('financing_lead_submitted', { bucket: budgetBucket(state.result && state.result.budget) });
        if (msg) ui.setState(msg, 'success', 'Merci. Votre demande test a bien été enregistrée dans le prototype. Aucune donnée n’a été envoyée.');
        leadForm.hidden = true;
      }).catch(function (err) {
        if (msg) ui.setState(msg, 'error', 'Vérifiez votre email et votre téléphone.');
      });
    });

    showStep(1);
    return { state: state, computeResult: computeResult };
  }

  return {
    PROTOTYPE_ASSUMPTIONS: PROTOTYPE_ASSUMPTIONS,
    computeResult: computeResult,
    validateStep: validateStep,
    budgetBucket: budgetBucket,
    isDebug: isDebug,
    makeMockTransport: makeMockTransport,
    init: init
  };
}));
