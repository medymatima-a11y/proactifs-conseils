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
  'RSU_DAILY_CAP', 'BREVO_API_KEY', 'RSU_TX_BREVO_API_KEY', 'RSU_NOTIFY_TO', 'RSU_NOTIFY_FROM'];
// BREVO_API_KEY est dans cette liste pour être RETIRÉE de l'environnement avant
// chaque test : sans cela, une clé réellement présente sur le poste ferait passer
// à tort le cas « aucune clé configurée ».
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
  global.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers }); return responder(String(url), opts); };
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
const VALID = { prenom: 'Test', nom: 'Test RSU', email: 'test-rsu@example.com', telephone: '06 00 00 00 01', dispositif: 'ESPP',
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

// Les trois gardes qui tombent AVANT toute branche d'environnement : ils valent
// donc pour la Preview comme pour la production. Chacun est éprouvé deux fois —
// par checkTarget(), puis par l'endpoint, où l'on exige en plus zéro appel
// réseau : le refus doit intervenir avant la moindre tentative d'écriture.
const { RSU_TEST_SUPABASE_REF: _refTestOmise, ...PREVIEW_SANS_REF_TEST } = PREVIEW_ENV;
const { RSU_PROD_SUPABASE_REF: _refProdOmise, ...PREVIEW_SANS_REF_PROD } = PREVIEW_ENV;
// Formes que SUPABASE_REF_RE doit toutes rejeter : vide, trop courte, majuscules,
// un caractère de trop, et l'URL complète au lieu de la seule référence.
const REFS_INVALIDES = (r) => ['', 'trop-court', r.toUpperCase(), r + 'x', `https://${r}.supabase.co`];

test('références TEST et production identiques : refus, aucun appel', async () => {
  // Deux références égales rendraient aveugles les deux verrous de cible :
  // « pointe TEST » et « pointe production » désigneraient le même projet.
  const env = { ...PREVIEW_ENV, RSU_PROD_SUPABASE_REF: T };
  assert.strictEqual(checkTarget(env).ok, false);
  assert.strictEqual(checkTarget(env).reason, 'refs_identiques');
  // Le garde est commun : la production le subit aussi, flag d'activation posé.
  assert.strictEqual(
    checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'true', RSU_TEST_SUPABASE_REF: P }).reason,
    'refs_identiques');
  const { res, calls } = await run({ env });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, 'CONFIG_REFUSEE');
  assert.strictEqual(calls.length, 0, 'un appel réseau a eu lieu malgré le refus');
});

test('référence TEST absente ou invalide : refus, aucun appel', async () => {
  // Sans référence TEST valide, rien ne permet d'affirmer que la Preview vise
  // bien le projet de test : la seule réponse sûre est le refus.
  assert.strictEqual(checkTarget(PREVIEW_SANS_REF_TEST).reason, 'ref_test_absente_ou_invalide');
  for (const mauvaise of REFS_INVALIDES(T)) {
    assert.strictEqual(
      checkTarget({ ...PREVIEW_ENV, RSU_TEST_SUPABASE_REF: mauvaise }).reason,
      'ref_test_absente_ou_invalide',
      'référence acceptée à tort : ' + JSON.stringify(mauvaise));
  }
  const { res, calls } = await run({ env: PREVIEW_SANS_REF_TEST });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, 'CONFIG_REFUSEE');
  assert.strictEqual(calls.length, 0, 'un appel réseau a eu lieu malgré le refus');
});

