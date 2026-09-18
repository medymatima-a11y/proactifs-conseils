# CS-5D — Publication simulateur Mensualité + assainissement legacy ciblé

**Projet :** Proactifs Conseils — Simulateurs V2
**Phase :** CS-5D — publication + 301 legacy (pas de refonte, pas de hub, pas de CS-6)
**Date :** 18 septembre 2026
**Branche :** `credit-simulateurs-v2` · **HEAD :** `ec63d72` (CS-5B.1) — inchangé
**Statut :** modifications appliquées en local, **non commitées** — à faire valider par ChatGPT

---

## 1. Contexte git (avant modification)

| Élément | Valeur |
|---|---|
| Branche | `credit-simulateurs-v2` ✅ (attendue) |
| HEAD | `ec63d72` — CS-5B.1 ✅ (attendu) |
| `index.html` | modification locale préexistante **hors périmètre** — non touchée |
| `docs/CS-5C-ARCHITECTURE-HUB-SIMULATEURS.md` | présent (untracked), **préservé** |
| Fichiers moteurs gelés | aucun modifié |

Aucun HEAD ni fichier gelé inattendu → poursuite autorisée.

## 2. État avant

- `/simulateurs/mensualite-credit` : `noindex, nofollow`, breadcrumb en **preview local** (hors système centralisé), **absent** du sitemap, de `nav-pages.json`, de `breadcrumb-pages.json`. Transport lead = **MOCK** (`Promise.resolve({ok:true, mock:true})`).
- `/simulation-pret-immobilier` : `index, follow`, servie via un **rewrite** `vercel.json` → `/simulation-pret-immobilier.html`, présente au sitemap. Cannibalise `/simulateurs/capacite-emprunt`.
- Référence de publication V2 : `/simulateurs/capacite-emprunt` (`index, follow`, breadcrumb centralisé, transport lead `fetch('/api/subscribe')`).

## 3. Modifications réalisées

| Fichier | Modification |
|---|---|
| `simulateurs/mensualite-credit.html` | robots `noindex,nofollow` → `index, follow` ; blocs breadcrumb *preview* remplacés par les marqueurs centralisés (`BREADCRUMB(_JSONLD):START/END`) remplis par le build |
| `scripts/nav-pages.json` | ajout `simulateurs/mensualite-credit.html` |
| `scripts/breadcrumb-pages.json` | ajout entrée mensualité (label « Mensualité de crédit », trail Accueil + « Simulateurs » sans URL) |
| `sitemap.xml` | ajout `/simulateurs/mensualite-credit` ; **retrait** `/simulation-pret-immobilier` |
| `vercel.json` | **retrait** du rewrite `/simulation-pret-immobilier` → `.html` ; **ajout** redirect 301 `/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt` (`permanent: true`) |
| `tests/simulators/cs5b-mensualite.test.js` | test R mis à jour : assertion `noindex` (preview) → `index, follow` + canonical + « aucun noindex résiduel » |
| `docs/CS-5D-PUBLICATION-MENSUALITE.md` | ce document (nouveau) |

**Aucune** modification de calcul, taux, policy, hero, H1, textes SEO, calculateur, comparateur, CTA, design.

## 4. Passage en indexation

- `<meta name="robots" content="index, follow">` (identique au format capacité).
- Canonical déjà propre et conservé : `https://proactifsconseils.fr/simulateurs/mensualite-credit`.
- Aucun `noindex` résiduel (vérifié : 0 occurrence).
- Aucune URL localhost/preview (les seules mentions « preview » étaient des commentaires, supprimés avec les blocs remplacés).

## 5. Sitemap

- Ajout : `https://proactifsconseils.fr/simulateurs/mensualite-credit` (lastmod 2026-09-18, changefreq monthly, priority 0.8 — format existant).
- Retrait : `https://proactifsconseils.fr/simulation-pret-immobilier` (consolidée via 301).
- Aucune URL future ajoutée (`/simulateurs`, taux-endettement, etc. : **non**).

## 6. Breadcrumb / Header

