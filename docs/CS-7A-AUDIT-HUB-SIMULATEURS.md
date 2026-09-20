# CS-7A — Audit & conception du HUB Simulateurs Proactifs

**Projet :** Proactifs Conseils — Simulateurs V2
**Date :** 19 septembre 2026
**Nature :** Audit + conception **uniquement**. Aucun développement, aucun fichier fonctionnel modifié.
**Statut :** Document de cadrage à valider avant CS-7B.

---

## 1. État actuel (existant réel)

### 1.1 Les 3 simulateurs V2 (en production, indexables, gelés)

| Outil | URL | HTTP | robots | Breadcrumb |
|---|---|---|---|---|
| Capacité d'emprunt | `/simulateurs/capacite-emprunt` | 200 | index,follow | Accueil › Simulateurs*(non cliquable)* › Capacité |
| Mensualité de crédit | `/simulateurs/mensualite-credit` | 200 | index,follow | Accueil › Simulateurs* › Mensualité |
| Taux d'endettement | `/simulateurs/taux-endettement` | 200 | index,follow | Accueil › Simulateurs* › Taux d'endettement |

- Socle UMD partagé et **gelé** : `core.js`, `calc-credit.js`, `calc-immo.js`, `rates.js`, `credit-policy.js`, `ui.js`, `lead.js` + CSS `assets/css/simulators/simulators.css`.
- Design commun : ivoire, vert profond, or, cartes blanches, coins arrondis, Cormorant Garamond + Nunito Sans.
- Lead réel `POST /api/subscribe` (service `credit`, `source` par simulateur, aucune donnée financière).
- Analytics : `SimUI.track` avec **allow-list** `ALLOWED_EVENTS` = `simulation_started`, `simulation_completed`, `simulation_result`, `financing_cta_clicked`, `financing_lead_submitted` ; `simulation_result` = bucket only.

### 1.2 Registres centralisés

- `scripts/nav-pages.json` (51 pages) + `partials/header.html` + `scripts/build-header.js` → header injecté entre marqueurs `NAV:START/END`.
- `scripts/breadcrumb-pages.json` (51 pages) + `scripts/build-breadcrumbs.js` → fil d'Ariane + `BreadcrumbList` JSON-LD entre marqueurs `BREADCRUMB(_JSONLD):START/END`.
- `scripts/generate-sitemap.js` → `sitemap.xml` (**53 URLs**, exclut les sources de redirection permanente). Home `/` présente. Aucun `/simulateurs`.

### 1.3 Legacy URLs / redirections (`vercel.json`)

