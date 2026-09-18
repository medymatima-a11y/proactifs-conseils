/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — prototype-mensualite.js  (CS-5B)
 * Adaptateur UI du simulateur de MENSUALITÉ (preview).
 *
 * ⚠ NE modifie AUCUN socle : s'appuie uniquement sur les primitives existantes
 *   SimCore / SimCalcCredit / SimRates / SimCreditPolicy / SimUI / SimLead.
 *   N'importe ni ne modifie prototype-capacity.js.
 *   Le taux personnalisé n'altère jamais ACTIVE_MARKET_REFERENCE.
 *   Aucun taux/valeur financière codé en dur (tout vient du moteur + référentiel).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./core.js'), require('./calc-credit.js'), require('./rates.js'),
      require('./credit-policy.js'), require('./ui.js'), require('./lead.js')
    );
  } else {
    root.PrototypeMensualite = factory(
      root.SimCore, root.SimCalcCredit, root.SimRates,
      root.SimCreditPolicy, root.SimUI, root.SimLead
    );
  }
}(typeof self !== 'undefined' ? self : this, function (core, calc, rates, policy, ui, lead) {
  'use strict';

  var ACTIVE = rates.ACTIVE_MARKET_REFERENCE;
  var PUBLIC_DURATIONS = policy.PROACTIFS_CREDIT_POLICY_V1.publicDurations; // [10,15,20,25]
  var MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  /* Label "septembre 2026" depuis effectiveMonth 'YYYY-MM' (helper local, ne réutilise pas prototype-capacity). */
  function marketMonthLabel(effectiveMonth) {
    if (typeof effectiveMonth !== 'string' || !/^\d{4}-\d{2}$/.test(effectiveMonth)) return '';
    var y = effectiveMonth.slice(0, 4), m = parseInt(effectiveMonth.slice(5, 7), 10);
    if (m < 1 || m > 12) return '';
    return MONTHS_FR[m - 1] + ' ' + y;
  }

  /* Bucket de montant pour l'analytics — JAMAIS le montant exact (pas de PII). */
  function amountBucket(principal) {
    if (!core.isValidNumber(principal) || principal <= 0) return 'na';
    if (principal < 150000) return 'lt_150k';
    if (principal < 250000) return '150_250k';
    if (principal < 350000) return '250_350k';
    if (principal < 500000) return '350_500k';
    return 'gte_500k';
  }

  /* Taux selon le mode. Mode custom -> valeur saisie ; sinon référentiel actif. */
  function resolveRate(rateMode, customRate, durationYears, reference) {
    if (rateMode === 'custom') return core.toNumber(customRate);
    return rates.getMarketRate(durationYears, reference || ACTIVE);
  }

  /* ---- Calcul principal (pur, testable) --------------------------------- */
  /* input : { principal, durationYears, rateMode:'proactifs'|'custom', customRate,
              insuranceKnown:bool, insuranceMonthly } */
  function computeMensualite(input) {
    input = input || {};
    var principal = core.toNumber(input.principal);
    var years = core.toNumber(input.durationYears);
    var rateMode = input.rateMode === 'custom' ? 'custom' : 'proactifs';
    var rate = resolveRate(rateMode, input.customRate, years, ACTIVE);
    var months = core.monthsFromYears(years);

    var paymentHA = calc.calculateMonthlyPayment({ principal: principal, annualRatePct: rate, durationYears: years });
    var interest = calc.calculateCreditCost({ principal: principal, annualRatePct: rate, durationYears: years });
    if (!core.isValidNumber(paymentHA)) return { valid: false };

    // Arrondis cohérents (§12) : mensualités à l'euro ; les totaux dérivent des
    // mensualités arrondies pour rester cohérents avec l'affichage.
    var insKnown = input.insuranceKnown === true;
    var insMonthly = insKnown ? core.clampMin(core.toNumber(input.insuranceMonthly) || 0, 0) : 0;
    var paymentHA_r = core.round(paymentHA, 0);
    var insMonthly_r = core.round(insMonthly, 0);
    var paymentTotal_r = paymentHA_r + insMonthly_r;          // exact à l'écran
    var totalHA_r = paymentHA_r * months;                     // total remboursé hors assurance
    var insTotal_r = insMonthly_r * months;
    var totalWithInsurance_r = totalHA_r + insTotal_r;
    // Intérêts affichés dérivés du total arrondi (cohérence à l'écran : capital + intérêts = total).
    // Égal à calculateCreditCost() à l'arrondi de la mensualité près (creditCostRaw conservé pour contrôle).
    var interest_r = core.clampMin(totalHA_r - principal, 0);
    var creditCostRaw = core.round(interest, 0);

    return {
      valid: true,
      principal: principal,
      durationYears: years,
      months: months,
      rate: rate,
      rateMode: rateMode,
      referenceUsed: rateMode === 'custom' ? null : 'ACTIVE_MARKET_REFERENCE',
      marketLabel: marketMonthLabel(ACTIVE.effectiveMonth),
      paymentHA: paymentHA_r,
      interest: interest_r,
      creditCostRaw: creditCostRaw,
      totalHA: totalHA_r,
      insuranceKnown: insKnown,
      insuranceMonthly: insMonthly_r,
      insuranceTotal: insTotal_r,
      paymentTotal: paymentTotal_r,
      totalWithInsurance: totalWithInsurance_r,
      amountBucket: amountBucket(principal)
    };
  }

  /* ---- Comparateur de durées (pur) -------------------------------------- */
  /* TOUJOURS taux indicatifs Proactifs + HORS assurance (§15/§16). */
  function compareDurations(principal, durations, reference) {
    reference = reference || ACTIVE;
    durations = durations || PUBLIC_DURATIONS;
    principal = core.toNumber(principal);
    return durations.map(function (y) {
      var rate = rates.getMarketRate(y, reference);
      var payment = calc.calculateMonthlyPayment({ principal: principal, annualRatePct: rate, durationYears: y });
      var interest = calc.calculateCreditCost({ principal: principal, annualRatePct: rate, durationYears: y });
      var months = core.monthsFromYears(y);
      return {
        durationYears: y,
        rate: rate,
        payment: core.round(payment, 0),
        interest: core.round(interest, 0),
        total: core.round(core.round(payment, 0) * months, 0)
      };
    });
  }

  /* ---- Validation ------------------------------------------------------- */
  function validate(input) {
    var errors = {};
    var principal = core.toNumber(input.principal);
    if (!core.isValidNumber(principal) || principal <= 0) errors.principal = 'Indiquez un montant à emprunter valide (supérieur à 0).';
    if (!core.isValidNumber(core.toNumber(input.durationYears)) || PUBLIC_DURATIONS.indexOf(core.toNumber(input.durationYears)) === -1) errors.duration = 'Choisissez une durée.';
    if (input.rateMode === 'custom') {
      var cr = core.toNumber(input.customRate);
      if (!core.isValidNumber(cr) || cr <= 0 || cr > 25) errors.customRate = 'Indiquez un taux annuel valide (entre 0 et 25 %).';
    }
    if (input.insuranceKnown === true) {
      var ins = core.toNumber(input.insuranceMonthly);
      if (!core.isValidNumber(ins) || ins < 0) errors.insurance = 'Indiquez un coût d’assurance mensuel valide.';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* ---- init() : câblage DOM (navigateur) -------------------------------- */
  function init(opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    var root = document.querySelector('.men-root');
    if (!root) return null;
    var mockSink = {};
    var mockTransport = function (payload) { mockSink.lastPayload = payload; return Promise.resolve({ ok: true, mock: true }); };
    var leadTransport = (typeof opts.leadTransport === 'function') ? opts.leadTransport : mockTransport;
    var leadSuccessMsg = opts.leadSuccessMessage
      || 'Prototype — aucune donnée envoyée. Votre demande test a bien été enregistrée localement.';

    var startedOnce = false;
    function emit(ev, data) {
      data = data || {}; data.simulator_type = 'monthly_payment';
      ui.track(ev, data);
    }
    function q(sel) { var el = root.querySelector(sel); return el ? el.value : ''; }
    function checked(name) { var el = root.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
    function show(sel, on) { var el = root.querySelector(sel); if (el) el.hidden = !on; }
    function txt(sel, v) { var el = root.querySelector(sel); if (el) el.textContent = v; }

    function readInput() {
      return {
        principal: q('#m-amount'),
        durationYears: checked('m-duration'),
        rateMode: checked('m-rate-mode') === 'custom' ? 'custom' : 'proactifs',
        customRate: q('#m-custom-rate'),
        insuranceKnown: checked('m-ins') === 'oui',
        insuranceMonthly: q('#m-ins-amount')
      };
    }
    function syncConditional() {
      show('#m-custom-rate-wrap', checked('m-rate-mode') === 'custom');
      show('#m-ins-amount-wrap', checked('m-ins') === 'oui');
    }
    function markStarted() {
      if (!startedOnce) { startedOnce = true; emit('simulation_started', {}); }
    }
    function showErrors(errors) {
      root.querySelectorAll('[data-err]').forEach(function (el) { ui.setState(el, 'idle', ''); });
      Object.keys(errors).forEach(function (k) {
        var el = root.querySelector('[data-err="' + k + '"]');
        if (el) ui.setState(el, 'error', errors[k]);
      });
    }

    function render(res) {
      var known = res.insuranceKnown;
      // Valeur dominante : mensualité totale si assurance connue, sinon HA.
      txt('#m-r-headline-label', known ? 'Votre mensualité totale estimée' : 'Votre mensualité estimée (hors assurance)');
      txt('#m-r-headline', ui.formatEuro(known ? res.paymentTotal : res.paymentHA) + ' / mois');
      // Détail assurance
      show('#m-r-ins-detail', known);
      show('#m-r-ins-none', !known);
      if (known) {
        txt('#m-r-payment-ha', ui.formatEuro(res.paymentHA));
        txt('#m-r-ins-monthly', ui.formatEuro(res.insuranceMonthly) + ' / mois');
        txt('#m-r-payment-total', ui.formatEuro(res.paymentTotal) + ' / mois');
      }
      // Taux : transparence référentiel vs saisi (§14)
      if (res.rateMode === 'custom') {
        txt('#m-r-rate-label', 'Taux renseigné');
        txt('#m-r-rate-ref', 'Taux que vous avez renseigné — hors assurance');
      } else {
        txt('#m-r-rate-label', 'Taux indicatif Proactifs');
        txt('#m-r-rate-ref', 'Référence ' + res.marketLabel + ' · hors assurance');
      }
      txt('#m-r-rate', ui.formatPercent(res.rate));
      // Secondaires
      txt('#m-r-capital', ui.formatEuro(res.principal));
      txt('#m-r-duration', res.durationYears + ' ans');
      txt('#m-r-interest', ui.formatEuro(res.interest));
      txt('#m-r-total', ui.formatEuro(known ? res.totalWithInsurance : res.totalHA));
      txt('#m-r-total-label', known ? 'Montant total remboursé (avec assurance)' : 'Montant total remboursé');
    }

    function renderComparator(principal) {
      var wrap = root.querySelector('#m-compare-rows');
      if (!wrap) return;
      wrap.innerHTML = '';
      var rows = compareDurations(principal, PUBLIC_DURATIONS, ACTIVE);
      rows.forEach(function (r) {
        var div = document.createElement('div');
        div.className = 'men-comp-row';
        div.innerHTML =
          '<div class="men-comp-dur">' + r.durationYears + ' ans</div>' +
          '<div class="men-comp-pay"><span class="nb">' + ui.formatEuro(r.payment) + '</span> <span>/ mois</span></div>' +
          '<div class="men-comp-rate"><span class="nb">' + ui.formatPercent(r.rate) + '</span></div>' +
          '<div class="men-comp-int"><span class="nb">' + ui.formatEuro(r.interest) + '</span></div>';
        wrap.appendChild(div);
      });
    }

    var form = root.querySelector('#m-form');
    var resultBlock = root.querySelector('#m-result');
    var compareBlock = root.querySelector('#m-compare');

    root.addEventListener('change', function (e) {
      if (e.target && e.target.name) { markStarted(); syncConditional(); }
    });
    root.querySelector('#m-amount') && root.querySelector('#m-amount').addEventListener('input', markStarted);

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      markStarted();
      var input = readInput();
      var v = validate(input);
      if (!v.ok) { showErrors(v.errors); return; }
      showErrors({});
      var res = computeMensualite(input);
      if (!res.valid) { return; }
      render(res);
      renderComparator(res.principal);
      if (resultBlock) resultBlock.hidden = false;
      if (compareBlock) compareBlock.hidden = false;
      emit('simulation_completed', { duree: res.durationYears, rate_mode: res.rateMode });
      emit('simulation_result', { bucket: res.amountBucket, duree: res.durationYears, rate_mode: res.rateMode, assurance: res.insuranceKnown ? 'connue' : 'inconnue' });
      if (resultBlock && resultBlock.scrollIntoView) { try { resultBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e2) {} }
    });

    // CTA financement -> ouvre le lead
    var ctaBtn = root.querySelector('[data-action="open-lead"]');
    if (ctaBtn) ctaBtn.addEventListener('click', function () {
      emit('financing_cta_clicked', {});
      var leadBlock = root.querySelector('#m-lead');
      if (leadBlock) { leadBlock.hidden = false; if (leadBlock.scrollIntoView) { try { leadBlock.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } }
    });

    // Lead — transport injecté (mock en preview), source = simulateur_mensualite_credit
    var leadForm = root.querySelector('#m-lead-form');
    if (leadForm) leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (leadForm.getAttribute('data-submitting') === '1') return;
      var payload = lead.buildLeadPayload({
        prenom: (root.querySelector('#m-lead-prenom') || {}).value || '',
        email: (root.querySelector('#m-lead-email') || {}).value || '',
        tel: (root.querySelector('#m-lead-tel') || {}).value || '',
        service: 'credit',
        answers: [{ source: 'simulateur_mensualite_credit' }]
      });
      var msg = root.querySelector('#m-lead-msg');
      var submitBtn = leadForm.querySelector('[type="submit"]');
      leadForm.setAttribute('data-submitting', '1');
      if (submitBtn) submitBtn.disabled = true;
      if (msg) ui.setState(msg, 'idle', '');
      lead.submitLead(payload, leadTransport).then(function () {
        emit('financing_lead_submitted', {});
        if (msg) ui.setState(msg, 'success', leadSuccessMsg);
        leadForm.hidden = true;
      }).catch(function () {
        leadForm.setAttribute('data-submitting', '0');
        if (submitBtn) submitBtn.disabled = false;
        if (msg) ui.setState(msg, 'error', 'Une erreur est survenue. Vérifiez votre email et votre téléphone, puis réessayez.');
      });
    });

    syncConditional();
    return { state: { mockSink: mockSink } };
  }

  return {
    marketMonthLabel: marketMonthLabel,
    amountBucket: amountBucket,
    resolveRate: resolveRate,
    computeMensualite: computeMensualite,
    compareDurations: compareDurations,
    validate: validate,
    init: init,
    PUBLIC_DURATIONS: PUBLIC_DURATIONS
  };
}));
