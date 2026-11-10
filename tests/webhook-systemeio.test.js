'use strict';
/* /api/webhook-systemeio — fermeture par défaut.
   Règle épinglée : aucune opération Brevo — ni lecture de configuration, ni
   requête réseau — avant une authentification réussie. Sans SYSTEMEIO_SECRET,
   tout est refusé.
   Aucun appel réseau réel : global.fetch est remplacé et compte les appels ;
   plusieurs tests échouent si une requête partait. Aucune valeur de clé réelle. */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const webhook = require('../api/webhook-systemeio.js');
const { authenticate, safeEqual, REFUS } = webhook.__internals;

const SECRET = 'secret-factice-de-test';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'webhook-systemeio.js'), 'utf8');

function mockReq({ method = 'POST', headers = {}, query = {}, body = '' } = {}) {
  const req = Readable.from([body]);
  req.method = method;
  req.headers = headers;
  req.query = query;
  return req;
}
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
const brevoOk = () => new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { 'content-type': 'application/json' } });
const responder = (url) => {
  if (url.includes('api.brevo.com')) return brevoOk();
  throw new Error('APPEL RESEAU INATTENDU: ' + url);
};

const ENV_KEYS = ['SYSTEMEIO_SECRET', 'BREVO_API_KEY', 'BREVO_LIST_ID'];
function withEnv(values, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, values);
  const w = console.warn, e = console.error, l = console.log;
  console.warn = () => {}; console.error = () => {}; console.log = () => {};
  return Promise.resolve().then(fn).finally(() => {
    console.warn = w; console.error = e; console.log = l;
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

const CORPS = JSON.stringify({ contact: { email: 'prospect@example.test', first_name: 'Camille', tags: [{ name: 'wizard-site' }] } });
const hmac = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const CONFIG_OK = { SYSTEMEIO_SECRET: SECRET, BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID: '23' };
const brevoCalls = (calls) => calls.filter((c) => c.url.includes('api.brevo.com'));

/* ════════ 1. Le « mode debug » a disparu ════════ */

test('le chemin « mode debug » n\'existe plus dans le code', () => {
  // La porte dérobée consistait à journaliser puis à poursuivre sans vérifier.
  assert.ok(!/aucune vérification/.test(SRC), 'la porte dérobée est encore présente');
  assert.ok(!/SYSTEMEIO_SECRET non défini/.test(SRC), 'ancien journal de contournement encore présent');
  // « mode debug » ne doit subsister que dans le commentaire qui acte sa suppression.
  const mentions = SRC.match(/mode debug/gi) || [];
  assert.strictEqual(mentions.length, 1, 'plusieurs mentions : vérifier qu\'aucune n\'est du code');
  assert.ok(/mode debug[\s\S]{0,200}est supprimé/.test(SRC), 'la suppression doit être explicitement documentée');
  assert.ok(/FERMÉ PAR DÉFAUT/.test(SRC), 'la règle doit être documentée en tête de fichier');
});

test('la configuration Brevo est lue APRÈS l\'authentification (ordre du code)', () => {
  const posAuth = SRC.indexOf('const auth = authenticate(');
  const posKey = SRC.indexOf('process.env.BREVO_API_KEY');
  const posFetch = SRC.indexOf('api.brevo.com');
  assert.ok(posAuth > 0 && posKey > 0 && posFetch > 0);
  assert.ok(posAuth < posKey, 'BREVO_API_KEY est lue avant l\'authentification');
  assert.ok(posAuth < posFetch, 'appel Brevo situé avant l\'authentification');
});

test('l\'export config survit à l\'affectation du handler (corps brut réellement lisible)', () => {
  assert.deepStrictEqual(webhook.config, { api: { bodyParser: false } }, 'config perdue : le mode HMAC ne peut pas fonctionner');
  assert.strictEqual(typeof webhook, 'function');
});

/* ════════ 2. Refus : secret absent, invalide, non authentifié ════════ */

test('secret ABSENT : 401, aucune requête réseau', async () => {
  await withEnv({ BREVO_API_KEY: 'cle-factice-brevo', BREVO_LIST_ID: '23' }, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await webhook(mockReq({ body: CORPS, headers: { 'x-webhook-secret': 'peu-importe' } }), res);
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, REFUS);
      assert.strictEqual(f.calls.length, 0, 'une requête réseau est partie malgré le refus');
    } finally { f.restore(); }
  });
});

