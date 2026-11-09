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

// Le formulaire simplifié a été retiré : c'est le diagnostic en six étapes qui
// alimente l'API. Chaque réponse doit appartenir à la liste que le serveur
// accepte, sinon l'envoi part en 400 sans rien d'visible à l'édition.
const api = require('../api/rsu-request.js');

function actioSteps() {
  const m = PILIER.match(/const actioSteps = (\[[\s\S]*?\n    \]);/);
  assert.ok(m, 'actioSteps introuvable dans la page pilier');
  return new Function('return ' + m[1])();
}
// Valeur réellement transmise : libellé court `s` s'il existe, sinon le libellé.
function valeurs(step) {
  return step.opts.map((o) => (o.s !== undefined ? o.s : o.l));
}

test('diagnostic : les six étapes sont intactes (cinq questions + contact)', () => {
  const steps = actioSteps();
  assert.strictEqual(steps.length, 5, 'le diagnostic doit garder ses cinq questions');
  assert.deepStrictEqual(steps.map((s) => s.q), [
    "De quel type de plan s'agit-il ?",
    'Votre situation a-t-elle une dimension internationale ?',
    'Quel montant représentent vos actions, à peu près ?',
    'Où en êtes-vous aujourd\'hui ?',
    'Qu\'attendez-vous en priorité ?',
  ]);
  for (const id of ['wPrenom', 'wNom', 'wEmail', 'wTel']) {
    assert.ok(PILIER.includes('id="' + id + '"'), 'champ de contact ' + id + ' absent');
  }
});

const COUPLAGES = [
  [0, 'DISPOSITIFS', 'Q1 type de plan'],
  [1, 'INTERNATIONAL', 'Q2 dimension internationale'],
  [2, 'MONTANTS', 'Q3 montant'],
  [3, 'STADES', 'Q4 stade'],
  [4, 'BESOINS', 'Q5 attente'],
];

for (const [i, liste, label] of COUPLAGES) {
  test('diagnostic : les réponses de ' + label + ' sont acceptées par ' + liste, () => {
    const options = valeurs(actioSteps()[i]);
    const acceptees = api[liste];
    assert.ok(Array.isArray(acceptees), liste + ' non exportée par api/rsu-request.js');
    const refusees = options.filter((o) => !acceptees.includes(o));
    assert.deepStrictEqual(refusees, [], label + ' : valeurs refusées par le serveur');
  });
}

test('diagnostic : chaque réponse a une colonne, aucune perte silencieuse', () => {
  // validate() ne recopie que les clés qu'il connaît : un champ oublié ici
  // disparaîtrait sans message d'erreur. Ce test est le garde-fou.
  const steps = actioSteps();
  const envoi = {
    prenom: 'Camille', nom: 'Durand', email: 'camille@example.com', telephone: '06 00 00 00 02',
    dispositif: valeurs(steps[0])[0],
    dimension_internationale: valeurs(steps[1])[1],
    montant_estime: valeurs(steps[2])[3],
    stade: valeurs(steps[3])[1],
    besoin: valeurs(steps[4])[5],
    commentaire: '', consent: true,
  };
  const { data, error } = api.validate(envoi);
  assert.ok(!error, 'validate a refusé une réponse pourtant proposée : ' + error);
  for (const [k, v] of Object.entries(envoi)) {
    if (k === 'consent' || k === 'commentaire') continue;
    assert.strictEqual(data[k], v, 'champ perdu ou altéré : ' + k);
  }
  assert.strictEqual(data.consent_version, 'rsu-consent-v1');
});

