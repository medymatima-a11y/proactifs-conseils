#!/usr/bin/env node
/* ==========================================================================
 * NAV-UX-1A — Générateur de breadcrumbs centralisés
 * --------------------------------------------------------------------------
 * UNE source de vérité : scripts/breadcrumb-pages.json
 *   -> fil d'Ariane HTML visible (accessible : <nav><ol>)   entre <!-- BREADCRUMB:START/END -->
 *   -> BreadcrumbList JSON-LD (<head>)                       entre <!-- BREADCRUMB_JSONLD:START/END -->
 *   -> <link> vers /assets/css/breadcrumb.css
 *
 * Système INDÉPENDANT du header : ne touche jamais
 *   <!-- NAV:START --> / <!-- NAV:END -->, partials/header.html,
 *   scripts/build-header.js, navigation*.css, navigation.js.
 *
 * Modes :
 *   node scripts/build-breadcrumbs.js          -> génère / met à jour (idempotent)
 *   node scripts/build-breadcrumbs.js --check   -> vérifie seulement (exit 1 si écart)
 *
 * "Seed" (1re passe sur une page) : retire l'ancien breadcrumb legacy
 * (.breadcrumb / .breadcrumb-bar / commentaire <!-- BREADCRUMB --> / ancien
 * BreadcrumbList) puis insère les marqueurs. Les passes suivantes ne font que
 * rafraîchir le contenu entre marqueurs.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'scripts', 'breadcrumb-pages.json');
const NAV_PAGES = path.join(ROOT, 'scripts', 'nav-pages.json');
const CSS_HREF = '/assets/css/breadcrumb.css';

const CHECK = process.argv.includes('--check');

const BC_START = '<!-- BREADCRUMB:START -->';
const BC_END = '<!-- BREADCRUMB:END -->';
const LD_START = '<!-- BREADCRUMB_JSONLD:START -->';
const LD_END = '<!-- BREADCRUMB_JSONLD:END -->';

function fail(msg) { errors.push(msg); }
let errors = [];
let warnings = [];

// ---- helpers -------------------------------------------------------------
function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absUrl(domain, url) {
  if (url === '/') return domain + '/';
  return domain + url;
}

// URLs réelles dérivées de nav-pages.json (validation des parents)
function realUrlSet() {
  const raw = JSON.parse(fs.readFileSync(NAV_PAGES, 'utf8'));
  const files = Array.isArray(raw) ? raw : (raw.pages || []);
  const set = new Set();
  for (const f of files) {
    let u = '/' + f.replace(/index\.html$/, '').replace(/\.html$/, '');
    // normalise "/blog/" -> "/blog", garde "/" pour index racine
    if (u.length > 1) u = u.replace(/\/$/, '');
    if (f === 'index.html') u = '/';
    set.add(u);
  }
  return set;
}

// ---- génération du HTML visible -----------------------------------------
function renderHtml(page) {
  const crumbs = page.trail.concat([{ label: page.label, url: page.url, current: true }]);
  const lis = crumbs.map((c) => {
    if (c.current) {
      return `      <li><span aria-current="page">${htmlEscape(c.label)}</span></li>`;
    }
    return `      <li><a href="${c.url}">${htmlEscape(c.label)}</a></li>`;
  }).join('\n');
  return [
    BC_START,
    '  <nav class="breadcrumb" aria-label="Fil d\'Ariane">',
    '    <ol>',
    lis,
    '    </ol>',
    '  </nav>',
    '  ' + BC_END,
  ].join('\n');
}

// ---- génération du JSON-LD ----------------------------------------------
function renderJsonLd(page, domain) {
  const crumbs = page.trail.concat([{ label: page.label, url: page.url }]);
  const items = crumbs.map((c, i) =>
    `      {"@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(c.label)}, "item": "${absUrl(domain, c.url)}"}`
  ).join(',\n');
  return [
    LD_START,
    '  <script type="application/ld+json">',
    '  {',
    '    "@context": "https://schema.org",',
    '    "@type": "BreadcrumbList",',
    '    "itemListElement": [',
    items,
    '    ]',
    '  }',
    '  </script>',
    '  ' + LD_END,
  ].join('\n');
}

// ---- extraction du bloc entre marqueurs ----------------------------------
function between(html, start, end) {
  const i = html.indexOf(start);
  if (i === -1) return null;
  const j = html.indexOf(end, i);
  if (j === -1) return null;
  return html.slice(i, j + end.length);
}

// ---- seed : insertion des marqueurs + nettoyage legacy -------------------
function seedVisible(html, page) {
  // retirer commentaire legacy "<!-- BREADCRUMB -->" (pages locales)
  html = html.replace(/[ \t]*<!--\s*BREADCRUMB\s*-->[ \t]*\r?\n/g, '');

  // retirer bloc .breadcrumb-bar (pages locales) : <div class="breadcrumb-bar">...</div></div>
  {
    const re = /[ \t]*<div class="breadcrumb-bar">[\s\S]*?<\/div>\s*<\/div>[ \t]*\r?\n?/;
    if (re.test(html)) html = html.replace(re, '');
  }
  // retirer bloc .breadcrumb (div simple ou multiligne)
  {
    const re = /[ \t]*<div class="breadcrumb">[\s\S]*?<\/div>[ \t]*\r?\n?/;
    if (re.test(html)) html = html.replace(re, '');
  }

  // insérer les marqueurs juste après NAV:END
  const navEnd = '<!-- NAV:END -->';
  const idx = html.indexOf(navEnd);
  if (idx === -1) throw new Error('NAV:END introuvable');
  const insertAt = idx + navEnd.length;
  const block = '\n\n' + renderHtml(page) + '\n';
  html = html.slice(0, insertAt) + block + html.slice(insertAt);
  return html;
}

function seedJsonLd(html, page, domain) {
  // retirer un éventuel BreadcrumbList existant hors marqueurs
  html = html.replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>[ \t]*\r?\n?/g, (m) => {
    return /"BreadcrumbList"/.test(m) ? '' : m;
  });
  // insérer les marqueurs juste avant </head>
  const head = '</head>';
  const idx = html.indexOf(head);
  if (idx === -1) throw new Error('</head> introuvable');
  const block = '  ' + renderJsonLd(page, domain) + '\n';
  html = html.slice(0, idx) + block + html.slice(idx);
  return html;
}

function ensureCssLink(html) {
  if (html.includes(CSS_HREF)) return html;
  // insérer après le dernier <link ... navigation*.css ...>
  const re = /(<link[^>]+href="\/assets\/css\/navigation[^"]*\.css"[^>]*>)/g;
  let last = null, m;
  while ((m = re.exec(html)) !== null) last = m;
  const linkTag = `\n  <link rel="stylesheet" href="${CSS_HREF}">`;
  if (last) {
    const at = last.index + last[0].length;
    return html.slice(0, at) + linkTag + html.slice(at);
  }
  // repli : avant </head>
  const h = html.indexOf('</head>');
  if (h === -1) throw new Error('</head> introuvable pour lien CSS');
  return html.slice(0, h) + linkTag + '\n' + html.slice(h);
}

// ---- rafraîchit le contenu entre marqueurs existants ---------------------
function refreshBlock(html, start, end, generated) {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  const before = html.slice(0, i);
  const after = html.slice(j + end.length);
  // conserver l'indentation du marqueur de fin telle que générée
  return before + generated.replace(/^[ \t]*/, '') + after;
}

