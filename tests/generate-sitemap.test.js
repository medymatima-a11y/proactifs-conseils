'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://proactifsconseils.fr';
const { loadPermanentRedirectSources } = require('../scripts/generate-sitemap.js');
const SITEMAP = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

/* ---- Extraction générique des sources de redirection permanente ---- */
test('loadPermanentRedirectSources : littérales seulement (pas de wildcard ni host)', () => {
  const set = loadPermanentRedirectSources();
  assert.ok(set instanceof Set);
  assert.ok(set.size > 0, 'au moins une source permanente attendue');
  for (const src of set) {
    assert.ok(src.startsWith('/'), 'slash initial : ' + src);
    assert.ok(!src.includes(':') && !src.includes('*'), 'pas de pattern : ' + src);
    assert.ok(src === '/' || !src.endsWith('/'), 'pas de slash final : ' + src);
  }
  // cas concret couvert
  assert.ok(set.has('/simulation-pret-immobilier'), 'la source legacy doit être détectée');
});

/* ---- Invariant GÉNÉRIQUE : aucune source de redirection permanente au sitemap ---- */
test('Aucune source de redirection permanente ne figure dans le sitemap', () => {
  const set = loadPermanentRedirectSources();
  for (const src of set) {
    const url = SITE + (src === '/' ? '' : src);
    const loc = `<loc>${url}</loc>`;
    assert.ok(!SITEMAP.includes(loc), 'URL redirigée présente au sitemap : ' + url);
  }
});

/* ---- Sanité : les vraies pages simulateurs restent présentes ---- */
test('Sitemap : simulateurs valides présents, legacy redirigée absente', () => {
  assert.ok(SITEMAP.includes('<loc>' + SITE + '/simulateurs/capacite-emprunt</loc>'), 'capacité présente');
  assert.ok(SITEMAP.includes('<loc>' + SITE + '/simulateurs/mensualite-credit</loc>'), 'mensualité présente');
  assert.ok(!SITEMAP.includes('<loc>' + SITE + '/simulation-pret-immobilier</loc>'), 'simulation-pret absente');
});

/* ---- Cohérence : vercel.json déclare bien la redirection permanente attendue ---- */
test('vercel.json : redirection permanente simulation-pret -> capacité', () => {
  const r = (VERCEL.redirects || []).find(x => x.source === '/simulation-pret-immobilier');
  assert.ok(r, 'redirect présent');
  assert.strictEqual(r.permanent, true);
  assert.strictEqual(r.destination, '/simulateurs/capacite-emprunt');
});
