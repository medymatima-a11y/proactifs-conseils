/* ============================================================
   Vercel Serverless Function — /api/subscribe-guide
   Capture les téléchargements du guide 5 erreurs :
   1. Crée contact dans Systeme.io avec tag 'guide-5-erreurs'
   2. Ajoute ligne dans Airtable table "Lead Guide 5 erreurs"
   ============================================================ */

const SYSTEME_API  = 'https://api.systeme.io/api/contacts';
const AIRTABLE_API = 'https://api.airtable.com/v0/appxCpuqfmqfS8jpD/tblpRfI7La8i9JCfv';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { prenom, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  const prenomNom = prenom ? prenom.trim() : '';
  const now       = new Date().toISOString();

  // ── 1. Systeme.io ──────────────────────────────────────────
  const systemeKey = process.env.SYSTEME_API_KEY;
  if (systemeKey) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: prenomNom,
          tags: [{ name: 'guide-5-erreurs' }, { name: 'site-web' }],
        }),
      });
    } catch(e) { console.warn('Systeme.io error:', e.message); }
  }

  // ── 2. Airtable ────────────────────────────────────────────
  const airtableKey = process.env.AIRTABLE_API_KEY;
  if (airtableKey) {
    try {
      const atRes = await fetch(AIRTABLE_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${airtableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typecast: true,
          records: [{
            fields: {
              'fld6uzJZ1CiwSgGdu': prenomNom,
              'fldF1lObq0lfoHlT1': email.trim().toLowerCase(),
              'fld7laBZNBlI8Dda5': 'Nouveau',
              'fldrNzhxACxGCt1mY': 'Guide 5 erreurs',
              'fldA97A1wMOdJMRti': now,
            }
          }],
        }),
      });
      if (!atRes.ok) {
        const err = await atRes.text();
        console.error('Airtable error:', atRes.status, err);
      }
    } catch(e) { console.error('Airtable fetch error:', e.message); }
  }

  return res.status(200).json({ success: true });
};
