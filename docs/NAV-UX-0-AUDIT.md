# NAV-UX-0 — Audit global breadcrumbs & navigation parente

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `menu-1.5-centralisation-header` · **HEAD :** `95af7d8`
**Nature :** audit **strictement en lecture seule**. Aucun HTML / CSS / JS / header / breadcrumb / JSON-LD / sitemap modifié. Aucun bouton retour créé. Aucune URL, aucun redirect, aucun déploiement, aucun merge `main`.
**Périmètre :** les **49 pages CENTRALIZED** de `scripts/nav-pages.json`, plus les exceptions identifiées séparément.

---

## 1. Synthèse

Le site dispose déjà d'un fil d'Ariane (« breadcrumb ») quasi généralisé : **47 des 49 pages** centralisées en portent un. Le problème n'est donc **pas l'absence** de navigation secondaire mais son **hétérogénéité** et son **déficit SEO** :

- **2 pages seulement** exposent le `BreadcrumbList` JSON-LD (les deux pages `/immobilier/*`). Les **45 autres** breadcrumbs sont invisibles pour Google (pas de données structurées).
- **5 pages** ont un breadcrumb **incohérent** (libellé faux, lien parent cassé, ou balisage malformé).
- **La hiérarchie Immobilier est incohérente** : les pages `/immobilier/*` (sous-dossier) sont bien imbriquées sous `Immobilier`, mais les pages Immobilier de la racine (`investissement-immobilier`, SCPI, courtage…) restent **plates** (`Accueil › Page`) alors qu'elles appartiennent au même univers.
- **0 usage de `history.back()`** sur tout le site — aucune dette de navigation par historique à corriger. C'est un bon point de départ.
- **Le breadcrumb n'est pas centralisé** : HTML **et** CSS sont dupliqués dans chaque page (il ne fait pas partie du header `partials/header.html`).

**Il n'existe aucune page hub `/patrimoine` ni `/ressources`.** Toute architecture cible doit donc s'appuyer uniquement sur les destinations réelles : `/` (accueil), `/immobilier`, `/blog`, `/conseiller-patrimoine-colombes` et les pages de service elles-mêmes.

**Décision structurante recommandée pour NAV-UX-1 :** garder le breadcrumb comme **unique** navigation secondaire (pas de bouton « Retour » global), généraliser le `BreadcrumbList` JSON-LD, réparer les 5 incohérences, et n'imbriquer sous un parent que lorsqu'une **URL parente réelle existe**.

---

## 2. Inventaire des 49 pages (par univers)

| Univers | Nb | Pages |
|---|---|---|
| **Accueil** | 1 | `index.html` |
| **Patrimoine (services)** | 8 | bilan-patrimonial, optimisation-fiscale-ile-de-france, declaration-impots-ile-de-france, fiscalite-rsu-stock-options, placements-financiers, preparation-retraite, transmission, cession-entreprise |
| **Patrimoine (fiscalité annexe)** | 1 | declaration-rsu-espp-france |
| **Patrimoine (local)** | 5 | conseiller-patrimoine-colombes (+ asnieres, courbevoie, levallois, nanterre) |
| **Immobilier** | 7 | immobilier (hub), immobilier/estimation-colombes, immobilier/succession-colombes, investissement-immobilier, investissement-immobilier-ancien, investissement-scpi-hauts-de-seine, courtage-credit-immobilier |
| **Cabinet** | 1 | cabinet |
| **Ressources / Blog** | 26 | blog/index + 25 articles |
| **Total** | **49** | |

Le tableau ligne par ligne (avec breadcrumb exact, JSON-LD, parent, classe et action) est en **§15**.

---

## 3. Statistiques breadcrumbs

| Indicateur | Valeur |
|---|---|
| Pages auditées | **49** |
| Avec breadcrumb visible (HTML) | **47** |
| Sans breadcrumb | **2** (`index.html`, `blog/index.html`) |
| Breadcrumbs cohérents (A + B) | **42** |
| Breadcrumbs incohérents (D) | **5** |
| Position | Toujours `<div class="breadcrumb">` **entre `<!-- NAV:END -->` et le hero** (bandeau pleine largeur, fond sable) |
| Balise | `<div class="breadcrumb">` (pas de `<nav aria-label>`, pas de `<ol>`) |
| Séparateur | `›` (`&rsaquo;`) |

