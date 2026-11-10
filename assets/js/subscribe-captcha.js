/* ============================================================
   Anti-robot discret des formulaires du site — client
   Fichier partagé par : index.html (diagnostics), declaration-rsu-espp-france.html,
   immobilier/succession-colombes.html, optimisation-fiscale-ile-de-france.html

   Principe directeur : PROTÉGER SANS FREINER.
   - Rien n'est demandé au visiteur. Le widget Cloudflare Turnstile est rendu en
     `appearance: 'interaction-only'` : invisible tant que le défi se résout seul,
     il n'apparaît que si Cloudflare a besoin d'une interaction.
   - Le navigateur ne bloque JAMAIS l'envoi. Clé absente, script Cloudflare bloqué
     par un filtre, réseau coupé, jeton expiré : le formulaire part quand même, et
     c'est le serveur qui décide (il n'exige le jeton que si son secret existe).
     Conséquence assumée : tant que le secret n'est pas créé, l'anti-robot est inerte.
   - Le jeton Turnstile expire après 300 s et ne vaut qu'une fois : le widget est
     préparé au plus près de l'envoi (dernière étape du diagnostic, ou première
     interaction avec le formulaire), jamais au chargement de la page.

   Champ piège (honeypot) : injecté ici, donc aucun balisage à maintenir dans les
   pages. Il est en `display:none`, ce qui le retire de l'arbre d'accessibilité —
   aucun lecteur d'écran ne l'annonce — et le rend invisible aux gestionnaires de
   mots de passe et à l'autofill, qui ignorent les champs non affichés. Nom neutre
   (`hp`), `autocomplete="off"`, `tabindex="-1"`, `aria-hidden="true"` : rien qui
   ressemble à un champ d'identité, d'adresse ou de mot de passe.
   ============================================================ */
