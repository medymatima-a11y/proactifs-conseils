// ============================================================
// Webhook systeme.io → Brevo
//
// ⚠️ FERMÉ PAR DÉFAUT depuis le 2026-11-10.
// Sans SYSTEMEIO_SECRET configuré, toute requête est refusée (401) et aucune
// opération Brevo n'a lieu. L'ancien « mode debug », qui acceptait n'importe
// quelle requête quand la variable était absente, est supprimé : l'endpoint
// crée des contacts dans une liste de diffusion, il ne peut pas être ouvert.
//
// Variables d'environnement :
//   SYSTEMEIO_SECRET  OBLIGATOIRE — sans elle, aucune requête n'est acceptée
//   BREVO_API_KEY     requise pour la synchronisation (lue APRÈS authentification)
//   BREVO_LIST_ID     identifiant de liste (lu APRÈS authentification)
//
// Modes d'authentification acceptés — les quatre sont conservés, car le
// mécanisme réellement disponible côté Systeme.io n'est pas vérifiable depuis
// le code. Ordre de préférence recommandé :
//   1. HMAC-SHA256    X-Webhook-Signature = hex(hmac_sha256(corps, secret))
//                     → le secret ne circule jamais, le corps est authentifié
//   2. En-tête        X-Webhook-Secret: <secret>
//   3. En-tête        X-Systemeio-Signature: <secret>   (alias historique)
//   4. Paramètre      ?secret=<secret>
//                     → le plus universellement supporté par les émetteurs de
//                       webhooks, mais le moins propre : une URL se retrouve
//                       dans les journaux d'accès, les référents et les
//                       historiques. À n'utiliser que si rien d'autre n'est
//                       possible, et à changer si le secret a pu fuiter.
//
// Ordre des contrôles, volontairement strict :
//   méthode → lecture du corps brut (nécessaire au HMAC) → AUTHENTIFICATION
//   → configuration Brevo → données du contact → appel Brevo.
// Un refus sort donc sans avoir lu la configuration Brevo, sans journaliser le
// corps reçu et sans émettre une seule requête réseau.
// ============================================================