**Modèle dominant :** `Accueil › <Page>` (2 niveaux, lien unique vers `/`), présent sur toutes les pages Patrimoine et Cabinet.

---

## 4. Statistiques BreadcrumbList (JSON-LD)

| Indicateur | Valeur |
|---|---|
| Pages avec `BreadcrumbList` JSON-LD | **2** |
| Pages avec breadcrumb visible **mais sans** JSON-LD | **45** |
| Pages avec JSON-LD **mais sans** breadcrumb visible (classe C) | **0** |
| Cohérence visible ↔ JSON-LD sur les 2 pages équipées | **OK** (mêmes 3 niveaux, mêmes URLs) |

Les 2 pages équipées : `/immobilier/estimation-colombes` et `/immobilier/succession-colombes` — `Accueil (/) › Immobilier (/immobilier) › Page`. Elles constituent le **modèle A de référence** à répliquer.

**C'est le principal gisement SEO de NAV-UX-1 : +45 `BreadcrumbList` à générer.**

---

## 5. Incohérences (classe D — 5 pages)

| Page | Type d'incohérence | Détail |
|---|---|---|
| `/placements-financiers` | **Libellé terminal faux** | Breadcrumb affiche `Accueil › Optimisation fiscale` alors que la page traite des placements financiers (copier-coller depuis `optimisation-fiscale`). |
| `/blog/lmnp-2026` | **Lien parent cassé** | Le crumb « Blog » pointe vers `/` au lieu de `/blog`. |
| `/blog/per-vs-assurance-vie-2026` | **Lien parent cassé** | Idem — « Blog » → `/`. |
| `/blog/reduire-impots-2026` | **Lien parent cassé** | Idem — « Blog » → `/`. |
| `/declaration-rsu-espp-france` | **Balisage malformé** | 4 liens accolés sans séparateurs : `Accueil › Optimisation fiscale Déclarer mes impôts Optimiser mes RSU › Déclaration RSU…`. Hiérarchie illisible. |

Aucune de ces incohérences n'est corrigée en NAV-UX-0 (lecture seule). Elles sont listées comme actions prioritaires NAV-UX-1.

---

## 6. Inventaire `history.back` / navigation par historique

**Aucun usage détecté sur l'ensemble du site**, y compris sur les pages d'exception :

| Motif recherché | Occurrences |
|---|---|
| `history.back()` | **0** |
| `window.history.back()` | **0** |
| `javascript:history.back()` | **0** |
| `history.go(-1)` | **0** |

Les seuls libellés « ← Retour » du site sont les **boutons de retour des sous-menus mobiles MENU-3.1** (dans le header centralisé), qui naviguent entre niveaux de menu — **pas** une navigation de page. Aucun bouton « Retour » de page, aucun lien « Revenir/Voir/Découvrir » de type navigation parente n'existe aujourd'hui.

**Conséquence :** la cible « lien parent déterministe » est déjà respectée par défaut (rien à désancrer). Il suffira, en NAV-UX-1, de **ne jamais introduire** de `history.back()` et de s'en tenir à des `href` fixes.

---

## 7. Analyse Patrimoine

- **Aucune page hub `/patrimoine` n'existe.** Ne pas l'inventer.
- Les 8 pages de service Patrimoine sont toutes en **`Accueil › <Page>` plat**, lien unique vers `/`. C'est cohérent avec l'absence de hub.
- Le header V1 regroupe ces pages dans un méga-menu « Patrimoine », mais ce méga-menu **n'a pas d'URL de destination** — ce n'est pas une page, donc pas un parent de breadcrumb valide.

**Architecture réellement supportée aujourd'hui :** `Accueil › Bilan patrimonial` (plat). 
Un niveau intermédiaire `Accueil › Nos services › …` **n'est pas possible** sans créer `/nos-services` (inexistante) — donc **écarté**.

**Recommandation :** conserver le modèle plat `Accueil › <Page>` pour tout Patrimoine, et se contenter d'y **ajouter le JSON-LD** (2 niveaux). Corriger `placements-financiers` (libellé) et `declaration-rsu-espp-france` (balisage). Pour cette dernière, une imbrication sous la page réelle `/fiscalite-rsu-stock-options` est possible et pertinente (`Accueil › Fiscalité RSU… › Déclaration RSU, ESPP`).

---

## 8. Analyse Immobilier (attention particulière)

