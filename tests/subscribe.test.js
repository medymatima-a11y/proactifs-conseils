'use strict';
/* Gardes du point d'entrée unique des formulaires — /api/subscribe.
   Deux volets :
   1. Les quatre pages publiques n'écrivent plus dans Supabase depuis le
      navigateur (aucun jeton, aucune constante, aucun appel PostgREST).
   2. Le handler : filtre d'origine, captcha inerte sans configuration,
      validation, `statut` jamais accepté du client, compatibilité des
      appelants historiques.
   Aucun appel réseau réel : global.fetch est remplacé dans chaque test.
   Aucune valeur de clé réelle n'apparaît ici — uniquement des valeurs factices. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const subscribe = require('../api/subscribe.js');
const {
  isAllowedOrigin,
  originEnforced,
  turnstileState,
  sanitizeReponses,
  validate,
  KNOWN_SOURCES,
  DEFAULT_SOURCE,
  TAG_MAP,
  TURNSTILE_ACTION,
  CONSENT_VERSION,
  CONSENT_TEXTS,
} = subscribe.__internals;

/* ════════ 1. Gardes sur les pages publiques ════════ */

const PAGES = [
  'index.html',
  'declaration-rsu-espp-france.html',
  'immobilier/succession-colombes.html',
  'optimisation-fiscale-ile-de-france.html',
];

for (const page of PAGES) {
  test(`${page} : aucun secret ni écriture Supabase directe`, () => {
    const html = read(page);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(html), 'un jeton JWT subsiste dans la page');
    assert.ok(!html.includes('_SB_KEY') && !html.includes('_SB_URL'), 'constantes Supabase résiduelles');
    assert.ok(!html.includes('/rest/v1/'), 'appel PostgREST direct résiduel');
    assert.ok(!html.includes('supabase.co'), 'hôte Supabase résiduel dans la page');
    assert.ok(!/'apikey'|"apikey"/.test(html), 'en-tête apikey résiduel');
  });

  test(`${page} : le formulaire passe par /api/subscribe`, () => {
    const html = read(page);
    assert.ok(/fetch\('\/api\/subscribe'/.test(html), 'POST /api/subscribe absent');
    assert.ok(/service:\s*/.test(html), 'champ service absent du payload');
    assert.ok(!/telephone:\s*tel/.test(html), 'ancien champ telephone encore envoyé (attendu : tel)');
  });
}

test('succession : le navigateur n\'envoie plus de statut', () => {
  const html = read('immobilier/succession-colombes.html');
  assert.ok(!/statut:\s*'nouveau'/.test(html), 'statut encore fixé côté client');
  // Le statut du select reste utilisé comme « situation » métier.
  assert.ok(/situation:\s*statut/.test(html), 'situation métier perdue');
});

