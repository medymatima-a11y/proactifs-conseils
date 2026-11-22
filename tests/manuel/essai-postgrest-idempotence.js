'use strict';
/* ============================================================
   Banc d'essai manuel — le vrai parcours /api/subscribe → PostgREST

   Ce que ce banc éprouve, et que les tests unitaires ne peuvent pas éprouver :
   les handlers réels, PostgREST, l'index unique et le trigger, dans un seul
   et même aller-retour. 27 scénarios.

   ⚠️ Il ÉCRIT et SUPPRIME. Il ne doit viser qu'une reproduction jetable.
   Les verrous sont dans garde-essai.js : la production est refusée sans
   condition, et une seule adresse hors .invalid dans `leads` arrête tout.

   Rien ne sort de la machine, à deux exceptions près, voulues :
     - le projet Supabase d'essai, visé explicitement ;
     - challenges.cloudflare.com, avec les clés d'essai PUBLIÉES par Cloudflare
       (scénario E). Aucune donnée personnelle, aucun effet de bord.
   Systeme.io et Brevo sont interceptés et ne partent jamais. Tout autre hôte
   lève une erreur plutôt que d'être appelé.

   Lancement : voir tests/manuel/README.md. Ce fichier ne contient aucun secret.
   ============================================================ */

const path = require('path');
const garde = require('./garde-essai.js');

const RACINE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', '..');

let ctx;
try {
  ctx = garde.verifierEnvironnement(process.env);
} catch (e) {
  console.error('\n' + e.message + '\n');
  process.exit(2);
}

const subscribe = require(path.join(RACINE, 'api', 'subscribe.js'));
const guide = require(path.join(RACINE, 'api', 'subscribe-guide.js'));

const SB_URL = ctx.url;
const SB_KEY = ctx.cle;
const vraiFetch = global.fetch;

let externes = [];           // tentatives vers Systeme.io / Brevo (interceptées)
let siteverify = [];         // appels vers Cloudflare
const config = { systeme: 'ok', brevo: 'ok', turnstileReel: false };

