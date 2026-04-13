/* ============================================================
   Popup Exit-Intent — Proactifs Conseils
   Guide : Les 5 erreurs patrimoniales
   ============================================================ */
(function () {
  'use strict';

  // Ne pas afficher sur la page du guide elle-même ni sur merci
  var EXCLUDED = ['/guide-5-erreurs-patrimoniaux', '/merci-guide'];
  var path = window.location.pathname.replace(/\/$/, '');
  for (var i = 0; i < EXCLUDED.length; i++) {
    if (path === EXCLUDED[i] || path.indexOf(EXCLUDED[i]) === 0) return;
  }

  // Cookie : ne pas remontrer pendant 7 jours
  var COOKIE = 'pc_popup_seen';
  function getCookie(name) {
    var v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? v.pop() : '';
  }
  function setCookie(name, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + '=1;expires=' + d.toUTCString() + ';path=/';
  }
  if (getCookie(COOKIE)) return;

  /* ── Styles ── */
  var css = `
    #pc-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(10,25,18,.72);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .35s ease;
      padding: 16px;
    }
    #pc-overlay.pc-show { opacity: 1; }
    #pc-modal {
      background: #1B3A2D;
      border: 1px solid rgba(201,168,76,.25);
      border-radius: 8px;
      max-width: 520px; width: 100%;
      padding: 0;
      overflow: hidden;
      transform: translateY(24px) scale(.97);
      transition: transform .35s cubic-bezier(.22,1,.36,1);
      box-shadow: 0 32px 80px rgba(0,0,0,.5);
      position: relative;
    }
    #pc-overlay.pc-show #pc-modal { transform: translateY(0) scale(1); }
    #pc-modal-top {
      background: linear-gradient(135deg,#0f2a1e,#1B3A2D);
      padding: 36px 40px 28px;
      text-align: center;
      border-bottom: 1px solid rgba(201,168,76,.15);
    }
    #pc-badge {
      display: inline-block;
      font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
      color: #C9A84C; font-weight: 700;
      background: rgba(201,168,76,.1);
      border: 1px solid rgba(201,168,76,.25);
      border-radius: 20px; padding: 5px 14px;
      margin-bottom: 18px;
    }
    #pc-modal h2 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 26px; font-weight: 700;
      color: #fff; line-height: 1.3;
      margin: 0 0 10px;
    }
    #pc-modal h2 em {
      color: #C9A84C; font-style: normal;
    }
    #pc-subtitle {
      font-size: 13px; color: rgba(250,250,247,.65);
      line-height: 1.6; margin: 0;
    }
    #pc-modal-body {
      padding: 28px 40px 36px;
    }
    #pc-list {
      list-style: none; margin: 0 0 24px; padding: 0;
      display: flex; flex-direction: column; gap: 10px;
    }
    #pc-list li {
      display: flex; align-items: flex-start; gap: 10px;
      font-size: 12.5px; color: rgba(250,250,247,.75);
      line-height: 1.55;
    }
    #pc-list li::before {
      content: '✓';
      color: #C9A84C; font-weight: 700;
      font-size: 13px; flex-shrink: 0; margin-top: 1px;
    }
    #pc-cta {
      display: block; width: 100%;
      background: linear-gradient(135deg,#C9A84C,#b8913d);
      color: #1B3A2D; font-weight: 700;
      font-size: 14px; letter-spacing: .04em;
      text-align: center; text-decoration: none;
      padding: 16px 24px; border-radius: 6px;
      border: none; cursor: pointer;
      transition: opacity .2s, transform .15s;
      box-shadow: 0 4px 20px rgba(201,168,76,.3);
    }
    #pc-cta:hover { opacity: .92; transform: translateY(-1px); }
    #pc-cta:active { transform: translateY(0); }
    #pc-close {
      position: absolute; top: 14px; right: 16px;
      background: none; border: none;
      color: rgba(250,250,247,.4); font-size: 22px;
      cursor: pointer; line-height: 1;
      transition: color .2s;
      padding: 4px 8px;
    }
    #pc-close:hover { color: rgba(250,250,247,.8); }
    #pc-skip {
      display: block; text-align: center;
      margin-top: 14px; font-size: 11px;
      color: rgba(250,250,247,.35);
      cursor: pointer; text-decoration: underline;
      background: none; border: none; width: 100%;
    }
    #pc-skip:hover { color: rgba(250,250,247,.6); }
    @media (max-width: 540px) {
      #pc-modal-top { padding: 28px 24px 22px; }
      #pc-modal h2 { font-size: 21px; }
      #pc-modal-body { padding: 22px 24px 28px; }
    }
  `;

  /* ── HTML ── */
  var html = `
    <div id="pc-overlay" role="dialog" aria-modal="true" aria-label="Offre guide gratuit">
      <div id="pc-modal">
        <button id="pc-close" aria-label="Fermer">&#x2715;</button>
        <div id="pc-modal-top">
          <div id="pc-badge">Guide gratuit</div>
          <h2>Avant de partir&hellip;<br>téléchargez <em>votre guide</em></h2>
          <p id="pc-subtitle">Les 5 erreurs qui coûtent cher à votre patrimoine — et comment les éviter</p>
        </div>
        <div id="pc-modal-body">
          <ul id="pc-list">
            <li>Pourquoi votre épargne "sécurisée" vous appauvrit chaque année</li>
            <li>L'erreur fiscale que commettent 80 % des cadres et chefs d'entreprise</li>
            <li>Comment anticiper sa retraite avant 50 ans sans tout sacrifier</li>
            <li>Les dispositifs de transmission que personne ne vous a expliqués</li>
          </ul>
          <a id="pc-cta" href="/guide-5-erreurs-patrimoniaux">
            Accéder au guide gratuitement →
          </a>
          <button id="pc-skip">Non merci, je préfère passer à côté</button>
        </div>
      </div>
    </div>
  `;

  /* ── Init ── */
  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectModal() {
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  function showPopup() {
    var overlay = document.getElementById('pc-overlay');
    if (!overlay || overlay.classList.contains('pc-show')) return;
    requestAnimationFrame(function () {
      overlay.style.display = 'flex';
      requestAnimationFrame(function () {
        overlay.classList.add('pc-show');
      });
    });
    setCookie(COOKIE, 7);
    bindClose();
  }

  function hidePopup() {
    var overlay = document.getElementById('pc-overlay');
    if (!overlay) return;
    overlay.classList.remove('pc-show');
    setTimeout(function () { overlay.style.display = 'none'; }, 350);
  }

  function bindClose() {
    var close = document.getElementById('pc-close');
    var skip = document.getElementById('pc-skip');
    var overlay = document.getElementById('pc-overlay');
    if (close) close.addEventListener('click', hidePopup);
    if (skip) skip.addEventListener('click', hidePopup);
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hidePopup();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hidePopup();
    });
  }

  /* ── Déclencheur : exit intent ── */
  var triggered = false;
  var MIN_TIME = 5000; // 5s minimum sur la page avant de pouvoir déclencher
  var startTime = Date.now();

  function onMouseOut(e) {
    if (triggered) return;
    if (Date.now() - startTime < MIN_TIME) return;
    if (e.clientY > 10) return; // souris vers le haut seulement
    triggered = true;
    showPopup();
  }

  /* ── Déclencheur mobile : scroll retour vers le haut ── */
  var lastScrollY = 0;
  var scrollTriggerReady = false;
  function onScroll() {
    if (triggered) return;
    if (Date.now() - startTime < MIN_TIME) return;
    var sy = window.scrollY;
    if (!scrollTriggerReady && sy > 300) scrollTriggerReady = true;
    if (scrollTriggerReady && sy < lastScrollY - 80) {
      triggered = true;
      showPopup();
    }
    lastScrollY = sy;
  }

  /* ── Démarrage ── */
  function init() {
    injectStyles();
    injectModal();
    document.addEventListener('mouseleave', onMouseOut);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