test('conversions et messages de confirmation préservés', () => {
  const home = read('index.html');
  assert.ok(home.includes("gtag('event', 'ads_conversion_Formulaire_1'"), 'conversion Ads de la home perdue');
  assert.ok(home.includes("document.getElementById('wizThanks').style.display  = 'block'"), 'écran de remerciement home perdu');

  const fiscal = read('optimisation-fiscale-ile-de-france.html');
  assert.ok(/send_to: 'AW-/.test(fiscal), 'conversion Google Ads de la page fiscalité perdue');
  assert.ok(/value: 150\.0/.test(fiscal), 'valeur de conversion 150 € perdue');
  assert.ok(/gtag\('event', 'generate_lead'/.test(fiscal), 'event generate_lead perdu');

  const rsu = read('declaration-rsu-espp-france.html');
  assert.ok(rsu.includes("document.getElementById('wizThanks').style.display = 'block'"), 'écran de remerciement RSU perdu');

  const succ = read('immobilier/succession-colombes.html');
  assert.ok(succ.includes("document.getElementById('successionSuccess').hidden = false"), 'écran de succès succession perdu');
});

test('appelants historiques de /api/subscribe inchangés', () => {
  for (const p of ['bilan-patrimonial.html', 'simulation-pret-immobilier.html']) {
    assert.ok(/fetch\('\/api\/subscribe'/.test(read(p)), `${p} : appel /api/subscribe perdu`);
  }
});

/* ════════ 2. Filtre d'origine ════════ */

test('origines : production, www et aperçus du projet acceptés', () => {
  assert.ok(isAllowedOrigin('https://proactifsconseils.fr'));
  assert.ok(isAllowedOrigin('https://www.proactifsconseils.fr'));
  assert.ok(isAllowedOrigin('https://proactifs-conseils-git-abc123-medy.vercel.app'));
  assert.ok(isAllowedOrigin(undefined), 'requête sans en-tête Origin');
});

test('origines : tout le reste est refusé, y compris un sosie', () => {
  assert.ok(!isAllowedOrigin('https://proactifsconseils.fr.exemple-attaquant.test'));
  assert.ok(!isAllowedOrigin('http://proactifsconseils.fr'), 'http simple refusé');
  assert.ok(!isAllowedOrigin('https://exemple-attaquant.test'));
  assert.ok(!isAllowedOrigin('https://autre-projet-abc.vercel.app'));
  assert.ok(!isAllowedOrigin('https://proactifs-conseils-ABC.vercel.app'), 'majuscules hors motif');
});

test('origines : aucun hôte d\'aperçu codé en dur dans le code', () => {
  const src = read('api/subscribe.js');
  const durs = src.match(/https:\/\/[a-z0-9-]*proactifs[a-z0-9-]*\.vercel\.app/g) || [];
  assert.deepStrictEqual(durs, [], 'adresse d\'aperçu codée en dur');
});

test('origines : extension par variable d\'environnement', () => {
  const env = { SUBSCRIBE_ALLOWED_ORIGINS: 'https://recette.exemple.test, https://autre.exemple.test' };
  assert.ok(isAllowedOrigin('https://recette.exemple.test', env));
  assert.ok(isAllowedOrigin('https://autre.exemple.test', env));
  assert.ok(!isAllowedOrigin('https://inconnu.exemple.test', env));
});

test('filtre d\'origine : actif par défaut, désactivable explicitement', () => {
  assert.strictEqual(originEnforced({}), true, 'doit être actif sans configuration');
  assert.strictEqual(originEnforced({ SUBSCRIBE_ORIGIN_ENFORCE: 'off' }), false);
  assert.strictEqual(originEnforced({ SUBSCRIBE_ORIGIN_ENFORCE: 'OFF' }), false);
  assert.strictEqual(originEnforced({ SUBSCRIBE_ORIGIN_ENFORCE: 'on' }), true);
  assert.strictEqual(originEnforced({ SUBSCRIBE_ORIGIN_ENFORCE: 'nimporte' }), true, 'valeur inattendue = garde actif');
});

/* ════════ 3. Captcha inerte sans configuration ════════ */

test('captcha : inactif sans variable, et le journal nomme la variable attendue', () => {
  const s = turnstileState({ VERCEL_ENV: 'production' });
  assert.strictEqual(s.active, false);
  assert.strictEqual(s.source, 'SUBSCRIBE_TURNSTILE_SECRET');
  assert.strictEqual(s.reason, 'variable_absente');
  assert.ok(!('secret' in s), 'aucune valeur de secret exposée quand le garde-fou est inactif');
});

test('captcha : variable propre à chaque environnement', () => {
  const prod = turnstileState({ VERCEL_ENV: 'production', SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' });
  assert.strictEqual(prod.active, true);
  assert.strictEqual(prod.source, 'SUBSCRIBE_TURNSTILE_SECRET');

  const prev = turnstileState({ VERCEL_ENV: 'preview', SUBSCRIBE_TURNSTILE_SECRET_Preview: 'valeur-factice' });
  assert.strictEqual(prev.active, true);
  assert.strictEqual(prev.source, 'SUBSCRIBE_TURNSTILE_SECRET_Preview');

  // Pas de repli d'un environnement sur l'autre.
  assert.strictEqual(turnstileState({ VERCEL_ENV: 'preview', SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }).active, false);
});

/* ════════ 4. Validation et payload ════════ */

const BASE = { prenom: 'Camille', nom: 'Exemple', email: 'Camille.Exemple@Example.test', tel: '06 00 00 00 00', service: 'impots' };

test('validate : champs obligatoires', () => {
  assert.strictEqual(validate({}).error, 'Champs manquants');
  assert.strictEqual(validate({ prenom: 'A', email: 'a@b.test' }).error, 'Champs manquants', 'service requis');
  assert.ok(validate(BASE).data, 'payload minimal accepté');
});

test('validate : email et téléphone contrôlés, valeurs normalisées', () => {
  assert.strictEqual(validate({ ...BASE, email: 'pas-un-email' }).error, 'Adresse email invalide.');
  assert.strictEqual(validate({ ...BASE, tel: 'abc' }).error, 'Numéro de téléphone invalide.');
  const r = validate(BASE).data;
  assert.strictEqual(r.email, 'camille.exemple@example.test', 'email normalisé en minuscules');
  assert.strictEqual(r.telephone, '06 00 00 00 00', 'téléphone mappé sur la colonne telephone');
});

test('validate : nom facultatif (cas de la page succession)', () => {
  const r = validate({ ...BASE, nom: '', service: 'succession' }).data;
  assert.strictEqual(r.nom, '');
});

test('validate : le statut envoyé par le navigateur est ignoré', () => {
  const r = validate({ ...BASE, statut: 'client' }).data;
  assert.strictEqual(r.statut, 'nouveau', 'statut toujours décidé côté serveur');
});

test('validate : source dans la liste blanche, sinon valeur par défaut', () => {
  assert.strictEqual(validate({ ...BASE, source: 'Quiz Fiscalité' }).data.source, 'Quiz Fiscalité');
  const hors = validate({ ...BASE, source: 'Source injectée <script>' });
  assert.strictEqual(hors.data.source, DEFAULT_SOURCE);
  assert.strictEqual(hors.sourceFallback, true, 'repli signalé à l\'appelant pour journalisation');
  assert.strictEqual(validate(BASE).data.source, DEFAULT_SOURCE, 'aucune source = valeur historique');
});

test('toutes les sources des quatre pages sont dans la liste blanche', () => {
  const attendues = [
    'Quiz Homepage', 'Quiz Fiscalité', 'Quiz Crédit', 'Quiz Retraite', 'Quiz Immobilier',
    'Quiz Épargne', 'Quiz Transmission', 'Quiz Cession entreprise', 'Quiz Déclaration impôts',
    'Quiz Actionnariat salarié', 'Page Déclaration RSU - Diagnostic actionnariat', 'Diagnostic Succession 360',
  ];
  for (const s of attendues) assert.ok(KNOWN_SOURCES.includes(s), 'source absente de la liste : ' + s);
});

test('codes service des quatre pages : tag marketing résolu', () => {
  for (const code of ['impots', 'credit', 'retraite', 'immo', 'epargne', 'transmission', 'cession', 'declaration', 'rsu', 'actionnariat', 'succession']) {
    assert.ok(TAG_MAP[code], 'tag manquant pour le service : ' + code);
  }
});

test('validate : forme historique de reponses préservée et enrichie', () => {
  const legacy = validate({ ...BASE, answers: ['a', 'b'] }).data;
  assert.strictEqual(legacy.reponses.service_code, 'impots', 'contrat historique rompu');
  assert.deepStrictEqual(legacy.reponses.answers, ['a', 'b'], 'contrat historique rompu');
  // Ajout assumé depuis le 10/11/2026 : traçabilité du consentement sur TOUS les
  // leads, y compris ceux des formulaires qui ne présentent pas encore de case.
  assert.deepStrictEqual(Object.keys(legacy.reponses).sort(), ['answers', 'consentement', 'service_code']);

  const riche = validate({ ...BASE, reponses: { q1: 'Question : réponse', page: 'test' } }).data;
  assert.strictEqual(riche.reponses.service_code, 'impots');
  assert.deepStrictEqual(riche.reponses.answers, []);
  assert.strictEqual(riche.reponses.q1, 'Question : réponse');
  assert.strictEqual(riche.reponses.page, 'test', 'champ métier perdu');
});

test('validate : preoccupation fournie ou déduite du service', () => {
  assert.strictEqual(validate(BASE).data.preoccupation, 'Réduire mes impôts', 'libellé déduit');
  assert.strictEqual(validate({ ...BASE, preoccupation: 'Succession immobilière' }).data.preoccupation, 'Succession immobilière');
});

test('validate : rejet sans troncature des champs hors limites', () => {
  assert.strictEqual(validate({ ...BASE, prenom: 'x'.repeat(81) }).error, 'Prénom trop long.');
  assert.strictEqual(validate({ ...BASE, situation: 'x'.repeat(241) }).error, 'Champ situation trop long.');
  assert.strictEqual(validate({ ...BASE, source: 'x'.repeat(121) }).error, 'Champ source trop long.');
});

test('validate : champ piège refusé, inerte quand il n\'est pas transmis', () => {
  assert.strictEqual(validate({ ...BASE, hp: 'robot' }).error, 'Requête refusée.');
  assert.ok(validate(BASE).data, 'absence du champ piège sans effet');
});

test('sanitizeReponses : objets plats seulement, volume borné', () => {
  assert.deepStrictEqual(sanitizeReponses(undefined).data, {});
  assert.deepStrictEqual(sanitizeReponses({ a: 1 }).data, { a: 1 });
  assert.ok(sanitizeReponses(['a']).error, 'tableau refusé');
  assert.ok(sanitizeReponses('texte').error, 'chaîne refusée');
  const gros = {};
  for (let i = 0; i < 60; i++) gros['k' + i] = 'v';
  assert.ok(sanitizeReponses(gros).error, 'trop de clés');
  assert.ok(sanitizeReponses({ a: 'x'.repeat(9000) }).error, 'charge trop volumineuse');
});

/* ════════ 5. Handler, sans aucun appel réseau réel ════════ */

function mockRes() {
  const r = { statusCode: 200, body: undefined, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

function stubFetch(responder) {
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    return responder(String(url), opts);
  };
  return { calls, restore: () => { global.fetch = orig; } };
}

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SYSTEME_API_KEY', 'VERCEL_ENV',
  'SUBSCRIBE_ALLOWED_ORIGINS', 'SUBSCRIBE_ORIGIN_ENFORCE',
  'SUBSCRIBE_TURNSTILE_SECRET', 'SUBSCRIBE_TURNSTILE_SECRET_Preview',
  'BREVO_API_KEY', 'BREVO_LIST_ID_MARKETING',
];

function withEnv(values, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, values);
  const quiet = [console.warn, console.error];
  console.warn = () => {}; console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.warn = quiet[0]; console.error = quiet[1];
      for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    });
}

const SERVER_ENV = {
  SUPABASE_URL: 'https://projet-factice-test.supabase.co',
  SUPABASE_SERVICE_KEY: 'cle-factice-de-test',
  VERCEL_ENV: 'production',
};
const okInsert = (url) => (url.includes('/rest/v1/leads') ? new Response('', { status: 201 }) : new Response('{}', { status: 404 }));
const call = (body, headers = { origin: 'https://proactifsconseils.fr' }, method = 'POST') => ({ method, headers, body });
const inserts = (calls) => calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/leads'));

test('handler : payload historique accepté, insertion serveur avec la clé serveur', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'Camille', nom: 'Exemple', email: 'c@example.test', tel: '0600000000', situation: 'Salarié', service: 'impots', answers: ['x'] }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      const ins = inserts(f.calls);
      assert.strictEqual(ins.length, 1, 'une seule insertion');
      const sent = JSON.parse(ins[0].body);
      assert.strictEqual(sent.statut, 'nouveau');
      assert.strictEqual(sent.source, DEFAULT_SOURCE);
      assert.strictEqual(sent.reponses.service_code, 'impots');
      assert.deepStrictEqual(sent.reponses.answers, ['x']);
      assert.strictEqual(sent.reponses.consentement.recueilli, false, 'aucune case présentée par cet appelant');
      assert.strictEqual(ins[0].headers.apikey, 'cle-factice-de-test', 'clé serveur utilisée');
    } finally { f.restore(); }
  });
});

