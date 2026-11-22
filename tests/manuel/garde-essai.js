'use strict';
/* ============================================================
   Garde-fous des bancs d'essai manuels

   Ces bancs ÉCRIVENT et SUPPRIMENT des lignes. Lancés par erreur sur la base
   de production, ils détruiraient des demandes de clients. Ce module existe
   pour que cela soit impossible sans démonter plusieurs verrous à la main.

   Aucun secret ici : ni URL, ni clé. Tout vient de l'environnement.

   Les sept verrous, dans l'ordre :
     1. ESSAI_SB_URL et ESSAI_SB_KEY doivent être fournies.
     2. l'URL doit être une URL de projet Supabase (<ref>.supabase.co), rien
        d'autre — pas de proxy, pas de localhost, pas de chemin.
     3. la référence de production est refusée SANS condition. Aucune variable
        ne lève ce refus.
     4. toute référence autre que le projet TEST connu est refusée, sauf si
        ESSAI_REF_ATTENDUE vaut exactement cette référence (le verrou 3 reste).
     5. ESSAI_CONFIRME doit valoir « oui-reproduction-jetable ».
     6. la clé doit être une clé publique (anon / publishable). Une clé de
        service est refusée, sauf ESSAI_ROLE_SERVICE=oui — et le banc le
        journalise alors en clair.
     7. la base doit porter la table marqueur zz_essai_notifications, qui
        n'existe que sur la reproduction, et CHAQUE ligne de `leads` doit être
        une donnée réservée à cette recette : une adresse
        essai-<scenario>@example.invalid, écrite par ces bancs. Le suffixe
        .invalid ne suffit pas à désigner une ligne supprimable — une ligne
        .invalid venue d'un autre essai, ou une ligne sans adresse, arrête tout
        aussi sûrement qu'une adresse réelle. C'est le verrou qui protège
        contre la purge, et la purge elle-même ne porte que sur ces lignes.
   ============================================================ */

// Base de production du site. Jamais touchée par un banc d'essai.
const REFS_INTERDITES = ['ullnkylrixdvormohryl'];
// Projet d'essai attendu : crm-proactifs-TEST.
const REF_TEST = 'wzuvyztsohdvarxsixce';
// Table créée par reproduction-leads-TEST.sql, absente partout ailleurs.
const MARQUEUR = 'zz_essai_notifications';
// Au-delà, ce n'est manifestement pas une reproduction jetable.
const MAX_LIGNES = 200;
/* Les adresses que ces bancs écrivent, et les SEULES lignes qu'ils peuvent
   supprimer. Le suffixe .invalid ne vaut pas marqueur : une reproduction du
   CRM, l'essai d'un autre chantier ou une saisie à la main peuvent aussi être
   en .invalid sans appartenir à cette recette. Le marqueur, c'est cette
   convention de nommage, portée par les bancs eux-mêmes. */
const MOTIF_RESERVE = /^essai-[a-z0-9._-]{1,48}@example\.invalid$/;
/* Le même motif, écrit pour PostgREST. Il borne le DELETE : une ligne apparue
   entre le contrôle du décor et la purge ne peut pas être emportée. */
const FILTRE_RESERVES = 'email=ilike.essai-*@example.invalid';

/* Vrai si cette adresse est une donnée réservée à cette recette. */
function estReserve(email) {
  return MOTIF_RESERVE.test(String(email || '').trim().toLowerCase());
}

class RefusEssai extends Error {}

function refuser(raison, remede) {
  const e = new RefusEssai(
    'BANC D\'ESSAI REFUSÉ — ' + raison + (remede ? '\n  → ' + remede : '')
  );
  throw e;
}

/* Rôle porté par la clé, sans jamais afficher la clé.
   Renvoie 'anon', 'service_role', 'publishable', 'secret' ou 'inconnu'. */
function roleDeLaCle(cle) {
  const k = String(cle || '');
  if (k.indexOf('sb_publishable_') === 0) return 'publishable';
  if (k.indexOf('sb_secret_') === 0) return 'secret';
  const parts = k.split('.');
  if (parts.length !== 3) return 'inconnu';
  try {
    const brut = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const charge = JSON.parse(brut);
    return String(charge.role || 'inconnu');
  } catch (_) {
    return 'inconnu';
  }
}

function roleEstPublic(role) {
  return role === 'anon' || role === 'publishable';
}

