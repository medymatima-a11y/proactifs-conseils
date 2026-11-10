'use strict';
/* Anti-robot discret des quatre formulaires publics.
   Trois volets :
   1. `assets/js/subscribe-captcha.js` exécuté dans un DOM simulé (aucun navigateur,
      aucun réseau : `fetch` est un bouchon et toute URL inattendue fait échouer le test).
   2. `/api/subscribe-config` : clé publique seulement, nulle tant qu'elle n'existe pas.
   3. Balisage des quatre pages : conteneur présent, script inclus, jeton et champ
      piège joints au payload, widget réinitialisé après échec.
   Aucune valeur de clé réelle : uniquement des chaînes factices. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HELPER_SRC = read('assets/js/subscribe-captcha.js');

const PAGES = [
  { file: 'index.html', submit: 'wizSubmit()' },
  { file: 'declaration-rsu-espp-france.html', submit: 'actioWizSubmit()' },
  { file: 'immobilier/succession-colombes.html', submit: null },
  { file: 'optimisation-fiscale-ile-de-france.html', submit: 'fiscalWizSubmit()' },
];

/* ════════ 1. Le module client, dans un DOM simulé ════════ */

function fakeDom(opts = {}) {
  const created = [];
  const byId = {};
  function mkEl(tag) {
    const el = {
      tagName: tag, style: {}, attributes: {}, children: [], value: '', textContent: '', innerHTML: '',
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() {}, removeEventListener() {},
    };
    created.push(el);
    return el;
  }
  const ids = ['pcCaptcha', 'pcCaptchaWrap', 'pcCaptchaErr', 'pcCaptchaNote'].concat(opts.ids || []);
  for (const id of ids) byId[id] = mkEl('div');
  const document = {
    createElement: mkEl,
    getElementById: (id) => (Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null),
    querySelector: () => (opts.form === false ? null : mkEl('form')),
    addEventListener() {},
    head: mkEl('head'),
    body: mkEl('body'),
  };
  const fetchCalls = [];
  const window = {
    console: { warn() {}, error() {} },
    fetch: (url, init) => {
      fetchCalls.push(String(url));
      if (String(url) !== '/api/subscribe-config') {
        throw new Error('APPEL RESEAU INATTENDU: ' + url);
      }
      if (opts.configStatus === 'ko') return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.config !== undefined ? opts.config : { turnstileSiteKey: null }) });
    },
  };
  if (opts.turnstile) window.turnstile = opts.turnstile;
  const sandbox = { window, document, console: window.console, Promise, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(HELPER_SRC, sandbox, { filename: 'subscribe-captcha.js' });
  return { api: window.ProactifsCaptcha, window, document, byId, created, fetchCalls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('module client : exposé avec son contrat minimal', () => {
  const { api } = fakeDom();
  for (const k of ['prepare', 'prepareOnFirstInteraction', 'token', 'reset', 'hp', 'state']) {
    assert.strictEqual(typeof api[k], 'function', 'méthode manquante : ' + k);
  }
  assert.strictEqual(api.state(), 'inactif');
});

test('module client : champ piège injecté, invisible et sans risque a11y/autofill', () => {
  const { api, created } = fakeDom();
  api.prepare();
  const hp = created.find((e) => e.tagName === 'input');
  assert.ok(hp, 'champ piège non injecté');
  assert.strictEqual(hp.style.display, 'none', 'doit être display:none (hors arbre a11y, ignoré par l\'autofill)');
  assert.strictEqual(hp.attributes['aria-hidden'], 'true');
  assert.strictEqual(hp.attributes.tabindex, '-1');
  assert.strictEqual(hp.attributes.autocomplete, 'off');
  assert.strictEqual(hp.name, 'hp', 'nom neutre attendu');
  assert.ok(!/pass|mail|tel|nom|prenom|adresse/i.test(hp.name), 'nom susceptible d\'attirer un gestionnaire de mots de passe');
  assert.strictEqual(api.hp(), '', 'vide pour un humain');
});

test('module client : sans clé publique, aucun widget, aucun script Cloudflare, envoi non bloqué', async () => {
  const { api, created, fetchCalls } = fakeDom({ config: { turnstileSiteKey: null } });
  api.prepare();
  await flush();
  assert.deepStrictEqual(fetchCalls, ['/api/subscribe-config']);
  assert.ok(!created.some((e) => e.tagName === 'script'), 'script Cloudflare chargé alors qu\'aucune clé n\'existe');
  assert.strictEqual(api.state(), 'indisponible');
  assert.strictEqual(api.token(), '', 'jeton vide, le formulaire part quand même');
});

test('module client : endpoint de configuration en erreur = dégradation silencieuse', async () => {
  const { api } = fakeDom({ configStatus: 'ko' });
  api.prepare();
  await flush();
  assert.strictEqual(api.state(), 'indisponible');
  assert.strictEqual(api.token(), '');
});

test('module client : avec clé publique, widget rendu en mode discret', async () => {
  const renders = [];
  const turnstile = {
    render: (sel, params) => { renders.push({ sel, params }); return 7; },
    getResponse: () => 'jeton-factice',
    reset: () => { renders.push('reset'); },
  };
  const { api, byId } = fakeDom({ config: { turnstileSiteKey: 'cle-publique-factice', action: 'subscribe_form' }, turnstile });
  api.prepare();
  await flush();
  assert.strictEqual(api.state(), 'pret');
  assert.strictEqual(renders.length, 1);
  const p = renders[0].params;
  assert.strictEqual(renders[0].sel, '#pcCaptcha');
  assert.strictEqual(p.sitekey, 'cle-publique-factice');
  assert.strictEqual(p.action, 'subscribe_form');
  assert.strictEqual(p.appearance, 'interaction-only', 'mode discret attendu : rien ne s\'affiche sans interaction requise');
  assert.strictEqual(p['refresh-expired'], 'auto', 'un jeton expiré doit se renouveler seul');
  for (const cb of ['callback', 'expired-callback', 'timeout-callback', 'error-callback']) {
    assert.strictEqual(typeof p[cb], 'function', 'rappel manquant : ' + cb);
  }
  assert.strictEqual(api.token(), 'jeton-factice');
  api.reset();
  assert.strictEqual(renders[1], 'reset');
  assert.ok(/Cloudflare Turnstile/.test(byId.pcCaptchaNote.innerHTML), 'mention RGPD du tiers non affichée alors que le widget est actif');
  assert.ok(/\/confidentialite/.test(byId.pcCaptchaNote.innerHTML), 'lien vers la politique de confidentialité absent');
});

test('module client : la mention Cloudflare n\'apparaît pas quand le widget est inactif', async () => {
  const { api, byId } = fakeDom({ config: { turnstileSiteKey: null } });
  api.prepare();
  await flush();
  assert.strictEqual(byId.pcCaptchaNote.innerHTML, '', 'affirmation inexacte affichée au visiteur');
});

test('module client : erreur de rendu Cloudflare = message neutre, jamais de blocage', async () => {
  const turnstile = { render: (sel, params) => { params['error-callback'](); return 3; }, getResponse: () => '', reset: () => {} };
  const { api, byId } = fakeDom({ config: { turnstileSiteKey: 'cle-publique-factice' }, turnstile });
  api.prepare();
  await flush();
  assert.strictEqual(byId.pcCaptchaErr.textContent, '', 'aucun message anxiogène sur échec Cloudflare');
  assert.strictEqual(api.token(), '', 'jeton vide : le serveur tranchera');
});

test('module client : jeton expiré = message explicite et réessai possible', async () => {
  const turnstile = { render: (sel, params) => { params['expired-callback'](); return 4; }, getResponse: () => '', reset: () => {} };
  const { api, byId } = fakeDom({ config: { turnstileSiteKey: 'cle-publique-factice' }, turnstile });
  api.prepare();
  await flush();
  assert.ok(/expir/i.test(byId.pcCaptchaErr.textContent), 'message d\'expiration attendu');
  assert.ok(/nouveau|réessay|envoyer/i.test(byId.pcCaptchaErr.textContent), 'le visiteur doit comprendre qu\'il peut renvoyer');
});

test('module client : prepare() est idempotent', async () => {
  const renders = [];
  const turnstile = { render: () => { renders.push(1); return 1; }, getResponse: () => '', reset: () => {} };
  const { api, fetchCalls } = fakeDom({ config: { turnstileSiteKey: 'cle-publique-factice' }, turnstile });
  api.prepare(); api.prepare(); api.prepare();
  await flush();
  assert.strictEqual(fetchCalls.length, 1, 'un seul appel de configuration');
  assert.strictEqual(renders.length, 1, 'un seul widget par page');
});

/* ── Plusieurs formulaires sur une même page (guide patrimonial) ──
   Un widget par cible, chacun rendu dans son propre conteneur, pour qu'un défi
   Cloudflare s'affiche dans le formulaire réellement utilisé. */

const CIBLE_HAUT = { holder: '#pcCaptchaHaut', wrap: 'pcCaptchaWrapHaut', err: 'pcCaptchaErrHaut' };
const CIBLE_BAS = { holder: '#pcCaptchaBas', wrap: 'pcCaptchaWrapBas', err: 'pcCaptchaErrBas' };
const IDS_GUIDE = ['pcCaptchaHaut', 'pcCaptchaWrapHaut', 'pcCaptchaErrHaut', 'pcCaptchaBas', 'pcCaptchaWrapBas', 'pcCaptchaErrBas'];

function domGuide(turnstile) {
  return fakeDom({ ids: IDS_GUIDE, config: { turnstileSiteKey: 'cle-publique-factice', action: 'subscribe_form' }, turnstile });
}

test('module client : deux cibles = deux widgets, chacun dans son conteneur', async () => {
  const renders = [];
  const turnstile = {
    render: (sel, params) => { renders.push({ sel, params }); return renders.length; },
    getResponse: (id) => 'jeton-' + id,
    reset: (id) => { renders.push('reset-' + id); },
  };
  const { api, byId } = domGuide(turnstile);
  api.prepare(CIBLE_HAUT);
  api.prepare(CIBLE_BAS);
  await flush();
  assert.strictEqual(renders.length, 2, 'un widget par formulaire attendu');
  assert.strictEqual(renders[0].sel, '#pcCaptchaHaut');
  assert.strictEqual(renders[1].sel, '#pcCaptchaBas');
  // Chaque enveloppe est révélée indépendamment.
  assert.strictEqual(byId.pcCaptchaWrapHaut.style.display, 'block');
  assert.strictEqual(byId.pcCaptchaWrapBas.style.display, 'block');
  // Jeton et réinitialisation sont bien portés par la cible demandée.
  assert.strictEqual(api.token('#pcCaptchaHaut'), 'jeton-1');
  assert.strictEqual(api.token('#pcCaptchaBas'), 'jeton-2');
  api.reset('#pcCaptchaBas');
  assert.strictEqual(renders[renders.length - 1], 'reset-2', 'réinitialisation appliquée au mauvais widget');
});

test('module client : les messages vont dans le formulaire concerné, pas dans l\'autre', async () => {
  const rappels = {};
  const turnstile = {
    render: (sel, params) => { rappels[sel] = params; return sel; },
    getResponse: () => '', reset: () => {},
  };
  const { api, byId } = domGuide(turnstile);
  api.prepare(CIBLE_HAUT);
  api.prepare(CIBLE_BAS);
  await flush();
  rappels['#pcCaptchaBas']['expired-callback']();
  assert.ok(/expir/i.test(byId.pcCaptchaErrBas.textContent), 'message absent du formulaire du bas');
  assert.strictEqual(byId.pcCaptchaErrHaut.textContent, '', 'message affiché dans le formulaire du haut à tort');
  assert.strictEqual(byId.pcCaptchaErr.textContent, '', 'message écrit dans la zone par défaut inexistante sur cette page');
});

test('module client : idempotence PAR cible', async () => {
  const renders = [];
  const turnstile = { render: (sel) => { renders.push(sel); return sel; }, getResponse: () => '', reset: () => {} };
  const { api, fetchCalls } = domGuide(turnstile);
  api.prepare(CIBLE_HAUT);
  api.prepare(CIBLE_HAUT);
  api.prepare(CIBLE_BAS);
  api.prepare(CIBLE_BAS);
  await flush();
  assert.deepStrictEqual(renders, ['#pcCaptchaHaut', '#pcCaptchaBas'], 'un widget par cible, sans doublon');
  assert.strictEqual(fetchCalls.length, 2, 'une configuration par cible');
});

test('module client : compatibilité — sans cible, tout vise le conteneur par défaut', async () => {
  const renders = [];
  const turnstile = { render: (sel) => { renders.push(sel); return 7; }, getResponse: (id) => 'jeton-' + id, reset: (id) => { renders.push('reset-' + id); } };
  const { api, byId } = fakeDom({ config: { turnstileSiteKey: 'cle-publique-factice' }, turnstile });
  api.prepare();                       // appel des neuf autres pages
  await flush();
  assert.deepStrictEqual(renders, ['#pcCaptcha'], 'cible par défaut attendue');
  assert.strictEqual(api.state(), 'pret');
  assert.strictEqual(api.token(), 'jeton-7', 'lecture sans cible cassée');
  api.reset();
  assert.strictEqual(renders[renders.length - 1], 'reset-7', 'réinitialisation sans cible cassée');
  assert.ok(/Cloudflare Turnstile/.test(byId.pcCaptchaNote.innerHTML), 'mention RGPD par défaut perdue');
});

test('module client : une cible inconnue ne renvoie ni jeton ni erreur', async () => {
  const turnstile = { render: () => 1, getResponse: () => 'jeton', reset: () => { throw new Error('ne doit pas être appelé'); } };
  const { api } = domGuide(turnstile);
  api.prepare(CIBLE_HAUT);
  await flush();
  assert.strictEqual(api.token('#pcInconnu'), '', 'jeton renvoyé pour une cible inexistante');
  api.reset('#pcInconnu'); // ne doit rien lever
  assert.strictEqual(api.state('#pcInconnu'), 'inactif');
});

test('module client : aucune clé ni URL Supabase dans le fichier servi', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(HELPER_SRC), 'jeton dans le module client');
  assert.ok(!/supabase\.co/.test(HELPER_SRC));
  assert.ok(!/0x4[A-Za-z0-9]{10,}/.test(HELPER_SRC), 'clé publique Turnstile codée en dur');
  assert.ok(HELPER_SRC.includes('/api/subscribe-config'), 'la clé publique doit venir du serveur');
});

