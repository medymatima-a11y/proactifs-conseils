// Tests locaux de l'endpoint RSU/ESPP, du garde-fou d'activation de la page et du SQL.
// Aucun appel réseau réel : fetch est simulé. Aucune donnée réelle. Usage : node --test tests/rsu-request.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const handler = require(path.join(ROOT, 'api', 'rsu-request.js'));
const { checkTarget, verifyCaptcha, validate } = handler;

const T = 'b'.repeat(20); // référence TEST factice
const P = 'a'.repeat(20); // référence PROD factice
const ENV_KEYS = ['VERCEL_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RSU_TEST_SUPABASE_REF', 'RSU_PROD_SUPABASE_REF',
  'RSU_PROD_ENABLED', 'RSU_TURNSTILE_SECRET', 'RSU_DAILY_CAP', 'RSU_TX_BREVO_API_KEY', 'RSU_NOTIFY_TO'];
const PREVIEW_ENV = { VERCEL_ENV: 'preview', SUPABASE_URL: `https://${T}.supabase.co`, SUPABASE_SERVICE_KEY: 'cle-factice-test',
  RSU_TEST_SUPABASE_REF: T, RSU_PROD_SUPABASE_REF: P };
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

// Répondeur par défaut : Turnstile valide, comptages à zéro, insertion acceptée.
function defaultResponder(opts = {}) {
  return (url, o) => {
    if (url.includes('challenges.cloudflare.com')) return json({ success: opts.turnstile !== false });
    if (url.includes('/rest/v1/rsu_requests') && (o.method || 'GET') === 'GET') {
      if (url.includes('email=eq.')) return count(opts.perEmail ?? 0);
      return count(opts.total ?? 0);
    }
    if (url.includes('/rest/v1/rsu_requests') && o.method === 'POST') return new Response('', { status: 201 });
    return json({}, 404);
  };
}
const VALID = { nom: 'Test RSU', email: 'test-rsu@example.com', telephone: '06 00 00 00 01', dispositif: 'ESPP',
  besoin: 'Autre', echeance: "Simple prise d'information", commentaire: '', consent: true, website: '' };
const ORIGIN = 'https://proactifs-conseils-git-feat-rsu-form-preview-medymatima-a11ys-projects.vercel.app';

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
  assert.deepStrictEqual(checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'true' }), { ok: true, mode: 'production' });
});
test('production activée mais pointant TEST : refus', () => {
  const r = checkTarget({ ...PROD_ENV, RSU_PROD_ENABLED: 'true', SUPABASE_URL: `https://${T}.supabase.co` });
  assert.strictEqual(r.ok, false);
});
test('preview vers TEST exact : autorisé', () => {
  assert.deepStrictEqual(checkTarget({ ...PREVIEW_ENV }), { ok: true, mode: 'preview_test' });
});
test('preview pointant PROD : refus', () => {
  assert.strictEqual(checkTarget({ ...PREVIEW_ENV, SUPABASE_URL: `https://${P}.supabase.co` }).reason, 'preview_pointe_production');
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
test('Turnstile non défini : aucun appel Cloudflare, enregistrement possible', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV } });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(!calls.some(c => c.url.includes('challenges.cloudflare.com')));
});
test('Turnstile défini, jeton absent : 400 CAPTCHA, aucun appel', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV, RSU_TURNSTILE_SECRET: 'secret-factice' } });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'CAPTCHA');
  assert.strictEqual(calls.length, 0);
});
test('Turnstile défini, jeton refusé par Cloudflare : 400, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV, RSU_TURNSTILE_SECRET: 's' }, body: { ...VALID, captchaToken: 'jeton' },
    responder: defaultResponder({ turnstile: false }) });
  assert.strictEqual(res.statusCode, 400);
  assert.ok(inserts(calls).length === 0);
});
test('Turnstile défini, Cloudflare injoignable : 503, aucune insertion', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV, RSU_TURNSTILE_SECRET: 's' }, body: { ...VALID, captchaToken: 'jeton' },
    responder: (url) => { if (url.includes('challenges.cloudflare.com')) throw new Error('réseau'); return defaultResponder()(url); } });
  assert.strictEqual(res.statusCode, 503);
  assert.ok(inserts(calls).length === 0);
});
test('verifyCaptcha sans secret : ok, sans appel', async () => {
  const f = stubFetch(() => json({}));
  try {
    const r = await withEnv({}, () => verifyCaptcha(process.env, '', ''));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(f.calls.length, 0);
  } finally { f.restore(); }
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
test('preview TEST, parcours nominal : 200 et insertion sans jeton anti-robot stocké', async () => {
  const { res, calls } = await run({ env: { ...PREVIEW_ENV }, body: { ...VALID, captchaToken: '' } });
  assert.strictEqual(res.statusCode, 200);
  const post = inserts(calls)[0];
  assert.ok(post, 'insertion attendue');
  assert.ok(post.url.startsWith(`https://${T}.supabase.co/rest/v1/rsu_requests`), 'insertion vers TEST uniquement');
  const row = JSON.parse(post.body);
  assert.strictEqual(row.statut, 'nouveau');
  assert.strictEqual(row.consent_version, 'rsu-consent-v1');
  assert.ok(row.consent_at);
  assert.ok(!('captchaToken' in row) && !('website' in row) && !('consent' in row));
});
test('production activée avec Turnstile valide : 200 vers PROD uniquement', async () => {
  const { res, calls } = await run({ env: { ...PROD_ENV, RSU_PROD_ENABLED: 'true', RSU_TURNSTILE_SECRET: 's' },
    origin: 'https://proactifsconseils.fr', body: { ...VALID, captchaToken: 'jeton' } });
  assert.strictEqual(res.statusCode, 200);
  const post = inserts(calls)[0];
  assert.ok(post.url.startsWith(`https://${P}.supabase.co/`));
});

// ── 6. Garde-fou d'activation côté page ───────────────────────────────────────
const PAGE = fs.readFileSync(path.join(ROOT, 'fiscalite-rsu-stock-options.html'), 'utf8');
function evalPreviewHosts() {
  const m = PAGE.match(/var RSU_PREVIEW_TEST_HOSTS = (\[[^\]]*\]);/);
  assert.ok(m, 'liste des hôtes Preview TEST introuvable');
  const hosts = new Function('return ' + m[1])();
  return (hostname) => hosts.indexOf(hostname) !== -1;
}
test('page : transmission active uniquement sur le Preview TEST listé', () => {
  const active = evalPreviewHosts();
  assert.strictEqual(active('proactifs-conseils-git-feat-rsu-form-preview-medymatima-a11ys-projects.vercel.app'), true);
  assert.strictEqual(active('proactifsconseils.fr'), false);
  assert.strictEqual(active('www.proactifsconseils.fr'), false);
  assert.strictEqual(active('proactifs-conseils-git-main-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-autre-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('proactifs-conseils-git-feat-rsu-form-local-medymatima-a11ys-projects.vercel.app'), false);
  assert.strictEqual(active('localhost'), false);
});
test('page : jeton anti-robot transmis au serveur', () => {
  assert.ok(PAGE.includes("captchaToken: (form.querySelector('[name=\"cf-turnstile-response\"]') || {}).value || ''"));
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
