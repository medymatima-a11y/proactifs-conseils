#!/usr/bin/env node
/**
 * MIGRATION PONCTUELLE (à usage unique) — MENU-1.5, 16/09/2026.
 *
 * Bascule les 4 pages prototypes de MENU-1.5 d'un header codé en dur vers
 * le mécanisme centralisé (partials/header.html + scripts/build-header.js).
 *
 * Pour chaque page du manifeste ci-dessous, ce script :
 *   1. remplace le bloc <nav id="nav">…</nav> + <div class="mobile-menu">…</div>
 *      par les marqueurs NAV:CONFIG / NAV:START / NAV:END (contenu généré
 *      ensuite par scripts/build-header.js) ;
 *   2. remplace le script inline hamburger + scroll "nav.scrolled" + fermeture
 *      mobile par un <script src="/assets/js/navigation.js" defer> (en
 *      conservant la partie propre à la page — le bouton "retour en haut" —
 *      qui n'est pas de la navigation) ;
 *   3. pour les pages en centralisation complète, remplace le CSS de nav
 *      inline par un <link rel="stylesheet" href="...">.
 *
 * immobilier.html est un cas particulier : sa variante CSS coral diverge
 * légèrement des 2 autres pages Immobilier (logo 40px au lieu de 48px, état
 * actif en aria-current plutôt qu'en class="active", pas de z-index sur le
 * dropdown...). Pour ne RIEN changer visuellement à ce stade, son CSS de nav
 * reste inline sur cette page (HTML + JS sont centralisés, pas le CSS) —
 * voir docs/NAVIGATION-PROACTIFS.md, section "Cas particulier immobilier.html".
 *
 * Ce script n'est pas destiné à être relancé pour d'autres pages tel quel :
 * chaque page migrée doit avoir ses ancres de texte vérifiées à la main
 * (voir la procédure dans docs/NAVIGATION-PROACTIFS.md pour migrer une page
 * de plus après MENU-1.5).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function writeFile(p, content) { fs.writeFileSync(path.join(ROOT, p), content, 'utf8'); }

function replaceOnce(content, needle, replacement, label) {
  const count = content.split(needle).length - 1;
  if (count !== 1) {
    throw new Error('[' + label + '] attendu 1 occurrence, trouvé ' + count + '.');
  }
  return content.replace(needle, replacement);
}

function extractNavBlock(content, label) {
  const startTag = '<nav id="nav">';
  const startIdx = content.indexOf(startTag);
  if (startIdx === -1) throw new Error('[' + label + '] <nav id="nav"> introuvable.');
  const mobileDivTag = '<div class="mobile-menu" id="mobileMenu">';
  const mobileIdx = content.indexOf(mobileDivTag, startIdx);
  if (mobileIdx === -1) throw new Error('[' + label + '] <div class="mobile-menu"...> introuvable.');
  // Le mobile-menu ne contient que des <a>, pas de <div> imbriqué :
  // le premier </div> après son ouverture ferme donc bien ce bloc.
  const closeIdx = content.indexOf('</div>', mobileIdx);
  if (closeIdx === -1) throw new Error('[' + label + '] fermeture du mobile-menu introuvable.');
  const endIdx = closeIdx + '</div>'.length;
  return { startIdx, endIdx, block: content.slice(startIdx, endIdx) };
}

function buildConfigComment(config) {
  return '<!-- NAV:CONFIG ' + JSON.stringify(config) + ' -->';
}

const NAV_START = '<!-- NAV:START (bloc généré par scripts/build-header.js — ne pas éditer à la main, voir docs/NAVIGATION-PROACTIFS.md) -->';
const NAV_END = '<!-- NAV:END -->';

function migrateNavBlock(content, label, config) {
  const { startIdx, endIdx } = extractNavBlock(content, label);
  const marker = buildConfigComment(config) + '\n' + NAV_START + '\n' + NAV_END;
  return content.slice(0, startIdx) + marker + content.slice(endIdx);
}

function insertBeforeHead(content, linkTag, label) {
  return replaceOnce(content, '</head>', '  ' + linkTag + '\n</head>', label + ' (</head>)');
}

/* ─────────────────────────────────────────────────────────────────────
   1) index.html — centralisation complète (HTML + CSS + JS)
───────────────────────────────────────────────────────────────────── */
function migrateIndex() {
  const label = 'index.html';
  let content = readFile('index.html');

  const cssBlock1 =
`/* ══════════════════════════════════════════════
   NAV
══════════════════════════════════════════════ */
#nav {
  position: fixed; top:0; left:0; right:0; z-index:200;
  height: 68px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 48px;
  transition: background .3s, box-shadow .3s;
  background: rgba(250,250,247,.97);
  box-shadow: 0 1px 0 var(--border), var(--shadow-sm);
}
#nav.scrolled {
  background: rgba(250,250,247,.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 0 var(--border), var(--shadow-sm);
}
.nav-logo { display:flex; align-items:center; text-decoration:none; }
.nav-logo img { height:52px; width:auto; display:block; }
.nav-links { display:flex; gap:32px; list-style:none; }
.nav-links a {
  font-size: 14px; font-weight: 500; color: var(--ink-soft);
  position: relative; padding-bottom: 2px;
  transition: color .2s;
}
.nav-links a::after {
  content:''; position:absolute; bottom:0; left:0; right:100%;
  height: 1.5px; background: var(--gold);
  transition: right .25s ease;
}
.nav-links a:hover { color: var(--ink); }
.nav-links a:hover::after { right:0; }
.nav-cta-btn {
  background: var(--gold);
  color: var(--white);
  padding: 10px 22px;
  border-radius: var(--r-sm);
  font-size: 13.5px; font-weight: 600;
  transition: background .2s, transform .15s, box-shadow .2s;
  white-space: nowrap;
}
.nav-cta-btn:hover { background:#B8882E; transform:translateY(-1px); box-shadow:0 4px 16px rgba(196,151,58,.35); }
.hamburger { display:none; flex-direction:column; gap:5px; padding:8px; }
.hamburger span { display:block; width:22px; height:2px; background:var(--ink); border-radius:2px; transition:all .3s; }
.hamburger.open span:nth-child(1) { transform:rotate(45deg) translate(6px,6px); }
.hamburger.open span:nth-child(2) { opacity:0; }
.hamburger.open span:nth-child(3) { transform:rotate(-45deg) translate(6px,-6px); }
.mobile-menu {
  display:none; position:fixed; top:68px; left:0; right:0;
  background:rgba(250,250,247,.98); backdrop-filter:blur(16px);
  padding:24px 32px 32px; border-bottom:1px solid var(--border);
  z-index:199;max-height:calc(100vh - 68px);overflow-y:auto;-webkit-overflow-scrolling:touch;}
.mobile-menu.open { display:block; }
.mobile-menu a { display:block; padding:13px 0; font-size:15px; font-weight:500; border-bottom:1px solid var(--border); color:var(--ink-soft); }
.mobile-menu a:last-child { border-bottom:none; color:var(--gold); font-weight:600; }`;

  content = replaceOnce(content, cssBlock1,
    '/* Navigation : voir /assets/css/navigation.css (centralisé, MENU-1.5) */', label + ' CSS bloc 1');

  const cssBlock2 =
`/* ── Dropdown nav ── */
.nav-dropdown { position: relative; }
.nav-dropdown::after {
  content: '';
  position: absolute;
  top: 100%;
  left: -20px;
  right: -20px;
  height: 14px;
}
.dropdown-toggle { display: flex !important; align-items: center; gap: 5px; }
.chevron { font-size: 9px; transition: transform .2s; line-height: 1; pointer-events: none; }
.nav-dropdown:hover .chevron,
.nav-dropdown:focus-within .chevron { transform: rotate(180deg); }
.dropdown-menu {
  display: none;
  position: absolute; top: calc(100% + 10px); left: 50%;
  transform: translateX(-50%);
  background: #FFFFFF; border: 1px solid #E5E2DA;
  border-radius: 16px; padding: 6px;
  min-width: 260px;
  box-shadow: 0 12px 40px rgba(17,24,39,.1), 0 4px 12px rgba(17,24,39,.06);
  list-style: none; z-index: 300;
}
.nav-dropdown:hover .dropdown-menu,
.nav-dropdown:focus-within .dropdown-menu { display: block; }
.dropdown-menu li a {
  display: block !important; padding: 9px 14px !important;
  font-size: 13.5px !important; font-weight: 500 !important;
  color: #374151 !important;
  border-radius: 10px; transition: background .15s, color .15s !important;
  white-space: nowrap; text-decoration: none;
}
.dropdown-menu li a::after { display: none !important; }
.dropdown-menu li a:hover { background: #FBF4E3; color: #C4973A !important; }

.dropdown-menu li.dropdown-section {
  font-family: 'DM Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #1E7A6E;
  padding: 12px 14px 6px;
  border-top: 1px solid #E5E2DA;
  margin-top: 4px;
  pointer-events: none;
}
.dropdown-menu li:first-child + li.dropdown-section { margin-top: 6px; }`;

  content = replaceOnce(content, cssBlock2,
    '/* Dropdown "Nos services" : voir /assets/css/navigation.css (centralisé, MENU-1.5) */', label + ' CSS bloc 2');

  content = insertBeforeHead(content, '<link rel="stylesheet" href="/assets/css/navigation.css">', label);

  const jsBlock =
`<script>
/* ════════ NAV SCROLL ════════ */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
  document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
});

/* ════════ HAMBURGER ════════ */
document.getElementById('hamburger').addEventListener('click', function() {
  document.getElementById('mobileMenu').classList.toggle('open');
  this.classList.toggle('open');
});`;

  const jsReplacement =
`<script>
/* Retour en haut (propre à la page, indépendant de la nav) */
window.addEventListener('scroll', () => {
  document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
});`;

  content = replaceOnce(content, jsBlock, jsReplacement, label + ' JS scroll+hamburger');

  const autocloseBlock =
`<script>
/* Ferme le menu mobile au clic sur un lien (ancre ou page) - correctif audit 13/09/2026 */
(function(){
  var mm = document.getElementById('mobileMenu');
  var hb = document.getElementById('hamburger');
  if (mm) {
    mm.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        mm.classList.remove('open');
        if (hb) hb.classList.remove('open');
      });
    });
  }
})();
</script>`;

  content = replaceOnce(content, autocloseBlock,
    '<script src="/assets/js/navigation.js" defer></script>', label + ' JS autoclose');

  content = migrateNavBlock(content, label, {
    theme: 'site-patrimoine',
    tokens: {
      HOME_PREFIX: '',
      CTA_HREF: '/bilan-patrimonial',
      CTA_LABEL: 'Prendre rendez-vous',
      MOBILE_CTA_HREF: '/bilan-patrimonial',
      MOBILE_CTA_LABEL: 'Bilan patrimonial sur mesure',
    },
    items: { temoignages: true },
  });

  writeFile('index.html', content);
  console.log('[migré] ' + label);
}

