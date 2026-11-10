'use strict';
/* Consentement marketing — couverture de TOUS les parcours de collecte du site.
   Trois volets :
   1. Les dix pages corrigées : case facultative, non précochée, jamais bloquante,
      libellé identique à la constante serveur, état transmis.
   2. /api/subscribe-guide : les trois branches (consentement donné, refusé, absent).
   3. Les parcours NON corrigés : leur comportement actuel est épinglé, pour qu'une
      régression ou une évolution soit visible plutôt que silencieuse.
   Aucun appel réseau réel : global.fetch est remplacé, et toute URL inattendue
   fait échouer le test. Aucune valeur de clé réelle. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const subscribe = require('../api/subscribe.js');
const guide = require('../api/subscribe-guide.js');
const { CONSENT_VERSION, CONSENT_TEXTS } = subscribe.__internals;
const LIBELLE = CONSENT_TEXTS[CONSENT_VERSION];

/* ════════ 1. Les dix pages porteuses de la case ════════ */

const PAGES_AVEC_CASE = [
  'index.html',
  'declaration-rsu-espp-france.html',
  'immobilier/succession-colombes.html',
  'optimisation-fiscale-ile-de-france.html',
  'bilan-patrimonial.html',
  'simulation-pret-immobilier.html',
  'simulateurs/capacite-emprunt.html',
  'simulateurs/mensualite-credit.html',
  'simulateurs/taux-endettement.html',
  'guide-5-erreurs-patrimoniaux.html',
];

for (const page of PAGES_AVEC_CASE) {
  test(`${page} : case de consentement conforme`, () => {
    const html = read(page);
    assert.ok(html.includes('name="consentMarketing"'), 'case absente');
    assert.ok(html.includes(LIBELLE), 'libellé affiché différent de celui enregistré comme preuve');
    // Jamais précochée : aucun attribut `checked` sur une case de consentement.
    const cases = html.match(/<input[^>]*name="consentMarketing"[^>]*>/g) || [];
    assert.ok(cases.length >= 1);
    for (const c of cases) assert.ok(!/\schecked\b/.test(c), 'case précochée');
    assert.ok(html.includes("'" + CONSENT_VERSION + "'"), 'version du consentement non transmise');
  });

  test(`${page} : l'état de la case est transmis et ne bloque jamais l'envoi`, () => {
    const html = read(page);
    const lit = /consentMarketing:\s*(!!\(document\.getElementById\('pcConsent'\)|consentMarketing)/.test(html);
    assert.ok(lit, 'état de la case non transmis au serveur');
    assert.ok(!/if\s*\([^)]*consentMarketing[^)]*\)\s*(\{\s*)?return/.test(html), 'la case conditionne la soumission');
    assert.ok(!/consentMarketing\s*!==\s*true/.test(html), 'la case conditionne la soumission');
    assert.ok(!/pcConsent'\)\.checked\s*!==\s*true/.test(html), 'la case conditionne la soumission');
  });
}

test('un seul libellé pour tout le site, une seule version', () => {
  assert.deepStrictEqual(Object.keys(CONSENT_TEXTS), [CONSENT_VERSION], 'plusieurs versions actives : clarifier laquelle est servie');
  // Les deux endpoints partagent la même constante (pas de copie).
  assert.strictEqual(guide.__internals.CONSENT_TEXTS, CONSENT_TEXTS, 'libellé dupliqué entre les endpoints');
  assert.strictEqual(guide.__internals.CONSENT_VERSION, CONSENT_VERSION);
});

test('pages à formulaires multiples : aucun identifiant dupliqué pour la case', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  const avecId = (html.match(/<input[^>]*name="consentMarketing"[^>]*id=/g) || []).length;
  assert.strictEqual(avecId, 0, 'la page a deux formulaires : la case doit utiliser un label implicite, sans id');
  const cases = html.match(/<input[^>]*name="consentMarketing"[^>]*>/g) || [];
  assert.strictEqual(cases.length, 2, 'une case par formulaire attendue');
});

