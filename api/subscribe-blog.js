/* ============================================================
   Vercel Serverless Function — /api/subscribe-blog
   Ajoute un inscrit dans Brevo, liste 25 "Inscrits blog"
   ============================================================ */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://proactifsconseils.fr');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, prenom } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('BREVO_API_KEY manquant');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        attributes: { PRENOM: (prenom || '').trim() },
        listIds: [25],
        updateEnabled: true
      })
    });

    if (r.ok || r.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const err = await r.json().catch(() => ({}));
    if (err.code === 'duplicate_parameter') {
      return res.status(200).json({ ok: true });
    }

    console.error('Brevo error:', r.status, err);
    return res.status(500).json({ error: 'Erreur Brevo' });

  } catch (e) {
    console.error('Fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
