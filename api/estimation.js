/* ============================================================
   Vercel Serverless Function — /api/estimation
   1. Valide la demande (+ anti-robot, limites d'usage)
   2. Géocode l'adresse et calcule l'estimation via l'API Immo Data
   3. Enregistre le lead dans Supabase (table leads) avec l'estimation
      → le trigger notify_new_lead prévient Medy comme pour les autres leads
   4. Renvoie la fourchette au navigateur

   Variables d'environnement :
   - IMMODATA_API_KEY       clé API Immo Data (jamais dans le code)
   - SUPABASE_URL           déjà utilisée par /api/subscribe
   - SUPABASE_SERVICE_KEY   déjà utilisée par /api/subscribe
   - ESTIMATION_DAILY_CAP   optionnel, nombre max d'estimations calculées
                            par jour sur tout le site (défaut 40)
   ============================================================ */

const IMMODATA_BASE = 'https://api.immo-data.fr/v1';
const SOURCE_PREFIX = 'Estimation en ligne';
const PER_EMAIL_DAILY_LIMIT = 3;
const DEFAULT_DAILY_CAP = 40;

const ALLOWED_ORIGINS = [
  'https://proactifsconseils.fr',
  'https://www.proactifsconseils.fr',
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // requêtes same-origin sans en-tête Origin
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Aperçus Vercel du projet
  return /^https:\/\/proactifs-conseils-[a-z0-9-]+\.vercel\.app$/.test(origin);
}

const toInt = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

