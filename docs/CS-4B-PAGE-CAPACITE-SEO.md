# CS-4B — Page SEO preview : /simulateurs/capacite-emprunt

**Site :** proactifsconseils.fr · **Date :** 18/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-4SEO `9dd6b7b`
**Nature :** première page complète du silo Simulateurs, intégrée au vrai site. **PREVIEW** : `noindex,nofollow`, hors sitemap, aucun lien public, lead mock. **Aucun merge main, aucune production.** CS-4C publiera/indexera.

---

## 1. URL & routing

- **URL :** `/simulateurs/capacite-emprunt`
- **Fichier :** `simulateurs/capacite-emprunt.html`
- Vercel `cleanUrls: true` sert automatiquement ce fichier à l'URL sans extension. **Aucune modification de `vercel.json`** (une entrée de rewrite explicite pourra être ajoutée en CS-4C par cohérence, mais n'est pas nécessaire).

## 2. Socles réutilisés (aucune duplication du simulateur)

Moteur **CS-1** (`core.js`/`calc-credit.js`), politique **CS-3** (`credit-policy.js`), référentiel **CS-3.5** (`rates.js` / `ACTIVE_MARKET_REFERENCE`), contrôleur **CS-4SEO** (`prototype-capacity.js` : `computeCapacityV2`, mappings UX). Tous **gelés** (diff vide) sauf `prototype-capacity.js`, où **seule** une fonction pure a été **ajoutée** (§7).

## 3. Header & navigation

La page utilise le **vrai header centralisé** (contenu identique à `partials/header.html`, jetons par défaut, sans état actif) + `navigation.css` + `navigation.js`. **Pas de mini-header prototype.** La navigation V1, `partials/header.html`, `nav-pages.json` et le menu ne sont **pas modifiés** : la page n'est volontairement pas ajoutée aux manifestes (elle le sera en CS-4C pour la centralisation à la publication).

## 4. Breadcrumb

Fil d'Ariane visible : **Accueil** (lien) › **Simulateurs** (`<span>` non cliquable — le hub n'existe pas encore) › **Capacité d'emprunt** (page courante). `BreadcrumbList` JSON-LD cohérent : Accueil (item `/`), Simulateurs (**sans `item`**, aucune URL fictive), Capacité d'emprunt (item URL réelle courante).

## 5. SEO on-page

| Élément | Valeur |
|---|---|
| Title | `Simulateur Capacité d'Emprunt Immobilier \| Proactifs` (~52 car., pas de troncature) |
| Meta description | calcul capacité d'emprunt · revenus · charges · apport · durée · résultat immédiat (sans promesse bancaire) |
| Canonical | `https://proactifsconseils.fr/simulateurs/capacite-emprunt` |
| Robots | `noindex,nofollow` (preview) |
| Open Graph | og:type/title/description/url — **og:image absente** (aucune ressource dédiée validée ; à fournir en CS-4C) |
| H1 (unique) | « Calculez votre capacité d'emprunt immobilier » |
| Surtitre | SIMULATEUR DE CAPACITÉ D'EMPRUNT |
| SEO local | **audience nationale** — aucun « Colombes / Hauts-de-Seine / 92 » dans Title, H1, H2, FAQ |

## 6. Structure

