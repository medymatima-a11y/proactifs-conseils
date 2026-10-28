// /api/sc-bootstrap.js — DÉSACTIVÉE (410 Gone).
// Route one-shot obsolète : le refresh_token Search Console est déjà configuré
// dans les variables Vercel. Cette route n'effectue aucun échange OAuth et ne lit
// aucun secret.

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'Gone', message: 'Route désactivée.' });
};
