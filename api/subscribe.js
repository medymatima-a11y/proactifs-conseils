/* ============================================================
   Vercel Serverless Function — /api/subscribe
   Crée un contact dans Systeme.io avec tag selon préoccupation
   ============================================================ */

const SYSTEME_API = 'https://api.systeme.io/api/contacts';

const TAG_MAP = {
  impots:       'reduction-impots',
  immo:         'investissement-immobilier',
  retraite:     'preparation-retraite',
  epargne:      'placement-epargne',
  transmission: 'transmission-patrimoine',
  cession:      'cession-entreprise',
  credit:       'credit-immobilier',
  declaration:  'declaration-impots',
};

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.SYSTEME_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const { prenom, email, service } = req.body || {};

  if (!prenom || !email || !service) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const tagName = TAG_MAP[service] || 'site-web';

  try {
    const response = await fetch(SYSTEME_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        firstName: prenom.trim(),
        tags: [{ name: tagName }, { name: 'wizard-site' }],
      }),
    });

    if (response.ok || response.status === 409) {
      return res.status(200).json({ success: true, tag: tagName });
    }

    const errText = await response.text();
    console.error('Systeme.io error:', response.status, errText);
    return res.status(502).json({ error: 'Erreur Systeme.io', detail: response.status });

  } catch (e) {
    console.error('Subscribe catch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
};
