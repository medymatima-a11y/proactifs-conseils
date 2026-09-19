/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — prototype-endettement.js  (CS-6B)
 * Adaptateur UI du simulateur de TAUX D'ENDETTEMENT (preview).
 *
 * ⚠ NE modifie AUCUN socle : s'appuie uniquement sur les primitives existantes
 *   SimCore / SimCalcCredit / SimCreditPolicy / SimUI / SimLead.
 *   N'importe ni ne modifie prototype-capacity.js / prototype-mensualite.js.
 *   Aucun taux/valeur métier codé en dur : maxDebtRatio (35 %) et
 *   rentalIncomeRetention (70 %) sont LUS depuis PROACTIFS_CREDIT_POLICY_V1.
 *   Résultat strictement NEUTRE : jamais de verdict bancaire (éligible,
 *   finançable, accepté, etc.). Le 35 % est un REPÈRE d'affichage.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./core.js'), require('./calc-credit.js'),
      require('./credit-policy.js'), require('./ui.js'), require('./lead.js')
    );
  } else {
    root.PrototypeEndettement = factory(
      root.SimCore, root.SimCalcCredit,
      root.SimCreditPolicy, root.SimUI, root.SimLead
    );
  }
}(typeof self !== 'undefined' ? self : this, function (core, calc, policy, ui, lead) {
  'use strict';

  var POLICY = policy.PROACTIFS_CREDIT_POLICY_V1;
  var MAX_DEBT_RATIO = POLICY.maxDebtRatio;               // 0.35 (repère), lu policy
  var RENTAL_RETENTION = POLICY.rentalIncomeRetention;    // 0.70, lu policy

  /* Tolérance d'affichage UNIQUEMENT (ne modifie ni la policy ni le calcul).
     Sert à choisir la phrase sous / autour / au-dessus autour du repère,
     pour éviter une bascule rédactionnelle artificielle due aux arrondis. */
  var REFERENCE_DISPLAY_TOLERANCE_POINTS = 0.2;

  /* Normalise un montant mensuel : vide/invalide/négatif -> 0 (charge/revenu
     optionnel), sauf pour un champ requis traité par validate(). */
  function money(v) {
    var n = core.toNumber(v);
    return core.isValidNumber(n) ? core.clampMin(n, 0) : 0;
  }

  /* ---- Agrégations (pures) ---------------------------------------------- */
  /* Revenus retenus = nets foyer + co-emprunteur (100 %) + locatifs × 70 %.
     Les "autres revenus" NE sont PAS retenus automatiquement (revue manuelle). */
  function retainedIncome(input) {
    var net = money(input.income1);
    var co = input.couple ? money(input.income2) : 0;
    var rental = money(input.rentalIncome) * RENTAL_RETENTION;
    return net + co + rental;
  }

  /* Charges retenues = crédits existants + pensions/charges + nouvelle
     mensualité envisagée + éventuel loyer restant à payer. */
  function retainedCharges(input) {
    return money(input.existingCredits)
      + money(input.pensions)
      + money(input.newPayment)
      + money(input.remainingRent);
  }

  /* Zone d'interprétation par rapport au repère, avec tolérance d'affichage. */
  function referenceZone(pct, referencePct) {
    var tol = REFERENCE_DISPLAY_TOLERANCE_POINTS;
    if (pct < referencePct - tol) return 'below';
    if (pct > referencePct + tol) return 'above';
    return 'around';
  }

  function resultBucket(zone) {
    if (zone === 'below') return 'below_reference';
    if (zone === 'above') return 'above_reference';
    return 'around_reference';
  }

  /* ---- Calcul principal (pur, testable) --------------------------------- */
  /* input : { income1, couple:bool, income2, rentalIncome, otherIncome,
              existingCredits, pensions, newPayment, remainingRent } */
  function computeDebtRatio(input) {
    input = input || {};
    var income = retainedIncome(input);
    var charges = retainedCharges(input);

    // Le moteur partagé renvoie NaN si income <= 0 : on ne l'affiche jamais.
    var ratio = calc.calculateDebtRatio({ payment: charges, income: income });
    if (!core.isValidNumber(ratio)) return { valid: false };

    var pct = core.round(ratio * 100, 1);
    var referencePct = core.round(MAX_DEBT_RATIO * 100, 1);   // 35.0, depuis policy
    var zone = referenceZone(pct, referencePct);

    return {
      valid: true,
      income: core.round(income, 0),
      charges: core.round(charges, 0),
      ratio: ratio,
      pct: pct,
      referencePct: referencePct,
      referenceRatio: MAX_DEBT_RATIO,
      zone: zone,
      bucket: resultBucket(zone),
      rentalUsed: money(input.rentalIncome) > 0,
      rentalRetention: RENTAL_RETENTION,
      otherIncomePresent: money(input.otherIncome) > 0,
      newPaymentIncluded: money(input.newPayment) > 0,
      remainingRentIncluded: money(input.remainingRent) > 0
    };
  }

  /* ---- Validation ------------------------------------------------------- */
  /* Revenus nets foyer requis (> 0). Le reste est optionnel (>= 0). */
  function validate(input) {
    var errors = {};
    var net = core.toNumber(input.income1);
    if (!core.isValidNumber(net) || net <= 0) errors.income1 = 'Indiquez vos revenus mensuels nets (supérieurs à 0).';
    if (input.couple) {
      var co = core.toNumber(input.income2);
      if (input.income2 !== '' && input.income2 !== undefined && input.income2 !== null && (!core.isValidNumber(co) || co < 0)) {
        errors.income2 = 'Indiquez un revenu co-emprunteur valide.';
      }
    }
    // Champs optionnels : une valeur saisie négative ou non numérique est refusée.
    [['rentalIncome', 'rental'], ['otherIncome', 'other'],
     ['existingCredits', 'existing'], ['pensions', 'pensions'],
     ['newPayment', 'newpayment'], ['remainingRent', 'remaining']].forEach(function (pair) {
      var raw = input[pair[0]];
      if (raw === '' || raw === undefined || raw === null) return;
      var n = core.toNumber(raw);
      if (!core.isValidNumber(n) || n < 0) errors[pair[1]] = 'Indiquez un montant valide (0 ou plus).';
    });
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* Phrase d'interprétation NEUTRE (jamais un verdict bancaire). */
  var INTERPRETATIONS = {
    below: 'Votre taux estimé se situe sous le repère utilisé dans cette simulation.',
    around: 'Votre taux estimé se situe autour du repère utilisé dans cette simulation.',
    above: 'Votre taux estimé dépasse le repère utilisé dans cette simulation.'
  };
  function interpretation(zone) { return INTERPRETATIONS[zone] || INTERPRETATIONS.around; }

  /* ---- init() : câblage DOM (navigateur) -------------------------------- */
  function init(opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    var root = document.querySelector('.end-root');
    if (!root) return null;
    var mockSink = {};
    var mockTransport = function (payload) { mockSink.lastPayload = payload; return Promise.resolve({ ok: true, mock: true }); };
    var leadTransport = (typeof opts.leadTransport === 'function') ? opts.leadTransport : mockTransport;
    var leadSuccessMsg = opts.leadSuccessMessage
      || 'Prototype — aucune donnée envoyée. Votre demande test a bien été enregistrée localement.';

    var startedOnce = false;
    function emit(ev, data) { data = data || {}; data.simulator_type = 'debt_ratio'; ui.track(ev, data); }
    function q(sel) { var el = root.querySelector(sel); return el ? el.value : ''; }
    function checked(name) { var el = root.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
    function show(sel, on) { var el = root.querySelector(sel); if (el) el.hidden = !on; }
    function txt(sel, v) { var el = root.querySelector(sel); if (el) el.textContent = v; }

    function readInput() {
      return {
        income1: q('#end-income1'),
        couple: checked('end-situation') === 'deux',
        income2: q('#end-income2'),
        rentalIncome: q('#end-rental'),
        otherIncome: q('#end-other'),
        existingCredits: q('#end-existing'),
        pensions: q('#end-pensions'),
        newPayment: q('#end-newpayment'),
        remainingRent: q('#end-remaining')
      };
    }
    function syncConditional() { show('#end-income2-wrap', checked('end-situation') === 'deux'); }
    function markStarted() { if (!startedOnce) { startedOnce = true; emit('simulation_started', {}); } }
    function showErrors(errors) {
      root.querySelectorAll('[data-err]').forEach(function (el) { ui.setState(el, 'idle', ''); });
      Object.keys(errors).forEach(function (k) {
        var el = root.querySelector('[data-err="' + k + '"]');
        if (el) ui.setState(el, 'error', errors[k]);
      });
    }

    function render(res) {
      txt('#end-r-pct', ui.formatPercent(res.pct, 1));
      txt('#end-r-income', ui.formatEuro(res.income));
      txt('#end-r-charges', ui.formatEuro(res.charges));
      txt('#end-r-reference', ui.formatPercent(res.referencePct, 0));
      txt('#end-r-interpretation', interpretation(res.zone));
      show('#end-r-rental-warn', res.rentalUsed);
      if (res.rentalUsed) {
        txt('#end-r-rental-warn', 'Hypothèse de simulation : ' + ui.formatPercent(res.rentalRetention * 100, 0) + ' des revenus locatifs sont retenus.');
      }
      show('#end-r-other-warn', res.otherIncomePresent);
    }

    var form = root.querySelector('#end-form');
    var resultBlock = root.querySelector('#end-result');

    root.addEventListener('change', function (e) { if (e.target && e.target.name) { markStarted(); syncConditional(); } });
    var amt = root.querySelector('#end-income1');
    if (amt) amt.addEventListener('input', markStarted);

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      markStarted();
      var input = readInput();
      var v = validate(input);
      if (!v.ok) { showErrors(v.errors); return; }
      showErrors({});
      var res = computeDebtRatio(input);
      if (!res.valid) {
        showErrors({ income1: 'Indiquez vos revenus mensuels nets (supérieurs à 0).' });
        return;
      }
      render(res);
      if (resultBlock) resultBlock.hidden = false;
      emit('simulation_completed', { couple: input.couple ? 'oui' : 'non' });
      emit('simulation_result', { bucket: res.bucket });   // JAMAIS de montant/taux exact
      if (resultBlock && resultBlock.scrollIntoView) { try { resultBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e2) {} }
    });

    // CTA financement -> ouvre le lead
    var ctaBtn = root.querySelector('[data-action="open-lead"]');
    if (ctaBtn) ctaBtn.addEventListener('click', function () {
      emit('financing_cta_clicked', {});
      var leadBlock = root.querySelector('#end-lead');
      if (leadBlock) { leadBlock.hidden = false; if (leadBlock.scrollIntoView) { try { leadBlock.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } }
    });

    // Lead — transport injecté (mock en preview), source = simulateur_taux_endettement.
    // Aucune donnée financière de la simulation n'est transmise.
    var leadForm = root.querySelector('#end-lead-form');
    if (leadForm) leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (leadForm.getAttribute('data-submitting') === '1') return;
      var payload = lead.buildLeadPayload({
        prenom: (root.querySelector('#end-lead-prenom') || {}).value || '',
        email: (root.querySelector('#end-lead-email') || {}).value || '',
        tel: (root.querySelector('#end-lead-tel') || {}).value || '',
        service: 'credit',
        answers: [{ source: 'simulateur_taux_endettement' }]
      });
      var msg = root.querySelector('#end-lead-msg');
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
    MAX_DEBT_RATIO: MAX_DEBT_RATIO,
    RENTAL_RETENTION: RENTAL_RETENTION,
    REFERENCE_DISPLAY_TOLERANCE_POINTS: REFERENCE_DISPLAY_TOLERANCE_POINTS,
    retainedIncome: retainedIncome,
    retainedCharges: retainedCharges,
    referenceZone: referenceZone,
    resultBucket: resultBucket,
    interpretation: interpretation,
    computeDebtRatio: computeDebtRatio,
    validate: validate,
    init: init
  };
}));
