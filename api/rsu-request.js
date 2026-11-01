/* ============================================================
   Vercel Serverless Function — /api/rsu-request
   Réception dédiée des demandes d'analyse RSU/ESPP.

   Garanties :
   - N'écrit JAMAIS dans public.leads.
   - N'appelle NI Brevo NI Systeme.io (aucune inscription marketing).
   - Ne déclenche aucun trigger de la table leads.
   - Écrit uniquement dans la table dédiée rsu_requests (à créer, non créée ici).
   - Cible Supabase contrôlée par checkTarget() (voir plus bas) : production, ou Preview
     uniquement vers le projet TEST exact (RSU_TEST_SUPABASE_REF). Sinon refus, aucune écriture.

   Variables d'environnement (côté serveur uniquement) :
   - SUPABASE_URL                production, base de production (jamais lue en Preview)
   - SUPABASE_SERVICE_KEY        production, clé service (jamais lue en Preview)
   - RSU_TEST_SUPABASE_URL       Preview uniquement : URL du projet TEST
   - RSU_TEST_SUPABASE_SERVICE_KEY  Preview uniquement : clé service du projet TEST (Sensitive)
   - RSU_TEST_SUPABASE_REF / RSU_PROD_SUPABASE_REF  références attendues (les deux, différentes)
   - RSU_DAILY_CAP          optionnel, nombre max de demandes par jour (défaut 50)
   - RSU_PROD_ENABLED       écritures en PRODUCTION refusées tant que != 'true' (défaut : refus)
   - RSU_TURNSTILE_SECRET   optionnel. Si défini, jeton anti-robot Cloudflare Turnstile obligatoire
                            (champ captchaToken). Non défini = contrôle inactif, aucun appel externe.

   Notification du cabinet : email transactionnel interne, via une clé DÉDIÉE
   (RSU_TX_BREVO_API_KEY), distincte de la clé marketing. Aucun contact créé,
   aucune liste, aucune donnée personnelle dans le message. Inactive tant que
   les variables ne sont pas définies. Un échec de notification ne bloque jamais
   l'enregistrement de la demande.
   ============================================================ */

const TABLE = 'rsu_requests';
const CONSENT_VERSION = 'rsu-consent-v1';
const LIMITS = { nom: [2, 80], email: [5, 160], telephone: [6, 30], commentaire: [0, 600] };
const PER_EMAIL_DAILY_LIMIT = 3;
const DEFAULT_DAILY_CAP = 50;
const MAX_BODY_CHARS = 2000;
const NOTIFY_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'; // transactionnel uniquement (pas /v3/contacts)
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const DISPOSITIFS = ['RSU / actions gratuites', 'ESPP', 'Stock-options', 'Plusieurs dispositifs', 'Autre'];
const BESOINS = ['Comprendre la fiscalité', 'Préparer une vente', 'Déclaration fiscale', 'Mobilité internationale', 'Autre'];
const ECHEANCES = ['Dès que possible', 'Dans les prochaines semaines', "Simple prise d'information"];

const ALLOWED_ORIGINS = [
  'https://proactifsconseils.fr',
  'https://www.proactifsconseils.fr',
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // requêtes same-origin sans en-tête Origin
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/proactifs-conseils-[a-z0-9-]+\.vercel\.app$/.test(origin);
}

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[0-9+()\s.-]{6,30}$/;

// Valide et normalise. Rejette (ne tronque jamais) : une valeur trop longue ne doit pas
// être enregistrée sous une forme différente de celle saisie.
function validate(b) {
  const raw = (k) => String(b[k] ?? '').trim();
  const nom = raw('nom');
  const email = raw('email').toLowerCase();
  const telephone = raw('telephone');
  const dispositif = raw('dispositif');
  const besoin = raw('besoin');
  const echeance = raw('echeance');
  const commentaire = raw('commentaire');

  if (nom.length < LIMITS.nom[0] || nom.length > LIMITS.nom[1]) return { error: `Nom : entre ${LIMITS.nom[0]} et ${LIMITS.nom[1]} caractères.` };
  if (email.length > LIMITS.email[1] || !EMAIL_RE.test(email)) return { error: 'Adresse email invalide.' };
  if (telephone && (telephone.length > LIMITS.telephone[1] || !TEL_RE.test(telephone))) return { error: 'Numéro de téléphone invalide.' };
  if (!DISPOSITIFS.includes(dispositif)) return { error: 'Dispositif invalide.' };
  if (!BESOINS.includes(besoin)) return { error: 'Besoin invalide.' };
  if (!ECHEANCES.includes(echeance)) return { error: 'Échéance invalide.' };
  if (commentaire.length > LIMITS.commentaire[1]) return { error: 'Commentaire trop long (600 caractères maximum).' };
  if (b.consent !== true) return { error: 'Consentement requis pour traiter votre demande.' };

  return {
    data: {
      nom,
      email,
      telephone: telephone || null,
      dispositif,
      besoin,
      echeance,
      commentaire: commentaire || null,
      consent_version: CONSENT_VERSION,
      statut: 'nouveau',
    },
  };
}