// ==========================================================================
function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const domain = cfg.domain;
  const pages = cfg.pages || [];
  const real = realUrlSet();

  // doublons de configuration
  const seenFile = new Set(), seenUrl = new Set();
  for (const p of pages) {
    if (seenFile.has(p.file)) fail(`Doublon config (file) : ${p.file}`);
    if (seenUrl.has(p.url)) fail(`Doublon config (url) : ${p.url}`);
    seenFile.add(p.file); seenUrl.add(p.url);
  }

  let written = 0, ok = 0;
  for (const page of pages) {
    const label = page.file;
    // validations config
    if (!page.url || !page.url.startsWith('/')) { fail(`${label}: url parent/self invalide`); continue; }
    for (const t of page.trail) {
      if (!t.url || !t.url.startsWith('/')) { fail(`${label}: URL parent invalide "${t && t.url}"`); }
      else if (!real.has(t.url)) { fail(`${label}: parent inexistant "${t.url}" (absent de nav-pages.json)`); }
    }

    const fp = path.join(ROOT, page.file);
    if (!fs.existsSync(fp)) { fail(`${label}: fichier absent sur le disque`); continue; }
    let html = fs.readFileSync(fp, 'utf8');
    const original = html;

    const genHtml = renderHtml(page);
    const genLd = renderJsonLd(page, domain);

    if (CHECK) {
      // vérifs
      const curBc = between(html, BC_START, BC_END);
      const curLd = between(html, LD_START, LD_END);
      if (!html.includes(CSS_HREF)) fail(`${label}: lien breadcrumb.css manquant`);
      if (curBc === null) { fail(`${label}: breadcrumb (marqueurs visibles) manquant`); }
      else if (curBc.replace(/[ \t]+$/gm, '') !== genHtml.replace(/^[ \t]*/, '').replace(/[ \t]+$/gm, '')) {
        fail(`${label}: breadcrumb visible différent de la configuration`);
      }
      if (curLd === null) { fail(`${label}: BreadcrumbList JSON-LD manquant`); }
      else if (curLd.replace(/[ \t]+$/gm, '') !== genLd.replace(/^[ \t]*/, '').replace(/[ \t]+$/gm, '')) {
        fail(`${label}: JSON-LD incohérent avec la configuration`);
      }
      // cohérence visible <-> JSON-LD (mêmes labels/ordre)
      if (curBc && curLd) {
        const visLabels = [...curBc.matchAll(/<(?:a[^>]*|span[^>]*)>([^<]+)<\/(?:a|span)>/g)].map(m => m[1].trim());
        const ldNames = [...curLd.matchAll(/"name":\s*("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]).trim());
        const visDecoded = visLabels.map(s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
        if (JSON.stringify(visDecoded) !== JSON.stringify(ldNames)) {
          fail(`${label}: labels visibles != labels JSON-LD (${JSON.stringify(visDecoded)} vs ${JSON.stringify(ldNames)})`);
        }
      }
      if (curBc && curLd) ok++;
      continue;
    }

    // MODE ÉCRITURE
    html = ensureCssLink(html);
    if (!html.includes(BC_START)) html = seedVisible(html, page);
    if (!html.includes(LD_START)) html = seedJsonLd(html, page, domain);
    // rafraîchir contenu
    html = refreshBlock(html, BC_START, BC_END, genHtml);
    html = refreshBlock(html, LD_START, LD_END, genLd);

    // garde-fou : ne jamais avoir touché les marqueurs NAV
    if ((html.match(/<!-- NAV:START -->/g) || []).length !== (original.match(/<!-- NAV:START -->/g) || []).length ||
        (html.match(/<!-- NAV:END -->/g) || []).length !== (original.match(/<!-- NAV:END -->/g) || []).length) {
      throw new Error(`${label}: marqueurs NAV altérés — abandon`);
    }
    // garde-fou : un seul bloc breadcrumb visible, un seul JSON-LD BreadcrumbList
    if ((html.match(/<!-- BREADCRUMB:START -->/g) || []).length !== 1) throw new Error(`${label}: BREADCRUMB dupliqué`);
    if ((html.match(/"@type": "BreadcrumbList"/g) || []).length !== 1) throw new Error(`${label}: BreadcrumbList dupliqué`);

    if (html !== original) {
      fs.writeFileSync(fp, html);
      written++;
      console.log(`  ✓ ${label}`);
    } else {
      console.log(`  = ${label} (inchangé)`);
    }
    ok++;
  }

  if (CHECK) {
    if (errors.length) {
      console.error('✗ build-breadcrumbs --check : ' + errors.length + ' anomalie(s)');
      errors.forEach(e => console.error('   - ' + e));
      process.exit(1);
    }
    console.log(`✓ build-breadcrumbs --check : ${ok}/${pages.length} page(s) conformes, 0 anomalie`);
    return;
  }

  if (errors.length) {
    console.error('✗ ' + errors.length + ' anomalie(s) de configuration :');
    errors.forEach(e => console.error('   - ' + e));
    process.exit(1);
  }
  console.log(`\nbuild-breadcrumbs : ${written} page(s) écrite(s), ${pages.length} configurée(s).`);
}

main();
