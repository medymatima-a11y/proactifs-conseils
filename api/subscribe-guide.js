/* ============================================================
   Vercel Serverless Function — /api/subscribe-guide
   Capture les téléchargements du guide 5 erreurs :
   1. INSERT dans Supabase (table leads) — le trigger gère
      notification + ajout Brevo automatiquement
   2. Crée contact dans Systeme.io avec tag 'guide-5-erreurs'
   ============================================================ */

const SYSTEME_API = 'https://api.systeme.io/api/contacts';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const { prenom, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email manquant' });

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
        prenom:        (prenom || '').trim(),
        nom:           null,
        email:         email.trim().toLowerCase(),
        telephone:     null,
        source:        'Guide 5 erreurs',
        situation:     null,
        preoccupation: null,
        reponses:      {},
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
  const systemeKey = process.env.SYSTEME_API_KEY;
  if (systemeKey) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: (prenom || '').trim(),
          tags: [{ name: 'guide-5-erreurs' }, { name: 'site-web' }],
        }),
      });
    } catch (e) { console.warn('Systeme.io error:', e.message); }
  }

  return res.status(200).json({ success: true });
};
