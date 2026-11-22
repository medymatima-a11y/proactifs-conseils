'use strict';
/* ============================================================
   Banc d'essai manuel — contention sur l'index, et livraison des notifications

   Deux questions que les tests unitaires ne savent pas trancher :
     L. l'index unique tient-il sous contention réelle ? Plusieurs tours de N
        appels lancés ensemble, tous avec la même clé.
     M. « aucun doublon » vaut-il « notification livrée » ? Non — et ce banc le
        montre : un canal qui échoue après l'insertion laisse la demande
        enregistrée et la notification perdue, et le rejeu ne la retente pas.
     N. et si le trigger était SYNCHRONE ? Son échec annulerait l'insertion.

   ⚠️ Il ÉCRIT et SUPPRIME. Verrous dans garde-essai.js : production refusée
   sans condition, et une seule adresse hors .invalid arrête tout.

   Aucun service externe n'est appelé : tout hôte autre que le projet d'essai
   lève une erreur.

   Lancement : voir tests/manuel/README.md. Aucun secret dans ce fichier.
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

const SB_URL = ctx.url;
const SB_KEY = ctx.cle;
const vraiFetch = global.fetch;
global.fetch = garde.fetchCloisonne(ctx, vraiFetch, []);

function res0() {
  const r = { statut: null, corps: null };
  r.setHeader = () => {}; r.end = () => r;
  r.status = (c) => { r.statut = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  return r;
}
async function appel(body) {
  const res = res0();
  await subscribe({ method: 'POST', headers: { origin: 'https://proactifsconseils.fr' }, body: body }, res);
  return { statut: res.statut, rejeu: !!(res.corps && res.corps.rejeu) };
}
async function sbGet(c) {
  const r = await vraiFetch(SB_URL + '/rest/v1/' + c, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) throw new Error('lecture ' + c + ' : ' + r.status + ' ' + (await r.text()));
  return r.json();
}
async function purge() {
  for (const t of ['zz_essai_notifications', 'leads']) {
    await vraiFetch(SB_URL + '/rest/v1/' + t + '?id=not.is.null', { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'return=minimal' } });
  }
  for (const t of ['leads', 'zz_essai_notifications']) {
    const reste = await sbGet(t + '?select=id');
    if (reste.length) {
      throw new Error(
        'purge inefficace sur ' + t + ' : ' + reste.length + ' ligne(s).\n' +
        '  → les politiques d\'essai DELETE pour anon sont-elles en place ? Voir tests/manuel/README.md.'
      );
    }
  }
}
async function mode(m) {
  const r = await vraiFetch(SB_URL + '/rest/v1/rpc/zz_essai_mode', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ m: m }),
  });
  if (!r.ok) {
    throw new Error(
      'appel de zz_essai_mode refusé (HTTP ' + r.status + ').\n' +
      '  → le droit EXECUTE pour anon est-il accordé ? Voir tests/manuel/README.md.'
    );
  }
  return r.json();
}
function corps(k, email) {
  return {
    prenom: 'Essai', nom: 'Fictif', email: email, service: 'bilan',
    source: 'Quiz bilan patrimonial', reponses: { objectif: 'essai technique' },
    consentMarketing: true, consentVersion: 'v1', idempotencyKey: k,
  };
}

(async () => {
  await garde.verifierDecor(ctx, vraiFetch);

  process.env.SUPABASE_URL = SB_URL;
  process.env.SUPABASE_SERVICE_KEY = SB_KEY;
  process.env.SUBSCRIBE_IDEMPOTENCY = 'on';
  delete process.env.SUBSCRIBE_TURNSTILE_SECRET;
  delete process.env.SYSTEME_API_KEY;
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_LIST_ID_MARKETING;

  const PAR = Number(process.env.ESSAI_PARALLELE || 8);
  const TOURS = Number(process.env.ESSAI_TOURS || 6);
  let doublons = 0;
  let cinqCents = 0;
  const autres = [];
  const tours = [];

  await mode('normal');
  await purge();
  for (let t = 0; t < TOURS; t += 1) {
    const k = ('contention-' + t + '-ABCDEFGHIJKLMNOPQRSTUVWXYZ').slice(0, 34);
    const lots = [];
    for (let i = 0; i < PAR; i += 1) lots.push(appel(corps(k, 'essai-contention@example.invalid')));
    const r = await Promise.all(lots);
    const lignes = await sbGet('leads?select=id&idempotency_key=eq.' + encodeURIComponent(k));
    const journal = await sbGet('zz_essai_notifications?select=lead_id');
    const codes = {};
    for (const x of r) {
      const c = x.statut + (x.rejeu ? '/rejeu' : '');
      codes[c] = (codes[c] || 0) + 1;
      if (x.statut >= 500) cinqCents += 1;
      else if (x.statut !== 200) autres.push(x.statut);
    }
    if (lignes.length !== 1) doublons += 1;
    tours.push({ tour: t, lignes: lignes.length, journal: journal.length, codes: codes });
    await purge();
  }
  console.log('L — contention sur l index : ' + TOURS + ' tours de ' + PAR + ' appels simultanes, meme cle');
  for (const t of tours) console.log('   tour ' + t.tour + ' : ' + t.lignes + ' ligne, ' + t.journal + ' entrees de journal, reponses ' + JSON.stringify(t.codes));
  console.log('   tours avec doublon : ' + doublons + ' / ' + TOURS + '   reponses 5xx : ' + cinqCents + '   autres codes : ' + JSON.stringify(autres));
  console.log('');

  /* M — notification NON livrée. Modélise un appel pg_net parti après le
     commit et tombé en erreur (cf. net._http_response). */
  await purge();
  await mode('echec_confirmation');
  const KM = 'livraison-ABCDEFGHIJKLMNOPQRSTUV';
  const m1 = await appel(corps(KM, 'essai-livraison@example.invalid'));
  const jm1 = await sbGet('zz_essai_notifications?select=canal,resultat&order=id.asc');
  const m2 = await appel(corps(KM, 'essai-livraison@example.invalid'));
  const jm2 = await sbGet('zz_essai_notifications?select=canal,resultat&order=id.asc');
  const lm = await sbGet('leads?select=id');
  console.log('M — notification en echec, puis rejeu');
  console.log('   1er appel  : ' + m1.statut + (m1.rejeu ? ' rejeu' : '') + ' ; ' + lm.length + ' ligne ; journal ' + JSON.stringify(jm1));
  console.log('   rejeu      : ' + m2.statut + (m2.rejeu ? ' rejeu' : '') + ' ; journal inchange = ' + String(JSON.stringify(jm1) === JSON.stringify(jm2)));
  console.log('   => la demande est enregistree, la confirmation est perdue, et rien ne la retente.');
  console.log('      Reprise manuelle : docs/REPRISE-NOTIFICATIONS-LEADS.md');
  console.log('');

  /* N — trigger SYNCHRONE qui échoue : l'insertion est annulée. */
  await purge();
  await mode('leve_exception');
  const KN = 'synchrone-ABCDEFGHIJKLMNOPQRSTUV';
  const n1 = await appel(corps(KN, 'essai-synchrone@example.invalid'));
  const ln1 = await sbGet('leads?select=id');
  await mode('normal');
  const n2 = await appel(corps(KN, 'essai-synchrone@example.invalid'));
  const ln2 = await sbGet('leads?select=id,idempotency_key');
  console.log('N — trigger synchrone en erreur (hypothese extension http, pas pg_net)');
  console.log('   1er appel  : ' + n1.statut + ' ; ' + ln1.length + ' ligne (transaction annulee, cle non consommee)');
  console.log('   reessai    : ' + n2.statut + ' ; ' + ln2.length + ' ligne ; cle ' + JSON.stringify(ln2.map((x) => x.idempotency_key)));
  console.log('   => avec un trigger synchrone, un echec de notification annule la demande ;');
  console.log('      le dispositif ne la perd pas, mais il ne la sauve pas non plus.');

  await mode('normal');
  await purge();
})().catch((e) => {
  if (e instanceof garde.RefusEssai) { console.error('\n' + e.message + '\n'); process.exit(2); }
  console.error('ESSAI INTERROMPU :', (e && e.stack) || e);
  process.exit(3);
});
