'use strict';
/* Mesure : garde d'environnement et diagnostic des erreurs serveur.

   1. `assets/js/cookie-consent.js` est le SEUL point du dépôt qui charge
      gtag.js : une garde d'hôte y coupe GA4 et les conversions Ads pour tous
      les parcours à la fois. Ces tests exécutent la décision réelle du module
      dans un bac à sable, hôte par hôte.
   2. `diagnostic_error` transporte désormais le code HTTP sur le chemin
      serveur, et rien d'autre : jamais de message, jamais d'URL, jamais de
      contenu de formulaire.
   Aucun appel réseau, aucun DOM réel, aucune valeur de clé réelle. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CONSENT_SRC = read('assets/js/cookie-consent.js');

/* ════════ 1. Garde d'environnement ════════ */

test('garde : gtag.js n\'est chargé que depuis un seul endroit du dépôt', () => {
  // Si un second point de chargement apparaissait, la garde ne couvrirait plus tout.
  const fichiers = [];
  const parcourir = (dir, base) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || ['node_modules', 'tests', 'docs', 'Audits SEO', 'Claude outputs', 'Lead magnets', 'prototypes', 'Indexation auto'].includes(e.name)) continue;
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) parcourir(path.join(dir, e.name), rel);
      else if (/\.(html|js)$/.test(e.name) && read(rel).includes('googletagmanager.com/gtag/js')) fichiers.push(rel);
    }
  };
  parcourir(ROOT, '');
  assert.deepStrictEqual(fichiers, ['assets/js/cookie-consent.js'],
    'gtag.js chargé ailleurs : la garde d\'hôte ne suffirait plus');
});

