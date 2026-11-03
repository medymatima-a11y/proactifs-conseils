// Tests locaux de l'endpoint RSU/ESPP, du garde-fou d'activation de la page et du SQL.
// Aucun appel réseau réel : fetch est simulé. Aucune donnée réelle. Usage : node --test tests/rsu-request.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const handler = require(path.join(ROOT, 'api', 'rsu-request.js'));
const { checkTarget, verifyCaptcha, validate, TURNSTILE_ACTION } = handler;
const configHandler = require(path.join(ROOT, 'api', 'rsu-config.js'));

const T = 'b'.repeat(20); // référence TEST factice
const P = 'a'.repeat(20); // référence PROD factice
const ORIGIN_HOST = 'proactifs-conseils-git-feat-rs-8f2ce8-medymatima-a11ys-projects.vercel.app';
const ENV_KEYS = ['VERCEL_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RSU_TEST_SUPABASE_URL', 'RSU_TEST_SUPABASE_SERVICE_KEY',
  'RSU_TEST_SUPABASE_REF', 'RSU_PROD_SUPABASE_REF',
  'RSU_PROD_ENABLED', 'RSU_TURNSTILE_SECRET', 'RSU_TURNSTILE_SITE_KEY', 'RSU_TURNSTILE_SECRET_Preview', 'RSU_TURNSTILE_SITE_KEY_Preview',
  'RSU_DAILY_CAP', 'RSU_TX_BREVO_API_KEY', 'RSU_NOTIFY_TO'];
// Preview : variables TEST dédiées + variables production présentes (cas réaliste : elles ne doivent jamais servir).
const PREVIEW_ENV = { VERCEL_ENV: 'preview',
  RSU_TEST_SUPABASE_URL: `https://${T}.supabase.co`, RSU_TEST_SUPABASE_SERVICE_KEY: 'cle-factice-test',
  SUPABASE_URL: `https://${P}.supabase.co`, SUPABASE_SERVICE_KEY: 'cle-factice-prod',
  RSU_TEST_SUPABASE_REF: T, RSU_PROD_SUPABASE_REF: P, RSU_TURNSTILE_SECRET_Preview: 'secret-factice-test',
  RSU_TURNSTILE_SECRET: 'secret-factice-prod' };
// Environnement sans secret Turnstile Preview (clé omise, pas de valeur « undefined »).
// Le secret de production reste présent : Preview ne doit jamais s'en servir.
const { RSU_TURNSTILE_SECRET_Preview: _omitted, ...PREVIEW_NO_SECRET } = PREVIEW_ENV;
const PROD_ENV = { ...PREVIEW_ENV, VERCEL_ENV: 'production', SUPABASE_URL: `https://${P}.supabase.co` };

function withEnv(vars, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  return Promise.resolve().then(fn).finally(() => {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}
function mockRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
}
function stubFetch(responder) {
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body }); return responder(String(url), opts); };
  return { calls, restore: () => { global.fetch = orig; } };
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const inserts = (calls) => calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/rsu_requests'));
const count = (n) => new Response('[]', { status: 200, headers: { 'content-range': `0-0/${n}` } });

// Répondeur par défaut : Turnstile valide (hôte et action attendus), comptages à zéro, insertion acceptée.
function defaultResponder(opts = {}) {
  return (url, o) => {
    if (url.includes('challenges.cloudflare.com')) {
      if (opts.cfDown) throw new Error('réseau');
      if (opts.cfStatus) return new Response('', { status: opts.cfStatus });
      if (opts.turnstile === false) return json({ success: false, 'error-codes': opts.codes || ['invalid-input-response'] });
      return json({ success: true, hostname: opts.hostname ?? ORIGIN_HOST, action: opts.action ?? 'rsu_request' });
    }
    if (url.includes('/rest/v1/rsu_requests') && (o.method || 'GET') === 'GET') {
      if (url.includes('email=eq.')) return count(opts.perEmail ?? 0);
      return count(opts.total ?? 0);
    }
    if (url.includes('/rest/v1/rsu_requests') && o.method === 'POST') return new Response('', { status: 201 });
    return json({}, 404);
  };
}
const VALID = { nom: 'Test RSU', email: 'test-rsu@example.com', telephone: '06 00 00 00 01', dispositif: 'ESPP',
  besoin: 'Autre', echeance: "Simple prise d'information", commentaire: '', consent: true, website: '', captchaToken: 'jeton-factice-valide' };