global.fetch = garde.fetchCloisonne(ctx, vraiFetch, [
  {
    hote: 'challenges.cloudflare.com',
    repondre: (url, opts, f) => {
      siteverify.push({ reel: config.turnstileReel });
      if (config.turnstileReel) return f(url, opts);
      return new Response('{"success":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  },
  {
    hote: 'systeme.io',
    repondre: () => {
      externes.push({ service: 'systeme.io', issue: config.systeme });
      if (config.systeme === 'reseau') throw new Error('essai: panne reseau simulee');
      return new Response('{}', { status: config.systeme === 'ok' ? 200 : 503 });
    },
  },
  {
    hote: 'brevo.com',
    repondre: () => {
      externes.push({ service: 'brevo', issue: config.brevo });
      if (config.brevo === 'reseau') throw new Error('essai: panne reseau simulee');
      return new Response('{}', { status: config.brevo === 'ok' ? 201 : 500 });
    },
  },
]);

function faussesReponses() {
  const r = { statut: null, corps: null };
  r.setHeader = () => {};
  r.status = (c) => { r.statut = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}

async function appel(handler, body, origine) {
  const req = { method: 'POST', headers: { origin: origine || 'https://proactifsconseils.fr' }, body: body };
  const res = faussesReponses();
  await handler(req, res);
  return { statut: res.statut, corps: res.corps };
}

async function sbGet(chemin) {
  const r = await vraiFetch(SB_URL + '/rest/v1/' + chemin, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) throw new Error('lecture ' + chemin + ' : ' + r.status + ' ' + (await r.text()));
  return r.json();
}

async function remiseAZero() {
  for (const t of ['zz_essai_notifications', 'leads']) {
    const r = await vraiFetch(SB_URL + '/rest/v1/' + t + '?id=not.is.null', {
      method: 'DELETE', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' },
    });
    if (!r.ok && r.status !== 404) throw new Error('purge ' + t + ' : ' + r.status + ' ' + (await r.text()));
  }
  // PostgREST rend 204 même quand RLS n'a laissé supprimer aucune ligne : sans
  // cette vérification, un décor non vide passerait pour une table propre et
  // tous les comptages suivants seraient faux.
  for (const t of ['leads', 'zz_essai_notifications']) {
    const reste = await sbGet(t + '?select=id');
    if (reste.length !== 0) {
      throw new Error(
        'purge inefficace sur ' + t + ' : ' + reste.length + ' ligne(s) restantes.\n' +
        '  → les politiques d\'essai DELETE pour anon sont-elles en place ? Voir tests/manuel/README.md.'
      );
    }
  }
  externes = []; siteverify = [];
}

function cle(n) {
  const base = 'essai-idem-' + n + '-';
  return (base + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').slice(0, 32);
}

function corpsType(extra) {
  return Object.assign({
    prenom: 'Essai',
    nom: 'Fictif',
    email: 'essai-idem@example.invalid',
    service: 'bilan',
    source: 'Quiz bilan patrimonial',
    situation: 'Salarie',
    reponses: { objectif: 'essai technique' },
    consentMarketing: true,
    consentVersion: 'v1',
  }, extra || {});
}

const resultats = [];
function note(nom, attendu, constate, ok) { resultats.push({ essai: nom, attendu: attendu, constate: constate, ok: ok }); }

async function etat() {
  const l = await sbGet('leads?select=id,prenom,email,idempotency_key,payload_fingerprint&order=created_at.asc');
  const j = await sbGet('zz_essai_notifications?select=lead_id,canal,resultat&order=id.asc');
  return { lignes: l, journal: j };
}

(async () => {
  await garde.verifierDecor(ctx, vraiFetch);

  process.env.SUPABASE_URL = SB_URL;
  process.env.SUPABASE_SERVICE_KEY = SB_KEY;
  process.env.SUBSCRIBE_IDEMPOTENCY = 'on';
  delete process.env.SUBSCRIBE_TURNSTILE_SECRET;
  delete process.env.SUBSCRIBE_TURNSTILE_SECRET_Preview;
  delete process.env.VERCEL_ENV;
  delete process.env.SYSTEME_API_KEY;
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_LIST_ID_MARKETING;

  /* A — insertion réussie mais réponse perdue, puis réessai avec la même clé */
  await remiseAZero();
  const K = cle(1);
  const corps = corpsType({ idempotencyKey: K });
  const a1 = await appel(subscribe, JSON.parse(JSON.stringify(corps)));
  const apres1 = await etat();
  const a2 = await appel(subscribe, JSON.parse(JSON.stringify(corps)));
  const apres2 = await etat();
  note('A1 insertion initiale', '200 success', a1.statut + ' ' + JSON.stringify(a1.corps), a1.statut === 200 && a1.corps.success === true && !a1.corps.rejeu);
  note('A1 ligne creee avec la cle', '1 ligne, cle posee', apres1.lignes.length + ' ligne(s), cle conforme=' + String(!!apres1.lignes[0] && apres1.lignes[0].idempotency_key === K), apres1.lignes.length === 1 && apres1.lignes[0].idempotency_key === K);
  note('A1 journal du trigger', '3 entrees (interne, confirmation, brevo)', apres1.journal.length + ' entrees : ' + apres1.journal.map((x) => x.canal).join(','), apres1.journal.length === 3);
  note('A2 rejeu meme cle', '200 success rejeu:true', a2.statut + ' ' + JSON.stringify(a2.corps), a2.statut === 200 && a2.corps.success === true && a2.corps.rejeu === true);
  note('A2 aucune 2e ligne', '1 ligne', apres2.lignes.length + ' ligne(s)', apres2.lignes.length === 1);
  note('A2 aucun declenchement rejoue', '3 entrees, 1 seul lead_id', apres2.journal.length + ' entrees, ' + new Set(apres2.journal.map((x) => x.lead_id)).size + ' lead_id distinct', apres2.journal.length === 3 && new Set(apres2.journal.map((x) => x.lead_id)).size === 1);

  /* B — deux appels simultanés, même clé */
  await remiseAZero();
  const KB = cle(2);
  const cB = corpsType({ idempotencyKey: KB, email: 'essai-simultane@example.invalid' });
  const [b1, b2] = await Promise.all([appel(subscribe, JSON.parse(JSON.stringify(cB))), appel(subscribe, JSON.parse(JSON.stringify(cB)))]);
  const apresB = await etat();
  const codesB = [b1, b2].map((x) => x.statut + (x.corps && x.corps.rejeu ? '/rejeu' : '')).sort().join(' + ');
  note('B deux appels simultanes', '1 ligne, 3 entrees de journal', apresB.lignes.length + ' ligne(s), ' + apresB.journal.length + ' entrees ; reponses ' + codesB, apresB.lignes.length === 1 && apresB.journal.length === 3);
  note('B aucune reponse en erreur', 'les deux en 200', codesB, b1.statut === 200 && b2.statut === 200);

  /* C — même clé, contenu différent */
  await remiseAZero();
  const KC = cle(3);
  const c1 = await appel(subscribe, corpsType({ idempotencyKey: KC, email: 'essai-conflit@example.invalid', prenom: 'Premier' }));
  const c2 = await appel(subscribe, corpsType({ idempotencyKey: KC, email: 'essai-conflit@example.invalid', prenom: 'Second' }));
  const apresC = await etat();
  note('C conflit de contenu', '409', c2.statut + ' ' + JSON.stringify(c2.corps), c2.statut === 409);
  note('C demande initiale conservee', '1 ligne', apresC.lignes.length + ' ligne(s), initiale ' + c1.statut, apresC.lignes.length === 1 && c1.statut === 200);
  note('C aucun ecrasement', 'prenom = Premier', JSON.stringify(apresC.lignes.map((x) => x.prenom)), apresC.lignes.length === 1 && apresC.lignes[0].prenom === 'Premier');

  /* D — insertion réussie puis échec Systeme.io et Brevo */
  await remiseAZero();
  process.env.SYSTEME_API_KEY = 'essai-faux-jeton';
  process.env.BREVO_API_KEY = 'essai-faux-jeton';
  process.env.BREVO_LIST_ID_MARKETING = '99';
  config.systeme = 'reseau'; config.brevo = 'erreur';
  const KD = cle(4);
  const cD = corpsType({ idempotencyKey: KD, email: 'essai-externe@example.invalid' });
  const d1 = await appel(subscribe, JSON.parse(JSON.stringify(cD)));
  const extD1 = externes.slice();
  const d2 = await appel(subscribe, JSON.parse(JSON.stringify(cD)));
  const extD2 = externes.slice(extD1.length);
  const apresD = await etat();
  note('D echec externe non bloquant', '200 success malgre les deux pannes', d1.statut + ' ' + JSON.stringify(d1.corps), d1.statut === 200 && d1.corps.success === true);
  note('D ligne enregistree quand meme', '1 ligne', apresD.lignes.length + ' ligne(s)', apresD.lignes.length === 1);
  note('D les deux services ont ete tentes', 'systeme.io + brevo', JSON.stringify(extD1), extD1.length === 2);
  note('D rejeu : aucune nouvelle tentative externe', '0 appel', extD2.length + ' appel(s) ' + JSON.stringify(extD2), extD2.length === 0);
  note('D rejeu reconnu', '200 rejeu:true', d2.statut + ' ' + JSON.stringify(d2.corps), d2.statut === 200 && d2.corps.rejeu === true);
  config.systeme = 'ok'; config.brevo = 'ok';
  delete process.env.SYSTEME_API_KEY; delete process.env.BREVO_API_KEY; delete process.env.BREVO_LIST_ID_MARKETING;

  /* E — articulation avec le jeton Turnstile à usage unique.
     Clés d'essai publiées par Cloudflare :
       1x0000000000000000000000000000000AA  passe toujours
       3x0000000000000000000000000000000AA  « token already spent »
     https://developers.cloudflare.com/turnstile/troubleshooting/testing/ */
  await remiseAZero();
  const JETON = 'XXXX.DUMMY.TOKEN.XXXX';
  const KE = cle(5);
  config.turnstileReel = true;
  process.env.SUBSCRIBE_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
  const e1 = await appel(subscribe, corpsType({ idempotencyKey: KE, email: 'essai-captcha@example.invalid', captchaToken: JETON }));
  const apresE1 = await etat();
  process.env.SUBSCRIBE_TURNSTILE_SECRET = '3x0000000000000000000000000000000AA';
  const e2 = await appel(subscribe, corpsType({ idempotencyKey: KE, email: 'essai-captcha@example.invalid', captchaToken: JETON }));
  const apresE2 = await etat();
  process.env.SUBSCRIBE_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';
  const e3 = await appel(subscribe, corpsType({ idempotencyKey: KE, email: 'essai-captcha@example.invalid', captchaToken: JETON }));
  const apresE3 = await etat();
  note('E1 jeton frais, captcha actif', '200 success, 1 ligne', e1.statut + ' ' + JSON.stringify(e1.corps) + ', ' + apresE1.lignes.length + ' ligne(s)', e1.statut === 200 && apresE1.lignes.length === 1);
  note('E2 rejeu avec jeton consomme', '403 AVANT toute ecriture', e2.statut + ' ' + JSON.stringify(e2.corps) + ', ' + apresE2.lignes.length + ' ligne(s), journal ' + apresE2.journal.length, e2.statut === 403 && apresE2.lignes.length === 1 && apresE2.journal.length === 3);
  note('E3 rejeu avec jeton frais', '200 rejeu:true, toujours 1 ligne', e3.statut + ' ' + JSON.stringify(e3.corps) + ', ' + apresE3.lignes.length + ' ligne(s)', e3.statut === 200 && e3.corps.rejeu === true && apresE3.lignes.length === 1);
  note('E appels siteverify reellement emis', '3', String(siteverify.length), siteverify.length === 3);
  delete process.env.SUBSCRIBE_TURNSTILE_SECRET;
  config.turnstileReel = false;

  /* F — sans clé : comportement historique, deux lignes */
  await remiseAZero();
  const cF = corpsType({ email: 'essai-sans-cle@example.invalid' });
  const f1 = await appel(subscribe, JSON.parse(JSON.stringify(cF)));
  const f2 = await appel(subscribe, JSON.parse(JSON.stringify(cF)));
  const apresF = await etat();
  note('F deux demandes sans cle', '2 lignes, cles NULL', apresF.lignes.length + ' ligne(s), cles ' + JSON.stringify(apresF.lignes.map((x) => x.idempotency_key)), apresF.lignes.length === 2 && apresF.lignes.every((x) => x.idempotency_key === null) && f1.statut === 200 && f2.statut === 200);

  /* G — dispositif inactif : la clé reçue est ignorée */
  await remiseAZero();
  delete process.env.SUBSCRIBE_IDEMPOTENCY;
  const KG = cle(7);
  const cG = corpsType({ idempotencyKey: KG, email: 'essai-inactif@example.invalid' });
  await appel(subscribe, JSON.parse(JSON.stringify(cG)));
  await appel(subscribe, JSON.parse(JSON.stringify(cG)));
  const apresG = await etat();
  note('G variable absente, cle ignoree', '2 lignes, cles NULL', apresG.lignes.length + ' ligne(s), cles ' + JSON.stringify(apresG.lignes.map((x) => x.idempotency_key)), apresG.lignes.length === 2 && apresG.lignes.every((x) => x.idempotency_key === null));
  process.env.SUBSCRIBE_IDEMPOTENCY = 'on';

  /* H — clé malformée */
  await remiseAZero();
  const h = await appel(subscribe, corpsType({ idempotencyKey: 'trop-courte', email: 'essai-malformee@example.invalid' }));
  const apresH = await etat();
  note('H cle malformee refusee', '400, rien en base', h.statut + ' ' + JSON.stringify(h.corps) + ', ' + apresH.lignes.length + ' ligne(s)', h.statut === 400 && apresH.lignes.length === 0);

  /* I — même parcours sur /api/subscribe-guide */
  await remiseAZero();
  const KI = cle(9);
  const cI = { prenom: 'Essai', email: 'essai-guide@example.invalid', idempotencyKey: KI, consentMarketing: false, consentVersion: 'v1' };
  const i1 = await appel(guide, JSON.parse(JSON.stringify(cI)));
  const i2 = await appel(guide, JSON.parse(JSON.stringify(cI)));
  const apresI = await etat();
  note('I guide : rejeu reconnu', '200 puis 200 rejeu:true', i1.statut + '/' + i2.statut + ' ' + JSON.stringify(i2.corps), i1.statut === 200 && i2.statut === 200 && !!i2.corps && i2.corps.rejeu === true);
  note('I guide : un seul envoi', '1 ligne, 2 entrees (pas de brevo sans consentement)', apresI.lignes.length + ' ligne(s), ' + apresI.journal.length + ' entrees : ' + apresI.journal.map((x) => x.canal).join(','), apresI.lignes.length === 1 && apresI.journal.length === 2);

  /* J — origine refusée : le contrôle précède l'écriture */
  await remiseAZero();
  const j1 = await appel(subscribe, corpsType({ idempotencyKey: cle(10), email: 'essai-origine@example.invalid' }), 'https://exemple-pirate.invalid');
  const apresJ = await etat();
  note('J origine refusee', '403, rien en base', j1.statut + ', ' + apresJ.lignes.length + ' ligne(s)', j1.statut === 403 && apresJ.lignes.length === 0);

  /* K — champ piège */
  await remiseAZero();
  const k1 = await appel(subscribe, corpsType({ idempotencyKey: cle(11), email: 'essai-piege@example.invalid', hp: 'robot' }));
  const apresK = await etat();
  note('K champ piege', '400, rien en base', k1.statut + ', ' + apresK.lignes.length + ' ligne(s)', k1.statut === 400 && apresK.lignes.length === 0);

  await remiseAZero();

  let echecs = 0;
  for (const r of resultats) {
    if (!r.ok) echecs += 1;
    console.log((r.ok ? 'OK   ' : 'ECHEC') + '  ' + r.essai);
    console.log('        attendu  : ' + r.attendu);
    console.log('        constate : ' + r.constate);
  }
  console.log('');
  console.log(resultats.length + ' essais, ' + echecs + ' echec(s)');
  process.exit(echecs ? 1 : 0);
})().catch((e) => {
  if (e instanceof garde.RefusEssai) { console.error('\n' + e.message + '\n'); process.exit(2); }
  console.error('ESSAI INTERROMPU :', (e && e.stack) || e);
  process.exit(3);
});