- `cleanUrls: true`, `trailingSlash: false`.
- `/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt` **permanent (308)** ; fichier `simulation-pret-immobilier.html` conservé sur disque (65 Ko), exclu du sitemap.
- Rewrite host `pret-immobilier.proactifsconseils.fr` → `/pret-immobilier-index.html` (**sous-domaine crédit existant**, 76 Ko sur disque).
- `www.` → apex en 308. Aucune règle pour `/simulateurs` (le hub n'existe pas).
- CSP autorise déjà `cdnjs.cloudflare.com` (Chart.js), GA4/gtag, Supabase (`connect-src`).

## 2. Audit home `#simulateurs` (index.html)

**Section `#simulateurs`** : lignes ~1587–1803 d'`index.html` (2927 lignes au total).

- Widget **legacy à 5 onglets** (`switchSim()`) :
  1. **Crédit immobilier** (`calcCredit`) — sliders prix/apport/durée/taux → mensualité + canvas Chart.js. **Doublon** de `/simulateurs/mensualite-credit`.
  2. **Capacité d'emprunt** (`calcCapacite`) — sliders revenus/charges/apport/durée/taux → capacité + canvas ; mention **« Taux d'endettement HCSF 35 % »**. **Doublon** de `/simulateurs/capacite-emprunt`.
  3. **Économies fiscales** (`calcFiscal`) — PER. Pas d'équivalent V2.
  4. **Rendement SCPI** (`calcScpi`). Pas d'équivalent V2.
  5. **Retraite** (`calcRetraite`). Pas d'équivalent V2.
- JS inline dans `index.html` : `switchSim`, `updateRange`, `calcCredit`, `calcFiscal`, `calcScpi`, `calcRetraite`, `calcCapacite` (~lignes 2020–2185). **Chart.js 4.4.1** chargé en lazy depuis cdnjs (ligne 2188).
- CSS inline : ~22 sélecteurs `.sim-tab/.sim-panel/.sim-form/.sim-results/.result-card/.range-row/.chart-wrap`.
- **Aucun lien** de la home vers les 3 pages V2 (`grep` = 0). Le seul CTA sortant du bloc pointe vers `/courtage-credit-immobilier#simulateur`.
- Tracking : pas d'événement `SimUI` (widget hors socle V2).

**Constat clé :** la home entretient ses **propres** calculateurs crédit/capacité, **isolés** des pages V2 — d'où duplication, double maintenance, cadrage réglementaire divergent (« HCSF 35 % » ≠ « repère » neutre V2) et risque de cannibalisation SEO/UX.

## 3. Audit header

- `partials/header.html` : **« Simulateurs » → `{{HOME_PREFIX}}#simulateurs`** (desktop `nav-item` + mobile `m-item`). `HOME_PREFIX` = `/` sur les sous-pages, `` sur la home → `/#simulateurs` partout ailleurs.
- Injecté sur **toutes** les pages via `build-header.js` (index.html inclus, bloc `NAV:START/END`).
- **55 liens** `#simulateurs` dans le site : très majoritairement le header central (2/page), + quelques liens de pied de contenu (ex. footers blog). Migrer le lien header se fait **en un point** (`partials/header.html` + rebuild) ; les rares liens hors header sont à traiter séparément.

## 4. Audit breadcrumbs

- Sur les 3 simulateurs : crumb **« Simulateurs » = label sans URL (non cliquable)**, volontaire tant que le hub n'existe pas (cf. `breadcrumb-pages.json`, `trail: [{Accueil,/},{Simulateurs}]`).
- Avec le hub, migration cible :
  - Hub : `Accueil › Simulateurs` (crumb terminal = page courante).
  - Enfants : `Accueil › Simulateurs(→/simulateurs) › <Outil>` — « Simulateurs » **devient cliquable**.
- Migration **centralisée** : ajouter `"url": "/simulateurs"` au crumb « Simulateurs » des 3 entrées + créer l'entrée hub, puis `build-breadcrumbs.js`. Le builder gère l'insertion/rafraîchissement entre marqueurs (déjà éprouvé en CS-6C).

## 5. Architecture du hub

```
/simulateurs                     (HUB — intention générique, porte d'entrée)
 ├─ /simulateurs/capacite-emprunt      (enfant — intention spécifique)
 ├─ /simulateurs/mensualite-credit     (enfant)
 ├─ /simulateurs/taux-endettement      (enfant)
 └─ [extensible] cout-credit, frais-notaire, rendement-locatif, pret-relais…
```

- Modèle **hub-and-spoke** : le hub relie et qualifie, les enfants calculent.
- Frontière stratégique conservée : **`/simulateurs/*`** = outils / acquisition / calcul ; **`/credit/*`** (ou `/courtage-credit-immobilier`) = expertise / accompagnement / financement. Le hub **pointe vers** l'univers conseil sans s'y substituer.
- Extensibilité : le hub est une **grille de cartes pilotée par données** (un tableau de descripteurs d'outils), afin d'ajouter un futur simulateur = 1 carte + 1 page enfant, sans refonte. Familles prévues à terme : Crédit (actuel), puis Immobilier, Fiscalité, Patrimoine, Retraite, Investissement (regroupables en sections).

## 6. Proposition UX

### 6.1 Positionnement (au-dessus de la simple liste)

- **Eyebrow :** OUTILS & SIMULATEURS
- **H1 (proposé) :** « Simulateurs de crédit immobilier » *(cible SEO nette)* — variante premium : « Simulez votre projet immobilier et financier ». Recommandation : **H1 SEO + sous-titre premium** (voir §7).
- **Promesse :** « Des outils simples et gratuits pour estimer votre capacité d'emprunt, votre mensualité et votre taux d'endettement — et préparer sereinement vos décisions. »
- **Pont narratif :** SIMULATION → COMPRÉHENSION → CONSEIL → ACCOMPAGNEMENT (bandeau court, pas un mur de texte).

### 6.2 Cartes premium des 3 outils

| Ordre | Outil | Question (microcopy) | CTA | URL |
|---|---|---|---|---|
| 1 | Capacité d'emprunt | « Combien puis-je emprunter ? » | Calculer ma capacité | /simulateurs/capacite-emprunt |
| 2 | Mensualité de crédit | « Combien vais-je rembourser chaque mois ? » | Calculer ma mensualité | /simulateurs/mensualite-credit |
| 3 | Taux d'endettement | « Quelle part de mes revenus est déjà engagée ? » | Calculer mon taux d'endettement | /simulateurs/taux-endettement |

- Ordre = parcours d'achat logique (capacité → mensualité → endettement).
- Carte = icône (SVG inline, jeu cohérent), titre, question, 1 ligne de bénéfice, CTA. Cartes blanches, coins arrondis, ombre douce, hover discret.
- Chaque carte est **entièrement cliquable** (lien enveloppant) + CTA visible.

### 6.3 Bloc « Par où commencer ? » (optionnel, léger)

3 entrées : « Vous préparez un achat ? → Capacité » / « Vous connaissez le montant du prêt ? → Mensualité » / « Vous voulez mesurer vos charges ? → Taux d'endettement ». **Recommandation :** l'inclure en version compacte (3 lignes) — améliore réellement l'orientation sans alourdir. À ne pas transformer en quiz.

## 7. Proposition SEO

**Principe :** le hub cible l'**intention générique** ; les enfants gardent les intentions spécifiques (aucune cannibalisation de capacité/mensualité/endettement).

- **Intentions hub (sans volumes inventés) :** « simulateur crédit immobilier », « simulateur prêt immobilier », « calcul crédit immobilier », « outils financement immobilier », « simulateurs financiers ».
- **title (proposé) :** « Simulateurs de crédit immobilier gratuits | Proactifs »
- **meta description :** « Capacité d'emprunt, mensualité, taux d'endettement : les simulateurs gratuits de Proactifs Conseils pour préparer votre projet immobilier. Estimation immédiate. »
- **H1 :** « Simulateurs de crédit immobilier »
- **H2 :** (1) « Nos outils de simulation », (2) « Par où commencer ? », (3) « De la simulation à l'accompagnement », (4) « Questions fréquentes ».
- **Intro :** 2–3 phrases génériques (pas de recopie des contenus enfants).
- **FAQ :** 3–4 Q/R génériques (« Les simulateurs sont-ils gratuits ? », « Les résultats ont-ils une valeur contractuelle ? », « Quelle différence avec une étude personnalisée ? ») → `FAQPage` JSON-LD.
- **Maillage interne :** hub → 3 enfants (cartes) ; 3 enfants → hub (via breadcrumb cliquable) ; hub → `/courtage-credit-immobilier` (conseil).
- **Structured data :** `BreadcrumbList` (centralisé) + `ItemList` des 3 outils + `FAQPage`. Pas de `SoftwareApplication` (surqualité inutile ici).
- **Non-cannibalisation home :** la home cible « gestion de patrimoine à Colombes » (title actuel) — intention distincte, aucun conflit avec le hub.

## 8. Stratégie home `#simulateurs` (recommandation argumentée)

**Options :** A) supprimer · B) conserver · C) remplacer par des cartes V2 · D) autre.

