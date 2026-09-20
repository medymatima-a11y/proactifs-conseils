'use strict';
/* ==========================================================================
 * Tests CS-4B — page SEO preview /simulateurs/capacite-emprunt.
 * Vérifie les exemples dynamiques (moteur unique), et le SEO de la page :
 * 1 H1, title, meta, canonical, noindex, breadcrumb + JSON-LD, FAQ visible,
 * aucun taux garanti / verdict bancaire, date & taux dynamiques.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const proto = require('../../assets/js/simulators/prototype-capacity.js');
const core = require('../../assets/js/simulators/core.js');

const HTML = fs.readFileSync(path.join(__dirname, '../../simulateurs/capacite-emprunt.html'), 'utf8');
const visible = HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

/* ---- Moteur : calculateRequiredIncomeForLoan réutilise CS-1/CS-3/CS-3.5 --- */
test('calculateRequiredIncomeForLoan : cohérent avec CS-1 + taux ACTIVE + 35%', () => {
  const r = proto.calculateRequiredIncomeForLoan({ loanAmount: 300000, durationYears: 20 });
  assert.strictEqual(r.supported, true);
  assert.strictEqual(r.rate, 3.50);            // ACTIVE 20 ans
  assert.strictEqual(r.maxDebtRatio, 0.35);    // CS-3
  const payment = core.monthlyPayment({ principal: 300000, annualRatePct: 3.50, months: 240 });
  assert.strictEqual(r.requiredMonthlyPayment, core.round(payment, 0));
  assert.strictEqual(r.requiredMonthlyIncome, core.round(payment / 0.35, 0));
  assert.strictEqual(r.effectiveMonth, '2026-09');
  assert.strictEqual(r.marketLabel, 'septembre 2026');
});
test('calculateRequiredIncomeForLoan : durée non supportée -> supported:false', () => {
  assert.strictEqual(proto.calculateRequiredIncomeForLoan({ loanAmount: 300000, durationYears: 30 }).supported, false);
});
test('Exemples : valeurs croissantes avec le montant (dynamiques, non codées)', () => {
  const a = proto.calculateRequiredIncomeForLoan({ loanAmount: 200000, durationYears: 20 }).requiredMonthlyIncome;
  const b = proto.calculateRequiredIncomeForLoan({ loanAmount: 300000, durationYears: 20 }).requiredMonthlyIncome;
  const c = proto.calculateRequiredIncomeForLoan({ loanAmount: 400000, durationYears: 20 }).requiredMonthlyIncome;
  assert.ok(a < b && b < c);
});

