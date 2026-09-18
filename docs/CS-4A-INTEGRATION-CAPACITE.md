# CS-4A — Intégration fonctionnelle : simulateur capacité d'emprunt V2

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-3.5 `d2da09c`
**Nature :** prototype **PREVIEW** interne (noindex, non public, aucun réseau, lead mock). Transforme le prototype CS-2.1 en prototype **fonctionnel** branché sur CS-1 + CS-3 + CS-3.5. **Aucune mise en production, aucune page SEO, aucun /simulateurs.**

---

## 1. Architecture & flux de données

```
MOTEUR          core.js / calc-credit.js / calc-immo.js      (CS-1, gelé)
POLITIQUE       credit-policy.js — evaluateFinancingInputs   (CS-3, gelé)
TAUX            rates.js — ACTIVE_MARKET_REFERENCE / getMarketRate / freshness (CS-3.5, gelé)
ADAPTER/UI      prototype-capacity.js                        (CS-4A)
PRÉSENTATION    ui.js (gelé) / simulators.css (gelé) / prototype HTML
```

Flux : **UI → `buildFinancingInput()` → `evaluateFinancingInputs()` (CS-3) → `getMarketRate()` (CS-3.5) → `principalFromPayment()` (CS-1) → résultat + mappings UX**. Aucune formule métier ni taux recopiés dans le HTML. La logique est **réutilisable** telle quelle par une future page SEO (voir §17).

## 2. Ce qui a changé

**Modifiés :**
- `assets/js/simulators/prototype-capacity.js` — ajout de la voie marché : `buildFinancingInput`, `computeCapacityV2`, `validateStepV2`, mappings `mapReliability` / `mapReviewFlags` / `describeFreshness` / `marketMonthLabel`, `init()` réécrit pour le wizard V2. La voie **LEGACY `computeResult()` est conservée inchangée** (parité CS-2).
- `prototypes/simulateur-capacite-emprunt-v2.html` — wizard V2, questions conditionnelles, résultat marché, chargement de `credit-policy.js`.

**Créés :** `tests/simulators/cs4a-integration.test.js`, `docs/CS-4A-INTEGRATION-CAPACITE.md`.

**Gelés (diff vide) :** `core.js`, `calc-credit.js`, `calc-immo.js`, `credit-policy.js`, `rates.js`, `ui.js`, `lead.js`, `simulators.css`, `simulation-pret-immobilier.html`.

## 3. Référentiel taux (CS-3.5)

Le prototype V2 utilise **`ACTIVE_MARKET_REFERENCE`** via `getMarketRate(durationYears)` — jamais `LEGACY_REFERENCE`, jamais de valeur codée en dur.

| Durée | Taux | 
|---|---|
| 10 ans | 3,20 % |
| 15 ans | 3,35 % |
| 20 ans | 3,50 % |
| 25 ans | 3,60 % |

30 ans **n'est plus proposé**. La date de référence affichée (« septembre 2026 ») est **dérivée** de `effectiveMonth`, non codée en dur.

## 4. Parcours (wizard 4 étapes, progressive disclosure)

1. **Votre projet** — type (RP / investissement locatif / résidence secondaire / autre) + « J'emprunte seul / à deux ».
2. **Vos revenus** — revenus nets ; co-emprunteur (si à deux) ; « revenus locatifs actuels ? » → montant (70 %) ; loyer futur estimé (si investissement locatif) ; « autres revenus réguliers » (facultatif, replié).
3. **Votre situation financière** — crédits en cours (+ case « se termine < 12 mois »), apport, durée (10/15/20/25), « resterez-vous locataire ? » → loyer restant ; « connaissez-vous l'assurance ? » → coût.
4. **Votre estimation** — résultat.

## 5. Mapping UX de `reliability` (interne → client)

Les codes `STANDARD / PARTIAL / MANUAL_REVIEW` ne sont **jamais** affichés. Mapping :

| Interne | Titre client | Texte |
|---|---|---|
| `STANDARD` | « Votre première estimation est prête. » | « Nous pouvons maintenant étudier les conditions de financement adaptées à votre projet. » |
| `PARTIAL` | « Cette estimation peut être affinée. » | « Certains éléments, comme l'assurance emprunteur, peuvent modifier votre capacité réelle. » |
| `MANUAL_REVIEW` | « Votre situation mérite une étude personnalisée. » | « Certains revenus ou éléments de votre financement nécessitent une analyse plus précise. » |

## 6. Mapping des `reviewFlags` (couche indépendante du moteur)

Chaque flag CS-3 est traduit en message client (aucun code technique brut affiché) :
`INSURANCE_NOT_INCLUDED`, `OTHER_INCOME_REQUIRES_REVIEW`, `EXISTING_LOAN_ENDING_SOON_REVIEW`, `RENTAL_INCOME_ASSUMPTION_USED`, `REMAINING_RENT_INCLUDED`, `PROJECTED_RENTAL_INCOME_USED`. Les flags restent accessibles au code (debug, tracking bucket).

## 7. Règles métier appliquées

