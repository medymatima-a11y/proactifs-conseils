// /api/sc.js — Proxy Search Console API pour proactifsconseils.fr
//
// Utilise un refresh_token (var d'env Vercel) pour obtenir un access_token,
// puis appelle l'API Search Console et renvoie le JSON.
// Protégé par un secret partagé (header X-Sc-Secret ou ?secret=).
//
// Variables d'env Vercel requises :
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//   SC_PROXY_SECRET   (secret arbitraire pour authentifier les appels)
//
// Actions supportées (?action=...):
//   • sites          — liste les propriétés Search Console (défaut)
//   • query          — POST searchanalytics/query
//                      params : ?site=, ?startDate=, ?endDate=, ?dimensions=,
//                               ?rowLimit=, ?dimensionFilter=...
//                      defaults : site=sc-domain:proactifsconseils.fr,
//                                 28 derniers jours, dimensions=query, rowLimit=100
//   • inspect        — POST urlInspection/index
//                      params : ?site=, ?inspectionUrl=

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SC_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60_000) {
    return cachedToken;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error('Token refresh failed (' + r.status + '): ' + txt);
  }
  const data = await r.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

function todayMinus(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // 1) Auth
  const provided = req.headers['x-sc-secret'] || req.query.secret;
  if (!process.env.SC_PROXY_SECRET || provided !== process.env.SC_PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — fournir X-Sc-Secret ou ?secret=' });
  }
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'GOOGLE_OAUTH_REFRESH_TOKEN manquant — exécuter /api/sc-bootstrap d\'abord' });
  }

  try {
    const token = await getAccessToken();
    const auth = { Authorization: 'Bearer ' + token };
    const action = (req.query.action || 'sites').toLowerCase();

    if (action === 'sites') {
      const r = await fetch(SC_BASE + '/sites', { headers: auth });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'query') {
      const siteUrl = req.query.site || 'sc-domain:proactifsconseils.fr';
      const body = {
        startDate: req.query.startDate || todayMinus(28),
        endDate: req.query.endDate || todayMinus(0),
        dimensions: (req.query.dimensions || 'query').split(',').map(s => s.trim()),
        rowLimit: parseInt(req.query.rowLimit || '100', 10),
      };
      if (req.query.searchType) body.searchType = req.query.searchType;
      if (req.query.dimensionFilterGroups) {
        try { body.dimensionFilterGroups = JSON.parse(req.query.dimensionFilterGroups); } catch (e) {}
      }
      const url = SC_BASE + '/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query';
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return res.status(r.status).json({ requested: body, ...data });
    }

    if (action === 'inspect') {
      const siteUrl = req.query.site || 'sc-domain:proactifsconseils.fr';
      const inspectionUrl = req.query.inspectionUrl;
      if (!inspectionUrl) return res.status(400).json({ error: 'Missing ?inspectionUrl=' });
      const url = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, inspectionUrl, languageCode: 'fr-FR' }),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    return res.status(400).json({
      error: 'Unknown action',
      supported: ['sites', 'query', 'inspect'],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