**Recommandation : C (remplacement par des cartes vers les outils V2), avec traitement des onglets sans équivalent.**

Arguments :
- **Anti-duplication / anti-cannibalisation :** les onglets Crédit et Capacité de la home **dupliquent** les pages V2 et n'y renvoient pas ; deux moteurs concurrents pour la même requête nuisent au SEO et à la cohérence.
- **Conformité :** la home affiche « HCSF 35 % » comme règle ; la doctrine V2 est le **repère neutre**. Garder les deux crée une incohérence de discours (risque image/réglementaire).
- **Maintenance :** supprime la double maintenance (JS de calcul + Chart.js dans `index.html`) et une dépendance externe (cdnjs).
- **Conversion :** des cartes premium qui **envoient vers les pages V2** (mieux converties, lead réel branché) valent mieux qu'un widget qui retient l'utilisateur sur la home.

Traitement des onglets **sans équivalent V2** (Fiscal, SCPI, Retraite) :
- Ne pas les jeter sans remplacement. Les convertir en **cartes de renvoi** vers les pages de service/blog existantes (`optimisation-fiscale-ile-de-france`, `investissement-scpi-hauts-de-seine`, `preparation-retraite`) ou les marquer « bientôt » si un futur simulateur est prévu.
- Résultat : la section home devient une **grille de cartes** (3 outils crédit V2 + renvois thématiques), sans calculateur inline.

