/* ============================================================
   Vercel Serverless Function — /api/subscribe
   1. Crée contact dans Systeme.io (avec tag)
   2. Ajoute ligne dans Airtable (toutes les réponses)
   3. Envoie email de notification à Medy
   ============================================================ */

const SYSTEME_API  = 'https://api.systeme.io/api/contacts';
const AIRTABLE_API = 'https://api.airtable.com/v0/appxCpuqfmqfS8jpD/tblje0WaL1oYCjbZ1';

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

  const systemeKey  = process.env.SYSTEME_API_KEY;
  const airtableKey = process.env.AIRTABLE_API_KEY;
  const resendKey   = process.env.RESEND_API_KEY;
  const notifEmail  = process.env.NOTIF_EMAIL || 'medymatima@gmail.com';

  const { prenom, nom, email, tel, situation, service, answers = [] } = req.body || {};
  if (!prenom || !email || !service) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const tagName       = TAG_MAP[service]   || 'site-web';
  const preoccupation = LABEL_MAP[service] || service;
  const prenomNom     = `${prenom} ${nom || ''}`.trim();
  const nowDate       = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ

  // ── 1. Systeme.io ──────────────────────────────────────────
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
    } catch(e) { console.warn('Systeme.io error:', e.message); }
  }

  // ── 2. Airtable ────────────────────────────────────────────
  if (airtableKey) {
    try {
      // Sépare les réponses normales de l'info complémentaire (textarea)
      const lastAnswer = answers[answers.length - 1] || '';
      const infoCompl  = lastAnswer.includes('Informations') ? lastAnswer.split(' : ').slice(1).join(' : ') : '';
      const reponsesQ  = (infoCompl ? answers.slice(0, -1) : answers).join('\n');

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
              'fldB23sDZVIYqaA81': prenomNom,
              'fld17XQzLs5FJ85cO': email.trim().toLowerCase(),
              'fldwBNH11DPxcFtG0': tel || '',
              'fldZ1GOsvgvBAmKoq': situation || '',
              'fldoF56h17WokQt3S': preoccupation,
              'fldrnpT5Fnhd4uY5e': 'Nouveau',
              'fldJtmKxVMXgBGDz3': reponsesQ,
              'fld8cbbXHqM5YM6XN': infoCompl,
              'fldg4IeV2r50trZhA': nowDate,
            }
          }],
        }),
      });
      if (!atRes.ok) {
        const atErr = await atRes.text();
        console.error('Airtable HTTP error:', atRes.status, atErr);
      }
    } catch(e) { console.error('Airtable fetch error:', e.message); }
  }

  // ── 3. Email de notification (Resend) ──────────────────────
  if (resendKey) {
    try {
      const answersHtml = answers.map(a => `<li style="margin:4px 0">${a}</li>`).join('');
      const rsRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Proactifs Conseils <onboarding@resend.dev>',
          to: [notifEmail],
          subject: `Nouveau lead - ${preoccupation} (${prenomNom})`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
              <h2 style="color:#1B3A2D;margin-bottom:4px">Nouveau lead</h2>
              <p style="color:#666;margin-top:0">Via le wizard proactifsconseils.fr</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600;width:40%">Nom</td><td style="padding:8px;border-bottom:1px solid #eee">${prenomNom}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Tel</td><td style="padding:8px;border-bottom:1px solid #eee">${tel || '-'}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Situation</td><td style="padding:8px;border-bottom:1px solid #eee">${situation || '-'}</td></tr>
                <tr><td style="padding:8px;background:#C9A84C;color:#fff;font-weight:600">Sujet</td><td style="padding:8px;background:#fff9ee;font-weight:600;border-bottom:1px solid #eee">${preoccupation}</td></tr>
              </table>
              <h3 style="color:#1B3A2D">Reponses</h3>
              <ul style="padding-left:20px;color:#333">${answersHtml}</ul>
              <p style="margin-top:24px">
                <a href="https://airtable.com/appxCpuqfmqfS8jpD" style="background:#1B3A2D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Voir dans Airtable</a>
              </p>
            </div>
          `,
        }),
      });
      if (!rsRes.ok) {
        const rsErr = await rsRes.text();
        console.error('Resend HTTP error:', rsRes.status, rsErr);
      }
    } catch(e) { console.error('Resend fetch error:', e.message); }
  }

  return res.status(200).json({ success: true });
};