test('conversions et messages préservés sur les pages ajoutées', () => {
  assert.ok(/trackBilanLead\(service\)/.test(read('bilan-patrimonial.html')), 'suivi GA4 du bilan perdu');
  assert.ok(/Votre demande a bien été reçue/.test(read('bilan-patrimonial.html')), 'message de confirmation du bilan perdu');
  const fiscal = read('optimisation-fiscale-ile-de-france.html');
  assert.ok(/send_to: 'AW-/.test(fiscal) && /value: 150\.0/.test(fiscal), 'conversion Ads 150 € perdue');
  for (const s of ['simulateurs/capacite-emprunt.html', 'simulateurs/mensualite-credit.html', 'simulateurs/taux-endettement.html']) {
    assert.ok(/leadSuccessMessage/.test(read(s)), `${s} : message de succès perdu`);
  }
});

/* ════════ 2. /api/subscribe-guide — les trois branches ════════ */

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
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    return responder(String(url), opts);
  };
  return { calls, restore: () => { global.fetch = orig; } };
}
const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SYSTEME_API_KEY', 'VERCEL_ENV', 'SUBSCRIBE_TURNSTILE_SECRET', 'SUBSCRIBE_TURNSTILE_SECRET_Preview'];
function withEnv(values, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, values);
  const w = console.warn, e = console.error;
  console.warn = () => {}; console.error = () => {};
  return Promise.resolve().then(fn).finally(() => {
    console.warn = w; console.error = e;
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}
const GUIDE_ENV = {
  SUPABASE_URL: 'https://projet-factice-test.supabase.co',
  SUPABASE_SERVICE_KEY: 'cle-factice-de-test',
  SYSTEME_API_KEY: 'cle-factice-systeme',
};
const responder = (url) => {
  if (url.includes('/rest/v1/leads')) return new Response('', { status: 201 });
  if (url.includes('api.systeme.io')) return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
  throw new Error('APPEL RESEAU INATTENDU: ' + url);
};
// Répondeur incluant Cloudflare, pour les scénarios anti-robot du guide.
const responderCaptcha = (verdict) => (url) => {
  if (url.includes('challenges.cloudflare.com')) {
    return new Response(JSON.stringify(verdict), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return responder(url);
};
const captchaCalls = (calls) => calls.filter((c) => c.url.includes('challenges.cloudflare.com'));
const leadsInserts = (calls) => calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/leads'));
const systemeCalls = (calls) => calls.filter((c) => c.url.includes('api.systeme.io'));

test('guide : consentement DONNÉ — guide envoyé, lead enregistré, contact Systeme.io créé', async () => {
  await withEnv(GUIDE_ENV, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: { prenom: 'Camille', email: 'C@Example.test', consentMarketing: true, consentVersion: CONSENT_VERSION } }, res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      assert.strictEqual(leadsInserts(f.calls).length, 1);
      assert.strictEqual(systemeCalls(f.calls).length, 1);
      const c = JSON.parse(leadsInserts(f.calls)[0].body).reponses.consentement;
      assert.strictEqual(c.marketing, true);
      assert.strictEqual(c.recueilli, true);
      assert.strictEqual(c.libelle, LIBELLE);
      assert.strictEqual(c.version, CONSENT_VERSION);
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(c.horodatage));
      assert.strictEqual(c.origine.source, 'Guide 5 erreurs');
    } finally { f.restore(); }
  });
});

test('guide : consentement REFUSÉ — guide envoyé, lead enregistré, AUCUN contact Systeme.io', async () => {
  await withEnv(GUIDE_ENV, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: { prenom: 'Camille', email: 'c@example.test', consentMarketing: false, consentVersion: CONSENT_VERSION } }, res);
      assert.strictEqual(res.statusCode, 200, 'le téléchargement ne doit jamais être refusé');
      assert.strictEqual(leadsInserts(f.calls).length, 1);
      assert.strictEqual(systemeCalls(f.calls).length, 0, 'Systeme.io appelé malgré le refus');
      const c = JSON.parse(leadsInserts(f.calls)[0].body).reponses.consentement;
      assert.strictEqual(c.marketing, false);
      assert.strictEqual(c.recueilli, true);
    } finally { f.restore(); }
  });
});

test('guide : consentement ABSENT du payload — aucune inscription marketing', async () => {
  await withEnv(GUIDE_ENV, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: { prenom: 'Camille', email: 'c@example.test' } }, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(leadsInserts(f.calls).length, 1);
      assert.strictEqual(systemeCalls(f.calls).length, 0, 'absence de consentement traitée comme un accord');
      const c = JSON.parse(leadsInserts(f.calls)[0].body).reponses.consentement;
      assert.strictEqual(c.recueilli, false);
      assert.strictEqual(c.marketing, false);
      assert.strictEqual(c.libelle, null);
    } finally { f.restore(); }
  });
});