const ORIGIN = `https://${ORIGIN_HOST}`;

async function run({ env, body = VALID, method = 'POST', origin = ORIGIN, responder = defaultResponder() }) {
  return withEnv(env, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await handler({ method, headers: origin ? { origin } : {}, body }, res);
      return { res, calls: f.calls };
    } finally { f.restore(); }
  });
}

// ── 1. Cible Supabase (checkTarget) ───────────────────────────────────────────
test('production sans RSU_PROD_ENABLED : refus explicite', () => {
  const r = checkTarget({ ...PROD_ENV });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'prod_desactivee');
});
test("production avec RSU_PROD_ENABLED='false' : refus", () => {
  assert.strictEqual(checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'false' }).reason, 'prod_desactivee');
});
test("production avec RSU_PROD_ENABLED='true' et référence PROD exacte : autorisée", () => {
  const r = checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'true' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'production');
  assert.strictEqual(r.url, `https://${P}.supabase.co`);
  assert.strictEqual(r.key, 'cle-factice-prod');
});
test('production activée mais pointant TEST : refus', () => {
  const r = checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'true', SUPABASE_URL: `https://${T}.supabase.co` });
  assert.strictEqual(r.ok, false);
});
test('preview vers TEST exact : autorisé, cible = variables TEST uniquement', () => {
  const r = checkTarget({ ...PREVIEW_ENV });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mode, 'preview_test');
  assert.strictEqual(r.url, `https://${T}.supabase.co`);
  assert.strictEqual(r.key, 'cle-factice-test');
});
test('preview pointant PROD : refus', () => {
  assert.strictEqual(checkTarget({ ...PREVIEW_ENV, RSU_TEST_SUPABASE_URL: `https://${P}.supabase.co` }).reason, 'preview_pointe_production');
});
test('preview sans variables TEST : refus, aucun repli vers SUPABASE_URL de production', () => {
  const r = checkTarget({ ...PREVIEW_ENV, RSU_TEST_SUPABASE_URL: undefined, RSU_TEST_SUPABASE_SERVICE_KEY: undefined });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'rsu_test_url_invalide');
});
test('preview avec clé TEST absente mais clé production présente : refus, aucun repli', () => {
  const r = checkTarget({ ...PREVIEW_ENV, RSU_TEST_SUPABASE_SERVICE_KEY: '' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'rsu_test_cle_absente');
});
test('environnement inconnu : refus', () => {
  assert.strictEqual(checkTarget({ ...PREVIEW_ENV, VERCEL_ENV: 'development' }).reason, 'environnement_non_autorise');
});

// ── 2. Endpoint : refus avant tout accès base ──────────────────────────────────
test('production sans flag : 503 CONFIG_REFUSEE, aucun appel réseau', async () => {
  const { res, calls } = await run({ env: { ...PROD_ENV } });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, 'CONFIG_REFUSEE');
  assert.strictEqual(calls.length, 0);
});
test('origine non autorisée : 403, aucun appel', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, origin: 'https://evil.example' });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(calls.length, 0);
});
test('méthode GET : 405', async () => {
  const { res } = await run({ env: { ...PREVIEW_ENV }, method: 'GET' });
  assert.strictEqual(res.statusCode, 405);
});
test('champ piège rempli : 200 neutre, rien enregistré', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, body: { ...VALID, website: 'bot' } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.length, 0);
});
test('consentement absent : 400, aucun appel', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, body: { ...VALID, consent: false } });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(calls.length, 0);
});

// ── 3. Anti-robot (Turnstile) ─────────────────────────────────────────────────
// Appel direct de verifyCaptcha avec un répondeur Cloudflare simulé.
async function captchaWith(responder, { secret = 's', token = 'jeton-factice', host = ORIGIN_HOST } = {}) {
  const f = stubFetch(responder);
  try {
    const r = await withEnv(secret === null ? {} : { VERCEL_ENV: 'preview', RSU_TURNSTILE_SECRET_Preview: secret },
      () => verifyCaptcha(process.env, token, host));
    return { r, calls: f.calls };
  } finally { f.restore(); }
}
const siteverify = (calls) => calls.filter(c => c.url.includes('challenges.cloudflare.com'));

