'use strict';
/* Clé d'idempotence — navigateur et serveur.

   Ce que ces tests couvrent :
     - l'empreinte serveur : stable d'une tentative à l'autre, sensible au
       contenu, insensible à l'horodatage de consentement ;
     - insererLead() : les quatre issues possibles et les en-têtes réellement
       émis vers PostgREST ;
     - les deux handlers : codes HTTP, et surtout NON-RÉPÉTITION des effets de
       bord sur un rejeu ;
     - assets/js/idempotence.js, exécuté dans un bac à sable : conservation de
       la clé au réessai, clé neuve sur contenu différent, survie au
       rechargement, dégradation sans sessionStorage.

   Aucun appel réseau, aucune clé, aucune base. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const subscribe = require(path.join(ROOT, 'api/subscribe.js'));
const guide = require(path.join(ROOT, 'api/subscribe-guide.js'));
const {
  canonique, empreinteCharge, idempotenceState, insererLead,
  IDEM_KEY_RE, IDEM_VAR, validate,
} = subscribe.__internals;

const CLE = '7f3a9b1c4d5e6f70a1b2c3d4e5f60718';
const SUPA = 'https://projet-factice-test.supabase.co';
const SERVICE = 'cle-factice-de-test';

/* ════════════ 1. Empreinte et forme de la clé ════════════ */

test('canonique : l\'ordre des propriétés ne change pas le texte', () => {
  assert.strictEqual(canonique({ a: 1, b: 2 }), canonique({ b: 2, a: 1 }));
  assert.strictEqual(canonique({ x: { p: 1, q: 2 } }), canonique({ x: { q: 2, p: 1 } }));
  // Les tableaux, eux, gardent leur ordre : c'est une donnée, pas une forme.
  assert.notStrictEqual(canonique({ a: [1, 2] }), canonique({ a: [2, 1] }));
  assert.strictEqual(canonique(undefined), 'null');
});

test('empreinte : identique entre deux tentatives du même contenu', () => {
  const corps = {
    prenom: 'Lea', nom: 'Durand', email: 'lea@exemple.test', tel: '0600000000',
    service: 'impots', situation: 'Cadre', reponses: { q1: 'oui' },
    consentMarketing: true, consentVersion: 'marketing-consent-v1',
  };
  // Deux appels successifs à validate() posent DEUX horodatages différents.
  const a = validate(corps, { hote: 'proactifsconseils.fr' }).data;
  const b = validate(corps, { hote: 'proactifsconseils.fr' }).data;
  assert.notStrictEqual(
    a.reponses.consentement.horodatage, b.reponses.consentement.horodatage,
    'les horodatages doivent bien différer, sinon le test ne prouve rien'
  );
  assert.strictEqual(empreinteCharge(a), empreinteCharge(b),
    'un réessai à contenu identique doit donner la même empreinte');
});

test('empreinte : change dès que le contenu change', () => {
  const base = { prenom: 'Lea', email: 'lea@exemple.test', service: 'impots' };
  const ref = empreinteCharge(validate(base, {}).data);
  const champs = [
    { prenom: 'Léa' },
    { nom: 'Durand' },
    { email: 'autre@exemple.test' },
    { tel: '0600000000' },
    { situation: 'Cadre' },
    { reponses: { q1: 'oui' } },
    { consentMarketing: true, consentVersion: 'marketing-consent-v1' },
  ];
  for (const variante of champs) {
    const v = empreinteCharge(validate(Object.assign({}, base, variante), {}).data);
    assert.notStrictEqual(v, ref, 'variation ignorée par l\'empreinte : ' + JSON.stringify(variante));
  }
});

