/* ============================================================
   Vercel Serverless Function — /api/subscribe
   INSERT dans Supabase (table leads) — le trigger notify_new_lead
   gère automatiquement : notification Medy + email de confirmation
   personnalisé au client, et ajout à la liste Brevo 23 SI le consentement
   marketing est donné.

   ── Chemin base, état au 2026-11-11 ──
   Trigger `on_new_lead_notify` sur `public.leads` (AFTER INSERT, FOR EACH ROW,
   sans clause WHEN) → fonction `public.notify_new_lead()`. Cette fonction a été
   corrigée en production : l'ajout à la liste Brevo 23 est désormais encadré par
   la garde `NEW.reponses #>> '{consentement,marketing}' = 'true'`, tandis que la
   notification interne et l'email de confirmation restent inconditionnels.
   L'inscription marketing exige donc le consentement explicite des DEUX côtés :
   ici pour le chemin applicatif, et dans la base pour le chemin trigger.
   Conséquence : une ligne insérée sans `reponses.consentement` (import manuel,
   /api/estimation) n'est pas abonnée. Aucun fichier SQL du dépôt ne définit ce
   trigger : la source de vérité est la base.

   ── Point d'entrée unique des formulaires du site ──
   La clé Supabase reste côté serveur (SUPABASE_SERVICE_KEY) : aucune
   page ne doit plus écrire dans /rest/v1/leads depuis le navigateur.
   Appelants : bilan-patrimonial, les 3 simulateurs, simulation-pret-immobilier,
   index (diagnostic multi-parcours), declaration-rsu-espp-france,
   immobilier/succession-colombes, optimisation-fiscale-ile-de-france.

   ── Variables d'environnement ──
   Indispensables (sans elles, aucun enregistrement — 500) :
     SUPABASE_URL
     SUPABASE_SERVICE_KEY
   Optionnelles (leur absence désactive une fonction, jamais le formulaire) :
     SYSTEME_API_KEY               tags marketing Systeme.io — appelé UNIQUEMENT
                                   si le consentement marketing est explicite
     BREVO_LIST_ID_MARKETING       liste Brevo dédiée aux seuls contacts ayant
                                   coché la case. Absente = aucun appel Brevo
                                   depuis cet endpoint (comportement actuel).
     BREVO_API_KEY                 déjà en place pour d'autres endpoints ; lue
                                   ici uniquement avec BREVO_LIST_ID_MARKETING
     SUBSCRIBE_ALLOWED_ORIGINS     origines autorisées supplémentaires (liste
                                   séparée par des virgules), en plus du domaine
                                   de production et du motif des aperçus Vercel
     SUBSCRIBE_ORIGIN_ENFORCE      'off' désactive le filtre d'origine (secours)
     SUBSCRIBE_TURNSTILE_SECRET            Production : vérifie le jeton captcha
     SUBSCRIBE_TURNSTILE_SECRET_Preview    Preview : idem
     SUBSCRIBE_TURNSTILE_SITE_KEY          clé publique servie par /api/subscribe-config
     SUBSCRIBE_TURNSTILE_SITE_KEY_Preview  idem en Preview

   ── Activation de l'anti-robot, dans cet ordre impératif ──
   1. Déployer ce code : widget absent (pas de clé publique), serveur inerte.
      Les formulaires fonctionnent exactement comme avant.
   2. Créer SUBSCRIBE_TURNSTILE_SITE_KEY : le widget se rend sur les 4 pages et
      joint un `captchaToken`. Le serveur n'a pas de secret, il l'ignore et accepte.
   3. Créer SUBSCRIBE_TURNSTILE_SECRET : la vérification devient obligatoire.
      Les jetons circulent déjà depuis l'étape 2, donc aucune fenêtre de panne.
   ⚠️ Inverser 2 et 3 casse les quatre formulaires : le serveur exigerait un jeton
   que les pages n'envoient pas encore (400 « Vérification anti-robot manquante »).

   ⚠️ Différence assumée avec /api/rsu-request : ici le captcha est
   « fail open ». Tant que le secret Turnstile n'est pas créé, AUCUNE
   vérification n'a lieu et la demande passe : le garde-fou est inerte,
   et le journal le dit à chaque requête concernée (voir turnstileState).
   Ce choix protège des formulaires déjà en production — un fail closed
   les arrêterait tous le jour de la mise en ligne si la variable manque.
   Le filtre d'origine, lui, ne dépend d'aucune variable : il est actif
   par défaut, avec une porte de sortie explicite (SUBSCRIBE_ORIGIN_ENFORCE).
   ============================================================ */