Destination hub réelle : **`/immobilier` existe** ✓.

| Page | Breadcrumb actuel | Parent lié actuel | Cible recommandée |
|---|---|---|---|
| `/immobilier` (hub) | `Accueil › Immobilier` | `/` | inchangé + JSON-LD |
| `/immobilier/estimation-colombes` | `Accueil › Immobilier › Estimation…` | `/`, `/immobilier` | **déjà conforme (A)** |
| `/immobilier/succession-colombes` | `Accueil › Immobilier › Succession…` | `/`, `/immobilier` | **déjà conforme (A)** |
| `/investissement-immobilier` | `Accueil › Investissement immobilier` (plat) | `/` | `Accueil › Immobilier › Investissement immobilier` |
| `/investissement-immobilier-ancien` | `Accueil › Investissement immobilier › Immobilier ancien` | `/`, `/investissement-immobilier` | `Accueil › Immobilier › Immobilier ancien` |
| `/investissement-scpi-hauts-de-seine` | `Accueil › Investissement SCPI` (plat) | `/` | `Accueil › Immobilier › SCPI` |
| `/courtage-credit-immobilier` | `Accueil › Courtage crédit immobilier` (plat) | `/` | `Accueil › Immobilier › Courtage crédit immobilier` |

**Réponse à la question du brief §5 :** oui, les pages enfants Immobilier **doivent** adopter `Accueil › Immobilier › Page` (le parent `/immobilier` est réel), et un lien contextuel **`← Immobilier` → `/immobilier`** est pertinent et sûr (destination déterministe). 

**Note :** `investissement-immobilier-ancien` s'imbrique aujourd'hui sous `investissement-immobilier` (page réelle) plutôt que sous `/immobilier` : cohérent mais crée un 2ᵉ niveau de profondeur hétérogène. Recommandation : aligner sur `Accueil › Immobilier › …` pour tout l'univers.

**Note courtage :** `courtage-credit-immobilier` est rattaché à Immobilier dans le Header V1 → parent `/immobilier` en attendant. Un futur univers **Crédit V2** pourra le re-parenter, **hors périmètre NAV-UX-0/1** (ne pas introduire `/credit`).

---

## 9. Analyse Blog / Ressources

Destination hub réelle : **`/blog` existe** ✓. **`/ressources` n'existe pas** → ne pas l'inventer.

- **26 pages** : `blog/index` (sans breadcrumb) + 25 articles.
- Les 25 articles utilisent tous `Accueil › Blog › <Article>` — **la bonne structure**, alignée sur la destination réelle `/blog`.
- **3 articles** (`lmnp-2026`, `per-vs-assurance-vie-2026`, `reduire-impots-2026`) ont le crumb « Blog » pointant vers `/` au lieu de `/blog` → à réparer.
- `blog/index.html` n'a **aucun** breadcrumb → ajouter `Accueil › Blog`.

**Recommandation :** conserver `Accueil › Blog › <Article>` (surtout **pas** « Ressources », qui n'a pas d'URL), réparer les 3 liens cassés, ajouter le breadcrumb de l'index blog, et générer le JSON-LD sur les 26 pages.

---

## 10. Analyse pages locales

5 pages « conseiller patrimoine + ville ». Il existe une **page pilier locale réelle : `/conseiller-patrimoine-colombes`**.

| Page | Breadcrumb actuel | Parent lié | Observation |
|---|---|---|---|
| `/conseiller-patrimoine-colombes` | `Accueil › Conseiller Patrimoine` | `/` | **Hub local de fait** (URL réelle). Libellé générique. |
| `/conseiller-patrimoine-asnieres` | `Accueil › Conseiller Patrimoine › Asnières-sur-Seine` | `/`, `/conseiller-patrimoine-colombes` | pointe déjà vers Colombes ✓ |
| `/conseiller-patrimoine-courbevoie` | `… › Courbevoie` | `/`, `/conseiller-patrimoine-colombes` | idem ✓ |
| `/conseiller-patrimoine-levallois` | `… › Levallois-Perret` | `/`, `/conseiller-patrimoine-colombes` | idem ✓ |
| `/conseiller-patrimoine-nanterre` | `… › Nanterre` | `/`, `/conseiller-patrimoine-colombes` | idem ✓ |