async function immoData(path, params, apiKey) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') qs.append(k, String(v));
  });
  const res = await fetch(`${IMMODATA_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Immo Data ${path} ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 300);
    throw err;
  }
  return res.json();
}

// Compte des leads d'estimation (limites d'usage). Renvoie null si le comptage échoue.
async function countLeads(sbUrl, sbKey, filters) {
  try {
    const qs = new URLSearchParams({ select: 'id', ...filters });
    const res = await fetch(`${sbUrl}/rest/v1/leads?${qs.toString()}`, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    if (!res.ok) return null;
    const range = res.headers.get('content-range') || '';
    const total = parseInt(range.split('/')[1], 10);
    return Number.isFinite(total) ? total : null;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origine non autorisée' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.IMMODATA_API_KEY;
  if (!sbUrl || !sbKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const b = req.body || {};

  // Anti-robot : champ invisible rempli = robot. On répond « ok » sans rien faire.
  if (clean(b.website)) return res.status(200).json({ success: true, estimation: null });

  const prenom = clean(b.prenom, 80);
  const nom = clean(b.nom, 80);
  const email = clean(b.email, 160).toLowerCase();
  const tel = clean(b.tel, 30);
  const page = clean(b.page, 60) || 'site';

  if (!prenom || !email || !tel || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Merci de renseigner prénom, email et téléphone valides.' });
  }

  const typeLabel = clean(b.type_bien, 30);
  const realtyType = /appart/i.test(typeLabel) ? 'apartment' : /maison/i.test(typeLabel) ? 'house' : null;
  const adresse = clean(b.adresse, 200);
  const livingArea = toInt(b.surface);
  const nbRooms = toInt(b.pieces);
  const exterieur = clean(b.exterieur, 40);
  const parking = clean(b.parking, 40);
  const etat = clean(b.etat, 20); // "-1" | "0" | "1"
  const dpe = clean(b.dpe, 1).toUpperCase();
  const etage = toInt(b.etage);
  const terrain = toInt(b.terrain);

  const reponses = {
    page,
    type_bien: typeLabel,
    adresse,
    surface: b.surface ?? '',
    pieces: b.pieces ?? '',
    chambres: b.chambres ?? '',
    exterieur,
    parking,
    etat,
    dpe,
    etage: b.etage ?? '',
    terrain: b.terrain ?? '',
    motif: clean(b.motif, 300),
    delai: clean(b.delai, 120),
  };

  // ── Estimation Immo Data (si les données suffisent) ─────────
  let estimation = null;
  let estimationStatus = 'non_calculee';

  const canEstimate =
    apiKey && realtyType && adresse &&
    livingArea && livingArea >= 9 && livingArea <= 2000 &&
    nbRooms && nbRooms >= 1 && nbRooms <= 15;

  if (!apiKey) estimationStatus = 'cle_api_absente';
  else if (!canEstimate) estimationStatus = 'donnees_insuffisantes';

  if (canEstimate) {
    const todayIso = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
    const [perEmail, global] = await Promise.all([
      countLeads(sbUrl, sbKey, { email: `eq.${email}`, source: `like.${SOURCE_PREFIX}*`, created_at: `gte.${todayIso}` }),
      countLeads(sbUrl, sbKey, { source: `like.${SOURCE_PREFIX}*`, created_at: `gte.${todayIso}` }),
    ]);
    const dailyCap = toInt(process.env.ESTIMATION_DAILY_CAP) || DEFAULT_DAILY_CAP;

    if (perEmail !== null && perEmail >= PER_EMAIL_DAILY_LIMIT) {
      estimationStatus = 'limite_email';
    } else if (global !== null && global >= dailyCap) {
      estimationStatus = 'plafond_journalier';
    } else {
      try {
        // Coordonnées déjà fournies par l'autocomplétion d'adresse (Base Adresse Nationale) :
        // acceptées uniquement en France métropolitaine, sinon géocodage Immo Data.
        const lat = Number(b.lat);
        const lon = Number(b.lon);
        let place = null;
        if (Number.isFinite(lat) && Number.isFinite(lon) && lat > 41 && lat < 51.5 && lon > -5.5 && lon < 10) {
          place = { center: [lon, lat], geoLevel: 'address_ban', label: adresse };
        } else {
          const geo = await immoData('/geocode', { q: adresse, geoLevel: 'address,street,city', limit: 1 }, apiKey);
          place = Array.isArray(geo) ? geo[0] : null;
        }
        if (!place || !Array.isArray(place.center)) {
          estimationStatus = 'adresse_introuvable';
        } else {
          const [longitude, latitude] = place.center;
          const ext = exterieur.toLowerCase();
          const params = {
            latitude,
            longitude,
            realtyType,
            nbRooms,
            livingArea,
            condition: ['-1', '0', '1'].includes(etat) ? etat : undefined,
            dpe: /^[A-G]$/.test(dpe) ? dpe : undefined,
            parking: parking ? /oui/i.test(parking) : undefined,
          };
          if (realtyType === 'house' && terrain) params.landArea = terrain;
          if (realtyType === 'apartment') {
            if (etage !== null && etage <= 30) params.floor = etage;
            if (ext.includes('terrasse')) params.patio = true;
          }
          const val = await immoData('/valuation', params, apiKey);
          if (val && Number.isFinite(val.mainValuation)) {
            estimation = {
              valeur: val.mainValuation,
              basse: val.lowerValuation,
              haute: val.upperValuation,
              confiance: val.confidence,
              precision_adresse: place.geoLevel || null,
              adresse_retenue: place.label || null,
            };
            estimationStatus = 'ok';
          } else {
            estimationStatus = 'reponse_invalide';
          }
        }
      } catch (e) {
        console.error('Immo Data error:', e.message, e.body || '');
        estimationStatus = e.status === 402 ? 'solde_insuffisant' : 'erreur_api';
      }
    }
  }

  reponses.estimation = estimation;
  reponses.estimation_statut = estimationStatus;

  // ── Enregistrement du lead (toujours, même sans estimation) ─
  try {
    const sbRes = await fetch(`${sbUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        prenom,
        nom,
        email,
        telephone: tel,
        source: `${SOURCE_PREFIX} (${page})`,
        situation: reponses.delai || null,
        preoccupation: reponses.motif || 'Estimation immobilière',
        statut: 'nouveau',
        reponses,
      }),
    });
    if (!sbRes.ok) {
      console.error('Supabase INSERT error:', sbRes.status, await sbRes.text());
      return res.status(500).json({ error: 'Erreur enregistrement' });
    }
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  return res.status(200).json({
    success: true,
    estimation: estimation
      ? { valeur: estimation.valeur, basse: estimation.basse, haute: estimation.haute, confiance: estimation.confiance }
      : null,
  });
};
