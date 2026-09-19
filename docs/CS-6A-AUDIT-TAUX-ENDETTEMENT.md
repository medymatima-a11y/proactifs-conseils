# CS-6A — Audit & conception du simulateur « Taux d'endettement »

**Projet :** Proactifs Conseils — Simulateurs V2
**Phase :** CS-6A — AUDIT / CONCEPTION uniquement. **Aucun développement, CS-5 gelé.**
**Date :** 19 septembre 2026
**Cible :** `/simulateurs/taux-endettement` (3ᵉ simulateur, UX directe)
**Statut :** document de cadrage — à faire valider par ChatGPT avant CS-6B.

> Ce document est le seul livrable de CS-6A. Aucun fichier fonctionnel modifié. La page n'est pas créée ; sitemap, breadcrumbs, nav, hub, home `#simulateurs` intacts.

---

## 1. État du socle existant

Branche `credit-simulateurs-v2`, HEAD `87f390a`. Production à jour (mensualité publiée, 301/308 legacy consolidée).

| Brique | État | Réutilisable pour endettement |
|---|---|---|
| `core.js` | `toNumber` (formats FR/EN), `round(v,dp)`, `clampMin`, `isValidNumber`, `monthsFromYears`, `monthlyPayment` | ✅ oui (parsing, arrondi) |
| `calc-credit.js` | **`calculateDebtRatio({payment,income})`**, `calculateMonthlyPayment`, `calculateMaxPayment`, `calculateBudget`… | ✅ **cœur du simulateur** |
| `credit-policy.js` | `PROACTIFS_CREDIT_POLICY_V1` (gelée) : `maxDebtRatio 0.35`, `rentalIncomeRetention 0.70`, catégories de revenus, WARNING codes | ✅ repère 35 % + règle locative + avertissements |
| `ui.js` | `formatEuro`, **`formatPercent(v,decimals)`**, `track` (5 events, drop PII/montants) | ✅ affichage % + analytics |
| `lead.js` | `buildLeadPayload`, `isSubmittable`, `submitLead(payload, transport)` | ✅ CTA/lead |
| `simulators.css` | primitives `.sim-root .sim-container .sim-field .sim-progress .sim-result .sim-cta .sim-cta--ghost .sim-msg .sim-error .sim-success` | ✅ base design |
| Pages V2 | `capacite-emprunt` (guidé), `mensualite-credit` (direct, publié) | ✅ **mensualité = gabarit direct de référence** |
| `prototype-mensualite.js` | adaptateur direct + comparateur + pastille + CTA vert/or (classes `.men-*`) | ✅ **patron d'adaptateur + composants** |

**Conclusion :** tout le nécessaire existe. Le 3ᵉ simulateur est un **nouvel adaptateur + une nouvelle page**, sans toucher au socle.

## 2. Moteur réutilisable

`calc-credit.js` :

```js
/* Taux d'endettement d'une mensualité. { payment, income } -> ratio (0..1+) */
function calculateDebtRatio(p) {
  if (!num(p.payment) || !num(p.income) || p.income <= 0) return NaN;
  return p.payment / p.income;
}
```

Pour l'endettement, on agrège :
- `income` = **revenus retenus** (nets foyer + co-emprunteur + locatifs pondérés à 70 %),
- `payment` = **charges retenues** (mensualités de crédits existants + éventuelle **nouvelle** mensualité + pensions/charges financières).

`calculateDebtRatio({payment: chargesRetenues, income: revenusRetenus})` renvoie exactement le taux d'endettement (ratio 0..1+). **Le moteur suffit TEL QUEL — aucune modification.**

Le repère 35 % (`maxDebtRatio`) et la pondération locative 70 % (`rentalIncomeRetention`) sont **lus depuis la policy**, jamais codés en dur.

## 3. Formule, unités, arrondis, cas limites

**Formule :** `tauxEndettement = chargesRetenues / revenusRetenus`
**Affichage :** `round(ratio * 100, 1)` puis `ui.formatPercent(pct, 1)` → « 33,6 % ».