test('handler : origine étrangère refusée en 403, aucune écriture', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }, { origin: 'https://exemple-attaquant.test' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(inserts(f.calls).length, 0, 'aucune insertion depuis une origine refusée');
    } finally { f.restore(); }
  });
});

test('handler : SUBSCRIBE_ORIGIN_ENFORCE=off laisse passer, et c\'est explicite', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_ORIGIN_ENFORCE: 'off' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }, { origin: 'https://exemple-attaquant.test' }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(inserts(f.calls).length, 1);
    } finally { f.restore(); }
  });
});

test('handler : sans secret captcha, le formulaire fonctionne (garde-fou inerte)', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch((url) => {
      assert.ok(!url.includes('challenges.cloudflare.com'), 'aucun appel captcha sans secret');
      return okInsert(url);
    });
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), res);
      assert.strictEqual(res.statusCode, 200, 'le formulaire ne doit jamais tomber faute de variable captcha');
    } finally { f.restore(); }
  });
});

test('handler : avec secret captcha, jeton absent refusé et jeton valide accepté', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
      ? new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const sans = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), sans);
      assert.strictEqual(sans.statusCode, 400);
      assert.strictEqual(inserts(f.calls).length, 0);

      const avec = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice' }), avec);
      assert.strictEqual(avec.statusCode, 200);
      assert.strictEqual(inserts(f.calls).length, 1);
    } finally { f.restore(); }
  });
});