// Garde-fou de cible Supabase. Fonction pure sur un objet d'environnement.
// - Référence extraite UNIQUEMENT d'une URL stricte https://<ref>.supabase.co (20 caractères a-z0-9),
//   sans chemin, port, identifiants, requête ni sous-domaine supplémentaire.
// - Production : écriture autorisée sauf si la cible est le projet TEST (RSU_TEST_SUPABASE_REF).
// - Preview : écriture autorisée UNIQUEMENT si la référence est exactement RSU_TEST_SUPABASE_REF,
//   et jamais si elle égale RSU_PROD_SUPABASE_REF (second verrou).
// - Tout autre cas (variable absente, invalide, autre environnement) : refus.
const SUPABASE_REF_RE = /^[a-z0-9]{20}$/;
function projectRefFromUrl(u) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(String(u || ''));
  return m ? m[1] : null;
}
// Exigences : les DEUX références présentes, valides et différentes, dans tous les environnements.
// Production : URL et clé lues sur SUPABASE_URL / SUPABASE_SERVICE_KEY. Écriture seulement si la
//   référence est exactement RSU_PROD_SUPABASE_REF et RSU_PROD_ENABLED = 'true'.
// Preview : URL et clé lues UNIQUEMENT sur RSU_TEST_SUPABASE_URL / RSU_TEST_SUPABASE_SERVICE_KEY.
//   Aucun repli vers SUPABASE_URL ni SUPABASE_SERVICE_KEY : si une variable TEST manque, refus.
// Retour : { ok, mode, url, key }. url et key servent uniquement à l'appel serveur, jamais aux logs.
function checkTarget(env) {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') return { ok: false, reason: 'environnement_non_autorise' };
  // Production : refus explicite tant que l'activation n'est pas décidée (variable dédiée).
  if (vercelEnv === 'production' && env.RSU_PROD_ENABLED !== 'true') return { ok: false, reason: 'prod_desactivee' };
  const testRef = String(env.RSU_TEST_SUPABASE_REF || '');
  const prodRef = String(env.RSU_PROD_SUPABASE_REF || '');
  if (!SUPABASE_REF_RE.test(testRef)) return { ok: false, reason: 'ref_test_absente_ou_invalide' };
  if (!SUPABASE_REF_RE.test(prodRef)) return { ok: false, reason: 'ref_prod_absente_ou_invalide' };
  if (testRef === prodRef) return { ok: false, reason: 'refs_identiques' };
  if (vercelEnv === 'production') {
    const ref = projectRefFromUrl(env.SUPABASE_URL);
    if (!ref) return { ok: false, reason: 'supabase_url_invalide' };
    if (ref !== prodRef) return { ok: false, reason: ref === testRef ? 'production_pointe_test' : 'ref_different_de_la_production' };
    if (!env.SUPABASE_SERVICE_KEY) return { ok: false, reason: 'cle_production_absente' };
    return { ok: true, mode: 'production', url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY };
  }
  const ref = projectRefFromUrl(env.RSU_TEST_SUPABASE_URL);
  if (!ref) return { ok: false, reason: 'rsu_test_url_invalide' };
  if (ref !== testRef) return { ok: false, reason: ref === prodRef ? 'preview_pointe_production' : 'ref_different_du_test' };
  if (!env.RSU_TEST_SUPABASE_SERVICE_KEY) return { ok: false, reason: 'rsu_test_cle_absente' };
  return { ok: true, mode: 'preview_test', url: env.RSU_TEST_SUPABASE_URL, key: env.RSU_TEST_SUPABASE_SERVICE_KEY };
}

// Anti-robot serveur (Cloudflare Turnstile). Inactif tant que RSU_TURNSTILE_SECRET n'est pas défini.
// Dès qu'il est défini, un jeton absent ou refusé bloque la demande (fail closed).
async function verifyCaptcha(env, token, ip) {
  const secret = env.RSU_TURNSTILE_SECRET;
  if (!secret) return { ok: true, status: 200, reason: null };
  const response = clean(token, 2048);
  if (!response) return { ok: false, status: 400, reason: 'jeton_absent' };
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response, remoteip: ip || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d && d.success === true) return { ok: true, status: 200, reason: null };
    return { ok: false, status: 400, reason: 'jeton_refuse' };
  } catch (e) {
    return { ok: false, status: 503, reason: 'erreur_reseau' };
  }
}

