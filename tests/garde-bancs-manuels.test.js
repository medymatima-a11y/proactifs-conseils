'use strict';
/* ============================================================
   Les verrous des bancs manuels, éprouvés sans base ni clé.

   POURQUOI CE FICHIER EXISTE
     Les bancs de `tests/manuel/` suppriment des lignes. Leur garde est donc du
     code de sécurité, et du code de sécurité qui n'est pas testé ne protège
     que sur le papier. Ce fichier-ci est dans la suite automatique : il tourne
     en CI, sans base, sans clé, sans réseau — `verifierDecor` reçoit un faux
     `fetch` et ne sort jamais de la machine.

   CE QU'IL VERROUILLE
     1. une ligne n'est supprimable que si elle est RÉSERVÉE à cette recette ;
        une adresse en .invalid ne suffit pas ;
     2. la purge des deux bancs est bornée au même motif, dans le DELETE comme
        dans le contrôle d'après-purge ;
     3. l'environnement est remis exactement en état, y compris après un échec.
   ============================================================ */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const garde = require('../tests/manuel/garde-essai.js');

const MANUEL = path.resolve(__dirname, 'manuel');
const BANCS = ['essai-postgrest-idempotence.js', 'essai-contention-livraison.js'];

/* Un décor conforme, puis les lignes qu'on lui ajoute dans chaque essai. */
const CTX = { url: 'https://wzuvyztsohdvarxsixce.supabase.co', cle: 'sb_publishable_essai', ref: 'wzuvyztsohdvarxsixce', role: 'publishable' };

function fauxFetch(lignes, options) {
  const o = options || {};
  return async function (url) {
    if (url.indexOf('/' + garde.MARQUEUR) !== -1) {
      return { ok: !o.marqueurAbsent, status: o.marqueurAbsent ? 404 : 200, json: async () => [] };
    }
    if (url.indexOf('/leads') !== -1) {
      return { ok: true, status: 200, json: async () => lignes };
    }
    throw new Error('appel imprévu : ' + url);
  };
}

async function refusSur(lignes) {
  try {
    await garde.verifierDecor(CTX, fauxFetch(lignes));
  } catch (e) {
    assert.ok(e instanceof garde.RefusEssai, 'refus attendu, erreur reçue : ' + e.message);
    return e.message;
  }
  assert.fail('le décor aurait dû être refusé : ' + JSON.stringify(lignes));
}

test('une adresse réservée à cette recette est reconnue, les autres non', () => {
  for (const bonne of [
    'essai-idem@example.invalid',
    'essai-contention@example.invalid',
    'essai-idem-7@example.invalid',
    'ESSAI-Idem@Example.Invalid',
  ]) {
    assert.equal(garde.estReserve(bonne), true, bonne);
  }
  for (const mauvaise of [
    'fiche-test@example.invalid',      // reproduction d'un autre chantier
    'essai-idem@autre.invalid',        // .invalid, mais pas le domaine réservé
    'prospect@example.invalid',        // .invalid, mais pas le préfixe réservé
    'client@gmail.com',                // adresse réelle
    'essai-idem@example.invalid.fr',
    '',
    null,
  ]) {
    assert.equal(garde.estReserve(mauvaise), false, String(mauvaise));
  }
});

test('un décor qui ne contient que des lignes réservées est accepté', async () => {
  const etat = await garde.verifierDecor(CTX, fauxFetch([
    { email: 'essai-idem@example.invalid' },
    { email: 'essai-livraison@example.invalid' },
  ]));
  assert.deepEqual(etat, { lignes: 2, reservees: 2 });
});

test('une adresse qui pourrait être réelle arrête tout avant la purge', async () => {
  const m = await refusSur([{ email: 'essai-idem@example.invalid' }, { email: 'medy@proactifsconseils.fr' }]);
  assert.match(m, /pourraient être réelles/);
});

test('une adresse en .invalid qui n’est pas de cette recette arrête tout aussi', async () => {
  // Le point de la garde : `.invalid` ne vaut pas marqueur. Ces lignes
  // viennent d'ailleurs, et les bancs ne suppriment pas ce qu'ils n'ont pas
  // écrit.
  const m = await refusSur([{ email: 'fiche-test@example.invalid' }]);
  assert.match(m, /ne sont pas réservées à cette recette/);
});

test('une ligne sans adresse arrête tout : rien ne permet de la rattacher', async () => {
  const m = await refusSur([{ email: '' }]);
  assert.match(m, /sans adresse/);
});