**Sécurité de migration :** conserver l'ancre `#simulateurs` sur la home (les 55 liens entrants continuent de fonctionner) ; ne retirer le JS/CSS/Chart.js legacy qu'une fois les cartes en place et vérifiées.

## 9. Stratégie navigation

- **Header :** migrer « Simulateurs » de `/#simulateurs` vers **`/simulateurs`** (le hub devient la porte d'entrée). Édition **unique** de `partials/header.html`, puis `build-header.js` régénère toutes les pages. Impacts : desktop + mobile (`m-item`), 51 pages, cohérence ancre → page réelle. **À faire seulement une fois le hub en ligne** (sinon lien vers page inexistante).
- **Breadcrumb :** rendre « Simulateurs » cliquable → `/simulateurs` + entrée hub (cf. §4), via `breadcrumb-pages.json` + builder.
- **Liens de contenu** hors header pointant vers `/#simulateurs` (footers blog, etc.) : à rediriger vers `/simulateurs` lors de la même phase (petit lot).

## 10. Conversion

- **Ton :** non agressif, orienté valeur. Message pivot : « Une simulation vous donne un chiffre. Une étude personnalisée construit votre financement. »
- **Emplacements :** (1) CTA discret sous la grille de cartes ; (2) bloc de conversion final « Étudier mon financement » → `/courtage-credit-immobilier` (page commerciale existante) ; (3) réassurance (gratuit · sans engagement · accompagnement Proactifs).
- **Lead :** le hub **n'ouvre pas** de formulaire lead propre en V1 (les pages enfants portent déjà le lead réel). Le hub convertit par **renvoi** vers les outils et vers la page conseil. (Un lead direct sur le hub pourra être ajouté plus tard, même schéma `/api/subscribe`, sans donnée financière.)

## 11. Analytics (documentation seule)

- Existant : `SimUI.track` filtré par `ALLOWED_EVENTS` (5 événements). **Le hub n'est pas couvert** par cette liste.
- Proposition (à valider) : ajouter des événements hub — `simulator_hub_view`, `simulator_card_clicked` (avec `tool: capacite|mensualite|endettement`, **jamais** de donnée financière/PII), `financing_cta_clicked`.
- **Point d'architecture :** `ALLOWED_EVENTS` vit dans `ui.js` (socle gelé). Deux voies :
  - (a) **Extension additive** de `ALLOWED_EVENTS` (3 events en plus) — modification minime, sans changement de comportement, mais **touche le socle** → à valider explicitement.
  - (b) Tracking hub **séparé** (petit helper GA4 dédié au hub) — n'ouvre pas le socle, mais duplique une logique.
  - **Recommandation :** (a), encadrée et testée, car elle garde un seul point de vérité analytics. À trancher en CS-7B.

## 12. Architecture future (extensibilité)

- Hub = grille pilotée par un tableau de descripteurs (`{clé, titre, question, cta, url, icône, famille}`) → ajouter un outil = 1 descripteur + 1 page enfant.
- Prochains enfants pressentis (non développés) : `/simulateurs/cout-credit`, `/simulateurs/frais-notaire`, `/simulateurs/rendement-locatif`, `/simulateurs/pret-relais`.
- Regroupement futur par **familles** (Crédit, Immobilier, Fiscalité, Patrimoine, Retraite, Investissement) via des sections du hub, sans changer l'URL du hub.

## 13. Risques SEO / techniques

| Risque | Détail | Mitigation |
|---|---|---|
| Cannibalisation | Hub vs enfants sur requêtes crédit | Hub = générique, enfants = spécifiques ; maillage clair |
| Duplication home | Widget legacy vs pages V2 | Remplacer par cartes (option C, §8) |
| Liens `#simulateurs` | 55 liens (surtout header) | Migration centralisée header + lot de liens de contenu |
| Doctrine « HCSF 35 % » | Incohérence avec « repère » V2 | Retrait du widget legacy |
| Breadcrumb | Rendre « Simulateurs » cliquable sans casser les 3 enfants | Builder centralisé, `--check` |
| Sitemap | Ajouter `/simulateurs`, garder l'exclusion des redirigées | `generate-sitemap.js` (déjà corrigé CS-5E.1) |
| Header central | Lien vers page inexistante si migré trop tôt | Migrer le header **après** mise en ligne du hub |
| Chart.js | Dépendance externe legacy | Supprimée avec le widget |
| Analytics | `ALLOWED_EVENTS` gelé | Décision (a)/(b) en CS-7B |
| Responsive | Grille de cartes sur 320–1440 | QA multi-largeurs |
| Sous-domaine crédit | `pret-immobilier-index` (rewrite host) | Hors périmètre hub ; ne pas toucher |

## 14. Fichiers potentiellement concernés (aux phases suivantes, PAS en CS-7A)

- **Créés :** `simulateurs/index.html` (le hub), éventuellement `assets/js/simulators/hub.js` (grille + tracking) — à décider.
- **Modifiés (phases ultérieures) :** `index.html` (remplacement `#simulateurs`), `partials/header.html` (lien → /simulateurs) + rebuild pages, `scripts/nav-pages.json`, `scripts/breadcrumb-pages.json`, `sitemap.xml`, possiblement `ui.js` (extension `ALLOWED_EVENTS`, à valider), `vercel.json` (rewrite `/simulateurs` si besoin — cleanUrls gère déjà `/simulateurs/index.html` → `/simulateurs`).
- **Jamais touchés :** moteurs/policy/CSS socle, les 3 pages simulateurs, `/courtage-credit-immobilier`, `pret-immobilier-index` + sous-domaine, `/api/subscribe`, Supabase/Brevo/Systeme.io.

## 15. Ordre recommandé (CS-7B et suivants)

Après audit, l'ordre le plus sûr (le hub doit exister et être fiable **avant** qu'on pointe le header/la home dessus) :

