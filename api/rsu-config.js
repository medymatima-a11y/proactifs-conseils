/* ============================================================
   Vercel Serverless Function — /api/rsu-config
   Renvoie uniquement la CLÉ PUBLIQUE Cloudflare Turnstile utilisée par le widget
   de la page RSU. Aucun secret, aucune donnée personnelle, aucune écriture.

   Variable d'environnement :
   - RSU_TURNSTILE_SITE_KEY   clé publique (Preview : clé dédiée TEST). Absente = null,
                              le formulaire RSU refuse alors l'envoi (fail closed).
   ============================================================ */

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  const siteKey = String(process.env.RSU_TURNSTILE_SITE_KEY || '').trim();
  return res.status(200).json({ turnstileSiteKey: siteKey || null });
};