test('garde : liste blanche explicite, aucun motif permissif', () => {
  assert.ok(/var MESURE_HOSTS = \['proactifsconseils\.fr', 'www\.proactifsconseils\.fr'\];/.test(CONSENT_SRC),
    'liste blanche attendue, exactement ces deux hôtes');
  // Aucune comparaison approximative qui laisserait passer un sous-domaine.
  assert.ok(!/endsWith\(|includes\('proactifsconseils|indexOf\('proactifsconseils/.test(CONSENT_SRC),
    'comparaison approximative sur le nom d\'hôte');
  assert.ok(/MESURE_HOSTS\.indexOf\(location\.hostname\) !== -1/.test(CONSENT_SRC),
    'comparaison exacte sur location.hostname attendue (forme de RSU_PROD_HOSTS)');
  // Le consentement reste la première condition, la garde s'y ajoute.
  assert.ok(/if \(\(c\.a \|\| c\.m\) && !loaded\.gtag && hoteAutoriseMesure\(\)\)/.test(CONSENT_SRC),
    'la garde doit s\'ajouter à la condition de consentement, pas la remplacer');
});

/* Exécute la décision réelle du module : la liste blanche, la fonction de
   garde et le bloc de chargement, extraits du source. */
function chargeGtag(hostname, consentement) {
  const iListe = CONSENT_SRC.indexOf('var MESURE_HOSTS =');
  const finFn = CONSENT_SRC.indexOf('\n  }', CONSENT_SRC.indexOf('function hoteAutoriseMesure()')) + '\n  }'.length;
  assert.ok(iListe > 0 && finFn > iListe, 'garde introuvable dans le module');
  const garde = CONSENT_SRC.slice(iListe, finFn);
  const iBloc = CONSENT_SRC.indexOf('if ((c.a || c.m) && !loaded.gtag && hoteAutoriseMesure())');
  const bloc = CONSENT_SRC.slice(iBloc, CONSENT_SRC.indexOf('\n    }', iBloc) + '\n    }'.length);

  const charges = [];
  const sandbox = {
    location: hostname === null ? null : { hostname },
    loaded: { gtag: false },
    addScript: (src) => charges.push(src),
    GA_ID: 'G-FACTICE',
    c: consentement,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(garde + '\n' + bloc, sandbox, { filename: 'cookie-consent.js' });
  return charges;
}

test('garde : hôte de production + consentement → gtag.js chargé', () => {
  for (const hote of ['proactifsconseils.fr', 'www.proactifsconseils.fr']) {
    assert.strictEqual(chargeGtag(hote, { a: true, m: false }).length, 1, hote + ' : analytique seul doit suffire');
    assert.strictEqual(chargeGtag(hote, { a: false, m: true }).length, 1, hote + ' : marketing seul doit suffire');
    assert.strictEqual(chargeGtag(hote, { a: true, m: true }).length, 1, hote + ' : les deux accordés');
  }
});

test('garde : hôte de production SANS consentement → rien chargé', () => {
  for (const hote of ['proactifsconseils.fr', 'www.proactifsconseils.fr']) {
    assert.strictEqual(chargeGtag(hote, { a: false, m: false }).length, 0, hote + ' : refus doit rester bloquant');
  }
});

test('garde : environnements non autorisés → JAMAIS chargé, consentement ou non', () => {
  const horsProd = [
    'localhost',
    '127.0.0.1',
    'proactifs-conseils-git-fix-env-abc123-medymatima-a11ys-projects.vercel.app',
    'proactifs-conseils.vercel.app',
    'preview.proactifsconseils.fr',
    'proactifsconseils.fr.exemple-attaquant.test',
    'www.proactifsconseils.com',
    '',
  ];
  for (const hote of horsProd) {
    for (const c of [{ a: true, m: true }, { a: true, m: false }, { a: false, m: true }, { a: false, m: false }]) {
      assert.strictEqual(chargeGtag(hote, c).length, 0,
        'collecte autorisée à tort depuis ' + (hote || '(hôte vide)') + ' avec ' + JSON.stringify(c));
    }
  }
});

test('garde : lecture de l\'hôte impossible → refus', () => {
  // `location` inaccessible : la garde doit retomber sur un refus, jamais lever.
  let charges;
  assert.doesNotThrow(() => { charges = chargeGtag(null, { a: true, m: true }); }, 'la garde ne doit jamais lever');
  assert.strictEqual(charges.length, 0, 'chargement autorisé alors que l\'hôte est illisible');
});

test('garde : le reste du module de consentement est inchangé', () => {
  // Brevo, le cookie et la file dataLayer ne sont pas du périmètre de ce lot.
  assert.ok(CONSENT_SRC.includes("addScript('https://cdn.brevo.com/js/sdk-loader.js')"), 'chargeur Brevo altéré');
  assert.ok(/Max-Age=' \+ MAX_AGE \+ '; Path=\/; SameSite=Lax; Secure/.test(CONSENT_SRC), 'écriture du cookie altérée');
  assert.ok(CONSENT_SRC.includes("gtag('consent', 'update'"), 'mise à jour du consentement altérée');
  assert.ok(CONSENT_SRC.includes('window.ProactifsCookies = { open:'), 'API publique altérée');
});

/* ════════ 2. `http_status` sur les erreurs serveur ════════ */

const PAGES_DIAGNOSTIC = [
  { f: 'index.html', base: 'wizTrackBase', emission: "wizTrack('diagnostic_error'" },
  { f: 'fiscalite-rsu-stock-options.html', base: 'actioTrackBase', emission: "actioTrack('diagnostic_error'" },
];

/* Évalue l'expression de paramètres réellement écrite dans la page. */
function parametresErreur(page, httpStatus, errStage) {
  const html = read(page.f);
  const i = html.indexOf('Object.assign(', html.indexOf(page.emission));
  assert.ok(i > 0, page.f + ' : expression de paramètres introuvable');
  const fin = html.indexOf('\n', html.indexOf('));', i));
  const expr = html.slice(i, html.indexOf('));', i) + 1);
  const sandbox = { Object, errStage, httpStatus };
  sandbox[page.base] = () => ({ diagnostic_type: 'factice', diagnostic_source: 'factice', diagnostic_entry: 'factice' });
  sandbox.globalThis = sandbox;
  assert.ok(fin > i);
  return vm.runInNewContext('(' + expr + ')', sandbox, { filename: page.f });
}

for (const page of PAGES_DIAGNOSTIC) {
  test(`${page.f} : http_status présent et entier sur server_rejected`, () => {
    const p = parametresErreur(page, 403, 'server_rejected');
    assert.strictEqual(p.error_stage, 'server_rejected');
    assert.strictEqual(typeof p.http_status, 'number', 'http_status doit être un entier');
    assert.strictEqual(p.http_status, 403);
    // Et le statut est bien capté dans le code, depuis la réponse.
    assert.ok(/httpStatus = res\.status;/.test(read(page.f)), 'le code HTTP n\'est pas relevé sur la réponse');
  });

  test(`${page.f} : http_status ABSENT sur network_error`, () => {
    const p = parametresErreur(page, null, 'network_error');
    assert.strictEqual(p.error_stage, 'network_error');
    assert.ok(!('http_status' in p), 'paramètre présent alors qu\'aucun statut n\'existe');
    // Pas de sentinelle : ni 0, ni -1, ni chaîne vide.
    assert.ok(!/http_status: *(0|-1|'')/.test(read(page.f)), 'valeur sentinelle introuvable attendue');
  });

  test(`${page.f} : les paramètres d'erreur ne portent aucune donnée personnelle`, () => {
    const p = parametresErreur(page, 500, 'server_rejected');
    assert.deepStrictEqual(Object.keys(p).sort(),
      ['diagnostic_entry', 'diagnostic_source', 'diagnostic_type', 'error_stage', 'http_status'],
      'clé inattendue dans les paramètres de mesure');
    // Assertion de garde : échouerait si quelqu'un ajoutait le message serveur,
    // une saisie, une URL ou le contenu d'une exception.
    const html = read(page.f);
    const bloc = html.slice(html.indexOf(page.emission), html.indexOf('));', html.indexOf(page.emission)));
    for (const interdit of ['data.error', 'errEl.textContent', 'e.message', 'email', 'prenom', 'nom', 'tel', 'reponses', 'location.href', 'payload']) {
      assert.ok(!bloc.includes(interdit), `paramètre interdit transmis : ${interdit}`);
    }
  });
}

test('mesure : les valeurs de conversion et les libellés ne sont pas touchés', () => {
  const home = read('index.html');
  const rsu = read('fiscalite-rsu-stock-options.html');
  assert.ok(/value: 150,/.test(home) && /currency: 'EUR'/.test(home), 'conversion de la home altérée');
  assert.ok(/value: 150, currency: 'EUR'/.test(rsu), 'conversion du pilier altérée');
  assert.ok(home.includes("wizTrackOnce('submit', 'diagnostic_submit'"), 'diagnostic_submit de la home altéré');
  assert.ok(rsu.includes("actioTrackOnce('submit', 'diagnostic_submit'"), 'diagnostic_submit du pilier altéré');
  // Aucun événement nouveau pour les familles « saisie » et « pré-vol ».
  assert.strictEqual((home.match(/diagnostic_error/g) || []).length, 1, 'émission supplémentaire sur la home');
  assert.strictEqual((rsu.match(/diagnostic_error/g) || []).length, 1, 'émission supplémentaire sur le pilier');
});
