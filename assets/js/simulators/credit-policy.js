/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — credit-policy.js  (PHASE CS-3)
 * COUCHE MÉTIER FINANCEMENT PROACTIFS V1.
 *
 * Rôle : appliquer une POLITIQUE MÉTIER versionnée et testable PAR-DESSUS le
 * moteur mathématique CS-1 (core.js / calc-credit.js). Rétention des revenus,
 * prise en compte des charges, mensualité disponible, reste à vivre indicatif.
 *
 * INTERDIT ici : DOM, GA4/tracking, formulaire, Supabase, Brevo, réseau/fetch.
 * INTERDIT ici : tout verdict bancaire (APPROVED / DECLINED / ELIGIBLE / score).
 * Aucune nouvelle grille de taux n'est créée ici (LEGACY_REFERENCE inchangé).
 *
 * Dépendances internes CS-1 uniquement : core.js, calc-credit.js.
 * UMD : require() (Node) ou window.SimCreditPolicy (navigateur).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./calc-credit.js'));
  } else {
    root.SimCreditPolicy = factory(root.SimCore, root.SimCalcCredit);
  }
}(typeof self !== 'undefined' ? self : this, function (core, cc) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Utilitaires internes
   * ------------------------------------------------------------------ */

  /* Gel récursif : la politique est immuable une fois figée. */
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  /* Montant robuste : undefined/null/''/NaN/négatif/chaîne invalide -> 0.
     Accepte les formats FR ("1 200", "1200,50") via core.toNumber. */
  function amount(v) {
    if (v === undefined || v === null || v === '') return 0;
    var n = core.toNumber(v);
    if (!core.isValidNumber(n) || n < 0) return 0;
    return n;
  }

  /* Une valeur est "renseignée" si elle représente un nombre >= 0 exploitable. */
  function isProvided(v) {
    if (v === undefined || v === null || v === '') return false;
    var n = core.toNumber(v);
    return core.isValidNumber(n) && n >= 0;
  }

  /* Dédoublonnage en conservant l'ordre. */
  function dedupe(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Constantes de codes (jamais de verdict bancaire)
   * ------------------------------------------------------------------ */

  /* Fiabilité du résultat = niveau de confiance de la SIMULATION,
     PAS un score bancaire, PAS une probabilité d'accord. */
  var RELIABILITY = {
    STANDARD: 'STANDARD',            // données complètes et simples
    PARTIAL: 'PARTIAL',              // assurance emprunteur inconnue
    MANUAL_REVIEW: 'MANUAL_REVIEW'   // cas complexe -> revue conseiller
  };

  /* Drapeaux de revue : signalent un point à vérifier, sans jamais bloquer. */
  var REVIEW_FLAGS = {
    INSURANCE_NOT_INCLUDED: 'INSURANCE_NOT_INCLUDED',
    OTHER_INCOME_REQUIRES_REVIEW: 'OTHER_INCOME_REQUIRES_REVIEW',
    EXISTING_LOAN_ENDING_SOON_REVIEW: 'EXISTING_LOAN_ENDING_SOON_REVIEW',
    RENTAL_INCOME_ASSUMPTION_USED: 'RENTAL_INCOME_ASSUMPTION_USED',
    REMAINING_RENT_INCLUDED: 'REMAINING_RENT_INCLUDED',
    PROJECTED_RENTAL_INCOME_USED: 'PROJECTED_RENTAL_INCOME_USED'
  };

  /* Catégories de revenus reconnues par la politique V1. */
  var INCOME_CATEGORIES = {
    PRIMARY_INCOME: 'PRIMARY_INCOME',
    CO_BORROWER_INCOME: 'CO_BORROWER_INCOME',
    EXISTING_RENTAL_INCOME: 'EXISTING_RENTAL_INCOME',
    PROJECTED_RENTAL_INCOME: 'PROJECTED_RENTAL_INCOME',
    OTHER_STABLE_INCOME: 'OTHER_STABLE_INCOME'
  };

  /* Avertissements métier (codes + messages FR). */
  var WARNING_CODES = {
    NOT_A_BANK_DECISION: 'NOT_A_BANK_DECISION',
    MAX_DEBT_RATIO_REFERENCE: 'MAX_DEBT_RATIO_REFERENCE',
    RENTAL_INCOME_ASSUMPTION: 'RENTAL_INCOME_ASSUMPTION',
    INSURANCE_NOT_INCLUDED: 'INSURANCE_NOT_INCLUDED',
    OTHER_INCOME_MANUAL_REVIEW: 'OTHER_INCOME_MANUAL_REVIEW',
    EXISTING_LOAN_ENDING_SOON: 'EXISTING_LOAN_ENDING_SOON'
  };
  var WARNING_MESSAGES = {
    NOT_A_BANK_DECISION: 'Évaluation indicative Proactifs : ni accord, ni refus, ni score bancaire.',
    MAX_DEBT_RATIO_REFERENCE: 'Le taux d’endettement de 35 % est un standard de référence (HCSF), pas une limite d’accord automatique.',
    RENTAL_INCOME_ASSUMPTION: 'La rétention de 70 % des revenus locatifs est une hypothèse de simulation Proactifs, pas une règle réglementaire ni une exigence bancaire universelle.',
    INSURANCE_NOT_INCLUDED: 'Assurance emprunteur non renseignée : elle n’est pas incluse dans les charges. Résultat partiel.',
    OTHER_INCOME_MANUAL_REVIEW: 'Les autres revenus déclarés ne sont pas retenus automatiquement (revue manuelle nécessaire).',
    EXISTING_LOAN_ENDING_SOON: 'Un crédit en cours arriverait à échéance : les charges ne sont pas réduites automatiquement (revue manuelle).'
  };
  function warn(code) { return { code: code, message: WARNING_MESSAGES[code] }; }

  /* ------------------------------------------------------------------ *
   * PROACTIFS_CREDIT_POLICY_V1 — configuration métier versionnée & gelée
   * ------------------------------------------------------------------ */
  var PROACTIFS_CREDIT_POLICY_V1 = deepFreeze({
    id: 'PROACTIFS_CREDIT_POLICY_V1',
    version: '1.0.0',
    effectiveDate: '2026-09-17',
    status: 'INTERNAL_VALIDATION',   // en cours de validation métier, non publié

    /* Taux d'endettement de référence. Valeur numérique brute réutilisable ;
       le SENS de cette valeur est décrit dans meta (référence, pas limite). */
    maxDebtRatio: 0.35,

    /* Durées proposées au public. 30 ans est EXCLU du public mais reste dans
       CS-1 (parité). maxPublicDurationYears documente le plafond public. */
    publicDurations: [10, 15, 20, 25],
    excludedPublicDurations: [30],
    maxPublicDurationYears: 25,

    /* Rétention des revenus locatifs (décote 30 %). Valeur numérique brute ;
       son statut (hypothèse Proactifs, NON réglementaire) est dans meta. */
    rentalIncomeRetention: 0.70,

    /* Assurance emprunteur : fournie par l'utilisateur, sinon inconnue. */
    insuranceMode: 'USER_PROVIDED_OR_UNKNOWN',

    /* On inclut le loyer résiduel éventuel dans les charges (prudent). */
    includeRemainingRent: true,

    /* Catégories de revenus et règle de rétention associée. */
    incomeCategories: {
      PRIMARY_INCOME: { retentionRate: 1.0, automaticRetention: true },
      CO_BORROWER_INCOME: { retentionRate: 1.0, automaticRetention: true },
      EXISTING_RENTAL_INCOME: { retentionRate: 0.70, automaticRetention: true, assumption: 'PROACTIFS_SIMULATION_ASSUMPTION' },
      PROJECTED_RENTAL_INCOME: { retentionRate: 0.70, automaticRetention: true, assumption: 'PROACTIFS_SIMULATION_ASSUMPTION' },
      OTHER_STABLE_INCOME: { retentionRate: null, automaticRetention: false, warning: 'REQUIRES_MANUAL_REVIEW' }
    },

    /* Sens/typage des valeurs sensibles (anti-contresens). */
    meta: {
      maxDebtRatio: {
        kind: 'REFERENCE_STANDARD',
        note: 'NOT_ABSOLUTE_APPROVAL_LIMIT',
        source: 'HCSF'
      },
      rentalIncomeRetention: {
        kind: 'PROACTIFS_SIMULATION_ASSUMPTION',
        note: 'NOT_REGULATORY_RULE',
        source: 'PROACTIFS'
      }
    },

    /* Avertissements permanents rattachés à la politique. */
    warnings: [
      warn(WARNING_CODES.NOT_A_BANK_DECISION),
      warn(WARNING_CODES.MAX_DEBT_RATIO_REFERENCE),
      warn(WARNING_CODES.RENTAL_INCOME_ASSUMPTION)
    ],

    /* Traçabilité des sources : HCSF pour taux d'effort & durée ;
       la décote 70 % est rattachée à PROACTIFS, PAS au HCSF. */
    sources: [
      {
        rule: 'maxDebtRatio',
        label: 'Taux d’effort maximal 35 %',
        origin: 'HCSF',
        kind: 'REFERENCE_STANDARD',
        note: 'Recommandation HCSF (taux d’effort). Référence, pas garantie d’accord.'
      },
      {
        rule: 'maxPublicDurationYears',
        label: 'Durée d’emprunt maximale 25 ans',
        origin: 'HCSF',
        kind: 'REFERENCE_STANDARD',
        note: 'Recommandation HCSF (durée). 30 ans exclu du public.'
      },
      {
        rule: 'rentalIncomeRetention',
        label: 'Rétention 70 % des revenus locatifs (décote 30 %)',
        origin: 'PROACTIFS',
        kind: 'PROACTIFS_SIMULATION_ASSUMPTION',
        note: 'Hypothèse interne Proactifs — PAS une règle HCSF ni une exigence bancaire universelle.'
      }
    ]
  });

  /* ------------------------------------------------------------------ *
   * FONCTIONS PURES
   * ------------------------------------------------------------------ */

  /* Revenus locatifs retenus après décote.
     { existingRentalIncome, projectedRentalIncome, retentionRate }
     -> { grossRentalIncome, retainedRentalIncome, excludedRentalIncome, retentionRate } */
  function calculateRetainedRentalIncome(p) {
    p = p || {};
    var existing = amount(p.existingRentalIncome);
    var projected = amount(p.projectedRentalIncome);
    var rate = p.retentionRate;
    if (!core.isValidNumber(rate) || rate < 0 || rate > 1) {
      rate = PROACTIFS_CREDIT_POLICY_V1.rentalIncomeRetention;
    }
    var gross = core.round(existing + projected, 2);
    var retained = core.round(gross * rate, 2);
    var excluded = core.round(gross - retained, 2);
    return {
      grossRentalIncome: gross,
      retainedRentalIncome: retained,
      excludedRentalIncome: excluded,
      retentionRate: rate
    };
  }

  /* Revenus totaux retenus selon la politique.
     PRIMARY + CO_BORROWER à 100 %, locatifs à 70 %.
     OTHER_STABLE_INCOME : automaticRetention=false -> NON compté en V1
     (uniquement signalé pour revue manuelle). */
  function calculateRetainedIncome(input, policy) {
    policy = policy || PROACTIFS_CREDIT_POLICY_V1;
    input = input || {};
    var primaryIncome = amount(input.primaryIncome);
    var coBorrowerIncome = amount(input.coBorrowerIncome);
    var rental = calculateRetainedRentalIncome({
      existingRentalIncome: input.existingRentalIncome,
      projectedRentalIncome: input.projectedRentalIncome,
      retentionRate: policy.rentalIncomeRetention
    });
    var otherStableIncome = amount(input.otherStableIncome);

    var flags = [];
    if (rental.grossRentalIncome > 0) flags.push(REVIEW_FLAGS.RENTAL_INCOME_ASSUMPTION_USED);
    if (amount(input.projectedRentalIncome) > 0) flags.push(REVIEW_FLAGS.PROJECTED_RENTAL_INCOME_USED);
    if (otherStableIncome > 0) flags.push(REVIEW_FLAGS.OTHER_INCOME_REQUIRES_REVIEW);

    var totalRetainedIncome = core.round(
      primaryIncome + coBorrowerIncome + rental.retainedRentalIncome, 2
    );

    return {
      primaryIncome: primaryIncome,
      coBorrowerIncome: coBorrowerIncome,
      rental: rental,
      otherStableIncome: otherStableIncome,
      otherStableIncomeRetained: 0,      // V1 : jamais retenu automatiquement
      totalRetainedIncome: totalRetainedIncome,
      reviewFlags: flags
    };
  }

  /* Charges retenues. Pas de double comptage : crédits en cours, loyer résiduel
     et assurance emprunteur sont des postes distincts.
     existingLoansEndingSoon ne réduit JAMAIS automatiquement les charges. */
  function calculateRetainedCharges(input, policy) {
    policy = policy || PROACTIFS_CREDIT_POLICY_V1;
    input = input || {};
    var existingLoanPayments = amount(input.existingLoanPayments);
    var remainingHousingRent = policy.includeRemainingRent ? amount(input.remainingHousingRent) : 0;
    var insuranceProvided = isProvided(input.monthlyInsurance);
    var monthlyInsurance = insuranceProvided ? amount(input.monthlyInsurance) : 0;
    var endingSoon = input.existingLoansEndingSoon === true;

    var flags = [];
    if (!insuranceProvided) flags.push(REVIEW_FLAGS.INSURANCE_NOT_INCLUDED);
    if (remainingHousingRent > 0) flags.push(REVIEW_FLAGS.REMAINING_RENT_INCLUDED);
    if (endingSoon) flags.push(REVIEW_FLAGS.EXISTING_LOAN_ENDING_SOON_REVIEW);

    var totalRetainedCharges = core.round(
      existingLoanPayments + remainingHousingRent + monthlyInsurance, 2
    );

    return {
      existingLoanPayments: existingLoanPayments,
      remainingHousingRent: remainingHousingRent,
      monthlyInsurance: monthlyInsurance,
      insuranceIncluded: insuranceProvided,
      existingLoansEndingSoon: endingSoon,
      totalRetainedCharges: totalRetainedCharges,
      reviewFlags: flags
    };
  }

  /* Mensualité disponible pour le NOUVEAU prêt.
     = revenus retenus × maxDebtRatio − crédits − loyer résiduel − assurance, plancher 0.
     Réutilise le primitif CS-1 cc.calculateMaxPayment (aucune règle recopiée). */
  function calculateAvailablePayment(args) {
    args = args || {};
    var totalRetainedIncome = amount(args.totalRetainedIncome);
    var maxDebtRatio = core.isValidNumber(args.maxDebtRatio)
      ? args.maxDebtRatio : PROACTIFS_CREDIT_POLICY_V1.maxDebtRatio;
    var charges = amount(args.existingLoanPayments)
      + amount(args.remainingHousingRent)
      + amount(args.monthlyInsurance);
    var avail = cc.calculateMaxPayment({
      income: totalRetainedIncome,
      existingDebt: charges,
      maxDebtRatio: maxDebtRatio
    });
    return core.round(core.isValidNumber(avail) ? avail : 0, 2);
  }

  /* Reste à vivre estimé (INFORMATIF). Reste après charges ET mensualité
     disponible entièrement utilisée. AUCUN seuil, AUCUN verdict. */
  function calculateEstimatedRemainingIncome(args) {
    args = args || {};
    var totalRetainedIncome = amount(args.totalRetainedIncome);
    var totalRetainedCharges = amount(args.totalRetainedCharges);
    var availableMonthlyPayment = amount(args.availableMonthlyPayment);
    return core.round(
      totalRetainedIncome - totalRetainedCharges - availableMonthlyPayment, 2
    );
  }

  /* Validation d'entrée (pour la future interface CS-4). Ne lève rien :
     retourne { ok, errors }. Revenu principal requis > 0 ; autres >= 0. */
  function validateFinancingInput(input) {
    input = input || {};
    var errors = {};
    var p = core.toNumber(input.primaryIncome);
    if (!core.isValidNumber(p) || p <= 0) {
      errors.primaryIncome = 'Revenu principal net requis (> 0).';
    }
    var nonNeg = ['coBorrowerIncome', 'existingRentalIncome', 'projectedRentalIncome',
      'otherStableIncome', 'existingLoanPayments', 'remainingHousingRent', 'monthlyInsurance'];
    nonNeg.forEach(function (k) {
      if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
        var n = core.toNumber(input[k]);
        if (!core.isValidNumber(n) || n < 0) errors[k] = 'Valeur invalide (nombre positif ou nul attendu).';
      }
    });
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* Avertissements métier contextuels (permanents + selon l'entrée). */
  function buildWarnings(inc, chg) {
    var w = [warn(WARNING_CODES.NOT_A_BANK_DECISION), warn(WARNING_CODES.MAX_DEBT_RATIO_REFERENCE)];
    if (inc.rental.grossRentalIncome > 0) w.push(warn(WARNING_CODES.RENTAL_INCOME_ASSUMPTION));
    if (!chg.insuranceIncluded) w.push(warn(WARNING_CODES.INSURANCE_NOT_INCLUDED));
    if (inc.otherStableIncome > 0) w.push(warn(WARNING_CODES.OTHER_INCOME_MANUAL_REVIEW));
    if (chg.existingLoansEndingSoon) w.push(warn(WARNING_CODES.EXISTING_LOAN_ENDING_SOON));
    return w;
  }

  /* ------------------------------------------------------------------ *
   * ORCHESTRATEUR — evaluateFinancingInputs
   * Ne renvoie JAMAIS APPROVED / DECLINED / ELIGIBLE / score / probabilité.
   * ------------------------------------------------------------------ */
  function evaluateFinancingInputs(input, policy) {
    policy = policy || PROACTIFS_CREDIT_POLICY_V1;
    input = input || {};

    var retainedIncome = calculateRetainedIncome(input, policy);
    var retainedCharges = calculateRetainedCharges(input, policy);

    var availableMonthlyPayment = calculateAvailablePayment({
      totalRetainedIncome: retainedIncome.totalRetainedIncome,
      existingLoanPayments: retainedCharges.existingLoanPayments,
      remainingHousingRent: retainedCharges.remainingHousingRent,
      monthlyInsurance: retainedCharges.monthlyInsurance,
      maxDebtRatio: policy.maxDebtRatio
    });

    var estimatedRemainingIncome = calculateEstimatedRemainingIncome({
      totalRetainedIncome: retainedIncome.totalRetainedIncome,
      totalRetainedCharges: retainedCharges.totalRetainedCharges,
      availableMonthlyPayment: availableMonthlyPayment
    });

    var reviewFlags = dedupe(retainedIncome.reviewFlags.concat(retainedCharges.reviewFlags));

    /* Fiabilité (JAMAIS un score bancaire) : MANUAL_REVIEW > PARTIAL > STANDARD. */
    var reliability = RELIABILITY.STANDARD;
    if (!retainedCharges.insuranceIncluded) reliability = RELIABILITY.PARTIAL;
    if (retainedIncome.otherStableIncome > 0 || retainedCharges.existingLoansEndingSoon) {
      reliability = RELIABILITY.MANUAL_REVIEW;
    }

    var warnings = buildWarnings(retainedIncome, retainedCharges);

    return {
      policyId: policy.id,
      policyVersion: policy.version,
      retainedIncome: retainedIncome,
      retainedCharges: retainedCharges,
      availableMonthlyPayment: availableMonthlyPayment,
      estimatedRemainingIncome: estimatedRemainingIncome,
      maxDebtRatio: policy.maxDebtRatio,
      reviewFlags: reviewFlags,
      reliability: reliability,
      warnings: warnings
      /* Volontairement AUCUN champ decision/eligible/approved/status/score. */
    };
  }

  /* ------------------------------------------------------------------ */
  return {
    PROACTIFS_CREDIT_POLICY_V1: PROACTIFS_CREDIT_POLICY_V1,
    RELIABILITY: RELIABILITY,
    REVIEW_FLAGS: REVIEW_FLAGS,
    INCOME_CATEGORIES: INCOME_CATEGORIES,
    WARNING_CODES: WARNING_CODES,
    WARNING_MESSAGES: WARNING_MESSAGES,
    calculateRetainedRentalIncome: calculateRetainedRentalIncome,
    calculateRetainedIncome: calculateRetainedIncome,
    calculateRetainedCharges: calculateRetainedCharges,
    calculateAvailablePayment: calculateAvailablePayment,
    calculateEstimatedRemainingIncome: calculateEstimatedRemainingIncome,
    validateFinancingInput: validateFinancingInput,
    evaluateFinancingInputs: evaluateFinancingInputs
  };
}));