test('empreinte : SHA-256 hexadécimal, jamais reçue du navigateur', () => {
  const e = empreinteCharge(validate({ prenom: 'Lea', email: 'l@e.test', service: 'impots' }, {}).data);
  assert.match(e, /^[0-9a-f]{64}$/);
  // Un champ `payload_fingerprint` ou `empreinte` envoyé par le client ne doit
  // être lu nulle part dans le code serveur.
  const src = fs.readFileSync(path.join(ROOT, 'api/subscribe.js'), 'utf8');
  assert.ok(!/body\.payload_fingerprint|body\.empreinte|body\.fingerprint/.test(src),
    'l\'empreinte ne doit jamais venir du navigateur');
});

test('forme de la clé : UUID accepté, fantaisie refusée', () => {
  assert.ok(IDEM_KEY_RE.test('123e4567-e89b-12d3-a456-426614174000'));
  assert.ok(IDEM_KEY_RE.test(CLE));
  assert.ok(!IDEM_KEY_RE.test(''), 'vide');
  assert.ok(!IDEM_KEY_RE.test('court'), 'trop court');
  assert.ok(!IDEM_KEY_RE.test('x'.repeat(65)), 'trop long');
  assert.ok(!IDEM_KEY_RE.test('cle avec espace 123456'), 'espace');
  assert.ok(!IDEM_KEY_RE.test("' or 1=1 -- aaaaaaaaaa"), 'caractères hors alphabet');
});

test('interrupteur : seul « on » active le dispositif', () => {
  assert.strictEqual(idempotenceState({ [IDEM_VAR]: 'on' }).active, true);
  assert.strictEqual(idempotenceState({ [IDEM_VAR]: 'ON' }).active, true);
  assert.strictEqual(idempotenceState({}).active, false);
  assert.strictEqual(idempotenceState({ [IDEM_VAR]: 'true' }).active, false);
  assert.strictEqual(idempotenceState({ [IDEM_VAR]: 'off' }).active, false);
  assert.strictEqual(idempotenceState({}).reason, 'variable_absente');
});

/* ════════════ 2. insererLead : les quatre issues ════════════ */

function reseau(reponses) {
  const appels = [];
  const orig = global.fetch;
  global.fetch = async (url, opts = {}) => {
    appels.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const r = reponses(String(url), opts, appels.length - 1);
    return r || new Response('{}', { status: 404 });
  };
  return { appels, rendre: () => { global.fetch = orig; } };
}

const RECORD = { prenom: 'Lea', email: 'lea@exemple.test', source: 'Quiz Homepage', statut: 'nouveau' };

test('insererLead : sans clé, exactement le chemin historique', async () => {
  const net = reseau(() => new Response('', { status: 201 }));
  try {
    const issue = await insererLead({ supabaseUrl: SUPA, supabaseKey: SERVICE, record: RECORD, cle: null });
    assert.strictEqual(issue.etat, 'insere');
    assert.strictEqual(net.appels.length, 1, 'un seul appel, aucune relecture');
    assert.strictEqual(net.appels[0].url, SUPA + '/rest/v1/leads', 'aucun paramètre ajouté');
    assert.strictEqual(net.appels[0].headers.Prefer, 'return=minimal');
    const envoye = JSON.parse(net.appels[0].body);
    assert.ok(!('idempotency_key' in envoye), 'aucune colonne nouvelle écrite');
    assert.ok(!('payload_fingerprint' in envoye));
  } finally { net.rendre(); }
});

test('insererLead : avec clé, une seule instruction et ON CONFLICT DO NOTHING', async () => {
  const net = reseau(() => new Response(JSON.stringify([{ id: 'abc' }]), { status: 201 }));
  try {
    const issue = await insererLead({ supabaseUrl: SUPA, supabaseKey: SERVICE, record: RECORD, cle: CLE, empreinte: 'e1' });
    assert.strictEqual(issue.etat, 'insere');
    assert.strictEqual(net.appels.length, 1, 'aucune lecture préalable : pas de fenêtre de course');
    assert.ok(net.appels[0].url.includes('on_conflict=idempotency_key'));
    assert.ok(net.appels[0].headers.Prefer.includes('resolution=ignore-duplicates'),
      'DO NOTHING, jamais merge : la demande initiale n\'est pas écrasée');
    assert.ok(!net.appels[0].headers.Prefer.includes('merge-duplicates'));
    const envoye = JSON.parse(net.appels[0].body);
    assert.strictEqual(envoye.idempotency_key, CLE);
    assert.strictEqual(envoye.payload_fingerprint, 'e1');
  } finally { net.rendre(); }
});

