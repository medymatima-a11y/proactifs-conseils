# CS-3.5 — Référentiel taux marché Proactifs

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-3 `ae8d45d`
**Nature :** création d'un **référentiel de taux marché** indépendant, versionné, daté, sourcé et remplaçable, ajouté à l'architecture `rates.js`. **Non connecté au prototype.** Aucun DOM, API, fetch, tracking. `LEGACY_REFERENCE` **strictement inchangé**. Aucune publication.

---

## 1. Objectif

Fournir aux futurs simulateurs publics Proactifs une grille de taux **indicative**, structurée et traçable, indépendante de la table `LEGACY_REFERENCE` (non sourcée) utilisée jusqu'ici pour la parité historique. CS-3.5 **crée uniquement le référentiel** : il ne modifie pas le prototype CS-2.1 ni ses résultats.

## 2. Architecture

```
CS-1  Moteur mathématique (core.js / calc-credit.js)
  ↓
CS-3  Politique métier (credit-policy.js)
  ↓
CS-3.5  Référentiel taux marché (rates.js → MARKET_REFERENCE)   ← cette phase
  ↓
CS-4  Interface / simulateur (à venir)
```

Le référentiel vit dans `assets/js/simulators/rates.js`, à côté de `LEGACY_REFERENCE`, en **UMD** (exploitable via `require()` Node et `window.SimRates` navigateur). Aucune dépendance externe.

## 3. MARKET_REFERENCE

Objet **immuable** (deep freeze) décrivant une grille marché datée. Champs : `id`, `version`, `effectiveMonth`, `effectiveDate`, `verifiedDate`, `status`, `currency`, `country`, `rateType`, `insuranceIncluded`, `marketScope`, `kind`, `nature`, `qualifiers`, `rates`, `supportedDurations`, `freshnessPolicy`, `sources`, `disclaimer`.

## 4. Valeurs septembre 2026

**`PROACTIFS_MARKET_REFERENCE_2026_09`** — `version 1.0.0` — `effectiveDate 2026-09-17` — `verifiedDate 2026-09-17` — `status INTERNAL_VALIDATION`.

| Durée | Taux nominal (hors assurance) |
|---|---|
| 10 ans | **3,20 %** |
| 15 ans | **3,35 %** |
| 20 ans | **3,50 %** |
| 25 ans | **3,60 %** |

`currency EUR` · `country FR` · `rateType NOMINAL_FIXED_RATE` · `marketScope FRANCE_NATIONAL_INDICATIVE`.

## 5. Nature indicative

`nature = PROACTIFS_SIMULATION_MARKET_REFERENCE`, `qualifiers = [NOT_BANK_OFFER, NOT_GUARANTEED_RATE, NOT_BEST_RATE]`.

Ces taux constituent une **hypothèse de simulation Proactifs** fondée sur plusieurs observations de marché. Ils **ne sont pas** : un taux garanti, un taux proposé, un « meilleur taux », une offre bancaire, une moyenne réglementaire, un barème banque, une promesse commerciale. Ils ne doivent jamais être qualifiés de « meilleur taux », « taux négocié », « taux garanti », « taux disponible », « taux obtenu » ou « taux proposé par nos partenaires ».

## 6. Sources

| Source | Type | Rôle |
|---|---|---|
| CAFPI | `MARKET_BAROMETER` | `MARKET_COMPARISON` |
| Empruntis | `MARKET_BAROMETER` | `MARKET_COMPARISON` |
| Pretto | `MARKET_BAROMETER` | `MARKET_COMPARISON` |
| Meilleurtaux | `MARKET_BAROMETER` | `MARKET_COMPARISON` |
| Banque de France | `OFFICIAL_STATISTICAL_REFERENCE` | `MACRO_SANITY_CHECK` |

Chaque source porte `checkedDate: 2026-09-17`.

## 7. Méthodologie

Les quatre valeurs (10/15/20/25) ont été **validées business** en amont. Le rôle de CS-3.5 est de les **structurer, documenter et tester** — pas d'inventer de chiffres. On confronte les baromètres courtiers pour situer la tendance marché, puis on retient une grille Proactifs prudente et cohérente.

## 8. Banque de France = contrôle macro

La Banque de France sert de **contrôle de cohérence macro/statistique** (ordre de grandeur du marché). Elle **n'est pas** la source directe de la grille 10/15/20/25 : aucune source ne valide individuellement les quatre valeurs Proactifs.

## 9. Courtiers = comparaison marché

CAFPI, Empruntis, Pretto, Meilleurtaux sont des **baromètres de marché** utilisés en **comparaison**. Aucun n'est présenté comme validant la grille Proactifs.

## 10. Absence d'offre bancaire