- **Assurance** : connue → intégrée aux charges ; inconnue → `0` + `INSURANCE_NOT_INCLUDED` + `PARTIAL`, calcul **non bloqué**, message explicite affiché.
- **Revenus locatifs** existants → rétention 70 % (hypothèse Proactifs, **pas** présentée comme règle réglementaire) + `RENTAL_INCOME_ASSUMPTION_USED`.
- **Loyer futur** (investissement locatif) → 70 % + `PROJECTED_RENTAL_INCOME_USED`.
- **Autres revenus** → **non intégrés automatiquement** + `OTHER_INCOME_REQUIRES_REVIEW` + `MANUAL_REVIEW`.
- **Loyer restant** → inclus dans les charges + `REMAINING_RENT_INCLUDED`.
- **Crédit à échéance** → `EXISTING_LOAN_ENDING_SOON_REVIEW` **seul**, charges **jamais réduites** automatiquement.
- **Taux d'endettement** : `maxDebtRatio = 0.35` (CS-3, `REFERENCE_STANDARD` / `NOT_ABSOLUTE_APPROVAL_LIMIT`). Jamais « vous avez droit à 35 % ».

## 8. Fraîcheur du référentiel

`getMarketReferenceFreshness()` pilote l'affichage : `CURRENT` → simulation normale (aucun message) ; `REVIEW_DUE` → message discret ; `STALE` → message explicite « Le taux de référence de cette simulation doit être actualisé. ». Aucun fetch, aucun taux inventé.

## 9. Résultat (hiérarchie)

Budget total estimé (héros) → capacité d'emprunt · mensualité estimée · apport · durée · taux utilisé → messages flags → fraîcheur → « Référence mise à jour : septembre 2026 » → transparence taux (hors assurance) → bloc « Comment cette estimation est-elle calculée ? » → CTA « Étudier mon financement » → lead mock.

## 10. Aucun verdict bancaire

Aucun « accepté / refusé / éligible / score / probabilité / pré-accord ». `reliability` est un **niveau de fiabilité de la simulation**, jamais un score. Test dédié vérifie l'absence de champ décisionnel et de jeton de verdict.

## 11. Lead mock & réseau

Formulaire prototype (prénom, email, téléphone, projet facultatif). Submit = **transport mock** (`makeMockTransport`), message « Prototype — aucune donnée envoyée. ». **Aucun** fetch, Supabase, Brevo, Systeme.io, /api/subscribe.

## 12. Tracking

`ui.track` (whitelist 5 événements), buckets de budget uniquement, aucune PII, aucun montant exact. Pas de GA4 réel.

## 13. Debug

Invisible par défaut ; `?debug=1` affiche inputs normalisés, revenus/charges retenus, flags, reliability, id de référence marché, taux, fraîcheur.

## 14. Accessibilité

`fieldset`/`legend`, labels réels, `:focus-visible`, navigation clavier, `aria-expanded` sur les zones conditionnelles, `aria-live` sur le résultat, messages d'erreur associés aux champs.

## 15. Responsive

1 colonne mobile, cibles tactiles, budget immédiatement visible, CTA large, aucun débordement horizontal (vérifié 390 px). Desktop : budget dominant, 5 indicateurs secondaires max.

## 16. noindex

`<meta name="robots" content="noindex,nofollow">` conservé. Absent du sitemap, aucun lien public.

## 17. Architecture réutilisable pour la future page SEO

`computeCapacityV2(input)` et `buildFinancingInput(uiData)` sont **purs et exportés** : la future page `/simulateurs/capacite-emprunt` (CS-4SEO / CS-4B) pourra les réutiliser **sans réécrire le moteur**. Même moteur pour :
- la simulation utilisateur ;
- de futurs exemples pédagogiques (« Quel salaire pour emprunter 200 000 € ? ») — **non codés ici**, aucune valeur inventée.

Template SEO futur (documenté, **non créé**) : H1 → simulateur → résultat → « Comment est-ce calculé ? » → contenu pédagogique → cas pratiques → FAQ → autres simulateurs → maillage interne → CTA courtage → Schema.org + sources + date.

## 18. MARKET_REFERENCE vs PARTNER_RATE_SHEETS

`MARKET_REFERENCE` = taux indicatif public (utilisé ici). `PARTNER_RATE_SHEETS` = barèmes privés partenaires — **non implémentés** (concept CS-3.5). Les deux ne doivent jamais être mélangés.

## 19. Limites

Prototype preview, hors assurance quand non renseignée, durées 10/15/20/25, statut de la politique `INTERNAL_VALIDATION`, référentiel marché indicatif. Aucune décision bancaire.

## 20. Restant avant CS-4SEO / CS-4B

Création de la page publique `/simulateurs/capacite-emprunt` (breadcrumb, hero SEO, H1, contenu pédagogique, FAQ, maillage, Schema.org, CTA courtage), validation métier des taux, et intégration lead réelle. **Non entamé.**

---

## Git

Diff CS-4A : `prototypes/simulateur-capacite-emprunt-v2.html`, `assets/js/simulators/prototype-capacity.js`, `tests/simulators/cs4a-integration.test.js`, `docs/CS-4A-INTEGRATION-CAPACITE.md`. `index.html` (préexistant) exclu. Commit `CS-4A : integration fonctionnelle capacite emprunt V2` sur `credit-simulateurs-v2`. **Aucun merge `main`, aucune production.**

**STOP.** CS-4SEO / CS-4B non démarrés.
