# CS-5B — Prototype simulateur de mensualité de crédit

**Date :** 18/09/2026 · **Branche :** `credit-simulateurs-v2` · **Base :** CS-5A `5ee7182`
**Statut :** PREVIEW — `noindex,nofollow`, hors sitemap / menu / breadcrumb centralisé / maillage public. Aucune publication, aucun merge, aucun lead réel.

## Architecture
Deuxième simulateur Proactifs bâti sur le socle existant, **sans y toucher**. Nouvel adaptateur UI `prototype-mensualite.js` (indépendant de `prototype-capacity.js`), page `mensualite-credit.html` répliquant le design gelé CS-4C.1 (duplication CSS légère assumée), parcours **une seule carte** (pas de wizard).

## Fichiers
- **Créés** : `simulateurs/mensualite-credit.html`, `assets/js/simulators/prototype-mensualite.js`, `tests/simulators/cs5b-mensualite.test.js`, `docs/CS-5B-PROTOTYPE-MENSUALITE.md`.
- **Modifiés** : aucun fichier de socle. (`index.html` préexistant reste hors scope.)

## Socles gelés (confirmés inchangés)
`core.js`, `calc-credit.js`, `calc-immo.js`, `credit-policy.js`, `rates.js`, `ui.js`, `lead.js`, `prototype-capacity.js`, `simulateurs/capacite-emprunt.html`, `partials/header.html`, API/Supabase/Brevo/Systeme.io, GA4 global, vercel.json, robots, sitemap, navigation, breadcrumbs de production. Décision CS-5B : `compareLoanDurations()` **non ajouté** à calc-credit (comparateur fait dans l'adaptateur ; réévaluation après le 3ᵉ simulateur).

## Fonctions réutilisées
- `SimCalcCredit.calculateMonthlyPayment({principal, annualRatePct, durationYears})` — mensualité HA.
- `SimCalcCredit.calculateCreditCost(...)` — contrôle des intérêts (`creditCostRaw`).
- `SimCore.monthsFromYears`, `SimCore.round`, `SimCore.toNumber`, `SimCore.clampMin`, `SimCore.isValidNumber`.
- `SimRates.getMarketRate(durée, ACTIVE_MARKET_REFERENCE)`, `SimRates.ACTIVE_MARKET_REFERENCE.effectiveMonth`.
- `SimCreditPolicy.PROACTIFS_CREDIT_POLICY_V1.publicDurations` ([10,15,20,25]) — source de vérité des durées.
- `SimUI.formatEuro/formatPercent/track/setState`, `SimLead.buildLeadPayload/submitLead`.

## Formule
Amortissement classique : mensualité = capital / facteurAnnuité(taux, mois). Total remboursé HA = mensualité arrondie × mois. Intérêts affichés = total − capital (cohérence à l'écran, cf. Arrondis). Tout dérive du moteur ; **aucune valeur financière ni taux codés en dur** (exemples 200/300/400 k€ générés dynamiquement au chargement).

## Arrondis (stratégie)
Mensualités arrondies à l'euro. Mensualité totale = mensualité HA arrondie + assurance arrondie (somme exacte à l'écran). Totaux sur la durée = mensualité arrondie × mois. Intérêts affichés = total HA − capital → **capital + intérêts = total** exactement. `creditCostRaw` (via `calculateCreditCost`) est conservé pour contrôle ; écart ≤ (arrondi mensuel) × mois, documenté.

## Taux (§9/§14)
- Mode A « Taux indicatif Proactifs » (défaut) : `getMarketRate(durée, ACTIVE_MARKET_REFERENCE)`, libellé « Taux indicatif Proactifs » + « Référence <mois année> · hors assurance » (mois dérivé de `effectiveMonth`, helper local `marketMonthLabel`).
- Mode B « Je connais mon taux » : saisie utilisée telle quelle comme `annualRatePct`, libellé « Taux renseigné », **jamais** présenté comme référence Proactifs. **Ne modifie jamais** `ACTIVE_MARKET_REFERENCE` (vérifié par test).

## Assurance (§10/§11)
Question Oui/Non. Non → assurance = 0, message « Assurance emprunteur non incluse dans cette estimation. ». Oui → saisie €/mois, **additive** à la mensualité uniquement (jamais dans le calcul d'intérêts). Aucun taux d'assurance inventé.

## Résultat
Valeur dominante = mensualité totale si assurance connue, sinon mensualité HA. Détail assurance (HA / assurance / total) si connue. Secondaires : capital, durée, taux utilisé, coût des intérêts, montant total remboursé.

## Comparateur (§15/§16)
Après le résultat : 10/15/20/25 ans (depuis `publicDurations`), **toujours** aux taux indicatifs Proactifs (`getMarketRate` par durée), **hors assurance**, mensualité + taux + intérêts recalculés dynamiquement. Mention « Comparaison indicative selon notre référence de taux Proactifs en vigueur — hors assurance ». Même en mode taux personnalisé, le comparateur reste basé sur les taux marché (jamais mélangé silencieusement).

## Analytics (§19)
`ui.track` réutilisé, `simulator_type: 'monthly_payment'` ajouté aux events (`simulation_started/completed/result`, `financing_cta_clicked`, `financing_lead_submitted`). `simulation_result` bucketisé (`amountBucket`, durée, mode taux, assurance connue/inconnue) — **aucune PII** (montant exact jamais transmis ; test dédié).

## Lead (§18)
Mock uniquement (transport injecté renvoyant `{ok:true, mock:true}`) — **aucun POST réel**. Payload `buildLeadPayload` : `service:'credit'`, `answers:[{source:'simulateur_mensualite_credit'}]`. Aucune modif API/Supabase/Brevo/Systeme.io.

## SEO preview (§20/§21)
H1 « Calculez la mensualité de votre crédit immobilier ». Sections pédagogiques (calcul, impact taux, impact durée, assurance, différence capacité/mensualité, coût vs durée), exemples 200/300/400 k€ dynamiques, FAQ (6 Q) + `FAQPage`, méthodologie. Centrée « mensualité » (ne concurrence ni la capacité ni le courtage). Lien interne vers `/simulateurs/capacite-emprunt` (paire complémentaire). Aucun volume SEO inventé.

## Responsive & accessibilité
1440 / 390 / 320 : **0 débordement horizontal**. Champs tactiles, labels associés, `fieldset/legend`, focus visible, erreurs en `role="alert"`, teal pour sélection (jamais l'or), CTA hero pill or. Design identique à la famille capacité.

## Tests
`tests/simulators/cs5b-mensualite.test.js` : 23 tests (A–R + marqueurs SEO). Suite complète : **214/214 PASS**. `build-header --check` : OK (page non listée, ignorée). `build-breadcrumbs --check` : 49/49. `check-mobile-nav` : 66 pages, 0 régression.

## Limitations (assumées CS-5B)
Duplication du CSS page (hero/carte/CTA) et du bloc GA4 vs capacité — extraction repoussée après le 3ᵉ simulateur (principe CS-5A §15). Colonne `source` serveur de `/api/subscribe` figée (la source fine passe par `answers`). Breadcrumb local de preview (non centralisé).

## Captures
Desktop 1440 (formulaire, résultat, comparateur), mobile 390 (formulaire, résultat), mobile 320 (formulaire, résultat), variante taux personnalisé + assurance connue. Contrôles : CTA `rgb(196,151,58)` = #C4973A, headline dynamique, `Référence septembre 2026`, comparateur 4 lignes, 0 débordement.

## Git
Commit `CS-5B : prototype simulateur mensualite` sur `credit-simulateurs-v2`. **PAS de merge main, aucun déploiement.**
