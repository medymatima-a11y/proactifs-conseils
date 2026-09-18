# CS-4SEO — Polish UX & template SEO du simulateur de capacité d'emprunt

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-4A `899a77c`
**Nature :** polish UX du prototype (calculs **gelés**) + **architecture** de la future page SEO. **Aucune page publique créée, aucune URL nouvelle, aucun merge main, aucune production, aucun lead réel.** CS-4B créera ensuite la page indexable.

---

## 1. Corrections UX (Partie A)

| Réf | Correction |
|---|---|
| A1 | **Header non sticky en mobile** : `.proto-header { position:static }` sous `@media (max-width:600px)` — plus aucun recouvrement du résultat au scroll (vérifié 320/375/390/430). |
| A2 | **Titre redondant retiré** : suppression de « Votre estimation ». On enchaîne directement titre reliability → carte budget. |
| A3 | **Hiérarchie conservée** : budget dominant, puis capacité, mensualité, apport, durée, taux. Aucune nouvelle métrique. |
| A4 | **Label « Taux indicatif »** (au lieu de « Taux utilisé pour la simulation ») + ligne « Référence <mois> · hors assurance », **dérivée de `ACTIVE_MARKET_REFERENCE.effectiveMonth`** (jamais codée en dur). |
| A5 | **Disclaimer court** dans la carte : « Simulation indicative, hors assurance et non contractuelle. » Le disclaimer complet est déplacé dans l'accordéon (protection métier conservée). |
| A6 | **Hypothèses compactes** : messages client lisibles (revenus locatifs, assurance non incluse, autres revenus, loyer restant) — jamais les codes `reviewFlags`. |
| A7 | **Accordéon accessible** « Comment avons-nous calculé cette estimation ? » : `<button aria-expanded aria-controls>`, chevron, fermé par défaut, clavier ; contient la méthode + le **disclaimer complet**. |
| A8 | **CTA reformulé** : « Faites analyser votre projet par Proactifs Conseils et découvrez les solutions de financement adaptées à votre situation. » + « Étudier mon financement » (mock lead conservé, aucun réseau). |
| A9 | **Mobile compacté** : cartes plus denses, CTA remonté et quasi pleine largeur, 0 débordement horizontal. |

**Gelés (diff vide) :** `core.js`, `calc-credit.js`, `calc-immo.js`, `credit-policy.js`, `rates.js`, ainsi que `computeCapacityV2()` et `buildFinancingInput()` — aucun calcul modifié.

## 2. Architecture SEO (Partie B) — documentation, rien de publié

Future URL : **`/simulateurs/capacite-emprunt`** (non créée ici).

## 3. Intention de recherche

- **Principale :** calculer sa capacité d'emprunt immobilier — mot-clé de travail « simulateur capacité d'emprunt ».
- **Secondaires :** capacité d'emprunt · calcul capacité d'emprunt · combien puis-je emprunter · capacité d'emprunt avec salaire · capacité d'emprunt investissement locatif.
- **Aucun volume / position / CTR / difficulté inventés** — ces données seront pilotées par l'Agent SEO / GSC (§14).

## 4. Rôle de la page & distinction simulateur / courtage