const crypto = require('crypto');

const SYSTEME_API = 'https://api.systeme.io/api/contacts';
const BREVO_CONTACTS_API = 'https://api.brevo.com/v3/contacts';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/* ── Consentement marketing ────────────────────────────────
   Deux finalités distinctes, séparées ici :
   1. Traiter la demande du visiteur — c'est l'objet du formulaire. Aucune case
      n'est requise pour cela, et aucune case ne conditionne la soumission.
   2. Lui adresser des communications marketing — nécessite un consentement
      préalable, libre, spécifique et informé (art. L34-5 CPCE, version en
      vigueur consultée le 2026-11-10 :
      https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042155961).
      L'exception du même article suppose des coordonnées recueillies « à
      l'occasion d'une vente ou d'une prestation de services » : un diagnostic
      rempli sur le site n'en est pas une, elle ne couvre donc pas ces leads.

   Le LIBELLÉ EXACT est tenu ici, côté serveur, et c'est lui qui est enregistré
   comme preuve : le navigateur ne transmet que la version et la réponse, il ne
   peut donc pas falsifier le texte consenti. Un test vérifie que le libellé des
   quatre pages est identique, caractère par caractère, à celui de la version
   courante ci-dessous. Toute reformulation = nouvelle version. */
const CONSENT_VERSION = 'marketing-consent-v1';
const CONSENT_TEXTS = {
  'marketing-consent-v1':
    "J'accepte de recevoir par email les informations et invitations de Proactifs Conseils. Facultatif, désinscription en un clic à tout moment.",
};

const TAG_MAP = {
  impots:       'reduction-impots',
  immo:         'investissement-immobilier',
  retraite:     'preparation-retraite',
  epargne:      'placement-epargne',
  transmission: 'transmission-patrimoine',
  cession:      'cession-entreprise',
  credit:       'credit-immobilier',
  declaration:  'declaration-impots',
  actionnariat: 'actionnariat-salarie',
  rsu:          'actionnariat-salarie',
  succession:   'succession-immobiliere',
};

const LABEL_MAP = {
  impots:       'Réduire mes impôts',
  immo:         'Investissement immobilier',
  retraite:     'Préparer ma retraite',
  epargne:      'Placer mon épargne',
  transmission: 'Transmettre à mes proches',
  cession:      'Céder mon entreprise',
  credit:       'Obtenir un crédit',
  declaration:  'Déclarer mes impôts',
  actionnariat: 'Optimiser mes RSU / stock-options',
  rsu:          'Optimiser mes RSU / stock-options',
  succession:   'Succession immobilière',
};

/* ── Origines ──────────────────────────────────────────────
   Jamais d'hôte d'aperçu Vercel codé en dur : un motif couvre toutes
   les adresses du projet. */
const ALLOWED_ORIGINS = [
  'https://proactifsconseils.fr',
  'https://www.proactifsconseils.fr',
];
const PREVIEW_ORIGIN_RE = /^https:\/\/proactifs-conseils-[a-z0-9-]+\.vercel\.app$/;