(function (w, d) {
  'use strict';

  var CONFIG_URL = '/api/subscribe-config';
  var SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var ERR_MSG = 'La vérification anti-robot a expiré. Vous pouvez envoyer à nouveau.';
  // Mention d'information RGPD du traitement opéré par le tiers Cloudflare.
  // Elle n'est affichée QUE si le widget est réellement actif : tant que
  // l'anti-robot est inerte, aucune affirmation inexacte n'apparaît sur la page.
  // Chaîne constante, aucune donnée du visiteur n'y entre.
  var NOTE_HTML = 'Protection anti-robot assurée par Cloudflare Turnstile ' +
    '(<a href="/confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>).';

  /* Une instance par formulaire. Une page avec un seul formulaire n'en a qu'une,
     et tout fonctionne alors sans passer aucune option : les identifiants par
     défaut (#pcCaptcha, pcCaptchaWrap, pcCaptchaErr, pcCaptchaNote) sont ceux
     des neuf pages existantes. Une page à plusieurs formulaires — le guide
     patrimonial — déclare une cible par formulaire, pour que le défi Cloudflare
     s'affiche dans le formulaire réellement utilisé et non ailleurs. */
  var DEFAUTS = { holder: '#pcCaptcha', wrap: 'pcCaptchaWrap', err: 'pcCaptchaErr', note: 'pcCaptchaNote' };
  var instances = [];
  var hpInput = null;

  function instance(cible) {
    if (!cible) return instances.length ? instances[0] : null;
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].holder === cible) return instances[i];
    }
    return null;
  }

  function msg(inst, text) {
    var el = d.getElementById((inst && inst.err) || DEFAUTS.err);
    if (el) el.textContent = text || '';
  }

  function ensureHoneypot(inst) {
    if (hpInput) return hpInput;
    hpInput = d.createElement('input');
    hpInput.type = 'text';
    hpInput.id = 'pcHp';
    hpInput.name = 'hp';
    hpInput.value = '';
    hpInput.setAttribute('autocomplete', 'off');
    hpInput.setAttribute('tabindex', '-1');
    hpInput.setAttribute('aria-hidden', 'true');
    hpInput.style.display = 'none';
    var host = (inst && d.getElementById(inst.wrap)) || d.getElementById(DEFAUTS.wrap) || d.body;
    host.appendChild(hpInput);
    return hpInput;
  }

  function loadScript() {
    return new Promise(function (resolve, reject) {
      if (w.turnstile) return resolve();
      var sc = d.createElement('script');
      sc.src = SCRIPT_URL;
      sc.async = true;
      sc.onload = function () { resolve(); };
      sc.onerror = function () { reject(new Error('turnstile_load')); };
      d.head.appendChild(sc);
    });
  }

  /* `options` est facultatif. Sans lui, la cible par défaut est utilisée, donc
     les pages à formulaire unique n'ont rien à déclarer. Idempotent PAR CIBLE :
     un même formulaire ne prépare jamais deux widgets. */
  function prepare(options) {
    options = options || {};
    var inst = {
      holder: options.holder || DEFAUTS.holder,
      wrap: options.wrap || DEFAUTS.wrap,
      err: options.err || DEFAUTS.err,
      note: options.note || DEFAUTS.note,
      id: null,
      state: 'en_cours',
    };
    ensureHoneypot(inst);
    if (instance(inst.holder)) return;
    instances.push(inst);
    var holder = d.querySelector(inst.holder);
    if (!holder || typeof w.fetch !== 'function') { inst.state = 'indisponible'; return; }

    w.fetch(CONFIG_URL, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || !cfg.turnstileSiteKey) throw new Error('site_key_absente');
        return loadScript().then(function () { return cfg; });
      })
      .then(function (cfg) {
        var wrap = d.getElementById(inst.wrap);
        if (wrap) wrap.style.display = 'block';
        var note = d.getElementById(inst.note);
        if (note) note.innerHTML = ' ' + NOTE_HTML;
        inst.id = w.turnstile.render(inst.holder, {
          sitekey: cfg.turnstileSiteKey,
          action: cfg.action || 'subscribe_form',
          appearance: 'interaction-only',
          size: 'flexible',
          theme: 'light',
          'refresh-expired': 'auto',
          callback: function () { msg(inst, ''); },
          'expired-callback': function () { msg(inst, ERR_MSG); },
          'timeout-callback': function () { msg(inst, ERR_MSG); },
          'error-callback': function () { msg(inst, ''); /* jamais de message anxiogène : l'envoi reste possible */ }
        });
        inst.state = 'pret';
      })
      .catch(function () {
        // Clé absente, script bloqué, réseau coupé : on n'affiche rien et on
        // laisse le formulaire fonctionner. Trace technique seulement.
        inst.state = 'indisponible';
        if (w.console && w.console.warn) w.console.warn('anti-robot indisponible, envoi non bloqué');
      });
  }

  // `cible` facultative : sans elle, la première instance préparée est utilisée
  // (comportement des pages à formulaire unique).
  function token(cible) {
    try {
      var inst = instance(cible);
      if (inst && inst.id !== null && w.turnstile) return w.turnstile.getResponse(inst.id) || '';
    } catch (e) { /* ne jamais bloquer */ }
    return '';
  }

  function reset(cible) {
    try {
      var inst = instance(cible);
      if (inst && inst.id !== null && w.turnstile) w.turnstile.reset(inst.id);
    } catch (e) { /* ne jamais bloquer */ }
  }

  function hp() {
    var el = hpInput || d.getElementById('pcHp');
    return el ? String(el.value || '') : '';
  }

  /* Prépare au premier contact avec le formulaire : un widget par formulaire,
     chargé seulement si le visiteur commence réellement à le remplir.
     `options` permet de viser le conteneur propre à ce formulaire. */
  function prepareOnFirstInteraction(selector, options) {
    var form = d.querySelector(selector);
    if (!form) return;
    var once = function () {
      form.removeEventListener('focusin', once);
      form.removeEventListener('change', once);
      prepare(options);
    };
    form.addEventListener('focusin', once);
    form.addEventListener('change', once);
  }

  w.ProactifsCaptcha = {
    prepare: prepare,
    prepareOnFirstInteraction: prepareOnFirstInteraction,
    token: token,
    reset: reset,
    hp: hp,
    // Sans argument : état de la première instance préparée, 'inactif' si aucune.
    state: function (cible) {
      var inst = instance(cible);
      return inst ? inst.state : 'inactif';
    },
    expiredMessage: ERR_MSG
  };
})(window, document);