Le référentiel ne contient **aucun barème banque** et ne représente **aucune offre**. Voir §18 pour la distinction avec les barèmes partenaires (non implémentés).

## 11. Hors assurance

`insuranceIncluded === false`. Les taux sont **nominaux, hors assurance emprunteur**. L'assurance est traitée séparément par la politique métier CS-3.

## 12. Sélection par durée

Fonction pure `getMarketRate(durationYears, reference)` (référence par défaut = `ACTIVE_MARKET_REFERENCE`) :

- `getMarketRate(10)` → `3.20`
- `getMarketRate(15)` → `3.35`
- `getMarketRate(20)` → `3.50`
- `getMarketRate(25)` → `3.60`

## 13. Durées non supportées

**Aucune extrapolation silencieuse.** Toute durée non listée (7, 12, 17, 22, 30…) ou entrée non numérique (`null`, `undefined`, `NaN`, chaîne) renvoie **`UNSUPPORTED_MARKET_DURATION`**. `getMarketRate(30)` ne renvoie **jamais** 3,60 implicitement.

## 14. Validation

`validateMarketReference(reference)` → `{ valid, errors }`. Contrôle : `id`, `version`, `effectiveDate`/`verifiedDate` valides, `rates` présents avec 10/15/20/25 numériques > 0, `insuranceIncluded === false`, `sources` non vides, `disclaimer` présent.

## 15. Fraîcheur

`getMarketReferenceFreshness(reference, asOfDate)` → `{ state, ageDays, verifiedDate, currentMaxDays, reviewDueMaxDays }`. **Aucun fetch, aucune modification de taux.**

| État | Ancienneté depuis `verifiedDate` |
|---|---|
| `CURRENT` | ≤ 31 jours |
| `REVIEW_DUE` | 32 à 45 jours |
| `STALE` | > 45 jours |

⚠️ Ces seuils sont une **politique interne Proactifs** (champ `freshnessPolicy` de la référence + constante `MARKET_FRESHNESS_POLICY`), **pas une règle bancaire**.

## 16. Historique mensuel

`MARKET_REFERENCE_HISTORY` est un registre par `id`, prêt à accueillir `PROACTIFS_MARKET_REFERENCE_2026_10`, `…_2026_11`, etc. **Aucune fausse référence future n'a été créée** — seule septembre 2026 existe.

## 17. ACTIVE_MARKET_REFERENCE

Alias `ACTIVE_MARKET_REFERENCE` → pointe actuellement sur `PROACTIFS_MARKET_REFERENCE_2026_09`. Il permettra à CS-4 de changer de grille en **repointant l'alias**, sans toucher au moteur. **CS-3.5 ne fait pas utiliser cet alias par le prototype.**

## 18. Distinction MARKET_REFERENCE / PARTNER_RATE_SHEETS

- **`MARKET_REFERENCE`** = taux **indicatif public** (cette phase).
- **`PARTNER_RATE_SHEETS`** = barèmes **privés** Proactifs / banques partenaires — **concept uniquement**, non implémenté. Aucune banque (BNP, LCL, SG, Crédit Agricole, Banque Populaire…) n'est créée, aucune donnée de l'ancien outil « My Courtier d'avenir » n'est recopiée. Les deux couches ne doivent **jamais** être mélangées.

## 19. Procédure mensuelle de mise à jour

1. Consulter plusieurs baromètres marché (CAFPI, Empruntis, Pretto, Meilleurtaux).
2. Contrôler la tendance Banque de France disponible (cohérence macro).
3. Déterminer la nouvelle grille Proactifs 10/15/20/25.
4. **Validation humaine.**
5. Créer une nouvelle référence versionnée (`PROACTIFS_MARKET_REFERENCE_AAAA_MM`) dans `MARKET_REFERENCE_HISTORY`.
6. Tester (`market-rates.test.js`).
7. Repointer `ACTIVE_MARKET_REFERENCE`.
8. Commit.
9. Revue.
10. Déployer **seulement après validation**.

⚠️ **Aucune mise à jour automatique en V1.**

## 20. Limites

Grille **indicative**, nationale, hors assurance ; ne reflète aucune offre individuelle ; ne remplace pas l'étude de financement. Durées limitées à 10/15/20/25. Statut `INTERNAL_VALIDATION` (non publié). La qualité dépend de la revue mensuelle humaine.

---

## Git

Diff CS-3.5 limité à `assets/js/simulators/rates.js` (ajout MARKET_REFERENCE, `LEGACY_REFERENCE` inchangé), `tests/simulators/market-rates.test.js`, `docs/CS-3.5-REFERENTIEL-TAUX.md`. Commit `CS-3.5 : referentiel taux marche septembre 2026` sur `credit-simulateurs-v2`. **Aucun merge `main`, aucune production.**

**STOP.** CS-4 non démarré.
