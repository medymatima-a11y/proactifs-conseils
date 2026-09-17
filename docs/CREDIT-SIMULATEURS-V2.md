# CRÉDIT & SIMULATEURS — Audit technique architecture V2 (CREDIT-SIM-0)

**Site :** proactifsconseils.fr · **Date :** 17/09/2026 · **Branche :** `menu-1.5-centralisation-header`
**Nature :** AUDIT diagnostique uniquement. Aucune page/CSS/JS/header/manifeste/sitemap modifié. Cible = future architecture Patrimoine · Immobilier · **Crédit** · **Simulateurs** · Le cabinet · Ressources (NON implémentée ici).

---

## 1. État actuel — Crédit

- **`courtage-credit-immobilier.html`** = page commerciale **principale** du crédit. Canonical propre, `index,follow`, 9 H2, 5 blocs JSON-LD (Service + FAQPage), breadcrumb, OG, **52 liens internes entrants** (présente dans le méga-menu Immobilier « Financement / Courtage »). Contient déjà une section « Calculez votre capacité d'emprunt » qui renvoie vers `/simulation-pret-immobilier`. Header centralisé (thème immobilier corail).
- **`pret-immobilier-index.html`** = page **parallèle/legacy**. Canonical **vers un sous-domaine** `https://pret-immobilier.proactifsconseils.fr/`, **0 lien interne entrant** (orpheline), ancien header, CTA « Simuler mon prêt → ». Cible la **même intention** que courtage-credit-immobilier → cannibalisation (voir §5 / §15).
- Pas de hub `/credit`. Pas d'entrée « Crédit » dans le header.

## 2. État actuel — Simulateurs

