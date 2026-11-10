/* ============================================================
   Vercel Serverless Function — /api/subscribe-config
   Renvoie uniquement la CLÉ PUBLIQUE Cloudflare Turnstile du widget
   anti-robot des formulaires du site (diagnostics home, RSU/ESPP,
   succession immobilière, optimisation fiscale).
   Aucun secret, aucune donnée personnelle, aucune écriture.

   Variables d'environnement (noms distincts par environnement, comme rsu-config) :
   - Production : SUBSCRIBE_TURNSTILE_SITE_KEY
   - Preview    : SUBSCRIBE_TURNSTILE_SITE_KEY_Preview

   Absente = `turnstileSiteKey: null`. Le navigateur n'affiche alors AUCUN
   widget et le formulaire fonctionne normalement : l'anti-robot est inerte
   tant qu'il n'est pas configuré (fail open assumé, voir api/subscribe.js).
   ============================================================ */

const TURNSTILE_SITE_KEY_VARS = {
  production: 'SUBSCRIBE_TURNSTILE_SITE_KEY',
  preview: 'SUBSCRIBE_TURNSTILE_SITE_KEY_Preview',
};

// L'action déclarée par le widget. Vérifiée côté serveur dans /api/subscribe
// quand le secret est configuré : un jeton obtenu sur un autre widget du
// compte Cloudflare ne peut pas servir ici.
const TURNSTILE_ACTION = 'subscribe_form';

const handler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  const env = process.env;
  const name = Object.prototype.hasOwnProperty.call(TURNSTILE_SITE_KEY_VARS, env.VERCEL_ENV)
    ? TURNSTILE_SITE_KEY_VARS[env.VERCEL_ENV]
    : TURNSTILE_SITE_KEY_VARS.production;
  const siteKey = String(env[name] || '').trim();
  if (!siteKey) console.warn('subscribe-config: widget anti-robot INACTIF', { variable: name });
  return res.status(200).json({ turnstileSiteKey: siteKey || null, action: TURNSTILE_ACTION });
};

module.exports = handler;
module.exports.__internals = { TURNSTILE_SITE_KEY_VARS, TURNSTILE_ACTION };