test('requête NON authentifiée : 401, aucune requête réseau', async () => {
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await webhook(mockReq({ body: CORPS }), res);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(brevoCalls(f.calls).length, 0);
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
});

test('secret INVALIDE dans chacun des modes : 401, aucune requête réseau', async () => {
  await withEnv(CONFIG_OK, async () => {
    const variantes = [
      { headers: { 'x-webhook-secret': 'mauvais-secret' } },
      { headers: { 'x-systemeio-signature': 'mauvais-secret' } },
      { headers: { 'x-webhook-signature': hmac(CORPS, 'autre-secret') } },
      { query: { secret: 'mauvais-secret' } },
      { headers: { 'x-webhook-signature': hmac('{"autre":"corps"}') } }, // signature d'un autre corps
    ];
    for (const v of variantes) {
      const f = stubFetch(responder);
      try {
        const res = mockRes();
        await webhook(mockReq(Object.assign({ body: CORPS }, v)), res);
        assert.strictEqual(res.statusCode, 401, 'variante acceptée à tort : ' + JSON.stringify(v));
        assert.strictEqual(f.calls.length, 0);
      } finally { f.restore(); }
    }
  });
});

test('la réponse de refus ne révèle pas si le secret est configuré', async () => {
  let sansSecret, avecSecret;
  await withEnv({ BREVO_API_KEY: 'cle-factice-brevo' }, async () => {
    const f = stubFetch(responder);
    try { const r = mockRes(); await webhook(mockReq({ body: CORPS }), r); sansSecret = { code: r.statusCode, body: r.body }; } finally { f.restore(); }
  });
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(responder);
    try { const r = mockRes(); await webhook(mockReq({ body: CORPS }), r); avecSecret = { code: r.statusCode, body: r.body }; } finally { f.restore(); }
  });
  assert.deepStrictEqual(sansSecret, avecSecret, 'les deux refus doivent être indiscernables');
});

test('méthodes : OPTIONS accepté, GET refusé, aucune requête réseau', async () => {
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(responder);
    try {
      const opt = mockRes();
      await webhook(mockReq({ method: 'OPTIONS' }), opt);
      assert.strictEqual(opt.statusCode, 200);
      const get = mockRes();
      await webhook(mockReq({ method: 'GET' }), get);
      assert.strictEqual(get.statusCode, 405);
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
});

/* ════════ 3. Cas nominaux — les quatre modes conservés ════════ */

const MODES = [
  ['HMAC-SHA256 (préféré)', () => ({ headers: { 'x-webhook-signature': hmac(CORPS) } })],
  ['en-tête X-Webhook-Secret', () => ({ headers: { 'x-webhook-secret': SECRET } })],
  ['en-tête X-Systemeio-Signature (alias)', () => ({ headers: { 'x-systemeio-signature': SECRET } })],
  ['paramètre ?secret=', () => ({ query: { secret: SECRET } })],
];

for (const [nom, variante] of MODES) {
  test(`mode ${nom} : accepté, contact synchronisé une seule fois`, async () => {
    await withEnv(CONFIG_OK, async () => {
      const f = stubFetch(responder);
      try {
        const res = mockRes();
        await webhook(mockReq(Object.assign({ body: CORPS }, variante())), res);
        assert.strictEqual(res.statusCode, 200, 'mode refusé à tort');
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.thematique, 'bilan-patrimonial');
        const appels = brevoCalls(f.calls);
        assert.strictEqual(appels.length, 1);
        const envoye = JSON.parse(appels[0].body);
        assert.deepStrictEqual(envoye.listIds, [23]);
        assert.strictEqual(envoye.attributes.SOURCE, 'systeme.io');
        assert.strictEqual(envoye.attributes.THEMATIQUE, 'bilan-patrimonial');
        assert.strictEqual(envoye.updateEnabled, true);
      } finally { f.restore(); }
    });
  });
}

