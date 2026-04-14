// ============================================================
// Webhook systeme.io → Brevo
// Fichier à placer dans : /api/webhook-systemeio.js
// Projet Vercel : proactifs-conseils
// ============================================================
//
// Variables d'environnement requises (à créer dans Vercel) :
//   BREVO_API_KEY     = ta clé API Brevo (xkeysib-...)
//   BREVO_LIST_ID     = l'ID de ta liste principale Brevo (nombre entier)
//   SYSTEMEIO_SECRET  = le secret que tu génères dans systeme.io
//
// ============================================================

// Mapping : nom de formulaire ou tag systeme.io → thématique Brevo
// Personnalise ces valeurs selon le nom exact de tes 8 formulaires
const THEMATIQUE_MAP = {
  'bilan-patrimonial': 'bilan-patrimonial',
  'bilan patrimonial gratuit': 'bilan-patrimonial',
  'reduction-impots': 'reduction-impots',
  'optimisation fiscale': 'reduction-impots',
  'declaration-impots': 'declaration-impots',
  'declaration impots': 'declaration-impots',
  'scpi': 'scpi',
  'investissement scpi': 'scpi',
  'transmission': 'transmission',
  'preparation-retraite': 'preparation-retraite',
  'preparation retraite': 'preparation-retraite',
  'cession-entreprise': 'cession-entreprise',
  'cession entreprise': 'cession-entreprise',
  'courtage-credit': 'courtage-credit',
  'credit immobilier': 'courtage-credit'
};

function detectThematique(payload) {
  // Tente de détecter la thématique à partir de plusieurs champs possibles
  const candidates = [
    payload?.tag?.name,
    payload?.form?.name,
    payload?.contact?.tags?.[0]?.name,
    payload?.source,
    payload?.funnel?.name
  ].filter(Boolean).map(s => s.toLowerCase().trim());

  for (const c of candidates) {
    for (const [key, value] of Object.entries(THEMATIQUE_MAP)) {
      if (c.includes(key)) return value;
    }
  }
  return 'non-categorise';
}

export default async function handler(req, res) {
  // CORS pour Make/tests manuels (optionnel)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // 1. Vérification du secret systeme.io (sécurité)
  const receivedSecret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (process.env.SYSTEMEIO_SECRET && receivedSecret !== process.env.SYSTEMEIO_SECRET) {
    console.warn('Webhook refusé : secret invalide');
    return res.status(401).json({ error: 'Secret invalide' });
  }

  const payload = req.body || {};
  console.log('Webhook reçu :', JSON.stringify(payload).slice(0, 500));

  // 2. Extraction des données contact
  const contact = payload.contact || payload;
  const email = contact.email;
  const firstName = contact.first_name || contact.firstName || contact.prenom || '';
  const lastName = contact.last_name || contact.lastName || contact.nom || '';

  if (!email) {
    return res.status(400).json({ error: 'Email manquant dans le webhook' });
  }

  // 3. Détection automatique de la thématique
  const thematique = detectThematique(payload);

  // 4. Envoi vers Brevo API
  const brevoApiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);

  if (!brevoApiKey) {
    return res.status(500).json({ error: 'Clé API Brevo non configurée' });
  }

  const brevoPayload = {
    email,
    attributes: {
      PRENOM: firstName,
      NOM: lastName,
      THEMATIQUE: thematique,
      SOURCE: 'systeme.io',
      STATUT_LEAD: 'nouveau'
    },
    listIds: listId ? [listId] : [],
    updateEnabled: true  // met à jour si le contact existe déjà
  };

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey
      },
      body: JSON.stringify(brevoPayload)
    });

    const brevoData = await brevoRes.json().catch(() => ({}));

    if (!brevoRes.ok) {
      console.error('Erreur Brevo :', brevoRes.status, brevoData);
      return res.status(502).json({
        error: 'Échec création contact Brevo',
        details: brevoData
      });
    }

    console.log(`✓ Contact ${email} synchronisé — thématique : ${thematique}`);
    return res.status(200).json({
      success: true,
      email,
      thematique,
      brevo_id: brevoData.id
    });

  } catch (err) {
    console.error('Erreur réseau Brevo :', err);
    return res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
}
