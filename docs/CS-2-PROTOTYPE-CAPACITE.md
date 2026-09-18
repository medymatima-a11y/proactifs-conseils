# CS-2 — Prototype interne : simulateur de capacité d'emprunt V2

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-1 `a2decc7`
**Nature :** prototype fonctionnel **NON PUBLIC** branché sur le moteur CS-1. Aucun simulateur de production remplacé, aucune page publique, aucune API, aucun Header V1 touché, aucun envoi de lead réel.

---

## 1. Fichiers créés / modifiés

**Créés :**
- `prototypes/simulateur-capacite-emprunt-v2.html` — page prototype (noindex, mini-header autonome, wizard 4 étapes)
- `assets/js/simulators/prototype-capacity.js` — contrôleur (logique pure testable + init DOM guardée)
- `tests/simulators/prototype-capacity.test.js` — tests du prototype
- `docs/CS-2-PROTOTYPE-CAPACITE.md` — ce document

**Modifié :**
- `assets/js/simulators/ui.js` — **correctif** : `track()` référençait `root` (paramètre du wrapper UMD) hors de la portée de la factory → `ReferenceError` en navigateur (masqué en Node par le court-circuit `hasDoc &&`). Remplacé par une capture explicite du global (`GLOBAL`). Comportement Node inchangé, tests CS-1 toujours verts.

**Aucune** modification de page de production, header, navigation, build scripts, API, sitemap, nav-pages, breadcrumb-pages.

## 2. Structure UX — wizard 4 étapes + conversion

Étape 1 **Votre projet** → Étape 2 **Vos revenus** → Étape 3 **Vos charges & financement** → Étape 4 **Votre estimation** → bloc conversion (CTA) → lead (mock).

Progression : barre + « Étape N sur 4 ». Boutons **Continuer** / **Retour**, données conservées au retour arrière.

## 3. Étapes & champs

| Étape | Champs |
|---|---|
| 1 Projet | Type de projet (résidence principale / investissement locatif / résidence secondaire / autre) · Situation (seul / à deux) |
| 2 Revenus | Revenus nets mensuels · (si « à deux ») revenus du co-emprunteur |
| 3 Charges & financement | Mensualités de crédits en cours · Apport personnel · Durée (10/15/20/25/30 ans) |
| 4 Estimation | Résultat + explication + CTA |

Le type de projet et la situation servent à l'UX/au futur lead — **aucune règle de calcul spécifique par projet** en CS-2.

## 4. Moteur utilisé

Exclusivement CS-1, chargé dans l'ordre `core → rates → calc-credit → lead → ui`, puis `prototype-capacity.js`. **Aucune formule recopiée dans la page.** `computeResult()` appelle `SimCalcCredit.calculateBorrowingCapacity` / `calculateMaxPayment` / `calculateBudget` et `SimRates.resolveRate`.

## 5. Hypothèses prototype (explicites)

```js
PROTOTYPE_ASSUMPTIONS = {
  maxDebtRatio: 0.35,               // passé explicitement au moteur (jamais hardcodé dans l'UI)
  rateGrid: LEGACY_REFERENCE,       // référence technique legacy — NON taux actuel
  durations: [10, 15, 20, 25, 30]
}
```
Le prototype affiche discrètement « **Mode de calcul : référence technique legacy** » et « **Taux utilisé (réf. legacy)** ». Jamais « taux actuel / du marché / meilleur taux ».

## 6. Résultat affiché (hiérarchie)

1. **Budget total estimé** (chiffre héros) — ex. `444 012 €`
2. Capacité d'emprunt estimée · Mensualité maximale estimée
3. Apport · Durée
4. Taux utilisé (réf. legacy)

Sous le résultat : « Simulation indicative et non contractuelle » + phrase d'explication (situation, assurance emprunteur, nature des revenus, reste à vivre, critères de l'établissement prêteur). **Jamais** présenté comme accord bancaire / offre / garantie.

## 7. CTA & lead mock

CTA « **Étudier mon financement** » → ouvre un formulaire court (Prénom, Email, Téléphone, Projet pré-rempli). À la soumission : `lead.buildLeadPayload(...)` + `lead.submitLead(payload, mockTransport)`.
**Le transport est un MOCK** : il ne contacte aucun serveur/API, renvoie `{ok:true, mock:true}`. Message affiché : « Merci. Votre demande test a bien été enregistrée dans le prototype. **Aucune donnée n'a été envoyée.** »

