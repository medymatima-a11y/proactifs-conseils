/* ============================================================
   Vercel Serverless Function — /api/subscribe-guide
   Capture les téléchargements du guide 5 erreurs :
   1. INSERT dans Supabase (table leads) — le trigger gère
      notification + ajout Brevo automatiquement
   Ordre des contrôles (décision du 2026-11-10) :
   1. Anti-robot Turnstile, si SUBSCRIBE_TURNSTILE_SECRET existe — même secret
      et même action que /api/subscribe, aucune variable de plus. Jeton absent
      → 400, jeton refusé → 403, AVANT toute écriture et tout appel marketing.
   2. INSERT dans Supabase (table leads) — toujours, quel que soit l'état du
      consentement marketing. Le trigger gère notification + confirmation.
   3. Contact Systeme.io avec tag 'guide-5-erreurs', UNIQUEMENT si le visiteur
      a coché la case de consentement.

   Le consentement marketing suit exactement le dispositif de /api/subscribe :
   même libellé (CONSENT_TEXTS, tenu côté serveur), même version, même preuve
   horodatée rangée dans `reponses.consentement`. Aucun libellé dupliqué ici.
   Sans consentement : le guide est envoyé, le lead est enregistré, mais aucun
   contact Systeme.io n'est créé — donc aucun passage par
   /api/webhook-systemeio vers la liste Brevo de diffusion.
   ⚠️ Comme pour /api/subscribe, cela ne referme pas le trigger
   `on_new_lead_notify` côté base, qui abonne à la liste 23 à chaque insertion.
   ============================================================ */

const SYSTEME_API = 'https://api.systeme.io/api/contacts';
// Constantes et fonctions partagées : une seule source de vérité pour le
// libellé de consentement comme pour la vérification anti-robot.
const { CONSENT_VERSION, CONSENT_TEXTS, turnstileState, verifyCaptcha } = require('./subscribe.js').__internals;

function preuveConsentement(body, source, hote) {
  const versionIn = String(body.consentVersion ?? '').trim();
  const version = Object.prototype.hasOwnProperty.call(CONSENT_TEXTS, versionIn) ? versionIn : CONSENT_VERSION;
  const recueilli = Object.prototype.hasOwnProperty.call(body, 'consentMarketing')
    || Object.prototype.hasOwnProperty.call(body, 'consentVersion');
  return {
    marketing: recueilli && body.consentMarketing === true,
    recueilli,
    version,
    libelle: recueilli ? CONSENT_TEXTS[version] : null,
    horodatage: new Date().toISOString(),
    // Même forme de preuve que /api/subscribe : l'hôte d'où vient la
    // soumission est conservé quand le navigateur l'a transmis.
    origine: { source, hote: String(hote || '') || null },
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const { prenom, email } = body;
  if (!email) return res.status(400).json({ error: 'Email manquant' });

  /* ── 1. Anti-robot Cloudflare Turnstile — AVANT toute écriture ──
     Décision du 2026-11-10 : même règle que /api/subscribe. Tant que
     SUBSCRIBE_TURNSTILE_SECRET n'existe pas, le garde-fou est inerte et le
     comportement est inchangé (le journal nomme alors la variable attendue).
     Dès que le secret existe, un jeton absent ou refusé fait refuser la
     demande AVANT l'insertion dans `leads` et avant tout appel marketing.
     Conséquence assumée : un visiteur dont la vérification échoue n'obtient
     pas le guide tant qu'il n'a pas réessayé avec succès. */
  const captcha = turnstileState(process.env);
  if (captcha.active) {
    const token = String(body.captchaToken || '').trim();
    if (!token) {
      console.warn('subscribe-guide: jeton captcha absent', { variable: captcha.source });
      return res.status(400).json({ error: 'Vérification anti-robot manquante.' });
    }
    const verdict = await verifyCaptcha(token, captcha.secret, req.headers && req.headers['x-forwarded-for']);
    if (!verdict.ok) {
      console.warn('subscribe-guide: captcha refusé', { variable: captcha.source, raison: verdict.reason });
      return res.status(403).json({ error: 'Vérification anti-robot échouée.' });
    }
  } else {
    console.warn('subscribe-guide: garde-fou captcha INACTIF', { variable: captcha.source, raison: captcha.reason });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const SOURCE = 'Guide 5 erreurs';
  let hote = null;
  try {
    const origin = req.headers && (req.headers.origin || req.headers.Origin);
    hote = origin ? new URL(String(origin)).host : null;
  } catch (_) { hote = null; }
  const consentement = preuveConsentement(body, SOURCE, hote);

  /* ── 2. INSERT dans Supabase (table leads) ──────────────────
     La demande arrive TOUJOURS dans le CRM dès lors que la vérification
     anti-robot est passée — que le consentement marketing soit donné,
     refusé ou non recueilli. */
  try {
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        prenom:        (prenom || '').trim(),
        nom:           null,
        email:         email.trim().toLowerCase(),
        telephone:     null,
        source:        SOURCE,
        situation:     null,
        preoccupation: null,
        reponses:      { consentement },
        statut:        'nouveau',
      }),
    });
    if (!sbRes.ok) {
      const sbErr = await sbRes.text();
      console.error('Supabase INSERT error:', sbRes.status, sbErr);
      return res.status(500).json({ error: 'Erreur enregistrement' });
    }
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  /* ── 3. Systeme.io (tags marketing) ─────────────────────────
     Systeme.io alimente, via /api/webhook-systemeio, une liste Brevo de
     diffusion : c'est de la prospection. Sans consentement explicite — refus
     comme absence de case — aucun contact n'est créé. */
  const systemeKey = process.env.SYSTEME_API_KEY;
  if (!consentement.marketing) {
    console.warn('subscribe-guide: pas de consentement marketing, aucun contact Systeme.io', {
      recueilli: consentement.recueilli, version_consentement: consentement.version,
    });
  }
  if (systemeKey && consentement.marketing) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: (prenom || '').trim(),
          tags: [{ name: 'guide-5-erreurs' }, { name: 'site-web' }],
        }),
      });
    } catch (e) { console.warn('Systeme.io error:', e.message); }
  }

  return res.status(200).json({ success: true });
};

// Exposé pour les tests unitaires (aucun appel réseau à l'import).
module.exports.__internals = { preuveConsentement, CONSENT_VERSION, CONSENT_TEXTS, turnstileState };
