/* ==========================================================================
 * Proactifs Conseils — Simulateurs V2 — lead.js
 * Couche d'abstraction LEAD (construction du payload uniquement).
 *
 * ⚠ CS-1 : NE modifie PAS /api/subscribe. N'envoie AUCUN vrai lead.
 * submitLead() exige un "transport" injecté explicitement — il n'existe AUCUN
 * endpoint par défaut, donc aucun POST accidentel n'est possible.
 * Le calcul d'un résultat NE doit jamais dépendre de l'identité (voir core/calc).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimLead = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Construit le payload au schéma API existant (référence, non modifié) :
     { prenom, nom:'', email, tel, situation, service, answers:[...] }
     Ne fait AUCUN envoi. */
  function buildLeadPayload(input) {
    input = input || {};
    return {
      prenom: input.prenom || '',
      nom: '',
      email: input.email || '',
      tel: input.tel || '',
      situation: input.situation || '',
      service: input.service || 'credit',
      answers: Array.isArray(input.answers) ? input.answers.slice() : []
    };
  }

  /* Validation minimale d'un payload avant un futur envoi (email + tel présents). */
  function isSubmittable(payload) {
    return !!payload && typeof payload.email === 'string' && payload.email.indexOf('@') > 0
      && typeof payload.tel === 'string' && payload.tel.replace(/\D/g, '').length >= 6;
  }

  /* Envoi ABSTRAIT : le transport (fonction async) est OBLIGATOIRE et injecté.
     Aucun endpoint par défaut -> impossible d'appeler la prod par accident.
     transport(payload) doit renvoyer une Promise. */
  function submitLead(payload, transport) {
    if (typeof transport !== 'function') {
      return Promise.reject(new Error('submitLead: transport requis (aucun endpoint par défaut en CS-1)'));
    }
    if (!isSubmittable(payload)) {
      return Promise.reject(new Error('submitLead: payload non soumettable (email/tel manquants)'));
    }
    return Promise.resolve(transport(payload));
  }

  return {
    buildLeadPayload: buildLeadPayload,
    isSubmittable: isSubmittable,
    submitLead: submitLead
  };
}));