test('guide : seul le booléen true vaut accord', async () => {
  const p = guide.__internals.preuveConsentement;
  for (const v of ['true', 'on', 1, 'oui', [], {}]) {
    assert.strictEqual(p({ consentMarketing: v, consentVersion: CONSENT_VERSION }, 'Guide 5 erreurs').marketing, false, 'valeur acceptée à tort : ' + JSON.stringify(v));
  }
  assert.strictEqual(p({ consentMarketing: true, consentVersion: CONSENT_VERSION }, 'Guide 5 erreurs').marketing, true);
  // Version inconnue : repli sur la version serveur et son libellé canonique.
  const forge = p({ consentMarketing: true, consentVersion: 'inventee' }, 'Guide 5 erreurs');
  assert.strictEqual(forge.version, CONSENT_VERSION);
  assert.strictEqual(forge.libelle, LIBELLE);
});

test('guide : email manquant refusé, aucune écriture', async () => {
  await withEnv(GUIDE_ENV, async () => {
    const f = stubFetch(responder);
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: { prenom: 'A' } }, res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(f.calls.length, 0);
    } finally { f.restore(); }
  });
});

/* ════════ 2 bis. Parcours du guide : livraison par notre domaine ════════ */

test('guide : redirection vers notre page de remerciement, aucune sortie de domaine', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  assert.ok(html.includes("window.location.href = '/merci-guide'"), 'redirection locale absente');
  assert.ok(!html.includes('proactifsconseils.com'), 'sortie vers le tunnel externe encore présente');
  // L'email du visiteur ne doit plus partir en paramètre d'URL vers un tiers.
  assert.ok(!/searchParams\.set\('email'/.test(html), 'email encore transmis dans l\'URL');
  assert.ok(html.includes("fetch('/api/subscribe-guide'"), 'enregistrement du lead perdu');
});

test('guide : le PDF et la page de remerciement sont servis par le dépôt', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'files', 'guide-5-erreurs-patrimoniaux.pdf')), 'PDF absent du dépôt');
  const merci = read('merci-guide.html');
  assert.ok(/href="\/files\/guide-5-erreurs-patrimoniaux\.pdf" download/.test(merci), 'bouton de téléchargement absent');
  // Le PDF ne doit pas être exclu du déploiement.
  const ignore = read('.vercelignore');
  assert.ok(!/^files\//m.test(ignore), 'le dossier files/ est exclu du déploiement');
});

test('guide : la preuve de consentement conserve l\'hôte d\'origine', () => {
  const p = guide.__internals.preuveConsentement;
  const avec = p({ consentMarketing: true, consentVersion: CONSENT_VERSION }, 'Guide 5 erreurs', 'proactifsconseils.fr');
  assert.deepStrictEqual(avec.origine, { source: 'Guide 5 erreurs', hote: 'proactifsconseils.fr' });
  const sans = p({ consentMarketing: false }, 'Guide 5 erreurs', null);
  assert.deepStrictEqual(sans.origine, { source: 'Guide 5 erreurs', hote: null });
});

/* ════════ 2 ter. Couverture de l'anti-robot — piège à ne pas oublier ════════ */

// Toutes les pages HTML du dépôt (hors artefacts et autres worktrees).
function pagesHtml(dir = ROOT, base = '') {
  const ignores = new Set(['node_modules', '.git', '.worktrees', 'Claude outputs', 'Audits SEO', 'Lead magnets', 'prototypes', 'Indexation auto', 'docs', 'partials', 'tests']);
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ignores.has(e.name)) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(pagesHtml(path.join(dir, e.name), rel));
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

