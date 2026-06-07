#!/usr/bin/env node
/**
 * Génère sitemap.xml en scannant les fichiers HTML du repo.
 * - Exclut les pages "noindex" (404, merci, mentions, etc.) listées dans EXCLUDE.
 * - URLs sans extension .html (Vercel cleanUrls = true).
 * - lastmod = date du dernier commit qui a touché le fichier (git log -1).
 *
 * Sortie : sitemap.xml à la racine du repo.
 * Code de sortie : 0 si OK, 1 si erreur.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE = 'https://proactifsconseils.fr';
const ROOT = path.resolve(__dirname, '..');

// Pages à ne PAS inclure dans le sitemap
const EXCLUDE = new Set([
  '404.html',
  'merci-guide.html',
  'guide-5-erreurs-patrimoniaux.html', // landing lead magnet (ajuste si tu veux l'inclure)
]);

// Priorités par défaut selon le type de page
function priorityFor(urlPath) {
  if (urlPath === '/') return '1.0';
  if (urlPath === '/bilan-patrimonial') return '0.9';
  if (urlPath === '/optimisation-fiscale-ile-de-france') return '0.9';
  if (urlPath.startsWith('/conseiller-patrimoine-')) return '0.7';
  if (urlPath.startsWith('/blog/')) return '0.7';
  if (urlPath === '/blog') return '0.8';
  return '0.8';
}

function changefreqFor(urlPath) {
  if (urlPath === '/') return 'weekly';
  if (urlPath.startsWith('/blog/')) return 'yearly';
  return 'monthly';
}

function htmlToUrlPath(filePath) {
  // filePath relatif à ROOT, ex: "blog/scpi-2026.html"
  const rel = filePath.replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
  return '/' + rel.replace(/\.html$/, '');
}

function getLastmod(filePath) {
  try {
    const date = execSync(`git log -1 --format=%cs -- "${filePath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    if (date) return date;
  } catch (e) {
    // pas de git history (premier commit, fichier non tracké)
  }
  // fallback : aujourd'hui
  return new Date().toISOString().slice(0, 10);
}

function findHtmlFiles(dir, base = '') {
  const results = [];
  const entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // Ne scanner que /blog (et la racine). Ignorer node_modules, .git, etc.
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'scripts') continue;
      if (entry.name === 'api') continue;
      if (entry.name === 'images') continue;
      if (entry.name === 'files') continue;
      if (entry.name === 'Audits SEO') continue;
      if (entry.name === 'Lead magnets') continue;
      // Récursion uniquement dans /blog pour l'instant
      if (base === '' && entry.name !== 'blog') continue;
      results.push(...findHtmlFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      if (EXCLUDE.has(rel)) continue;
      results.push(rel);
    }
  }
  return results;
}

// --- TEMPORAIRE : grille 3 colonnes + image RSU (à retirer après exécution) ---
function tempRsuAssets() {
  try {
    const touched = [];
    const img = path.join(ROOT, 'images', 'stock-rsu.webp');
    if (!fs.existsSync(img)) {
      execSync('curl -fsSL -o "' + img + '" "https://ucecd2703b69f3f366e934b160b9.dl.dropboxusercontent.com/cd/0/get/DB9k7xI9tpHXRL75Wj7jwqa7F6guiof0a-wKLCFnqOSxmUDASAHtwRR39_yoCvVYtrPGBVswmmf1Mb4D_8PV2Zkh-gqcziGWK4Zg8lq8nuY2PEE8MRudJ8tDCCxMSufNbgytkThPVfVPzNKmtq3mxfZi0Uo40nX2DAnmiZIT9q9XoA/file"', { cwd: ROOT });
      const sz = fs.statSync(img).size;
      if (sz !== 64046) throw new Error('taille image inattendue: ' + sz);
      touched.push('images/stock-rsu.webp');
    }
    const pIdx = path.join(ROOT, 'index.html');
    let d = fs.readFileSync(pIdx, 'utf8');
    const before = d;
    d = d.replace('grid-template-columns: repeat(4, 1fr);', 'grid-template-columns: repeat(3, 1fr);');
    d = d.replace('src="/images/placement-financier.webp" alt="Fiscalité RSU, stock-options et actions gratuites"', 'src="/images/stock-rsu.webp" alt="Fiscalité RSU, stock-options et actions gratuites"');
    if (d !== before) {
      fs.writeFileSync(pIdx, d, 'utf8');
      touched.push('index.html');
    }
    const pPage = path.join(ROOT, 'fiscalite-rsu-stock-options.html');
    let e = fs.readFileSync(pPage, 'utf8');
    const beforeE = e;
    e = e.replace("url('/images/retraite-couple.jpg')", "url('/images/stock-rsu.webp')");
    if (e !== beforeE) {
      fs.writeFileSync(pPage, e, 'utf8');
      touched.push('fiscalite-rsu-stock-options.html');
    }
    if (touched.length) {
      execSync('git config user.name "github-actions[bot]"', { cwd: ROOT });
      execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', { cwd: ROOT });
      execSync('git add ' + touched.join(' '), { cwd: ROOT });
      execSync('git commit -m "fix: grille services 3 colonnes + image dédiée stock-rsu.webp"', { cwd: ROOT });
      execSync('git push', { cwd: ROOT });
      console.log('[temp-rsu-assets] poussé :', touched.join(', '));
    } else {
      console.log('[temp-rsu-assets] rien à faire');
    }
  } catch (e) { console.error('[temp-rsu-assets] erreur', e.message); }
}

function buildSitemap() {
  const files = findHtmlFiles('.').sort();
  const urls = files.map((file) => {
    const urlPath = htmlToUrlPath(file);
    return {
      loc: `${SITE}${urlPath === '/' ? '' : urlPath}`,
      lastmod: getLastmod(file),
      changefreq: changefreqFor(urlPath),
      priority: priorityFor(urlPath),
    };
  });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${u.loc}</loc>\n` +
          `    <lastmod>${u.lastmod}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`
      )
      .join('\n') +
    '\n</urlset>\n';

  const outPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(outPath, xml, 'utf8');
  console.log(`[sitemap] ${urls.length} URLs écrites dans sitemap.xml`);
  return urls.map((u) => u.loc);
}

if (require.main === module) {
  tempRsuAssets();
  buildSitemap();
}

module.exports = { buildSitemap };