/* ════════ 2. /api/subscribe-config ════════ */

const config = require('../api/subscribe-config.js');

function mockRes() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  return r;
}

const CONFIG_KEYS = ['VERCEL_ENV', 'SUBSCRIBE_TURNSTILE_SITE_KEY', 'SUBSCRIBE_TURNSTILE_SITE_KEY_Preview'];
function withEnv(values, fn) {
  const saved = {};
  for (const k of CONFIG_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, values);
  const warn = console.warn; console.warn = () => {};
  return Promise.resolve().then(fn).finally(() => {
    console.warn = warn;
    for (const k of CONFIG_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

test('subscribe-config : clé absente = null, aucun secret renvoyé', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const res = mockRes();
    await config({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.turnstileSiteKey, null);
    assert.strictEqual(res.body.action, 'subscribe_form');
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
  });
});

test('subscribe-config : variable propre à chaque environnement, sans repli', async () => {
  await withEnv({ VERCEL_ENV: 'production', SUBSCRIBE_TURNSTILE_SITE_KEY: 'cle-publique-factice-prod' }, async () => {
    const res = mockRes();
    await config({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.body.turnstileSiteKey, 'cle-publique-factice-prod');
  });
  await withEnv({ VERCEL_ENV: 'preview', SUBSCRIBE_TURNSTILE_SITE_KEY: 'cle-publique-factice-prod' }, async () => {
    const res = mockRes();
    await config({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.body.turnstileSiteKey, null, 'Preview ne doit pas lire la variable de production');
  });
  await withEnv({ VERCEL_ENV: 'preview', SUBSCRIBE_TURNSTILE_SITE_KEY_Preview: 'cle-publique-factice-preview' }, async () => {
    const res = mockRes();
    await config({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.body.turnstileSiteKey, 'cle-publique-factice-preview');
  });
});

test('subscribe-config : lecture seule (POST refusé)', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    const res = mockRes();
    await config({ method: 'POST', headers: {} }, res);
    assert.strictEqual(res.statusCode, 405);
  });
});

test('subscribe-config : action identique à celle vérifiée par /api/subscribe', () => {
  const subscribe = require('../api/subscribe.js');
  assert.strictEqual(config.__internals.TURNSTILE_ACTION, subscribe.__internals.TURNSTILE_ACTION);
});

/* ════════ 3. Balisage des quatre pages ════════ */

for (const { file, submit } of PAGES) {
  test(`${file} : conteneur anti-robot et module inclus`, () => {
    const html = read(file);
    assert.ok(html.includes('id="pcCaptchaWrap"'), 'conteneur du widget absent');
    assert.ok(html.includes('id="pcCaptcha"'), 'cible de rendu absente');
    assert.ok(html.includes('id="pcCaptchaErr"'), 'zone de message absente');
    assert.ok(html.includes('id="pcCaptchaNote"'), 'emplacement de la mention Cloudflare absent');
    assert.ok(/<script src="\/assets\/js\/subscribe-captcha\.js" defer><\/script>/.test(html), 'module client non inclus (ou pas en defer)');
  });

  test(`${file} : jeton et champ piège joints à la soumission, widget réinitialisé après échec`, () => {
    const html = read(file);
    assert.ok(/captchaToken:\s*window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.token\(\) : ''/.test(html), 'captchaToken absent du payload');
    assert.ok(/hp:\s*window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.hp\(\) : ''/.test(html), 'champ piège absent du payload');
    assert.ok(html.includes('window.ProactifsCaptcha.reset()'), 'pas de réinitialisation du widget après échec');
    assert.ok(/window\.ProactifsCaptcha\.(prepare|prepareOnFirstInteraction)\(/.test(html), 'widget jamais préparé');
  });

  test(`${file} : aucun appel bloquant côté navigateur`, () => {
    const html = read(file);
    // Le navigateur ne doit jamais refuser l'envoi faute de jeton : aucun test
    // du genre `if (!captchaToken) return` ne doit apparaître dans ces pages.
    assert.ok(!/if\s*\(\s*!\s*captchaToken\s*\)/.test(html), 'blocage client sur jeton manquant');
    assert.ok(!/ProactifsCaptcha\.token\(\)\s*===\s*''/.test(html), 'blocage client sur jeton vide');
  });

  if (submit) {
    test(`${file} : bouton d'envoi inchangé (${submit})`, () => {
      assert.ok(read(file).includes('onclick="' + submit + '"'), 'déclencheur de soumission modifié');
    });
  }
}

test('mention d\'information : finalité et lien vers la politique de confidentialité', () => {
  for (const { file } of PAGES) {
    const html = read(file);
    assert.ok(/href="\/confidentialite"/.test(html.split('</form>')[0] + html), 'lien /confidentialite absent de la page');
    assert.ok(/servent uniquement/.test(html), 'finalité du traitement non exprimée près du formulaire');
  }
});

test('mentions : aucun terme interdit MIF2 introduit par cette correction', () => {
  for (const { file } of PAGES) {
    const html = read(file);
    // Les pages immobilier sont hors périmètre MIF2 (exception CLAUDE.md) : on
    // vérifie seulement que la correction n'a pas introduit ces termes.
    assert.ok(!/anti-robot[^.]*gratuit/i.test(html));
    assert.ok(!/Turnstile[^.]*sans engagement/i.test(html));
  }
});