test('handler : jeton captcha refusé par Cloudflare = 403 sans écriture', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
      ? new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : méthodes et préflight', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      const opt = mockRes();
      await subscribe(call(null, { origin: 'https://proactifsconseils.fr' }, 'OPTIONS'), opt);
      assert.strictEqual(opt.statusCode, 200);
      assert.strictEqual(opt.headers['Access-Control-Allow-Origin'], 'https://proactifsconseils.fr');
      assert.strictEqual(opt.headers.Vary, 'Origin');

      const get = mockRes();
      await subscribe(call(null, { origin: 'https://proactifsconseils.fr' }, 'GET'), get);
      assert.strictEqual(get.statusCode, 405);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : en-tête CORS jamais ouvert à tous', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), res);
      assert.notStrictEqual(res.headers['Access-Control-Allow-Origin'], '*', 'CORS ouvert à tous');
    } finally { f.restore(); }
  });
});

test('handler : configuration serveur absente = 500, aucune insertion', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), res);
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : échec Supabase remonté en erreur, pas en succès', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(() => new Response('erreur', { status: 400 }));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), res);
      assert.strictEqual(res.statusCode, 500);
      assert.notDeepStrictEqual(res.body, { success: true });
    } finally { f.restore(); }
  });
});

/* ── Scénarios anti-robot demandés : jeton absent, invalide, expiré, abus ── */

