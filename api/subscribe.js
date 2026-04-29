/* ============================================================
   Vercel Serverless Function — /api/subscribe
   1. Crée contact dans Systeme.io (avec tag)
   2. Ajoute ligne dans Airtable (toutes les réponses)
   3. Envoie email de notification à Medy
   4. Envoie email de confirmation personnalisé au client
   ============================================================ */

const SYSTEME_API  = 'https://api.systeme.io/api/contacts';
const AIRTABLE_API = 'https://api.airtable.com/v0/appxCpuqfmqfS8jpD/tblje0WaL1oYCjbZ1';

const TAG_MAP = {
  impots:       'reduction-impots',
  immo:         'investissement-immobilier',
  retraite:     'preparation-retraite',
  epargne:      'placement-epargne',
  transmission: 'transmission-patrimoine',
  cession:      'cession-entreprise',
  credit:       'credit-immobilier',
  declaration:  'declaration-impots',
};

const LABEL_MAP = {
  impots:       'Réduire mes impôts',
  immo:         'Investissement immobilier',
  retraite:     'Préparer ma retraite',
  epargne:      'Placer mon épargne',
  transmission: 'Transmettre à mes proches',
  cession:      'Céder mon entreprise',
  credit:       'Obtenir un crédit',
  declaration:  'Déclarer mes impôts',
};

