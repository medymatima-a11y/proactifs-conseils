# Repérer une notification manquée sur un lead, et la reprendre à la main

## Pourquoi ce document

La clé d'idempotence (`migration-leads-idempotence.sql`) supprime les **lignes
en double**. Elle ne garantit **rien** sur l'envoi des notifications, et elle
crée même un angle mort :

> quand le serveur reconnaît un rejeu, il répond `200 {success:true, rejeu:true}`
> **avant** les appels Systeme.io et Brevo. Un appel qui a échoué à la première
> tentative n'est donc **jamais repris** par un réessai du visiteur.

Mesuré le 22/11/2026 (`tests/manuel/essai-contention-livraison.js`, scénario
D de `essai-postgrest-idempotence.js`) : Systeme.io et Brevo tombent en panne,
la demande est enregistrée et répond 200 ; au rejeu, **zéro appel externe**.
Et côté base : une notification dont l'envoi échoue après le commit laisse la
ligne en place, sans aucune reprise.

Conclusion pratique : **une notification manquée se reprend à la main, et
seulement à la main.**

## Les quatre canaux, et leur état

| Canal | Déclencheur | Portée | État en production le 22/11/2026 |
|---|---|---|---|
| Notification interne | trigger `on_new_lead_notify` | toute ligne insérée | actif |
| Email de confirmation au visiteur | trigger `on_new_lead_notify` | toute ligne insérée | actif |
| Liste Brevo 23 | trigger, **si** `reponses.consentement.marketing = true` | consentement explicite | actif |
| Contact Systeme.io (tags) | `api/subscribe.js` / `api/subscribe-guide.js`, si consentement | consentement explicite | actif (`SYSTEME_API_KEY` présente) |
| Liste Brevo dédiée (applicative) | `api/subscribe.js`, si consentement | consentement explicite | **inerte** : `BREVO_LIST_ID_MARKETING` n'existe pas |
| Systeme.io → Brevo via `api/webhook-systemeio` | webhook entrant | — | **fermé** : `SYSTEMEIO_SECRET` n'existe pas, toute requête est refusée en 401 |

État établi à partir des **noms** des variables du projet Vercel
`proactifs-conseils` (`vercel env list`), jamais de leurs valeurs. À revérifier
si la configuration bouge : deux lignes de ce tableau basculent dès qu'une
variable est créée.

## Repérer

### 1. Les journaux Vercel — à regarder d'abord, mais ils ne durent pas

Chaînes à chercher dans les journaux d'exécution (`/api/subscribe` et
`/api/subscribe-guide`) :

| Chaîne | Ce qu'elle dit |
|---|---|
| `Systeme.io error:` | l'appel Systeme.io a échoué (réseau ou exception). Le lead est enregistré. |
| `subscribe: Brevo a refusé l'abonnement marketing` | Brevo a répondu une erreur HTTP. Le lead est enregistré. |
| `subscribe: abonnement marketing injoignable` | Brevo inatteignable. |
| `subscribe: abonnement marketing consenti mais liste dédiée non configurée` | le visiteur a consenti, mais `BREVO_LIST_ID_MARKETING` manque : rien n'est parti, et c'est l'état normal aujourd'hui. |
| `subscribe: rejeu reconnu, aucune ligne creee, aucun effet de bord rejoue` | un rejeu a été reconnu — **et donc les appels externes ont été sautés**. Si le premier appel avait échoué, il n'a pas été repris. |
| `subscribe: cle d'idempotence reutilisee avec un contenu different` | 409. La demande initiale est intacte, la nouvelle n'a pas été enregistrée : le visiteur doit recharger la page. |

La rétention des journaux Vercel est courte et dépend de l'offre : ne jamais
s'appuyer sur eux seuls pour un lead de plus de quelques jours.

### 2. La base — la source durable

```sql
-- Leads récents et leur consentement, pour contrôle croisé avec Brevo
select id, created_at, email, prenom, source,
       reponses #>> '{consentement,marketing}'  as consent_marketing,
       reponses #>> '{consentement,horodatage}' as consent_date,
       idempotency_key is not null              as avec_cle
from public.leads
where created_at > now() - interval '7 days'
order by created_at desc;
```

Si `notify_new_lead()` passe par pg_net, les échecs d'envoi du trigger se lisent
pendant **6 heures** seulement :

```sql
select id, status_code, error_msg, created, left(content, 300) as debut
from net._http_response
where status_code >= 400 or error_msg is not null
order by created desc
limit 50;
```

Au-delà de 6 h, cette table ne dit plus rien : l'absence de trace n'est pas une
preuve d'envoi. (Le corps réel de `notify_new_lead()` n'est défini par aucun
fichier du dépôt — à relire en base pour savoir ce qu'il journalise
exactement, et où.)