test('Turnstile sans secret (absent ou vide) : 503 CONFIG_CAPTCHA, aucun appel, aucune insertion (fail closed)', async () => {
  for (const env of [PREVIEW_NO_SECRET, { ...PREVIEW_ENV, RSU_TURNSTILE_SECRET_Preview: '   ' }]) {
    const { res, calls } = await run({ env });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'CONFIG_CAPTCHA');
    assert.strictEqual(calls.length, 0);
  }
});
test('Turnstile, jeton absent : 400 CAPTCHA, aucun appel Cloudflare, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, body: { ...VALID, captchaToken: '' } });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'CAPTCHA');
  assert.strictEqual(calls.length, 0);
});
test('Turnstile, jeton refusé par Cloudflare : 400, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, responder: defaultResponder({ turnstile: false }) });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'CAPTCHA');
  assert.strictEqual(inserts(calls).length, 0);
});
test('Turnstile, jeton expiré via le endpoint : 400, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV },
    responder: defaultResponder({ turnstile: false, codes: ['timeout-or-duplicate'] }) });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(inserts(calls).length, 0);
});
test('Turnstile, domaine différent de la page : 400, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, responder: defaultResponder({ hostname: 'proactifsconseils.fr' }) });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(inserts(calls).length, 0);
});
test('Turnstile, Cloudflare injoignable : 503, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, responder: defaultResponder({ cfDown: true }) });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(inserts(calls).length, 0);
});
test('verifyCaptcha : jeton valide, hôte et action attendus : ok, un seul appel au bon endpoint', async () => {
  const { r, calls } = await captchaWith(() => json({ success: true, hostname: ORIGIN_HOST, action: TURNSTILE_ACTION }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(siteverify(calls).length, 1);
  assert.strictEqual(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const body = JSON.parse(calls[0].body);
  assert.strictEqual(body.secret, 's');
  assert.strictEqual(body.response, 'jeton-factice');
});
test('verifyCaptcha : jeton invalide (invalid-input-response) : jeton_refuse, 400', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['invalid-input-response'] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.reason, 'jeton_refuse');
});
test('verifyCaptcha : jeton expiré ou déjà utilisé (timeout-or-duplicate) : jeton_expire, 400', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
  assert.strictEqual(r.reason, 'jeton_expire');
  assert.strictEqual(r.status, 400);
});
test('verifyCaptcha : hôte renvoyé différent de la page : domaine_inattendu, 400', async () => {
  const { r } = await captchaWith(() => json({ success: true, hostname: 'autre.example', action: TURNSTILE_ACTION }));
  assert.strictEqual(r.reason, 'domaine_inattendu');
  assert.strictEqual(r.status, 400);
});
test('verifyCaptcha : hôte absent de la réponse : refus (pas de confiance par défaut)', async () => {
  const { r } = await captchaWith(() => json({ success: true, action: TURNSTILE_ACTION }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'domaine_inattendu');
});
test('verifyCaptcha : action différente de rsu_request : action_inattendue, 400', async () => {
  const { r } = await captchaWith(() => json({ success: true, hostname: ORIGIN_HOST, action: 'autre' }));
  assert.strictEqual(r.reason, 'action_inattendue');
});
test('verifyCaptcha : HTTP 500 sans JSON : erreur_cloudflare_http, 503, detail http=500 json=non', async () => {
  const { r } = await captchaWith(() => new Response('', { status: 500 }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.reason, 'erreur_cloudflare_http');
  assert.strictEqual(r.detail, 'http=500 json=non codes=-');
});
test('verifyCaptcha : non-2xx avec invalid-input-secret : secret_refuse, 503', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['invalid-input-secret'] }, 400));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.reason, 'secret_refuse');
  assert.strictEqual(r.detail, 'http=400 json=oui codes=invalid-input-secret');
});
test('verifyCaptcha : 2xx avec missing-input-secret : secret_refuse, même si HTTP 200', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['missing-input-secret'] }, 200));
  assert.strictEqual(r.reason, 'secret_refuse');
  assert.strictEqual(r.status, 503);
});
test('verifyCaptcha : 2xx sans JSON : reponse_cloudflare_invalide, 503', async () => {
  const { r } = await captchaWith(() => new Response('pas du json', { status: 200 }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.reason, 'reponse_cloudflare_invalide');
  assert.strictEqual(r.detail, 'http=200 json=non codes=-');
});
test('verifyCaptcha : 2xx success:false (jeton refusé) : jeton_refuse, 400, distinct de secret_refuse', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['invalid-input-response'] }, 200));
  assert.strictEqual(r.reason, 'jeton_refuse');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.detail, 'http=200 json=oui codes=invalid-input-response');
});
test('verifyCaptcha : code inconnu jamais recopié, seulement compté', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['code-secret-xyz', 'invalid-input-response'] }, 200));
  assert.strictEqual(r.reason, 'jeton_refuse');
  assert.strictEqual(r.detail, 'http=200 json=oui codes=invalid-input-response autres=1');
  assert.ok(!r.detail.includes('code-secret-xyz'));
});
test('verifyCaptcha : 400 avec JSON non lié au secret : erreur_cloudflare_http (requête rejetée), 503', async () => {
  const { r } = await captchaWith(() => json({ success: false, 'error-codes': ['bad-request'] }, 400));
  assert.strictEqual(r.reason, 'erreur_cloudflare_http');
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.detail, 'http=400 json=oui codes=bad-request');
});
test('verifyCaptcha : succès : detail renseigné, aucune donnée sensible', async () => {
  const { r } = await captchaWith(() => json({ success: true, hostname: ORIGIN_HOST, action: TURNSTILE_ACTION }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.detail, 'http=200 json=oui codes=-');
});
test('verifyCaptcha : diagnostic sans secret, jeton ni corps brut', async () => {
  const body = '{"success":false,"error-codes":["invalid-input-secret"],"echo":"s"}';
  const { r } = await captchaWith(() => new Response(body, { status: 400, headers: { 'content-type': 'application/json' } }));
  assert.ok(!r.detail.includes('jeton-factice'));
  assert.ok(!r.detail.includes('"s"'));
  assert.ok(!r.detail.includes('echo'));
});
test('verifyCaptcha : journal serveur : raison + diagnostic, jamais secret ni jeton', async () => {
  const logs = [];
  const orig = console.error;
  console.error = (...args) => logs.push(args.map(String).join(' '));
  let out;
  try {
    out = await run({ env: { ...PREVIEW_ENV },
      responder: defaultResponder({ turnstile: false, codes: ['invalid-input-secret'] }) });
  } finally { console.error = orig; }
  const sv = siteverify(out.calls);
  assert.strictEqual(sv.length, 1);
  const body = JSON.parse(sv[0].body);
  const line = logs.find(l => l.includes('[rsu captcha refusé]'));
  assert.ok(line, 'une ligne de journal attendue');
  assert.ok(line.includes('secret_refuse'));
  assert.ok(line.includes('codes=invalid-input-secret'));
  assert.ok(!line.includes(body.secret), 'le secret ne doit jamais être journalisé');
  assert.ok(!line.includes(body.response), 'le jeton ne doit jamais être journalisé');
});
test('verifyCaptcha : réseau coupé : erreur_reseau, 503', async () => {
  const { r } = await captchaWith(() => { throw new Error('réseau'); });
  assert.strictEqual(r.reason, 'erreur_reseau');
  assert.strictEqual(r.status, 503);
});
test('verifyCaptcha : secret absent : config_turnstile_absente, aucun appel', async () => {
  const { r, calls } = await captchaWith(() => json({ success: true }), { secret: null });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'config_turnstile_absente');
  assert.strictEqual(calls.length, 0);
});
test('verifyCaptcha : hôte inconnu : refus sans appel', async () => {
  const { r, calls } = await captchaWith(() => json({ success: true }), { host: '' });
  assert.strictEqual(r.reason, 'hote_inconnu');
  assert.strictEqual(calls.length, 0);
});
test('verifyCaptcha : jeton absent : jeton_absent, aucun appel', async () => {
  const { r, calls } = await captchaWith(() => json({ success: true }), { token: '  ' });
  assert.strictEqual(r.reason, 'jeton_absent');
  assert.strictEqual(calls.length, 0);
});