test('anti-robot : TOUTE page postant vers /api/subscribe porte le widget', () => {
  // /api/subscribe exige un jeton Turnstile de tous ses appelants dès que
  // SUBSCRIBE_TURNSTILE_SECRET existe. Ce test découvre les appelants au lieu
  // de les lister : une nouvelle page qui posterait sans le widget échouerait
  // ici, et la création du secret ne pourrait plus casser un formulaire.
  const appelants = pagesHtml().filter((p) => /fetch\('\/api\/subscribe'/.test(read(p)));
  assert.strictEqual(appelants.length, 9, 'inventaire des appelants inattendu : ' + appelants.join(', '));
  for (const p of appelants) {
    const html = read(p);
    assert.ok(/<script src="\/assets\/js\/subscribe-captcha\.js" defer><\/script>/.test(html), `${p} : module anti-robot non inclus`);
    assert.ok(/captchaToken:\s*window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.token\(\) : ''/.test(html), `${p} : jeton non transmis`);
    assert.ok(/hp:\s*window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.hp\(\) : ''/.test(html), `${p} : champ piège non transmis`);
    assert.ok(html.includes('id="pcCaptcha"'), `${p} : cible de rendu absente`);
    assert.ok(html.includes('window.ProactifsCaptcha.reset()'), `${p} : widget non réinitialisé après échec`);
    assert.ok(/window\.ProactifsCaptcha\.(prepare|prepareOnFirstInteraction)\(/.test(html), `${p} : widget jamais préparé`);
  }
});

test('anti-robot : les cinq pages nouvellement équipées ne bloquent pas l\'envoi', () => {
  const nouvelles = [
    ['bilan-patrimonial.html', '.form-wrap'],
    ['simulation-pret-immobilier.html', '.wz-step[data-step="7"]'],
    ['simulateurs/capacite-emprunt.html', '#sim-lead-form'],
    ['simulateurs/mensualite-credit.html', '#sim-lead-form'],
    ['simulateurs/taux-endettement.html', '#sim-lead-form'],
  ];
  for (const [p, selecteur] of nouvelles) {
    const html = read(p);
    // Préparation paresseuse : le widget n'est chargé qu'au premier contact
    // avec le formulaire, pour un jeton frais (300 s) et aucun appel inutile.
    assert.ok(html.includes(`prepareOnFirstInteraction('${selecteur}')`), `${p} : accroche attendue sur ${selecteur}`);
    assert.ok(/addEventListener\('DOMContentLoaded'/.test(html), `${p} : le module est en defer, l'accroche doit attendre DOMContentLoaded`);
    // Jamais bloquant côté navigateur.
    assert.ok(!/if\s*\(\s*!\s*captchaToken\s*\)/.test(html), `${p} : blocage client sur jeton manquant`);
    assert.ok(!/ProactifsCaptcha\.token\(\)\s*===\s*''/.test(html), `${p} : blocage client sur jeton vide`);
  }
});

test('anti-robot : le contrat du module partagé des simulateurs reste intact', () => {
  // assets/js/simulators/lead.js ne doit pas avoir été touché : le jeton est
  // ajouté au transport, pas au constructeur de payload.
  const lead = read('assets/js/simulators/lead.js');
  assert.ok(!lead.includes('captchaToken'), 'lead.js modifié : contrat du payload rompu');
  assert.ok(!lead.includes('ProactifsCaptcha'), 'lead.js modifié');
  for (const p of ['simulateurs/capacite-emprunt.html', 'simulateurs/mensualite-credit.html', 'simulateurs/taux-endettement.html']) {
    assert.ok(/Object\.assign\(\{\}, payload, \{/.test(read(p)), `${p} : le jeton doit être ajouté au transport`);
  }
});

test('anti-robot : conversions et messages préservés sur les pages équipées', () => {
  assert.ok(/trackBilanLead\(service\)/.test(read('bilan-patrimonial.html')), 'suivi GA4 du bilan perdu');
  const fiscal = read('optimisation-fiscale-ile-de-france.html');
  assert.ok(/send_to: 'AW-/.test(fiscal) && /value: 150\.0/.test(fiscal), 'conversion Ads 150 € perdue');
  assert.ok(/Envoyé ✓/.test(read('simulation-pret-immobilier.html')), 'message de succès du simulateur de prêt perdu');
  for (const p of ['simulateurs/capacite-emprunt.html', 'simulateurs/mensualite-credit.html', 'simulateurs/taux-endettement.html']) {
    assert.ok(/leadSuccessMessage/.test(read(p)), `${p} : message de succès perdu`);
  }
});

/* ════════ 2 quater. Garde SQL — type JSON et sémantique des quatre cas ════════
   La garde imposée côté base est :
       NEW.reponses #>> '{consentement,marketing}' = 'true'
   Ces tests vérifient ce que les DEUX endpoints écrivent réellement dans la
   colonne `reponses`, et simulent l'extraction `#>>` (texte, ou NULL si le
   chemin est absent) pour documenter les quatre cas de façon exécutable.
   Aucune base de données n'est touchée. */

// Reproduit `jsonb #>> '{a,b}'` : texte de la valeur, ou null si le chemin manque.
function extraitTexte(obj, chemin) {
  let v = obj;
  for (const cle of chemin) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, cle)) return null;
    v = v[cle];
  }
  if (v === null) return null;          // JSON null → NULL en SQL
  return typeof v === 'string' ? v : JSON.stringify(v);
}
// Reproduit `IF <expr> THEN` en PL/pgSQL : une condition NULL ne prend pas la branche.
const abonne = (reponses) => extraitTexte(reponses, ['consentement', 'marketing']) === 'true';

test('garde SQL : `marketing` est un booléen JSON, pas une chaîne (deux endpoints)', () => {
  const r1 = subscribe.__internals.validate({
    prenom: 'Camille', email: 'c@example.test', service: 'impots',
    consentMarketing: true, consentVersion: CONSENT_VERSION,
  }).data.reponses;
  assert.strictEqual(typeof r1.consentement.marketing, 'boolean', 'api/subscribe.js:268 doit produire un booléen');
  assert.ok(JSON.stringify(r1).includes('"marketing":true'), 'sérialisé en booléen JSON attendu');
  assert.ok(!JSON.stringify(r1).includes('"marketing":"true"'), 'sérialisé en chaîne : la garde comparerait autre chose');

  const r2 = guide.__internals.preuveConsentement({ consentMarketing: true, consentVersion: CONSENT_VERSION }, 'Guide 5 erreurs', null);
  assert.strictEqual(typeof r2.marketing, 'boolean', 'api/subscribe-guide.js:29 doit produire un booléen');
  assert.ok(JSON.stringify({ consentement: r2 }).includes('"marketing":true'));
});

test('garde SQL : les quatre cas — true, false, null, chemin absent', () => {
  // 1. Consentement donné
  const donne = subscribe.__internals.validate({ prenom: 'A', email: 'a@example.test', service: 'impots', consentMarketing: true, consentVersion: CONSENT_VERSION }).data.reponses;
  assert.strictEqual(extraitTexte(donne, ['consentement', 'marketing']), 'true');
  assert.strictEqual(abonne(donne), true, 'un consentant doit être abonné');

  // 2. Consentement refusé
  const refuse = subscribe.__internals.validate({ prenom: 'A', email: 'a@example.test', service: 'impots', consentMarketing: false, consentVersion: CONSENT_VERSION }).data.reponses;
  assert.strictEqual(extraitTexte(refuse, ['consentement', 'marketing']), 'false');
  assert.strictEqual(abonne(refuse), false);

  // 3. Consentement non recueilli : la clé existe et vaut false (jamais null)
  const nonRecueilli = subscribe.__internals.validate({ prenom: 'A', email: 'a@example.test', service: 'impots' }).data.reponses;
  assert.strictEqual(nonRecueilli.consentement.recueilli, false);
  assert.strictEqual(extraitTexte(nonRecueilli, ['consentement', 'marketing']), 'false');
  assert.strictEqual(abonne(nonRecueilli), false);

  // 4. Valeur JSON null, et chemin entièrement absent : extraction NULL, donc
  //    condition NULL, donc la branche n'est pas prise (pas besoin de COALESCE).
  assert.strictEqual(extraitTexte({ consentement: { marketing: null } }, ['consentement', 'marketing']), null);
  assert.strictEqual(abonne({ consentement: { marketing: null } }), false);
  assert.strictEqual(extraitTexte({ consentement: {} }, ['consentement', 'marketing']), null);
  assert.strictEqual(abonne({ consentement: {} }), false);
  assert.strictEqual(extraitTexte({}, ['consentement', 'marketing']), null);
  assert.strictEqual(abonne({}), false, 'lead historique ou import manuel : jamais abonné');
});

test('garde SQL : aucune valeur approchante ne vaut accord', () => {
  // Le serveur n'écrit jamais autre chose que true/false ; on vérifie malgré
  // tout que la garde ne se laisserait pas tromper par une valeur exotique.
  for (const v of ['true ', 'TRUE', 'oui', 1, 'on', [], {}]) {
    assert.strictEqual(abonne({ consentement: { marketing: v } }), false, 'valeur acceptée à tort : ' + JSON.stringify(v));
  }
});

test('garde SQL : les leads d\'estimation n\'ont pas d\'objet consentement', () => {
  // api/estimation.js construit `reponses` sans consentement : avec la garde,
  // ces leads ne seront pas abonnés. Effet voulu, épinglé ici.
  const src = read('api/estimation.js');
  assert.ok(!src.includes('consentement'), 'si le consentement arrive dans estimation.js, mettre ce test à jour');
});

/* ════════ 2 quinquies. Anti-robot du parcours guide ════════
   Règle intangible vérifiée ici : le lead est TOUJOURS enregistré et le guide
   toujours remis — sans consentement, sans jeton, avec un jeton refusé, et
   quand l'anti-robot n'est pas configuré. Seule l'inscription marketing est
   conditionnée. */

test('guide : page équipée du widget partagé sur ses deux formulaires', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  assert.ok(/<script src="\/assets\/js\/subscribe-captcha\.js" defer><\/script>/.test(html), 'module non inclus');
  assert.ok(html.includes('id="pcCaptcha"'), 'cible de rendu absente');
  assert.ok(html.includes("prepareOnFirstInteraction('.hero-form')"), 'formulaire du haut non accroché');
  assert.ok(html.includes("prepareOnFirstInteraction('.final-form')"), 'formulaire du bas non accroché');
  assert.ok(/addEventListener\('DOMContentLoaded'/.test(html), 'accroche avant que le module en defer soit prêt');
  assert.ok(/captchaToken: window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.token\(\) : ''/.test(html), 'jeton non transmis');
  assert.ok(/hp: window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.hp\(\) : ''/.test(html), 'champ piège non transmis');
  assert.ok(html.includes('window.ProactifsCaptcha.reset()'), 'widget non réinitialisé après échec');
  assert.ok(!/if\s*\(\s*!\s*captchaToken\s*\)/.test(html), 'blocage client sur jeton manquant');
  // Un seul widget pour deux formulaires : un seul conteneur attendu.
  assert.strictEqual((html.match(/id="pcCaptchaWrap"/g) || []).length, 1, 'plusieurs conteneurs : le module n\'en rend qu\'un');
});

/* Matrice complète captcha x consentement.
   Décision du 2026-11-10 : la vérification anti-robot précède TOUTE écriture.
   Un jeton absent (400) ou refusé (403) fait refuser la demande — le visiteur
   n'obtient pas le guide tant qu'il n'a pas réessayé avec succès. En revanche,
   dès que le captcha est passé, le lead est enregistré quel que soit l'état du
   consentement marketing. */

const CAPTCHA_ACTIF = { VERCEL_ENV: 'production', SUBSCRIBE_TURNSTILE_SECRET: 'valeur-factice' };
const corpsGuide = (extra) => Object.assign({ prenom: 'Camille', email: 'c@example.test' }, extra);

const CAS_CONSENTEMENT = [
  ['donné', { consentMarketing: true, consentVersion: CONSENT_VERSION }, 1],
  ['refusé', { consentMarketing: false, consentVersion: CONSENT_VERSION }, 0],
  ['absent', {}, 0],
];

for (const [nom, champs, marketingAttendu] of CAS_CONSENTEMENT) {
  // Captcha INACTIF : état de la production aujourd'hui, comportement inchangé.
  test(`guide : captcha INACTIF x consentement ${nom} — 200, lead enregistré, marketing=${marketingAttendu}`, async () => {
    await withEnv(GUIDE_ENV, async () => {
      const f = stubFetch(responder); // lève si Cloudflare est appelé
      try {
        const res = mockRes();
        await guide({ method: 'POST', headers: {}, body: corpsGuide(champs) }, res);
        assert.strictEqual(res.statusCode, 200, 'comportement inchangé sans secret');
        assert.strictEqual(leadsInserts(f.calls).length, 1, 'lead non enregistré');
        assert.strictEqual(captchaCalls(f.calls).length, 0, 'appel Cloudflare sans secret');
        assert.strictEqual(systemeCalls(f.calls).length, marketingAttendu);
      } finally { f.restore(); }
    });
  });

  test(`guide : captcha VALIDE x consentement ${nom} — 200, lead enregistré, marketing=${marketingAttendu}`, async () => {
    await withEnv(Object.assign({}, GUIDE_ENV, CAPTCHA_ACTIF), async () => {
      const f = stubFetch(responderCaptcha({ success: true, action: 'subscribe_form' }));
      try {
        const res = mockRes();
        await guide({ method: 'POST', headers: {}, body: corpsGuide(Object.assign({}, champs, { captchaToken: 'jeton-factice' })) }, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(captchaCalls(f.calls).length, 1, 'jeton non vérifié');
        assert.strictEqual(leadsInserts(f.calls).length, 1, 'lead non enregistré');
        assert.strictEqual(systemeCalls(f.calls).length, marketingAttendu);
      } finally { f.restore(); }
    });
  });
}

test('guide : captcha actif, jeton ABSENT — 400, AUCUNE insertion, aucun marketing', async () => {
  await withEnv(Object.assign({}, GUIDE_ENV, CAPTCHA_ACTIF), async () => {
    const f = stubFetch(responderCaptcha({ success: true }));
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: corpsGuide({ consentMarketing: true, consentVersion: CONSENT_VERSION }) }, res);
      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: 'Vérification anti-robot manquante.' });
      assert.strictEqual(leadsInserts(f.calls).length, 0, 'écriture malgré un jeton absent');
      assert.strictEqual(systemeCalls(f.calls).length, 0);
      assert.strictEqual(f.calls.length, 0, 'aucun appel réseau sur refus');
    } finally { f.restore(); }
  });
});