function extraOrigins(env) {
  return String(env.SUBSCRIBE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, env = {}) {
  if (!origin) return true; // requête sans en-tête Origin (appel serveur à serveur, curl)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (extraOrigins(env).includes(origin)) return true;
  return PREVIEW_ORIGIN_RE.test(origin);
}

function originEnforced(env = {}) {
  return String(env.SUBSCRIBE_ORIGIN_ENFORCE || 'on').trim().toLowerCase() !== 'off';
}

/* ── Captcha (inerte sans configuration) ───────────────────
   Retourne l'état du garde-fou et, le cas échéant, le NOM de la variable
   retenue — jamais sa valeur. Même principe que brevoKey() de rsu-request. */
const TURNSTILE_SECRET_VARS = {
  production: 'SUBSCRIBE_TURNSTILE_SECRET',
  preview: 'SUBSCRIBE_TURNSTILE_SECRET_Preview',
};

function turnstileState(env = {}) {
  const name = Object.prototype.hasOwnProperty.call(TURNSTILE_SECRET_VARS, env.VERCEL_ENV)
    ? TURNSTILE_SECRET_VARS[env.VERCEL_ENV]
    : TURNSTILE_SECRET_VARS.production;
  const secret = String(env[name] || '').trim();
  if (!secret) return { active: false, source: name, reason: 'variable_absente' };
  return { active: true, source: name, secret };
}

/* ── Validation ────────────────────────────────────────────
   Rejette, ne tronque jamais : une saisie trop longue ne doit pas être
   enregistrée sous une forme différente de celle du visiteur. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[0-9+()\s.-]{6,30}$/;
const LIMITS = {
  prenom: 80,
  nom: 80,
  email: 160,
  tel: 30,
  situation: 240,
  preoccupation: 240,
  source: 120,
  service: 40,
};
const MAX_REPONSES_CHARS = 8000;
const MAX_REPONSES_KEYS = 40;

// Sources métier acceptées. Une valeur hors liste n'est pas une faute du
// visiteur : on retombe sur la source par défaut et on le journalise, plutôt
// que de refuser un lead réel.
const KNOWN_SOURCES = [
  'Quiz bilan patrimonial',
  'Quiz Fiscalité',
  'Quiz Crédit',
  'Quiz Retraite',
  'Quiz Immobilier',
  'Quiz Épargne',
  'Quiz Transmission',
  'Quiz Cession entreprise',
  'Quiz Déclaration impôts',
  'Quiz Actionnariat salarié',
  'Quiz Homepage',
  'Page Déclaration RSU - Diagnostic actionnariat',
  'Diagnostic Succession 360',
];
const DEFAULT_SOURCE = 'Quiz bilan patrimonial';

// `reponses` : objet plat de valeurs lisibles. Les clés sont normalisées, les
// valeurs sérialisées en texte ou objet simple. Aucun champ métier n'est perdu.
function sanitizeReponses(value) {
  if (value === undefined || value === null) return { data: {} };
  if (typeof value !== 'object' || Array.isArray(value)) return { error: 'Champ reponses invalide.' };
  const keys = Object.keys(value);
  if (keys.length > MAX_REPONSES_KEYS) return { error: 'Champ reponses trop volumineux.' };
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_) {
    return { error: 'Champ reponses invalide.' };
  }
  if (serialized.length > MAX_REPONSES_CHARS) return { error: 'Champ reponses trop volumineux.' };
  return { data: value };
}

function validate(body, context = {}) {
  const raw = (k) => String(body[k] ?? '').trim();
  const prenom = raw('prenom');
  const nom = raw('nom');
  const email = raw('email').toLowerCase();
  const tel = raw('tel');
  const situation = raw('situation');
  const service = raw('service');
  const preoccupationIn = raw('preoccupation');
  const sourceIn = raw('source');

  // Champ piège : rempli uniquement par un automate. Absent des pages, donc
  // sans effet tant qu'il n'est pas transmis.
  if (raw('hp')) return { error: 'Requête refusée.' };

  if (!prenom || !email || !service) return { error: 'Champs manquants', status: 400 };
  if (prenom.length > LIMITS.prenom) return { error: 'Prénom trop long.' };
  if (nom.length > LIMITS.nom) return { error: 'Nom trop long.' };
  if (email.length > LIMITS.email || !EMAIL_RE.test(email)) return { error: 'Adresse email invalide.' };
  if (tel && (tel.length > LIMITS.tel || !TEL_RE.test(tel))) return { error: 'Numéro de téléphone invalide.' };
  if (situation.length > LIMITS.situation) return { error: 'Champ situation trop long.' };
  if (preoccupationIn.length > LIMITS.preoccupation) return { error: 'Champ preoccupation trop long.' };
  if (service.length > LIMITS.service) return { error: 'Champ service invalide.' };
  if (sourceIn.length > LIMITS.source) return { error: 'Champ source trop long.' };

  const reponses = sanitizeReponses(body.reponses);
  if (reponses.error) return { error: reponses.error };

  const answers = Array.isArray(body.answers) ? body.answers : [];

  let source = DEFAULT_SOURCE;
  let sourceFallback = null;
  if (sourceIn) {
    if (KNOWN_SOURCES.includes(sourceIn)) source = sourceIn;
    else sourceFallback = true;
  }

  // Preuve de consentement : réponse, version, libellé exact (côté serveur),
  // horodatage et origine. Jamais bloquante : une case non cochée donne
  // `marketing: false` et la demande est traitée normalement.
  const versionIn = raw('consentVersion');
  const version = Object.prototype.hasOwnProperty.call(CONSENT_TEXTS, versionIn) ? versionIn : CONSENT_VERSION;
  // `recueilli` distingue « la case a été présentée au visiteur » de « aucune
  // case n'existait sur ce formulaire ». Sans cette nuance, un appelant
  // historique apparaîtrait comme un refus, ce qui serait faux.
  const recueilli = Object.prototype.hasOwnProperty.call(body, 'consentMarketing')
    || Object.prototype.hasOwnProperty.call(body, 'consentVersion');
  const consentement = {
    marketing: recueilli && body.consentMarketing === true,
    recueilli,
    version,
    libelle: recueilli ? CONSENT_TEXTS[version] : null,
    horodatage: new Date().toISOString(),
    origine: { source, hote: String(context.hote || '') || null },
  };

  return {
    data: {
      prenom,
      nom,
      email,
      telephone: tel || null,
      source,
      situation: situation || null,
      preoccupation: preoccupationIn || LABEL_MAP[service] || service,
      // Forme historique conservée (service_code + answers), enrichie des
      // réponses détaillées propres à chaque page. `consentement` est ajouté en
      // dernier : le navigateur ne peut pas l'écraser via `reponses`.
      reponses: Object.assign({ service_code: service, answers }, reponses.data, { consentement }),
      // `statut` est décidé ici, jamais par le navigateur.
      statut: 'nouveau',
    },
    service,
    sourceFallback,
    consentMarketing: consentement.marketing,
    consentRecueilli: consentement.recueilli,
  };
}

/* ── Idempotence ───────────────────────────────────────────
   Problème traité : rien n'empêchait deux POST identiques de créer deux lignes
   dans `leads`. La garde de réentrance des pages ne protège que le navigateur
   qui l'exécute — un onglet dupliqué, un rejeu réseau ou un script passent au
   travers. Et chaque ligne insérée déclenche le trigger `on_new_lead_notify`,
   donc une notification interne ET un email de confirmation au visiteur : un
   doublon n'est pas qu'une ligne de trop, c'est un second email reçu.

   Dispositif retenu : une clé fournie par le NAVIGATEUR, unique par demande
   logique (voir assets/js/idempotence.js), et une contrainte d'unicité en base.
   Ce n'est pas une déduplication sur l'email : une même personne peut faire
   autant de demandes légitimes qu'elle veut, chacune avec sa propre clé.

   Atomicité : tenue par l'index unique `leads_idempotency_key_uniq`, pas par
   une lecture préalable côté application. Une seule instruction SQL est émise
   (INSERT … ON CONFLICT DO NOTHING, via `resolution=ignore-duplicates`). Deux
   requêtes simultanées portant la même clé sont sérialisées par l'index : une
   insère, l'autre n'insère rien. Un « SELECT puis INSERT » applicatif aurait
   laissé la fenêtre de course grande ouverte.

   Effets de bord : le trigger est AFTER INSERT FOR EACH ROW. Aucune ligne
   insérée = aucun déclenchement, donc aucun email rejoué. Les appels marketing
   applicatifs (Systeme.io, Brevo) sont, eux, court-circuités par le retour
   anticipé du chemin « rejeu ».

   ⚠️ Ce dispositif supprime le DOUBLON. Il ne garantit RIEN sur la livraison.
   Deux conséquences, mesurées le 2026-11-22 sur une reproduction de `leads` :
     - si un canal de notification échoue après l'insertion, la demande reste
       enregistrée et la notification est perdue ; le rejeu, qui ne crée pas de
       ligne, ne la retente pas. Même chose pour Systeme.io et Brevo : un échec
       au premier appel n'est jamais repris, puisque le chemin « rejeu » saute
       ces appels. Un échec de notification demande donc toujours une reprise
       manuelle ;
     - si le trigger devenait SYNCHRONE (extension `http` au lieu de pg_net),
       son échec annulerait l'insertion : réponse 500, aucune ligne, clé non
       consommée — un réessai enregistrerait normalement. Le dispositif ne perd
       pas la demande, mais ne la sauve pas non plus.
   pg_net, lui, n'émet la requête qu'après le commit (« HTTP requests are not
   started until the transaction is committed », supabase.com/docs/guides/
   database/extensions/pg_net, relu le 2026-11-22), donc un échec d'envoi ne
   peut pas annuler la ligne : il se lit dans net._http_response, et nulle part
   ailleurs. Le corps réel de public.notify_new_lead() n'est défini par aucun
   fichier du dépôt et n'est pas lisible d'ici : laquelle des deux formes est en
   production reste à vérifier.

   Même clé, contenu identique  → 200 { success: true, rejeu: true }, 0 ligne.
   Même clé, contenu différent  → 409. La demande initiale n'est jamais écrasée
                                  (pas de `merge-duplicates`, aucun UPDATE).
   Aucune clé transmise         → comportement historique, strictement inchangé.

   L'empreinte est calculée ICI, jamais reçue du navigateur : un client fautif
   ne peut pas faire passer un contenu différent pour un rejeu. Le navigateur
   calcule de son côté une empreinte à lui, qui ne sert qu'à décider s'il
   réutilise sa clé ; les deux ne se parlent pas et n'ont pas à concorder.

   ── Articulation avec le jeton Turnstile, et cas réellement couverts ──
   Le captcha est vérifié AVANT l'écriture. Un rejeu doit donc présenter un
   jeton frais : les pages en régénèrent un à chaque tentative, et c'est
   pourquoi le jeton est exclu de l'empreinte calculée côté navigateur.
   Mesuré le 2026-11-22 contre challenges.cloudflare.com avec les clés d'essai
   publiées par Cloudflare (dont le secret 3x…AA, « token already spent ») :
     - même clé + jeton FRAIS            → 200 { rejeu: true }, aucune ligne ;
     - même clé + jeton DÉJÀ CONSOMMÉ    → 403 au captcha, AVANT l'idempotence.
   Ce qui est donc couvert : la nouvelle tentative lancée par la page (nouveau
   jeton, même clé), le rechargement suivi d'une saisie identique, l'onglet
   dupliqué, deux requêtes simultanées. Ce qui ne l'est pas : un POST rejoué
   tel quel par un outil ou un script, qui est refusé au captcha et non
   dédupliqué ; une nouvelle session (onglet neuf, navigateur relancé, autre
   appareil), qui reçoit une clé neuve ; un navigateur sans sessionStorage, qui
   n'en réutilise aucune. Les pages envoient par fetch, pas par soumission de
   <form> : il n'y a donc pas de ré-émission de POST au rechargement.

   ── Ordre de déploiement, impératif ──
   La variable SUBSCRIBE_IDEMPOTENCY commande tout. Tant qu'elle ne vaut pas
   'on', la clé reçue est ignorée et aucune colonne nouvelle n'est écrite :
   1. Déployer ce code. Rien ne change, même si la base n'a pas les colonnes.
   2. Appliquer migration-leads-idempotence.sql.
   3. Créer SUBSCRIBE_IDEMPOTENCY=on, PUIS redéployer.
   Inverser 2 et 3 casse les dix formulaires : PostgREST refuserait l'insertion
   (PGRST204, colonne inconnue) et toute demande échouerait.

   ⚠️ Sur Vercel, un changement de variable n'atteint PAS le déploiement en
   cours : « Changes to environment variables are not applied to previous
   deployments […] You must redeploy your project » et, au dépannage, « A change
   in the dashboard has no effect → Redeploy the project »
   (vercel.com/docs/environment-variables/managing-environment-variables et
   /environment-variables, pages relues le 2026-11-22). Créer ou retirer la
   variable demande donc un redéploiement. Deux retours arrière :
     - immédiat : Instant Rollback vers le déploiement précédent, construit
       sans la variable, donc sans le dispositif ;
     - ordinaire : retirer SUBSCRIBE_IDEMPOTENCY, puis redéployer.
   La base n'est touchée dans aucun des deux cas.
   La même réserve vaut pour les étapes 2 et 3 de l'activation Turnstile plus
   haut, écrites avant cette vérification. */
const IDEM_VAR = 'SUBSCRIBE_IDEMPOTENCY';
// Longueur et alphabet de l'UUID v4 sans tirets jusqu'aux identifiants plus
// longs : assez large pour ne pas contraindre le client, assez étroit pour
// qu'une valeur fantaisiste soit refusée plutôt qu'insérée.
const IDEM_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

function idempotenceState(env = {}) {
  const brut = String(env[IDEM_VAR] || '').trim().toLowerCase();
  if (brut === 'on') return { active: true, source: IDEM_VAR };
  return { active: false, source: IDEM_VAR, reason: brut ? 'valeur_' + brut : 'variable_absente' };
}

/* JSON à clés triées : deux objets de même contenu donnent le même texte,
   quel que soit l'ordre d'insertion des propriétés. */
function canonique(valeur) {
  if (valeur === undefined) return 'null';
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur);
  if (Array.isArray(valeur)) return '[' + valeur.map(canonique).join(',') + ']';
  return '{' + Object.keys(valeur).sort()
    .map((k) => JSON.stringify(k) + ':' + canonique(valeur[k]))
    .join(',') + '}';
}

