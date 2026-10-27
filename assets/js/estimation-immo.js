/* ============================================================
   Estimation immobilière en ligne — partagé par /immobilier
   et /immobilier/estimation-colombes.
   - ProactifsEstim.send(payload)  → POST /api/estimation
   - ProactifsEstim.render(el, estimation) → affiche la fourchette
   - ProactifsEstim.bindTypeFields(root, getType) → champs maison/appart
   ============================================================ */
(function () {
  var CALENDLY = 'https://calendly.com/gestionnairedepatrimoine/point-conseils-web';

  var css = '' +
    '.estim-result{text-align:center;padding:8px 0 4px}' +
    '.estim-result-label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--coral,#E05D3D);margin-bottom:10px}' +
    '.estim-result-value{font-family:"Cormorant Garamond",serif;font-size:44px;font-weight:700;line-height:1.1;color:var(--forest,#132D1E)}' +
    '.estim-result-range{margin:14px auto 6px;max-width:380px}' +
    '.estim-result-bar{position:relative;height:8px;border-radius:999px;background:linear-gradient(90deg,var(--coral-pale,#FBEAE3),var(--coral,#E05D3D),var(--coral-pale,#FBEAE3))}' +
    '.estim-result-bounds{display:flex;justify-content:space-between;margin-top:8px;font-size:14px;color:var(--ink-soft,#374151);font-weight:600}' +
    '.estim-result-bounds span small{display:block;font-size:11px;font-weight:500;color:var(--slate,#6B7280);text-transform:uppercase;letter-spacing:.04em}' +
    '.estim-result-conf{display:inline-flex;align-items:center;gap:8px;margin:14px 0 4px;font-size:13px;color:var(--ink-soft,#374151)}' +
    '.estim-result-dots{display:inline-flex;gap:4px}' +
    '.estim-result-dots i{width:9px;height:9px;border-radius:50%;background:var(--border,#E5E2DA)}' +
    '.estim-result-dots i.on{background:var(--forest,#132D1E)}' +
    '.estim-result-note{font-size:13.5px;line-height:1.6;color:var(--ink-soft,#374151);max-width:440px;margin:14px auto 22px}' +
    '.estim-result-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}' +
    '@media (max-width:600px){.estim-result-value{font-size:34px}}';

  function injectCss() {
    if (document.getElementById('estim-result-css')) return;
    var s = document.createElement('style');
    s.id = 'estim-result-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function euros(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' €';
  }

  function confLabel(c) {
    if (c >= 4) return 'Fiabilité élevée';
    if (c >= 2) return 'Fiabilité moyenne';
    return 'Fiabilité limitée (peu de ventes comparables)';
  }

  function send(payload) {
    return fetch('/api/estimation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  // Affiche la fourchette dans `el`. `onReset` = callback du bouton « Nouvelle estimation ».
  function render(el, est, onReset) {
    injectCss();
    var c = Math.max(0, Math.min(5, parseInt(est.confiance, 10) || 0));
    var dots = '';
    for (var i = 1; i <= 5; i++) dots += '<i class="' + (i <= c ? 'on' : '') + '"></i>';
    el.innerHTML =
      '<div class="estim-result" role="status" aria-live="polite">' +
        '<div class="estim-result-label">Première estimation indicative</div>' +
        '<div class="estim-result-value">' + euros(est.valeur) + '</div>' +
        '<div class="estim-result-range">' +
          '<div class="estim-result-bar" aria-hidden="true"></div>' +
          '<div class="estim-result-bounds">' +
            '<span><small>Basse</small>' + euros(est.basse) + '</span>' +
            '<span><small>Haute</small>' + euros(est.haute) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="estim-result-conf"><span class="estim-result-dots" aria-hidden="true">' + dots + '</span>' + confLabel(c) + '</div>' +
        '<p class="estim-result-note">Calcul automatique à partir des ventes comparables récentes de votre secteur. ' +
          'Il ne tient pas compte de tout ce qui fait la valeur réelle de votre bien (luminosité, vue, travaux, copropriété…). ' +
          'Nous vous recontactons sous 24/48h pour l\'affiner lors d\'une visite.</p>' +
        '<div class="estim-result-actions">' +
          '<a class="btn-primary" href="' + CALENDLY + '" target="_blank" rel="noopener">Prendre rendez-vous</a>' +
          '<button type="button" class="btn-outline" data-estim-reset>Nouvelle estimation</button>' +
        '</div>' +
      '</div>';
    var r = el.querySelector('[data-estim-reset]');
    if (r && onReset) r.addEventListener('click', onReset);
  }

  // Affiche/masque les champs propres à une maison (data-for="house") ou un appartement (data-for="apartment").
  function bindTypeFields(root, getType) {
    function update() {
      var t = getType();
      var key = /appart/i.test(t) ? 'apartment' : /maison/i.test(t) ? 'house' : '';
      root.querySelectorAll('[data-for]').forEach(function (f) {
        var show = f.getAttribute('data-for') === key;
        f.hidden = !show;
        if (!show) f.querySelectorAll('input,select').forEach(function (i) { i.value = ''; });
      });
    }
    update();
    return update;
  }

  window.ProactifsEstim = { send: send, render: render, bindTypeFields: bindTypeFields };
})();