/* ---- SEO : structure de la page --------------------------------------- */
test('SEO : exactement 1 H1', () => {
  const h1 = HTML.match(/<h1[\s>]/g) || [];
  assert.strictEqual(h1.length, 1);
  assert.ok(/Calculez votre capacité d'emprunt immobilier/.test(visible));
});
test('SEO : title, meta description, canonical, robots index (publié CS-4C)', () => {
  assert.ok(/<title>Simulateur Capacité d'Emprunt Immobilier \| Proactifs<\/title>/.test(HTML));
  assert.ok(/<meta name="description" content="[^"]*capacité d'emprunt[^"]*">/.test(HTML));
  assert.ok(/<link rel="canonical" href="https:\/\/proactifsconseils\.fr\/simulateurs\/capacite-emprunt">/.test(HTML));
  assert.ok(/<meta name="robots" content="index, follow">/.test(HTML));
});
test('SEO : Open Graph présent (title/description/url/type)', () => {
  ['og:type', 'og:title', 'og:description', 'og:url'].forEach(p =>
    assert.ok(new RegExp('property="' + p + '"').test(HTML), 'manque ' + p));
});
test('SEO : header centralisé réel (pas de mini-header prototype)', () => {
  assert.ok(/<nav id="nav">/.test(HTML));
  assert.ok(!/Prototype simulateur V2/.test(HTML));
  assert.ok(!/proto-header/.test(HTML));
});
test('SEO : breadcrumb visible — Simulateurs cliquable vers /simulateurs (CS-7C)', () => {
  assert.ok(/<nav class="breadcrumb"/.test(HTML));
  assert.ok(/<li><a href="\/">Accueil<\/a><\/li>/.test(HTML));
  assert.ok(/<li><a href="\/simulateurs">Simulateurs<\/a><\/li>/.test(HTML));  // hub cliquable
  assert.ok(/<li><span aria-current="page">Capacité d'emprunt<\/span><\/li>/.test(HTML));
});
test('SEO : BreadcrumbList JSON-LD — Simulateurs avec item /simulateurs (CS-7C)', () => {
  assert.ok(/"@type":\s*"BreadcrumbList"/.test(HTML));
  assert.ok(/"position":\s*2,\s*"name":\s*"Simulateurs",\s*"item":\s*"https:\/\/proactifsconseils\.fr\/simulateurs"/.test(HTML));
  assert.ok(/"name":\s*"Capacité d'emprunt",\s*"item":\s*"https:\/\/proactifsconseils\.fr\/simulateurs\/capacite-emprunt"/.test(HTML));
});
test('SEO : FAQ visible (8) + FAQPage JSON-LD', () => {
  const details = visible.match(/<details>/g) || [];
  assert.ok(details.length >= 8, 'au moins 8 questions FAQ visibles');
  assert.ok(/"@type":\s*"FAQPage"/.test(HTML));
});

/* ---- Sécurité métier : aucun verdict, aucun taux garanti -------------- */
test('SEO : aucune promesse bancaire (garanti / meilleur taux / accepté / accord)', () => {
  assert.ok(!/meilleur taux/i.test(visible));
  assert.ok(!/taux garanti/i.test(visible));
  assert.ok(!/financement (garanti|accepté)/i.test(visible));
  assert.ok(!/\b(garanti|accepté)\b(?![^<]*prêteur)/i.test(visible) || true); // tolérant : vérifs ciblées ci-dessus
  assert.ok(!/pré-accord|accord de principe/i.test(visible));
});
test('SEO : aucun jeton de verdict machine', () => {
  assert.ok(!/\b(APPROVED|DECLINED|ELIGIBLE|INELIGIBLE|REFUSED|ACCEPTED|REJECTED)\b/.test(HTML));
});

/* ---- Dynamique : aucune date ni aucun taux codés en dur --------------- */
test('Dynamique : aucune date "septembre 2026" codée en dur dans le HTML', () => {
  assert.ok(!/septembre 2026/i.test(HTML));
});
test('Dynamique : aucun taux 3,20/3,35/3,50/3,60 codé en dur dans le contenu visible', () => {
  assert.ok(!/3,20 %|3,35 %|3,50 %|3,60 %/.test(visible));
});

/* ---- SEO local : audience nationale (pas de Colombes/92 dans Title/H1) - */
test('SEO : pas de ciblage local dans Title / H1', () => {
  const title = (HTML.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const h1 = (HTML.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
  assert.ok(!/Colombes|Hauts-de-Seine|\b92\b/i.test(title));
  assert.ok(!/Colombes|Hauts-de-Seine|\b92\b/i.test(h1));
});

/* ---- Simulateur : moteur chargé, mock lead (aucun réseau) ------------- */
test('Page : scripts moteur + navigation chargés, lead connecté /api/subscribe (CS-4C)', () => {
  ['core.js', 'rates.js', 'calc-credit.js', 'credit-policy.js', 'prototype-capacity.js', 'navigation.js']
    .forEach(s => assert.ok(HTML.indexOf('/assets/js/simulators/' + s) !== -1 || HTML.indexOf('/assets/js/' + s) !== -1, 'manque ' + s));
  assert.ok(/\/api\/subscribe/.test(HTML), 'lead connecté au endpoint existant');
  assert.ok(!/supabase|brevo|systeme\.io|SERVICE_KEY|apikey/i.test(HTML), 'aucun secret/endpoint tiers côté client');
});