/* ─────────────────────────────────────────────────────────────────────
   2) immobilier.html — HTML + JS centralisés, CSS laissé inline
      (variante coral légèrement différente des 2 autres pages Immobilier —
      voir l'en-tête de ce fichier et docs/NAVIGATION-PROACTIFS.md)
───────────────────────────────────────────────────────────────────── */
function migrateImmobilier() {
  const label = 'immobilier.html';
  let content = readFile('immobilier.html');

  const jsBlock =
`    const nav = document.getElementById('nav');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
      document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
    });
    document.getElementById('hamburger').addEventListener('click', function() {
      document.getElementById('mobileMenu').classList.toggle('open');
      this.classList.toggle('open');
    });`;

  const jsReplacement =
`    window.addEventListener('scroll', () => {
      document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
    });`;

  content = replaceOnce(content, jsBlock, jsReplacement, label + ' JS scroll+hamburger');

  const autocloseBlock =
`<script>
/* Ferme le menu mobile au clic sur un lien (ancre ou page) - correctif audit 13/09/2026 */
(function(){
  var mm = document.getElementById('mobileMenu');
  var hb = document.getElementById('hamburger');
  if (mm) {
    mm.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        mm.classList.remove('open');
        if (hb) hb.classList.remove('open');
      });
    });
  }
})();
</script>`;

  content = replaceOnce(content, autocloseBlock,
    '<script src="/assets/js/navigation.js" defer></script>', label + ' JS autoclose');

  content = migrateNavBlock(content, label, {
    theme: 'immobilier-legacy-inline-css',
    tokens: {
      HOME_PREFIX: '/',
      IMMOBILIER_ACTIVE_DESKTOP: ' aria-current="page"',
      IMMOBILIER_ACTIVE_MOBILE: ' aria-current="page"',
      CTA_HREF: '#estimation',
      CTA_LABEL: 'Faire estimer mon bien',
      MOBILE_CTA_HREF: '/bilan-patrimonial',
      MOBILE_CTA_LABEL: 'Prendre rendez-vous',
    },
    items: { temoignages: true },
  });

  writeFile('immobilier.html', content);
  console.log('[migré, CSS inline conservé] ' + label);
}