const crypto = require('crypto');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Comparaison à durée constante, insensible aux différences de longueur.
function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''), 'utf8');
  const B = Buffer.from(String(b ?? ''), 'utf8');
  if (A.length === 0 || B.length === 0 || A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/* Authentifie la requête. Retourne { ok: true, mode } ou { ok: false, raison }.
   `raison` sert UNIQUEMENT au journal serveur : la réponse renvoyée au client
   est identique dans tous les cas de refus, pour ne pas révéler si le secret
   est configuré ni quel mode est attendu. */
function authenticate(req, rawBody, env = {}) {
  const secret = String(env.SYSTEMEIO_SECRET || '').trim();
  if (!secret) return { ok: false, raison: 'secret_absent', variable: 'SYSTEMEIO_SECRET' };

  const headers = req.headers || {};
  const headerSecret = headers['x-webhook-secret'] || '';
  const headerAlias = headers['x-systemeio-signature'] || '';
  const headerSignature = headers['x-webhook-signature'] || '';
  const querySecret = (req.query && req.query.secret) || '';

  if (safeEqual(headerSignature, crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex'))) {
    return { ok: true, mode: 'hmac' };
  }
  if (safeEqual(headerSecret, secret)) return { ok: true, mode: 'entete' };
  if (safeEqual(headerAlias, secret)) return { ok: true, mode: 'entete_alias' };
  if (safeEqual(querySecret, secret)) return { ok: true, mode: 'parametre' };

  return {
    ok: false,
    raison: 'aucun_mode_ne_correspond',
    presents: {
      entete: Boolean(headerSecret),
      entete_alias: Boolean(headerAlias),
      signature: Boolean(headerSignature),
      parametre: Boolean(querySecret),
    },
  };
}

const THEMATIQUE_MAP = {
  'reduction-impots':          'reduction-impots',
  'declaration-impots':        'declaration-impots',
  'investissement-immobilier': 'investissement-immobilier',
  'preparation-retraite':      'preparation-retraite',
  'placement-epargne':         'placement-epargne',
  'transmission-patrimoine':   'transmission-patrimoine',
  'cession-entreprise':        'cession-entreprise',
  'credit-immobilier':         'credit-immobilier',
  'guide-5-erreurs':           'guide-5-erreurs',
  'wizard-site':               'bilan-patrimonial',
};

const REFUS = { error: 'Non autorisé' };

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret, X-Webhook-Signature, X-Systemeio-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // Corps brut : indispensable au mode HMAC, donc lu avant l'authentification.
  // Rien n'en est journalisé à ce stade.
  const rawBody = await readRawBody(req);

  // ── AUTHENTIFICATION — avant toute lecture de configuration Brevo ──
  const auth = authenticate(req, rawBody, process.env);
  if (!auth.ok) {
    if (auth.raison === 'secret_absent') {
      // La cause doit être évidente dans les journaux Vercel : c'est une
      // variable d'environnement manquante, pas un appelant fautif.
      console.error('webhook-systemeio: refus — variable d\'authentification absente', { variable: auth.variable });
    } else {
      console.warn('webhook-systemeio: refus — aucun mode d\'authentification ne correspond', auth.presents);
    }
    // Réponse identique dans les deux cas : aucune information sur la configuration.
    return res.status(401).json(REFUS);
  }

  // ── À partir d'ici, et seulement ici, la requête est authentifiée ──
  const brevoApiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);

  if (!brevoApiKey) {
    console.error('webhook-systemeio: BREVO_API_KEY manquante');
    return res.status(500).json({ error: 'Clé API Brevo non configurée' });
  }

  let payload = {};
  try { payload = rawBody ? JSON.parse(rawBody) : {}; }
  catch (e) { console.warn('webhook-systemeio: corps non JSON', { octets: rawBody ? rawBody.length : 0 }); }

  console.log('webhook-systemeio: requête authentifiée', { mode: auth.mode });

  const contact = payload.contact || payload;
  const email = contact.email;
  const firstName = contact.first_name || contact.firstName || contact.prenom || '';
  const lastName = contact.last_name || contact.lastName || contact.nom || '';

  if (!email) {
    return res.status(400).json({ error: 'Email manquant dans le webhook' });
  }

  const tags = (payload.contact?.tags || payload.tags || []).map((t) => t.name || t);
  let thematique = 'non-categorise';
  for (const tag of tags) {
    if (THEMATIQUE_MAP[tag]) { thematique = THEMATIQUE_MAP[tag]; break; }
  }

  // ── Envoi vers Brevo ──
  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        email,
        attributes: {
          PRENOM: firstName,
          NOM: lastName,
          THEMATIQUE: thematique,
          SOURCE: 'systeme.io',
          STATUT_LEAD: 'nouveau',
        },
        listIds: listId ? [listId] : [],
        updateEnabled: true,
      }),
    });

    const brevoData = await brevoRes.json().catch(() => ({}));

    if (!brevoRes.ok) {
      console.error('Erreur Brevo :', brevoRes.status, JSON.stringify(brevoData));
      return res.status(502).json({ error: 'Échec Brevo', details: brevoData });
    }

    console.log(`✓ Contact synchronisé Brevo — thématique : ${thematique}`);
    return res.status(200).json({ success: true, email, thematique });
  } catch (err) {
    console.error('Erreur réseau Brevo :', err.message);
    return res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
};

module.exports = handler;
// ⚠️ Ces deux affectations doivent venir APRÈS `module.exports = handler` :
// avant la correction du 2026-11-10, `module.exports.config` était posé en tête
// de fichier puis écrasé par l'affectation du handler, donc l'analyse du corps
// par la plateforme restait active et `readRawBody` ne recevait rien — le mode
// HMAC ne pouvait pas fonctionner.
module.exports.config = { api: { bodyParser: false } };
// Exposé pour les tests unitaires (aucun appel réseau à l'import).
module.exports.__internals = { authenticate, safeEqual, THEMATIQUE_MAP, REFUS };