const CONFIRM_MAP = {
  impots: {
    subject: 'Votre demande d\'optimisation fiscale — Proactifs Conseils',
    intro: 'Vous avez raison de vous pencher sur le sujet : chaque année, nous identifions en moyenne 2 000 à 8 000 € d\'économies pour nos clients qui n\'avaient jamais fait auditer leur fiscalité.',
    title: 'Ce que nous allons analyser ensemble :',
    detail: 'Votre tranche marginale d\'imposition, les dispositifs de défiscalisation adaptés à votre situation (PER, investissement locatif, FCPI/FIP), et les optimisations immédiates possibles sur votre déclaration.',
  },
  immo: {
    subject: 'Votre projet d\'investissement immobilier — Proactifs Conseils',
    intro: 'L\'immobilier reste un des piliers les plus solides d\'une stratégie patrimoniale, à condition de bien calibrer le montage. Nous allons vous aider à y voir clair.',
    title: 'Ce que nous allons étudier :',
    detail: 'Le type d\'investissement le plus adapté à vos objectifs (SCPI, LMNP, SCI, locatif direct), le montage fiscal optimal, et une simulation de rentabilité nette après impôts.',
  },
  retraite: {
    subject: 'Votre préparation retraite — Proactifs Conseils',
    intro: 'Anticiper sa retraite, c\'est se donner les moyens de maintenir son niveau de vie le moment venu. Plus on s\'y prend tôt, plus les leviers sont puissants.',
    title: 'Ce que nous allons construire ensemble :',
    detail: 'Un bilan de vos droits acquis, une estimation de vos revenus à la retraite, et une stratégie de complément (PER, assurance vie, immobilier) adaptée à votre horizon.',
  },
  epargne: {
    subject: 'Votre stratégie de placement — Proactifs Conseils',
    intro: 'Bien placer son épargne, c\'est trouver le bon équilibre entre rendement, disponibilité et fiscalité. Nous allons vous proposer une allocation sur mesure.',
    title: 'Ce que nous allons passer en revue :',
    detail: 'Vos placements actuels (assurance vie, PEA, livrets), les opportunités d\'optimisation, et une allocation cible cohérente avec votre profil de risque et vos projets.',
  },
  transmission: {
    subject: 'Votre projet de transmission — Proactifs Conseils',
    intro: 'Préparer la transmission de son patrimoine, c\'est protéger ses proches et éviter une fiscalité qui peut être très lourde si rien n\'est anticipé.',
    title: 'Ce que nous allons analyser :',
    detail: 'Votre situation familiale et patrimoniale, les abattements utilisables, et les stratégies de donation ou de démembrement les plus adaptées à votre cas.',
  },
  cession: {
    subject: 'Votre projet de cession d\'entreprise — Proactifs Conseils',
    intro: 'La cession d\'entreprise est souvent l\'opération financière la plus importante d\'une vie. Le montage en amont fait toute la différence sur ce qu\'il vous reste après impôts.',
    title: 'Ce que nous allons préparer :',
    detail: 'L\'évaluation de l\'impact fiscal de la cession, les dispositifs d\'exonération (150-0 B ter, apport-cession), et la stratégie de remploi pour préserver le produit de la vente.',
  },
  credit: {
    subject: 'Votre demande de crédit immobilier — Proactifs Conseils',
    intro: 'En tant que courtier, nous négocions les meilleures conditions auprès de nos partenaires bancaires. Notre objectif : vous faire gagner du temps et de l\'argent.',
    title: 'Les prochaines étapes :',
    detail: 'Analyse de votre capacité d\'emprunt, mise en concurrence des banques partenaires, et montage du dossier complet pour obtenir les meilleures conditions (taux, assurance, garanties).',
  },
  declaration: {
    subject: 'Votre déclaration d\'impôts — Proactifs Conseils',
    intro: 'Vous avez bien fait de nous solliciter. Les erreurs de déclaration sont fréquentes, surtout avec des revenus fonciers ou des situations atypiques, et elles coûtent souvent plusieurs milliers d\'euros.',
    title: 'Ce que nous allons vérifier :',
    detail: 'Le bon régime fiscal (réel vs micro), l\'ensemble des charges déductibles, les revenus fonciers, LMNP ou plus-values éventuelles, et toutes les cases souvent oubliées qui peuvent réduire votre impôt.',
  },
  _default: {
    subject: 'Votre demande — Proactifs Conseils',
    intro: 'Nous allons prendre le temps d\'analyser votre situation pour vous apporter des réponses concrètes et personnalisées.',
    title: 'Notre approche :',
    detail: 'Un premier échange pour comprendre vos objectifs, suivi d\'une analyse patrimoniale complète et de recommandations adaptées à votre situation.',
  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const systemeKey  = process.env.SYSTEME_API_KEY;
  const airtableKey = process.env.AIRTABLE_API_KEY;
  const resendKey   = process.env.RESEND_API_KEY;
  const notifEmail  = process.env.NOTIF_EMAIL || 'medymatima@gmail.com';

  const { prenom, nom, email, tel, situation, service, answers = [] } = req.body || {};
  if (!prenom || !email || !service) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const tagName       = TAG_MAP[service]   || 'site-web';
  const preoccupation = LABEL_MAP[service] || service;
  const prenomNom     = `${prenom} ${nom || ''}`.trim();
  const nowDate       = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ

  // ── 1. Systeme.io ──────────────────────────────────────────
  if (systemeKey) {
    try {
      await fetch(SYSTEME_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': systemeKey },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: prenom.trim(),
          tags: [{ name: tagName }, { name: 'wizard-site' }],
        }),
      });
    } catch(e) { console.warn('Systeme.io error:', e.message); }
  }

  // ── 2. Airtable ────────────────────────────────────────────
  if (airtableKey) {
    try {
      // Sépare les réponses normales de l'info complémentaire (textarea)
      const lastAnswer = answers[answers.length - 1] || '';
      const infoCompl  = lastAnswer.includes('Informations') ? lastAnswer.split(' : ').slice(1).join(' : ') : '';
      const reponsesQ  = (infoCompl ? answers.slice(0, -1) : answers).join('\n');

      const atRes = await fetch(AIRTABLE_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${airtableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typecast: true,
          records: [{
            fields: {
              'fldB23sDZVIYqaA81': prenomNom,
              'fld17XQzLs5FJ85cO': email.trim().toLowerCase(),
              'fldwBNH11DPxcFtG0': tel || '',
              'fldZ1GOsvgvBAmKoq': situation || '',
              'fldoF56h17WokQt3S': preoccupation,
              'fldrnpT5Fnhd4uY5e': 'Nouveau',
              'fldJtmKxVMXgBGDz3': reponsesQ,
              'fld8cbbXHqM5YM6XN': infoCompl,
              'fldg4IeV2r50trZhA': nowDate,
            }
          }],
        }),
      });
      if (!atRes.ok) {
        const atErr = await atRes.text();
        console.error('Airtable HTTP error:', atRes.status, atErr);
      }
    } catch(e) { console.error('Airtable fetch error:', e.message); }
  }

  // ── 3. Email de notification (Resend) ──────────────────────
  if (resendKey) {
    try {
      const answersHtml = answers.map(a => `<li style="margin:4px 0">${a}</li>`).join('');
      const rsRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Proactifs Conseils <onboarding@resend.dev>',
          to: [notifEmail],
          subject: `Nouveau lead - ${preoccupation} (${prenomNom})`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
              <h2 style="color:#1B3A2D;margin-bottom:4px">Nouveau lead</h2>
              <p style="color:#666;margin-top:0">Via le wizard proactifsconseils.fr</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600;width:40%">Nom</td><td style="padding:8px;border-bottom:1px solid #eee">${prenomNom}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Tel</td><td style="padding:8px;border-bottom:1px solid #eee">${tel || '-'}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Situation</td><td style="padding:8px;border-bottom:1px solid #eee">${situation || '-'}</td></tr>
                <tr><td style="padding:8px;background:#C9A84C;color:#fff;font-weight:600">Sujet</td><td style="padding:8px;background:#fff9ee;font-weight:600;border-bottom:1px solid #eee">${preoccupation}</td></tr>
              </table>
              <h3 style="color:#1B3A2D">Reponses</h3>
              <ul style="padding-left:20px;color:#333">${answersHtml}</ul>
              <p style="margin-top:24px">
                <a href="https://airtable.com/appxCpuqfmqfS8jpD" style="background:#1B3A2D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Voir dans Airtable</a>
              </p>
            </div>
          `,
        }),
      });
      if (!rsRes.ok) {
        const rsErr = await rsRes.text();
        console.error('Resend HTTP error:', rsRes.status, rsErr);
      }
    } catch(e) { console.error('Resend fetch error:', e.message); }
  }

  // ── 4. Email de confirmation au client (Resend) ─────────────
  if (resendKey) {
    try {
      const confirmContent = CONFIRM_MAP[service] || CONFIRM_MAP._default;
      const clientHtml = `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#333">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:22px;font-weight:700;color:#1B3A2D;letter-spacing:0.5px">PROACTIFS CONSEILS</div>
            <div style="width:40px;height:2px;background:#C9A84C;margin:8px auto"></div>
          </div>
          <p style="margin:0 0 16px">Bonjour ${prenom.trim()},</p>
          <p style="margin:0 0 16px">Nous avons bien reçu votre demande concernant : <strong>${preoccupation}</strong>.</p>
          <p style="margin:0 0 16px">${confirmContent.intro}</p>
          <div style="background:#f9f8f5;border-left:3px solid #C9A84C;padding:16px 20px;margin:20px 0;font-size:14px;line-height:1.6">
            <strong style="color:#1B3A2D">${confirmContent.title}</strong><br>
            ${confirmContent.detail}
          </div>
          <p style="margin:0 0 16px">Un conseiller vous contactera <strong>dans les 24 heures</strong> pour convenir d'un échange, en présentiel à Colombes ou en visio selon votre préférence.</p>
          <p style="margin:0 0 8px">En attendant, n'hésitez pas à nous joindre directement :</p>
          <p style="margin:0 0 4px">01 84 78 28 30</p>
          <p style="margin:0 0 20px"><a href="https://calendly.com/gestionnairedepatrimoine/point-conseils-web" style="color:#1B3A2D;font-weight:600">Ou réservez un créneau en ligne</a></p>
          <p style="margin:0 0 4px">Bien cordialement,</p>
          <p style="margin:0 0 0;font-weight:600;color:#1B3A2D">Medy Matima</p>
          <p style="margin:0;font-size:13px;color:#888">Conseiller en Gestion de Patrimoine<br>Proactifs Conseils — Colombes (92)</p>
        </div>
      `;
      const cfRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Proactifs Conseils <onboarding@resend.dev>',
          to: [email.trim().toLowerCase()],
          subject: confirmContent.subject,
          html: clientHtml,
        }),
      });
      if (!cfRes.ok) {
        const cfErr = await cfRes.text();
        console.error('Resend confirm error:', cfRes.status, cfErr);
      }
    } catch(e) { console.error('Resend confirm fetch error:', e.message); }
  }

  return res.status(200).json({ success: true });
};