/* Vérifie l'environnement. Rend { url, cle, ref, role } ou lève. */
function verifierEnvironnement(env) {
  const url = String((env && env.ESSAI_SB_URL) || '').trim().replace(/\/+$/, '');
  const cle = String((env && env.ESSAI_SB_KEY) || '').trim();

  if (!url || !cle) {
    refuser(
      'ESSAI_SB_URL ou ESSAI_SB_KEY manquante.',
      'Voir tests/manuel/README.md. Ne jamais écrire ces valeurs dans un fichier du dépôt.'
    );
  }

  const m = /^https:\/\/([a-z0-9]{15,30})\.supabase\.co$/.exec(url);
  if (!m) {
    refuser(
      'ESSAI_SB_URL n\'est pas une URL de projet Supabase (attendu https://<ref>.supabase.co, sans chemin).',
      'Un proxy, un localhost ou une URL avec chemin pourraient masquer la vraie cible.'
    );
  }
  const ref = m[1];

  if (REFS_INTERDITES.indexOf(ref) !== -1) {
    refuser(
      'la référence « ' + ref + ' » est celle de la PRODUCTION.',
      'Aucune variable ne lève ce refus. Ces bancs suppriment des lignes : ils ne doivent jamais viser la production.'
    );
  }

  if (ref !== REF_TEST) {
    const attendue = String((env && env.ESSAI_REF_ATTENDUE) || '').trim();
    if (attendue !== ref) {
      refuser(
        'référence inconnue « ' + ref + ' » (projet d\'essai attendu : ' + REF_TEST + ').',
        'Si c\'est voulu, relancer avec ESSAI_REF_ATTENDUE=' + ref + ' — après avoir vérifié que cette base est jetable.'
      );
    }
  }

  if (String((env && env.ESSAI_CONFIRME) || '').trim() !== 'oui-reproduction-jetable') {
    refuser(
      'confirmation absente.',
      'Relancer avec ESSAI_CONFIRME=oui-reproduction-jetable. Ces bancs vident `leads` et le journal entre chaque scénario.'
    );
  }

  const role = roleDeLaCle(cle);
  if (!roleEstPublic(role)) {
    if (String((env && env.ESSAI_ROLE_SERVICE) || '').trim() !== 'oui') {
      refuser(
        'la clé porte le rôle « ' + role + ' », qui contourne RLS.',
        'Utiliser la clé anon / publishable du projet d\'essai. Pour éprouver le parcours avec le rôle de service — un des préalables à l\'activation Production — relancer avec ESSAI_ROLE_SERVICE=oui, en sachant que RLS ne protège plus rien.'
      );
    }
    console.warn('[garde] clé de rôle « ' + role + ' » acceptée par ESSAI_ROLE_SERVICE=oui : RLS est contournée.');
  }

  return { url: url, cle: cle, ref: ref, role: role };
}

/* Vérifie que la base visée EST bien la reproduction jetable, et qu'elle ne
   contient aucune adresse réelle. À appeler avant la première purge. */