// ── 4. Limites ────────────────────────────────────────────────────────────────
test('limite par e-mail atteinte (3) : 429, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, responder: defaultResponder({ perEmail: 3 }) });
  assert.strictEqual(res.statusCode, 429);
  assert.ok(inserts(calls).length === 0);
});
test('plafond global atteint : 429, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV, RSU_DAILY_CAP: '2' }, responder: defaultResponder({ total: 2 }) });
  assert.strictEqual(res.statusCode, 429);
  assert.ok(inserts(calls).length === 0);
});
test('comptage en échec : 503 (fail closed), aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, responder: (url, o) => {
    if (url.includes('/rest/v1/rsu_requests') && (o.method || 'GET') === 'GET') return new Response('', { status: 500 });
    return defaultResponder()(url, o);
  } });
  assert.strictEqual(res.statusCode, 503);
  assert.ok(inserts(calls).length === 0);
});

// ── 5. Parcours nominal ───────────────────────────────────────────────────────
test('preview TEST, parcours nominal : 200, jeton vérifié une fois, insertion sans jeton stocké', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(siteverify(calls).length, 1);
  const post = inserts(calls)[0];
  assert.ok(post, 'insertion attendue');
  assert.ok(post.url.startsWith(`https://${T}.supabase.co/rest/v1/rsu_requests`), 'insertion vers TEST uniquement');
  const row = JSON.parse(post.body);
  assert.strictEqual(row.statut, 'nouveau');
  assert.strictEqual(row.consent_version, 'rsu-consent-v1');
  assert.ok(row.consent_at);
  assert.ok(!('captchaToken' in row) && !('website' in row) && !('consent' in row));
});
test('production activée avec Turnstile valide sur le domaine public : 200 vers PROD uniquement', async () => {
  const { res, calls } = await run({ env: { ...PROD_ENV, RSU_PROD_ENABLED: 'true' },
    origin: 'https://proactifsconseils.fr', responder: defaultResponder({ hostname: 'proactifsconseils.fr' }) });
  assert.strictEqual(res.statusCode, 200);
  const post = inserts(calls)[0];
  assert.ok(post.url.startsWith(`https://${P}.supabase.co/`));
});
test('production : jeton émis pour un autre domaine : refus, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PROD_ENV, RSU_PROD_ENABLED: 'true' },
    origin: 'https://proactifsconseils.fr', responder: defaultResponder({ hostname: ORIGIN_HOST }) });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(inserts(calls).length, 0);
});