test('diagnostic : la requête la plus lourde passe sous le plafond de taille', () => {
  const steps = actioSteps();
  const pire = {
    prenom: 'x'.repeat(80), nom: 'x'.repeat(80), email: 'x'.repeat(150) + '@ex.fr',
    telephone: '0'.repeat(30),
    dispositif: valeurs(steps[0]).reduce((a, b) => (a.length > b.length ? a : b)),
    dimension_internationale: valeurs(steps[1]).reduce((a, b) => (a.length > b.length ? a : b)),
    montant_estime: valeurs(steps[2]).reduce((a, b) => (a.length > b.length ? a : b)),
    stade: valeurs(steps[3]).reduce((a, b) => (a.length > b.length ? a : b)),
    besoin: valeurs(steps[4]).reduce((a, b) => (a.length > b.length ? a : b)),
    commentaire: 'x'.repeat(600), consent: true, website: '',
    captchaToken: 'x'.repeat(2048), // jeton Turnstile de taille maximale documentée
  };
  const taille = JSON.stringify(pire).length;
  assert.ok(taille <= api.MAX_BODY_CHARS,
    'corps de ' + taille + ' caractères pour un plafond de ' + api.MAX_BODY_CHARS);
});

test('page pilier : le formulaire simplifié a bien disparu', () => {
  for (const trace of ['contact-rsu', 'rsuForm', 'id="rsu-dispositif"', 'id="rsu-besoin"']) {
    assert.ok(!PILIER.includes(trace), 'trace du formulaire simplifié : ' + trace);
  }
});

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

// Corrigé le 09/11/2026. La règle précédente — 30 % pour une cession 2025,
// 31,4 % à partir de 2026 — était fausse : les plus-values de cession de valeurs
// mobilières sont des revenus du patrimoine visés à l'article L.136-6 CSS, et la
// hausse de CSG de l'article 12 de la LFSS 2026 les atteint dès l'imposition des
// revenus 2025. La page doit donc annoncer UN taux, et dire qu'il couvre 2025.
test('fiscal : la page couvre explicitement les cessions 2025 imposées en 2026', () => {
  assert.match(DECLARATION, /cessions réalisées en 2025 et imposées en 2026/,
    'la couverture des cessions 2025 n’est pas explicite');
  assert.match(DECLARATION, /L[.]136-6/, 'base légale (CSS L.136-6) absente');
  assert.match(DECLARATION, /financement de la sécurité sociale pour 2026/,
    'la LFSS 2026 doit être citée');
  assert.match(DECLARATION, /18,6&nbsp;%|18,6 %/, 'part de prélèvements sociaux absente');
});

test('fiscal : le PFU est annoncé à 31,4 %, jamais à 30 %', () => {
  // Le risque n’est plus l’absence d’année, c’est la survivance du 30 %.
  const trente = [...DECLARATION.matchAll(/[^.]*[^0-9]30(?:&nbsp;| )%[^.]*[.]/g)]
    .map((m) => m[0])
    .filter((phrase) => /flat tax|PFU|prélèvement forfaitaire/i.test(phrase));
  assert.deepStrictEqual(trente, [], 'PFU encore annoncé à 30 % : ' + trente.join(' | '));
  assert.match(DECLARATION, /31,4&nbsp;%|31,4 %/, 'taux du PFU absent');
  assert.match(DECLARATION, /12,8&nbsp;%|12,8 %/, 'part d’impôt sur le revenu absente');
});

test('fiscal : l’exemple chiffré applique bien 31,4 % à sa base', () => {
  // La base et le montant affichés restent arithmétiquement liés : sans cela, une
  // correction de taux peut laisser un montant périmé à l’écran.
  const base = 37454;
  const attendu = Math.round(base * 0.314);
  assert.strictEqual(attendu, 11761, 'arithmétique du PFU : ' + attendu);
  assert.ok(DECLARATION.includes('37 454 €'), 'base de l’exemple absente');
  assert.match(DECLARATION, /11 761 €<\/strong>, au taux de 31,4&nbsp;%/,
    'le montant affiché ne correspond pas à la base × 31,4 %');
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
    assert.match(faq, /cessions réalisées en 2025 et imposées en 2026/,
      'JSON-LD : 31,4 % sans préciser qu’il couvre les cessions 2025');
    assert.match(faq, /L[.]136-6/, 'JSON-LD : base légale absente');
  }
  assert.ok(!/30 % pour une cession/.test(faq), 'JSON-LD : règle périmée des 30 %');
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