test('insererLead : même clé, même empreinte -> rejeu, aucune ligne', async () => {
  const net = reseau((url, opts) => {
    if (opts.method === 'POST') return new Response('[]', { status: 201 }); // conflit ignoré
    return new Response(JSON.stringify([{ payload_fingerprint: 'e1' }]), { status: 200 });
  });
  try {
    const issue = await insererLead({ supabaseUrl: SUPA, supabaseKey: SERVICE, record: RECORD, cle: CLE, empreinte: 'e1' });
    assert.strictEqual(issue.etat, 'rejeu');
    assert.strictEqual(net.appels.length, 2, 'insertion puis relecture de l\'empreinte');
    assert.strictEqual(net.appels[1].method, 'GET', 'la relecture ne doit rien écrire');
    assert.ok(net.appels[1].url.includes('select=payload_fingerprint'),
      'la relecture ne ramène que l\'empreinte, aucune donnée personnelle');
  } finally { net.rendre(); }
});

test('insererLead : même clé, empreinte différente -> conflit explicite', async () => {
  const net = reseau((url, opts) => {
    if (opts.method === 'POST') return new Response('[]', { status: 201 });
    return new Response(JSON.stringify([{ payload_fingerprint: 'empreinte-de-la-premiere' }]), { status: 200 });
  });
  try {
    const issue = await insererLead({ supabaseUrl: SUPA, supabaseKey: SERVICE, record: RECORD, cle: CLE, empreinte: 'autre' });
    assert.strictEqual(issue.etat, 'conflit');
    // Aucun PATCH, aucun PUT : la demande initiale reste telle quelle.
    assert.ok(net.appels.every((a) => a.method === 'POST' || a.method === 'GET'));
  } finally { net.rendre(); }
});

test('insererLead : conflit annoncé sans ligne correspondante -> erreur, pas un faux succès', async () => {
  const net = reseau((url, opts) => {
    if (opts.method === 'POST') return new Response('[]', { status: 201 });
    return new Response('[]', { status: 200 });
  });
  try {
    const issue = await insererLead({ supabaseUrl: SUPA, supabaseKey: SERVICE, record: RECORD, cle: CLE, empreinte: 'e1' });
    assert.strictEqual(issue.etat, 'erreur');
  } finally { net.rendre(); }
});

/* ════════════ 3. Handlers : codes et effets de bord ════════════ */

