#!/usr/bin/env node
/**
 * Anti-régression responsive mobile (audit du 13/09/2026).
 *
 * Scanne tous les .html du repo et détecte les 3 bugs corrigés ce jour-là :
 *   1. .mobile-menu sans max-height/overflow-y : les derniers liens du menu
 *      (Blog, CTA) sortent de l'écran sur mobile, sans scroll possible.
 *   2. Aucun script ne referme le menu mobile au clic sur un lien interne.
 *   3. #nav en background: transparent (ou règles #nav:not(.scrolled)) alors
 *      qu'un bandeau fil d'Ariane clair (.breadcrumb) suit la nav : nav et
 *      bouton menu invisibles tant qu'on n'a pas scrollé.
 *
 * À lancer :
 *   - à la main avant un déploiement : `node scripts/check-mobile-nav.js`
 *   - juste après la génération d'une page par l'agent SEO, en complément du
 *     filet de sécurité déjà intégré dans agent-seo-proactifs-v2/lib/blog-publish.ts
 *     (fixMobileNavCss) — celui-ci corrige automatiquement à la génération,
 *     ce script sert à vérifier après coup (pages générées ou éditées à la main).
 *
 * Sortie : liste les pages en défaut par bug, code de sortie 0 si tout est
 * propre, 1 si au moins une page a un problème.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Pages sans nav complète (pas de menu mobile) : hors périmètre de ce check.
const SKIP_NO_MENU = new Set([
  '404.html',
  'brevo-architecture-contacts.html',
  'guide-5-erreurs-patrimoniaux.html',
  'merci-avis.html',
  'merci-guide.html',
]);

// Pages où la nav transparente est volontaire (hero sombre juste sous la
// nav, pas de bandeau fil d'Ariane) : à ne jamais forcer en opaque.
const TRANSPARENT_NAV_OK = new Set(['index.html', 'blog/index.html']);

function listHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      listHtmlFiles(full, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

// MENU-1.5 (16/09/2026) -- pages dont le <nav> est centralise via
// partials/header.html + scripts/build-header.js : leur CSS de nav (et donc
// la regle .mobile-menu) peut vivre dans un fichier externe plutot que dans
// un <style> inline, et leur comportement (fermeture au clic) vient du
// script partage assets/js/navigation.js plutot que d'un bloc inline
// commente "correctif audit 13/09/2026". On tient compte des deux cas pour
// ne pas perdre la couverture de ce check sur ces pages.
const CENTRALIZED_NAV_CSS = ['assets/css/navigation.css', 'assets/css/navigation-immobilier.css'];
const CENTRALIZED_NAV_JS = 'assets/js/navigation.js';

function resolveEffectiveNavContent(content) {
  let effective = content;
  const linkRe = /<link[^>]+href=["']\/?(assets\/css\/[\w.-]+\.css)["'][^>]*>/g;
  let m;
  while ((m = linkRe.exec(content))) {
    const cssRelPath = m[1];
    if (CENTRALIZED_NAV_CSS.includes(cssRelPath)) {
      const cssPath = path.join(ROOT, cssRelPath);
      if (fs.existsSync(cssPath)) {
        effective += '\n' + fs.readFileSync(cssPath, 'utf8');
      }
    }
  }
  return effective;
}

function hasAutocloseScript(content) {
  if (content.includes('mobile-menu-autoclose') || content.includes('correctif audit 13/09/2026')) {
    return true;
  }
  // Script centralise (MENU-1.5) : assets/js/navigation.js ferme .mobile-menu
  // au clic sur un lien (cf. son propre code, deja verifie).
  return content.includes(CENTRALIZED_NAV_JS);
}

function checkFile(relPath) {
  const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const issues = [];

  if (SKIP_NO_MENU.has(relPath)) return issues;

  const effectiveContent = resolveEffectiveNavContent(content);

  // 1. .mobile-menu sans max-height/overflow-y
  if (effectiveContent.includes('.mobile-menu')) {
    const m = effectiveContent.match(/\.mobile-menu\s*\{[^}]*\}/);
    if (!m || !/overflow-y|max-height/.test(m[0])) {
      issues.push('menu-mobile-deborde (pas de max-height/overflow-y sur .mobile-menu)');
    }
    if (!hasAutocloseScript(content)) {
      issues.push('menu-ne-se-referme-pas (aucun script ne ferme .mobile-menu au clic sur un lien)');
    }
  }

  // 3. nav transparente + bandeau clair
  if (!TRANSPARENT_NAV_OK.has(relPath) && /class=["']breadcrumb["']/.test(content)) {
    const navBlock = effectiveContent.match(/#nav\s*\{[^}]*\}/);
    const navTransparent = navBlock && /background:\s*transparent/.test(navBlock[0]);
    const hasNotScrolledOverride = /#nav:not\(\.scrolled\)/.test(effectiveContent);
    if (navTransparent || hasNotScrolledOverride) {
      issues.push('nav-invisible-avant-scroll (#nav transparent ou #nav:not(.scrolled) avec un bandeau fil d\'Ariane)');
    }
  }
  // 4. MENU-3 : pages à menu mobile 2 niveaux — vérifier la présence réelle
  //    des 5 sous-vues (Patrimoine / Immobilier / Financement / Entreprises & Pro / Conseils)
  //    et de leurs liens clés (architecture Phase 2A-1a, 24/09/2026).
  if (content.includes('data-view="root"')) {
    var panels = {
      patrimoine: ['/bilan-patrimonial', '/preparation-retraite', '/transmission', '/fiscalite-rsu-stock-options'],
      immobilier: ['/immobilier/estimation-colombes', '/immobilier', '/investissement-immobilier'],
      financement: ['/courtage-credit-immobilier', '/pret-immobilier', '/simulateurs'],
      entreprises: ['/cession-entreprise'],
      conseils: ['/blog'],
    };
    Object.keys(panels).forEach(function (view) {
      if (!content.includes('data-view="' + view + '"')) {
        issues.push('menu2-panel-absent (sous-vue ' + view + ' introuvable)');
        return;
      }
      panels[view].forEach(function (href) {
        if (!content.includes('href="' + href + '"')) {
          issues.push('menu2-lien-absent (' + view + ' -> ' + href + ')');
        }
      });
    });
  }

  return issues;
}

function main() {
  const files = listHtmlFiles(ROOT).sort();
  let totalIssues = 0;
  const report = [];

  for (const f of files) {
    const issues = checkFile(f);
    if (issues.length) {
      totalIssues += issues.length;
      report.push({ file: f, issues });
    }
  }

  if (report.length === 0) {
    console.log(`✓ ${files.length} pages HTML scannées, aucune régression mobile détectée.`);
    process.exit(0);
  }

  console.log(`✗ ${report.length} page(s) avec un problème sur ${files.length} scannées :\n`);
  for (const { file, issues } of report) {
    console.log(`  ${file}`);
    for (const issue of issues) console.log(`    - ${issue}`);
  }
  console.log(`\nTotal : ${totalIssues} problème(s). Voir la mémoire du projet Cowork (feedback nav/menu mobile) pour le correctif.`);
  process.exit(1);
}

main();