async function verifierDecor(ctx, fetchReel) {
  const entetes = { apikey: ctx.cle, Authorization: 'Bearer ' + ctx.cle };

  const marqueur = await fetchReel(ctx.url + '/rest/v1/' + MARQUEUR + '?select=id&limit=1', { headers: entetes });
  if (marqueur.status === 404 || marqueur.status === 400) {
    refuser(
      'la table marqueur ' + MARQUEUR + ' est absente : ce n\'est pas la reproduction d\'essai.',
      'Appliquer tests/manuel/reproduction-leads-TEST.sql sur le projet d\'essai, puis la migration du dépôt.'
    );
  }
  if (!marqueur.ok) {
    refuser('lecture de ' + MARQUEUR + ' impossible (HTTP ' + marqueur.status + ').', 'Vérifier la clé et les politiques d\'essai (README).');
  }

  const lecture = await fetchReel(ctx.url + '/rest/v1/leads?select=email&limit=' + (MAX_LIGNES + 1), { headers: entetes });
  if (!lecture.ok) {
    refuser(
      'lecture de `leads` impossible (HTTP ' + lecture.status + ').',
      'Les politiques d\'essai SELECT/DELETE pour anon sont-elles en place ? Voir le bloc « politiques propres à l\'essai » du README.'
    );
  }
  let lignes = [];
  try { lignes = await lecture.json(); } catch (_) { lignes = []; }
  if (!Array.isArray(lignes)) lignes = [];

  if (lignes.length > MAX_LIGNES) {
    refuser(
      '`leads` contient plus de ' + MAX_LIGNES + ' lignes : ce n\'est pas une reproduction jetable.',
      'Arrêt avant toute suppression.'
    );
  }

  /* Classement de CHAQUE ligne. Seules les lignes réservées à cette recette
     sont supprimables ; tout le reste arrête le banc avant la première purge.
     Aucune adresse n'est journalisée : on ne compte que les catégories. */
  let reservees = 0;
  let autresInvalid = 0;
  let sansAdresse = 0;
  let possiblementReelles = 0;
  for (const l of lignes) {
    const e = String((l && l.email) || '').trim().toLowerCase();
    if (e === '') { sansAdresse += 1; continue; }
    if (estReserve(e)) { reservees += 1; continue; }
    if (/\.invalid$/.test(e)) { autresInvalid += 1; continue; }
    possiblementReelles += 1;
  }

  if (possiblementReelles > 0) {
    refuser(
      '`leads` contient ' + possiblementReelles + ' ligne(s) dont l\'adresse n\'est pas en .invalid : elles pourraient être réelles.',
      'Ces bancs purgent la table : ils s\'arrêtent plutôt que de supprimer une demande de client. Si cette base est bien jetable, la vider à la main.'
    );
  }
  if (autresInvalid > 0 || sansAdresse > 0) {
    refuser(
      '`leads` contient ' + (autresInvalid + sansAdresse) + ' ligne(s) qui ne sont pas réservées à cette recette ('
        + autresInvalid + ' adresse(s) en .invalid hors motif, ' + sansAdresse + ' sans adresse).',
      'Le motif réservé est ' + String(MOTIF_RESERVE) + '. Une adresse en .invalid ne suffit pas : ces lignes viennent d\'ailleurs, et ces bancs ne suppriment pas ce qu\'ils n\'ont pas écrit. Les retirer à la main, ou monter un décor neuf.'
    );
  }

  console.log('[garde] projet ' + ctx.ref + ', rôle ' + ctx.role + ', ' + lignes.length + ' ligne(s) dans `leads`, toutes réservées à cette recette. Décor conforme.');
  return { lignes: lignes.length, reservees: reservees };
}

/* Un fetch qui ne laisse sortir QUE les requêtes vers le projet d'essai.
   Tout autre hôte doit être déclaré dans `routes`, sinon l'appel lève : aucun
   service externe ne peut être touché par accident. */
function fetchCloisonne(ctx, fetchReel, routes) {
  const regles = routes || [];
  return async function (url, opts) {
    const u = String(url);
    if (u.indexOf(ctx.url) === 0) return fetchReel(url, opts);
    for (const r of regles) {
      if (u.indexOf(r.hote) !== -1) return r.repondre(url, opts, fetchReel);
    }
    throw new Error('[garde] appel externe non prévu, bloqué : ' + u);
  };
}

/* Pose les variables dont les handlers ont besoin, et rend une fonction qui
   remet l'environnement EXACTEMENT comme il était : valeur d'origine, ou
   absence d'origine. À appeler dans un `finally`, pour qu'un essai interrompu
   ne laisse derrière lui ni URL, ni clé de service, ni drapeau d'idempotence.
   Aucune valeur n'est journalisée : seuls les NOMS des variables le sont. */
function poserEnvironnement(env, valeurs, aSupprimer) {
  const avant = new Map();
  const noter = (nom) => {
    if (!avant.has(nom)) {
      avant.set(nom, Object.prototype.hasOwnProperty.call(env, nom) ? env[nom] : undefined);
    }
  };
  const posees = valeurs || {};
  for (const nom of Object.keys(posees)) { noter(nom); env[nom] = posees[nom]; }
  for (const nom of (aSupprimer || [])) { noter(nom); delete env[nom]; }
  return function restaurer() {
    const noms = [];
    for (const paire of avant) {
      const nom = paire[0];
      const valeur = paire[1];
      if (valeur === undefined) delete env[nom]; else env[nom] = valeur;
      noms.push(nom);
    }
    console.log('[garde] environnement remis en etat : ' + noms.join(', '));
  };
}

module.exports = {
  RefusEssai: RefusEssai,
  REFS_INTERDITES: REFS_INTERDITES,
  REF_TEST: REF_TEST,
  MARQUEUR: MARQUEUR,
  MAX_LIGNES: MAX_LIGNES,
  MOTIF_RESERVE: MOTIF_RESERVE,
  FILTRE_RESERVES: FILTRE_RESERVES,
  estReserve: estReserve,
  poserEnvironnement: poserEnvironnement,
  roleDeLaCle: roleDeLaCle,
  roleEstPublic: roleEstPublic,
  verifierEnvironnement: verifierEnvironnement,
  verifierDecor: verifierDecor,
  fetchCloisonne: fetchCloisonne,
};