test('authentifié mais email manquant : 400, aucun appel Brevo', async () => {
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(responder);
    try {
      const corps = JSON.stringify({ contact: { first_name: 'Camille' } });
      const res = mockRes();
      await webhook(mockReq({ body: corps, headers: { 'x-webhook-signature': hmac(corps) } }), res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(brevoCalls(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('authentifié mais BREVO_API_KEY absente : 500, aucun appel réseau', async () => {
  await withEnv({ SYSTEMEIO_SECRET: SECRET }, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await webhook(mockReq({ body: CORPS, headers: { 'x-webhook-secret': SECRET } }), res);
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
});

test('authentifié, corps non JSON : refusé en 400 sans appel Brevo', async () => {
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(responder);
    try {
      const corps = 'ceci-n-est-pas-du-json';
      const res = mockRes();
      await webhook(mockReq({ body: corps, headers: { 'x-webhook-signature': hmac(corps) } }), res);
      assert.strictEqual(res.statusCode, 400, 'email manquant attendu');
      assert.strictEqual(brevoCalls(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('échec Brevo remonté, jamais travesti en succès', async () => {
  await withEnv(CONFIG_OK, async () => {
    const f = stubFetch(() => new Response(JSON.stringify({ code: 'erreur' }), { status: 400, headers: { 'content-type': 'application/json' } }));
    try {
      const res = mockRes();
      await webhook(mockReq({ body: CORPS, headers: { 'x-webhook-secret': SECRET } }), res);
      assert.strictEqual(res.statusCode, 502);
      assert.notStrictEqual(res.body && res.body.success, true);
    } finally { f.restore(); }
  });
});

/* ════════ 4. Fonctions internes ════════ */

test('authenticate : secret absent = refus nommant la variable', () => {
  const r = authenticate({ headers: {}, query: {} }, '', {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.raison, 'secret_absent');
  assert.strictEqual(r.variable, 'SYSTEMEIO_SECRET');
  assert.ok(!('secret' in r), 'aucune valeur de secret exposée');
});

test('authenticate : les quatre modes reconnus, et nommés dans le résultat', () => {
  const env = { SYSTEMEIO_SECRET: SECRET };
  assert.strictEqual(authenticate({ headers: { 'x-webhook-signature': hmac(CORPS) }, query: {} }, CORPS, env).mode, 'hmac');
  assert.strictEqual(authenticate({ headers: { 'x-webhook-secret': SECRET }, query: {} }, CORPS, env).mode, 'entete');
  assert.strictEqual(authenticate({ headers: { 'x-systemeio-signature': SECRET }, query: {} }, CORPS, env).mode, 'entete_alias');
  assert.strictEqual(authenticate({ headers: {}, query: { secret: SECRET } }, CORPS, env).mode, 'parametre');
});

test('authenticate : espaces autour du secret tolérés côté configuration', () => {
  const env = { SYSTEMEIO_SECRET: '  ' + SECRET + '  ' };
  assert.strictEqual(authenticate({ headers: { 'x-webhook-secret': SECRET }, query: {} }, '', env).ok, true);
});

test('safeEqual : vide, longueurs différentes et valeurs nulles refusés', () => {
  assert.strictEqual(safeEqual('', ''), false);
  assert.strictEqual(safeEqual(SECRET, SECRET + 'x'), false);
  assert.strictEqual(safeEqual(undefined, SECRET), false);
  assert.strictEqual(safeEqual(null, null), false);
  assert.strictEqual(safeEqual(SECRET, SECRET), true);
});

test('aucun secret ni jeton en dur dans le fichier', () => {
  assert.ok(!/xkeysib-[A-Za-z0-9]/.test(SRC), 'clé Brevo en dur');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(SRC), 'jeton JWT en dur');
  assert.ok(SRC.includes('process.env.SYSTEMEIO_SECRET') || SRC.includes('env.SYSTEMEIO_SECRET'), 'secret lu depuis l\'environnement');
});