## 8. Tracking debug (local, sans PII)

Via `ui.track` (whitelist) + panneau debug affichant les événements : `simulation_started`, `simulation_completed`, `simulation_result`, `financing_cta_clicked`, `financing_lead_submitted`. **Aucun GA4 production connecté.** `simulation_result` ne transporte qu'un **bucket** (`<150k`, `150-250k`, `250-350k`, `350-500k`, `500k+`) + la durée — **jamais de montant exact ni de PII**.

## 9. Protections données personnelles

Le calcul ne dépend jamais de l'identité. Aucune PII ni montant exact envoyé au tracking (buckets uniquement). Aucun envoi réseau (transport mock). Aucun captcha (protection anti-spam traitée à l'intégration réelle du lead).

## 10. Accessibilité

`fieldset`/`legend`, labels réels, `:focus-visible`, navigation clavier, `aria-live` sur le résultat et le message lead, messages d'erreur en français clair (« Indiquez vos revenus mensuels nets. »), boutons natifs, contraste conforme.

## 11. Responsive

Rendu réel : **0 débordement horizontal** à 390 px (mobile) et 1440 px (desktop). Mobile : 1 colonne, options en cartes empilées, résultat en 1 colonne, CTA large. Formats FR acceptés (`3000`, `3 000`, `3000,50`).

## 12. Tests

`node --test tests/simulators/*.test.js` → **63 tests, 63 PASS, 0 FAIL** (46 CS-1 + 17 CS-2).
CS-2 couvre : parité moteur/legacy (9 scénarios : seul, couple, crédits, apport, 10/15/20/25/30 ans), formats FR, hypothèses explicites, validation étapes 1/2/3, buckets tracking, lead mock (payload observable, aucun réseau), `init()` no-op hors navigateur.

## 13. Parité legacy

Pour chaque scénario, `PrototypeCapacity.computeResult(...)` === logique legacy réimplémentée indépendamment (taux, capacité, budget identiques). Exemple validé au rendu : couple 4 000 + 2 500 €, 20 ans, apport 50 000 € → capacité **394 012 €**, budget **444 012 €**, mensualité **2 275 €/mois**, taux **3,45 %**. **Aucun recalcul indépendant dans la page.**

## 14. Contrôles techniques

- `node scripts/build-header.js --check` → ✓ 49 pages
- `node scripts/build-breadcrumbs.js --check` → ✓ 48/48
- `node scripts/check-mobile-nav.js` → ✓ 64 pages (prototype inclus), 0 régression
- `simulation-pret-immobilier.html` → **inchangé**
- Aucune page HTML de production modifiée

## 15. Non-indexation & isolement

- `<meta name="robots" content="noindex,nofollow">` présent.
- Absent de `sitemap.xml` (0), `scripts/nav-pages.json` (0), `scripts/breadcrumb-pages.json` (0), `partials/header.html`.
- Non lié depuis aucune page publique (seul lien sortant : « Retour au site » → `/`).

## 16. Captures

Desktop 1440 et mobile 390 (écran résultat) — livrées dans la conversation.

## 17. Limitations métier (rappel, non traitées en CS-2)

Endettement fixe 35 % ; taux legacy non validés ; assurance emprunteur, revenus locatifs, autres revenus, reste à vivre, exceptions bancaires non intégrés. Parité technique ≠ validation métier. Ces sujets relèvent de CS-3/CS-4.

---

## Git

Diff CS-2 : `prototypes/simulateur-capacite-emprunt-v2.html`, `assets/js/simulators/prototype-capacity.js`, `assets/js/simulators/ui.js` (correctif), `tests/simulators/prototype-capacity.test.js`, `docs/CS-2-PROTOTYPE-CAPACITE.md`. Commit `CS-2 : prototype capacite emprunt V2` sur `credit-simulateurs-v2`. **Aucun merge main, aucune production.**

**STOP.** CS-3 / CS-4 non démarrés. `/credit` et `/simulateurs` non créés. Header V1 non modifié. En attente de validation.