/* ─────────────────────────────────────────────────────────────────────
   3) pages de la famille Immobilier (succession, estimation) —
      centralisation complète
───────────────────────────────────────────────────────────────────── */
function migrateImmobilierFamily(relPath, config) {
  let content = readFile(relPath);

  const cssBlock =
`#nav { position: fixed; top: 0; left: 0; right: 0; height: 72px; background: rgba(250, 250, 247, 0.98); box-shadow: var(--shadow-md); display: flex; align-items: center; justify-content: space-between; padding: 0 40px; z-index: 100; transition: all 0.3s ease; }
    #nav.scrolled { height: 68px; }
    .nav-logo img { height: 48px; width: auto; display: block; opacity: .9; }
    .nav-links { display: flex; list-style: none; gap: 40px; flex: 1; margin-left: 60px; }
    .nav-links a { text-decoration: none; color: var(--ink); font-size: 14px; font-weight: 500; transition: color 0.2s ease; }
    .nav-links a:hover { color: var(--coral); }
    .nav-links a.active { color: var(--coral); }
    .nav-dropdown { position: relative; }
    .dropdown-toggle { display: flex; align-items: center; gap: 5px; }
    .chevron { display: inline-block; transition: transform .2s; font-size: 10px; line-height: 1; }
    .nav-dropdown:hover .chevron, .nav-dropdown:focus-within .chevron { transform: rotate(180deg); }
    .dropdown-menu { display: none; position: absolute; top: 28px; left: 0; background: var(--white); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-lg); padding: 12px; min-width: 240px; list-style: none; z-index: 300; }
    .nav-dropdown:hover .dropdown-menu, .nav-dropdown:focus-within .dropdown-menu { display: block; }
    .dropdown-menu li a { display: block; padding: 8px 12px; border-radius: var(--r-sm); color: var(--ink); font-size: 13px; }
    .dropdown-menu li a:hover { background: var(--sand); color: var(--coral); }
    .dropdown-section { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--slate); }
    .nav-cta-btn { background: var(--coral); color: var(--coral-foreground); padding: 10px 22px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 13px; transition: all 0.25s ease; line-height: 1.25; white-space: nowrap; }
    .nav-cta-btn:hover { background: var(--coral-light); box-shadow: var(--shadow-coral); transform: translateY(-2px); }
    .hamburger { display: none; flex-direction: column; background: none; border: none; cursor: pointer; gap: 6px; margin-left: auto; }
    .hamburger span { width: 24px; height: 2px; background: var(--ink); transition: all 0.3s ease; }
    .hamburger.open span:nth-child(1) { transform: rotate(45deg) translate(8px, 8px); }
    .hamburger.open span:nth-child(2) { opacity: 0; }
    .hamburger.open span:nth-child(3) { transform: rotate(-45deg) translate(7px, -7px); }
    .mobile-menu { display: none; position: fixed; top: 72px; left: 0; right: 0; background: var(--white); flex-direction: column; padding: 20px; gap: 12px; z-index: 99; max-height: calc(100vh - 72px); overflow-y: auto; }
    .mobile-menu.open { display: flex; }
    .mobile-menu a { padding: 12px 16px; text-decoration: none; color: var(--ink); font-weight: 500; border-radius: var(--r-sm); transition: all 0.2s ease; }
    .mobile-menu a:hover { background: var(--sand); color: var(--coral); }`;

  content = replaceOnce(content, cssBlock,
    '/* Navigation : voir /assets/css/navigation-immobilier.css (centralisé, MENU-1.5) */', relPath + ' CSS');

  content = insertBeforeHead(content, '<link rel="stylesheet" href="/assets/css/navigation-immobilier.css">', relPath);

  const jsBlock =
`    const nav = document.getElementById('nav');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
      document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
    });
    document.getElementById('hamburger').addEventListener('click', function() {
      document.getElementById('mobileMenu').classList.toggle('open');
      this.classList.toggle('open');
    });`;

  const jsReplacement =
`    window.addEventListener('scroll', () => {
      document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
    });`;

  content = replaceOnce(content, jsBlock, jsReplacement, relPath + ' JS scroll+hamburger');

  const autocloseBlock =
`  <script>
  /* Ferme le menu mobile au clic sur un lien (ancre ou page) - correctif audit 13/09/2026 */
  (function(){
    var mm = document.getElementById('mobileMenu');
    var hb = document.getElementById('hamburger');
    if (mm) {
      mm.querySelectorAll('a').forEach(function(a){
        a.addEventListener('click', function(){
          mm.classList.remove('open');
          if (hb) hb.classList.remove('open');
        });
      });
    }
  })();
  </script>`;

  content = replaceOnce(content, autocloseBlock,
    '  <script src="/assets/js/navigation.js" defer></script>', relPath + ' JS autoclose');

  content = migrateNavBlock(content, relPath, config);

  writeFile(relPath, content);
  console.log('[migré] ' + relPath);
}

