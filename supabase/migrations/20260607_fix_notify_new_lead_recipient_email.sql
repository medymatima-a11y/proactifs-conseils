-- ============================================================
-- Fix : notification de nouveau lead non reçue par Medy
-- ------------------------------------------------------------
-- Symptôme  : le client recevait bien son email de confirmation,
--             mais aucune notification n'arrivait côté cabinet.
-- Cause     : le trigger public.notify_new_lead() envoyait la
--             notification à `medy@proactifsconseils.fr`, boîte
--             inexistante chez l'hébergeur mail (IONOS/1&1).
--             Brevo acceptait l'email (201) puis recevait un
--             soft bounce systématique :
--               550 Requested action not taken: mailbox unavailable
-- Correctif : destinataire changé en `medymatima@proactifsconseils.fr`
--             (boîte existante, déjà utilisée comme expéditeur).
--
-- Seule la ligne `to` du bloc « notification à Medy » change ;
-- le reste de la fonction est identique à l'existant.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  api_key          text;
  prenom_lead      text := coalesce(NEW.prenom, '');
  nom_lead         text := coalesce(NEW.nom, '');
  email_lead       text := NEW.email;
  html_medy        text;
  subject_medy     text;
  service_code     text;
  confirm_subject  text;
  confirm_intro    text;
  confirm_title    text;
  confirm_detail   text;
  confirm_html     text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'brevo_api_key';

  -- ── 1. Email de notification à Medy ──────────────────────────

  subject_medy := '🔥 Nouveau lead — ' || coalesce(NEW.source,'Quiz') || ' · ' || prenom_lead || ' ' || nom_lead;

  html_medy :=
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">'
    || '<div style="background:#132D1E;padding:20px 30px;border-radius:8px 8px 0 0">'
    || '<h2 style="color:#C4973A;margin:0">🔥 Nouveau lead — ' || coalesce(NEW.source,'Quiz') || '</h2></div>'
    || '<div style="padding:28px;background:#fff;border:1px solid #dde3ed;border-top:none;border-radius:0 0 8px 8px">'
    || '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    || '<tr><td style="padding:8px;background:#f4f6f9;font-weight:700;width:130px">Nom</td><td style="padding:8px">'       || prenom_lead || ' ' || nom_lead     || '</td></tr>'
    || '<tr><td style="padding:8px;font-weight:700">Email</td><td style="padding:8px">'                                     || coalesce(email_lead,'—')            || '</td></tr>'
    || '<tr><td style="padding:8px;background:#f4f6f9;font-weight:700">Téléphone</td><td style="padding:8px;background:#f4f6f9">' || coalesce(NEW.telephone,'—')   || '</td></tr>'
    || '<tr><td style="padding:8px;font-weight:700">Source</td><td style="padding:8px">'                                    || coalesce(NEW.source,'—')            || '</td></tr>'
    || '<tr><td style="padding:8px;background:#f4f6f9;font-weight:700">Situation</td><td style="padding:8px;background:#f4f6f9">' || coalesce(NEW.situation,'—')   || '</td></tr>'
    || '<tr><td style="padding:8px;font-weight:700">Préoccupation</td><td style="padding:8px">'                             || coalesce(NEW.preoccupation,'—')     || '</td></tr>'
    || '</table>'
    || '<p style="text-align:center;margin:24px 0"><a href="https://crm.proactifsconseils.fr" style="background:#132D1E;color:#C4973A;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700">Ouvrir le CRM →</a></p>'
    || '</div></div>';

  perform net.http_post(
    url     := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', api_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'sender',      jsonb_build_object('name','CRM Proactifs — Leads','email','medymatima@proactifsconseils.fr'),
      'to',          jsonb_build_array(jsonb_build_object('email','medymatima@proactifsconseils.fr','name','Medy Matima')),
      'subject',     subject_medy,
      'htmlContent', html_medy
    )
  );

  -- ── 2. Ajout contact Brevo liste 23 ─────────────────────────

  if email_lead is not null and email_lead <> '' then
    perform net.http_post(
      url     := 'https://api.brevo.com/v3/contacts',
      headers := jsonb_build_object('api-key', api_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'email', email_lead, 'updateEnabled', true, 'listIds', jsonb_build_array(23),
        'attributes', jsonb_build_object(
          'PRENOM', prenom_lead, 'NOM', nom_lead,
          'SMS', coalesce(NEW.telephone,''), 'SOURCE', coalesce(NEW.source,'quiz'),
          'SITUATION', coalesce(NEW.situation,''), 'PREOCCUPATION', coalesce(NEW.preoccupation,'')
        )
      )
    );
  end if;

  -- ── 3. Email de confirmation personnalisé au client ──────────

  if email_lead is not null and email_lead <> '' then

    service_code := coalesce(NEW.reponses->>'service_code', '');

    case service_code
      when 'impots' then
        confirm_subject := 'Votre demande d''optimisation fiscale — Proactifs Conseils';
        confirm_intro   := 'Vous avez raison de vous pencher sur le sujet : chaque année, nous identifions en moyenne 2 000 à 8 000 € d''économies pour nos clients qui n''avaient jamais fait auditer leur fiscalité.';
        confirm_title   := 'Ce que nous allons analyser ensemble :';
        confirm_detail  := 'Votre tranche marginale d''imposition, les dispositifs de défiscalisation adaptés à votre situation (PER, investissement locatif, FCPI/FIP), et les optimisations immédiates possibles sur votre déclaration.';
      when 'immo' then
        confirm_subject := 'Votre projet d''investissement immobilier — Proactifs Conseils';
        confirm_intro   := 'L''immobilier reste un des piliers les plus solides d''une stratégie patrimoniale, à condition de bien calibrer le montage. Nous allons vous aider à y voir clair.';
        confirm_title   := 'Ce que nous allons étudier :';
        confirm_detail  := 'Le type d''investissement le plus adapté à vos objectifs (SCPI, LMNP, SCI, locatif direct), le montage fiscal optimal, et une simulation de rentabilité nette après impôts.';
      when 'retraite' then
        confirm_subject := 'Votre préparation retraite — Proactifs Conseils';
        confirm_intro   := 'Anticiper sa retraite, c''est se donner les moyens de maintenir son niveau de vie le moment venu. Plus on s''y prend tôt, plus les leviers sont puissants.';
        confirm_title   := 'Ce que nous allons construire ensemble :';
        confirm_detail  := 'Un bilan de vos droits acquis, une estimation de vos revenus à la retraite, et une stratégie de complément (PER, assurance vie, immobilier) adaptée à votre horizon.';
      when 'epargne' then
        confirm_subject := 'Votre stratégie de placement — Proactifs Conseils';
        confirm_intro   := 'Bien placer son épargne, c''est trouver le bon équilibre entre rendement, disponibilité et fiscalité. Nous allons vous proposer une allocation sur mesure.';
        confirm_title   := 'Ce que nous allons passer en revue :';
        confirm_detail  := 'Vos placements actuels (assurance vie, PEA, livrets), les opportunités d''optimisation, et une allocation cible cohérente avec votre profil de risque et vos projets.';
      when 'transmission' then
        confirm_subject := 'Votre projet de transmission — Proactifs Conseils';
        confirm_intro   := 'Préparer la transmission de son patrimoine, c''est protéger ses proches et éviter une fiscalité qui peut être très lourde si rien n''est anticipé.';
        confirm_title   := 'Ce que nous allons analyser :';
        confirm_detail  := 'Votre situation familiale et patrimoniale, les abattements utilisables, et les stratégies de donation ou de démembrement les plus adaptées à votre cas.';
      when 'cession' then
        confirm_subject := 'Votre projet de cession d''entreprise — Proactifs Conseils';
        confirm_intro   := 'La cession d''entreprise est souvent l''opération financière la plus importante d''une vie. Le montage en amont fait toute la différence sur ce qu''il vous reste après impôts.';
        confirm_title   := 'Ce que nous allons préparer :';
        confirm_detail  := 'L''évaluation de l''impact fiscal de la cession, les dispositifs d''exonération (150-0 B ter, apport-cession), et la stratégie de remploi pour préserver le produit de la vente.';
      when 'credit' then
        confirm_subject := 'Votre demande de crédit immobilier — Proactifs Conseils';
        confirm_intro   := 'En tant que courtier, nous négocions les meilleures conditions auprès de nos partenaires bancaires. Notre objectif : vous faire gagner du temps et de l''argent.';
        confirm_title   := 'Les prochaines étapes :';
        confirm_detail  := 'Analyse de votre capacité d''emprunt, mise en concurrence des banques partenaires, et montage du dossier complet pour obtenir les meilleures conditions (taux, assurance, garanties).';
      when 'declaration' then
        confirm_subject := 'Votre déclaration d''impôts — Proactifs Conseils';
        confirm_intro   := 'Vous avez bien fait de nous solliciter. Chaque année, nous corrigeons des déclarations qui contenaient des erreurs de plusieurs milliers d''euros, souvent sur des points que la notice fiscale n''explique pas clairement.';
        confirm_title   := 'Ce que nous allons vérifier :';
        confirm_detail  := 'L''ensemble de votre déclaration ligne par ligne : le choix du bon régime fiscal, les charges et déductions auxquelles vous avez droit, les formulaires complémentaires éventuels, et les cases souvent oubliées qui peuvent réduire significativement votre impôt.';
      else
        confirm_subject := 'Votre demande — Proactifs Conseils';
        confirm_intro   := 'Nous allons prendre le temps d''analyser votre situation pour vous apporter des réponses concrètes et personnalisées.';
        confirm_title   := 'Notre approche :';
        confirm_detail  := 'Un premier échange pour comprendre vos objectifs, suivi d''une analyse patrimoniale complète et de recommandations adaptées à votre situation.';
    end case;

    confirm_html :=
      '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#333">'
      || '<div style="text-align:center;margin-bottom:24px">'
      || '<div style="font-size:22px;font-weight:700;color:#1B3A2D;letter-spacing:0.5px">PROACTIFS CONSEILS</div>'
      || '<div style="width:40px;height:2px;background:#C9A84C;margin:8px auto"></div>'
      || '</div>'
      || '<p style="margin:0 0 16px">Bonjour ' || prenom_lead || ',</p>'
      || '<p style="margin:0 0 16px">Nous avons bien reçu votre demande concernant : <strong>' || coalesce(NEW.preoccupation,'votre patrimoine') || '</strong>.</p>'
      || '<p style="margin:0 0 16px">' || confirm_intro || '</p>'
      || '<div style="background:#f9f8f5;border-left:3px solid #C9A84C;padding:16px 20px;margin:20px 0;font-size:14px;line-height:1.6">'
      || '<strong style="color:#1B3A2D">' || confirm_title || '</strong><br>'
      || confirm_detail
      || '</div>'
      || '<p style="margin:0 0 16px">Un conseiller vous contactera <strong>dans les 24 heures</strong> pour convenir d''un échange, en présentiel à Colombes ou en visio selon votre préférence.</p>'
      || '<p style="margin:0 0 8px">En attendant, n''hésitez pas à nous joindre directement :</p>'
      || '<p style="margin:0 0 4px">01 84 78 28 30</p>'
      || '<p style="margin:0 0 20px"><a href="https://calendly.com/gestionnairedepatrimoine/decouverte" style="color:#1B3A2D;font-weight:600">Ou réservez un créneau en ligne</a></p>'
      || '<p style="margin:0 0 4px">Bien cordialement,</p>'
      || '<p style="margin:0 0 0;font-weight:600;color:#1B3A2D">Medy Matima</p>'
      || '<p style="margin:0;font-size:13px;color:#888">Conseiller en Gestion de Patrimoine<br>Proactifs Conseils — Colombes (92)</p>'
      || '</div>';

    perform net.http_post(
      url     := 'https://api.brevo.com/v3/smtp/email',
      headers := jsonb_build_object('api-key', api_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'sender',      jsonb_build_object('name','Proactifs Conseils','email','contact@proactifsconseils.fr'),
        'to',          jsonb_build_array(jsonb_build_object('email', email_lead)),
        'subject',     confirm_subject,
        'htmlContent', confirm_html
      )
    );

  end if;

  return NEW;
exception when others then return NEW;
end;
$function$;