// ── 5 bis. Configuration publique (clé Turnstile seulement) ───────────────────
test('rsu-config : GET renvoie la clé publique Preview, jamais le secret', async () => {
  await withEnv({ VERCEL_ENV: 'preview', RSU_TURNSTILE_SITE_KEY_Preview: '0x-cle-publique-test',
    RSU_TURNSTILE_SECRET_Preview: 'secret-a-ne-pas-exposer' }, async () => {
    const res = mockRes();
    await configHandler({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { turnstileSiteKey: '0x-cle-publique-test' });
    assert.ok(!JSON.stringify(res.body).includes('secret'));
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
  });
});
test('rsu-config : production renvoie RSU_TURNSTILE_SITE_KEY, jamais la clé Preview', async () => {
  await withEnv({ VERCEL_ENV: 'production', RSU_TURNSTILE_SITE_KEY: '0x-cle-prod', RSU_TURNSTILE_SITE_KEY_Preview: '0x-cle-test' }, async () => {
    const res = mockRes();
    await configHandler({ method: 'GET', headers: {} }, res);
    assert.deepStrictEqual(res.body, { turnstileSiteKey: '0x-cle-prod' });
  });
});
test('rsu-config : preview sans clé Preview mais avec clé production : null, aucun repli', async () => {
  await withEnv({ VERCEL_ENV: 'preview', RSU_TURNSTILE_SITE_KEY: '0x-cle-prod' }, async () => {
    const res = mockRes();
    await configHandler({ method: 'GET', headers: {} }, res);
    assert.deepStrictEqual(res.body, { turnstileSiteKey: null });
  });
});
test('rsu-config : clé absente : null (le formulaire refusera l\'envoi)', async () => {
  await withEnv({}, async () => {
    const res = mockRes();
    await configHandler({ method: 'GET', headers: {} }, res);
    assert.deepStrictEqual(res.body, { turnstileSiteKey: null });
  });
});
test('isolation Turnstile : chaque environnement ne lit que ses propres variables', async () => {
  // Production sans secret de production, avec seulement le secret Preview : refus.
  await withEnv({ VERCEL_ENV: 'production', RSU_TURNSTILE_SECRET_Preview: 'secret-preview' }, async () => {
    const f = stubFetch(() => json({ success: true }));
    try {
      const r = await verifyCaptcha(process.env, 'jeton', ORIGIN_HOST);
      assert.strictEqual(r.reason, 'config_turnstile_absente');
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
  // Preview avec seulement le secret de production : refus.
  await withEnv({ VERCEL_ENV: 'preview', RSU_TURNSTILE_SECRET: 'secret-prod' }, async () => {
    const f = stubFetch(() => json({ success: true }));
    try {
      const r = await verifyCaptcha(process.env, 'jeton', ORIGIN_HOST);
      assert.strictEqual(r.reason, 'config_turnstile_absente');
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
  // Environnement non géré avec les deux secrets : refus.
  await withEnv({ VERCEL_ENV: 'development', RSU_TURNSTILE_SECRET: 'a', RSU_TURNSTILE_SECRET_Preview: 'b' }, async () => {
    const r = await verifyCaptcha(process.env, 'jeton', ORIGIN_HOST);
    assert.strictEqual(r.reason, 'config_turnstile_absente');
  });
});
test('Preview : les deux alias de branche sont acceptés par l\'endpoint, insertion vers TEST uniquement', async () => {
  const HOST_B = 'proactifs-conseils-git-feat-rs-a2bdf1-medymatima-a11ys-projects.vercel.app';
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, origin: `https://${HOST_B}`,
    responder: defaultResponder({ hostname: HOST_B }) });
  assert.strictEqual(res.statusCode, 200);
  const post = inserts(calls)[0];
  assert.ok(post.url.startsWith(`https://${T}.supabase.co/`));
  assert.ok(!calls.some(c => c.url.includes(`${P}.supabase.co`)));
});
test('isolation Turnstile, endpoint : Preview avec secret production seul : 503 CONFIG_CAPTCHA, aucune insertion', async () => {
  // PREVIEW_NO_SECRET : secret Preview absent, secret production présent.
  const { res, calls } = await run({ env: { ...PREVIEW_NO_SECRET } });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, 'CONFIG_CAPTCHA');
  assert.strictEqual(calls.length, 0);
});
test('Turnstile production : le secret de production sert au siteverify (et non le secret Preview)', async () => {
  const { res, calls } = await run({ env: { ...PROD_ENV, RSU_PROD_ENABLED: 'true', RSU_TURNSTILE_SECRET: 'secret-prod-reel' },
    origin: 'https://proactifsconseils.fr', responder: defaultResponder({ hostname: 'proactifsconseils.fr' }) });
  assert.strictEqual(res.statusCode, 200);
  const verify = siteverify(calls)[0];
  assert.strictEqual(JSON.parse(verify.body).secret, 'secret-prod-reel');
});
test('rsu-config : POST refusé (405)', async () => {
  const res = mockRes();
  await configHandler({ method: 'POST', headers: {}, body: {} }, res);
  assert.strictEqual(res.statusCode, 405);
});

// ── 6. Garde-fou d'activation côté page ───────────────────────────────────────
const PAGE = fs.readFileSync(path.join(ROOT, 'fiscalite-rsu-stock-options.html'), 'utf8');
function evalPreviewHostList() {
  const m = PAGE.match(/var RSU_PREVIEW_TEST_HOSTS = (\[[^\]]*\]);/);
  assert.ok(m, 'liste des hôtes Preview TEST introuvable');
  return new Function('return ' + m[1])();
}
function evalPreviewHosts() {
  const hosts = evalPreviewHostList();
  return (hostname) => hosts.indexOf(hostname) !== -1;
}
test('page : transmission active uniquement sur l\'alias de branche Preview réel', () => {
  const active = evalPreviewHosts();
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-8f2ce8-medymatima-a11ys-projects.vercel.app'), true);
  // Alias stable de la branche feat/rsu-prod-hosts-local (déploiement dpl_4wdLCTrQG7r5U6JywVf31sPVesmi) : accepté.
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-a2bdf1-medymatima-a11ys-projects.vercel.app'), true);
  // Alias stable de la branche feat/rsu-finalisation-conversion (03/11/2026) : accepté.
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-17f578-medymatima-a11ys-projects.vercel.app'), true);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-17f578-medymatima-a11ys-projects.vercel.app.evil.com'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-17f579-medymatima-a11ys-projects.vercel.app'), false);
  // Variantes proches de l'alias accepté : refusées.
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-a2bdf1-medymatima-a11ys-projects.vercel.app.evil.com'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-a2bdf1-medymatima-a11ys-projects.vercel.app.'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-a2bdf2-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-a2bdf1-autre-medymatima-a11ys-projects.vercel.app'), false);
  // Liste exacte : trois alias de test, aucun autre.
  assert.deepStrictEqual(evalPreviewHostList(), [
    'proactifs-conseils-git-feat-rs-8f2ce8-medymatima-a11ys-projects.vercel.app',
    'proactifs-conseils-git-feat-rs-a2bdf1-medymatima-a11ys-projects.vercel.app',
    'proactifs-conseils-git-feat-rs-17f578-medymatima-a11ys-projects.vercel.app',
  ]);
  // Ancien nom supposé, jamais attribué par Vercel : refusé.
  assert.strictEqual(active('proactifs-conseils-git-feat-rsu-form-preview-medymatima-a11ys-projects.vercel.app'), false);
  // URL de déploiement propre à un push : non listée, refusée.
  assert.strictEqual(active('proactifs-conseils-b13p0zuoz-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifsconseils.fr'), false);
  assert.strictEqual(active('www.proactifsconseils.fr'), false);
  assert.strictEqual(active('proactifs-conseils.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-main-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-autre-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rsu-form-local-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rs-8f2ce8-medymatima-a11ys-projects.vercel.app.evil.com'), false);
  assert.strictEqual(active('localhost'), false);
});
test('page : garde-fou du diagnostic (PC_PROD_HOSTS) refuse tout hôte Preview ou inconnu', () => {
  const m = PAGE.match(/const PC_PROD_HOSTS = (\[[^\]]*\]);/);
  assert.ok(m, 'liste PC_PROD_HOSTS introuvable');
  const hosts = new Function('return ' + m[1])();
  const ok = (h) => hosts.indexOf(h) !== -1;
  assert.strictEqual(ok('proactifsconseils.fr'), true);
  assert.strictEqual(ok('www.proactifsconseils.fr'), true);
  assert.strictEqual(ok('proactifs-conseils-git-feat-rs-8f2ce8-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(ok('proactifs-conseils-b13p0zuoz-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(ok('localhost'), false);
});
test('page : le diagnostic vérifie le garde-fou AVANT l\'appel vers public.leads', () => {
  const guard = PAGE.indexOf('if (!actioIsProdHost()) {');
  const write = PAGE.indexOf("fetch(_SB_URL + '/rest/v1/leads'");
  assert.ok(guard > 0 && write > 0, 'garde ou écriture introuvable');
  assert.ok(guard < write, 'le garde-fou doit précéder l\'écriture');
});
test('page : la clé embarquée dans le navigateur est une clé anon, jamais service_role', () => {
  const m = PAGE.match(/const _SB_KEY = '([^']+)'/);
  assert.ok(m, 'clé introuvable');
  const payload = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8'));
  assert.strictEqual(payload.role, 'anon');
});
test('page : jeton Turnstile lu à l\'envoi et transmis sous captchaToken', () => {
  assert.ok(PAGE.includes('captchaToken: captchaToken,'));
  assert.ok(PAGE.includes('window.turnstile.getResponse(captchaId)'));
});
test('page : widget Turnstile en mode explicite, action rsu_request, clé lue via /api/rsu-config', () => {
  assert.ok(PAGE.includes('challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'));
  assert.ok(PAGE.includes("fetch('/api/rsu-config'"));
  assert.ok(PAGE.includes("action: 'rsu_request'"));
  assert.ok(PAGE.includes('id="rsu-captcha"'));
});
test('page : widget initialisé uniquement sur le Preview TEST (jamais sur le domaine public)', () => {
  assert.ok(/if \(RSU_TRANSMISSION_ACTIVE\) initCaptcha\(\);/.test(PAGE));
});
test('page : jeton réinitialisé après un échec (usage unique)', () => {
  assert.ok(PAGE.includes('window.turnstile.reset(captchaId)'));
});
test('page : aucun secret Turnstile, aucune clé en dur, aucun appel siteverify côté navigateur', () => {
  assert.ok(!PAGE.includes('RSU_TURNSTILE_SECRET'));
  assert.ok(!/sitekey:\s*'0x/.test(PAGE));
  assert.ok(!PAGE.includes('siteverify'));
});
test('page : le diagnostic rapide n\'utilise pas Turnstile', () => {
  const diag = PAGE.slice(PAGE.indexOf('function actioIsProdHost()'), PAGE.indexOf("fetch(_SB_URL + '/rest/v1/leads'"));
  assert.ok(diag.length > 0);
  assert.ok(!/turnstile/i.test(diag));
});
test('CSP : challenges.cloudflare.com autorisé en script et iframe, pas en connect', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const header = vercel.headers.flatMap(h => h.headers || []).find(x => x.key === 'Content-Security-Policy');
  assert.ok(header, 'en-tête CSP introuvable');
  const directive = (name) => header.value.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '';
  assert.ok(directive('script-src').includes('https://challenges.cloudflare.com'));
  assert.ok(directive('frame-src').includes('https://challenges.cloudflare.com'));
  assert.ok(!directive('connect-src').includes('challenges.cloudflare.com'));
  assert.ok(header.value.includes("object-src 'none'"), 'directives existantes conservées');
});

// ── 7. SQL (contrôles statiques) ──────────────────────────────────────────────
const SQL = fs.readFileSync(path.join(ROOT, 'migration-rsu-requests.sql'), 'utf8');
const sqlNoComments = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
test('SQL : RLS activé, aucun accès anon, pas de politique INSERT ni UPDATE/DELETE', () => {
  assert.ok(/alter table public\.rsu_requests enable row level security/.test(sqlNoComments));
  assert.ok(/revoke all on public\.rsu_requests from anon/.test(sqlNoComments));
  assert.ok(!/to anon/i.test(sqlNoComments));
  assert.ok(!/for insert/i.test(sqlNoComments));
  assert.ok(!/for (update|delete)/i.test(sqlNoComments));
  assert.ok(!/grant (insert|update|delete|all)/i.test(sqlNoComments));
  assert.ok(/grant select on public\.rsu_requests to authenticated/.test(sqlNoComments));
});
test('SQL : authenticated — révocation explicite de tous les privilèges sauf SELECT, avant le GRANT', () => {
  const revoke = sqlNoComments.match(/revoke ([a-z, ]+) on public\.rsu_requests from authenticated;/);
  assert.ok(revoke, 'révocation authenticated absente');
  const revoked = revoke[1].split(',').map(s => s.trim()).sort();
  assert.deepStrictEqual(revoked, ['delete', 'insert', 'maintain', 'references', 'trigger', 'truncate', 'update']);
  const grantIdx = sqlNoComments.search(/grant select on public\.rsu_requests to authenticated/);
  assert.ok(grantIdx > sqlNoComments.indexOf(revoke[0]), 'le GRANT SELECT doit suivre la révocation');
  assert.ok(!/grant [^;]*(insert|update|delete|truncate|references|trigger|maintain|all)[^;]*to authenticated/i.test(sqlNoComments));
});
test('SQL : lecture réservée aux membres du cabinet', () => {
  assert.ok(/for select to authenticated\s+using \(public\.is_cabinet_member\(\)\)/.test(sqlNoComments.replace(/\n/g, ' ')));
});
test('SQL : listes de valeurs identiques à l\'API', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api', 'rsu-request.js'), 'utf8');
  for (const name of ['DISPOSITIFS', 'BESOINS', 'ECHEANCES']) {
    const m = api.match(new RegExp(`const ${name} = \\[([^\\]]*)\\];`));
    assert.ok(m, name);
    const items = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
    assert.ok(items.length > 0);
    for (const it of items) assert.ok(SQL.includes(`'${it.replace(/'/g, "''")}'`), `${name} : « ${it} » absent du SQL`);
  }
});
test('SQL : idempotent (create if not exists, drop policy if exists)', () => {
  assert.ok(/create table if not exists/.test(sqlNoComments));
  assert.ok(/drop policy if exists/.test(sqlNoComments));
});