for (const [nom, codes] of [['INVALIDE', ['invalid-input-response']], ['EXPIRÉ', ['timeout-or-duplicate']]]) {
  test(`guide : captcha actif, jeton ${nom} — 403, AUCUNE insertion`, async () => {
    await withEnv(Object.assign({}, GUIDE_ENV, CAPTCHA_ACTIF), async () => {
      const f = stubFetch(responderCaptcha({ success: false, 'error-codes': codes }));
      try {
        const res = mockRes();
        await guide({ method: 'POST', headers: {}, body: corpsGuide({ consentMarketing: true, consentVersion: CONSENT_VERSION, captchaToken: 'jeton-factice' }) }, res);
        assert.strictEqual(res.statusCode, 403);
        assert.deepStrictEqual(res.body, { error: 'Vérification anti-robot échouée.' });
        assert.strictEqual(captchaCalls(f.calls).length, 1);
        assert.strictEqual(leadsInserts(f.calls).length, 0, 'écriture malgré un jeton refusé');
        assert.strictEqual(systemeCalls(f.calls).length, 0);
      } finally { f.restore(); }
    });
  });
}

test('guide : Cloudflare injoignable — 403, AUCUNE insertion', async () => {
  await withEnv(Object.assign({}, GUIDE_ENV, CAPTCHA_ACTIF), async () => {
    const f = stubFetch((url) => {
      if (url.includes('challenges.cloudflare.com')) throw new Error('réseau');
      return responder(url);
    });
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: corpsGuide({ consentMarketing: true, consentVersion: CONSENT_VERSION, captchaToken: 'jeton-factice' }) }, res);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(leadsInserts(f.calls).length, 0);
    } finally { f.restore(); }
  });
});

