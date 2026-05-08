// /api/sc-bootstrap.js — One-shot : échange un code OAuth contre un refresh_token.
//
// À utiliser UNE SEULE FOIS pour récupérer le refresh_token Search Console.
// Une fois le refresh_token ajouté en var Vercel (GOOGLE_OAUTH_REFRESH_TOKEN),
// SUPPRIMER ce fichier ou retirer le module.exports.
//
// Usage : GET /api/sc-bootstrap?code=4/0Ae... (le code OAuth obtenu via le flow desktop)

module.exports = async (req, res) => {
  // Désactivé une fois le refresh_token obtenu — décommenter pour bloquer :
  // return res.status(410).json({ error: 'Bootstrap disabled' });

  const code = req.query.code;
  if (!code) {
    return res.status(400).json({
      error: 'Missing ?code=...',
      hint: 'Visit https://accounts.google.com/o/oauth2/auth?response_type=code&client_id='
        + process.env.GOOGLE_OAUTH_CLIENT_ID
        + '&redirect_uri=http://localhost'
        + '&scope=https://www.googleapis.com/auth/webmasters.readonly'
        + '&access_type=offline&prompt=consent',
    });
  }

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET env vars' });
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: 'http://localhost', // Doit matcher le redirect_uri utilisé pour le code
  });

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'Token exchange failed', google_response: data });
    }
    // ⚠️ AFFICHE le refresh_token en clair — c'est l'objectif du bootstrap.
    // Copiez la valeur de "refresh_token" et ajoutez-la dans les vars Vercel
    // sous la clé GOOGLE_OAUTH_REFRESH_TOKEN, puis SUPPRIMEZ ce fichier.
    return res.status(200).json({
      message: 'SUCCESS — Copiez la valeur "refresh_token" ci-dessous et ajoutez-la en var Vercel sous GOOGLE_OAUTH_REFRESH_TOKEN, puis supprimez ce fichier.',
      ...data,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
