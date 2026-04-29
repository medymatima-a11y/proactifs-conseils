// ============================================================
// Webhook systeme.io → Brevo
// Variables Vercel requises :
//   BREVO_API_KEY     = xkeysib-...
//   BREVO_LIST_ID     = ID liste Brevo (nombre entier)
//   SYSTEMEIO_SECRET  = secret webhook Systeme.io (optionnel)
//
// Modes d'authentification acceptés (si SYSTEMEIO_SECRET défini) :
//   1. Query string  ?secret=XXX
//   2. Header        X-Webhook-Secret: XXX
//   3. HMAC-SHA256   X-Webhook-Signature = hex(hmac_sha256(body, secret))
// Si SYSTEMEIO_SECRET vide ou non défini → aucune vérification (mode debug).
// ============================================================

const crypto = require('crypto');

// Vercel parse déjà req.body en JSON ; on a besoin du raw body pour le HMAC.
// On désactive le bodyParser et on lit le stream nous-mêmes.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret, X-Webhook-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const brevoApiKey = process.env.BREVO_API_KEY;
  const listId      = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  const secret      = (process.env.SYSTEMEIO_SECRET || '').trim();

  if (!brevoApiKey) {
    console.error('BREVO_API_KEY manquante');
    return res.status(500).json({ error: 'Clé API Brevo non configurée' });
  }

  // ── Lecture du raw body ──
  const rawBody = await readRawBody(req);
  let payload = {};
  try { payload = rawBody ? JSON.parse(rawBody) : {}; }
  catch (e) { console.warn('Body non JSON :', rawBody.slice(0, 200)); }

  // ── Vérification multi-mode (si secret défini) ──
  if (secret) {
    const headerSecret = req.headers['x-webhook-secret']
                      || req.headers['x-systemeio-signature']
                      || '';
    const headerSignature = req.headers['x-webhook-signature'] || '';
    const querySecret = (req.query && req.query.secret) || '';

    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const ok =
      headerSecret === secret ||
      querySecret  === secret ||
      headerSignature === computed;

    if (!ok) {
      console.warn('Webhook refusé : aucun mode d\'auth ne correspond', {
        hasHeaderSecret: !!headerSecret,
        hasHeaderSig:    !!headerSignature,
        hasQuery:        !!querySecret,
      });
      return res.status(401).json({ error: 'Signature invalide' });
    }
  } else {
    console.log('SYSTEMEIO_SECRET non défini → aucune vérification (mode debug)');
  }

  console.log('Webhook reçu :', JSON.stringify(payload).slice(0, 300));

  // ── Extraction des données contact ──
  const contact   = payload.contact || payload;
  const email     = contact.email;
  const firstName = contact.first_name || contact.firstName || contact.prenom || '';
  const lastName  = contact.last_name  || contact.lastName  || contact.nom    || '';

  if (!email) {
    return res.status(400).json({ error: 'Email manquant dans le webhook' });
  }

  // ── Mapping thématique ──
  const THEMATIQUE_MAP = {
    'reduction-impots':         'reduction-impots',
    'declaration-impots':       'declaration-impots',
    'investissement-immobilier':'investissement-immobilier',
    'preparation-retraite':     'preparation-retraite',
    'placement-epargne':        'placement-epargne',
    'transmission-patrimoine':  'transmission-patrimoine',
    'cession-entreprise':       'cession-entreprise',
    'credit-immobilier':        'credit-immobilier',
    'guide-5-erreurs':          'guide-5-erreurs',
    'wizard-site':              'bilan-patrimonial',
  };

  const tags = (payload.contact?.tags || payload.tags || []).map(t => t.name || t);
  let thematique = 'non-categorise';
  for (const tag of tags) {
    if (THEMATIQUE_MAP[tag]) { thematique = THEMATIQUE_MAP[tag]; break; }
  }

  // ── Envoi vers Brevo ──
  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      brevoApiKey,
      },
      body: JSON.stringify({
        email,
        attributes: {
          PRENOM:      firstName,
          NOM:         lastName,
          THEMATIQUE:  thematique,
          SOURCE:      'systeme.io',
          STATUT_LEAD: 'nouveau',
        },
        listIds:       listId ? [listId] : [],
        updateEnabled: true,
      }),
    });

    const brevoData = await brevoRes.json().catch(() => ({}));

    if (!brevoRes.ok) {
      console.error('Erreur Brevo :', brevoRes.status, JSON.stringify(brevoData));
      return res.status(502).json({ error: 'Échec Brevo', details: brevoData });
    }

    console.log(`✓ Contact ${email} synchronisé Brevo — thématique : ${thematique}`);
    return res.status(200).json({ success: true, email, thematique });

  } catch (err) {
    console.error('Erreur réseau Brevo :', err.message);
    return res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
};