| Aspect | Comportement |
|---|---|
| Paramètres | `payment` (charges, €/mois), `income` (revenus, €/mois) — deux nombres |
| Unités | euros mensuels en entrée ; ratio sans unité en sortie ; % à l'affichage |
| Arrondi | à la charge de l'appelant : `round(ratio*100, 1)` (1 décimale) |
| `income ≤ 0` | `calculateDebtRatio` renvoie **NaN** → afficher une erreur de saisie, pas 0 % |
| `income` invalide/vide | NaN → message « Indiquez vos revenus mensuels nets » |
| `payment` invalide/vide | NaN → message ; **charges = 0** doit être un choix explicite, pas un vide |
| charges = 0 (revenus > 0) | ratio 0 % (valide : aucun crédit) — libellé neutre « sous le repère » |
| valeurs négatives | rejetées à la validation (revenus/charges ≥ 0) avant appel moteur |
| revenus locatifs | pondérés à 70 % (policy) → **WARNING** « hypothèse prudente Proactifs » |
| nouvelle mensualité | ajoutée aux charges si renseignée (champ optionnel) |
| autres revenus | **non retenus automatiquement** → flag « revue manuelle » (policy `OTHER_STABLE_INCOME` retention=null) |
| ratio > 100 % | possible (charges > revenus) : afficher tel quel, libellé « dépasse le repère », pas d'erreur |

**Décision moteur :** réutiliser `calculateDebtRatio` **sans modification**. L'agrégation revenus/charges se fait dans l'adaptateur `prototype-endettement.js` (nouveau), en s'appuyant sur les constantes de la policy (35 %, 70 %). Priorité respectée : **ne pas modifier le moteur partagé.**

## 4. Données d'entrée (formulaire court, UX directe)

**REVENUS MENSUELS**
- Revenus nets du foyer (obligatoire)
- Co-emprunteur : toggle « Seul / À deux » → 2ᵉ champ revenus (rétention 100 %)
- Revenus locatifs mensuels (optionnel) → rétention **70 %** (policy) + avertissement

**CHARGES MENSUELLES**
- Mensualités de crédits existants (optionnel, défaut 0)
- Pension(s) / charges financières pertinentes (optionnel)
- **Nouvelle** mensualité du crédit envisagé (optionnel) — pont naturel depuis `/simulateurs/mensualite-credit`

**Cas « autres revenus »** : un champ optionnel « autres revenus » **n'est pas retenu automatiquement** (flag revue manuelle) — cohérent avec la policy `OTHER_STABLE_INCOME`. Recommandation : le proposer en option repliée pour ne pas alourdir l'UX directe.

Règles réutilisées telles quelles (aucune nouvelle règle inventée) :
- co-emprunteur : addition des revenus (comme capacité) ;
- locatif : rétention 70 % (`rentalIncomeRetention`) + `WARNING RENTAL_INCOME_ASSUMPTION` ;
- loyer restant à payer éventuel : **charge** (comme capacité, flag `REMAINING_RENT_INCLUDED`) ;
- autres revenus : hors calcul auto (`OTHER_INCOME_MANUAL_REVIEW`).

## 5. Résultat UX (bloc résultat)

```
VOTRE TAUX D'ENDETTEMENT ESTIMÉ
        33,6 %

Revenus retenus : 4 200 €        (carte)
Charges retenues : 1 410 €       (carte)
Repère utilisé pour cette simulation : 35 %   (carte)

[Interprétation neutre — voir §5.1]

⚠ (si locatif) Hypothèse prudente : 70 % des revenus locatifs retenus.
⚠ (si autres revenus) Non retenus automatiquement (analyse personnalisée).
ℹ Estimation indicative, non contractuelle. Le financement dépend aussi des
   revenus, charges, reste à vivre, apport, épargne, situation professionnelle,
   type de projet et de la politique du prêteur.
```

### 5.1 Interprétation neutre (jamais un verdict bancaire)