function mockRes() {
  const r = { statusCode: 200, body: undefined, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SYSTEME_API_KEY', 'VERCEL_ENV',
  'SUBSCRIBE_TURNSTILE_SECRET', 'SUBSCRIBE_TURNSTILE_SECRET_Preview',
  'BREVO_API_KEY', 'BREVO_LIST_ID_MARKETING', 'SUBSCRIBE_IDEMPOTENCY',
];

function avecEnv(valeurs, fn) {
  const garde = {};
  for (const k of ENV_KEYS) { garde[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, valeurs);
  const silence = [console.warn, console.error];
  console.warn = () => {}; console.error = () => {};
  return Promise.resolve().then(fn).finally(() => {
    console.warn = silence[0]; console.error = silence[1];
    for (const k of ENV_KEYS) { if (garde[k] === undefined) delete process.env[k]; else process.env[k] = garde[k]; }
  });
}

const ENV_ACTIF = {
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_KEY: SERVICE,
  VERCEL_ENV: 'production',
  SUBSCRIBE_IDEMPOTENCY: 'on',
  // Clés marketing présentes et consentement donné : si un effet de bord était
  // rejoué, ces appels le trahiraient.
  SYSTEME_API_KEY: 'systeme-factice',
  BREVO_API_KEY: 'brevo-factice',
  BREVO_LIST_ID_MARKETING: '42',
};

const DEMANDE = {
  prenom: 'Lea', email: 'lea@exemple.test', service: 'impots',
  consentMarketing: true, consentVersion: 'marketing-consent-v1',
  idempotencyKey: CLE,
};
const requete = (body) => ({ method: 'POST', headers: { origin: 'https://proactifsconseils.fr' }, body });
const horsLeads = (appels) => appels.filter((a) => !a.url.includes('/rest/v1/leads'));

test('subscribe : rejeu -> 200, aucun effet de bord rejoué', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau((url, opts) => {
      if (url.includes('/rest/v1/leads') && opts.method === 'POST') return new Response('[]', { status: 201 });
      if (url.includes('/rest/v1/leads')) return new Response(JSON.stringify([{ payload_fingerprint: null }]), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    try {
      // L'empreinte stockée est renseignée dynamiquement : on la calcule comme
      // le serveur, pour que la relecture concorde.
      const attendue = empreinteCharge(validate(DEMANDE, { hote: 'proactifsconseils.fr' }).data);
      net.rendre();
      const net2 = reseau((url, opts) => {
        if (url.includes('/rest/v1/leads') && opts.method === 'POST') return new Response('[]', { status: 201 });
        if (url.includes('/rest/v1/leads')) return new Response(JSON.stringify([{ payload_fingerprint: attendue }]), { status: 200 });
        return new Response('{}', { status: 200 });
      });
      try {
        const res = mockRes();
        await subscribe(requete(DEMANDE), res);
        assert.strictEqual(res.statusCode, 200, 'un rejeu est un succès pour le visiteur');
        assert.deepStrictEqual(res.body, { success: true, rejeu: true });
        assert.deepStrictEqual(horsLeads(net2.appels), [],
          'ni Systeme.io ni Brevo ne doivent être rappelés sur un rejeu');
      } finally { net2.rendre(); }
    } finally { /* net déjà rendu */ }
  });
});

test('subscribe : insertion réelle -> les effets de bord ont bien lieu (témoin)', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau((url, opts) => {
      if (url.includes('/rest/v1/leads') && opts.method === 'POST') {
        return new Response(JSON.stringify([{ id: 'abc' }]), { status: 201 });
      }
      return new Response('{}', { status: 200 });
    });
    try {
      const res = mockRes();
      await subscribe(requete(DEMANDE), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true });
      assert.ok(horsLeads(net.appels).length > 0,
        'sans ce témoin, le test du rejeu ne prouverait rien');
    } finally { net.rendre(); }
  });
});

test('subscribe : même clé, contenu différent -> 409 sans écrasement', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau((url, opts) => {
      if (url.includes('/rest/v1/leads') && opts.method === 'POST') return new Response('[]', { status: 201 });
      if (url.includes('/rest/v1/leads')) return new Response(JSON.stringify([{ payload_fingerprint: 'dune-autre-demande' }]), { status: 200 });
      return new Response('{}', { status: 200 });
    });
    try {
      const res = mockRes();
      await subscribe(requete(DEMANDE), res);
      assert.strictEqual(res.statusCode, 409);
      assert.ok(/déjà été enregistrée/.test(res.body.error));
      assert.ok(net.appels.every((a) => a.method === 'POST' || a.method === 'GET'),
        'aucune mise à jour de la demande initiale');
      assert.deepStrictEqual(horsLeads(net.appels), [], 'aucun effet de bord sur un conflit');
    } finally { net.rendre(); }
  });
});

