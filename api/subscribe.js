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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.SYSTEME_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  const { prenom, email, service } = req.body || {};
  if (!prenom || !email || !service) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const tagName = TAG_MAP[service] || 'site-web';

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
    return res.status(200).json({ success: true });
  }

  return res.status(502).json({ error: 'Erreur Systeme.io', code: response.status });
};