| Zone (avec tolérance §7) | Phrase |
|---|---|
| sous le repère | « Votre taux estimé se situe **sous** le repère utilisé dans cette simulation. » |
| autour du repère | « Votre taux estimé se situe **autour** du repère utilisé dans cette simulation. » |
| au-dessus du repère | « Votre taux estimé **dépasse** le repère utilisé dans cette simulation. » |

**Interdits stricts (rédaction) :** « bon/mauvais dossier », « éligible/non éligible », « finançable », « refus probable », « accepté par les banques », « votre dossier respecte les critères ». Le simulateur donne un **fait chiffré + un repère**, jamais un avis de financement.

## 6. Gestion du repère 35 %

- `maxDebtRatio: 0.35` est lu depuis `PROACTIFS_CREDIT_POLICY_V1` (jamais codé en dur, jamais présenté comme règle absolue).
- Libellé : « **Repère** utilisé pour cette simulation : 35 % » (pas « seuil bancaire », pas « limite légale »).
- **Tolérance d'affichage recommandée (documentation seule, aucune modif policy) :** une bande neutre **±0,2 pt** autour de 35 % pour la zone « autour du repère ». Ainsi 34,9 % / 35,0 % / 35,1 % partagent la même formulation « autour du repère », évitant une bascule rédactionnelle artificielle due aux arrondis. Le **calcul** reste inchangé ; seule la **phrase d'interprétation** utilise la bande.
  - `pct < 34,8` → « sous »
  - `34,8 ≤ pct ≤ 35,2` → « autour »
  - `pct > 35,2` → « dépasse »
  - (valeurs de bande à confirmer en CS-6B ; recommandation : ±0,2 pt.)
- **Aucune policy modifiée en CS-6A.** La tolérance est une constante d'affichage de la future page/adaptateur, pas une modification de `maxDebtRatio`.

## 7. Cas limites (récapitulatif)

- Revenus vides / 0 / négatifs → erreur de saisie (pas de calcul).
- Charges vides → traiter comme « à préciser » ; charges 0 explicites → 0 % valide.
- Locatif renseigné → 70 % + avertissement.
- Nouvelle mensualité renseignée → ajoutée aux charges.
- Autres revenus → non retenus auto + flag revue.
- Ratio > 100 % → affiché, libellé « dépasse », pas d'erreur.
- Tous champs charges vides + revenus valides → 0 %.

## 8. SEO — intention propre & anti-cannibalisation

**Intention CS-6A :** « **calculer son taux d'endettement** » (question factuelle, réponse immédiate). Variantes naturelles : « calcul taux d'endettement », « taux d'endettement crédit immobilier », « simulateur taux d'endettement », « comment calculer son taux d'endettement ». *(Volumes non inventés — à mesurer via Agent SEO / GSC.)*

**Différenciation (une intention = une page) :**

| Page | Question | Intention |
|---|---|---|
| `/simulateurs/capacite-emprunt` | Combien puis-je emprunter ? | montant empruntable |
| `/simulateurs/mensualite-credit` | Combien vais-je rembourser/mois ? | mensualité |
| **`/simulateurs/taux-endettement`** | **Quelle part de mes revenus est engagée ?** | **ratio charges/revenus** |
| `/courtage-credit-immobilier` | (commercial) accompagnement financement | conversion / offre |

Pas de recouvrement : capacité = « montant », mensualité = « mensualité », endettement = « ratio ». Le courtage reste la page commerciale (cible du CTA).