Header → breadcrumb → hero SEO (surtitre, H1, intro, CTA « Calculer ma capacité d'emprunt » → scroll `#simulateur`, réassurance « Gratuit · Sans engagement · Résultat immédiat ») → **simulateur** (haut de page) → bloc introductif → 8 sections H2 → cas pratiques dynamiques → CTA courtage → FAQ → méthodologie → autres simulateurs (désactivé) → E-E-A-T → footer.

**H2 :** comment calculer · quels revenus · crédits en cours · revenus locatifs · apport · durée · quel salaire pour 200/300/400 k€ · pourquoi la capacité réelle peut différer.

## 7. Cas pratiques dynamiques — moteur unique

Nouvelle fonction pure **`calculateRequiredIncomeForLoan({loanAmount, durationYears, maxDebtRatio?})`** ajoutée à `prototype-capacity.js` : réutilise **CS-1** (`monthlyPayment`), **CS-3.5** (`getMarketRate` sur `ACTIVE_MARKET_REFERENCE`) et **CS-3** (`maxDebtRatio` 0,35). Aucun second moteur, aucune formule parallèle. `computeCapacityV2` / `buildFinancingInput` **inchangés**.

Le tableau (200 000 / 300 000 / 400 000 € sur 20 ans) est **calculé au chargement** par le moteur ; les chiffres et le mois de référence ne sont **jamais codés en dur**. Hypothèses affichées : emprunteur seul, sans crédit, sans revenu locatif, hors assurance, apport non pris en compte. Sur mobile, le tableau se transforme en cartes (aucun débordement).

## 8. FAQ

8 questions **visibles** (accordéons accessibles) + `FAQPage` JSON-LD dont le texte est **identique** au visible. Les réponses renvoient au simulateur / au tableau pour les valeurs chiffrées (jamais de chiffre figé susceptible de périmer). Aucune promesse bancaire.

## 9. Transparence & sécurité métier

- Taux = **taux indicatif** de référence Proactifs, **hors assurance**, avec mois dérivé de `effectiveMonth`.
- 35 % présenté comme **référence de calcul**, jamais comme garantie d'accord.
- 70 % locatif présenté comme **hypothèse de simulation Proactifs**, jamais « les banques retiennent 70 % ».
- **Aucun** « meilleur taux / taux garanti / financement accepté / pré-accord / accord de principe », **aucun** verdict bancaire, **aucune** donnée structurée présentant un taux comme une offre.
- Bloc **Méthodologie** distinguant référence de taux, hypothèses, calcul et décision bancaire.

## 10. E-E-A-T / confiance

Bloc discret indiquant que le simulateur est proposé par Proactifs Conseils Patrimoine (informations déjà présentes sur le site). **Aucune** donnée inventée (certification, nombre de clients, années d'expérience, taux de réussite, partenaires bancaires).

## 11. Lead

Formulaire **mock** conservé (transport local, « Prototype — aucune donnée envoyée »). **Aucun** réseau / Supabase / Brevo / Systeme.io / `/api/subscribe`. Le CTA « Étudier mon financement » de la zone contenu pointe vers `/courtage-credit-immobilier` (page réelle).

## 12. Structured data

`BreadcrumbList` (URLs réelles uniquement) + `FAQPage` (identique au visible). Un type Schema.org « calculateur » (WebApplication) a été **écarté** pour ne pas laisser croire à une offre de taux. À réévaluer en CS-4C.

## 13. Maillage

- **Sortant (réel) :** `/courtage-credit-immobilier` (CTA + E-E-A-T), `/immobilier`, `/investissement-immobilier`, `/blog` (via header). Aucune URL fictive.
- **Entrant (prévu CS-4C) :** ajouter un lien depuis `/courtage-credit-immobilier` et, si contexte naturel, `/immobilier` et pages financement pertinentes. **Non fait ici** (preview).
- **Hub `/simulateurs` :** **non créé.** « Autres simulateurs » = composant désactivé (aucune fausse card cliquable).

## 14. Responsive & accessibilité

- Testé 320/375/390/430/768/1024/1280/1440/1920 — **0 débordement horizontal**. Mobile : H1 lisible, simulateur accessible, cartes 1 colonne, tableau en cartes, FAQ et CTA clairs.
- 1 H1 unique, H2 cohérents, labels, `fieldset`/`legend`, `:focus-visible`, `aria-expanded`/`aria-controls` (accordéon + zones conditionnelles), `aria-live` (résultat), navigation clavier, liens explicites, tableau avec en-têtes.

## 15. Non-régression

`prototype-capacity.js` : seule la fonction `calculateRequiredIncomeForLoan` ajoutée (computeCapacityV2/buildFinancingInput inchangés). Aucune autre page, header, navigation, API, sitemap, vercel.json modifiés. Page absente de `sitemap.xml`, `nav-pages.json`, `breadcrumb-pages.json`.

## 16. Éléments pour CS-4C

Retirer `noindex,nofollow` · ajouter au `sitemap.xml` · ajouter à `nav-pages.json` + `breadcrumb-pages.json` (centralisation header/breadcrumb) · éventuelle entrée `vercel.json` · og:image dédiée · liens entrants (`/courtage-credit-immobilier`…) · connexion lead réel (réutiliser `/api/subscribe` après validation du payload) · vérifier canonical/analytics · smoke tests · soumission GSC · suivi Agent SEO · publication. **Aucune** de ces actions en CS-4B.

---

## Git

Diff CS-4B : `simulateurs/capacite-emprunt.html` (nouveau), `assets/js/simulators/prototype-capacity.js` (ajout fonction), `tests/simulators/cs4b-page.test.js` (nouveau), `docs/CS-4B-PAGE-CAPACITE-SEO.md` (nouveau). `index.html` (préexistant) exclu. Commit `CS-4B : page SEO preview capacite emprunt` sur `credit-simulateurs-v2`. **Aucun merge main, aucune production.**

**STOP.** CS-4C non démarré. noindex conservé, hors sitemap.