- **Simulateur** = acquisition / calcul (répond à « Combien puis-je emprunter ? »).
- **`/courtage-credit-immobilier`** = expertise / conversion (page commerciale d'accompagnement) — **non remplacée**.

## 5. Template de page (structure future)

Breadcrumb → Hero SEO → H1 → introduction courte → **simulateur (très haut)** → résultat → « Comment avons-nous calculé cette estimation ? » → contenu pédagogique → cas pratiques → FAQ → autres simulateurs → maillage interne → CTA courtage.

Le simulateur apparaît **haut** dans la page ; pas de long contenu SEO avant l'outil.

## 6. Hero futur

- **Surtitre :** SIMULATEUR DE CAPACITÉ D'EMPRUNT
- **H1 :** « Calculez votre capacité d'emprunt immobilier »
- **Introduction :** « Estimez le montant que vous pourriez emprunter en fonction de vos revenus, de vos charges, de votre apport et de la durée de financement. »
- **CTA :** « Calculer ma capacité d'emprunt »
- **Micro-réassurance :** « Gratuit · Sans engagement · Résultat immédiat »

## 7. Title proposé

« Simulateur Capacité d'Emprunt Immobilier | Proactifs » — **audience nationale**, pas de « Colombes » sur cette page (le local/commercial reste porté par les pages de conseil/courtage).

## 8. Structure H2 (à finaliser en CS-4B, pas de remplissage générique)

- Comment calculer sa capacité d'emprunt ?
- Quels revenus sont pris en compte ?
- Comment les crédits en cours influencent-ils votre capacité d'emprunt ?
- Comment les revenus locatifs sont-ils pris en compte ?
- Quel impact l'apport personnel a-t-il ?
- Quel impact la durée du crédit a-t-elle ?
- Quel salaire pour emprunter 200 000 €, 300 000 € ou 400 000 € ?
- Pourquoi la capacité réelle peut-elle différer du simulateur ?

## 9. FAQ future

Comment calculer sa capacité d'emprunt ? · Quel salaire pour emprunter 300 000 € ? · Quelle capacité d'emprunt avec 3 000 €/mois ? · Les revenus locatifs sont-ils pris en compte ? · L'apport augmente-t-il la capacité ? · Les crédits en cours sont-ils pris en compte ? · L'assurance emprunteur est-elle incluse ? · Le résultat garantit-il l'obtention du prêt ?
Réponses futures **cohérentes avec CS-3 et CS-3.5** (70 % locatif = hypothèse Proactifs, assurance hors calcul si inconnue, aucun accord garanti).

## 10. Données structurées prévues

`BreadcrumbList` ; et, **seulement si réellement adapté** à l'outil en CS-4B, un type Schema.org cohérent + FAQ visible. **Jamais** de donnée structurée laissant croire que 3,50 % est un taux proposé par Proactifs ou une banque.

## 11. Moteur unique

Un seul moteur alimente deux usages :

```
MOTEUR UNIQUE (computeCapacityV2 / buildFinancingInput — purs, exportés)
   ├── simulation utilisateur
   └── exemples pédagogiques SEO
```

Layout, design, composants, moteur, FAQ component, CTA component, maillage component **partagés** ; le **texte SEO n'est pas partagé** (chaque simulateur répond à une intention propre — éviter les pages quasi dupliquées).

## 12. Exemples dynamiques (interface technique)

Les exemples « Quel salaire pour emprunter 200 000 € / 300 000 € / 400 000 € ? » devront être **calculés par le moteur**, jamais codés en dur. Interface visée (à implémenter en CS-4B) :

```
salaireRequisPour(montantCible, { durationYears, maxDebtRatio, existingCharges })
  → dérive la mensualité cible via CS-1 (principal → mensualité), puis le revenu
    minimal via CS-3 (mensualité / maxDebtRatio). Aucune valeur inventée.
```

Non implémenté en CS-4SEO — architecture documentée uniquement.

## 13. Date des taux / fraîcheur

La page pourra afficher « Référence mise à jour : <mois> » depuis `MARKET_REFERENCE.effectiveMonth`, et détecter `REVIEW_DUE` / `STALE` via `getMarketReferenceFreshness()`. **Aucune date SEO fictive.**

## 14. Suivi Agent SEO (futur)

Champs à suivre : URL · mot-clé principal · intentions secondaires · date de publication · impressions GSC · clics · CTR · position · requêtes émergentes · pages liées.
Boucle : **GSC → Agent SEO → opportunité → enrichissement de la page existante** (plutôt qu'un nouvel article par requête quand l'intention est identique).

## 15. Réutilisation — futurs simulateurs

Template réutilisable (sans créer les pages) pour : `/simulateurs/mensualite-credit`, `/simulateurs/taux-endettement`, `/simulateurs/frais-notaire`, `/simulateurs/pret-relais`, `/simulateurs/rendement-locatif`, `/simulateurs/cout-credit`.

Hub futur `/simulateurs` (conceptuel, **non créé**) — catégories : **Crédit** (capacité, mensualité, endettement, coût, prêt relais) · **Immobilier** (frais de notaire, rendement locatif, plus-value) · **Patrimoine** (PER, effort d'épargne, transmission). **Aucune URL vide créée.**

## 16. Maillage (documenté, aucun lien créé vers des URLs inexistantes)

- **Entrants potentiels :** `/courtage-credit-immobilier`, `/immobilier`, futures pages `/credit`, articles financement pertinents.
- **Sortants :** `/courtage-credit-immobilier`, pages investissement immobilier existantes, `/immobilier`, futurs simulateurs pertinents.

## 17. Restant pour CS-4B

Créer la page publique `/simulateurs/capacite-emprunt` (breadcrumb réel, hero, H1, introduction, contenu pédagogique complet, cas pratiques, FAQ, maillage, Schema.org, CTA courtage), implémenter les exemples dynamiques via le moteur, brancher le lead réel, et l'indexation (retrait du noindex, ajout au sitemap) — **après validation**.

---

## Git

Diff CS-4SEO : `prototypes/simulateur-capacite-emprunt-v2.html`, `assets/js/simulators/prototype-capacity.js` (UI/mapping uniquement), `tests/simulators/cs4seo.test.js` (nouveau), `tests/simulators/prototype-capacity.test.js` (assertion du label alignée sur « Taux indicatif »), `docs/CS-4SEO-TEMPLATE.md`. `index.html` (préexistant) exclu. Commit `CS-4SEO : polish UX et template SEO simulateurs`. **Aucun merge main, aucune production.**

**STOP.** CS-4B non démarré.
