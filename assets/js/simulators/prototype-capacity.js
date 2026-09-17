/* ==========================================================================
 * Proactifs Conseils — Prototype CS-2 / CS-4A — prototype-capacity.js
 * Contrôleur du prototype "capacité d'emprunt V2".
 *
 * CS-2  : parcours UX, transport lead mock, tracking sans PII.
 * CS-4A : intégration fonctionnelle réelle —
 *   • politique métier CS-3  (credit-policy.js / evaluateFinancingInputs)
 *   • référentiel marché CS-3.5 (rates.js / ACTIVE_MARKET_REFERENCE + getMarketRate)
 *   • moteur mathématique CS-1 (core.js / calc-credit.js)
 * Aucune formule recopiée, aucun second moteur. La couche de mapping UX
 * (libellés client) est indépendante du moteur métier.
 *
 * NB : computeResult() (voie LEGACY historique) est CONSERVÉE inchangée pour
 * la parité CS-2. La voie VISIBLE du prototype V2 est computeCapacityV2()
 * (référentiel marché), qui n'utilise JAMAIS LEGACY_REFERENCE.
 * UMD : logique pure testable en Node + init DOM (navigateur).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./core.js'), require('./rates.js'), require('./calc-credit.js'),
      require('./credit-policy.js'), require('./lead.js'), require('./ui.js')
    );
  } else {
    root.PrototypeCapacity = factory(
      root.SimCore, root.SimRates, root.SimCalcCredit,
      root.SimCreditPolicy, root.SimLead, root.SimUI
    );
  }
}(typeof self !== 'undefined' ? self : this, function (core, rates, cc, policy, lead, ui) {
  'use strict';

  /* =====================================================================
   * CS-2 (LEGACY) — CONSERVÉ INCHANGÉ pour la parité historique
   * =================================================================== */
  var PROTOTYPE_ASSUMPTIONS = {
    maxDebtRatio: 0.35,
    rateGrid: rates.LEGACY_REFERENCE,   // référence technique legacy — parité uniquement
    durations: [10, 15, 20, 25, 30]
  };

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

  /* =====================================================================
   * CS-4A — VOIE MARCHÉ (visible). Utilise CS-3 + CS-3.5 + CS-1.
   * =================================================================== */

  /* Mois FR pour dériver "septembre 2026" depuis effectiveMonth 'YYYY-MM'. */
  var MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function marketMonthLabel(effectiveMonth) {
    if (typeof effectiveMonth !== 'string' || !/^\d{4}-\d{2}$/.test(effectiveMonth)) return '';
    var y = effectiveMonth.slice(0, 4), m = parseInt(effectiveMonth.slice(5, 7), 10);
    if (m < 1 || m > 12) return '';
    return MONTHS_FR[m - 1] + ' ' + y;
  }

  /* Adapter UI -> entrée politique CS-3 (pur, testable). */
  function buildFinancingInput(d) {
    d = d || {};
    return {
      primaryIncome: d.income1,
      coBorrowerIncome: (d.situation === 'deux') ? d.income2 : 0,
      existingRentalIncome: (d.hasRental === 'oui') ? d.rentalExisting : 0,
      projectedRentalIncome: (d.projet === 'investissement-locatif') ? d.projectedRental : 0,
      otherStableIncome: d.otherIncome,
      existingLoanPayments: d.existingDebt,
      remainingHousingRent: (d.remainTenant === 'oui') ? d.remainingRent : 0,
      monthlyInsurance: (d.knowsInsurance === 'oui') ? d.insurance : undefined,
      existingLoansEndingSoon: !!d.loanEndingSoon
    };
  }

  /* Mapping UX : reliability interne -> titre + texte client (aucun code brut). */
  function mapReliability(reliability, cause) {
    if (reliability === policy.RELIABILITY.MANUAL_REVIEW) {
      return {
        title: 'Votre situation mérite une étude personnalisée.',
        text: 'Certains revenus ou éléments de votre financement nécessitent une analyse plus précise.'
      };
    }
    if (reliability === policy.RELIABILITY.PARTIAL) {
      var t = 'Certains éléments, comme l’assurance emprunteur, peuvent modifier votre capacité réelle.';
      if (cause && cause !== 'INSURANCE_NOT_INCLUDED') {
        t = 'Certains éléments de votre financement peuvent modifier votre capacité réelle.';
      }
      return { title: 'Cette estimation peut être affinée.', text: t };
    }
    return {
      title: 'Votre première estimation est prête.',
      text: 'Nous pouvons maintenant étudier les conditions de financement adaptées à votre projet.'
    };
  }

  /* Mapping UX : flags métier -> messages client (couche indépendante). */
  var FLAG_MESSAGES = {
    INSURANCE_NOT_INCLUDED: 'L’assurance emprunteur n’a pas été renseignée : elle n’est pas incluse dans cette estimation.',
    OTHER_INCOME_REQUIRES_REVIEW: 'Vos autres revenus n’ont pas été intégrés automatiquement et méritent une étude personnalisée.',
    EXISTING_LOAN_ENDING_SOON_REVIEW: 'Un crédit en cours proche de son terme pourra être réexaminé lors de l’étude.',
    RENTAL_INCOME_ASSUMPTION_USED: 'Une hypothèse prudente a été appliquée à vos revenus locatifs.',
    REMAINING_RENT_INCLUDED: 'Le loyer que vous continuerez à payer a été pris en compte dans vos charges.',
    PROJECTED_RENTAL_INCOME_USED: 'Le loyer futur estimé de votre investissement a été pris en compte selon une hypothèse prudente.'
  };
  function mapReviewFlags(flags) {
    if (!Array.isArray(flags)) return [];
    return flags.map(function (f) { return FLAG_MESSAGES[f]; }).filter(Boolean);
  }

  /* Mapping UX : fraîcheur du référentiel -> niveau + message. */
  function describeFreshness(state) {
    if (state === rates.MARKET_FRESHNESS.STALE) {
      return { level: 'warn', message: 'Le taux de référence de cette simulation doit être actualisé.' };
    }
    if (state === rates.MARKET_FRESHNESS.REVIEW_DUE) {
      return { level: 'info', message: 'Le taux de référence de cette simulation sera prochainement réactualisé.' };
    }
    return { level: 'ok', message: '' };
  }

  /* Calcul V2 : politique CS-3 + taux marché CS-3.5 + primitif CS-1.
     opts.asOfDate : date de référence pour la fraîcheur (défaut : maintenant). */
  function computeCapacityV2(d, opts) {
    opts = opts || {};
    var input = buildFinancingInput(d);
    var evalr = policy.evaluateFinancingInputs(input);

    var durationYears = Number(d.durationYears);
    var ref = rates.ACTIVE_MARKET_REFERENCE;
    var rate = rates.getMarketRate(durationYears, ref);
    var rateSupported = (typeof rate === 'number');
    var rateNum = rateSupported ? rate : NaN;

    var months = core.monthsFromYears(durationYears);
    var capacity = rateSupported
      ? core.round(core.principalFromPayment({ payment: evalr.availableMonthlyPayment, annualRatePct: rateNum, months: months }), 0)
      : NaN;

    var apport = policyAmount(d.apport);
    var budget = core.isValidNumber(capacity) ? capacity + apport : NaN;

    var fresh = rates.getMarketReferenceFreshness(ref, opts.asOfDate);

    var insuranceCause = evalr.reviewFlags.indexOf(policy.REVIEW_FLAGS.INSURANCE_NOT_INCLUDED) !== -1
      ? 'INSURANCE_NOT_INCLUDED' : null;

    return {
      /* données moteur (interne) */
      availableMonthlyPayment: evalr.availableMonthlyPayment,
      capacity: capacity,
      budget: budget,
      apport: apport,
      durationYears: durationYears,
      rate: rateNum,
      rateSupported: rateSupported,
      reliability: evalr.reliability,
      reviewFlags: evalr.reviewFlags,
      estimatedRemainingIncome: evalr.estimatedRemainingIncome,
      retainedIncome: evalr.retainedIncome,
      retainedCharges: evalr.retainedCharges,
      marketReferenceId: ref.id,
      effectiveMonth: ref.effectiveMonth,
      freshness: fresh,
      /* couche UX (client) */
      ux: {
        reliability: mapReliability(evalr.reliability, insuranceCause),
        flags: mapReviewFlags(evalr.reviewFlags),
        freshness: describeFreshness(fresh.state),
        marketLabel: marketMonthLabel(ref.effectiveMonth)
      }
    };
  }

  /* Salaire (revenu net mensuel) requis pour emprunter un montant donné.
     RÉUTILISE le moteur : CS-1 (monthlyPayment) + CS-3.5 (getMarketRate ACTIVE)
     + CS-3 (maxDebtRatio). Hypothèses : emprunteur seul, aucun crédit, pas de
     revenu locatif, assurance hors calcul, apport non utilisé pour le salaire.
     Aucune formule parallèle, aucune valeur codée en dur. */
  function calculateRequiredIncomeForLoan(args) {
    args = args || {};
    var loanAmount = policyAmount(args.loanAmount);
    var durationYears = Number(args.durationYears);
    var ref = rates.ACTIVE_MARKET_REFERENCE;
    var rate = rates.getMarketRate(durationYears, ref);
    if (typeof rate !== 'number') {
      return { supported: false, loanAmount: loanAmount, durationYears: durationYears };
    }
    var maxDebtRatio = core.isValidNumber(args.maxDebtRatio)
      ? args.maxDebtRatio : policy.PROACTIFS_CREDIT_POLICY_V1.maxDebtRatio;
    var months = core.monthsFromYears(durationYears);
    var payment = core.monthlyPayment({ principal: loanAmount, annualRatePct: rate, months: months });
    var requiredIncome = core.isValidNumber(payment) && maxDebtRatio > 0
      ? core.round(payment / maxDebtRatio, 0) : NaN;
    return {
      supported: true,
      loanAmount: loanAmount,
      durationYears: durationYears,
      rate: rate,
      maxDebtRatio: maxDebtRatio,
      requiredMonthlyPayment: core.isValidNumber(payment) ? core.round(payment, 0) : NaN,
      requiredMonthlyIncome: requiredIncome,
      effectiveMonth: ref.effectiveMonth,
      marketLabel: marketMonthLabel(ref.effectiveMonth)
    };
  }

  /* Normalisation montant (miroir de credit-policy.amount, pour apport UI). */
  function policyAmount(v) {
    if (v === undefined || v === null || v === '') return 0;
    var n = core.toNumber(v);
    return (core.isValidNumber(n) && n >= 0) ? n : 0;
  }

  /* =====================================================================
   * Validation par étape (CS-2 conservé) + validation V2
   * =================================================================== */
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

  /* Durées publiques V2 (marché) — 30 ans EXCLU. */
  var PUBLIC_DURATIONS = policy.PROACTIFS_CREDIT_POLICY_V1.publicDurations; // [10,15,20,25]

  /* Validation V2 des étapes 2/3 (revenus + situation financière). */
  function validateStepV2(step, d) {
    var errors = {};
    if (step === 1) {
      if (!d.projet) errors.projet = 'Sélectionnez votre type de projet.';
      if (!d.situation) errors.situation = 'Indiquez votre situation.';
    }
    if (step === 2) {
      var r1 = core.toNumber(d.income1);
      if (!core.isValidNumber(r1) || r1 <= 0) errors.income1 = 'Indiquez vos revenus mensuels nets.';
      if (d.situation === 'deux') {
        var r2 = core.toNumber(d.income2);
        if (!core.isValidNumber(r2) || r2 < 0) errors.income2 = 'Indiquez les revenus du co-emprunteur (ou 0).';
      }
      if (d.hasRental === 'oui') {
        var rr = core.toNumber(d.rentalExisting);
        if (!core.isValidNumber(rr) || rr < 0) errors.rentalExisting = 'Indiquez vos revenus locatifs mensuels (ou 0).';
      }
      if (d.projet === 'investissement-locatif' && d.projectedRental !== '' && d.projectedRental !== undefined) {
        var pr = core.toNumber(d.projectedRental);
        if (!core.isValidNumber(pr) || pr < 0) errors.projectedRental = 'Indiquez un loyer futur estimé valide.';
      }
    }
    if (step === 3) {
      var deb = core.toNumber(d.existingDebt);
      if (d.existingDebt !== '' && d.existingDebt !== undefined && (!core.isValidNumber(deb) || deb < 0)) errors.existingDebt = 'Le montant des crédits doit être positif ou nul.';
      var ap = core.toNumber(d.apport);
      if (d.apport !== '' && d.apport !== undefined && (!core.isValidNumber(ap) || ap < 0)) errors.apport = 'L’apport doit être positif ou nul.';
      if (PUBLIC_DURATIONS.indexOf(Number(d.durationYears)) === -1) errors.durationYears = 'Choisissez une durée.';
      if (d.remainTenant === 'oui') {
        var rt = core.toNumber(d.remainingRent);
        if (!core.isValidNumber(rt) || rt < 0) errors.remainingRent = 'Indiquez le loyer que vous continuerez à payer.';
      }
      if (d.knowsInsurance === 'oui') {
        var ins = core.toNumber(d.insurance);
        if (!core.isValidNumber(ins) || ins < 0) errors.insurance = 'Indiquez le coût mensuel estimé de l’assurance.';
      }
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

  function isDebug(search) {
    return /(?:^|[?&])debug=1(?:&|$)/.test(String(search || ''));
  }

  function makeMockTransport(sink) {
    return function (payload) {
      if (sink) sink.lastPayload = payload;   // observable pour les tests
      return Promise.resolve({ ok: true, mock: true });
    };
  }

  /* ========================================================================
   * init() — liaison DOM (navigateur uniquement, no-op en Node)
   * Wizard V2 branché sur computeCapacityV2().
   * ===================================================================== */
  function init(opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    var debug = (opts.debug !== undefined) ? !!opts.debug
      : (typeof location !== 'undefined' ? isDebug(location.search) : false);
    var root = document.querySelector('.sim-root');
    if (!root) return null;
    var dbgPanel = root.querySelector('#sim-debug');
    if (dbgPanel) dbgPanel.hidden = !debug;

    var state = {
      step: 1,
      data: { situation: 'seul', durationYears: 20, hasRental: 'non', remainTenant: 'non', knowsInsurance: 'non', loanEndingSoon: false },
      result: null, mockSink: {}
    };
    var mockTransport = makeMockTransport(state.mockSink);
    var steps = Array.prototype.slice.call(root.querySelectorAll('[data-step]'));
    var totalSteps = 4;

    function emit(ev, data) { ui.track(ev, data); if (debug) logDebug(ev, data); }
    function logDebug(ev, data) {
      var panel = root.querySelector('#sim-debug-log');
      if (panel) { var line = document.createElement('div'); line.textContent = ev + ' ' + JSON.stringify(data || {}); panel.appendChild(line); }
    }

    function q(sel) { var el = root.querySelector(sel); return el ? el.value : ''; }
    function checked(name) { var el = root.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
    function isChecked(id) { var el = root.querySelector('#' + id); return !!(el && el.checked); }

    function readInputs() {
      var d = state.data;
      d.projet = checked('projet') || d.projet;
      d.situation = checked('situation') || d.situation;
      d.income1 = q('#f-income1');
      d.income2 = q('#f-income2');
      d.hasRental = checked('hasRental') || d.hasRental;
      d.rentalExisting = q('#f-rental');
      d.projectedRental = q('#f-projrental');
      d.otherIncome = q('#f-other');
      d.existingDebt = q('#f-debt');
      d.apport = q('#f-apport');
      var dur = checked('duration'); if (dur) d.durationYears = Number(dur);
      d.remainTenant = checked('remainTenant') || d.remainTenant;
      d.remainingRent = q('#f-remrent');
      d.knowsInsurance = checked('knowsInsurance') || d.knowsInsurance;
      d.insurance = q('#f-insurance');
      d.loanEndingSoon = isChecked('f-ending');
      return d;
    }

    /* Affichage/masquage des zones conditionnelles + aria-expanded */
    function syncConditionals() {
      var d = state.data;
      toggle('#f-income2-wrap', d.situation === 'deux');
      toggle('#f-rental-wrap', d.hasRental === 'oui');
      toggle('#f-projrental-wrap', d.projet === 'investissement-locatif');
      toggle('#f-remrent-wrap', d.remainTenant === 'oui');
      toggle('#f-insurance-wrap', d.knowsInsurance === 'oui');
    }
    function toggle(sel, show) {
      var el = root.querySelector(sel); if (!el) return;
      el.hidden = !show;
      var host = el.getAttribute('data-aria-host');
      if (host) { var h = root.querySelector(host); if (h) h.setAttribute('aria-expanded', show ? 'true' : 'false'); }
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
      readInputs(); syncConditionals();
      var v = validateStepV2(state.step, state.data);
      if (!v.ok) { showErrors(v.errors); return; }
      showErrors({});
      if (state.step === 1) emit('simulation_started', { projet: state.data.projet });
      if (state.step === 3) { computeAndRender(); showStep(4); emit('simulation_completed', { projet: state.data.projet, duree: state.data.durationYears }); return; }
      showStep(state.step + 1);
    }
    function goBack() { if (state.step > 1) showStep(state.step - 1); }

    function setTxt(sel, txt) { var el = root.querySelector(sel); if (el) el.textContent = txt; }
    function setHtmlList(sel, items) {
      var el = root.querySelector(sel); if (!el) return;
      el.innerHTML = '';
      items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; el.appendChild(li); });
      el.hidden = items.length === 0;
    }

    function computeAndRender() {
      var res = computeCapacityV2(state.data);
      state.result = res;
      setTxt('#r-budget', ui.formatEuro(res.budget));
      setTxt('#r-capacity', ui.formatEuro(res.capacity));
      setTxt('#r-payment', ui.formatEuro(res.availableMonthlyPayment) + ' / mois');
      setTxt('#r-apport', ui.formatEuro(res.apport));
      setTxt('#r-duration', res.durationYears + ' ans');
      setTxt('#r-rate', ui.formatPercent(res.rate));
      // Référence dérivée de effectiveMonth (jamais codée en dur), + hors assurance
      setTxt('#r-rate-ref', 'Référence ' + res.ux.marketLabel + ' · hors assurance');
      // Titre + texte reliability (client)
      setTxt('#r-reliability-title', res.ux.reliability.title);
      setTxt('#r-reliability-text', res.ux.reliability.text);
      // Messages flags
      setHtmlList('#r-flags', res.ux.flags);
      // Fraîcheur
      var fresh = root.querySelector('#r-freshness');
      if (fresh) {
        if (res.ux.freshness.message) { fresh.textContent = res.ux.freshness.message; fresh.hidden = false; fresh.setAttribute('data-level', res.ux.freshness.level); }
        else { fresh.hidden = true; }
      }
      emit('simulation_result', { bucket: budgetBucket(res.budget), duree: res.durationYears, reliability: res.reliability, freshness: res.freshness.state });
      if (debug) {
        logDebug('debug_inputs', buildFinancingInput(state.data));
        logDebug('debug_retained', { income: res.retainedIncome.totalRetainedIncome, charges: res.retainedCharges.totalRetainedCharges, dispo: res.availableMonthlyPayment });
        logDebug('debug_flags', { flags: res.reviewFlags, reliability: res.reliability });
        logDebug('debug_market', { id: res.marketReferenceId, rate: res.rate, freshness: res.freshness.state });
      }
    }

    /* Navigation */
    root.querySelectorAll('[data-action="next"]').forEach(function (b) { b.addEventListener('click', goNext); });
    root.querySelectorAll('[data-action="back"]').forEach(function (b) { b.addEventListener('click', goBack); });

    /* Conditionnels : réagir aux changements */
    ['situation', 'hasRental', 'remainTenant', 'knowsInsurance'].forEach(function (name) {
      root.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
        r.addEventListener('change', function () { readInputs(); syncConditionals(); });
      });
    });
    root.querySelectorAll('input[name="projet"]').forEach(function (r) {
      r.addEventListener('change', function () { readInputs(); syncConditionals(); });
    });

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
        situation: state.data.situation, service: 'credit',
        answers: [{ projet: state.data.projet }]
      });
      var msg = root.querySelector('#sim-lead-msg');
      lead.submitLead(payload, mockTransport).then(function () {
        emit('financing_lead_submitted', { bucket: budgetBucket(state.result && state.result.budget) });
        if (msg) ui.setState(msg, 'success', 'Prototype — aucune donnée envoyée. Votre demande test a bien été enregistrée localement.');
        leadForm.hidden = true;
      }).catch(function () { if (msg) ui.setState(msg, 'error', 'Vérifiez votre email et votre téléphone.'); });
    });

    /* Accordéon « Comment avons-nous calculé cette estimation ? » (button + aria) */
    var accBtn = root.querySelector('#acc-btn');
    var accPanel = root.querySelector('#acc-panel');
    if (accBtn && accPanel) {
      accBtn.addEventListener('click', function () {
        var open = accBtn.getAttribute('aria-expanded') === 'true';
        accBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
        accPanel.hidden = open;
      });
    }

    syncConditionals();
    showStep(1);
    return { state: state, computeCapacityV2: computeCapacityV2 };
  }

  return {
    /* CS-2 (parité legacy — conservé) */
    PROTOTYPE_ASSUMPTIONS: PROTOTYPE_ASSUMPTIONS,
    computeResult: computeResult,
    validateStep: validateStep,
    budgetBucket: budgetBucket,
    isDebug: isDebug,
    makeMockTransport: makeMockTransport,
    init: init,
    /* CS-4A (voie marché) */
    PUBLIC_DURATIONS: PUBLIC_DURATIONS,
    buildFinancingInput: buildFinancingInput,
    computeCapacityV2: computeCapacityV2,
    calculateRequiredIncomeForLoan: calculateRequiredIncomeForLoan,
    validateStepV2: validateStepV2,
    mapReliability: mapReliability,
    mapReviewFlags: mapReviewFlags,
    describeFreshness: describeFreshness,
    marketMonthLabel: marketMonthLabel
  };
}));
