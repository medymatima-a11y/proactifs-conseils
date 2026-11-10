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

  var state = 'inactif';   // inactif | en_cours | pret | indisponible
  var widgetId = null;
  var started = false;
  var hpInput = null;

  function msg(text) {
    var el = d.getElementById('pcCaptchaErr');
    if (el) el.textContent = text || '';
  }

  function ensureHoneypot() {
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
    var host = d.getElementById('pcCaptchaWrap') || d.body;
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

  function prepare() {
    ensureHoneypot();
    if (started) return;
    started = true;
    state = 'en_cours';
    var holder = d.getElementById('pcCaptcha');
    if (!holder || typeof w.fetch !== 'function') { state = 'indisponible'; return; }

    w.fetch(CONFIG_URL, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || !cfg.turnstileSiteKey) throw new Error('site_key_absente');
        return loadScript().then(function () { return cfg; });
      })
      .then(function (cfg) {
        var wrap = d.getElementById('pcCaptchaWrap');
        if (wrap) wrap.style.display = 'block';
        var note = d.getElementById('pcCaptchaNote');
        if (note) note.innerHTML = ' ' + NOTE_HTML;
        widgetId = w.turnstile.render('#pcCaptcha', {
          sitekey: cfg.turnstileSiteKey,
          action: cfg.action || 'subscribe_form',
          appearance: 'interaction-only',
          size: 'flexible',
          theme: 'light',
          'refresh-expired': 'auto',
          callback: function () { msg(''); },
          'expired-callback': function () { msg(ERR_MSG); },
          'timeout-callback': function () { msg(ERR_MSG); },
          'error-callback': function () { msg(''); /* jamais de message anxiogène : l'envoi reste possible */ }
        });
        state = 'pret';
      })
      .catch(function () {
        // Clé absente, script bloqué, réseau coupé : on n'affiche rien et on
        // laisse le formulaire fonctionner. Trace technique seulement.
        state = 'indisponible';
        if (w.console && w.console.warn) w.console.warn('anti-robot indisponible, envoi non bloqué');
      });
  }

  function token() {
    try {
      if (widgetId !== null && w.turnstile) return w.turnstile.getResponse(widgetId) || '';
    } catch (e) { /* ne jamais bloquer */ }
    return '';
  }

  function reset() {
    try {
      if (widgetId !== null && w.turnstile) w.turnstile.reset(widgetId);
    } catch (e) { /* ne jamais bloquer */ }
  }

  function hp() {
    var el = hpInput || d.getElementById('pcHp');
    return el ? String(el.value || '') : '';
  }

  // Prépare au premier contact avec le formulaire : un seul widget par page,
  // chargé seulement si le visiteur commence réellement à le remplir.
  function prepareOnFirstInteraction(selector) {
    var form = d.querySelector(selector);
    if (!form) return;
    var once = function () {
      form.removeEventListener('focusin', once);
      form.removeEventListener('change', once);
      prepare();
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
    state: function () { return state; },
    expiredMessage: ERR_MSG
  };
})(window, document);
