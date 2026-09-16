/* ══════════════════════════════════════════════
   NAVIGATION — comportement partagé
   MENU-1.5 : scroll, hamburger, fermeture mobile au clic.
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

  /* Menu mobile : ouverture/fermeture au hamburger. */
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open');
    });
  }

  /* Ferme le menu mobile au clic sur un lien - correctif audit 13/09/2026. */
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        if (hamburger) hamburger.classList.remove('open');
      });
    });
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
