#!/usr/bin/env node
/**
 * Régénère le bloc <nav>…</nav> + menu mobile des pages listées dans
 * scripts/nav-pages.json à partir de la source unique partials/header.html
 * et de la configuration (CTA, état actif, éléments visibles) déclarée
 * dans chaque page via un commentaire <!-- NAV:CONFIG {...} -->.
 *
 * MENU-1.5 (16/09/2026) — centralisation du header, phase prototype.
 * Documentation complète : docs/NAVIGATION-PROACTIFS.md
 *
 * Usage :
 *   node scripts/build-header.js            # régénère toutes les pages du manifeste
 *   node scripts/build-header.js --check     # vérifie sans écrire (code de sortie 1 si désynchronisé)
 *
 * Ne fait QUE remplacer le contenu entre les marqueurs NAV:START / NAV:END.
 * Le reste de chaque page (contenu, CSS, autres scripts) n'est jamais touché.
 * Idempotent : relancer sans rien changer ne modifie aucun fichier.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTIAL_PATH = path.join(ROOT, 'partials', 'header.html');
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'nav-pages.json');

const NAV_START = '<!-- NAV:START (bloc généré par scripts/build-header.js — ne pas éditer à la main, voir docs/NAVIGATION-PROACTIFS.md) -->';
const NAV_END = '<!-- NAV:END -->';
const CONFIG_RE = /<!-- NAV:CONFIG (\{[\s\S]*?\}) -->/;

const CHECK_ONLY = process.argv.includes('--check');

const DEFAULT_TOKENS = {
  HOME_PREFIX: '',
  PATRIMOINE_ACTIVE_DESKTOP: '',
  IMMOBILIER_ACTIVE_DESKTOP: '',
  IMMOBILIER_ACTIVE_MOBILE: '',
  RESSOURCES_ACTIVE_DESKTOP: '',
  CABINET_ACTIVE_DESKTOP: '',
  CABINET_ACTIVE_MOBILE: '',
  CTA_HREF: '/bilan-patrimonial',
  CTA_LABEL: 'Prendre rendez-vous',
  CTA_EXTRA: '',
  MOBILE_CTA_HREF: '/bilan-patrimonial',
  MOBILE_CTA_LABEL: 'Prendre rendez-vous',
};

function renderTemplate(template, config) {
  const tokens = Object.assign({}, DEFAULT_TOKENS, config.tokens || {});
  let out = template;

  // Blocs conditionnels : <!--IF:key-->...<!--ENDIF:key-->
  out = out.replace(/<!--IF:(\w+)-->([\s\S]*?)<!--ENDIF:\1-->/g, function (m, key, body) {
    const items = config.items || {};
    const include = Object.prototype.hasOwnProperty.call(items, key) ? !!items[key] : true;
    return include ? body : '';
  });

  // Substitution des tokens {{X}}
  out = out.replace(/{{(\w+)}}/g, function (m, key) {
    if (!Object.prototype.hasOwnProperty.call(tokens, key)) {
      throw new Error('Token inconnu dans partials/header.html : ' + key);
    }
    return tokens[key];
  });

  return out;
}

function buildPage(relPath, template) {
  const filePath = path.join(ROOT, relPath);
  const html = fs.readFileSync(filePath, 'utf8');

  const configMatch = html.match(CONFIG_RE);
  if (!configMatch) {
    throw new Error(relPath + ' : commentaire NAV:CONFIG introuvable.');
  }
  let config;
  try {
    config = JSON.parse(configMatch[1]);
  } catch (e) {
    throw new Error(relPath + ' : NAV:CONFIG invalide (JSON) — ' + e.message);
  }

  const startIdx = html.indexOf(NAV_START);
  const endIdx = html.indexOf(NAV_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(relPath + ' : marqueurs NAV:START / NAV:END introuvables.');
  }

  const rendered = renderTemplate(template, config).trim();
  const before = html.slice(0, startIdx + NAV_START.length);
  const after = html.slice(endIdx);
  const next = before + '\n' + rendered + '\n' + after;

  if (next === html) {
    return { relPath, changed: false };
  }
  if (!CHECK_ONLY) {
    fs.writeFileSync(filePath, next, 'utf8');
  }
  return { relPath, changed: true };
}

function main() {
  const template = fs.readFileSync(PARTIAL_PATH, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  let anyChanged = false;
  for (const relPath of manifest.pages) {
    const result = buildPage(relPath, template);
    if (result.changed) {
      anyChanged = true;
      console.log((CHECK_ONLY ? '[désynchronisé] ' : '[régénéré] ') + result.relPath);
    } else {
      console.log('[à jour] ' + result.relPath);
    }
  }

  if (CHECK_ONLY && anyChanged) {
    console.error('\nAu moins une page est désynchronisée du partial. Lancer sans --check pour régénérer.');
    process.exit(1);
  }
}

main();