test('référence production absente ou invalide : refus, aucun appel', async () => {
  // Elle ne sert qu'à interdire. Absente, le second verrou de la Preview
  // — « ne jamais viser la production » — n'aurait plus rien à comparer.
  assert.strictEqual(checkTarget(PREVIEW_SANS_REF_PROD).reason, 'ref_prod_absente_ou_invalide');
  for (const mauvaise of REFS_INVALIDES(P)) {
    assert.strictEqual(
      checkTarget({ ...PREVIEW_ENV, RSU_PROD_SUPABASE_REF: mauvaise }).reason,
      'ref_prod_absente_ou_invalide',
      'référence acceptée à tort : ' + JSON.stringify(mauvaise));
  }
  const { res, calls } = await run({ env: PREVIEW_SANS_REF_PROD });
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, 'CONFIG_REFUSEE');
  assert.strictEqual(calls.length, 0, 'un appel réseau a eu lieu malgré le refus');
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
  const m = PAGE.match(/(?:var|const) RSU_PREVIEW_TEST_HOSTS = (\[[^\]]*\]);/);
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
// Depuis la fusion du diagnostic, la page n'accède plus jamais à Supabase
// directement : plus de clé anon dans le navigateur, plus d'écriture dans leads.
test('page : aucune clé Supabase ni accès direct à la base depuis le navigateur', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(PAGE), 'un jeton JWT subsiste dans la page');
  assert.ok(!PAGE.includes('ullnkylrixdvormohryl'), 'référence au projet Supabase de production');
  assert.ok(!PAGE.includes('_SB_KEY') && !PAGE.includes('_SB_URL'), 'constantes Supabase résiduelles');
  assert.ok(!PAGE.includes('/rest/v1/'), 'appel PostgREST direct résiduel');
});
test('page : le diagnostic envoie vers /api/rsu-request, et nulle part ailleurs', () => {
  assert.ok(PAGE.includes("const RSU_ENDPOINT = '/api/rsu-request';"), 'endpoint serveur absent');
  assert.ok(PAGE.includes('fetch(RSU_ENDPOINT, {'), 'envoi vers l\'endpoint introuvable');
  const externes = [...PAGE.matchAll(/fetch\(\s*'(https?:[^']+)'/g)].map(m => m[1]);
  assert.deepStrictEqual(externes, [], 'appel réseau externe depuis la page : ' + externes.join(', '));
});
test('page : le consentement est une case à cocher, contrôlée avant l\'envoi', () => {
  assert.ok(PAGE.includes('id="wConsent"'), 'case de consentement absente du formulaire');
  assert.ok(PAGE.includes("document.getElementById('wConsent').checked !== true"), 'consentement non contrôlé');
});
test('page : le champ piège est présent et transmis', () => {
  assert.ok(PAGE.includes('id="wWebsite"'), 'champ piège absent');
  assert.ok(PAGE.includes("website: document.getElementById('wWebsite').value"), 'champ piège non transmis');
});
test('page : jeton Turnstile lu à l\'envoi et transmis sous captchaToken', () => {
  assert.ok(PAGE.includes('captchaToken: captchaToken,'));
  assert.ok(PAGE.includes('window.turnstile.getResponse(wizCaptchaId)'));
});
test('page : widget Turnstile en mode explicite, action rsu_request, clé lue via /api/rsu-config', () => {
  assert.ok(PAGE.includes('challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'));
  assert.ok(PAGE.includes("fetch('/api/rsu-config'"));
  assert.ok(PAGE.includes("action: 'rsu_request'"));
  assert.ok(PAGE.includes('id="wizCaptcha"'));
});
test('page : widget initialisé uniquement sur le Preview TEST (jamais sur le domaine public)', () => {
  assert.ok(/function wizInitCaptcha\(\) \{\s*\n\s*if \(!RSU_TRANSMISSION_ACTIVE \|\| wizCaptchaStarted\) return;/.test(PAGE),
    'wizInitCaptcha doit sortir immédiatement hors Preview TEST');
});
// Un jeton Turnstile expire après 300 s et ne sert qu'une fois. Le diagnostic
// comptant six étapes, le widget ne doit être rendu qu'à la dernière.
test('page : le widget anti-robot est rendu à la dernière étape, pas à l\'ouverture', () => {
  const contact = PAGE.indexOf('function showActioContact()');
  const init = PAGE.indexOf('wizInitCaptcha();', contact);
  assert.ok(contact > 0 && init > contact, 'wizInitCaptcha() doit être appelé depuis showActioContact()');
  const ouverture = PAGE.indexOf('function openActioWizard()');
  const bloc = PAGE.slice(ouverture, PAGE.indexOf('function renderActioStep()'));
  assert.ok(!bloc.includes('wizInitCaptcha'), 'le widget ne doit pas démarrer à l\'ouverture du diagnostic');
});
test('page : expiration et dépassement de délai du jeton sont traités', () => {
  assert.ok(PAGE.includes("'expired-callback'"), 'expired-callback absent');
  assert.ok(PAGE.includes("'timeout-callback'"), 'timeout-callback absent');
});
test('page : jeton réinitialisé après un échec (usage unique)', () => {
  assert.ok(PAGE.includes('window.turnstile.reset(wizCaptchaId)'));
});
test('page : aucun secret Turnstile, aucune clé en dur, aucun appel siteverify côté navigateur', () => {
  assert.ok(!PAGE.includes('RSU_TURNSTILE_SECRET'));
  assert.ok(!/sitekey:\s*'0x/.test(PAGE));
  assert.ok(!PAGE.includes('siteverify'));
});
test('page : le diagnostic refuse d\'envoyer sans jeton anti-robot', () => {
  const sub = PAGE.slice(PAGE.indexOf('async function actioWizSubmit()'));
  const garde = sub.indexOf('if (!captchaToken) {');
  const envoi = sub.indexOf('await fetch(RSU_ENDPOINT');
  assert.ok(garde > 0 && envoi > 0, 'garde ou envoi introuvable');
  assert.ok(garde < envoi, 'le contrôle du jeton doit précéder l\'envoi');
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
  // Collecte Google Ads (ad.doubleclick.net/ccm/s/collect) : appelée tantôt en
  // pixel, tantôt en beacon — les deux directives sont donc nécessaires.
  // `script-src` reste volontairement inchangé : aucun script n'en provient.
  assert.ok(directive('img-src').includes('https://ad.doubleclick.net'), 'collecte Ads autorisée en image');
  assert.ok(directive('connect-src').includes('https://ad.doubleclick.net'), 'collecte Ads autorisée en connexion');
  assert.ok(!directive('script-src').includes('ad.doubleclick.net'), 'script-src ne doit pas être élargi');
});

// ── 7. SQL (contrôles statiques) ──────────────────────────────────────────────
const SQL_TABLE = fs.readFileSync(path.join(ROOT, 'migration-rsu-requests.sql'), 'utf8');
const SQL_DIAG = fs.readFileSync(path.join(ROOT, 'migration-rsu-diagnostic.sql'), 'utf8');
const SQL = SQL_TABLE + '\n' + SQL_DIAG;
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
  for (const name of ['DISPOSITIFS', 'BESOINS', 'ECHEANCES', 'MONTANTS', 'STADES', 'INTERNATIONAL']) {
    const m = api.match(new RegExp(`const ${name} = \\[([^\\]]*)\\];`));
    assert.ok(m, name);
    // Les commentaires sont retirés avant extraction : une apostrophe dans un
    // commentaire ouvrirait une fausse chaîne et ferait remonter du texte libre.
    const corps = m[1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const items = [...corps.matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)]
      .map(x => (x[1] !== undefined ? x[1].replace(/\\'/g, "'") : x[2]));
    assert.ok(items.length > 0);
    for (const it of items) assert.ok(SQL.includes(`'${it.replace(/'/g, "''")}'`), `${name} : « ${it} » absent du SQL`);
  }
});
test('SQL : idempotent (create if not exists, drop policy if exists)', () => {
  assert.ok(/create table if not exists/.test(sqlNoComments));
  assert.ok(/drop policy if exists/.test(sqlNoComments));
});

// Retrait du bloc publication (06/11/2026). Le CRM n'écoute plus les demandes
// RSU en postgres_changes : il n'utilise que le canal privé, qui passe par
// realtime.messages et sa politique RLS. Publier la table ici ne servait donc à
// rien, et le script Realtime de production la retirait ensuite — deux
// écritures sur la production pour un effet nul, et entre les deux une fenêtre
// où le signal d'activité des demandes était observable.
const sansCommentaires = (s) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
test('SQL : la table n\'est jamais ajoutée à la publication supabase_realtime', () => {
  for (const [nom, source] of [['migration-rsu-requests.sql', SQL_TABLE],
                               ['migration-rsu-diagnostic.sql', SQL_DIAG]]) {
    const code = sansCommentaires(source);
    assert.ok(!/alter\s+publication/i.test(code),
      `${nom} : aucune instruction « alter publication » ne doit subsister`);
    assert.ok(!/add\s+table\s+public\.rsu_requests/i.test(code),
      `${nom} : la table ne doit pas être ajoutée à une publication`);
  }
  // Le mot « publication » ne doit plus apparaître que dans les commentaires :
  // un bloc do $$ … $$ qui la manipulerait passerait les deux tests ci-dessus.
  assert.ok(!/publication/i.test(sansCommentaires(SQL)),
    'plus aucune mention de publication hors commentaire dans les migrations du site');
});
test('SQL : le retrait du bloc publication reste justifié dans le fichier', () => {
  // Sans la raison écrite à côté, le bloc revient à la première lecture rapide.
  assert.ok(/RETIRÉ le 06\/11\/2026/.test(SQL_TABLE), 'date du retrait absente');
  assert.ok(/rsu-demandes-prive/.test(SQL_TABLE), 'le canal privé qui remplace doit être nommé');
  assert.ok(/postgres_changes/.test(SQL_TABLE), 'le mécanisme abandonné doit être nommé');
  // TEST a été migré AVEC le bloc : l'information conditionne le retrait au § 3
  // du script Realtime, et ne doit pas disparaître avec le code.
  assert.ok(/TEST/.test(SQL_TABLE) && /03\/11\/2026/.test(SQL_TABLE),
    'l\'état de TEST, migré avec l\'ancien bloc, doit rester écrit');
});
test('SQL : le fichier diagnostic est marqué non exécutable et nomme son remplaçant', () => {
  // Il reste versionné pour que la suite démarre depuis un clone : 25 des 38
  // valeurs acceptées par l'API n'existent que là. Mais il ne doit plus être
  // exécuté : c'est migration-rsu-TEST-delta.sql qui fait autorité.
  assert.ok(/NE PAS EXÉCUTER/.test(SQL_DIAG), 'avertissement de non-exécution absent');
  assert.ok(/migration-rsu-TEST-delta\.sql/.test(SQL_DIAG), 'le fichier qui fait autorité doit être nommé');
  assert.ok(/SUPPLANT/.test(SQL_DIAG), 'la supplantation doit être explicite');
});

// ── 8. Notification interne : clé Brevo mutualisée ────────────────────────────
// Décision du 07/11/2026 : la notification utilise BREVO_API_KEY, la clé du
// compte déjà présente en production, et ne lit RSU_TX_BREVO_API_KEY qu'en repli.
// Les valeurs ci-dessous sont factices : aucune clé réelle dans ce fichier.
const { brevoKey, notifyCabinet, BREVO_KEY_VARS, NOTIFY_ENDPOINT } = handler;
const CLE_COMPTE = 'xkeysib-factice-compte';
const CLE_DEDIEE = 'xkeysib-factice-dediee';
const DEST = 'interne@example.invalid';
// Un enregistrement porteur de données personnelles, pour vérifier qu'aucune ne sort.
const RECORD = { nom: 'Dupont', prenom: 'Camille', email: 'camille.dupont@example.invalid',
  telephone: '0600000000', dispositif: 'RSU', besoin: 'Fiscalité de mes actions',
  montant_estime: '100 à 250 k€', commentaire: 'Mon plan vest en mars' };

test('Brevo : les deux clés présentes — BREVO_API_KEY est retenue', () => {
  const r = brevoKey({ BREVO_API_KEY: CLE_COMPTE, RSU_TX_BREVO_API_KEY: CLE_DEDIEE });
  assert.strictEqual(r.key, CLE_COMPTE);
  assert.strictEqual(r.source, 'BREVO_API_KEY');
});
test('Brevo : repli sur RSU_TX_BREVO_API_KEY quand la clé du compte est absente', () => {
  const r = brevoKey({ RSU_TX_BREVO_API_KEY: CLE_DEDIEE });
  assert.strictEqual(r.key, CLE_DEDIEE);
  assert.strictEqual(r.source, 'RSU_TX_BREVO_API_KEY');
});
test('Brevo : une BREVO_API_KEY vide ou blanche ne masque pas le repli', () => {
  for (const vide of ['', '   ', '\n']) {
    const r = brevoKey({ BREVO_API_KEY: vide, RSU_TX_BREVO_API_KEY: CLE_DEDIEE });
    assert.strictEqual(r.source, 'RSU_TX_BREVO_API_KEY', `valeur vide « ${JSON.stringify(vide)} »`);
    assert.strictEqual(r.key, CLE_DEDIEE);
  }
});
test('Brevo : aucune clé — ni valeur, ni source', () => {
  assert.deepStrictEqual(brevoKey({}), { key: '', source: null });
});
test('Brevo : la valeur est nettoyée (un retour à la ligne ferait un en-tête invalide)', () => {
  assert.strictEqual(brevoKey({ BREVO_API_KEY: '  ' + CLE_COMPTE + '\n' }).key, CLE_COMPTE);
});
test('Brevo : l\'ordre de priorité est bien compte puis clé dédiée', () => {
  // Garde documentaire : inverser cet ordre changerait silencieusement la clé
  // utilisée en Preview, où les deux variables peuvent coexister.
  assert.deepStrictEqual(BREVO_KEY_VARS, ['BREVO_API_KEY', 'RSU_TX_BREVO_API_KEY']);
});

test('Notification : aucune clé — aucun envoi, aucun appel réseau', async () => {
  const f = stubFetch(() => { throw new Error('aucun appel ne doit partir'); });
  try {
    await withEnv({ RSU_NOTIFY_TO: DEST }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.strictEqual(r.sent, false);
      assert.strictEqual(r.reason, 'non_configure'); // l'appelant reste silencieux sur ce motif
      assert.strictEqual(r.manque, 'cle');
    });
    assert.strictEqual(f.calls.length, 0, 'aucun appel réseau sans clé');
  } finally { f.restore(); }
});
test('Notification : clé présente mais destinataire absent — aucun envoi', async () => {
  const f = stubFetch(() => { throw new Error('aucun appel ne doit partir'); });
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.strictEqual(r.reason, 'non_configure');
      assert.strictEqual(r.manque, 'destinataire');
    });
    assert.strictEqual(f.calls.length, 0);
  } finally { f.restore(); }
});
test('Notification : la clé du compte part bien dans l\'en-tête api-key', async () => {
  const f = stubFetch(() => json({ messageId: '<factice>' }));
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE, RSU_TX_BREVO_API_KEY: CLE_DEDIEE, RSU_NOTIFY_TO: DEST }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.strictEqual(r.sent, true);
      assert.strictEqual(r.source, 'BREVO_API_KEY');
    });
    assert.strictEqual(f.calls.length, 1);
    assert.strictEqual(f.calls[0].url, NOTIFY_ENDPOINT);
    assert.strictEqual(f.calls[0].method, 'POST');
    assert.strictEqual(f.calls[0].headers['api-key'], CLE_COMPTE, 'la clé dédiée ne doit pas servir');
  } finally { f.restore(); }
});
test('Notification : en repli, c\'est la clé dédiée qui part, et la source la nomme', async () => {
  const f = stubFetch(() => json({ messageId: '<factice>' }));
  try {
    await withEnv({ RSU_TX_BREVO_API_KEY: CLE_DEDIEE, RSU_NOTIFY_TO: DEST }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.strictEqual(r.sent, true);
      assert.strictEqual(r.source, 'RSU_TX_BREVO_API_KEY');
    });
    assert.strictEqual(f.calls[0].headers['api-key'], CLE_DEDIEE);
  } finally { f.restore(); }
});
test('Notification : transactionnel seul, aucune liste, charge utile entièrement constante', async () => {
  // Preuve par construction plutôt que par flairage : si la charge utile ne
  // dépend QUE de constantes et du destinataire interne, aucune donnée de la
  // demande ne peut s'y trouver, quelle que soit la demande. Le flairage par
  // sous-chaîne, lui, est piégeux — « RSU » figure dans l'objet du message.
  const f = stubFetch(() => json({ messageId: '<factice>' }));
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE, RSU_NOTIFY_TO: DEST }, () => notifyCabinet(RECORD));
    const envoi = f.calls[0];
    assert.ok(envoi.url.endsWith('/v3/smtp/email'), 'endpoint transactionnel');
    assert.ok(!envoi.url.includes('/v3/contacts'), 'jamais la gestion de contacts');
    const corps = JSON.parse(String(envoi.body));
    assert.deepStrictEqual(Object.keys(corps).sort(), ['sender', 'subject', 'tags', 'textContent', 'to'],
      'aucun champ de plus : ni listIds, ni templateId, ni params');
    assert.deepStrictEqual(corps.to, [{ email: DEST }]);
    assert.deepStrictEqual(corps.sender, { name: 'CRM Proactifs', email: DEST });
    assert.deepStrictEqual(corps.tags, ['rsu-notification-interne']);
    assert.strictEqual(corps.subject, 'Nouvelle demande RSU/ESPP à traiter dans le CRM');
    assert.ok(/aucune donnée personnelle/.test(corps.textContent));
  } finally { f.restore(); }
});
test('Notification : une demande entière ne laisse aucune trace dans le message', async () => {
  // Valeurs sentinelles, choisies pour ne pouvoir figurer dans aucun libellé fixe.
  const sentinelles = { nom: 'Zzsentinelle-Nom', prenom: 'Zzsentinelle-Prenom',
    email: 'zzsentinelle@example.invalid', telephone: '0699000011',
    dispositif: 'Zzsentinelle-Dispositif', besoin: 'Zzsentinelle-Besoin',
    montant_estime: 'Zzsentinelle-Montant', stade: 'Zzsentinelle-Stade',
    commentaire: 'Zzsentinelle-Commentaire' };
  const f = stubFetch(() => json({ messageId: '<factice>' }));
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE, RSU_NOTIFY_TO: DEST }, () => notifyCabinet(sentinelles));
    const corps = String(f.calls[0].body);
    for (const [champ, valeur] of Object.entries(sentinelles)) {
      assert.ok(!corps.includes(valeur), `« ${champ} » ne doit pas figurer dans la notification`);
    }
    assert.ok(!corps.includes('Zzsentinelle'), 'aucune sentinelle, même tronquée');
  } finally { f.restore(); }
});
test('Notification : clé refusée par Brevo — motif et variable en cause remontés', async () => {
  // C'est le cas d'une clé Restricted sans la permission « Transactional email ».
  const f = stubFetch(() => new Response('', { status: 401 }));
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE, RSU_NOTIFY_TO: DEST }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.strictEqual(r.sent, false);
      assert.strictEqual(r.reason, 'http_401');
      assert.strictEqual(r.source, 'BREVO_API_KEY', 'le nom de la variable permet le diagnostic');
    });
  } finally { f.restore(); }
});
test('Notification : incident réseau — la demande reste enregistrée', async () => {
  const f = stubFetch(() => { throw new Error('réseau'); });
  try {
    await withEnv({ BREVO_API_KEY: CLE_COMPTE, RSU_NOTIFY_TO: DEST }, async () => {
      const r = await notifyCabinet(RECORD);
      assert.deepStrictEqual({ sent: r.sent, reason: r.reason, source: r.source },
        { sent: false, reason: 'erreur_reseau', source: 'BREVO_API_KEY' });
    });
  } finally { f.restore(); }
});
test('Documentation : l\'en-tête de l\'API décrit la mutualisation et la permission requise', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api', 'rsu-request.js'), 'utf8');
  const entete = api.slice(0, api.indexOf('*/'));
  assert.ok(/BREVO_API_KEY/.test(entete), 'la clé du compte doit être documentée');
  assert.ok(/repli TEMPORAIRE/i.test(entete), 'le statut temporaire du repli doit être écrit');
  assert.ok(/Ne pas créer en production/i.test(entete), 'la consigne Vercel doit être écrite');
  assert.ok(/Transactional email/.test(entete), 'la permission Brevo requise doit être écrite');
});
test('Documentation : toute variable lue par le code est décrite dans l\'en-tête', () => {
  // Garde auto-entretenu : c'est ce test, et non la vigilance, qui empêche la
  // liste des variables Vercel de dériver du code au prochain ajout.
  const api = fs.readFileSync(path.join(ROOT, 'api', 'rsu-request.js'), 'utf8');
  const fin = api.indexOf('*/');
  const entete = api.slice(0, fin);
  const corps = api.slice(fin);
  const lues = new Set([...corps.matchAll(/\b(RSU_[A-Za-z_]+|SUPABASE_URL|SUPABASE_SERVICE_KEY|BREVO_API_KEY|VERCEL_ENV)\b/g)]
    .map(m => m[1])
    .filter(n => !/^RSU_(CONSENT|DELAI|CHAMPS|ACTIF|PROJET)/.test(n))); // constantes, pas des variables d'environnement
  assert.ok(lues.size >= 10, 'extraction suspecte : ' + lues.size + ' nom(s) trouvé(s)');
  const absentes = [...lues].filter(n => !entete.includes(n));
  assert.deepStrictEqual(absentes, [], 'variables lues mais non documentées : ' + absentes.join(', '));
});
test('Documentation : la liste des variables de production est à jour', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api', 'rsu-request.js'), 'utf8');
  const entete = api.slice(0, api.indexOf('*/'));
  const bloc = entete.slice(entete.indexOf('Ce que PRODUCTION doit contenir'));
  assert.ok(bloc.length > 100, 'bloc « ce que production doit contenir » introuvable');
  for (const n of ['RSU_PROD_ENABLED', 'RSU_PROD_SUPABASE_REF', 'RSU_TEST_SUPABASE_REF', 'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY', 'RSU_TURNSTILE_SECRET', 'RSU_TURNSTILE_SITE_KEY', 'RSU_NOTIFY_TO', 'BREVO_API_KEY']) {
    assert.ok(bloc.includes(n), `${n} doit figurer dans la liste de production`);
  }
  // Et surtout : la clé dédiée doit être explicitement exclue de la production.
  assert.ok(/NE PAS créer en production[\s\S]*RSU_TX_BREVO_API_KEY/.test(bloc),
    'RSU_TX_BREVO_API_KEY doit être nommée parmi les variables à ne pas créer en production');
});