test('subscribe : clé malformée -> 400 avant toute écriture', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau(() => new Response('[]', { status: 201 }));
    try {
      const res = mockRes();
      await subscribe(requete(Object.assign({}, DEMANDE, { idempotencyKey: "'; drop table leads; --" })), res);
      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(net.appels, [], 'rien ne doit partir vers la base');
    } finally { net.rendre(); }
  });
});

test('subscribe : dispositif inactif -> clé ignorée, chemin historique', async () => {
  const env = Object.assign({}, ENV_ACTIF);
  delete env.SUBSCRIBE_IDEMPOTENCY;
  await avecEnv(env, async () => {
    const net = reseau(() => new Response('', { status: 201 }));
    try {
      const res = mockRes();
      await subscribe(requete(DEMANDE), res);
      assert.strictEqual(res.statusCode, 200);
      const insertion = net.appels.find((a) => a.url.includes('/rest/v1/leads'));
      assert.ok(!insertion.url.includes('on_conflict'), 'aucun ON CONFLICT sans la variable');
      assert.strictEqual(insertion.headers.Prefer, 'return=minimal');
      const envoye = JSON.parse(insertion.body);
      assert.ok(!('idempotency_key' in envoye),
        'la colonne ne doit pas être écrite avant que la migration soit passée');
    } finally { net.rendre(); }
  });
});

test('subscribe : demande sans clé, dispositif actif -> acceptée comme avant', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau(() => new Response('', { status: 201 }));
    try {
      const sansCle = Object.assign({}, DEMANDE);
      delete sansCle.idempotencyKey;
      const res = mockRes();
      await subscribe(requete(sansCle), res);
      assert.strictEqual(res.statusCode, 200, 'un navigateur sans sessionStorage ne doit pas être refusé');
      const insertion = net.appels.find((a) => a.url.includes('/rest/v1/leads'));
      assert.strictEqual(insertion.headers.Prefer, 'return=minimal');
    } finally { net.rendre(); }
  });
});

test('subscribe-guide : rejeu -> 200, pas de second contact Systeme.io', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const corps = {
      prenom: 'Lea', email: 'lea@exemple.test',
      consentMarketing: true, consentVersion: 'marketing-consent-v1',
      idempotencyKey: CLE,
    };
    // L'empreinte du guide porte sur l'enregistrement construit par le handler :
    // on laisse la relecture répondre la même valeur que celle qui vient d'être
    // envoyée, ce qui est exactement le cas d'un rejeu.
    let empreinteEnvoyee = null;
    const net = reseau((url, opts) => {
      if (url.includes('/rest/v1/leads') && opts.method === 'POST') {
        empreinteEnvoyee = JSON.parse(opts.body).payload_fingerprint;
        return new Response('[]', { status: 201 });
      }
      if (url.includes('/rest/v1/leads')) {
        return new Response(JSON.stringify([{ payload_fingerprint: empreinteEnvoyee }]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    try {
      const res = mockRes();
      await guide(requete(corps), res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { success: true, rejeu: true });
      assert.deepStrictEqual(horsLeads(net.appels), [],
        'un second email de confirmation du guide serait inacceptable');
    } finally { net.rendre(); }
  });
});

test('subscribe-guide : clé malformée -> 400 avant toute écriture', async () => {
  await avecEnv(ENV_ACTIF, async () => {
    const net = reseau(() => new Response('[]', { status: 201 }));
    try {
      const res = mockRes();
      await guide(requete({ prenom: 'Lea', email: 'lea@exemple.test', idempotencyKey: 'trop-court' }), res);
      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(net.appels, []);
    } finally { net.rendre(); }
  });
});

/* ════════════ 4. assets/js/idempotence.js ════════════ */

function bacNavigateur(stockageDispo = true) {
  const donnees = new Map();
  const sessionStorage = stockageDispo ? {
    getItem: (k) => (donnees.has(k) ? donnees.get(k) : null),
    setItem: (k, v) => { donnees.set(k, String(v)); },
    removeItem: (k) => { donnees.delete(k); },
  } : {
    get getItem() { throw new Error('acces refuse'); },
  };
  const bac = {
    sessionStorage,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 12) + '-0000' },
    console: { warn() {} },
    Date, Math, JSON, Object, Uint8Array, String,
  };
  bac.window = bac;
  vm.createContext(bac);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/idempotence.js'), 'utf8'), bac);
  return { bac, donnees, idem: bac.ProactifsIdem };
}