/* Empreinte du contenu de la demande. `consentement.horodatage` est posé par
   le serveur à chaque appel : laissé dedans, il ferait de tout rejeu un
   conflit. Tout le reste de l'enregistrement dérive de ce que le visiteur a
   soumis, donc entre dans l'empreinte. */
function empreinteCharge(record) {
  let copie;
  try {
    copie = JSON.parse(JSON.stringify(record));
  } catch (_) {
    return null;
  }
  if (copie && copie.reponses && copie.reponses.consentement) {
    delete copie.reponses.consentement.horodatage;
  }
  return crypto.createHash('sha256').update(canonique(copie)).digest('hex');
}

/* Point d'écriture unique dans `leads`, partagé avec /api/subscribe-guide.
   Retourne l'issue, ne décide d'aucun code HTTP : c'est l'affaire de
   l'appelant, qui sait quel message afficher. */
async function insererLead({ supabaseUrl, supabaseKey, record, cle, empreinte }) {
  const enTetes = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  if (!cle) {
    const r = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: Object.assign({}, enTetes, { 'Prefer': 'return=minimal' }),
      body: JSON.stringify(record),
    });
    if (!r.ok) return { etat: 'erreur', statut: r.status, detail: await r.text() };
    return { etat: 'insere' };
  }

  const corps = Object.assign({}, record, {
    idempotency_key: cle,
    payload_fingerprint: empreinte,
  });
  // `select=id` : la représentation renvoyée se limite à l'identifiant, aucune
  // donnée personnelle ne revient dans le processus pour rien.
  const r = await fetch(`${supabaseUrl}/rest/v1/leads?on_conflict=idempotency_key&select=id`, {
    method: 'POST',
    headers: Object.assign({}, enTetes, {
      'Prefer': 'resolution=ignore-duplicates,return=representation',
    }),
    body: JSON.stringify(corps),
  });
  if (!r.ok) return { etat: 'erreur', statut: r.status, detail: await r.text() };

  let lignes = null;
  try { lignes = await r.json(); } catch (_) { lignes = null; }
  // Une ligne renvoyée = insertion réelle. Tableau vide = conflit ignoré : la
  // clé existait déjà, rien n'a été créé, aucun trigger n'a été déclenché.
  if (Array.isArray(lignes) && lignes.length > 0) return { etat: 'insere' };

  const relecture = await fetch(
    `${supabaseUrl}/rest/v1/leads?idempotency_key=eq.${encodeURIComponent(cle)}` +
    '&select=payload_fingerprint&limit=1',
    { headers: enTetes }
  );
  if (!relecture.ok) return { etat: 'erreur', statut: relecture.status, detail: await relecture.text() };
  let existant = null;
  try {
    const j = await relecture.json();
    existant = Array.isArray(j) && j.length ? j[0] : null;
  } catch (_) { existant = null; }
  // Conflit annoncé mais ligne introuvable : état incohérent, traité comme une
  // erreur plutôt que comme un succès silencieux.
  if (!existant) return { etat: 'erreur', statut: 500, detail: 'conflit sans ligne correspondante' };
  if (String(existant.payload_fingerprint || '') !== String(empreinte || '')) return { etat: 'conflit' };
  return { etat: 'rejeu' };
}