**Parent logique / SEO :** `/conseiller-patrimoine-colombes` (page pilier, URL réelle). Les 4 villes y sont **déjà rattachées** — c'est la meilleure structure possible sans créer de hub fictif `/conseiller-patrimoine`.

**Recommandation :** garder cette structure, mais **expliciter le libellé** du crumb intermédiaire (« Conseiller patrimoine Colombes » plutôt que « Conseiller Patrimoine », qui masque la destination réelle), et ajouter le JSON-LD. **Ne pas créer** de page hub locale fictive.

---

## 11. Analyse mobile (320 / 375 / 390 / 430 px)

CSS breadcrumb (identique et dupliquée dans chaque page) :

```
.breadcrumb { background: var(--sand); padding: 12px 40px; font-size: 13px; color: var(--slate); margin-top: 72px; }
@media (max-width: 600px) { .breadcrumb { padding: 12px 20px; font-size: 12px; } }
```

| Point | Constat |
|---|---|
| `margin-top: 72px` | Dégage bien le header fixe (72 px). OK à toutes largeurs. |
| Réduction mobile | Une media query `≤600px` réduit padding (40→20 px) et police (13→12 px). Présente sur toutes les pages. |
| `overflow` / `white-space` / `text-overflow` | **Aucun.** Les longs breadcrumbs **passent à la ligne** (wrap naturel), ils ne débordent pas et ne sont pas tronqués. |
| Risque 320 px | Les crumbs d'articles blog les plus longs (ex. « Donation vivant ou testament : que choisir ? ») **wrappent sur 2–3 lignes**. Lisible mais peu élégant ; pas de débordement horizontal. |
| Contraste | Texte `--slate` sur fond `--sand`, liens `--teal` → contraste correct. |

**Conclusion mobile :** pas de bug bloquant. Le seul point d'attention est le **retour à la ligne des crumbs longs** à 320/375 px. NAV-UX-1 pourra (optionnel) ajouter `white-space: nowrap; overflow-x: auto` **ou** tronquer le libellé du dernier crumb — décision de confort, pas de correctif urgent. **Rien corrigé ici.**

---

## 12. Architecture technique actuelle

| Question | Réponse |
|---|---|
| HTML dupliqué par page ? | **Oui.** `<div class="breadcrumb">…</div>` écrit en dur dans chaque page, juste après `<!-- NAV:END -->`. |
| Fait-il partie du header centralisé ? | **Non.** Absent de `partials/header.html` et de `scripts/build-header.js`. C'est du **contenu de page**. |
| CSS partagé ? | **Non.** La règle `.breadcrumb` est **dupliquée dans le `<style>` inline de chaque page** (pas dans `assets/css/navigation.css`). |
| Classe commune ? | Oui, la classe `.breadcrumb` est commune, mais sa définition est répétée partout. |
| Composant / génération ? | **Aucun.** Pas de template, pas de génération. Chaque breadcrumb est manuel. |
| JSON-LD ? | **Manuel**, présent sur 2 pages seulement. |

**Implication :** toute harmonisation (réparer 5 incohérences + ajouter 45 JSON-LD + re-parenter Immobilier) touche potentiellement ~47 pages, **une par une**. 

**Pertinence d'une centralisation future :** élevée. Deux options pour NAV-UX-1 (à trancher, **non construites ici**) :
1. **Bloc breadcrumb généré** (comme le header) via un marqueur `<!-- BREADCRUMB:START/END -->` alimenté par `nav-pages.json` (chaque entrée déclare son parent + libellé), avec JSON-LD auto-généré. → cohérence garantie, 1 seule source de vérité.
2. **Édition scriptée ciblée** (migrateur type `migrate_*.py`) qui corrige/ajoute breadcrumb + JSON-LD page par page, sans mécanisme permanent. → plus léger, mais la dette de duplication demeure.

L'option 1 est recommandée si les breadcrumbs doivent rester cohérents à long terme.

---

## 13. Architecture cible proposée (destinations réelles uniquement)