const CORPS = {
  prenom: 'Lea', email: 'lea@exemple.test', service: 'impots',
  captchaToken: 'jeton-1', hp: '',
};

test('client : même contenu, même clé — le réessai ne crée pas de doublon', () => {
  const n = bacNavigateur();
  const a = n.idem.cle('subscribe:accueil', CORPS);
  const b = n.idem.cle('subscribe:accueil', CORPS);
  assert.strictEqual(a, b);
});

test('client : jeton anti-robot régénéré -> la clé est conservée', () => {
  // C'est LE cas du réessai : le jeton ne vaut qu'une fois, la page en demande
  // un neuf. S'il entrait dans l'empreinte, chaque réessai créerait un doublon.
  const n = bacNavigateur();
  const a = n.idem.cle('subscribe:accueil', CORPS);
  const b = n.idem.cle('subscribe:accueil', Object.assign({}, CORPS, { captchaToken: 'jeton-2' }));
  assert.strictEqual(a, b);
});

test('client : contenu modifié -> clé neuve, la demande passe', () => {
  const n = bacNavigateur();
  const a = n.idem.cle('subscribe:accueil', CORPS);
  const b = n.idem.cle('subscribe:accueil', Object.assign({}, CORPS, { email: 'autre@exemple.test' }));
  assert.notStrictEqual(a, b);
});

test('client : réponse perdue puis rechargement, saisie identique -> même clé', () => {
  // sessionStorage survit au rechargement de l'onglet : on simule en
  // réexécutant le script sur le même stockage.
  const n = bacNavigateur();
  const avant = n.idem.cle('subscribe:accueil', CORPS);
  const recharge = Object.assign({}, n.bac);
  vm.createContext(recharge);
  recharge.window = recharge;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/idempotence.js'), 'utf8'), recharge);
  const apres = recharge.ProactifsIdem.cle('subscribe:accueil', CORPS);
  assert.strictEqual(apres, avant, 'la clé doit survivre au rechargement');
});

test('client : oublier() -> une nouvelle demande volontaire reçoit une clé neuve', () => {
  const n = bacNavigateur();
  const a = n.idem.cle('subscribe:accueil', CORPS);
  n.idem.oublier('subscribe:accueil');
  const b = n.idem.cle('subscribe:accueil', CORPS);
  assert.notStrictEqual(a, b);
});

test('client : les portées ne se mélangent pas', () => {
  const n = bacNavigateur();
  const a = n.idem.cle('subscribe:accueil', CORPS);
  const b = n.idem.cle('subscribe:succession', CORPS);
  assert.notStrictEqual(a, b);
  n.idem.oublier('subscribe:succession');
  assert.strictEqual(n.idem.cle('subscribe:accueil', CORPS), a, 'oublier une portée ne touche pas les autres');
});

test('client : sans sessionStorage, une clé est quand même émise', () => {
  const n = bacNavigateur(false);
  assert.strictEqual(n.idem.disponible(), false);
  const a = n.idem.cle('subscribe:accueil', CORPS);
  const b = n.idem.cle('subscribe:accueil', CORPS);
  assert.ok(a && typeof a === 'string', 'le formulaire doit continuer de fonctionner');
  assert.notStrictEqual(a, b, 'sans stockage, la protection ne joue plus — c\'est assumé');
  assert.ok(IDEM_KEY_RE.test(a), 'la clé émise doit rester acceptable par le serveur');
});

test('client : la clé émise respecte la forme attendue par le serveur', () => {
  const n = bacNavigateur();
  assert.ok(IDEM_KEY_RE.test(n.idem.cle('subscribe:accueil', CORPS)));
});

