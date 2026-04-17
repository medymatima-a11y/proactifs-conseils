// ============================================================
// Webhook systeme.io → Brevo
// Variables Vercel requises :
//   BREVO_API_KEY     = xkeysib-...
//   BREVO_LIST_ID     = ID liste Brevo (nombre entier)
//   SYSTEMEIO_SECRET  = secret webhook Systeme.io (optionnel)
// ============================================================

const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const brevoApiKey = process.env.BREVO_API_KEY;
  const listId      = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  const secret      = process.env.SYSTEMEIO_SECRET;

  if (!brevoApiKey) {
    console.error('BREVO_API_KEY manquante');
    return res.status(500).json({ error: 'Clé API Brevo non configurée' });
  }

  // ── Vérification signature optionnelle ──
  if (secret) {
    const signature =
      req.headers['x-webhook-signature'] ||
      req.headers['x-systemeio-signature'] ||
      req.headers['x-webhook-secret'];
    const isValid = signature === secret;
    if (!isValid) {
      console.warn('Webhook refusé : signature invalide');
      return res.status(401).json({ error: 'Signature invalide' });
    }
  }

  // ── Extraction des données contact ──
  const payload  = req.body || {};
  console.log('Webhook reçu :', JSON.stringify(payload).slice(0, 300));

  const contact   = payload.contact || payload;
  const email     = contact.email;
  const firstName = contact.first_name || contact.firstName || contact.prenom || '';
  const lastName  = contact.last_name  || contact.lastName  || contact.nom   || '';

  if (!email) {
    return res.status(400).json({ error: 'Email manquant dans le webhook' });
  }

  // ── Mapping thématique ──
  const THEMATIQUE_MAP = {
    'reduction-impots':       'reduction-impots',
    'declaration-impots':     'declaration-impots',
    'investissement-immobilier': 'investissement-immobilier',
    'preparation-retraite':   'preparation-retraite',
    'placement-epargne':      'placement-epargne',
    'transmission-patrimoine':'transmission-patrimoine',
    'cession-entreprise':     'cession-entreprise',
    'credit-immobilier':      'credit-immobilier',
    'wizard-site':            'bilan-patrimonial',
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
          PRENOM:       firstName,
          NOM:          lastName,
          THEMATIQUE:   thematique,
          SOURCE:       'systeme.io',
          STATUT_LEAD:  'nouveau',
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