test('handler : SANS secret configuré, une soumission SANS jeton réussit', async () => {
  // Garde-fou de non-régression du point le plus sensible : aucune fenêtre de
  // panne pour les formulaires tant que le secret n'existe pas.
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch((url) => {
      if (url.includes('challenges.cloudflare.com')) throw new Error('APPEL RESEAU INTERDIT');
      return okInsert(url);
    });
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'Camille', email: 'c@example.test', service: 'impots' }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      assert.strictEqual(inserts(f.calls).length, 1);
    } finally { f.restore(); }
  });
});

test('handler : jeton invalide refusé, aucune écriture', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
      ? new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice-invalide' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : jeton expiré ou déjà utilisé refusé (timeout-or-duplicate)', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
      ? new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), { status: 200, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice-expire' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body && /anti-robot/i.test(res.body.error), 'message compréhensible attendu');
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : jeton valide mais obtenu sur un autre widget (action inattendue) refusé', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
      ? new Response(JSON.stringify({ success: true, action: 'rsu_request' }), { status: 200, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice-autre-widget' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : action attendue acceptée, absence d\'action tolérée', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    for (const payload of [{ success: true, action: TURNSTILE_ACTION }, { success: true }]) {
      const f = stubFetch((url) => (url.includes('challenges.cloudflare.com')
        ? new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
        : okInsert(url)));
      try {
        const res = mockRes();
        await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice' }), res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(inserts(f.calls).length, 1);
      } finally { f.restore(); }
    }
  });
});