**Structure proposée (architecture, pas rédaction finale) :**
- **title** : « Calcul du taux d'endettement | Simulateur gratuit | Proactifs » *(à affiner ≤ 60 car.)*
- **meta description** : « Calculez votre taux d'endettement en quelques secondes. Estimation immédiate, gratuite et sans engagement. Repère indicatif 35 %. » *(≤ 155 car.)*
- **H1** : « Calculez votre taux d'endettement »
- **intro** : 2-3 phrases (ce qu'est le taux d'endettement, à quoi il sert, caractère indicatif).
- **H2** : « Comment se calcule le taux d'endettement ? » (formule charges/revenus), « Que signifie le repère de 35 % ? » (neutre, non réglementaire), « Endettement, capacité et mensualité : quelles différences ? » (maillage), « Exemples de calcul » (§9).
- **FAQ (JSON-LD FAQPage)** : « Comment calculer son taux d'endettement ? », « Le 35 % est-il obligatoire ? », « Les revenus locatifs comptent-ils ? », « La nouvelle mensualité est-elle incluse ? ».
- **robots** : `index, follow` ; **canonical** `https://proactifsconseils.fr/simulateurs/taux-endettement`.

## 9. Exemples dynamiques (calculés par le moteur, pas codés)

Section « Exemples de calcul du taux d'endettement » — chaque valeur **produite par `calculateDebtRatio`** (comme les exemples 200/300/400 k€ de mensualité), jamais en dur :

| Revenus | Charges | Taux (moteur) |
|---|---|---|
| 3 000 € | 900 € | 30,0 % |
| 4 000 € | 1 320 € | 33,0 % |
| 5 000 € | 1 500 € | 30,0 % |
| 6 000 € | 2 100 € | 35,0 % |
| 4 500 € | 1 700 € | 37,8 % |