test('aucune adresse n’est recopiée dans le message de refus', async () => {
  const m = await refusSur([{ email: 'client.reel@gmail.com' }]);
  assert.equal(m.indexOf('client.reel'), -1);
  assert.equal(m.indexOf('gmail.com'), -1);
});

test('la table marqueur absente arrête tout', async () => {
  try {
    await garde.verifierDecor(CTX, fauxFetch([], { marqueurAbsent: true }));
    assert.fail('refus attendu');
  } catch (e) {
    assert.ok(e instanceof garde.RefusEssai);
    assert.match(e.message, /table marqueur/);
  }
});

test('le filtre de purge PostgREST porte le même motif que le contrôle', () => {
  assert.equal(garde.FILTRE_RESERVES, 'email=ilike.essai-*@example.invalid');
  // Le motif JS et le filtre PostgREST doivent désigner le même ensemble :
  // si l'un bouge sans l'autre, la purge déborde ou ne purge plus rien.
  assert.ok(garde.MOTIF_RESERVE.test('essai-x@example.invalid'));
  assert.ok(garde.FILTRE_RESERVES.indexOf('essai-*@example.invalid') !== -1);
});

test('les deux bancs bornent leur purge de `leads` au motif réservé', () => {
  for (const nom of BANCS) {
    const src = readFileSync(path.join(MANUEL, nom), 'utf8');
    // la cible `leads` passe par le filtre de la garde...
    assert.match(src, /\{ table: 'leads', filtre: garde\.FILTRE_RESERVES \}/, nom);
    // ...et plus aucun DELETE ne vise la table entière.
    assert.equal(/'leads' \+ '\?id=not\.is\.null'/.test(src), false, nom);
    assert.equal(/\['zz_essai_notifications', 'leads'\]/.test(src), false, nom);
  }
});

test('les deux bancs démontent dans un finally, et ne sortent pas avant', () => {
  for (const nom of BANCS) {
    const src = readFileSync(path.join(MANUEL, nom), 'utf8');
    assert.match(src, /\} finally \{/, nom);
    assert.match(src, /restaurerEnv\(\);/, nom);
    // `process.exit` dans le corps sauterait le finally : le code de sortie
    // passe par process.exitCode, et seuls les deux refus du catch sortent
    // directement.
    // Entre l'ouverture du try et le finally : aucune sortie directe, sinon le
    // démontage serait sauté. Le process.exit(2) du haut de fichier (refus de
    // la garde, avant toute écriture) et ceux du catch restent légitimes.
    const debut = src.indexOf('try { // essais');
    const fin = src.indexOf('} finally {');
    assert.ok(debut > 0 && fin > debut, nom);
    assert.equal(/process\.exit\(/.test(src.slice(debut, fin)), false, nom);
    assert.match(src.slice(fin), /process\.exit\(2\)/, nom);
  }
});

test('l’environnement est remis exactement en état, valeurs comme absences', () => {
  const env = { GARDE_A: 'avant', GARDE_C: 'intact' };
  const restaurer = garde.poserEnvironnement(env, { GARDE_A: 'pendant', GARDE_B: 'pose' }, ['GARDE_D', 'GARDE_C']);
  assert.equal(env.GARDE_A, 'pendant');
  assert.equal(env.GARDE_B, 'pose');
  assert.equal('GARDE_C' in env, false);
  // Un essai peut encore changer ces variables en cours de route : la remise
  // en état part de l'état d'AVANT, pas de ce que l'essai a laissé.
  env.GARDE_A = 'change en cours';
  env.GARDE_E = 'hors perimetre';
  restaurer();
  assert.equal(env.GARDE_A, 'avant');
  assert.equal('GARDE_B' in env, false);
  assert.equal(env.GARDE_C, 'intact');
  assert.equal('GARDE_D' in env, false);
  assert.equal(env.GARDE_E, 'hors perimetre');
});

test('la production reste refusée sans condition', () => {
  // Rappel : ce verrou-là n'a pas bougé. Il est testé ici parce que c'est le
  // seul qu'aucune variable ne lève.
  for (const ref of garde.REFS_INTERDITES) {
    assert.throws(
      () => garde.verifierEnvironnement({
        ESSAI_SB_URL: 'https://' + ref + '.supabase.co',
        ESSAI_SB_KEY: 'sb_publishable_x',
        ESSAI_CONFIRME: 'oui-reproduction-jetable',
        ESSAI_REF_ATTENDUE: ref,
      }),
      (e) => e instanceof garde.RefusEssai && /PRODUCTION/.test(e.message)
    );
  }
});