test('guide : Supabase en échec après captcha valide — 500, aucun marketing', async () => {
  await withEnv(Object.assign({}, GUIDE_ENV, CAPTCHA_ACTIF), async () => {
    const f = stubFetch((url) => {
      if (url.includes('challenges.cloudflare.com')) return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/rest/v1/leads')) return new Response('erreur', { status: 400 });
      return responder(url);
    });
    try {
      const res = mockRes();
      await guide({ method: 'POST', headers: {}, body: corpsGuide({ consentMarketing: true, consentVersion: CONSENT_VERSION, captchaToken: 'jeton-factice' }) }, res);
      assert.strictEqual(res.statusCode, 500);
      assert.notStrictEqual(res.body && res.body.success, true);
      assert.strictEqual(systemeCalls(f.calls).length, 0, 'marketing déclenché malgré un enregistrement en échec');
    } finally { f.restore(); }
  });
});

test("guide : la vérification anti-robot précède l'insertion dans leads", () => {
  const src = read('api/subscribe-guide.js');
  const posCaptcha = src.indexOf('const captcha = turnstileState(');
  const posInsert = src.indexOf('/rest/v1/leads');
  const posSysteme = src.indexOf('SYSTEME_API,');
  assert.ok(posCaptcha > 0 && posInsert > 0 && posSysteme > 0);
  assert.ok(posCaptcha < posInsert, "le captcha doit être contrôlé avant l'insertion");
  assert.ok(posCaptcha < posSysteme, 'le captcha doit être contrôlé avant tout appel marketing');
  assert.ok(src.includes("status(400).json({ error: 'Vérification anti-robot manquante.' })"), 'code 400 non aligné sur /api/subscribe');
  assert.ok(src.includes("status(403).json({ error: 'Vérification anti-robot échouée.' })"), 'code 403 non aligné sur /api/subscribe');
});