(3 à 5 exemples ; valeurs ci-dessus = illustration de la logique ; l'implémentation appelle le moteur avec ces entrées.)

## 10. Conversion

- Bloc identique à mensualité : titre « **Votre projet mérite plus qu'une simulation.** », texte financement, bouton **« Étudier mon financement »**, réassurance (Analyse personnalisée / Accompagnement / Sans engagement), fond vert profond + bouton or.
- Position : après le résultat + interprétation, avant le contenu SEO.
- Lead via `lead.js` + transport réel `POST /api/subscribe` (**inchangé**, comme mensualité CS-5D.1).
- **Payload minimal** (schéma `buildLeadPayload`, aucune donnée financière) :
  ```
  { prenom, nom:"", email, tel, situation:"", service:"credit",
    answers:[{ source:"simulateur_taux_endettement" }] }
  ```
- **Ne pas** envoyer revenus/charges/taux dans le lead (aucune justification métier ici).

## 11. Analytics (documentation, pas d'implémentation)

Réutiliser `ui.track` (5 événements déjà autorisés) :
`simulation_started`, `simulation_completed`, `simulation_result`, `financing_cta_clicked`, `financing_lead_submitted` — avec `simulator_type: 'debt_ratio'`.

Pour `simulation_result` : **aucune donnée financière ni PII** (revenus, charges, mensualités, coordonnées). `FORBIDDEN_KEYS` de `ui.js` supprime déjà automatiquement ces clés. Seule une **catégorie anonyme** est transmise :
- `bucket: 'below_reference' | 'around_reference' | 'above_reference'`

(cohérent avec la bande de tolérance §6). Aucune valeur exacte, aucun montant.

## 12. Design / Mobile

- Réutiliser le design system : **ivoire** `--ivory`, **vert profond** `--forest`, **or** `#C4973A`, cartes blanches, coins arrondis, Cormorant Garamond (titres) + Nunito Sans (corps).
- Composants réutilisables : hero simulateur (eyebrow/H1/promesse/CTA/réassurance), `.sim-root`/`.sim-container`/`.sim-field`, `.sim-cta`, `.sim-msg`/`.sim-error`/`.sim-success`, cartes de résultat (`.result-cell`), avertissement, bloc CTA vert/or, section pédagogique + FAQ. **Pas de nouveau design system.**
- Spécifique endettement : grand chiffre « XX,X % » (résultat principal) ; 3 cartes secondaires (revenus retenus / charges retenues / repère 35 %).
- **Mobile 320 / 375 / 390 / 430 px :** montants et pourcentage en `white-space:nowrap` (réutiliser `.nb` de mensualité) ; champs lisibles ; résultat compact (réutiliser le pattern « cartes compactées mobile » de CS-5B.1) ; CTA pleine largeur si nécessaire ; aucune largeur fixe ; zéro overflow horizontal.

## 13. Risques

| Risque | Mitigation |
|---|---|
| Dérive rédactionnelle vers un verdict bancaire | Interprétation neutre stricte (§5.1) + interdits explicites ; à tester |
| Perception du 35 % comme règle absolue | Libellé « repère » + phrase « le financement dépend aussi de… » |
| Bascule artificielle à 35,0 % (arrondis) | Bande de tolérance d'affichage ±0,2 pt (§6), sans toucher le calcul |
| Fuite de données au tracking | `FORBIDDEN_KEYS` + buckets seuls (§11) |
| Cannibalisation capacité/mensualité | Intention distincte « ratio » (§8) + cross-links |
| Revenus locatifs mal compris | Rétention 70 % affichée comme hypothèse Proactifs + avertissement |
| Lead non fonctionnel | Réutiliser transport réel validé (mensualité) ; test bout-en-bout en recette |

## 14. Fichiers qui SERAIENT modifiés/créés en CS-6B (pas en CS-6A)

**Créés :**
- `assets/js/simulators/prototype-endettement.js` (nouvel adaptateur, aucune modif socle)
- `simulateurs/taux-endettement.html` (nouvelle page, gabarit mensualité)
- `tests/simulators/cs6-endettement.test.js` (tests dédiés)
- `docs/CS-6B-…md` (rapport d'implémentation)

**Mis à jour (publication, à l'étape publication seulement) :**
- `sitemap.xml` (via `generate-sitemap.js`, automatique)
- `scripts/breadcrumb-pages.json` + `scripts/nav-pages.json` (registres centralisés)

**Jamais modifiés :** `core.js`, `calc-credit.js`, `calc-immo.js`, `rates.js`, `credit-policy.js`, `ui.js`, `lead.js`, `simulators.css` (sauf ajout de classes spécifiques strictement nécessaires, à décider), `capacite-emprunt.html`, `mensualite-credit.html`, `partials/header.html`, navigation, home `#simulateurs`, `pret-immobilier-index`, sous-domaine, `/api/subscribe`.

## 15. Recommandation finale pour CS-6B

1. **UX directe** calquée sur mensualité (formulaire court, résultat immédiat, pédagogie après).
2. **Moteur réutilisé tel quel** : `calculateDebtRatio` + agrégation dans l'adaptateur, constantes 35 %/70 % lues depuis la policy (aucune modif socle).
3. **Résultat strictement neutre** : « XX,X % » + « Repère : 35 % » + phrase below/around/above, jamais un verdict bancaire.
4. **Tolérance d'affichage ±0,2 pt** autour de 35 % (constante de page, pas de policy).
5. **Locatif 70 %** + avertissement ; **autres revenus** hors calcul auto (revue manuelle).
6. **Conversion** = composant CTA vert/or + lead réel `POST /api/subscribe`, payload `service:credit` / `source:simulateur_taux_endettement`, sans donnée financière.
7. **Analytics** : 5 événements + bucket `below/around/above_reference` uniquement.
8. **Design/mobile** : réutilisation `.sim-*`/`.men-*`, nowrap, responsive 320-430, zéro overflow.
9. **Publication** en 2 temps (comme mensualité) : d'abord page + tests + QA (noindex preview possible), puis passage `index` + registres + 301 éventuels — **hors CS-6B si tu préfères un CS-6C de publication**.
10. **Ne pas** créer le hub `/simulateurs` ni toucher la home tant que le 3ᵉ simulateur n'est pas publié (décision CS-5C : hub après 3 outils).

**Verdict :** faisabilité **élevée**, risque technique **faible** (socle prêt, zéro modif moteur). Le principal enjeu est **rédactionnel** (neutralité du résultat), à cadrer précisément en CS-6B.

---

*Fin CS-6A. Conception documentée, aucun fichier fonctionnel modifié, aucune page créée. À valider par ChatGPT avant CS-6B.*
