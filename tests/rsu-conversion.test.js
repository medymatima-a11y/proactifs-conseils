'use strict';
/* ==========================================================================
 * Tests RSU — parcours de conversion actionnariat salarié.
 * Couvre : couplage formulaire ↔ serveur (bilan patrimonial et formulaire RSU),
 * conformité des formulations (MIF2) sur les 12 pages du cluster, encarts de
 * conversion des articles, consentement GA4 du bilan, et champ d'application
 * des taux fiscaux (année de cession) sur la page déclaration.
 *
 * Complète tests/rsu-request.test.js, qui couvre l'endpoint /api/rsu-request.
 * ========================================================================== */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = (p) => path.join(__dirname, '..', p);
const read = (p) => fs.readFileSync(R(p), 'utf8');

const SUBSCRIBE = read('api/subscribe.js');
const BILAN = read('bilan-patrimonial.html');
const PILIER = read('fiscalite-rsu-stock-options.html');
const DECLARATION = read('declaration-rsu-espp-france.html');
const RSU_REQUEST = require(R('api/rsu-request.js'));

// Les 12 pages du cluster actionnariat : 2 pages piliers + 10 articles publiés.
const CLUSTER = [
  'fiscalite-rsu-stock-options.html',
  'declaration-rsu-espp-france.html',
  'blog/rsu-imposition-france-2026.html',
  'blog/espp-fiscalite-france-2026.html',
  'blog/quand-vendre-rsu-strategie-2026.html',
  'blog/bspce-fiscalite-startup-2026.html',
  'blog/declarer-rsu-formulaires-2026.html',
  'blog/rsu-pea-2026.html',
  'blog/stock-options-imposition-strategie-2026.html',
  'blog/actions-gratuites-aga-fiscalite-2026.html',
  'blog/rsu-expatriation-fiscalite-2026.html',
  'blog/investir-rsu-patrimoine-2026.html',
];

test('cluster : les 12 pages actionnariat existent au chemin attendu', () => {
  const absentes = CLUSTER.filter((p) => !fs.existsSync(R(p)));
  assert.deepStrictEqual(absentes, [], 'pages introuvables : ' + absentes.join(', '));
});

