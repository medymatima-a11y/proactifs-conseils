/* ============================================================
   OBSOLÈTE — Ce fichier n'est plus utilisé.
   L'insertion des leads passe désormais par /api/subscribe
   qui écrit directement dans Supabase (table leads).
   Conservé temporairement pour éviter une erreur 404 si un
   ancien formulaire pointe encore ici.
   ============================================================ */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({ error: 'Endpoint obsolète — utiliser /api/subscribe' });
};