1. **CS-7B — Construction du hub en preview (`noindex`)** : `simulateurs/index.html`, cartes + SEO + conversion + responsive, breadcrumb preview-local, tests + QA. Décision analytics (a)/(b). Aucune modif nav/home.
2. **CS-7C — Publication du hub** : `index,follow`, canonical, ajout `nav-pages.json`/`breadcrumb-pages.json` (Simulateurs devient cliquable), sitemap. Le hub est en ligne et indexable, mais la home et le header ne pointent pas encore dessus.
3. **CS-7D — Bascule home + header** : remplacement `#simulateurs` de `index.html` par les cartes (retrait widget/JS/Chart.js legacy), migration lien header `/#simulateurs` → `/simulateurs`, traitement des liens de contenu. Rebuild header/breadcrumbs.
4. **CS-7E — Production + QA** : merge main, déploiement, QA production (hub 200/index/canonical/breadcrumb, cartes → enfants, home sans doublon, header, sitemap, 308 legacy intact, responsive, analytics).

> Variante possible : fusionner 7C+7D si ChatGPT préfère une bascule unique. Recommandation : garder 7C (hub indexé seul) **avant** 7D (bascule nav/home) pour minimiser la fenêtre de risque.

## 16. Wireframe textuel du hub

```
┌──────────────────────────────────────────────┐
│  [HEADER CENTRAL]                              │
│  Accueil › Simulateurs            (breadcrumb) │
│                                                │
│  OUTILS & SIMULATEURS                (eyebrow) │
│  Simulateurs de crédit immobilier        (H1)  │
│  Des outils simples et gratuits pour     (sub) │
│  estimer et préparer votre projet.             │
│                                                │
│  ── Nos outils de simulation ──          (H2)  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐     │
│  │ [icône]   │ │ [icône]   │ │ [icône]   │     │
│  │ Capacité  │ │ Mensualité│ │ Taux      │     │
│  │ d'emprunt │ │ de crédit │ │ d'endett. │     │
│  │ « Combien │ │ « Combien │ │ « Quelle  │     │
│  │  emprunter?│ │ /mois ? » │ │ part ? »  │     │
│  │ [Calculer]│ │ [Calculer]│ │ [Calculer]│     │
│  └───────────┘ └───────────┘ └───────────┘     │
│                                                │
│  ── Par où commencer ? ──                (H2)  │
│  • Achat en préparation → Capacité             │
│  • Montant du prêt connu → Mensualité          │
│  • Mesurer ses charges → Taux d'endettement    │
│                                                │
│  ── De la simulation à l'accompagnement ─ (H2) │
│  « Une simulation donne un chiffre. Une étude  │
│   personnalisée construit votre financement. » │
│  [ Étudier mon financement → /courtage… ]      │
│  Gratuit · Sans engagement · Accompagnement    │
│                                                │
│  ── Questions fréquentes ──              (H2)  │
│  ▸ Gratuit ?  ▸ Valeur contractuelle ?         │
│  ▸ Différence avec une étude ?                 │
│                                                │
│  [FOOTER GLOBAL]                               │
└──────────────────────────────────────────────┘
Responsive : 3 cartes → 2 → 1 colonne (≤640px), zéro overflow, CTA pleine largeur en mobile.
```

## 17. Recommandation finale

- **Créer `/simulateurs`** comme hub premium hub-and-spoke, cohérent avec le design V2, ciblant l'intention générique et renvoyant vers les 3 outils + la page conseil.
- **Remplacer** (option C) le widget legacy de la home par des cartes vers les V2, en retirant les calculateurs inline, Chart.js et le cadrage « HCSF 35 % ».
- **Migrer** header + breadcrumb vers le hub **après** sa mise en ligne, via les systèmes centralisés.
- **Séquence :** 7B (preview) → 7C (publication hub) → 7D (bascule home+header) → 7E (prod+QA).
- **Points à trancher avant CS-7B :** (1) H1 SEO vs premium ; (2) sort des onglets Fiscal/SCPI/Retraite de la home (renvois vs « bientôt ») ; (3) analytics (a) extension `ALLOWED_EVENTS` vs (b) tracking hub séparé ; (4) fusion éventuelle 7C+7D.

---

*Fin CS-7A. Document d'audit et de conception uniquement — aucun fichier fonctionnel modifié, aucun développement, aucun commit/déploiement. En attente de validation ChatGPT pour lancer CS-7B.*