// Extrait les clés d'une table de correspondance de api/subscribe.js.
function mapKeys(source, name) {
  const block = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};').exec(source);
  assert.ok(block, name + ' introuvable dans api/subscribe.js');
  return [...block[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

// Extrait les libellés des <option> d'un <select> par son id.
function selectOptions(html, id, { withValue = false } = {}) {
  const block = new RegExp('<select[^>]*id="' + id + '"[\\s\\S]*?</select>').exec(html);
  assert.ok(block, 'select #' + id + ' introuvable');
  if (withValue) {
    return [...block[0].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  }
  return [...block[0].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
}

/* ── 1. Tagging des leads du bilan patrimonial ───────────────────────────── */
// Garde anti-régression : une option du formulaire sans clé correspondante
// enregistre le lead avec le code brut en préoccupation et le tag de repli
// « site-web », ce qui le rend non segmentable dans le CRM.

test('bilan : chaque option du formulaire a une clé dans TAG_MAP et LABEL_MAP', () => {
  const options = selectOptions(BILAN, 'f-service', { withValue: true });
  const tags = mapKeys(SUBSCRIBE, 'TAG_MAP');
  const labels = mapKeys(SUBSCRIBE, 'LABEL_MAP');
  assert.ok(options.length >= 9, 'formulaire attendu avec au moins 9 services, vu ' + options.length);
  const manquantes = options.filter((o) => !tags.includes(o) || !labels.includes(o));
  assert.deepStrictEqual(manquantes, [], 'options sans correspondance serveur : ' + manquantes.join(', '));
});

test('bilan : TAG_MAP et LABEL_MAP portent exactement le même jeu de clés', () => {
  const tags = mapKeys(SUBSCRIBE, 'TAG_MAP').slice().sort();
  const labels = mapKeys(SUBSCRIBE, 'LABEL_MAP').slice().sort();
  assert.deepStrictEqual(tags, labels);
});

test('bilan : le service actionnariat est tagué et libellé', () => {
  assert.match(SUBSCRIBE, /actionnariat:\s*'actionnariat-salarie'/);
  assert.match(SUBSCRIBE, /actionnariat:\s*'Optimiser mes RSU \/ stock-options'/);
});

/* ── 2. Couplage formulaire RSU ↔ listes acceptées par le serveur ────────── */
// L'endpoint rejette toute valeur hors liste (400). Un libellé modifié d'un
// seul côté casse le formulaire sans erreur visible à l'édition.

const COUPLAGES = [
  ['rsu-dispositif', 'DISPOSITIFS'],
  ['rsu-besoin', 'BESOINS'],
  ['rsu-echeance', 'ECHEANCES'],
];

for (const [id, liste] of COUPLAGES) {
  test('formulaire RSU : les options de #' + id + ' correspondent à ' + liste, () => {
    const attendues = new RegExp('const ' + liste + ' = \\[([\\s\\S]*?)\\];').exec(
      read('api/rsu-request.js')
    );
    assert.ok(attendues, liste + ' introuvable dans api/rsu-request.js');
    const serveur = [...attendues[1].matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)]
      .map((m) => (m[1] !== undefined ? m[1].replace(/\\'/g, "'") : m[2]));
    const page = selectOptions(PILIER, id);
    assert.deepStrictEqual(page, serveur);
  });
}

test('formulaire RSU : la page déclare l’action Turnstile attendue par le serveur', () => {
  assert.ok(
    PILIER.includes(RSU_REQUEST.TURNSTILE_ACTION),
    'action ' + RSU_REQUEST.TURNSTILE_ACTION + ' absente de la page'
  );
});

/* ── 3. Formulations — conformité MIF2 ──────────────────────────────────── */
// Règles du CLAUDE.md du dépôt. Le cluster RSU relève du conseil en gestion
// de patrimoine (CIF) : l'exception des pages immobilier ne s'y applique pas.

const INTERDITS = [
  /sans engagement/i,
  /aucun engagement/i,
  /conseiller ind[eé]pendant/i,
  /cabinet ind[eé]pendant/i,
  /conseil ind[eé]pendant/i,
  /sans conflit d'int[eé]r[eê]t/i,
  /meilleur produit/i,
];

for (const page of CLUSTER) {
  test('formulations : ' + page + ' ne porte aucun terme interdit', () => {
    const html = read(page);
    const trouves = INTERDITS.filter((re) => re.test(html)).map((re) => String(re));
    assert.deepStrictEqual(trouves, [], 'termes interdits : ' + trouves.join(', '));
  });
}

/* ── 4. Encarts de conversion des articles ──────────────────────────────── */

const ARTICLES_ENCART = [
  'blog/rsu-imposition-france-2026.html',
  'blog/espp-fiscalite-france-2026.html',
];

for (const article of ARTICLES_ENCART) {
  test('encart : ' + article + ' renvoie vers la page pilier', () => {
    const html = read(article);
    assert.match(html, /class="rsu-diag-cta"/, 'encart absent');
    assert.match(html, /href="\/fiscalite-rsu-stock-options"[^>]*data-cta="article_diagnostic_rsu"/, 'lien de suivi absent');
    assert.match(html, /\.rsu-diag-cta\s*\{/, 'CSS de l’encart absent : encart non stylé');
  });
}

/* ── 5. Consentement GA4 du formulaire de bilan ─────────────────────────── */

test('bilan : generate_lead n’est émis qu’avec le consentement analytique', () => {
  assert.match(BILAN, /function hasAnalyticsConsent\s*\(/, 'lecture du consentement absente');
  assert.match(BILAN, /pc_consent/, 'cookie de consentement non lu');
  const tracker = /function trackBilanLead[\s\S]*?\n  \}/.exec(BILAN);
  assert.ok(tracker, 'trackBilanLead introuvable');
  assert.match(tracker[0], /if \(!hasAnalyticsConsent\(\)\) return;/, 'garde de consentement absente');
  assert.match(tracker[0], /generate_lead/);
});

test('bilan : generate_lead n’est émis qu’après confirmation du serveur', () => {
  assert.match(BILAN, /data\.success === true.*trackBilanLead/, 'événement non conditionné à success:true');
});

test('bilan : le service actionnariat est une catégorie GA4 reconnue', () => {
  const liste = /var BILAN_SERVICES = \[([^\]]*)\]/.exec(BILAN);
  assert.ok(liste, 'BILAN_SERVICES introuvable');
  assert.match(liste[1], /'actionnariat'/);
});

/* ── 6. Taux fiscaux — champ d'application par année de cession ─────────── */
// Le taux des prélèvements sociaux sur les plus-values de cession dépend de
// l'année de la CESSION, pas de celle de la déclaration : 17,2 % pour 2025
// (flat tax 30 %), 18,6 % à compter du 1er janvier 2026 (flat tax 31,4 %).
// Source : service-public.fr, fiche F2329, mise à jour le 30 juin 2026.

test('fiscal : la page déclaration distingue les deux années de cession', () => {
  assert.match(DECLARATION, /cession réalisée en 2025/, 'régime 2025 non explicité');
  assert.match(DECLARATION, /à compter du 1<sup>er<\/sup> janvier 2026|à compter du 1er janvier 2026/, 'bascule 2026 non explicitée');
  assert.match(DECLARATION, /17,2&nbsp;%|17,2 %/, 'taux 2025 absent');
  assert.match(DECLARATION, /18,6&nbsp;%|18,6 %/, 'taux 2026 absent');
});

test('fiscal : aucun taux de flat tax annoncé sans son année de cession', () => {
  // « 31,4 % » et « 30 % » ne doivent jamais apparaître comme un taux unique
  // et intemporel : chaque mention vit dans une phrase qui nomme l'année.
  const sansAnnee = [...DECLARATION.matchAll(/[^.]*31,4(?:&nbsp;| )%[^.]*\./g)]
    .map((m) => m[0])
    .filter((phrase) => !/202[56]/.test(phrase));
  assert.deepStrictEqual(sansAnnee, [], 'mentions de 31,4 % sans année : ' + sansAnnee.join(' | '));
});

test('fiscal : l’exemple chiffré indique le taux de son année', () => {
  assert.match(DECLARATION, /11 236 €<\/strong>, au taux de 30&nbsp;% applicable aux cessions de 2025/);
});

test('fiscal : une source officielle datée est citée près des taux', () => {
  assert.match(
    DECLARATION,
    /service-public\.fr\/particuliers\/vosdroits\/F2329/,
    'source officielle des prélèvements sociaux absente'
  );
  assert.match(DECLARATION, /mise à jour le 30 juin 2026/, 'date de la source absente');
});

test('fiscal : le JSON-LD porte la même règle que le texte visible', () => {
  const blocs = [...DECLARATION.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocs.length > 0, 'aucun bloc JSON-LD');
  for (const [i, bloc] of blocs.entries()) {
    assert.doesNotThrow(() => JSON.parse(bloc[1]), 'bloc JSON-LD ' + (i + 1) + ' invalide');
  }
  const faq = blocs.map((b) => b[1]).join('\n');
  if (/31,4 %/.test(faq)) {
    assert.match(faq, /cession réalisée en 2025/, 'JSON-LD : 31,4 % sans le régime 2025');
  }
});

/* ── 7. Séparation gain d'acquisition / plus-value de cession ───────────── */
// Confondre les deux est l'erreur de fond du sujet : le gain d'acquisition
// (rabais ESPP, spread des stock-options) est imposé comme un salaire, la
// plus-value de cession relève de la flat tax.

test('fiscal : la page déclaration qualifie le rabais et le spread comme du salaire', () => {
  assert.match(DECLARATION, /rabais \(salaire\)/, 'rabais ESPP non qualifié de salaire');
  assert.match(DECLARATION, /spread à l'exercice est imposé comme salaire/, 'spread non qualifié de salaire');
});

test('fiscal : la flat tax n’est rattachée qu’aux plus-values de cession', () => {
  // Aucune phrase ne doit appliquer la flat tax au gain d'acquisition.
  const phrases = [...DECLARATION.matchAll(/[^.]*flat tax[^.]*\./gi)].map((m) => m[0]);
  const fautives = phrases.filter((p) => /gain d'acquisition|avantage en nature/i.test(p));
  assert.deepStrictEqual(fautives, [], 'flat tax rattachée au gain d’acquisition : ' + fautives.join(' | '));
});
