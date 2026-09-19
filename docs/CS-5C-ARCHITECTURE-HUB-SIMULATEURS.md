# CS-5C — Architecture & audit du hub « Proactifs Simulateurs »

**Projet :** Proactifs Conseils — Simulateurs V2
**Phase :** CS-5C — AUDIT / ARCHITECTURE / RECOMMANDATION (aucune implémentation)
**Date :** 18 septembre 2026
**Branche :** `credit-simulateurs-v2` · **HEAD :** `ec63d72` (CS-5B.1)
**Statut :** document de cadrage — à faire réviser par ChatGPT avant toute implémentation

> Ce document est **exclusivement** un livrable d'analyse. Aucune page, navigation, sitemap, redirection, calcul ou déploiement n'a été modifié. Le seul fichier créé par CS-5C est ce document.

---

## 1. Executive summary

Proactifs dispose aujourd'hui de **deux familles UX de simulateurs validées** :

- **Simulateur guidé** (capacité d'emprunt) : multi-étapes, situation personnelle, résultat à interpréter.
- **Simulateur direct** (mensualité de crédit) : peu de données, résultat immédiat, comparateur, pédagogie après résultat.

Le socle technique gelé (CS-1 → CS-5B.1) est **plus riche que les deux pages livrées** : `calc-credit.js` expose déjà des primitives directement réutilisables pour **taux d'endettement** (`calculateDebtRatio`), **coût du crédit** (`calculateCreditCost`) et **budget** (`calculateBudget`) ; `calc-immo.js` couvre déjà **rendement locatif** (`grossYield`, `netYieldSimple`) et **effort d'épargne** (`savingsEffort`). En revanche, **aucun barème de frais de notaire ni règle de plus-value** n'existe (exclus volontairement du socle).

Trois constats structurants ressortent de l'audit :

1. **Doublon d'intention non résolu.** La section d'accueil `/#simulateurs` — cible actuelle du lien « Simulateurs » du header (107 liens internes) — contient **trois calculateurs legacy inline** (mensualité, capacité, économies fiscales) qui **recouvrent directement** les deux pages V2. Deux pages legacy indexées (`/simulation-pret-immobilier`, `/pret-immobilier-index`) ajoutent au risque de cannibalisation sur l'intention « prêt / simulation ».
2. **Migration 301 planifiée mais non exécutée.** `docs/NAVIGATION-PROACTIFS.md` prévoyait la redirection `simulation-pret-immobilier → /simulateurs/capacite-emprunt` en CS-4 ; elle n'est **pas** dans `vercel.json` et la page legacy reste `index,follow`. C'est une dette SEO active à traiter **avant** d'étendre le catalogue.
3. **Le hub `/simulateurs` n'existe pas encore**, et la brique de mensualité est toujours `noindex` (preview). Créer le hub maintenant serait prématuré : il n'aurait qu'un seul outil réellement indexable à lister.

**Recommandations principales :**

- **3ᵉ simulateur (CS-6) recommandé : Taux d'endettement** — UX directe, socle déjà prêt (`calculateDebtRatio` + `maxDebtRatio 0.35`), complémentarité forte avec capacité + mensualité, intention SEO distincte, excellent pont vers le courtage, risque métier faible.
- **Hub `/simulateurs` : option B — attendre le 3ᵉ outil.** Le publier une fois que mensualité est passé en `index` et que le 3ᵉ simulateur existe (≥ 3 outils indexables), pour qu'il ait une vraie valeur de maillage et de catégorisation.
- **Prérequis transverse : résoudre la dette legacy** (301 de `simulation-pret-immobilier`, arbitrage `pret-immobilier-index` + sous-domaine) et **clarifier le rôle de `/#simulateurs`** avant d'ouvrir de nouvelles URLs, sous peine d'empiler les doublons.

---

## 2. État actuel

### 2.1 Socle technique gelé (CS-1 → CS-5B.1)

| Fichier | Rôle | Primitives clés |
|---|---|---|
| `assets/js/simulators/core.js` | Maths pures, aucun DOM/réseau | `monthlyPayment`, `principalFromPayment`, `creditCost`, `annuityFactor`, `monthsFromYears`, `round`, `toNumber`, `clampMin` |
| `assets/js/simulators/rates.js` | Référentiel taux | `getMarketRate`, `ACTIVE_MARKET_REFERENCE` (réf. **septembre 2026**), `LEGACY_REFERENCE` |
| `assets/js/simulators/calc-credit.js` | Calculs crédit (hypothèses explicites) | `calculateMonthlyPayment`, `calculateBorrowingCapacity`, `calculateMaxPayment`, **`calculateDebtRatio`**, **`calculateCreditCost`**, `calculateBudget` |
| `assets/js/simulators/calc-immo.js` | Calculs immo génériques | **`grossYield`**, **`netYieldSimple`**, **`savingsEffort`**, `totalProjectCost` — **aucun** notaire / plus-value / LMNP / succession |
| `assets/js/simulators/credit-policy.js` | Politique crédit | `PROACTIFS_CREDIT_POLICY_V1` (`maxDebtRatio 0.35`, `publicDurations [10,15,20,25]`), RELIABILITY, REVIEW_FLAGS, WARNING_CODES (`NOT_A_BANK_DECISION`) |
| `assets/js/simulators/ui.js` | Formatage, tracking, état | `formatEuro`, `formatPercent`, `track` (5 events, drop PII), `setState` |
| `assets/js/simulators/lead.js` | Lead | `buildLeadPayload`, `isSubmittable`, `submitLead(payload, transport)` |
| `assets/js/simulators/prototype-capacity.js` | Adaptateur capacité (guidé) | — |
| `assets/js/simulators/prototype-mensualite.js` | Adaptateur mensualité (direct) | — |
| `assets/css/simulators/simulators.css` | Primitives design `.sim-*` | `.sim-root .sim-container .sim-step .sim-field .sim-progress .sim-result .sim-cta .sim-cta--ghost .sim-msg .sim-error .sim-success` |

**Implication majeure :** les candidats crédit les plus évidents (endettement, coût du crédit) ne nécessitent **aucune nouvelle formule** — seulement un adaptateur + une page. Côté immo, rendement et effort d'épargne sont également prêts ; **frais de notaire et plus-value ne le sont pas**.

### 2.2 Pages simulateurs V2 livrées

| Page | URL | Indexation | Famille UX | Statut |
|---|---|---|---|---|
| `simulateurs/capacite-emprunt.html` | `/simulateurs/capacite-emprunt` | `index, follow` | Guidé | Publié (CS-4C), dans sitemap + nav + breadcrumb |
| `simulateurs/mensualite-credit.html` | `/simulateurs/mensualite-credit` | `noindex, nofollow` | Direct | Preview (CS-5B.1), **absent** du sitemap / nav / breadcrumb |

### 2.3 Le « Simulateurs » du header ≠ un hub

- Le header central (`partials/header.html`) pointe « Simulateurs » vers **`{{HOME_PREFIX}}#simulateurs`** — une **ancre de l'accueil**, pas une page.
- `docs/NAVIGATION-PROACTIFS.md` le confirme : « Simulateurs (`#simulateurs`) est une ancre de l'accueil, pas une page autonome — rien à migrer. »
- Le fil d'Ariane de `capacite-emprunt` affiche un crumb **« Simulateurs » sans URL** (label non cliquable) : cohérent tant qu'aucun hub n'existe, mais c'est une « catégorie fantôme » qui appelle une vraie page à terme.

### 2.4 La section `/#simulateurs` de l'accueil (legacy inline)

Elle héberge **trois calculateurs JS inline**, indépendants du socle V2 :

1. **Simulateur crédit immobilier** (mensualité) — prix, montant, apport, durée, taux → mensualité, coût total.
2. **Combien puis-je emprunter ?** (capacité) — revenus, charges, apport, durée, taux → mensualité max, endettement 35 %, capacité, budget. CTA → `/courtage-credit-immobilier#simulateur` (« Simuler votre projet, 7 étapes, 2 mn »).
3. **Simulateur économies fiscales** — revenus, situation familiale → estimation d'économie d'impôt.

→ **Doublon d'intention** direct avec `capacite-emprunt` et `mensualite-credit` V2, sur le même domaine.

---

## 3. Inventaire des URLs existantes (données réelles du dépôt)

| URL | Fichier | Indexation | Sitemap | Rôle réel | Chevauchement |
|---|---|---|---|---|---|
| `/simulateurs/capacite-emprunt` | `simulateurs/capacite-emprunt.html` | index | ✅ | Simulateur guidé V2 | — (référence) |
| `/simulateurs/mensualite-credit` | `simulateurs/mensualite-credit.html` | noindex | ❌ | Simulateur direct V2 (preview) | — |
| `/#simulateurs` | `index.html` (section) | (accueil) | ✅ (accueil) | 3 calculateurs inline legacy | **Fort** (capacité + mensualité) |
| `/simulation-pret-immobilier` | `simulation-pret-immobilier.html` | **index** | ✅ | Page « Simulation Prêt Immobilier » legacy (title avec typo « e ») | **Fort** (intention simulation prêt) |
| `/pret-immobilier-index` | `pret-immobilier-index.html` | **index** | ✅ | Landing « Courtier en Prêt Immobilier Colombes 92 » ; sert aussi le **sous-domaine** `pret-immobilier.proactifsconseils.fr` (rewrite `vercel.json`) | Moyen (courtage) |
| `/courtage-credit-immobilier` | `courtage-credit-immobilier.html` | index | ✅ | Page commerciale courtage (ancre `#simulateur`, funnel 7 étapes) | Moyen (courtage / financement) |

**Sous-domaine :** `pret-immobilier.proactifsconseils.fr` → rewrite vers `/pret-immobilier-index.html`. Statut documenté `INTENTIONAL_LEGACY` (décision consolidation/301/Ads/suppression **reportée au chantier Crédit V2**).

**Dette 301 non exécutée :** `NAVIGATION-PROACTIFS.md` (l. 649, 681) prévoyait la migration `simulation-pret-immobilier → /simulateurs/capacite-emprunt` (301) « en CS-4 ». Elle **n'apparaît pas** dans les `redirects` de `vercel.json` et la page reste `index,follow`. → **cannibalisation active** entre la page legacy et le simulateur V2.

> Aucune donnée de trafic/position n'est disponible dans le repo. Volume, CPC, positions, impressions, clics, concurrence : **à mesurer via Agent SEO / GSC**.

---

## 4. Architecture cible proposée

### 4.1 Principe directeur

**Une intention = une page canonique.** Quand une intention est « calculatoire », c'est la page `/simulateurs/*` (riche) qui doit la porter — pas un doublon inline ou une page legacy.

### 4.2 Arborescence cible (à valider, non définitive)

```
/simulateurs                         (HUB — à créer plus tard, cf. §6/§17)
  /simulateurs/capacite-emprunt      ✅ existe (guidé)
  /simulateurs/mensualite-credit     ✅ existe (direct, à passer index à la publication)
  /simulateurs/taux-endettement      ◻ candidat CS-6 (direct) — socle prêt
  /simulateurs/cout-credit           ◻ candidat (direct) — socle prêt
  /simulateurs/pret-relais           ◻ candidat (guidé léger) — à cadrer
  /simulateurs/frais-notaire         ◻ candidat immo (direct) — barème à créer
  /simulateurs/rendement-locatif     ◻ candidat immo (direct/guidé léger) — socle prêt
```

Le sous-dossier est cohérent avec le précédent **`immobilier/`** (`/immobilier/estimation-colombes`, `/immobilier/succession-colombes`), déjà en production avec breadcrumb et thème CSS dédié.

### 4.3 Traitement du legacy (recommandé, hors périmètre CS-5C)

- `/#simulateurs` (accueil) : à terme, remplacer les 3 calculateurs inline par des **cartes/liens** vers les pages `/simulateurs/*` (l'accueil « teasent », les pages « portent »). Évite la double intention sur le domaine.
- `/simulation-pret-immobilier` : exécuter le **301 → `/simulateurs/capacite-emprunt`** (ou vers le hub) prévu de longue date. Corriger la typo « e » à cette occasion (déjà 301, donc sans risque).
- `/pret-immobilier-index` + sous-domaine : arbitrage Crédit V2 (consolidation vs maintien Ads). À ne pas mélanger avec les simulateurs (intention **courtage commercial**, pas calcul).

---

## 5. Matrice des simulateurs candidats

Légende priorité : **P1** (prochain lot), **P2** (ensuite), **P3** (utile, plus loin), **PLUS TARD**, **NON RECOMMANDÉ**.
Type UX : **D** = direct, **G** = guidé.
Complexité / risque : Faible / Moyen / Élevé.

### CRÉDIT IMMOBILIER

| Simulateur | URL recommandée | Intention utilisateur | Intention SEO principale | Question | Entrées | Résultat principal | Résultats secondaires | Socle réutilisable | Complexité | Risque métier | Risque cannibalisation | Maillage | Conversion | UX | Priorité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Capacité d'emprunt | `/simulateurs/capacite-emprunt` | Savoir combien emprunter | « capacité d'emprunt » | Combien puis-je emprunter ? | revenus, charges, apport, durée, taux | capacité | mensualité max, endettement, budget | `calculateBorrowingCapacity`, `calculateMaxPayment`, `calculateBudget` | — (livré) | Moyen | vs `/#simulateurs` + `simulation-pret-immobilier` | Élevé | Élevée | G | **Livré** |
| Mensualité de crédit | `/simulateurs/mensualite-credit` | Savoir sa mensualité | « calcul mensualité prêt » | Combien vais-je rembourser/mois ? | montant, durée, taux, assurance | mensualité | coût crédit, total, comparateur durées | `calculateMonthlyPayment`, `calculateCreditCost` | — (livré, à indexer) | Faible | vs `/#simulateurs` | Élevé | Moyenne-Élevée | D | **Livré (preview)** |
| **Taux d'endettement** | `/simulateurs/taux-endettement` | Vérifier sa marge d'emprunt | « calcul taux d'endettement » | Quelle part de mes revenus est engagée ? | revenus, charges/crédits | taux d'endettement (%) | marge sous 35 %, capacité résiduelle | **`calculateDebtRatio`** + `maxDebtRatio` | **Faible** | Faible (règle HCSF connue) | Faible (intention distincte) | **Élevé** (pont capacité↔courtage) | **Élevée** | D | **P1** |
| Coût du crédit | `/simulateurs/cout-credit` | Voir le coût total des intérêts | « coût total crédit immobilier » | Combien mon crédit me coûte ? | montant, durée, taux (± assurance) | coût total intérêts | total remboursé, part intérêts | **`calculateCreditCost`** | Faible | Faible | **Moyen** (proche mensualité) | Moyen | D | **P2** |
| Prêt relais | `/simulateurs/pret-relais` | Estimer le montant mobilisable avant vente | « simulateur prêt relais » | Combien avant la vente de mon bien ? | valeur bien, quotité, crédit restant | montant relais estimé | reste à financer, alertes | `core` + quotité (paramètre) ; règle à cadrer | Moyen-Élevé | **Élevé** (produit spécifique, hypothèses) | Faible (niche) | Moyen | Moyen (fort si page `/credit/pret-relais` distincte) | G léger | **P3** |
| Apport nécessaire | `/simulateurs/apport-necessaire` | Savoir l'apport requis | « apport prêt immobilier » | Quel apport pour mon projet ? | prix, frais, capacité | apport cible | % apport, reste à financer | `calculateBudget` inversé | Moyen | Moyen | Moyen (proche capacité) | Moyen | Moyen | D/G | PLUS TARD |
| Durée de crédit | (fondre dans mensualité) | Optimiser la durée | « durée prêt immobilier » | Quelle durée choisir ? | montant, mensualité cible, taux | durée | coût selon durée | `principalFromPayment` / itération | Faible | Faible | **Élevé** (déjà couvert par le comparateur de mensualité) | Faible | Faible | D | NON RECOMMANDÉ (doublon comparateur) |

### IMMOBILIER

| Simulateur | URL recommandée | Intention utilisateur | Intention SEO principale | Question | Entrées | Résultat principal | Résultats secondaires | Socle réutilisable | Complexité | Risque métier | Risque cannibalisation | Maillage | Conversion | UX | Priorité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Frais de notaire** | `/simulateurs/frais-notaire` | Estimer les frais d'acquisition | « frais de notaire 2026 » | Combien de frais de notaire ? | prix, ancien/neuf, département | frais estimés | détail (droits, émoluments), coût total projet | `totalProjectCost` (mais **barème à créer**) | **Élevé** (barème + exactitude) | **Élevé** (chiffre attendu précis) | Faible (intention forte, non couverte) | **Élevé** (immo + acquisition) | Moyenne | D | **P2 (immo)** |
| Rendement locatif | `/simulateurs/rendement-locatif` | Évaluer la rentabilité | « calcul rendement locatif » | Mon investissement rapporte combien ? | prix, loyer, charges | rendement brut/net | cash-flow indicatif | **`grossYield`, `netYieldSimple`** | **Faible** | Moyen (net simplifié, hors fiscalité) | Faible | Élevé (investissement, SCPI, LMNP) | Moyenne | D/G | **P3 (immo)** |
| Plus-value immobilière | `/simulateurs/plus-value` | Estimer l'impôt sur la plus-value | « calcul plus-value immobilière » | Combien d'impôt à la revente ? | prix achat/vente, durée détention | plus-value nette imposable | abattements, IR + PS | **aucun** (fiscalité exclue du socle) | Élevé | **Élevé** (barèmes/abattements, exactitude) | Faible | Moyen | G | PLUS TARD |
| Budget d'acquisition | `/simulateurs/budget-acquisition` | Cadrer le budget global | « budget achat immobilier » | Quel budget total viser ? | apport, capacité, frais | budget total | répartition | `calculateBudget` + notaire | Moyen | Moyen | **Élevé** (proche capacité + notaire) | Moyen | Moyenne | G | PLUS TARD |

### PATRIMOINE / FISCALITÉ (phase lointaine)

| Simulateur | URL recommandée | Intention | Socle | Complexité | Priorité |
|---|---|---|---|---|---|
| Économie d'impôt PER | `/simulateurs/economie-impot-per` | « simulateur PER économie d'impôt » | Aucun (fiscalité IR à créer) ; recouvre le calculateur inline accueil + skill `patrimoine-fiscal-fr` | Élevé | PLUS TARD |
| Effort d'épargne | `/simulateurs/effort-epargne` | « effort d'épargne investissement » | **`savingsEffort`** (prêt) | Faible-Moyen | PLUS TARD |
| Donation / transmission | `/simulateurs/donation` | « calcul droits de donation » | Aucun (barème fiscal) | Élevé | PLUS TARD |

> Le catalogue patrimoine n'est pertinent qu'après consolidation de la famille crédit + immo. Ne pas créer d'outils pour « remplir » le hub.

---

## 6. Architecture du hub `/simulateurs`

**À concevoir, pas à créer maintenant** (cf. §17 pour le moment de création).

Le hub ne doit **pas** être un mur de boutons. Organisation par **familles**, chaque carte portant une **question utilisateur** (pas un nom d'outil).

**H1 :** « Simulateurs immobiliers & crédit »
**Proposition de valeur :** « Estimez, comparez, décidez — puis faites analyser votre projet par un expert Proactifs. »
**Intro (2-3 phrases) :** des outils gratuits et immédiats ; résultats indicatifs, non contractuels ; passage naturel vers un accompagnement personnalisé.

**Familles (structure des cartes) :**

```
CRÉDIT IMMOBILIER — « Préparez votre financement »
  • Capacité d'emprunt   → Combien puis-je emprunter ?
  • Mensualité           → Combien vais-je rembourser chaque mois ?
  • Taux d'endettement   → Quelle part de mes revenus est déjà engagée ?
  • Coût du crédit       → Combien mon financement me coûtera-t-il ?
  • (Prêt relais)        → Quel montant mobiliser avant la vente ?   [si livré]

SIMULATEURS IMMOBILIERS — « Préparez votre projet immobilier »
  • Frais de notaire     → Quels frais d'acquisition prévoir ?
  • Rendement locatif    → Mon investissement est-il rentable ?

SIMULATEURS PATRIMOINE — (phase ultérieure)
```

**Micro-copy carte :** titre = outil, sous-titre = question, micro-tag UX (« 2 min », « immédiat »).
**CTA transverse (bas de hub) :** bloc conversion vert/or « Votre projet mérite plus qu'une simulation » → « Étudier mon financement » (composant CS-5B.1).
**Maillage :** chaque carte → sa page ; chaque page → hub (breadcrumb) + 2-3 cross-links (cf. §10).
**Contenu pédagogique :** court chapô + éventuelle FAQ légère (« indicatif / non contractuel », « comment ces outils sont calculés ») — pas 2 000 mots.

**SEO du hub :** cible l'intention générique « simulateurs crédit / immobilier » + rôle de **page pilier** (hub-and-spoke) distribuant l'autorité vers les pages outils. Volume à mesurer via Agent SEO / GSC.

---

## 7. Relation Crédit / Simulateurs / Immobilier / Patrimoine

La nav V2 envisagée (`docs/NAVIGATION-PROACTIFS.md`) : **Patrimoine · Immobilier · Crédit · Simulateurs · Le cabinet · Ressources** — **non validée**.

Répartition des rôles proposée (sans créer d'URL) :

| Univers | Rôle | Exemple de pages |
|---|---|---|
| **Simulateurs** | Outils calculatoires, entrée de funnel, SEO informationnel/transactionnel | `/simulateurs/*` |
| **Crédit / Courtage** | Pages **commerciales** : offre, accompagnement, produits | `/courtage-credit-immobilier`, (futurs `/credit/pret-relais`, `/credit/assurance-emprunteur`…) |
| **Immobilier** | Vente, estimation, investissement | `/immobilier`, `/immobilier/estimation-colombes`, `/investissement-immobilier` |
| **Patrimoine** | Conseil global, fiscalité, transmission | `/bilan-patrimonial`, `/optimisation-fiscale-*`, `/transmission` |

**Règle anti-doublon :** ne pas créer deux pages pour une même intention.
- Ex. **ne pas** avoir `/credit/capacite-emprunt` **et** `/simulateurs/capacite-emprunt` si l'intention est identique → une seule page (le simulateur riche) porte l'intention.
- Séparation **légitime** si les intentions diffèrent réellement :
  - `/credit/pret-relais` = information/accompagnement commercial ;
  - `/simulateurs/pret-relais` = calculateur.
  Dans ce cas, cross-link fort entre les deux (l'un explique, l'autre calcule). **À analyser, pas à imposer.**

**Legacy à arbitrer :** `pret-immobilier-index` (+ sous-domaine) et `simulation-pret-immobilier` doivent être rangés dans **Crédit/Courtage** (commercial) ou **Simulateurs** (calcul) — pas les deux. Décision Crédit V2.

---

## 8. Design System Simulateurs

À partir des deux pages validées, distinction **communs / spécifiques**.

**Composants COMMUNS (réutilisables tels quels) :**

- Hero simulateur : eyebrow + H1 + promesse + CTA + réassurance (« Gratuit · Sans engagement · Résultat immédiat »).
- Panel formulaire `.sim-root` / `.sim-container` / `.sim-field`.
- Champs numériques FR (`ui.toNumber`, formatage `formatEuro`/`formatPercent`).
- Bouton CTA or `.sim-cta` (+ `.sim-cta--ghost`).
- Messages `.sim-msg` / `.sim-error` / `.sim-success`.
- Résultat principal (grand chiffre) + cartes de résultats secondaires.
- Avertissement « indicatif, non contractuel » (`WARNING_CODES.NOT_A_BANK_DECISION`).
- **Bloc conversion vert/or** « Votre projet mérite plus qu'une simulation » + « Étudier mon financement » (CS-5B.1).
- Section pédagogique + FAQ (JSON-LD FAQPage).
- Tracking `ui.track` (5 events, sans PII) + lead `lead.js` (transport injecté).

**Composants SPÉCIFIQUES :**

- **Guidé** : progression multi-étapes `.sim-step` / `.sim-progress`, cartes de sélection, hypothèses métier (`credit-policy` : REVIEW_FLAGS, INCOME_CATEGORIES, RELIABILITY).
- **Direct** : comparateur (ex. `.men-comp-*` avec `.nb` nowrap), message assurance compact, micro-explication.

**Quand « direct » vs « guidé » :**

| Utiliser DIRECT si… | Utiliser GUIDÉ si… |
|---|---|
| ≤ 4-5 entrées, calcul immédiat | situation personnelle, plusieurs dimensions |
| résultat chiffré peu ambigu | résultat nécessitant interprétation/hypothèses |
| comparaison simple (durées, scénarios) | revenus/charges détaillés, flags métier |
| ex. mensualité, endettement, coût crédit, frais notaire | ex. capacité, budget projet, prêt relais |

**Recommandation :** figer ces composants en un mini-guide (CS-DS) réutilisé par chaque futur simulateur, pour éviter la divergence CSS (aujourd'hui `.sim-*` partagé + extensions inline par page). **Aucune modification CSS en CS-5C.**

---

## 9. Stratégie SEO

Pour chaque simulateur, la même grille : intention principale, intentions secondaires, différence avec l'existant, risque de cannibalisation, page commerciale cible, pages éditoriales pourvoyeuses.

| Simulateur | Intention principale | Secondaires | Différence vs existant | Cannibalisation | Renvoi commercial | Éditorial pourvoyeur |
|---|---|---|---|---|---|---|
| Taux d'endettement | « calcul taux d'endettement » | « règle 35 % HCSF », « capacité restante » | Non couvert par une page dédiée | Faible | `/courtage-credit-immobilier` | articles crédit / capacité |
| Coût du crédit | « coût total crédit immobilier » | « part des intérêts », « impact durée » | Recoupe partiellement mensualité (comparateur) | **Moyen** — bien différencier l'angle « coût » | `/courtage-credit-immobilier` | articles taux/durée |
| Frais de notaire | « frais de notaire 2026 » | « ancien vs neuf », « calcul frais acquisition » | Non couvert | Faible | `/immobilier` + courtage | articles achat/investissement |
| Rendement locatif | « calcul rendement locatif » | « rendement net », « rentabilité SCPI » | Non couvert | Faible | `/investissement-immobilier`, `/investissement-scpi-hauts-de-seine` | articles LMNP/SCPI |
| Prêt relais | « simulateur prêt relais » | « fonctionnement prêt relais » | Non couvert | Faible | futur `/credit/pret-relais` | — |

**Dette SEO prioritaire (existant) :**

- `/simulation-pret-immobilier` (indexé) **cannibalise** `/simulateurs/capacite-emprunt` sur l'intention « simulation prêt » → **301 à exécuter** (prévu de longue date).
- `/#simulateurs` (accueil) porte de facto « mensualité » et « capacité » : clarifier canonique une fois les pages V2 publiées.
- `/pret-immobilier-index` (+ sous-domaine) : décider consolidation / 301 / maintien Ads.

> **Aucune donnée chiffrée inventée.** Volumes, CPC, positions, impressions, clics, concurrence, données GSC : **à mesurer via Agent SEO / GSC** avant arbitrage de priorité définitif.

---

## 10. Stratégie de maillage interne

**Modèle hub-and-spoke :**

```
                 /simulateurs (hub, pilier)
                /      |      \
   capacité — mensualité — endettement — coût-crédit — (frais-notaire, rendement)
        \        |         /
         → CTA « Étudier mon financement » → /courtage-credit-immobilier (conversion)
```

**Règles :**

- Chaque page simulateur : breadcrumb `Accueil › Simulateurs › <outil>` (crumb « Simulateurs » enfin cliquable une fois le hub créé).
- Chaque page : bloc « Autres simulateurs » avec 2-3 cross-links **pertinents** (pas les 7).
- Cross-links thématiques recommandés :
  - Capacité ↔ Mensualité ↔ Taux d'endettement (trio crédit cœur).
  - Coût du crédit ↔ Mensualité.
  - Frais de notaire ↔ Rendement locatif ↔ `/investissement-immobilier`.
- Éditorial → simulateur : les articles blog crédit/immo/LMNP/SCPI renvoient vers l'outil correspondant (liens contextuels).
- Simulateur → commercial : CTA unique vers courtage/immobilier selon la famille.
- Accueil `/#simulateurs` : à terme, cartes vers `/simulateurs/*` (au lieu des calculateurs inline).

---

## 11. Stratégie de conversion

**Conversion progressive, non agressive :**

```
Simulation gratuite → Résultat immédiat → Explication → CTA facultatif → Étudier mon financement
```

- Le calcul reste **gratuit, sans mur** ; le lead est **optionnel**, après la valeur délivrée.
- **1 CTA principal par page**, contextualisé par famille :

| Famille | CTA principal | Univers cible |
|---|---|---|
| Crédit (capacité, mensualité, endettement, coût, relais) | **Étudier mon financement** | Courtage |
| Immobilier — acquisition (frais notaire) | **Analyser mon projet** / **Parler à un conseiller** | Immobilier/Courtage |
| Immobilier — investissement (rendement) | **Faire analyser mon investissement** | Investissement/Patrimoine |
| Patrimoine (PER, effort épargne) | **Parler à un conseiller** | Patrimoine |

- Réassurance constante : « Analyse personnalisée · Accompagnement · Sans engagement ».
- Lead : réutiliser `lead.js` (transport réel à brancher lors de la publication, pas en preview).

---

## 12. Analyse des candidats CS-6

| Critère | Taux d'endettement | Coût du crédit | Prêt relais | Frais de notaire | Rendement locatif |
|---|---|---|---|---|---|
| Complémentarité capacité | **Très forte** | Moyenne | Faible | Faible | Faible |
| Complémentarité mensualité | Forte | **Forte** (mais recouvre le comparateur) | Faible | Faible | Faible |
| Réutilisation socle | **Totale** (`calculateDebtRatio`) | **Totale** (`calculateCreditCost`) | Partielle (règle à créer) | **Faible** (barème à créer) | **Totale** (`grossYield`/`netYieldSimple`) |
| Simplicité (UX directe) | **Élevée** | Élevée | Moyenne | Élevée (si barème prêt) | Élevée |
| Valeur utilisateur | Élevée (blocage n°1 des emprunteurs) | Moyenne | Niche | **Élevée** (chiffre attendu) | Élevée (investisseurs) |
| Valeur commerciale | **Élevée** (pont direct courtage) | Moyenne | Moyenne | Élevée (acquisition) | Élevée (investissement) |
| Intention SEO distincte | **Oui** | Moyenne (proche mensualité) | Oui (niche) | **Oui** (fort) | **Oui** |
| Risque juridique/métier | **Faible** | Faible | Élevé | **Élevé** (exactitude barème) | Moyen |
| Maintenance future | **Faible** | Faible | Moyenne | **Élevée** (barème annuel) | Faible |

---

## 13. Recommandation CS-6

### 🥇 Recommandé : **Taux d'endettement** — `/simulateurs/taux-endettement` (UX directe)

**Pourquoi :**

- **Socle 100 % prêt** : `calculateDebtRatio` + `maxDebtRatio 0.35` existent déjà → adaptateur + page seulement, zéro nouvelle formule, zéro nouveau barème.
- **Complémentarité maximale** : ferme le trio cœur **Capacité → Mensualité → Endettement**, le parcours mental exact d'un emprunteur.
- **Intention SEO distincte** (« calcul taux d'endettement », règle des 35 %), sans cannibaliser les pages existantes.
- **Conversion** : c'est LE point de blocage d'un dossier crédit → pont naturel et crédible vers « Étudier mon financement » (courtage).
- **Risque métier faible** : règle HCSF publique et stable ; message « indicatif, non contractuel » déjà standardisé.
- **Maintenance faible.**

### 🥈 Alternative immédiate : **Coût du crédit** (socle prêt aussi)

Simple, socle prêt (`calculateCreditCost`), mais **recoupe partiellement** le comparateur déjà présent dans mensualité → différenciation d'angle nécessaire. Bon P2.

### 🥉 Meilleur ouvreur de la famille immobilière : **Frais de notaire**

Très forte intention SEO et synergie immobilier/acquisition, **mais** nécessite la création d'un **barème** (module type CS-3.5) avec exigence d'exactitude et **maintenance annuelle** → plus lourd et plus risqué. À planifier comme **P2 immobilier**, une fois la famille crédit consolidée, avec un vrai référentiel de frais versionné.

> Ne démarrer **aucun** développement CS-6 avant validation.

---

## 14. Roadmap proposée

**P1 — Consolidation crédit (valeur immédiate, socle prêt)**

1. **Publier mensualité** : passer `/simulateurs/mensualite-credit` en `index`, l'ajouter au sitemap + nav + breadcrumb, brancher le vrai transport lead.
2. **CS-6 : Taux d'endettement** (`/simulateurs/taux-endettement`, direct).
3. **Résoudre la dette legacy** : 301 `simulation-pret-immobilier → capacité` (ou hub) + correction typo ; clarifier `/#simulateurs`.

**P2 — Hub + extension**

4. **Créer le hub `/simulateurs`** (3 outils indexables disponibles) + rendre le crumb « Simulateurs » cliquable + basculer le lien header `/#simulateurs` → `/simulateurs`.
5. **Coût du crédit** (`/simulateurs/cout-credit`, direct) — angle « coût » différencié.
6. **Frais de notaire** (`/simulateurs/frais-notaire`) — après création d'un barème versionné.

**P3 — Immobilier / niches**

7. **Rendement locatif** (`/simulateurs/rendement-locatif`, socle prêt).
8. **Prêt relais** (`/simulateurs/pret-relais`) — après cadrage produit + page commerciale `/credit/pret-relais`.

**PLUS TARD — Patrimoine** : PER, effort d'épargne, donation (barèmes fiscaux à créer). Non prioritaire.

**Justification :** on livre d'abord ce dont le **socle est déjà capable** (endettement, coût, rendement) et ce qui **complète le parcours crédit**, on **assainit le legacy** avant d'ouvrir des URLs, et on ne crée le **hub** qu'une fois qu'il a de la matière à structurer. Les outils à barème (notaire, plus-value, fiscalité) viennent après, avec le référentiel adéquat.

---

## 15. Décisions à faire valider (par ChatGPT / Medy)

1. **CS-6 = Taux d'endettement ?** (reco) — ou préférer Coût du crédit / Frais de notaire ?
2. **Moment du hub `/simulateurs`** : option **B (attendre le 3ᵉ outil)** recommandée — ou A (maintenant, 2 outils) / C (4 outils) ?
3. **Publication mensualité** : la passer `index` **avant** ou **avec** le hub ?
4. **`/#simulateurs` accueil** : conserver les calculateurs inline, ou les remplacer par des cartes vers `/simulateurs/*` ? (impacte la cannibalisation)
5. **`simulation-pret-immobilier`** : 301 vers capacité (comme prévu) ou vers le futur hub ?
6. **`pret-immobilier-index` + sous-domaine** : consolidation / 301 / maintien Ads / suppression ? (chantier Crédit V2)
7. **Frontière `/credit/*` vs `/simulateurs/*`** : valider la règle « commercial vs calcul » et les cas de séparation légitime (prêt relais).
8. **Nav V2** (Patrimoine · Immobilier · Crédit · Simulateurs · Cabinet · Ressources) : confirmer avant d'y accrocher le hub.
9. **Frais de notaire** : accepte-t-on la création + maintenance annuelle d'un barème (exactitude) ?

---

## 16. Risques / points ouverts

| Risque | Description | Mitigation |
|---|---|---|
| **Cannibalisation legacy active** | `simulation-pret-immobilier` (indexé) vs `capacite-emprunt` ; `/#simulateurs` inline vs pages V2 | Exécuter les 301 prévus ; clarifier canoniques ; cartes accueil |
| **Empilement de doublons** | Ouvrir `/simulateurs/*` sans traiter le legacy multiplierait les pages concurrentes | Assainir **avant** d'étendre (P1 §14) |
| **Hub prématuré** | Un hub à 1-2 outils indexables a peu de valeur SEO/UX | Option B : attendre 3 outils + mensualité indexée |
| **Barèmes (notaire, plus-value, fiscalité)** | Exactitude attendue + maintenance annuelle + risque juridique | Module de référence versionné (type CS-3.5) ; reporter en P2/P3 |
| **Divergence design** | CSS `.sim-*` partagé mais extensions inline par page | Figer un mini-guide design (CS-DS) avant multiplication |
| **Sous-domaine `pret-immobilier`** | Décision reportée ; impact Ads/SEO | Arbitrage Crédit V2 dédié |
| **Absence de données SEO dans le repo** | Priorisation partiellement à l'aveugle | Mesurer via Agent SEO / GSC avant gel des priorités |
| **`index.html` modif locale hors périmètre** | Présente dans le working tree | Ne pas toucher (respecté en CS-5C) |

---

*Fin du document CS-5C. Aucune implémentation, aucun commit, aucune modification du site. À réviser par ChatGPT avant toute phase d'implémentation.*
