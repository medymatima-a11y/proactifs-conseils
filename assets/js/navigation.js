/* ══════════════════════════════════════════════
   NAVIGATION — comportement partagé (scroll, hamburger, fermeture mobile)
   Extrait à l'identique de index.html / immobilier.html le 16/09/2026
   (MENU-1.5 — centralisation du header, prototype).
   Comportement uniquement : pas de couleurs, pas de mise en page ici
   (voir navigation.css / navigation-immobilier.css).
══════════════════════════════════════════════ */
(function () {
  var nav = document.getElementById('nav');
  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobileMenu');

  /* Nav qui passe en état "scrolled" au-delà de 20px (indépendant de tout
     autre écouteur de scroll propre à la page, ex. bouton "retour en haut"). */
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  /* Ouverture/fermeture du menu mobile au clic sur le hamburger. */
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open');
    });
  }

  /* Ferme le menu mobile au clic sur un lien (ancre ou page)
     - correctif audit 13/09/2026, centralisé ici le 16/09/2026. */
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        if (hamburger) hamburger.classList.remove('open');
      });
    });
  }
})();