/* ════════════ 5. Branchement des dix pages ════════════ */

const PAGES = [
  ['index.html', 'subscribe:accueil'],
  ['bilan-patrimonial.html', 'subscribe:bilan'],
  ['declaration-rsu-espp-france.html', 'subscribe:declaration-rsu'],
  ['immobilier/succession-colombes.html', 'subscribe:succession'],
  ['optimisation-fiscale-ile-de-france.html', 'subscribe:optimisation'],
  ['simulation-pret-immobilier.html', 'subscribe:simulation-pret'],
  ['simulateurs/capacite-emprunt.html', 'subscribe:capacite-emprunt'],
  ['simulateurs/mensualite-credit.html', 'subscribe:mensualite-credit'],
  ['simulateurs/taux-endettement.html', 'subscribe:taux-endettement'],
  ['guide-5-erreurs-patrimoniaux.html', 'guide'],
];

test('les dix pages chargent le script et posent leur propre portée', () => {
  const portees = new Set();
  for (const [rel, portee] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(html.includes('<script src="/assets/js/idempotence.js" defer></script>'),
      rel + ' : script non chargé');
    assert.ok(html.includes("window.ProactifsIdem.cle('" + portee + "'"),
      rel + ' : clé non posée pour la portée ' + portee);
    assert.ok(html.includes("window.ProactifsIdem.oublier('" + portee + "')"),
      rel + ' : clé non oubliée après succès');
    assert.ok(!portees.has(portee), 'portée dupliquée entre deux pages : ' + portee);
    portees.add(portee);
  }
  assert.strictEqual(portees.size, 10);
});

test('la clé est posée AVANT le fetch, jamais après', () => {
  for (const [rel] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const posCle = html.indexOf('window.ProactifsIdem.cle(');
    const posFetch = html.indexOf("fetch('/api/subscribe", posCle);
    assert.ok(posCle > 0 && posFetch > posCle, rel + ' : la clé doit être posée avant l\'appel');
  }
});

test('oublier() n\'est appelé sur aucun chemin d\'échec', () => {
  for (const [rel, portee] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lignes = html.split('\n');
    for (let i = 0; i < lignes.length; i++) {
      if (!lignes[i].includes("oublier('" + portee + "')")) continue;
      // Les six lignes qui précèdent ne doivent pas être un chemin d'erreur.
      const amont = lignes.slice(Math.max(0, i - 6), i).join('\n');
      assert.ok(!/ProactifsCaptcha\.reset|permettreReprise|wz-msg-err|Réessayer/.test(amont),
        rel + ' : oublier() semble appelé sur un chemin d\'échec (ligne ' + (i + 1) + ')');
    }
  }
});

/* ════════════ 6. Migration ════════════ */

test('la migration pose l\'unicité, les contraintes et son retour arrière', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'migration-leads-idempotence.sql'), 'utf8');
  assert.ok(/create unique index if not exists leads_idempotency_key_uniq/.test(sql),
    'c\'est l\'index unique qui tient l\'atomicité');
  assert.ok(/add column if not exists idempotency_key text/.test(sql));
  assert.ok(/add column if not exists payload_fingerprint text/.test(sql));
  // Même alphabet que le serveur, sinon la base accepterait ce que le code refuse.
  assert.ok(sql.includes("'^[A-Za-z0-9_-]{16,64}$'"), 'forme de clé désalignée du code');
  assert.ok(/drop index if exists public\.leads_idempotency_key_uniq/.test(sql), 'retour arrière absent');
  assert.ok(/SUBSCRIBE_IDEMPOTENCY/.test(sql), 'ordre de déploiement non documenté');
  // Aucune déduplication sur l'email : ce serait perdre des demandes réelles.
  assert.ok(!/unique.*\(email/i.test(sql), 'aucune unicité sur l\'email');
});
