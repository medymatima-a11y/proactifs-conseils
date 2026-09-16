/* ══════════════════════════════════════════════
   NAVIGATION — comportement partagé
   MENU-1.5 : scroll, hamburger. MENU-3 : menu mobile 2 niveaux
   (niveaux, retour, focus/inert, blocage scroll, Escape).
   MENU-2A (16/09/2026) : mega-menus desktop (hover + clavier,
   maintien vers le panneau, délai de fermeture, Escape, aria-expanded).
   Aucune dépendance externe. Voir docs/NAVIGATION-PROACTIFS.md.
══════════════════════════════════════════════ */
(function () {
  document.documentElement.classList.add('nav-js');

  var nav = document.getElementById('nav');
  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobileMenu');

  /* Nav en état "scrolled" au-delà de 20px. */
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  /* ── Menu mobile 2 niveaux (MENU-3) ── */
  if (hamburger && mobileMenu) {
    var body = document.body;
    var rootView = mobileMenu.querySelector('.m-view--root');
    var subViews = Array.prototype.slice.call(mobileMenu.querySelectorAll('.m-view--sub'));
    var parents = Array.prototype.slice.call(mobileMenu.querySelectorAll('.m-parent'));
    var activeSub = null;

    function applyInert() {
      var open = mobileMenu.classList.contains('open');
      if (rootView) rootView.inert = open ? !!activeSub : true;
      subViews.forEach(function (v) {
        v.inert = open ? (v.getAttribute('data-view') !== activeSub) : true;
      });
    }
    function goRoot() {
      activeSub = null;
      if (rootView) rootView.classList.remove('slid');
      subViews.forEach(function (v) { v.classList.remove('active'); });
      parents.forEach(function (p) { p.setAttribute('aria-expanded', 'false'); });
      applyInert();
    }
    function openSub(name) {
      activeSub = name;
      if (rootView) rootView.classList.add('slid');
      subViews.forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-view') === name); });
      parents.forEach(function (p) { p.setAttribute('aria-expanded', p.getAttribute('data-submenu') === name ? 'true' : 'false'); });
      applyInert();
      var view = mobileMenu.querySelector('.m-view[data-view="' + name + '"]');
      var back = view && view.querySelector('[data-back]');
      if (back) back.focus();
    }
    function openMenu() {
      goRoot();
      mobileMenu.classList.add('open');
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      hamburger.setAttribute('aria-label', 'Fermer le menu');
      mobileMenu.setAttribute('aria-hidden', 'false');
      body.classList.add('m-open');
      applyInert();
    }
    function closeMenu(returnFocus) {
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Ouvrir le menu');
      mobileMenu.setAttribute('aria-hidden', 'true');
      body.classList.remove('m-open');
      goRoot();
      if (returnFocus) hamburger.focus();
    }

    hamburger.addEventListener('click', function () {
      if (mobileMenu.classList.contains('open')) closeMenu(false);
      else openMenu();
    });
    parents.forEach(function (p) {
      p.addEventListener('click', function () { openSub(p.getAttribute('data-submenu')); });
    });
    mobileMenu.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () {
        var current = activeSub;
        goRoot();
        var parentBtn = current && mobileMenu.querySelector('.m-parent[data-submenu="' + current + '"]');
        if (parentBtn) parentBtn.focus();
      });
    });
    /* Ferme au clic sur une destination - correctif audit 13/09/2026, maj MENU-3. */
    mobileMenu.querySelectorAll('a[href]').forEach(function (a) {
      a.addEventListener('click', function () { closeMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) closeMenu(true);
    });
    applyInert();
  }

  /* ── Mega-menus / dropdowns desktop (MENU-2A) ── */
  var CLOSE_DELAY = 140;
  var items = nav ? nav.querySelectorAll('.nav-item.nav-mega, .nav-item.nav-drop') : [];
  var openItem = null;
  var closeTimer = null;

  function triggerOf(item) { return item.querySelector('.nav-trigger'); }

  function openMenu(item) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (openItem && openItem !== item) closeMenu(openItem);
    item.classList.add('open');
    var t = triggerOf(item);
    if (t) t.setAttribute('aria-expanded', 'true');
    openItem = item;
  }

  function closeMenu(item) {
    item.classList.remove('open');
    var t = triggerOf(item);
    if (t) t.setAttribute('aria-expanded', 'false');
    if (openItem === item) openItem = null;
  }

  function scheduleClose(item) {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { closeMenu(item); }, CLOSE_DELAY);
  }

  Array.prototype.forEach.call(items, function (item) {
    var t = triggerOf(item);
    item.addEventListener('mouseenter', function () { openMenu(item); });
    item.addEventListener('mouseleave', function () { scheduleClose(item); });
    item.addEventListener('focusin', function () { openMenu(item); });
    item.addEventListener('focusout', function (e) {
      if (!item.contains(e.relatedTarget)) scheduleClose(item);
    });
    if (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.classList.contains('open')) closeMenu(item);
        else openMenu(item);
      });
    }
  });

  /* Escape ferme le menu ouvert et rend le focus au déclencheur. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openItem) {
      var t = triggerOf(openItem);
      closeMenu(openItem);
      if (t) t.focus();
    }
  });

  /* Clic hors d'un menu ouvert : fermeture. */
  document.addEventListener('click', function (e) {
    if (openItem && !openItem.contains(e.target)) closeMenu(openItem);
  });
})();