- **Breadcrumb centralisé** : entrée ajoutée à `breadcrumb-pages.json` + `node scripts/build-breadcrumbs.js` → marqueurs remplis.
  Fil : `Accueil › Simulateurs › Mensualité de crédit`.
  « Simulateurs » = **label non cliquable** (span sans lien ; JSON-LD sans `item`), identique à capacité — aucun lien mort vers `/simulateurs`.
- **Header central** : mensualité ajoutée à `nav-pages.json` ; `node scripts/build-header.js` → « [à jour] » (bloc NAV déjà conforme, aucune réécriture d'autres pages).
- `partials/header.html`, `assets/css/navigation.css`, `assets/js/navigation.js` : **non modifiés**.
- Lien header « Simulateurs » : **inchangé** (`{{HOME_PREFIX}}#simulateurs`).

## 7. Maillage interne

Audit : la page oriente déjà naturellement vers le financement (CTA) et le contenu SEO renvoie vers la référence de taux. Liens contextuels présents jugés suffisants — **aucun lien ajouté ni retiré** (respect de « 2-3 liens max, ne pas créer de forêt »). Aucune URL future liée.

## 8. CTA / Lead — branché en réel (CS-5D.1)

- Bouton **« Étudier mon financement »** : `data-action="open-lead"` → ouvre le formulaire `#m-lead` (pas de bouton mort, pas de localhost).
- **Transport AVANT (CS-5D) :** MOCK — `leadTransport: function(payload){ return Promise.resolve({ ok:true, mock:true }); }` (aucun POST réel).
- **Transport APRÈS (CS-5D.1) :** RÉEL, identique au simulateur capacité :
  ```js
  leadTransport: function (payload) {
    return fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('subscribe ' + res.status);
      return res.json().catch(function () { return { ok: true }; });
    });
  }
  ```
- **Endpoint :** `POST /api/subscribe` (le même que capacité).
- **Payload** (via `lead.buildLeadPayload`, schéma inchangé) : `{ prenom, nom:"", email, tel, situation:"", service:"credit", answers:[{ source:"simulateur_mensualite_credit" }] }`. **Aucune donnée financière** (revenus, charges, résultat) ni PII supplémentaire — compatible avec le contrat `/api/subscribe` existant.
- **Succès :** message « Merci, votre demande a bien été envoyée. Nous vous recontactons rapidement. » (identique à capacité) ; le formulaire se masque.
- **Erreur :** `submitLead(...).catch()` conserve l'UX d'erreur existante (« Une erreur est survenue… réessayez »). **Aucun faux succès** en cas d'échec réseau/API.
- **Compatibilité payload vérifiée statiquement** (contrat identique à capacité) ; **aucun faux prospect** envoyé en production pour tester (§7 respecté).
- **Non modifiés :** `assets/js/simulators/lead.js`, `/api/subscribe`, Supabase, Brevo, Systeme.io — inchangés (lecture seule). La seule modification est le transport injecté dans `M.init(...)` de la page mensualité + le message de succès.

## 9. 301 legacy

- `vercel.json` → `redirects` : `{ "source": "/simulation-pret-immobilier", "destination": "/simulateurs/capacite-emprunt", "permanent": true }`.
- Redirection **serveur/plateforme, permanente** (pas de JS, pas de meta refresh).
- Rewrite legacy `/simulation-pret-immobilier` → `.html` **retiré** (les redirects sont évalués avant les rewrites ; le laisser serait contradictoire).
- Destination = `/simulateurs/capacite-emprunt` (PAS `/simulateurs`, PAS `/courtage-credit-immobilier`).
- Fichier `simulation-pret-immobilier.html` **conservé** (non supprimé) — la redirection prime.
- **Pas de boucle** : la cible `/simulateurs/capacite-emprunt` est une vraie page (cleanUrls), non redirigée, et reste directement accessible.

> Vérification runtime réelle de la 301 (code HTTP 301, pas de boucle) : à confirmer après déploiement Vercel (le sandbox ne sert pas la plateforme). Config validée statiquement (JSON valide, destination existante).

## 10. Tests

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **219/219 PASS** (test R adapté à la publication) |
| `node scripts/build-header.js --check` | ✅ capacité + mensualité « [à jour] » |
| `node scripts/build-breadcrumbs.js --check` | ✅ 50/50 pages conformes, 0 anomalie |
| `node scripts/check-mobile-nav.js` | ✅ 66 pages, aucune régression mobile |
| Moteurs gelés (`git diff --name-only`) | ✅ core / calc-credit / calc-immo / rates / credit-policy **non modifiés** |

## 11. QA fonctionnelle & visuelle

Rendu Playwright (miroir local), scénarios CS-5B.1 rejoués :

| Scénario | Attendu CS-5B.1 | Obtenu CS-5D |
|---|---|---|
| A — 250 000 € / 20 ans / taux Proactifs / assurance inconnue | 1 450 €/mois ; capital 250 000 ; intérêts ≈ 98 000 ; total ≈ 348 000 | ✅ 1 450 € ; 250 000 ; 98 000 ; 348 000 |
| B — 300 000 € / 20 ans / 4,10 % / assurance 38 € | 1 872 €/mois | ✅ 1 872 € |

- Desktop 1440 / mobile 390 / mobile 320 : **aucun overflow horizontal**, montants **nowrap** (0 valeur qui casse), comparateur OK.
- Header central, breadcrumb (Accueil cliquable / « Simulateurs » non cliquable), hero, formulaire, résultat, pastille assurance compacte, CTA financement, contenu SEO, footer : conformes, **aucune régression** vs CS-5B.1.

## 12. Fichiers modifiés (périmètre CS-5D)

```
simulateurs/mensualite-credit.html
scripts/nav-pages.json
scripts/breadcrumb-pages.json
sitemap.xml
vercel.json
tests/simulators/cs5b-mensualite.test.js
docs/CS-5D-PUBLICATION-MENSUALITE.md   (nouveau)
```

Hors périmètre (non touchés) : `index.html` (modif locale préexistante), `docs/CS-5C-…md` (untracked préservé).

## 13. Éléments volontairement NON touchés

- ✅ `#simulateurs` de la home (3 calculateurs inline legacy) — **non touché** (chevauchement SEO documenté en CS-5C, traité avec le futur hub).
- ✅ `pret-immobilier-index.html` + sous-domaine `pret-immobilier.proactifsconseils.fr` + leurs rewrites — **non touchés** (chantier Crédit V2).
- ✅ Hub `/simulateurs` — **non créé**.
- ✅ Lien header « Simulateurs » — **non modifié**.
- ✅ CS-6 (taux d'endettement) — **non commencé**.
- ✅ Moteurs / taux / policy / `ACTIVE_MARKET_REFERENCE` — intacts.
- ✅ Pipeline lead (`/api/subscribe`, Supabase, Brevo, Systeme.io) — non modifié.

## 14. Risques restant ouverts

1. ~~Lead mock sur page indexée~~ — **RÉSOLU en CS-5D.1** : transport réel `POST /api/subscribe` branché (identique capacité).
2. **Vérification 301 en production** — à confirmer côté Vercel après déploiement (code HTTP + absence de boucle).
3. **Vérification lead en production** — un test réel bout-en-bout (un vrai envoi via `/api/subscribe` → Supabase/Brevo/Systeme.io) reste à faire côté plateforme après déploiement, sans injecter de faux prospect depuis le sandbox.
3. **Doublon SEO `/#simulateurs` home** — non résolu (volontaire, futur hub).
4. **`pret-immobilier-index` + sous-domaine** — non traités (Crédit V2).

## 15. État final git

- Branche `credit-simulateurs-v2`, HEAD `ec63d72` — **aucun commit**.
- Fichiers suivis modifiés : `index.html` (hors périmètre), `scripts/breadcrumb-pages.json`, `scripts/nav-pages.json`, `simulateurs/mensualite-credit.html`, `tests/simulators/cs5b-mensualite.test.js`, `sitemap.xml`, `vercel.json`.
- Nouveaux fichiers (untracked) : `docs/CS-5D-PUBLICATION-MENSUALITE.md`, `docs/CS-5C-ARCHITECTURE-HUB-SIMULATEURS.md` (préservé).
- **Aucun** `git add` / `commit` / `push` / `merge`.

*Fin CS-5D. À faire valider par ChatGPT avant commit et déploiement.*