### 3. Les destinations — le contrôle qui tranche

Pour un lead donné, la question est simplement « est-il arrivé ? » :

- **Brevo** : chercher l'adresse dans les contacts, et vérifier son
  appartenance à la liste 23. `GET /v3/contacts/{email}` renvoie `listIds`.
- **Systeme.io** : chercher le contact et ses tags. Les tags attendus sont
  `TAG_MAP[service]` **et** `wizard-site` pour `/api/subscribe`
  (`api/subscribe.js`, constante `TAG_MAP`), ou `guide-5-erreurs` **et**
  `site-web` pour `/api/subscribe-guide`.
- **Notification interne et email de confirmation** : la boîte de réception,
  et la boîte d'envoi du service d'emailing côté trigger.

Un lead présent en base **et** absent de sa destination attendue, alors que
`consentement.marketing` vaut `true` : c'est une notification manquée.

## Reprendre — sans réinsérer le lead

### Les trois interdits

1. **Ne pas renvoyer le formulaire.** Avec le dispositif actif, un envoi
   identique dans la même session répond `rejeu` et ne relance aucun appel ; un
   envoi depuis une autre session crée une **deuxième ligne**, donc un
   deuxième email de confirmation au visiteur. Dans les deux cas c'est raté.
2. **Ne pas faire d'`INSERT` dans `leads`** pour « rejouer le trigger ». Cela
   crée un doublon et renvoie un second email de confirmation au visiteur.
3. **Ne pas modifier `idempotency_key` ni `payload_fingerprint`** d'une ligne
   existante. Un rejeu tardif du navigateur ne serait plus reconnu, ou
   basculerait en 409.

### Avant toute reprise marketing : vérifier le consentement

```sql
select email,
       reponses #>> '{consentement,marketing}'  as marketing,
       reponses #>> '{consentement,recueilli}'  as case_presentee,
       reponses #>> '{consentement,version}'    as version,
       reponses #>> '{consentement,horodatage}' as horodatage
from public.leads
where id = '<id du lead>';
```

`marketing` doit valoir `true`. S'il vaut `false` ou `null`, **il n'y a rien à
reprendre** côté Brevo et Systeme.io : l'absence d'abonnement est le
comportement voulu, pas une panne. Reprendre quand même serait inscrire
quelqu'un sans son accord.

### Canal par canal

**Contact Systeme.io manquant.** Créer le contact directement dans Systeme.io,
avec l'adresse, le prénom et les mêmes tags que ceux du code
(`TAG_MAP[service]` + `wizard-site`, ou `guide-5-erreurs` + `site-web`). Rien à
toucher en base.

**Liste Brevo 23 manquante.** Ajouter le contact à la liste 23 dans Brevo
(interface, ou `POST /v3/contacts` avec `listIds: [23]` et
`updateEnabled: true`). Reporter la date de consentement relevée ci-dessus dans
les attributs du contact, pour que la preuve suive le contact.

**Liste Brevo dédiée (applicative).** Sans objet aujourd'hui : la variable
n'existe pas, donc aucun abonnement n'a été tenté. Le journal le dit
explicitement.

**Email de confirmation au visiteur manquant.** Le renvoyer depuis l'outil
d'emailing, avec le même contenu que le modèle du trigger. Ne pas passer par
une insertion en base.

**Notification interne manquante.** Traiter le lead directement : il est en
base, c'est la seule chose qui compte. Le signaler si le cas se répète — c'est
le symptôme d'un canal cassé, pas d'un lead perdu.

### Tracer la reprise

Noter ce qui a été repris, pour qui et quand — dans la fiche du contact côté
CRM, pas dans `leads`. La colonne `statut` de `leads` appartient au cycle
commercial (`nouveau`, `converti`…) : la détourner pour y consigner un incident
technique brouillerait les deux.

## Si les manques se répètent

Ce n'est plus de la reprise, c'est un défaut à corriger. Deux pistes, dans cet
ordre :

1. **La reprise automatique des appels marketing** n'existe pas. Le chemin
   « rejeu » saute volontairement ces appels pour ne pas doubler les envois ;
   il n'y a aucune file d'attente derrière. Un vrai correctif passerait par une
   trace en base de ce qui a été tenté, et une reprise séparée — c'est un
   chantier, pas un réglage.
2. **La forme du trigger.** Si `notify_new_lead()` est synchrone, un échec
   d'envoi **annule la demande** (réponse 500, aucune ligne) : le visiteur voit
   une erreur et peut réessayer, mais le lead n'existe pas. Si elle est
   asynchrone (pg_net), la demande est conservée et seule la notification est
   perdue. Les deux comportements ont été mesurés le 22/11/2026 ; lequel
   s'applique dépend du corps réel de la fonction en production, qui reste à
   inspecter.