| Univers | Breadcrumb cible | Parent | URL parente réelle | Lien retour |
|---|---|---|---|---|
| **Accueil** | *(aucun)* | — | — | aucun |
| **Patrimoine (services)** | `Accueil › <Service>` | Accueil | `/` | aucun (1 clic vers Accueil suffit) |
| **Patrimoine (fiscalité annexe)** | `Accueil › Fiscalité RSU… › Déclaration RSU, ESPP` | Fiscalité RSU | `/fiscalite-rsu-stock-options` | `← Fiscalité RSU` (optionnel) |
| **Patrimoine (local)** | `Accueil › Conseiller patrimoine Colombes › <Ville>` | Colombes | `/conseiller-patrimoine-colombes` | `← Colombes` (optionnel) |
| **Immobilier (hub)** | `Accueil › Immobilier` | Accueil | `/` | aucun |
| **Immobilier (enfants)** | `Accueil › Immobilier › <Page>` | Immobilier | `/immobilier` | `← Immobilier` (optionnel) |
| **Cabinet** | `Accueil › Le cabinet` | Accueil | `/` | aucun |
| **Blog (index)** | `Accueil › Blog` | Accueil | `/` | aucun |
| **Blog (articles)** | `Accueil › Blog › <Article>` | Blog | `/blog` | `← Blog` (optionnel) |

**Règle d'or :** chaque niveau intermédiaire d'un breadcrumb **doit** correspondre à une URL qui existe. Interdits : `/patrimoine`, `/ressources`, `/nos-services`, `/conseiller-patrimoine` (hub), `/credit`, `/simulateurs`.

Chaque breadcrumb visible est **doublé d'un `BreadcrumbList` JSON-LD** aux mêmes niveaux/URLs.

---

## 14. Règles UX recommandées