test('handler : Cloudflare injoignable = demande refusée, jamais enregistrée à l\'aveugle', async () => {
  await withEnv({ ...SERVER_ENV, SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' }, async () => {
    const f = stubFetch((url) => {
      if (url.includes('challenges.cloudflare.com')) throw new Error('réseau');
      return okInsert(url);
    });
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', captchaToken: 'jeton-factice' }), res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(inserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('handler : soumission abusive au champ piège rejetée sans écriture ni appel externe', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch((url) => {
      if (!url.includes('/rest/v1/leads')) throw new Error('APPEL RESEAU INATTENDU: ' + url);
      return okInsert(url);
    });
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'Bot', email: 'bot@example.test', service: 'impots', hp: 'http://exemple-spam.test' }), res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(inserts(f.calls).length, 0);
      assert.strictEqual(f.calls.length, 0, 'aucun appel réseau pour une soumission piégée');
    } finally { f.restore(); }
  });
});

test('handler : rafale de soumissions identiques — comportement constaté, sans illusion de limitation', async () => {
  // Aucun compteur n'est implémenté : les fonctions Vercel sont sans état et
  // réparties. Ce test fixe la réalité (toutes les soumissions passent) pour
  // qu'une future limitation soit un changement visible et assumé.
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      for (let i = 0; i < 5; i++) {
        const res = mockRes();
        await subscribe(call({ prenom: 'A', email: 'rafale@example.test', service: 'impots' }), res);
        assert.strictEqual(res.statusCode, 200);
      }
      assert.strictEqual(inserts(f.calls).length, 5, 'aucune limitation de débit côté application — état documenté');
    } finally { f.restore(); }
  });
});

/* ── Consentement marketing : preuve, et séparation des deux finalités ── */

const systemeCalls = (calls) => calls.filter((c) => c.url.includes('api.systeme.io'));
const brevoCalls = (calls) => calls.filter((c) => c.url.includes('api.brevo.com'));

test('preuve de consentement : accepté — réponse, version, libellé serveur, horodatage, origine', () => {
  const r = validate({ ...BASE, source: 'Quiz Fiscalité', consentMarketing: true, consentVersion: CONSENT_VERSION }, { hote: 'proactifsconseils.fr' });
  const c = r.data.reponses.consentement;
  assert.strictEqual(c.marketing, true);
  assert.strictEqual(c.recueilli, true);
  assert.strictEqual(c.version, CONSENT_VERSION);
  assert.strictEqual(c.libelle, CONSENT_TEXTS[CONSENT_VERSION], 'le libellé enregistré doit être celui tenu par le serveur');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(c.horodatage), 'horodatage ISO attendu');
  assert.deepStrictEqual(c.origine, { source: 'Quiz Fiscalité', hote: 'proactifsconseils.fr' });
  assert.strictEqual(r.consentMarketing, true);
});

test('preuve de consentement : refusé — demande traitée, refus tracé', () => {
  const r = validate({ ...BASE, consentMarketing: false, consentVersion: CONSENT_VERSION });
  assert.ok(r.data, 'la soumission doit rester valide sans consentement');
  const c = r.data.reponses.consentement;
  assert.strictEqual(c.marketing, false);
  assert.strictEqual(c.recueilli, true, 'la case a bien été présentée');
  assert.strictEqual(c.libelle, CONSENT_TEXTS[CONSENT_VERSION]);
  assert.strictEqual(r.consentMarketing, false);
});

test('preuve de consentement : appelant historique — ni accord ni refus, contrat préservé', () => {
  const c = validate(BASE).data.reponses.consentement;
  assert.strictEqual(c.recueilli, false, 'aucune case présentée sur ces formulaires');
  assert.strictEqual(c.marketing, false);
  assert.strictEqual(c.libelle, null, 'aucun libellé ne peut être invoqué comme preuve');
});

test('preuve de consentement : le navigateur ne peut ni forger le libellé ni écraser la preuve', () => {
  const forge = validate({
    ...BASE,
    consentMarketing: true,
    consentVersion: 'version-inventee',
    reponses: { consentement: { marketing: true, libelle: 'texte falsifié' } },
  });
  const c = forge.data.reponses.consentement;
  assert.strictEqual(c.version, CONSENT_VERSION, 'version inconnue = version courante du serveur');
  assert.strictEqual(c.libelle, CONSENT_TEXTS[CONSENT_VERSION], 'libellé client ignoré');
  assert.notStrictEqual(c.libelle, 'texte falsifié');
});