test('guide : message de reprise sans perte de saisie', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  assert.ok(/if \(!res\.ok\)/.test(html), "la réponse du serveur n'est pas examinée");
  assert.ok(/res\.status === 403/.test(html), "le cas du jeton expiré n'est pas distingué");
  assert.ok(/La vérification de sécurité a expiré/.test(html), "message d'expiration absent");
  assert.ok(/Vos informations sont conservées/.test(html), "le visiteur doit savoir qu'il ne perd rien");
  assert.ok(/cliquez à nouveau sur le bouton/.test(html), 'le visiteur doit savoir quoi faire');
  assert.ok(/btn\.disabled = false; btn\.innerHTML = btnHtml;/.test(html), 'bouton non rétabli (libellé et icône)');
  assert.ok(/window\.ProactifsCaptcha\.reset\(\)/.test(html), 'widget non réinitialisé');
  assert.ok(!/form\.reset\(\)/.test(html), 'le formulaire est réinitialisé : saisie perdue');
  assert.ok(!/location\.reload\(\)/.test(html), 'rechargement de page : saisie perdue');
  const posRefus = html.indexOf('permettreReprise(res.status === 403');
  const posRedirection = html.indexOf("window.location.href = '/merci-guide'");
  assert.ok(posRefus > 0 && posRedirection > posRefus, 'la redirection doit suivre le contrôle de la réponse');
});

