/* ============================================================
   Vercel Serverless Function — /api/subscribe
   INSERT dans Supabase (table leads) — le trigger notify_new_lead
   gère automatiquement : notification Medy + ajout Brevo liste 23
   + email de confirmation personnalisé au client.
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

const LABEL_MAP = {
  impots:       'Réduire mes impôts',
  immo:         'Investissement immobilier',
  retraite:     'Préparer ma retraite',
  epargne:      'Placer mon épargne',
  transmission: 'Transmettre à mes proches',
  cession:      'Céder mon entreprise',
  credit:       'Obtenir un crédit',
  declaration:  'Déclarer mes impôts',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const systemeKey  = process.env.SYSTEME_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const { prenom, nom, email, tel, situation, service, answers = [] } = req.body || {};
  if (!prenom || !email || !service) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const preoccupation = LABEL_MAP[service] || service;
  const tagName       = TAG_MAP[service] || 'site-web';

  // ── 1. INSERT dans Supabase (table leads) ──────────────────
  try {
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        prenom:        prenom.trim(),
        nom:           (nom || '').trim(),
        email:         email.trim().toLowerCase(),
        telephone:     tel || null,
        source:        'Quiz bilan patrimonial',
        situation:     situation || null,
        preoccupation: preoccupation,
        reponses:      { service_code: service, answers },
        statut:        'nouveau',
      }),
    });
    if (!sbRes.ok) {
      const sbErr = await sbRes.text();
      console.error('Supabase INSERT error:', sbRes.status, sbErr);
      return res.status(500).json({ error: 'Erreur enregistrement' });
    }
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // ── 2. Systeme.io (tags marketing) ─────────────────────────
  if (systemeKey) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: prenom.trim(),
          tags: [{ name: tagName }, { name: 'wizard-site' }],
        }),
      });
    } catch (e) { console.warn('Systeme.io error:', e.message); }
  }

  return res.status(200).json({ success: true });
};