test('consentement : seule la valeur booléenne true vaut accord (aucune valeur approchante)', () => {
  for (const valeur of ['true', 'on', 1, 'oui', [], {}, 'TRUE']) {
    const r = validate({ ...BASE, consentMarketing: valeur, consentVersion: CONSENT_VERSION });
    assert.strictEqual(r.consentMarketing, false, 'valeur acceptée à tort : ' + JSON.stringify(valeur));
    assert.strictEqual(r.data.reponses.consentement.marketing, false);
  }
  assert.strictEqual(validate({ ...BASE, consentMarketing: true, consentVersion: CONSENT_VERSION }).consentMarketing, true);
});

test('consentement : une preuve injectée dans reponses n\'autorise aucun abonnement', async () => {
  const r = validate({ ...BASE, reponses: { consentement: { marketing: true, recueilli: true } } });
  assert.strictEqual(r.consentMarketing, false, 'injection acceptée à tort');
  assert.strictEqual(r.data.reponses.consentement.marketing, false);
  await withEnv({ ...SERVER_ENV, SYSTEME_API_KEY: 'cle-factice-systeme', BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID_MARKETING: '42' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', consentMarketing: false, consentVersion: CONSENT_VERSION, reponses: { consentement: { marketing: true } } }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(brevoCalls(f.calls).length, 0, 'abonnement déclenché par une preuve forgée');
      assert.strictEqual(systemeCalls(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('libellé de la case : identique, caractère par caractère, sur les quatre pages et côté serveur', () => {
  const attendu = CONSENT_TEXTS[CONSENT_VERSION];
  for (const p of ['index.html', 'declaration-rsu-espp-france.html', 'immobilier/succession-colombes.html', 'optimisation-fiscale-ile-de-france.html']) {
    const html = read(p);
    assert.ok(html.includes(attendu), `${p} : le libellé affiché diffère de celui enregistré comme preuve`);
    assert.ok(html.includes('id="pcConsent"'), `${p} : case de consentement absente`);
    assert.ok(html.includes("consentVersion:   '" + CONSENT_VERSION + "'") || html.includes("consentVersion: '" + CONSENT_VERSION + "'"), `${p} : version du consentement non transmise`);
  }
});

test('case de consentement : jamais précochée, jamais bloquante', () => {
  for (const p of ['index.html', 'declaration-rsu-espp-france.html', 'immobilier/succession-colombes.html', 'optimisation-fiscale-ile-de-france.html']) {
    const html = read(p);
    const bloc = html.slice(html.indexOf('id="pcConsent"') - 200, html.indexOf('id="pcConsent"') + 200);
    assert.ok(!/\schecked\b/.test(bloc), `${p} : la case est précochée`);
    assert.ok(!/pcConsent'\)\.checked\s*!==\s*true/.test(html), `${p} : la case conditionne l'envoi`);
    assert.ok(!/if\s*\([^)]*pcConsent[^)]*\)\s*(\{\s*)?return/.test(html), `${p} : la case bloque la soumission`);
    assert.ok(/consentMarketing:\s*!!\(document\.getElementById\('pcConsent'\)/.test(html), `${p} : état de la case non transmis`);
  }
});

test('handler : consentement REFUSÉ — demande enregistrée, aucun abonnement marketing', async () => {
  await withEnv({ ...SERVER_ENV, SYSTEME_API_KEY: 'cle-factice-systeme', BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID_MARKETING: '42' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'Camille', email: 'c@example.test', service: 'impots', consentMarketing: false, consentVersion: CONSENT_VERSION }), res);
      assert.strictEqual(res.statusCode, 200, 'la demande doit aboutir malgré le refus');
      assert.strictEqual(inserts(f.calls).length, 1, 'le lead doit être enregistré');
      assert.strictEqual(systemeCalls(f.calls).length, 0, 'Systeme.io appelé sans consentement');
      assert.strictEqual(brevoCalls(f.calls).length, 0, 'Brevo appelé sans consentement');
      const sent = JSON.parse(inserts(f.calls)[0].body);
      assert.strictEqual(sent.reponses.consentement.marketing, false);
      assert.strictEqual(sent.reponses.consentement.recueilli, true);
    } finally { f.restore(); }
  });
});

test('handler : consentement ACCEPTÉ — abonnement possible, preuve transmise à Brevo', async () => {
  await withEnv({ ...SERVER_ENV, SYSTEME_API_KEY: 'cle-factice-systeme', BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID_MARKETING: '42' }, async () => {
    const f = stubFetch((url) => (url.includes('api.brevo.com') || url.includes('api.systeme.io')
      ? new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } })
      : okInsert(url)));
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'Camille', email: 'C@Example.test', service: 'impots', source: 'Quiz Fiscalité', consentMarketing: true, consentVersion: CONSENT_VERSION }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(inserts(f.calls).length, 1);
      assert.strictEqual(systemeCalls(f.calls).length, 1);
      assert.strictEqual(brevoCalls(f.calls).length, 1);
      const brevo = JSON.parse(brevoCalls(f.calls)[0].body);
      assert.deepStrictEqual(brevo.listIds, [42], 'liste dédiée attendue');
      assert.strictEqual(brevo.email, 'c@example.test');
      assert.strictEqual(brevo.attributes.CONSENT_VERSION, CONSENT_VERSION);
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(brevo.attributes.CONSENT_DATE));
      assert.strictEqual(brevo.updateEnabled, true);
    } finally { f.restore(); }
  });
});

test('handler : consentement accepté mais liste dédiée non configurée = aucun appel Brevo', async () => {
  await withEnv({ ...SERVER_ENV, BREVO_API_KEY: 'cle-factice-brevo' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', consentMarketing: true, consentVersion: CONSENT_VERSION }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(brevoCalls(f.calls).length, 0, 'aucun appel tant que BREVO_LIST_ID_MARKETING n\'existe pas');
    } finally { f.restore(); }
  });
});

test('handler : appelant sans case — demande traitée, AUCUNE inscription marketing', async () => {
  // Changement assumé du 2026-11-10 : l'absence de consentement vaut refus pour
  // la prospection. Les huit formulaires du site transmettent désormais l'état
  // de la case ; le contrat d'appel (mêmes champs, même réponse) est préservé.
  await withEnv({ ...SERVER_ENV, SYSTEME_API_KEY: 'cle-factice-systeme', BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID_MARKETING: '42' }, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', nom: 'B', email: 'a@example.test', tel: '0600000000', situation: 'Salarié', service: 'impots', answers: ['x'] }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      assert.strictEqual(inserts(f.calls).length, 1, 'la demande doit être enregistrée');
      assert.strictEqual(systemeCalls(f.calls).length, 0, 'Systeme.io appelé sans consentement');
      assert.strictEqual(brevoCalls(f.calls).length, 0, 'Brevo appelé sans consentement');
    } finally { f.restore(); }
  });
});

test('handler : un échec de l\'abonnement marketing ne perd jamais le lead', async () => {
  await withEnv({ ...SERVER_ENV, BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID_MARKETING: '42' }, async () => {
    const f = stubFetch((url) => {
      if (url.includes('api.brevo.com')) throw new Error('réseau');
      return okInsert(url);
    });
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots', consentMarketing: true, consentVersion: CONSENT_VERSION }), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      assert.strictEqual(inserts(f.calls).length, 1);
    } finally { f.restore(); }
  });
});

test('handler : aucun secret dans la réponse renvoyée au navigateur', async () => {
  await withEnv(SERVER_ENV, async () => {
    const f = stubFetch(okInsert);
    try {
      const res = mockRes();
      await subscribe(call({ prenom: 'A', email: 'a@example.test', service: 'impots' }), res);
      const serialise = JSON.stringify(res.body) + JSON.stringify(res.headers);
      assert.ok(!serialise.includes('cle-factice-de-test'), 'clé serveur fuitée dans la réponse');
    } finally { f.restore(); }
  });
});