1. **Le breadcrumb est la navigation secondaire unique et suffisante.** Il est déjà présent et bien positionné (bandeau sous le header).
2. **Pas de bouton « Retour » global sur les 49 pages.** Ajouter un « Retour » partout serait redondant avec le breadcrumb et le header. Distinction :
   - *breadcrumb suffisant* → pages de niveau 2 (`Accueil › Page`) : **aucun retour** (l'accueil est à 1 clic dans le breadcrumb ET dans le header).
   - *breadcrumb + retour utile* → pages enfants d'un hub réel (`/immobilier/*`, villes locales, articles blog) : un lien contextuel **`← <Parent>`** vers l'URL parente réelle **améliore** le parcours (retour au hub, pas à l'accueil).
   - *retour inutile/redondant* → accueil, hubs de niveau 1.
3. **Jamais `history.back()`.** Toujours un `href` fixe déterministe. (Déjà respecté — 0 occurrence.)
4. **Un lien retour, quand il existe, pointe vers le parent du breadcrumb**, pas vers l'historique du navigateur.
5. **Cohérence libellé ↔ destination :** le texte d'un crumm doit nommer sa vraie destination (corriger « Conseiller Patrimoine » → « … Colombes », « Optimisation fiscale » sur placements-financiers, etc.).
6. **Mobile :** conserver le wrap actuel ; n'envisager `nowrap + scroll` ou troncature que si le confort de lecture des crumbs longs le justifie (non bloquant).

→ **Une seule règle globale**, déclinée par type de page, plutôt que 49 décisions arbitraires.

---

## 15. Tableau complet des 49 pages

| # | URL | Univers | Breadcrumb actuel | JSON-LD | Parent actuel (lien) | Parent recommandé | Retour actuel | Retour reco | Classe | Action NAV-UX-1 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | / | Accueil | — | non | — | — | aucun | aucun | E | Aucune (accueil) |
| 2 | /immobilier | Immobilier | Accueil › Immobilier | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD |
| 3 | /immobilier/succession-colombes | Immobilier | Accueil › Immobilier › Succession Colombes | oui | / , /immobilier | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | A | Conforme (modèle A) |
| 4 | /immobilier/estimation-colombes | Immobilier | Accueil › Immobilier › Estimation immobilière Colombes | oui | / , /immobilier | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | A | Conforme (modèle A) |
| 5 | /optimisation-fiscale-ile-de-france | Patrimoine | Accueil › Optimisation fiscale | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat, pas de hub /patrimoine) |
| 6 | /bilan-patrimonial | Patrimoine | Accueil › Bilan patrimonial | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 7 | /declaration-impots-ile-de-france | Patrimoine | Accueil › Déclaration d'impôts | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 8 | /fiscalite-rsu-stock-options | Patrimoine | Accueil › Fiscalité RSU, stock-options & BSPCE | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 9 | /placements-financiers | Patrimoine | Accueil › Optimisation fiscale | non | / | Accueil (/) | aucun | aucun | **D** | **Corriger libellé terminal** + JSON-LD |
| 10 | /preparation-retraite | Patrimoine | Accueil › Préparation retraite | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 11 | /transmission | Patrimoine | Accueil › Transmission & succession | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 12 | /cession-entreprise | Patrimoine | Accueil › Cession d'entreprise | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD (flat) |
| 13 | /investissement-immobilier | Immobilier | Accueil › Investissement immobilier | non | / | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | B | Re-parenter sous Immobilier + JSON-LD |
| 14 | /investissement-immobilier-ancien | Immobilier | Accueil › Investissement immobilier › Immobilier ancien | non | / , /investissement-immobilier | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | B | Re-parenter sous Immobilier + JSON-LD |
| 15 | /investissement-scpi-hauts-de-seine | Immobilier | Accueil › Investissement SCPI | non | / | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | B | Re-parenter sous Immobilier + JSON-LD |
| 16 | /courtage-credit-immobilier | Immobilier | Accueil › Courtage crédit immobilier | non | / | Immobilier (/immobilier) | aucun | ← Immobilier optionnel | B | Re-parenter sous Immobilier + JSON-LD |
| 17 | /cabinet | Cabinet | Accueil › Le cabinet | non | / | Accueil (/) | aucun | aucun | B | Ajouter JSON-LD |
| 18 | /conseiller-patrimoine-asnieres | Patrimoine (local) | Accueil › Conseiller Patrimoine › Asnières-sur-Seine | non | / , /conseiller-patrimoine-colombes | Colombes (/conseiller-patrimoine-colombes) | aucun | ← Colombes optionnel | B | Libellé parent explicite + JSON-LD |
| 19 | /conseiller-patrimoine-colombes | Patrimoine (local) | Accueil › Conseiller Patrimoine | non | / | Accueil (/) | aucun | aucun | B | Hub local ; libellé « Colombes » + JSON-LD |
| 20 | /conseiller-patrimoine-courbevoie | Patrimoine (local) | Accueil › Conseiller Patrimoine › Courbevoie | non | / , /conseiller-patrimoine-colombes | Colombes (/conseiller-patrimoine-colombes) | aucun | ← Colombes optionnel | B | Libellé parent explicite + JSON-LD |
| 21 | /conseiller-patrimoine-levallois | Patrimoine (local) | Accueil › Conseiller Patrimoine › Levallois-Perret | non | / , /conseiller-patrimoine-colombes | Colombes (/conseiller-patrimoine-colombes) | aucun | ← Colombes optionnel | B | Libellé parent explicite + JSON-LD |
| 22 | /conseiller-patrimoine-nanterre | Patrimoine (local) | Accueil › Conseiller Patrimoine › Nanterre | non | / , /conseiller-patrimoine-colombes | Colombes (/conseiller-patrimoine-colombes) | aucun | ← Colombes optionnel | B | Libellé parent explicite + JSON-LD |
| 23 | /blog/ | Ressources | — | non | — | Accueil (/) | aucun | aucun | E | Ajouter breadcrumb « Accueil › Blog » + JSON-LD |
| 24 | /blog/actions-gratuites-aga-fiscalite-2026 | Ressources | Accueil › Blog › Actions gratuites (AGA) : fiscalité 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 25 | /blog/bspce-fiscalite-startup-2026 | Ressources | Accueil › Blog › BSPCE : fiscalité startups 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 26 | /blog/conseiller-patrimoine-ile-de-france | Ressources | Accueil › Blog › Conseiller patrimoine Île-de-France | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 27 | /blog/declarer-rsu-formulaires-2026 | Ressources | Accueil › Blog › Déclarer ses RSU : formulaires 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 28 | /blog/donation-vivant-2026 | Ressources | Accueil › Blog › Donation du vivant en 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 29 | /blog/donation-vivant-vs-testament-strategie-transmission | Ressources | Accueil › Blog › Donation vivant ou testament : que choisir ? | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 30 | /blog/espp-fiscalite-france-2026 | Ressources | Accueil › Blog › ESPP France : fiscalité 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 31 | /blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026 | Ressources | Accueil › Blog › Gestion de patrimoine dirigeants 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 32 | /blog/gestion-patrimoine-entreprise-strategies-optimisation-fiscale-2026 | Ressources | Accueil › Blog › Gestion de patrimoine entreprise : stratégies 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 33 | /blog/immobilier-complement-retraite-lmnp-scpi-50-ans | Ressources | Accueil › Blog › LMNP ou SCPI pour la retraite à 50 ans | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 34 | /blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026 | Ressources | Accueil › Blog › Immobilier ancien en Île-de-France | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 35 | /blog/investir-rsu-patrimoine-2026 | Ressources | Accueil › Blog › Investir ses RSU : 5 stratégies patrimoniales | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 36 | /blog/lmnp-2026 | Ressources | Accueil › Blog › LMNP en 2026 | non | / , **/** | Blog (/blog) | aucun | ← Blog optionnel | **D** | **Corriger lien Blog (→/ au lieu de /blog)** + JSON-LD |
| 37 | /blog/modifier-clause-beneficiaire-assurance-vie-2026 | Ressources | Accueil › Blog › Modifier la clause bénéficiaire de son assurance-vie | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 38 | /blog/per-vs-assurance-vie-2026 | Ressources | Accueil › Blog › PER ou Assurance Vie en 2026 | non | / , **/** | Blog (/blog) | aucun | ← Blog optionnel | **D** | **Corriger lien Blog (→/)** + JSON-LD |
| 39 | /blog/preparer-retraite-2026-leviers-patrimoniaux-juin | Ressources | Accueil › Blog › Préparer sa retraite en 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 40 | /blog/preparer-retraite-50-ans-leviers-patrimoniaux | Ressources | Accueil › Blog › Préparer sa retraite à 50 ans : 5 leviers patrimoniaux | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 41 | /blog/quand-vendre-rsu-strategie-2026 | Ressources | Accueil › Blog › Quand vendre ses RSU | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 42 | /blog/reduire-impots-2026 | Ressources | Accueil › Blog › Réduire ses impôts en 2026 | non | / , **/** | Blog (/blog) | aucun | ← Blog optionnel | **D** | **Corriger lien Blog (→/)** + JSON-LD |
| 43 | /blog/rsu-expatriation-fiscalite-2026 | Ressources | Accueil › Blog › RSU et expatriation : fiscalité internationale 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 44 | /blog/rsu-imposition-france-2026 | Ressources | Accueil › Blog › RSU : imposition en France 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 45 | /blog/rsu-pea-2026 | Ressources | Accueil › Blog › RSU et PEA 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 46 | /blog/sci-familiale-2026 | Ressources | Accueil › Blog › SCI familiale 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 47 | /blog/scpi-2026 | Ressources | Accueil › Blog › SCPI 2026 : rendements et comment bien choisir | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 48 | /blog/stock-options-imposition-strategie-2026 | Ressources | Accueil › Blog › Stock-options : imposition 2026 | non | / , /blog | Blog (/blog) | aucun | ← Blog optionnel | B | Ajouter JSON-LD |
| 49 | /declaration-rsu-espp-france | Patrimoine | Accueil › Optimisation fiscale Déclarer mes impôts Optimiser mes RSU › Déclaration RSU, ESPP… | non | / , /optimisation-fiscale-ile-de-france , /declaration-impots-ile-de-france , /fiscalite-rsu-stock-options | Fiscalité RSU (/fiscalite-rsu-stock-options) | aucun | ← Fiscalité RSU optionnel | **D** | **Corriger breadcrumb malformé** + JSON-LD |

**Récap classes : A = 2 · B = 40 · C = 0 · D = 5 · E = 2 · F = 0.**

### Exceptions (hors des 49 — n'orientent pas l'architecture)

| Page | Statut | Breadcrumb | JSON-LD | history.back |
|---|---|---|---|---|
| `pret-immobilier-index.html` | INTENTIONAL_LEGACY | oui | non | 0 |
| `simulation-pret-immobilier.html` | INTENTIONAL_LEGACY | oui | non | 0 |
| `Lead magnets/blog-per-vs-assurance-vie-2026.html` | LANDING_SPECIAL | oui | non | 0 |
| `404.html` | NO_HEADER_INTENTIONAL | non | non | 0 |
| `merci-avis.html` | NO_HEADER_INTENTIONAL | non | non | 0 |
| `merci-guide.html` | NO_HEADER_INTENTIONAL | non | non | 0 |
| `guide-5-erreurs-patrimoniaux.html` | NO_HEADER_INTENTIONAL | non | non | 0 |

Ces pages seront traitées avec leurs chantiers respectifs (Crédit V2 pour l'écosystème prêt, arbitrage du lead magnet). Les pages « merci » et 404 n'ont **pas** vocation à porter un breadcrumb.

---

## 16. Périmètre précis NAV-UX-1 (proposé — non démarré)

**Objectif :** harmoniser breadcrumbs + généraliser `BreadcrumbList`, sur les 49 pages centralisées uniquement.

**Lot A — Réparations (5 pages, prioritaire) :**
- `placements-financiers` : libellé terminal.
- `blog/lmnp-2026`, `blog/per-vs-assurance-vie-2026`, `blog/reduire-impots-2026` : lien « Blog » → `/blog`.
- `declaration-rsu-espp-france` : reconstruire le breadcrumb malformé.

**Lot B — Généralisation JSON-LD (45 pages) :** ajouter le `BreadcrumbList` correspondant au breadcrumb visible sur toutes les pages qui en manquent.

**Lot C — Ré-imbrication Immobilier (4 pages) :** `investissement-immobilier`, `-ancien`, `-scpi`, `courtage-credit-immobilier` → `Accueil › Immobilier › Page` + `← Immobilier` (optionnel).

**Lot D — Local & index blog :** libellé parent explicite sur les 4 villes + Colombes ; ajout breadcrumb `Accueil › Blog` sur `blog/index`.

**Décision d'architecture à trancher avant de coder :** breadcrumb **généré** (marqueur + `nav-pages.json` enrichi) vs **édition scriptée** page par page (cf. §12). Recommandation : bloc généré.

**Contraintes NAV-UX-1 :** aucune URL créée, aucune destination fictive, pas de bouton retour global, jamais `history.back()`, branche preview uniquement.

---

## 17. Risques

| Risque | Détail | Mitigation |
|---|---|---|
| **Duplication** | Breadcrumb HTML + CSS répétés sur ~47 pages → une modif manuelle = 47 éditions, source d'incohérences (déjà 5 constatées). | Privilégier un bloc **généré** en NAV-UX-1. |
| **Destination fictive** | Tentation d'introduire `/patrimoine`, `/ressources`, `/nos-services`. | Interdit : ces URLs n'existent pas. S'en tenir aux hubs réels. |
| **Régression SEO** | Modifier un breadcrumb touche le maillage interne et (à terme) le JSON-LD indexé. | Ne toucher que breadcrumb/JSON-LD ; ne pas altérer title/meta/canonical/H1. Vérifier cohérence visible ↔ JSON-LD. |
| **Confusion univers Immobilier vs Crédit** | Courtage crédit rattaché à Immobilier aujourd'hui ; Crédit V2 le déplacera. | Ne pas anticiper `/credit` ; parent `/immobilier` en attendant. |
| **Mobile crumbs longs** | Wrap sur 2–3 lignes à 320 px pour certains articles. | Non bloquant ; décision de confort en NAV-UX-1. |
| **Header figé** | Le breadcrumb est du contenu de page, mais un futur bloc généré doit rester **séparé** de MENU-2B/3.1 (gelés). | Nouveau marqueur dédié, sans toucher `NAV:START/END`. |

---

## 18. Éléments à NE PAS modifier

- `partials/header.html`, `scripts/build-header.js`, `scripts/nav-pages.json` (structure header).
- `assets/css/navigation.css`, `assets/css/navigation-immobilier.css`, `assets/js/navigation.js`.
- MENU-2B (méga-menus desktop) et MENU-3.1 (menu mobile 2 niveaux + boutons `← Retour` de sous-menu) — **gelés**.
- Tout title / meta / canonical / robots / H1 / H2 / Open Graph / JSON-LD existant.
- `sitemap.xml`, `vercel.json`, redirections, API, funnel (Tally/Brevo/GA4/Ads).
- Les 2 breadcrumbs `/immobilier/*` déjà conformes (modèle A) — à **répliquer**, pas à modifier.
- Les pages d'exception (INTENTIONAL_LEGACY, LANDING_SPECIAL, NO_HEADER_INTENTIONAL).
- `main` : aucun merge, aucun déploiement production.

---

*NAV-UX-0 — audit en lecture seule. Aucun fichier de code modifié. Seul livrable : ce document. NAV-UX-1 non démarré, en attente de validation.*
