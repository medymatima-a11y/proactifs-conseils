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
const vm = require('vm');

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

test('guide : un widget anti-robot PAR formulaire, dans le bon formulaire', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  assert.ok(/<script src="\/assets\/js\/subscribe-captcha\.js" defer><\/script>/.test(html), 'module non inclus');
  assert.ok(/addEventListener\('DOMContentLoaded'/.test(html), 'accroche avant que le module en defer soit prêt');

  // Découpe les deux formulaires pour vérifier le CONTENANT, pas seulement la présence.
  const iHaut = html.indexOf('<form class="hero-form"');
  const iBas = html.indexOf('<form class="final-form"');
  assert.ok(iHaut > 0 && iBas > iHaut, 'les deux formulaires doivent exister, dans cet ordre');
  const blocHaut = html.slice(iHaut, html.indexOf('</form>', iHaut));
  const blocBas = html.slice(iBas, html.indexOf('</form>', iBas));

  // Chaque formulaire porte SON conteneur, accessible et annoncé.
  assert.ok(blocHaut.includes('id="pcCaptchaHaut"'), 'conteneur du formulaire du haut absent de ce formulaire');
  assert.ok(blocHaut.includes('id="pcCaptchaWrapHaut"'), 'enveloppe du haut absente');
  assert.ok(/id="pcCaptchaErrHaut"[^>]*aria-live="polite"/.test(blocHaut), 'zone de message du haut absente ou non annoncée');
  assert.ok(blocBas.includes('id="pcCaptchaBas"'), 'conteneur du formulaire du bas absent de ce formulaire');
  assert.ok(blocBas.includes('id="pcCaptchaWrapBas"'), 'enveloppe du bas absente');
  assert.ok(/id="pcCaptchaErrBas"[^>]*aria-live="polite"/.test(blocBas), 'zone de message du bas absente ou non annoncée');

  // Aucun croisement : le conteneur de l'un ne doit pas se trouver chez l'autre.
  assert.ok(!blocHaut.includes('pcCaptchaBas'), 'le conteneur du bas se trouve dans le formulaire du haut');
  assert.ok(!blocBas.includes('pcCaptchaHaut'), 'le conteneur du haut se trouve dans le formulaire du bas');

  // Régression interdite : retour à un conteneur unique partagé.
  assert.ok(!/id="pcCaptchaWrap"/.test(html), 'conteneur partagé réintroduit : le défi s\'afficherait hors du formulaire utilisé');
  assert.ok(!/id="pcCaptcha"/.test(html), 'cible de rendu partagée réintroduite');

  // Chaque formulaire est préparé avec SA cible.
  assert.ok(/'\.hero-form':\s*\{ holder: '#pcCaptchaHaut'/.test(html), 'cible du haut non déclarée');
  assert.ok(/'\.final-form':\s*\{ holder: '#pcCaptchaBas'/.test(html), 'cible du bas non déclarée');
  assert.ok(/prepareOnFirstInteraction\(selecteur, PC_CIBLES\[selecteur\]\)/.test(html), 'préparation sans cible : le module retomberait sur le conteneur par défaut');

  // Jeton et réinitialisation portent sur le widget du formulaire soumis.
  assert.ok(/const cibleCaptcha = form\.classList\.contains\('final-form'\) \? '#pcCaptchaBas' : '#pcCaptchaHaut'/.test(html), 'cible non déduite du formulaire soumis');
  assert.ok(/token\(cibleCaptcha\)/.test(html), 'jeton lu sans cible');
  assert.ok(/reset\(cibleCaptcha\)/.test(html), 'réinitialisation sans cible');
  assert.ok(/hp: window\.ProactifsCaptcha \? window\.ProactifsCaptcha\.hp\(\) : ''/.test(html), 'champ piège non transmis');
  assert.ok(!/if\s*\(\s*!\s*captchaToken\s*\)/.test(html), 'blocage client sur jeton manquant');
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
  assert.ok(/window\.ProactifsCaptcha\.reset\(cibleCaptcha\)/.test(html), 'widget non réinitialisé (cible du formulaire soumis)');
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

/* ════════ 2 septies. Conversions Google Ads des parcours longtemps muets ════════
   Trois parcours enregistraient un lead sans émettre aucun événement : ils étaient
   invisibles dans GA4 et dans Ads. Ces tests épinglent l'émission, son libellé, et
   surtout sa POSITION : après le contrôle de la réponse serveur, et pour le guide
   avant la redirection qui décharge la page. */

const CONVERSION = "gtag('event', 'ads_conversion_Formulaire_1'";

test('conversion : declaration RSU/ESPP — émise après le contrôle de la réponse', () => {
  const html = read('declaration-rsu-espp-france.html');
  assert.ok(html.includes(CONVERSION), 'événement de conversion absent');
  assert.ok(/event_label: 'declaration-rsu-espp'/.test(html), 'libellé de parcours attendu');
  // Ni valeur ni devise : la grille commerciale n'est pas arrêtée.
  const bloc = html.slice(html.indexOf(CONVERSION), html.indexOf(CONVERSION) + 260);
  assert.ok(!/value:/.test(bloc), 'aucune valeur monétaire ne doit être inventée');
  assert.ok(!/currency:/.test(bloc), 'aucune devise ne doit être inventée');
  // Position : après la sortie en échec, avant l'écran de remerciement.
  const posEchec = html.indexOf("btn.textContent = 'Réessayer →';");
  const posConv = html.indexOf(CONVERSION);
  const posMerci = html.indexOf("document.getElementById('wizThanks').style.display = 'block'");
  assert.ok(posEchec > 0 && posConv > posEchec, 'la conversion doit suivre le contrôle de la réponse');
  assert.ok(posMerci > posConv, 'la conversion doit précéder l\'écran de remerciement');
  // Anti-doublon : le wizard peut être réouvert et renvoyé.
  assert.ok(/let actioConvSent = false;/.test(html), 'drapeau anti-doublon absent');
  assert.ok(/actioConvSent = false;/.test(html.slice(html.indexOf('function openActioWizard'), html.indexOf('function openActioWizard') + 200)), 'drapeau non remis à zéro à la réouverture');
  assert.ok(/if \(!actioConvSent\) \{/.test(html), 'émission non protégée par le drapeau');
});

test('conversion : succession immobilière — émise dans la branche de succès', () => {
  const html = read('immobilier/succession-colombes.html');
  assert.ok(html.includes(CONVERSION), 'événement de conversion absent');
  assert.ok(/event_label: 'succession-immobiliere'/.test(html), 'libellé de parcours attendu');
  const bloc = html.slice(html.indexOf(CONVERSION), html.indexOf(CONVERSION) + 260);
  assert.ok(!/value:/.test(bloc) && !/currency:/.test(bloc), 'ni valeur ni devise inventées');
  // Position : à l'intérieur de `if (res.ok)`, avant la bascule d'affichage.
  const posOk = html.indexOf('if (res.ok) {');
  const posConv = html.indexOf(CONVERSION);
  const posSucces = html.indexOf("document.getElementById('successionSuccess').hidden = false");
  assert.ok(posOk > 0 && posConv > posOk, 'la conversion doit être dans la branche de succès');
  assert.ok(posSucces > posConv, 'la conversion doit précéder l\'écran de succès');
  // Aucune émission sur le chemin d'échec.
  const posThrow = html.indexOf("throw new Error('Supabase '");
  assert.ok(posThrow > posConv, 'la conversion ne doit pas suivre la branche d\'échec');
  // Anti-doublon : le bouton « Nouvelle demande » réaffiche le formulaire.
  assert.ok(/let successionConvSent = false;/.test(html), 'drapeau anti-doublon absent');
  assert.ok(/if \(!successionConvSent\) \{/.test(html), 'émission non protégée par le drapeau');
  assert.ok(/successionConvSent = false; \/\/ nouvelle demande/.test(html), 'drapeau non remis à zéro sur nouvelle demande');
});

test('conversion guide : succès serveur → marqueur posé, aucune émission sur la page du formulaire', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  // Plus aucune émission ici : la page se décharge, l'événement serait coupé.
  assert.ok(!html.includes("gtag('event', 'ads_conversion_Formulaire_1'"), 'émission résiduelle sur la page du formulaire');
  assert.ok(/sessionStorage\.setItem\('pc_conv_guide', '1'\)/.test(html), 'marqueur non déposé');
  // Position : après le contrôle de la réponse ET après le catch réseau, avant la redirection.
  const posRefus = html.indexOf('permettreReprise(res.status === 403');
  const posCatch = html.indexOf("console.warn('subscribe-guide error:'");
  const posMarqueur = html.indexOf("sessionStorage.setItem('pc_conv_guide'");
  const posRedir = html.indexOf("window.location.href = '/merci-guide'");
  assert.ok(posRefus > 0 && posMarqueur > posRefus, 'le marqueur doit suivre le contrôle de la réponse');
  assert.ok(posCatch > 0 && posMarqueur > posCatch, 'le marqueur doit être hors du catch réseau');
  assert.ok(posRedir > posMarqueur, 'le marqueur doit précéder la redirection');
});

test('conversion guide : erreur serveur → aucun marqueur, donc aucune conversion', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  // Les deux chemins d'échec sortent par `return` AVANT la pose du marqueur.
  const posMarqueur = html.indexOf("sessionStorage.setItem('pc_conv_guide'");
  const blocEchec = html.slice(html.indexOf('if (!res.ok) {'), posMarqueur);
  assert.ok(/return;/.test(blocEchec), 'le chemin d\'échec doit sortir avant la pose du marqueur');
  const blocCatch = html.slice(html.indexOf("console.warn('subscribe-guide error:'"), posMarqueur);
  assert.ok(/return;/.test(blocCatch), 'le chemin réseau doit sortir avant la pose du marqueur');
  // Un seul point de dépôt dans toute la page.
  assert.strictEqual((html.match(/sessionStorage\.setItem\('pc_conv_guide'/g) || []).length, 1, 'plusieurs points de dépôt');
});

test('conversion guide : redirection hors du try — un stockage bloqué ne prive jamais du guide', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  const posTry = html.lastIndexOf('try {', html.indexOf("sessionStorage.setItem('pc_conv_guide'"));
  const posCatchMarqueur = html.indexOf('} catch (e) { /* mesure perdue');
  const posRedir = html.indexOf("window.location.href = '/merci-guide'");
  assert.ok(posTry > 0 && posCatchMarqueur > posTry, 'la pose du marqueur doit être protégée par un try/catch');
  assert.ok(posRedir > posCatchMarqueur, 'la redirection doit être APRÈS le catch, donc insensible à un échec de stockage');
  // Le catch ne doit ni relancer, ni interrompre le parcours.
  const corpsCatch = html.slice(posCatchMarqueur, posCatchMarqueur + 120);
  assert.ok(!/throw|return/.test(corpsCatch), 'le catch ne doit ni relancer ni interrompre la remise du guide');
});

/* Le script de /merci-guide est exécuté dans un bac à sable : on vérifie le
   comportement, pas seulement l'ordre des lignes. Aucun réseau, aucun DOM réel. */
function executerMerciGuide(stockage) {
  const html = read('merci-guide.html');
  const i = html.indexOf("(function () {\n    var marqueur = null;");
  assert.ok(i > 0, 'script de conversion introuvable dans merci-guide.html');
  const fin = html.indexOf('</script>', i);
  const code = html.slice(i, fin);
  const evenements = [];
  const sandbox = {
    sessionStorage: stockage,
    gtag: function () { evenements.push(Array.prototype.slice.call(arguments)); },
    console: { warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'merci-guide.html' });
  return evenements;
}
function stockageMemoire(valeurInitiale) {
  const data = valeurInitiale === undefined ? {} : { pc_conv_guide: valeurInitiale };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    removeItem: (k) => { delete data[k]; },
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('conversion guide : marqueur présent → une seule conversion, puis marqueur consommé', () => {
  const st = stockageMemoire('1');
  const ev = executerMerciGuide(st);
  assert.strictEqual(ev.length, 1, 'une et une seule conversion attendue');
  assert.strictEqual(ev[0][0], 'event');
  assert.strictEqual(ev[0][1], 'ads_conversion_Formulaire_1');
  assert.strictEqual(ev[0][2].event_label, 'guide-5-erreurs');
  assert.ok(!('value' in ev[0][2]) && !('currency' in ev[0][2]), 'ni valeur ni devise ne doivent être inventées');
  assert.strictEqual(st.getItem('pc_conv_guide'), null, 'marqueur non consommé');
});

test('conversion guide : actualisation de /merci-guide → aucune seconde conversion', () => {
  const st = stockageMemoire('1');
  assert.strictEqual(executerMerciGuide(st).length, 1, 'première visite : une conversion');
  assert.strictEqual(executerMerciGuide(st).length, 0, 'actualisation : aucune conversion');
  // C'est l'ordre lecture-puis-suppression qui le garantit.
  const html = read('merci-guide.html');
  const posLire = html.indexOf("sessionStorage.getItem('pc_conv_guide')");
  const posSupprimer = html.indexOf("sessionStorage.removeItem('pc_conv_guide')");
  const posEmission = html.indexOf("gtag('event', 'ads_conversion_Formulaire_1'");
  assert.ok(posLire > 0 && posSupprimer > posLire, 'la suppression doit suivre la lecture');
  assert.ok(posEmission > posSupprimer, 'la suppression doit précéder toute émission');
});

test('conversion guide : visite directe de /merci-guide sans marqueur → aucune conversion', () => {
  assert.strictEqual(executerMerciGuide(stockageMemoire()).length, 0, 'conversion émise sans marqueur');
});

test('conversion guide : stockage indisponible → aucune conversion, page intacte', () => {
  const stockageQuiLeve = {
    getItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
  let ev;
  assert.doesNotThrow(() => { ev = executerMerciGuide(stockageQuiLeve); }, 'la page de remerciement ne doit jamais casser');
  assert.strictEqual(ev.length, 0, 'aucune conversion sans marqueur lisible');
  // Et la page conserve son bouton de téléchargement.
  assert.ok(/href="\/files\/guide-5-erreurs-patrimoniaux\.pdf" download/.test(read('merci-guide.html')), 'bouton de téléchargement perdu');
});

test('conversion guide : /merci-guide n\'ajoute aucune destination ni configuration', () => {
  const html = read('merci-guide.html');
  assert.strictEqual((html.match(/gtag\('config', 'G-P53RQGXJZX'\)/g) || []).length, 1, 'configuration GA4 altérée');
  assert.strictEqual((html.match(/gtag\('config', 'AW-835423035'\)/g) || []).length, 1, 'configuration Ads altérée');
  assert.ok(html.includes('/assets/js/cookie-consent.js'), 'module de consentement retiré');
  assert.strictEqual((html.match(/ads_conversion_Formulaire_1/g) || []).length, 1, 'plusieurs émissions sur la page de remerciement');
});

/* ── Garde de consentement à l'écriture du marqueur ──
   Le marqueur n'est déposé que si le consentement analytique est déjà accordé
   au moment de la soumission. On exécute le code RÉEL de la page (lecture du
   cookie + écriture conditionnelle) dans un bac à sable, plutôt que de le
   reformuler dans le test. Aucun réseau, aucun DOM réel. */
function executerGardeGuide(options) {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  const iFn = html.indexOf('function hasAnalyticsConsent() {');
  assert.ok(iFn > 0, 'lecture du consentement introuvable dans la page');
  const finFn = html.indexOf('\n  }', iFn) + '\n  }'.length;
  const source = html.slice(iFn, finFn);
  const iEcriture = html.indexOf("if (hasAnalyticsConsent()) sessionStorage.setItem('pc_conv_guide', '1');");
  assert.ok(iEcriture > 0, 'écriture conditionnelle du marqueur introuvable');
  const ecriture = html.slice(html.lastIndexOf('try {', iEcriture), html.indexOf('\n', html.indexOf('} catch (e) { /* mesure perdue', iEcriture)));

  const magasin = {};
  const document = {};
  if (options.cookieLeve) {
    Object.defineProperty(document, 'cookie', { get() { throw new Error('SecurityError'); } });
  } else {
    document.cookie = options.cookie || '';
  }
  const sessionStorage = options.stockageLeve
    ? { setItem() { throw new Error('SecurityError'); } }
    : { setItem: (k, v) => { magasin[k] = String(v); } };

  const sandbox = { document, sessionStorage, JSON, console: { warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source + '\n' + ecriture, sandbox, { filename: 'guide-garde.js' });
  return magasin;
}
const cookieConsent = (a, m) => 'pc_consent=' + encodeURIComponent(JSON.stringify({ a: a, m: m, t: Date.now() }));

test('garde guide : consentement analytique accordé → marqueur écrit', () => {
  const magasin = executerGardeGuide({ cookie: cookieConsent(true, true) });
  assert.strictEqual(magasin.pc_conv_guide, '1', 'marqueur non écrit malgré le consentement');
  // Analytique seul suffit.
  assert.strictEqual(executerGardeGuide({ cookie: cookieConsent(true, false) }).pc_conv_guide, '1');
});

test('garde guide : consentement refusé → aucun marqueur', () => {
  assert.strictEqual(executerGardeGuide({ cookie: cookieConsent(false, false) }).pc_conv_guide, undefined, 'marqueur écrit malgré le refus');
  // Marketing accepté mais analytique refusé : choix retenu — pas de marqueur.
  assert.strictEqual(executerGardeGuide({ cookie: cookieConsent(false, true) }).pc_conv_guide, undefined,
    'la garde porte sur le consentement ANALYTIQUE seul, marketing accepté ne suffit pas');
});

test('garde guide : aucun choix encore exprimé → aucun marqueur', () => {
  // Cookie absent : le visiteur n'a ni accepté ni refusé. Comportement retenu :
  // on n'écrit pas — cohérent avec le site, où rien n'est chargé avant un choix.
  assert.strictEqual(executerGardeGuide({ cookie: '' }).pc_conv_guide, undefined, 'marqueur écrit sans choix exprimé');
  // Cookie illisible : traité comme une absence de choix.
  assert.strictEqual(executerGardeGuide({ cookie: 'pc_consent=%7Bcorrompu' }).pc_conv_guide, undefined, 'JSON corrompu traité comme un accord');
});

test('garde guide : lecture du consentement qui lève → aucun marqueur, aucune exception', () => {
  let magasin;
  assert.doesNotThrow(() => { magasin = executerGardeGuide({ cookieLeve: true }); }, 'une lecture de cookie en erreur ne doit jamais remonter');
  assert.strictEqual(magasin.pc_conv_guide, undefined, 'marqueur écrit malgré une lecture impossible');
});

test('garde guide : stockage qui lève → aucune exception, parcours intact', () => {
  let magasin;
  assert.doesNotThrow(() => { magasin = executerGardeGuide({ cookie: cookieConsent(true, true), stockageLeve: true }); });
  assert.strictEqual(magasin.pc_conv_guide, undefined);
});

test('garde guide : position — après le succès serveur, avant l\'écriture, et la redirection reste hors du try', () => {
  const html = read('guide-5-erreurs-patrimoniaux.html');
  const posRefus = html.indexOf('permettreReprise(res.status === 403');
  const posCatchReseau = html.indexOf("console.warn('subscribe-guide error:'");
  const posGarde = html.indexOf('if (hasAnalyticsConsent()) sessionStorage.setItem');
  const posCatchMarqueur = html.indexOf('} catch (e) { /* mesure perdue');
  const posRedir = html.indexOf("window.location.href = '/merci-guide'");
  assert.ok(posGarde > posRefus && posGarde > posCatchReseau, 'la garde doit suivre le succès serveur');
  assert.ok(posCatchMarqueur > posGarde, 'la garde doit être protégée par le try/catch');
  assert.ok(posRedir > posCatchMarqueur, 'la redirection doit rester hors du try, donc toujours atteinte');
  // Une seule écriture, et elle est conditionnée.
  assert.strictEqual((html.match(/sessionStorage\.setItem\('pc_conv_guide'/g) || []).length, 1);
  assert.ok(!/^\s*sessionStorage\.setItem\('pc_conv_guide'/m.test(html), 'écriture inconditionnelle résiduelle');
});

test('garde guide : refus puis acceptation sur /merci-guide ne transmet rien', () => {
  // À la soumission, refus : aucun marqueur n'est écrit.
  const magasin = executerGardeGuide({ cookie: cookieConsent(false, false) });
  assert.strictEqual(magasin.pc_conv_guide, undefined);
  // À l'arrivée, même si le visiteur accepte ensuite, il n'y a rien à consommer.
  assert.strictEqual(executerMerciGuide(stockageMemoire()).length, 0, 'conversion émise sans marqueur');
  // Et /merci-guide ne porte aucune garde : c'est bien à l'écriture que tout se joue.
  assert.ok(!read('merci-guide.html').includes('hasAnalyticsConsent'), 'garde ajoutée à tort sur la page de remerciement');
});

test('garde guide : mécanisme repris du site, pas réinventé', () => {
  const guide = read('guide-5-erreurs-patrimoniaux.html');
  const bilan = read('bilan-patrimonial.html');
  // Même cookie, même clé, même test que le précédent du site.
  for (const motif of ["pc_consent=([^;]+)", 'v.a === true']) {
    assert.ok(guide.includes(motif), 'lecture du consentement divergente : ' + motif);
    assert.ok(bilan.includes(motif), 'le précédent du site a changé, revoir la garde du guide');
  }
  // La garde du bilan n'a pas été modifiée par ce lot.
  assert.ok(/function hasAnalyticsConsent\(\) \{/.test(bilan), 'garde du bilan altérée');
});

test('conversion : nom d\'événement unique sur tous les parcours émetteurs', () => {
  // Un seul événement clé est actif dans GA4 : tous les parcours doivent le
  // réutiliser, sinon le nouveau nom ne compterait pas comme conversion.
  const emetteurs = [
    'index.html',
    'fiscalite-rsu-stock-options.html',
    'declaration-rsu-espp-france.html',
    'immobilier/succession-colombes.html',
    // Le parcours guide émet depuis sa page d'arrivée, pas depuis le formulaire.
    'merci-guide.html',
  ];
  for (const p of emetteurs) {
    assert.ok(read(p).includes(CONVERSION), `${p} : nom d'événement divergent ou absent`);
  }
  assert.ok(!read('guide-5-erreurs-patrimoniaux.html').includes(CONVERSION), 'la page du formulaire ne doit plus émettre');
  // Les 150 € existants ne sont pas touchés.
  assert.ok(/value: 150,/.test(read('index.html')), 'valeur de la home modifiée');
  assert.ok(/value: 150,/.test(read('fiscalite-rsu-stock-options.html')), 'valeur du pilier RSU modifiée');
  // Et aucune destination Ads n'a été ajoutée sur la page succession.
  assert.ok(!read('immobilier/succession-colombes.html').includes("config', 'AW-"), 'destination Ads ajoutée à tort');
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