// Action déclarée par le widget des pages (voir api/subscribe-config.js et
// assets/js/subscribe-captcha.js). Vérifiée quand Cloudflare la renvoie : un
// jeton obtenu sur un autre widget du compte ne peut pas être rejoué ici.
const TURNSTILE_ACTION = 'subscribe_form';

async function verifyCaptcha(token, secret, remoteIp) {
  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  if (remoteIp) params.append('remoteip', remoteIp);
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!r.ok) return { ok: false, reason: 'http_' + r.status };
    const j = await r.json();
    if (!j || j.success !== true) return { ok: false, reason: 'jeton_refuse' };
    // `action` n'est renvoyée que si le widget l'a déclarée : on ne refuse que
    // sur une valeur présente et différente, jamais sur une absence.
    if (j.action && j.action !== TURNSTILE_ACTION) return { ok: false, reason: 'action_inattendue' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'reseau' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const handler = async (req, res) => {
  const env = process.env;
  const origin = req.headers && (req.headers.origin || req.headers.Origin);
  const allowed = isAllowedOrigin(origin, env);

  res.setHeader('Access-Control-Allow-Origin', allowed && origin ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!allowed) {
    if (originEnforced(env)) {
      console.warn('subscribe: origine refusée', { origin });
      return res.status(403).json({ error: 'Origine non autorisée' });
    }
    console.warn('subscribe: filtre d\'origine inactif (SUBSCRIBE_ORIGIN_ENFORCE=off)', { origin });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const systemeKey  = env.SYSTEME_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const body = req.body || {};
  let hote = null;
  try { hote = origin ? new URL(String(origin)).host : null; } catch (_) { hote = null; }
  const checked = validate(body, { hote });
  if (checked.error) {
    return res.status(checked.status || 400).json({ error: checked.error });
  }
  if (checked.sourceFallback) {
    console.warn('subscribe: source inconnue, valeur par défaut appliquée', { service: checked.service });
  }

  // ── Captcha : vérifié seulement si le secret existe ────────
  const captcha = turnstileState(env);
  if (captcha.active) {
    const token = String(body.captchaToken || '').trim();
    if (!token) {
      console.warn('subscribe: jeton captcha absent', { variable: captcha.source });
      return res.status(400).json({ error: 'Vérification anti-robot manquante.' });
    }
    const verdict = await verifyCaptcha(token, captcha.secret, req.headers && req.headers['x-forwarded-for']);
    if (!verdict.ok) {
      console.warn('subscribe: captcha refusé', { variable: captcha.source, raison: verdict.reason });
      return res.status(403).json({ error: 'Vérification anti-robot échouée.' });
    }
  } else {
    console.warn('subscribe: garde-fou captcha INACTIF', { variable: captcha.source, raison: captcha.reason });
  }

  const record  = checked.data;
  const service = checked.service;
  const tagName = TAG_MAP[service] || 'site-web';

  /* ── Clé d'idempotence, si le dispositif est activé ─────────
     Une clé absente n'est pas une faute : les appelants historiques et les
     navigateurs sans sessionStorage n'en envoient pas, et leur demande doit
     passer comme avant. Une clé MALFORMÉE, en revanche, est refusée : elle ne
     peut venir que d'un client fautif, et l'insérer telle quelle donnerait une
     protection illusoire. */
  const idem = idempotenceState(env);
  let cleIdem = null;
  let empreinte = null;
  if (idem.active) {
    const brut = String(body.idempotencyKey || '').trim();
    if (brut) {
      if (!IDEM_KEY_RE.test(brut)) {
        console.warn('subscribe: cle d\'idempotence malformee', { longueur: brut.length });
        return res.status(400).json({ error: 'Requête refusée.' });
      }
      cleIdem = brut;
      empreinte = empreinteCharge(record);
    }
  } else if (String(body.idempotencyKey || '').trim()) {
    console.warn('subscribe: cle d\'idempotence recue mais dispositif inactif', {
      variable: idem.source, raison: idem.reason,
    });
  }

  // ── 1. INSERT dans Supabase (table leads) ──────────────────
  let issue;
  try {
    issue = await insererLead({ supabaseUrl, supabaseKey, record, cle: cleIdem, empreinte });
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
  if (issue.etat === 'erreur') {
    console.error('Supabase INSERT error:', issue.statut, issue.detail);
    return res.status(500).json({ error: 'Erreur enregistrement' });
  }
  if (issue.etat === 'conflit') {
    // Même clé, contenu différent. La demande déjà enregistrée reste intacte.
    console.warn('subscribe: cle d\'idempotence reutilisee avec un contenu different', {
      source: record.source,
    });
    return res.status(409).json({ error: 'Cette demande a déjà été enregistrée. Rechargez la page pour en adresser une nouvelle.' });
  }
  if (issue.etat === 'rejeu') {
    /* Rejeu reconnu : la demande était déjà en base. Retour en succès — pour le
       visiteur, sa demande EST enregistrée, et lui montrer une erreur le
       pousserait à réessayer sans fin. Aucune ligne créée, donc aucun email de
       confirmation rejoué par le trigger ; et ce retour anticipé saute les
       appels marketing plus bas, qui ne doivent pas repartir non plus. */
    console.warn('subscribe: rejeu reconnu, aucune ligne creee, aucun effet de bord rejoue', {
      source: record.source,
    });
    return res.status(200).json({ success: true, rejeu: true });
  }

  /* ── 2. Systeme.io (tags marketing) ─────────────────────────
     Systeme.io alimente, via /api/webhook-systemeio, une liste Brevo de
     diffusion : c'est un traitement de PROSPECTION. Il n'a donc lieu que si le
     visiteur a coché la case facultative. Sans consentement, la demande est
     enregistrée et traitée, mais aucun abonnement marketing n'est déclenché
     par le code applicatif.
     Le chemin base est protégé de son côté : depuis le 2026-11-11, le trigger
     `on_new_lead_notify` n'ajoute à la liste Brevo 23 que si
     `reponses.consentement.marketing` vaut vrai (voir l'en-tête de ce fichier). */
  /* Règle unique depuis le 2026-11-10 : AUCUNE inscription marketing sans
     consentement explicite. Un refus comme une absence de case donnent le même
     résultat — rien ne part. Les huit formulaires du site transmettent
     désormais l'état de la case ; un appelant qui ne le ferait pas verrait
     simplement sa demande traitée sans aucun abonnement, et le journal le dit. */
  const marketingAutorise = checked.consentMarketing === true;
  if (!marketingAutorise) {
    console.warn('subscribe: aucune inscription marketing (consentement absent ou refusé)', {
      source: record.source,
      recueilli: checked.consentRecueilli,
      version_consentement: record.reponses.consentement.version,
    });
  }
  if (systemeKey && marketingAutorise) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: record.email,
          firstName: record.prenom,
          tags: [{ name: tagName }, { name: 'wizard-site' }],
        }),
      });
    } catch (e) { console.warn('Systeme.io error:', e.message); }
  }

  /* ── 3. Abonnement marketing explicite, liste Brevo dédiée ──
     Inerte par défaut : rien ne part tant que BREVO_LIST_ID_MARKETING n'existe
     pas. Dès qu'elle est créée, les seuls contacts transmis sont ceux qui ont
     coché la case — jamais les appelants historiques (consentement non recueilli).
     Objectif : donner une liste de diffusion dont TOUS les membres ont consenti,
     distincte de la liste 23 alimentée par le trigger de la base.
     Un échec ici ne bloque jamais l'enregistrement de la demande. */
  const brevoKeyName = 'BREVO_API_KEY';
  const brevoKey = String(env[brevoKeyName] || '').trim();
  const marketingList = parseInt(String(env.BREVO_LIST_ID_MARKETING || '').trim(), 10);
  if (checked.consentMarketing) {
    if (!brevoKey || !Number.isInteger(marketingList) || marketingList <= 0) {
      console.warn('subscribe: abonnement marketing consenti mais liste dédiée non configurée', {
        variables_attendues: [brevoKeyName, 'BREVO_LIST_ID_MARKETING'],
        cle_presente: Boolean(brevoKey),
      });
    } else {
      try {
        const r = await fetch(BREVO_CONTACTS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, accept: 'application/json' },
          body: JSON.stringify({
            email: record.email,
            attributes: {
              PRENOM: record.prenom,
              NOM: record.nom || '',
              SOURCE: record.source,
              CONSENT_VERSION: record.reponses.consentement.version,
              CONSENT_DATE: record.reponses.consentement.horodatage,
            },
            listIds: [marketingList],
            updateEnabled: true,
          }),
        });
        if (!r.ok) console.warn('subscribe: Brevo a refusé l\'abonnement marketing', { statut: r.status, variable: brevoKeyName });
      } catch (e) { console.warn('subscribe: abonnement marketing injoignable', { raison: e.message }); }
    }
  }

  return res.status(200).json({ success: true });
};

module.exports = handler;
// Exposé pour les tests unitaires (aucun appel réseau déclenché à l'import).
module.exports.__internals = {
  ALLOWED_ORIGINS,
  PREVIEW_ORIGIN_RE,
  KNOWN_SOURCES,
  DEFAULT_SOURCE,
  LIMITS,
  TURNSTILE_ACTION,
  CONSENT_VERSION,
  CONSENT_TEXTS,
  TAG_MAP,
  LABEL_MAP,
  IDEM_VAR,
  IDEM_KEY_RE,
  isAllowedOrigin,
  originEnforced,
  turnstileState,
  // Partagés avec /api/subscribe-guide : une seule définition de la clé
  // d'idempotence, de l'empreinte et du point d'écriture dans `leads`.
  idempotenceState,
  canonique,
  empreinteCharge,
  insererLead,
  // Partagé avec /api/subscribe-guide : une seule implémentation de la
  // vérification Cloudflare, un seul secret, une seule action.
  verifyCaptcha,
  sanitizeReponses,
  validate,
};
