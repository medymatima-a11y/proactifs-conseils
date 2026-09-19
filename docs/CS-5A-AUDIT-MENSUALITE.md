# CS-5A — Audit & architecture : simulateur de mensualité de crédit

**Date :** 18/09/2026 · **Branche :** `credit-simulateurs-v2` · **SHA départ :** `1d5e129` (main prod `acbffcd`)
**Nature :** audit + architecture **uniquement**. Aucune page créée, aucune prod modifiée, aucun calcul touché.
**Cible étudiée :** `/simulateurs/mensualite-credit` — « Pour un emprunt de X €, combien vais-je rembourser chaque mois ? » (complémentaire, jamais confondu avec capacité d'emprunt).

---

## 1. État actuel du socle
Socle simulateurs intact sous `assets/js/simulators/` : `core.js`, `calc-credit.js`, `calc-immo.js`, `credit-policy.js`, `rates.js`, `lead.js`, `ui.js`, `prototype-capacity.js` (adaptateur capacité). CSS partagé : `assets/css/simulators/simulators.css`. Page capacité en prod : `simulateurs/capacite-emprunt.html` (design CS-4C.1 gelé). Tests : `tests/simulators/*.test.js` (191 PASS).

## 2. Cartographie — composants réutilisables (génériques)
- **core.js** — math pure prêt (aucune notion produit/UI) : `monthlyPayment`, `principalFromPayment`, `creditCost`, `annuityFactor`, `monthlyRate`, `monthsFromYears`, `round`, `toNumber`, `isValidNumber`, `clampMin`. **100 % réutilisable tel quel.**
- **calc-credit.js** — wrappers : `calculateMonthlyPayment`, `calculateMaxPayment`, `calculateDebtRatio`, `calculateCreditCost` (au-dessus de core). Réutilisable tel quel.
- **rates.js** — `ACTIVE_MARKET_REFERENCE`, `getMarketRate(durée, ref)`, `getMarketReferenceFreshness`, `validateMarketReference`, `LEGACY_REFERENCE`. Réutilisable tel quel.
- **credit-policy.js** — `PROACTIFS_CREDIT_POLICY_V1` (publicDurations [10,15,20,25], maxDebtRatio 0.35). Réutilisable (durées + garde-fous).
- **ui.js** — `formatEuro`, `formatPercent`, `track` (whitelist 5 events + drop PII), `setProgress`, `setState`. Réutilisable tel quel.
- **lead.js** — `buildLeadPayload`, `isSubmittable`, `submitLead(payload, transport)` (transport injecté, aucun endpoint par défaut). Réutilisable tel quel.
- **simulators.css** — tokens `--sim-*`, `.sim-root/.sim-container/.sim-progress/.sim-field/.sim-cta/.sim-cta--ghost/états`. Réutilisable tel quel.

## 3. Cartographie — composants spécifiques capacité
- **prototype-capacity.js** — adaptateur UI **spécifique capacité** : `computeCapacityV2`, `buildFinancingInput`, `calculateRequiredIncomeForLoan`, `init()` (wizard 4 étapes, mapReliability, describeFreshness), + helper générique **`marketMonthLabel(effectiveMonth)`** (dérive « septembre 2026 »). Ne PAS réutiliser l'adaptateur ; le simulateur mensualité aura son propre adaptateur.
- **capacite-emprunt.html** — `<style>` inline spécifique (`.cap-wrap/.cap-hero/.band/.cap-footer` + carte + CTA or + pont GA4). Modèle à **répliquer**, pas à importer.
- Helper à **extraire (léger)** : `marketMonthLabel` vit dans prototype-capacity ; à copier dans l'adaptateur mensualité (ou, plus tard, promouvoir dans `ui.js`).

## 4. Fonctions de calcul disponibles
| Besoin | Fichier | Fonction | Params | Retour | Réutilisable |
|---|---|---|---|---|---|
| Mensualité HA | core.js | `monthlyPayment` | `{principal, annualRatePct, months}` | nombre €/mois | **OUI** |
| Mensualité HA (wrapper) | calc-credit.js | `calculateMonthlyPayment` | `{principal/capital, annualRatePct, durationYears}` | €/mois | OUI |
| Intérêts totaux | core.js | `creditCost` | `{payment, months, principal}` | (payment×mois − capital) | **OUI** |
| Total remboursé | — | dérivé | `payment × months` | € | OUI (trivial) |
| Facteur annuité | core.js | `annuityFactor` | `{annualRatePct, months}` | facteur | OUI |
| Mois depuis années | core.js | `monthsFromYears` | années | mois | OUI |
| Taux marché | rates.js | `getMarketRate` | `(durée, ACTIVE_MARKET_REFERENCE)` | % annuel | OUI |
| Fraîcheur réf. | rates.js | `getMarketReferenceFreshness` | `(ref, date)` | {state,ageDays} | OUI |
| Label mois | prototype-capacity.js | `marketMonthLabel` | `'YYYY-MM'` | « septembre 2026 » | OUI (à copier) |

## 5. Fonctions manquantes
**Aucune fonction moteur manquante.** Mensualité, intérêts, total, taux, fraîcheur, label : tout existe. Seuls éléments **page/adaptateur** à écrire en CS-5B (aucune modif du socle) : un petit adaptateur `init()` mensualité + (optionnel) un helper de comparateur (cf. §9). Assurance = addition €/mois au niveau page (cf. §7).

## 6. Stratégie taux
- **Option A « Taux indicatif Proactifs »** : `getMarketRate(duréeSélectionnée, ACTIVE_MARKET_REFERENCE)`. Aucun taux en dur.
- **Option B « Je connais mon taux »** : saisie utilisateur → passée directement en `annualRatePct` à `monthlyPayment`. **Ne modifie jamais** `ACTIVE_MARKET_REFERENCE` (référentiel en lecture seule).
- Libellé « Référence [mois année] · hors assurance » dérivé de `ref.effectiveMonth` via `marketMonthLabel` — jamais codé en dur.
- `LEGACY_REFERENCE` non utilisé. ✅

## 7. Stratégie assurance
core.js ne connaît pas l'assurance (math prêt pure) — c'est correct. Au **niveau page** :
- A. coût connu (€/mois) → mensualité totale = `monthlyPayment` + assurance.
- B. inconnu → assurance = 0, mensualité = HA + message « Assurance emprunteur non incluse dans cette estimation. »
Aucun taux d'assurance générique inventé. **Aucun impact** sur le simulateur capacité (logique isolée dans le nouvel adaptateur). Architecture la plus simple : un champ optionnel + un booléen d'affichage, calcul additif côté page.

## 8. Architecture du résultat
Toutes les valeurs sont produites par le socle :
- Mensualité estimée = `monthlyPayment` (dominant).
- Capital (saisi), durée (saisie), taux (`getMarketRate` ou saisi), intérêts (`creditCost`), total remboursé (`payment×mois`).
- Assurance connue → mensualité HA + assurance/mois + mensualité totale.
- Assurance inconnue → mensualité HA + message.
**Aucune fonction supplémentaire nécessaire.**

## 9. Architecture comparateur de durées
Génération dynamique (aucune valeur figée dans le HTML) : pour chaque durée de `publicDurations` (10/15/20/25) → `getMarketRate(d)` + `monthlyPayment` + `creditCost`.
Les primitives **suffisent**. Recommandation : petit helper **générique optionnel** `compareLoanDurations({principal, durations, reference})` → tableau `[{years, rate, payment, interest, total}]`, **ajouté** dans `calc-credit.js` (additif, ne touche aucune fonction existante) OU au niveau page. Préférence : helper générique léger (réutilisable par futurs simulateurs), sinon boucle page.

## 10. Recommandation UX
**Une seule carte / formulaire compact** (pas de wizard à 4 étapes). L'intention mensualité est directe (3–4 champs : montant, durée, taux A/B, assurance connue/inconnue) → un wizard multi-étapes ajouterait de la friction sans valeur. Structure : Hero clair → carte simulateur (montant, durée, taux, assurance, bouton Calculer) → résultat → comparateur durées → CTA financement. Réutilise le **design gelé CS-4C.1** (hero clair, carte détachée, CTA or #C4973A, teal pour états).

## 11. Architecture SEO future
Structure existante (title/meta/canonical/H1/H2/FAQ/BreadcrumbList/FAQPage + robots index,follow + sitemap générateur + nav/breadcrumb centralisés) **supporte** la future page sans changement d'architecture. Intention ciblée : « mensualité » (calcul/simulateur mensualité prêt/crédit immobilier, mensualité prêt 200/300/400 k€, mensualité 20/25 ans). **Aucun volume de recherche inventé.**
**Risque de cannibalisation à gérer :**
- `simulation-pret-immobilier.html` (« Simulation Prêt Immobilier ») — intention « simulation prêt » large ; à différencier (mensualité ≠ simulation générique). *(Note QA : cette page a un artefact « e » dans son title/H1 — hors périmètre CS-5A.)*
- `pret-immobilier-index.html`, `courtage-credit-immobilier.html` (service courtage), `capacite-emprunt` (intention capacité). Différenciation par H1/title « mensualité » + maillage clair.

## 12. Maillage interne futur (CS-5B, non implémenté)
- `capacite-emprunt` ↔ `mensualite-credit` (paire complémentaire, liens croisés naturels).
- `courtage-credit-immobilier` → `mensualite-credit` (ancre « Calculer ma mensualité »).
- Pages immobilières pertinentes → mensualité si contextuel.
Aucune URL fictive, aucun lien créé pendant CS-5A.

## 13. Lead
`buildLeadPayload` → `{prenom, nom, email, tel, situation, service:'credit', answers[]}`. `/api/subscribe` stocke `reponses:{service_code, answers}`. **Distinguer la source sans changer l'API** : ajouter un marqueur dans `answers`, ex. `answers:[{source:'simulateur_mensualite_credit', ...}]` (capacité utilise `answers:[{projet}]`). `service` reste `credit`. **Aucune modif** API/Supabase/Brevo/Systeme.io. Limite connue : la colonne `source` serveur est figée « Quiz bilan patrimonial » (documenté CS-4C) — l'info fine passe par `answers`.

## 14. Analytics
Réutiliser les 5 events (`simulation_started/completed/result`, `financing_cta_clicked`, `financing_lead_submitted`) via `ui.track`. **Distinguer** par un champ non-PII `simulator_type:'monthly_payment'` (vs `'capacity'`) — passe la whitelist (pas une clé interdite). Aucune PII. Le pont `dataLayer→gtag` est inline par page → la page mensualité aura sa propre copie (petite duplication acceptable, ou extraction ultérieure). **Aucune modif** du tracking en CS-5A.

## 15. Risques techniques
- **FAIBLE** globalement : le socle est pur, testé (191), déjà en prod.
- Duplication CSS page (hero/carte/CTA) entre capacité et mensualité → dette légère assumée (cf. §16).
- Duplication du pont GA4 inline.
- `marketMonthLabel` logé dans l'adaptateur capacité → à copier (ou promouvoir).
- Cannibalisation SEO (§11) à cadrer.

## 16. Dette technique éventuelle
- Design page (hero/carte/CTA or) non encore centralisé → **par choix** (principe §15 du brief : le 2ᵉ simulateur révèle les abstractions utiles). Centralisation à envisager après 2–3 simulateurs.
- Pont GA4 + `marketMonthLabel` : candidats à promotion générique plus tard, pas maintenant.

## 17. Fichiers probablement modifiés/créés en CS-5B
- **Créé** : `simulateurs/mensualite-credit.html` (page + `<style>` répliquant CS-4C.1).
- **Créé** : `assets/js/simulators/prototype-mensualite.js` (nouvel adaptateur `init()` + helpers) — n'altère pas l'existant.
- **Créé** : `tests/simulators/cs5b-*.test.js`.
- **Additif possible** : `compareLoanDurations` dans `calc-credit.js` (nouvelle fonction, aucune existante modifiée).
- **Config** (publication ultérieure, pas forcément CS-5B) : `scripts/nav-pages.json`, `scripts/breadcrumb-pages.json`, `sitemap.xml`, lien entrant depuis `courtage-credit-immobilier.html`.

## 18. Fichiers qui doivent rester gelés
`core.js`, `calc-credit.js` (fonctions existantes), `calc-immo.js`, `credit-policy.js`, `rates.js` (`ACTIVE_/LEGACY_REFERENCE`), `ui.js`, `lead.js`, `prototype-capacity.js` (`computeCapacityV2`/`buildFinancingInput`/`calculateRequiredIncomeForLoan`), `simulateurs/capacite-emprunt.html`, `partials/header.html`, API `/api/subscribe`, Supabase/Brevo/Systeme.io, GA4, `vercel.json`, robots, sitemap (hors ajout d'entrée).

## 19. Plan proposé CS-5B
1. Créer l'adaptateur `prototype-mensualite.js` (form compact 1 carte : montant, durée, taux A/B, assurance connue/inconnue ; calcule via core/calc-credit ; emit events avec `simulator_type:'monthly_payment'`).
2. (Optionnel) ajouter `compareLoanDurations` générique dans `calc-credit.js` (additif + tests).
3. Créer `mensualite-credit.html` en preview (`noindex`, hors sitemap/nav) répliquant le design gelé CS-4C.1, taux dynamiques, comparateur dynamique, lead mock (transport injecté), consentement, pont GA4.
4. Tests unitaires + rendu (desktop/390/320), 0 régression sur les tests capacité.
5. Validation visuelle → puis phase publication distincte (CS-5C : robots, sitemap, nav/breadcrumb, lead réel, maillage, merge).

## 20. Verdict

**CS-5A — VERDICT**
- SOCLE RÉUTILISABLE : **OUI**
- MOTEUR MENSUALITÉ DISPONIBLE : **OUI** (`monthlyPayment` + `creditCost` + `getMarketRate`)
- COMPARATEUR DE DURÉES FAISABLE : **OUI** (primitives suffisent ; helper générique optionnel)
- ASSURANCE INTÉGRABLE SANS RÉGRESSION : **OUI** (additif niveau page, isolé)
- DESIGN RÉUTILISABLE : **OUI** (design CS-4C.1 gelé ; réplication page, extraction plus tard)
- LEAD RÉUTILISABLE : **OUI** (source via `answers`, sans modif API)
- ANALYTICS RÉUTILISABLE : **OUI** (via `simulator_type`, sans modif tracking)
- RISQUE DE RÉGRESSION : **FAIBLE**
- REFACTOR AVANT CS-5B : **AUCUN** (extractions renvoyées à plus tard)
- RECOMMANDATION : **GO CS-5B**
