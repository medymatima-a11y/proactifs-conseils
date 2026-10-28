/* Gestion du consentement cookies — proactifsconseils.fr
 * Rien n'est chargé (Google Analytics, Google Ads, Brevo) avant un choix explicite.
 * Choix conservé 13 mois dans le cookie first-party "pc_consent".
 * API : window.ProactifsCookies.open() rouvre le panneau de réglages.
 */
(function () {
  'use strict';
  var NAME = 'pc_consent';
  var MAX_AGE = 60 * 60 * 24 * 395; // 13 mois
  var GA_ID = 'G-P53RQGXJZX';
  var BREVO_KEY = 'd0aqzyj88l6bfuhczwn7zv35';
  var loaded = { gtag: false, brevo: false };
  /* Garde-fou : aucun script de mesure ou de marketing hors domaines de production,
     même si le consentement est accordé. */
  var PROD_HOSTS = ['proactifsconseils.fr', 'www.proactifsconseils.fr', 'pret-immobilier.proactifsconseils.fr'];
  var IS_PROD = PROD_HOSTS.indexOf(location.hostname) !== -1;

  function read() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)pc_consent=([^;]+)/);
      if (!m) return null;
      var v = JSON.parse(decodeURIComponent(m[1]));
      return (v && typeof v.a === 'boolean' && typeof v.m === 'boolean') ? v : null;
    } catch (e) { return null; }
  }

  function save(a, m) {
    var v = { a: !!a, m: !!m, t: Date.now() };
    document.cookie = NAME + '=' + encodeURIComponent(JSON.stringify(v)) +
      '; Max-Age=' + MAX_AGE + '; Path=/; SameSite=Lax; Secure';
    return v;
  }

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  function apply(c) {
    if (!IS_PROD) return;
    window.dataLayer = window.dataLayer || [];
    var gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag = gtag;
    var n0 = window.dataLayer.length;
    gtag('set', 'ads_data_redaction', !c.m);
    gtag('consent', 'update', {
      analytics_storage: c.a ? 'granted' : 'denied',
      ad_storage: c.m ? 'granted' : 'denied',
      ad_user_data: c.m ? 'granted' : 'denied',
      ad_personalization: c.m ? 'granted' : 'denied'
    });
    // gtag.js pas encore chargé : on place la mise à jour juste après le
    // "consent default" pour que la page vue en file soit traitée avec le bon état.
    if (!loaded.gtag) {
      var dl = window.dataLayer, upd = dl.splice(n0), at = 0, i;
      for (i = 0; i < dl.length; i++) {
        if (dl[i] && (dl[i][0] === 'consent' || (dl[i][0] === 'set' && dl[i][1] === 'ads_data_redaction'))) at = i + 1;
      }
      Array.prototype.splice.apply(dl, [at, 0].concat(upd));
    }
    if ((c.a || c.m) && !loaded.gtag) {
      loaded.gtag = true;
      addScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
    }
    if (c.m && !loaded.brevo && document.documentElement.hasAttribute('data-brevo')) {
      loaded.brevo = true;
      window.Brevo = window.Brevo || [];
      window.Brevo.push(['init', { client_key: BREVO_KEY }]);
      addScript('https://cdn.brevo.com/js/sdk-loader.js');
    }
  }

  /* ---------- Interface ---------- */
  var css = '' +
    '#pcc{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;background:#fff;color:#111827;' +
    'border:1px solid #E5E2DA;border-radius:16px;box-shadow:0 12px 40px rgba(19,45,30,.18);padding:20px 22px;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '#pcc h2{font-size:17px;font-weight:700;margin:0 0 6px;color:#132D1E;font-family:inherit}' +
    '#pcc p{margin:0 0 14px;color:#374151}' +
    '#pcc a{color:#132D1E;text-decoration:underline}' +
    '#pcc .pcc-btns{display:flex;flex-wrap:wrap;gap:8px}' +
    '#pcc button{flex:1 1 140px;min-height:44px;border-radius:999px;font:600 14px/1 inherit;font-family:inherit;cursor:pointer;padding:0 16px;border:1.5px solid #132D1E}' +
    '#pcc .pcc-solid{background:#132D1E;color:#fff}' +
    '#pcc .pcc-line{background:#fff;color:#132D1E}' +
    '#pcc button:focus-visible{outline:3px solid #C4973A;outline-offset:2px}' +
    '#pcc .pcc-opts{margin:0 0 14px;border-top:1px solid #E5E2DA}' +
    '#pcc label{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #E5E2DA;cursor:pointer}' +
    '#pcc label input{margin-top:3px;width:20px;height:20px;accent-color:#132D1E;flex:none}' +
    '#pcc label span{display:block;font-size:13.5px;color:#5B6370}' +
    '#pcc label strong{display:block;color:#111827}' +
    '@media(max-width:480px){#pcc{left:8px;right:8px;bottom:8px;padding:18px 16px}#pcc button{flex-basis:100%}}';

  var box = null;

  function close() { if (box) { box.remove(); box = null; } }

  function choose(a, m) { apply(save(a, m)); close(); }

  function show(detail) {
    close();
    var cur = read() || { a: false, m: false };
    if (!document.getElementById('pcc-style')) {
      var st = document.createElement('style'); st.id = 'pcc-style'; st.textContent = css;
      document.head.appendChild(st);
    }
    box = document.createElement('div');
    box.id = 'pcc';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-labelledby', 'pcc-t');
    box.innerHTML =
      '<h2 id="pcc-t">Vos choix de cookies</h2>' +
      '<p>Avec votre accord, nous utilisons des cookies pour mesurer l\'audience du site et l\'efficacité de nos annonces. ' +
      'Vous pouvez changer d\'avis à tout moment via « Gestion des cookies » en bas de page. ' +
      '<a href="/confidentialite#cookies">En savoir plus</a></p>' +
      (detail ?
        '<div class="pcc-opts">' +
        '<label><input type="checkbox" checked disabled><span><strong>Fonctionnement du site</strong>Toujours actif : navigation, sécurité, formulaires.</span></label>' +
        '<label><input type="checkbox" id="pcc-a"' + (cur.a ? ' checked' : '') + '><span><strong>Mesure d\'audience</strong>Google Analytics : pages consultées, provenance des visites.</span></label>' +
        '<label><input type="checkbox" id="pcc-m"' + (cur.m ? ' checked' : '') + '><span><strong>Publicité et suivi marketing</strong>Google Ads et Brevo : efficacité des annonces et des emails.</span></label>' +
        '</div>' +
        '<div class="pcc-btns"><button type="button" class="pcc-line" data-act="refuse">Tout refuser</button>' +
        '<button type="button" class="pcc-solid" data-act="save">Enregistrer mes choix</button></div>'
        :
        '<div class="pcc-btns"><button type="button" class="pcc-line" data-act="refuse">Tout refuser</button>' +
        '<button type="button" class="pcc-line" data-act="detail">Personnaliser</button>' +
        '<button type="button" class="pcc-solid" data-act="accept">Tout accepter</button></div>');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'refuse') choose(false, false);
      else if (act === 'accept') choose(true, true);
      else if (act === 'detail') show(true);
      else if (act === 'save') choose(document.getElementById('pcc-a').checked, document.getElementById('pcc-m').checked);
    });
    document.body.appendChild(box);
    var first = detail ? box.querySelector('#pcc-a') : null;
    if (first) first.focus({ preventScroll: true });
  }

  /* Lien « Gestion des cookies » ajouté à côté du lien Confidentialité du pied de page */
  function addFooterLink() {
    if (document.querySelector('[data-pcc-open]')) return;
    var links = document.querySelectorAll('footer a[href="/confidentialite"], footer a[href="/confidentialite#cookies"]');
    var ref = links[links.length - 1];
    var a = document.createElement('a');
    a.href = '#'; a.textContent = 'Gestion des cookies'; a.setAttribute('data-pcc-open', '');
    if (ref) {
      a.className = ref.className;
      if (ref.parentNode.tagName === 'LI') {
        var li = document.createElement('li'); li.appendChild(a);
        ref.parentNode.parentNode.insertBefore(li, ref.parentNode.nextSibling);
      } else {
        ref.parentNode.insertBefore(document.createTextNode(' · '), ref.nextSibling);
        ref.parentNode.insertBefore(a, ref.nextSibling.nextSibling);
      }
    } else {
      var f = document.querySelector('footer'); if (!f) return;
      var p = document.createElement('p'); p.style.cssText = 'text-align:center;margin:12px 0;font-size:13px';
      p.appendChild(a); f.appendChild(p);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pcc-open]');
    if (t) { e.preventDefault(); show(true); }
  });

  window.ProactifsCookies = { open: function () { show(true); } };

  var c = read();
  if (c) apply(c);

  function init() {
    addFooterLink();
    if (!c && IS_PROD) show(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
