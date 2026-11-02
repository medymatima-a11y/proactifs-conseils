/* ============================================================
   Vercel Serverless Function — /api/rsu-config
   Renvoie uniquement la CLÉ PUBLIQUE Cloudflare Turnstile utilisée par le widget
   de la page RSU. Aucun secret, aucune donnée personnelle, aucune écriture.

   Variables d'environnement (noms distincts par environnement, comme dans rsu-request.js) :
   - Production : RSU_TURNSTILE_SITE_KEY
   - Preview    : RSU_TURNSTILE_SITE_KEY_Preview (clé dédiée TEST)
   Absente, ou environnement non géré = null, le formulaire RSU refuse alors l'envoi (fail closed).
   ============================================================ */

const TURNSTILE_SITE_KEY_VARS = {
  production: 'RSU_TURNSTILE_SITE_KEY',
  preview: 'RSU_TURNSTILE_SITE_KEY_Preview',
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  const env = process.env;
  const name = Object.prototype.hasOwnProperty.call(TURNSTILE_SITE_KEY_VARS, env.VERCEL_ENV)
    ? TURNSTILE_SITE_KEY_VARS[env.VERCEL_ENV] : null;
  const siteKey = name ? String(env[name] || '').trim() : '';
  return res.status(200).json({ turnstileSiteKey: siteKey || null });
};