- **`simulation-pret-immobilier.html`** = **seul simulateur réel** (wizard capacité d'emprunt). Ancien header, canonical propre, JSON-LD **WebApplication** + FAQPage, breadcrumb, OG. 1 lien entrant (depuis courtage-credit-immobilier).
- L'entrée **« Simulateurs » du header central est un simple lien vers l'ancre `/#simulateurs`** (section `id="simulateurs"` sur l'accueil) — **pas une page**. C'est la base à convertir en hub `/simulateurs`.
- Aucun dossier `assets/js/simulators/` ni CSS partagé : la logique du simulateur est **inline** dans la page.

## 3. Inventaire des pages existantes (crédit / financement / simulateur)

| Page | Fichier | Header | Canonical | Entrants | Rôle |
|---|---|---|---|---|---|
| /courtage-credit-immobilier | `courtage-credit-immobilier.html` | Centralisé (immobilier) | propre | 52 | Page crédit principale |
| /pret-immobilier-index | `pret-immobilier-index.html` | Ancien | → sous-domaine prêt | 0 | Landing parallèle (legacy/ads) |
| /simulation-pret-immobilier | `simulation-pret-immobilier.html` | Ancien | propre | 1 | Simulateur capacité |

Pages « financement » connexes (mentions, non simulateurs) : investissement-immobilier(-ancien), investissement-scpi, immobilier-complement-retraite-lmnp-scpi (univers Immobilier déjà centralisé).

## 4. Inventaire composants / calculs / infra existants

- **Aucun module JS partagé** (`assets/js/` = uniquement `navigation.js`). Calcul du simulateur = **inline** dans `simulation-pret-immobilier.html`.
- **Endpoints serverless `api/`** (Vercel) :
  - `/api/subscribe` → **INSERT Supabase table `leads`** ; trigger `notify_new_lead` (notif Medy + Brevo liste 23 + email de confirmation) + Systeme.io. **← pipeline lead réutilisable, déjà utilisé par le simulateur.**
  - `/api/subscribe-guide` → Supabase `leads` + Systeme.io (tag guide).
  - `/api/subscribe-blog` → Brevo liste 25.
  - `/api/submit-quiz` → **OBSOLÈTE** (remplacé par `/api/subscribe`).
  - `/api/webhook-systemeio` → Systeme.io → Brevo.
  - `/api/sc.js`, `/api/sc-bootstrap.js` → proxy Search Console (SEO, hors sujet).
- **Tracking** : GA4 `G-P53RQGXJZX` + Google Ads `AW-835423035` (gtag/dataLayer). Events custom existants : `generate_lead`, `conversion`, `ads_conversion_Formulaire_1`.

## 5. Comparaison /courtage-credit-immobilier vs /pret-immobilier-index

| Critère | courtage-credit-immobilier | pret-immobilier-index |
|---|---|---|
| Intention | Courtier crédit immobilier IDF | Courtier prêt immobilier Colombes/92 |
| Canonical | propre (indexée) | **sous-domaine `pret-immobilier.…`** |
| Liens entrants | 52 (dans le menu) | 0 (orpheline) |
| Header | centralisé | ancien |
| CTA | Prendre rendez-vous | Simuler mon prêt → |

- **Couverture** : quasi identique (courtier crédit/prêt immobilier, 92/IDF, 20 banques). **Même intention de recherche.**
- **Page commerciale principale** = `courtage-credit-immobilier` (maillée, canonical propre, JSON-LD riche).
- **Futur hub `/credit`** : `courtage-credit-immobilier` est le meilleur candidat de base (contenu + maillage) ; `pret-immobilier-index` fait doublon.
- **Risque duplication/cannibalisation** : élevé. `pret-immobilier-index` canonicalise vers un sous-domaine → signal SEO dispersé. **Décision requise** (consolidation / redirection / rôle sous-domaine) — non tranchée ici.

## 6. Audit /simulation-pret-immobilier (technique)

- **A. Fonctionnement** : wizard multi-étapes (`wizCredit`, `wzGo/wzNext/wzPrev`, `wz-progress-step`), étape 3 = calcul, étape finale = capture lead.
- **B. Champs** : `wz-revenu` (revenus nets), `wz-revenu2` (co-emprunteur), `wz-credits` (crédits en cours), `wz-loyer` (loyer actuel), `wz-apport`, `wz-duree` ; puis `wz-prenom`, `wz-email`, `wz-tel`.
- **C. Formules** (présentes) : `mensMax = max(0, revenus × 0.35 − crédits)` ; `tm = taux/100/12` ; `facteur = (1 − (1+tm)^(−nbMois)) / tm` ; `capacite = round(mensMax × facteur)` ; `budget = capacite + apport`. Taux via `wzTaux(duree)` (barème par durée).
- **D. JS** : inline (vanilla, pas de dépendance).
- **E. Dépendances** : aucune lib externe (Math natif).
- **F. Validation** : `wzCheckFields3()` (contrôle des champs avant calcul).
- **G. Responsive** : hérite du CSS de page (à revérifier en intégration).
- **H. Stockage** : objet JS `wzData` en mémoire (pas de persistance locale).
- **I. Formulaire** : capture prénom/email/tel → `wzSubmit()` async.
- **J. CTA** : header « Prendre rendez-vous » ; CTA résultat → soumission lead.
- **K/L. Tracking** : GA4 + Google Ads chargés ; events `generate_lead`/`conversion` disponibles.
- **M. CRM** : `wzSubmit()` **POST `/api/subscribe`** → Supabase `leads` (+ Brevo/email/Systeme.io via trigger). Message inclut « Capacité estimée … / mensualité max … ».

**Réutilisable** : la formule d'annuité, le barème `wzTaux`, le pattern wizard, et surtout le pipeline `/api/subscribe`.

> ⚠️ Anomalies SEO à signaler (NON corrigées) : title « Simulation Prêt Immobilier **e** » et H1 « …immobilier**e** et personnalisée » comportent un « e » parasite.

## 7. Éléments réutilisables

- Formules capacité/mensualité (annuité) + barème taux/durée.
- Pipeline leads `/api/subscribe` → Supabase `leads` → Brevo/email/Systeme.io.
- Tracking GA4 + Ads + events `generate_lead`.
- Header centralisé (MENU-2B / MENU-3.1) et thèmes CSS.
- UI wizard (étapes + progress).

## 8. Éléments à construire

- Dossier partagé `assets/js/simulators/` (bibliothèque de calcul : capacité, mensualité, endettement, notaire) + `assets/css/simulators/`.
- Hub `/simulateurs` (aujourd'hui simple ancre) et hub `/credit`.
- Pages simulateurs individuelles (seule la capacité existe, à extraire du inline).
- Plan d'événements GA4 dédié simulateurs (voir §12).
- Barèmes/règles de calcul **à faire valider** (taux d'endettement, frais de notaire, etc.) avant tout code.

## 9. Architecture technique recommandée

**Option B (architecture commune) recommandée** plutôt que dupliquer le JS par page :

```
assets/js/simulators/
  core.js          # helpers format €, parsing, validation
  calc-credit.js   # annuité, capacité, mensualité, endettement (fonctions pures testables)
  calc-immo.js     # frais de notaire, rendement locatif
  lead.js          # soumission -> /api/subscribe + events GA4
assets/css/simulators/
  simulators.css   # styles wizard/résultats communs
```

Chaque page simulateur = HTML + header centralisé + inclusion des modules communs. Avantages : une seule source de vérité pour les formules (validées une fois), cohérence UI, maintenance. La formule inline actuelle de `simulation-pret-immobilier` sert de base à `calc-credit.js`.

## 10. Architecture URL proposée

- Hub : `/credit` et `/simulateurs`.
- Crédit : `/credit/pret-relais`, `/credit/financement-investissement-locatif`, `/credit/pret-hypothecaire`, `/credit/pret-in-fine`, `/credit/assurance-emprunteur`.
- Simulateurs : `/simulateurs/capacite-emprunt`, `/simulateurs/mensualite-credit`, `/simulateurs/taux-endettement`, `/simulateurs/frais-notaire`, puis `/simulateurs/pret-relais`, `/simulateurs/rendement-locatif`, `/simulateurs/cout-credit`.
- **Migration du simulateur existant** : `simulation-pret-immobilier` → `/simulateurs/capacite-emprunt` implique un **changement d'URL + redirect 301** (décision SEO, non prise ici). Alternative : garder l'URL actuelle et la référencer depuis le hub.

## 11. Architecture leads

Le funnel cible **existe déjà** : SIMULATION → RÉSULTAT → CTA → FORMULAIRE → **`/api/subscribe`** → Supabase `leads` → (trigger) notif + Brevo + email → prise de rendez-vous. À réutiliser tel quel pour tous les futurs simulateurs. Rien à créer côté intégration (uniquement brancher chaque nouveau simulateur sur `/api/subscribe`).

## 12. Tracking existant / manquant

- **Existant** : GA4 `G-P53RQGXJZX`, Ads `AW-835423035`, events `generate_lead`, `conversion`, `ads_conversion_Formulaire_1`.
- **À ajouter** (noms de travail, non implémentés) : `simulation_started`, `simulation_completed`, `simulation_result`, `financing_cta_clicked`, `financing_lead_submitted`. Le socle gtag/dataLayer suffit — il faudra seulement poser les `gtag('event', …)` aux bons points du wizard et un plan de nommage cohérent.

## 13. Impact Header desktop

Passer à 6 entrées (Patrimoine ▾ · Immobilier ▾ · **Crédit ▾** · Simulateurs · Le cabinet · Ressources ▾) + logo + CTA. Adaptations probables :
- `partials/header.html` : ajouter un `<button class="nav-trigger">Crédit</button>` + `.mega-panel #mega-credit`, et transformer « Simulateurs » (lien ancre) en lien vers `/simulateurs`.
- `navigation.css` : le méga-menu Crédit réutilise `.mega-panel` existant ; vérifier la largeur de barre à 1024 px (6 items) — probablement viable mais à contrôler (risque de resserrement ; repli possible : « Simulateurs » en lien simple, pas en méga).
- `navigation.js` : gère déjà N déclencheurs méga génériquement (`querySelectorAll('.nav-item.nav-mega')`) → ajout d'un 3ᵉ méga sans refonte.
- Nouveau token `CREDIT_ACTIVE_DESKTOP` dans `build-header.js` + `SIMULATEURS_ACTIVE_DESKTOP` si Simulateurs devient une page.

## 14. Impact Header mobile (MENU-3.1)

- `navigation.js` gère les sous-vues via `querySelectorAll('.m-view--sub')` → ajouter une 4ᵉ sous-vue `data-submenu="credit"` (+ `#m-credit`) fonctionne sans refonte.
- « Simulateurs » mobile (aujourd'hui lien ancre) → lien vers `/simulateurs`, ou sous-vue si sous-catégories.
- Tokens actifs mobile : ajouter `CREDIT_ACTIVE_MOBILE` (et éventuellement `SIMULATEURS_ACTIVE_MOBILE`).
- Impact `nav-pages.json` : purement additif (nouvelles pages ajoutées à la migration ; le nombre d'entrées grandit, pas de refonte).

## 15. Risques SEO / duplication

- **Cannibalisation `pret-immobilier-index` ↔ `courtage-credit-immobilier`** (même intention ; l'une canonicalise vers un sous-domaine). À arbitrer avant de créer `/credit`.
- **Migration d'URL** du simulateur (`/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt`) = redirect 301 + mise à jour sitemap/maillage/liens (52 pages pointant vers courtage, 1 vers le simulateur).
- Risque de **nouveaux doublons** si `/credit/*` reprend des contenus déjà couverts par l'univers Immobilier (courtage vs /credit).
- Anomalies title/H1 (« e » parasite) sur le simulateur.

## 16. Risques techniques

- Extraire le JS inline vers des modules partagés sans casser le wizard existant (tests de non-régression requis).
- **Formules bancaires non figées** : le taux d'endettement 35 %, les barèmes de taux, les frais de notaire doivent être **validés métier** avant industrialisation (risque de donner des chiffres faux/juridiquement sensibles).
- Largeur du header à 6 entrées (desktop ≤ 1024 px).
- Cohérence `build-header.js` / manifeste lors de l'ajout des nouveaux tokens et pages.

## 17. Dépendances

- Vercel (serverless `api/`), Supabase (table `leads` + trigger `notify_new_lead`), Brevo, Systeme.io, GA4 + Google Ads. Toutes déjà en place — aucune nouvelle intégration nécessaire pour les leads/tracking.
- Header centralisé (partials/header.html + build-header.js + navigation.css/js) comme socle.

## 18. Proposition de découpage du développement

Ordre proposé par le brief (CS-1 à CS-9) conservé, avec un **ré-ordonnancement recommandé** (justification technique entre parenthèses) :

| Lot | Contenu | Note |
|---|---|---|
| **CS-1** Fondations | `assets/js/simulators/` + `assets/css/simulators/`, extraction/validation des formules capacité depuis le simulateur existant, plan d'événements GA4 | à faire en premier (socle) |
| **CS-3** Hub Simulateurs | page `/simulateurs` (remplace l'ancre `#simulateurs`) | **recommandé avant les simulateurs individuels** (donne une destination réelle au lien header existant) |
| **CS-4** Capacité d'emprunt | migrer/refactorer le simulateur existant sur le socle CS-1 | décision URL/redirect à trancher |
| **CS-5** Mensualités | nouveau simulateur (réutilise l'annuité) | |
| **CS-6** Taux d'endettement | nouveau simulateur (règles à valider) | |
| **CS-7** Frais de notaire | nouveau simulateur (formule à valider) | |
| **CS-2** Hub Crédit | page `/credit` — **après** arbitrage cannibalisation pret-index/courtage | dépend d'une décision SEO |
| **CS-8** Header V2 | ajout méga « Crédit » + « Simulateurs » en page | **en fin de chaîne** : modifie la nav de production, à ne faire qu'une fois les destinations prêtes |
| **CS-9** Tracking / leads | poser les events simulation_* + brancher chaque simulateur sur `/api/subscribe` | transversal, finalisé ici |

Justification du ré-ordonnancement : le socle (CS-1) et le hub Simulateurs (CS-3) débloquent tout le reste ; le Header V2 (CS-8) est repoussé en fin car il touche la navigation live et ne doit exposer que des destinations existantes ; le Hub Crédit (CS-2) dépend d'une décision SEO préalable (cannibalisation).

## 19. Décisions requises avant développement

1. Sort de `pret-immobilier-index` (consolidation vers `/credit` / redirection / rôle du sous-domaine).
2. URL du simulateur capacité : conserver `/simulation-pret-immobilier` ou migrer vers `/simulateurs/capacite-emprunt` (+ 301).
3. Validation métier des règles de calcul (endettement, barèmes de taux, frais de notaire).
4. « Simulateurs » header : lien simple vers `/simulateurs` ou méga-menu.
5. Correction (ultérieure) des anomalies title/H1 du simulateur.

---

**Audit figé.** 0 page/CSS/JS/header/manifeste/sitemap modifié. Attendre validation avant tout développement (CS-1).