test('guide : un seul secret pour les deux endpoints, une seule action', () => {
  // Choix de conception : /api/subscribe-guide réutilise SUBSCRIBE_TURNSTILE_SECRET.
  // Aucune variable propre, donc aucune étape de plus dans la séquence d'activation.
  const g = guide.__internals.turnstileState({ VERCEL_ENV: 'production' });
  const s = subscribe.__internals.turnstileState({ VERCEL_ENV: 'production' });
  assert.strictEqual(g.source, s.source, 'les deux endpoints doivent lire la même variable');
  assert.strictEqual(g.source, 'SUBSCRIBE_TURNSTILE_SECRET');
  assert.strictEqual(g.active, false, 'inerte sans configuration');
  const src = read('api/subscribe-guide.js');
  assert.ok(!/SUBSCRIBE_GUIDE_TURNSTILE|GUIDE_TURNSTILE_SECRET/.test(src), 'variable propre introduite');
  assert.ok(src.includes("require('./subscribe.js').__internals"), 'vérification dupliquée au lieu d\'être partagée');
});

/* ════════ 3. Parcours NON corrigés — comportement épinglé ════════ */

test('api/estimation.js : insère dans leads, n\'appelle ni Systeme.io ni Brevo', () => {
  const src = read('api/estimation.js');
  assert.ok(src.includes('/rest/v1/leads'), 'insertion dans leads attendue (donc soumise au trigger)');
  assert.ok(!src.includes('api.systeme.io'), 'un appel Systeme.io est apparu : consentement à traiter');
  assert.ok(!src.includes('api.brevo.com'), 'un appel Brevo est apparu : consentement à traiter');
  assert.ok(!src.includes('consentMarketing'), 'si le consentement arrive ici, mettre ce test à jour');
});

test('immobilier.html : formulaire d\'estimation sans case de consentement (état connu)', () => {
  const html = read('immobilier.html');
  assert.ok(html.includes('/api/estimation'), 'appel /api/estimation attendu');
  assert.ok(!html.includes('name="consentMarketing"'), 'une case est apparue : ajouter les deux branches de test');
});

test('api/webhook-systemeio.js : route vers BREVO_LIST_ID sans vérifier de consentement (état connu)', () => {
  const src = read('api/webhook-systemeio.js');
  assert.ok(src.includes('BREVO_LIST_ID'), 'liste Brevo attendue');
  assert.ok(src.includes('listIds'));
  assert.ok(!src.includes('consentMarketing'), 'un filtre de consentement est apparu : mettre ce test à jour');
  assert.ok(!src.includes('/rest/v1/leads'), 'ce webhook ne doit pas écrire dans leads');
});

test('api/subscribe-blog.js : liste 25, hors trigger, hors périmètre (état connu)', () => {
  const src = read('api/subscribe-blog.js');
  assert.ok(src.includes('listIds: [25]'), 'liste 25 attendue');
  assert.ok(!src.includes('/rest/v1/leads'), 'aucune insertion dans leads, donc hors trigger');
  assert.ok(!src.includes('consentMarketing'), 'opt-in contextuel, sans case ni preuve horodatée');
});

test('aucune page du site n\'écrit plus directement dans Supabase', () => {
  const pages = PAGES_AVEC_CASE.concat(['immobilier.html']);
  for (const p of pages) {
    const html = read(p);
    assert.ok(!html.includes('/rest/v1/'), `${p} : appel PostgREST direct`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(html), `${p} : jeton JWT présent`);
  }
});