/* ─────────────────────────────────────────────────────────────────────
   Exécution
───────────────────────────────────────────────────────────────────── */
migrateIndex();
migrateImmobilier();
migrateImmobilierFamily('immobilier/succession-colombes.html', {
  theme: 'immobilier',
  tokens: {
    HOME_PREFIX: '/',
    IMMOBILIER_ACTIVE_DESKTOP: ' class="active"',
    IMMOBILIER_ACTIVE_MOBILE: '',
    CTA_HREF: '#diagnostic',
    CTA_LABEL: 'Demander mon Diagnostic Succession 360',
    MOBILE_CTA_HREF: '#diagnostic',
    MOBILE_CTA_LABEL: 'Demander mon Diagnostic Succession 360',
  },
  items: { temoignages: false },
});
migrateImmobilierFamily('immobilier/estimation-colombes.html', {
  theme: 'immobilier',
  tokens: {
    HOME_PREFIX: '/',
    IMMOBILIER_ACTIVE_DESKTOP: ' class="active"',
    IMMOBILIER_ACTIVE_MOBILE: '',
    CTA_HREF: '#estimation',
    CTA_LABEL: 'Estimer mon bien gratuitement',
    CTA_EXTRA: ' data-track="estimate_hero_cta"',
    MOBILE_CTA_HREF: '#estimation',
    MOBILE_CTA_LABEL: 'Estimer mon bien gratuitement',
  },
  items: { temoignages: false },
});

console.log('\nMigration terminée. Lancer maintenant : node scripts/build-header.js');