// Compte les demandes déjà reçues (filtres PostgREST). Renvoie null si le comptage échoue.
async function countRequests(sbUrl, sbKey, filters) {
  try {
    const qs = new URLSearchParams({ select: 'id', ...filters });
    const res = await fetch(`${sbUrl}/rest/v1/${TABLE}?${qs.toString()}`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res.ok) return null;
    const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10);
    return Number.isFinite(total) ? total : null;
  } catch (e) {
    return null;
  }
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Notification interne du cabinet, transactionnelle et sans donnée personnelle.
// Gardée par variables dédiées : RSU_TX_BREVO_API_KEY (clé transactionnelle, à créer)
// et RSU_NOTIFY_TO (adresse interne). Sans elles : aucun envoi, raison renvoyée.
// Jamais de contact créé, jamais de liste (pas de listIds, pas de /v3/contacts).
async function notifyCabinet(record) {
  const apiKey = process.env.RSU_TX_BREVO_API_KEY;
  const to = process.env.RSU_NOTIFY_TO;
  if (!apiKey || !to) return { sent: false, reason: 'non_configure' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const r = await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CRM Proactifs', email: process.env.RSU_NOTIFY_FROM || to },
        to: [{ email: to }],
        subject: 'Nouvelle demande RSU/ESPP à traiter dans le CRM',
        textContent: "Une nouvelle demande d'analyse RSU/ESPP a été reçue. Consultez la rubrique « Demandes RSU/ESPP » du CRM. Ce message ne contient aucune donnée personnelle.",
        tags: ['rsu-notification-interne'],
      }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    return r.ok ? { sent: true } : { sent: false, reason: 'http_' + r.status };
  } catch (e) {
    return { sent: false, reason: 'erreur_reseau' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origine non autorisée' });

  // Garde-fou cible : décision unique, prise sur les variables serveur uniquement
  // (jamais sur le corps, la query ou les en-têtes). Refus par défaut.
  const target = checkTarget(process.env);
  if (!target.ok) {
    console.error('[rsu target refusé]', target.reason); // raison seule, jamais l'URL ni les clés
    if (target.reason === 'environnement_non_autorise') {
      return res.status(503).json({ error: "Environnement de test : aucune demande n'a été enregistrée.", code: 'NON_PRODUCTION_ENV' });
    }
    return res.status(503).json({ error: 'Service temporairement indisponible.', code: 'CONFIG_REFUSEE' });
  }

  const b = req.body || {};
  if (JSON.stringify(b).length > MAX_BODY_CHARS) {
    return res.status(400).json({ error: 'Demande trop volumineuse.' });
  }

  // Anti-robot : champ piège rempli = robot. Réponse neutre, rien n'est enregistré.
  if (clean(b.website)) return res.status(200).json({ success: true });

  const v = validate(b);
  if (v.error) return res.status(400).json({ error: v.error });

  // Anti-robot : contrôlé côté serveur avant tout accès à la base.
  const ip = clean(String(req.headers['x-forwarded-for'] || '').split(',')[0], 64);
  const captcha = await verifyCaptcha(process.env, b.captchaToken, ip);
  if (!captcha.ok) {
    console.error('[rsu captcha refusé]', captcha.reason);
    return res.status(captcha.status).json({ error: 'Vérification anti-robot échouée. Merci de réessayer.', code: 'CAPTCHA' });
  }

  // URL et clé issues de checkTarget() : la même décision valide la cible et les identifiants.
  const sbUrl = target.url;
  const sbKey = target.key;

  // Limites : par email et par jour, puis plafond global. Échec de comptage = refus (fail closed).
  const since = `gte.${startOfTodayIso()}`;
  const perEmail = await countRequests(sbUrl, sbKey, { email: `eq.${v.data.email}`, created_at: since });
  const dailyCap = parseInt(process.env.RSU_DAILY_CAP || DEFAULT_DAILY_CAP, 10);
  const total = await countRequests(sbUrl, sbKey, { created_at: since });
  if (perEmail === null || total === null) {
    return res.status(503).json({ error: 'Service temporairement indisponible. Merci de réessayer ou de nous appeler.' });
  }
  if (perEmail >= PER_EMAIL_DAILY_LIMIT || total >= dailyCap) {
    return res.status(429).json({ error: 'Trop de demandes. Merci de réessayer plus tard ou de nous appeler.' });
  }

  // Insertion dédiée : aucune autre table, aucun trigger leads.
  try {
    const sbRes = await fetch(`${sbUrl}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...v.data, consent_at: new Date().toISOString() }),
    });
    if (!sbRes.ok) {
      console.error('rsu_requests INSERT error:', sbRes.status);
      return res.status(500).json({ error: "Votre demande n'a pas pu être enregistrée." });
    }
  } catch (e) {
    console.error('rsu_requests fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // La demande est enregistrée : une notification en échec ne modifie pas la réponse.
  try {
    const n = await notifyCabinet(v.data);
    if (!n.sent && n.reason !== 'non_configure') console.error('[rsu notify]', n.reason);
  } catch (e) {
    console.error('[rsu notify] erreur inattendue');
  }
  return res.status(200).json({ success: true });
};

module.exports.validate = validate;
module.exports.notifyCabinet = notifyCabinet;
module.exports.checkTarget = checkTarget;
module.exports.verifyCaptcha = verifyCaptcha;
module.exports.projectRefFromUrl = projectRefFromUrl;
