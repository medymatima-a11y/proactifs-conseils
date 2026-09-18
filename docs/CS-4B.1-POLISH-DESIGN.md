# CS-4B.1 — Polish design & conversion : page capacité d'emprunt

**Site :** proactifsconseils.fr · **Date :** 18/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-4B `55de80b`
**Nature :** passe **design / UX / responsive / conversion** sur `/simulateurs/capacite-emprunt`. **Moteur et SEO gelés.** Page toujours `noindex,nofollow`, hors sitemap, hors production.

---

## 1. Audit initial

- HEAD confirmé `55de80b`.
- Fichiers impliqués : `simulateurs/capacite-emprunt.html` (seul HTML) + assets partagés (navigation.css/js, breadcrumb.css, simulators.css, moteur JS).
- **Logo « cassé » : aucun bug réel.** Le header utilise `src="/images/proactifs-logo.png"` (chemin **absolu**), et l'asset existe (`images/proactifs-logo.png`, 15 Ko, 425×191). Le rendu « cassé » des captures CS-4B venait uniquement de mon **script de rendu offline** qui bloquait les images `.png`. Vérifié : `logo header loaded = true` une fois les images servies.
- Footer : inline par page sur ce site (pas de partial centralisé) → footer réel **reproduit** (contenu/liens) en CSS scopé, sans toucher aux fichiers globaux.

## 2. Cause & correction logo

- **Cause :** artefact de rendu (images bloquées), pas un problème de chemin.
- **Correction :** aucune modification nécessaire du `src` ; le logo officiel `/images/proactifs-logo.png` du header centralisé est réutilisé tel quel, en header **et** en footer. Validé desktop et mobile.

## 3. Bug réel corrigé (design)

Le bouton `.sim-cta` s'appuie sur les tokens `--sim-*` **définis uniquement dans `.sim-root`**. Les CTA situés **hors** du simulateur (hero, bloc conversion) apparaissaient donc **sans fond** (texte blanc sur ivoire). Corrigé en définissant les couleurs de marque des `.sim-cta` au niveau `.cap-wrap` (teal par défaut, or pour le bloc conversion), sans toucher au simulateur.

## 4. Largeur / respiration

- Container large `~1080 px` (cards, CTA, FAQ, méthodologie) ; largeur de lecture `~760 px` pour les paragraphes.
- Rythme éditorial : alternance de bandes blanc / ivoire léger, marges de section augmentées, surtitres visuels (eyebrows) — **sans transformer chaque section en carte**.

## 5. Hero

Espaces verticaux resserrés entre intro, réassurance et simulateur ; H1 fluide (`clamp`). Aucune image hero. Le simulateur reste l'élément dominant du premier écran.

## 6. Simulateur & résultat

**Inchangés fonctionnellement** (progress, étapes, questions, résultat, accordéon). Espacements harmonisés uniquement. Hiérarchie du résultat conservée (budget dominant → capacité / mensualité / apport / durée / taux indicatif).

## 7. Architecture visuelle du contenu

3 ensembles avec surtitres visuels, **H2 SEO conservés** :
- **Comprendre votre capacité** (calcul, revenus, crédits en cours)
- **Ce qui influence votre financement** (revenus locatifs, apport, durée)
- **Passer de la simulation au projet** (cas 200/300/400 k€, capacité réelle, CTA)

## 8. Cards 200 / 300 / 400 k€ (dynamiques)

Ancien petit tableau → **3 cartes premium** (3 colonnes desktop, 2 tablette, 1 mobile). Chaque carte : « Emprunter », montant, « Sur 20 ans », **« Revenu mensuel estimatif nécessaire »** (libellé explicite), valeur, « net par mois », « Taux indicatif ». Une **seule** zone d'hypothèses sous les cartes + « Référence &lt;mois dynamique&gt; ».
**Valeurs calculées par `calculateRequiredIncomeForLoan()` + `ACTIVE_MARKET_REFERENCE`** — aucune valeur financière ni taux codés en dur.

## 9. CTA conversion premium

Bloc dédié **fond vert profond**, titre serif blanc, bouton **or** « Étudier mon financement » → `/courtage-credit-immobilier`, micro-réassurance **factuelle** : « Analyse personnalisée · Accompagnement financement · Sans engagement » (aucun chiffre inventé). Mobile : bouton pleine largeur.

## 10. FAQ

8 questions conservées (texte identique → `FAQPage` inchangé). Présentation premium : `<details>/<summary>` **accessibles** (non remplacés par des div), padding accru, indicateur +/−, hover discret desktop, focus visible, séparation claire.

## 11. Méthodologie & confiance

Surtitre « TRANSPARENCE » + 4 blocs (Taux de référence, Hypothèses, Calcul, Décision bancaire) en mini-grille. Distinction claire **simulation Proactifs ≠ décision d'une banque**, sans jargon anxiogène. Signature « Un simulateur Proactifs Conseils » + phrase de complément (informations déjà validées, aucun chiffre inventé).

## 12. Footer

Footer Proactifs reproduit (logo, Services, Cabinet, Contact, mention « CIF enregistré AMF ») en CSS scopé — pas de refonte globale, pas de nouveau footer inventé.

## 13. Responsive & accessibilité

- **0 débordement horizontal** vérifié à 320/375/390/430 (cause d'overflow — CTA en `inline-flex width:100%` — corrigée en `display:block; width:auto; box-sizing:border-box`).
- Cards en 1 colonne mobile, chiffre principal lisible sans zoom, CTA quasi pleine largeur.
- 1 H1 unique, H2 conservés, labels, `fieldset`/`legend`, focus-visible, `aria-expanded`/`aria-controls`, `aria-live`, clavier.

## 14. Gelé (inchangé)

Moteur CS-1, politique CS-3, référentiel CS-3.5, `computeCapacityV2`, `buildFinancingInput`, `calculateRequiredIncomeForLoan` (aucune modification ce phase). Title, H1, meta description, canonical, 8 H2, FAQ, contenu pédagogique, `BreadcrumbList`, `FAQPage`, `noindex,nofollow`, absence du sitemap. Header centralisé, navigation V1, `vercel.json` : non modifiés.

## 15. Reste pour CS-4C

Retirer `noindex,nofollow` · ajouter `sitemap.xml` · centraliser (nav-pages.json + breadcrumb-pages.json) · og:image dédiée · liens entrants · lead réel (`/api/subscribe` après validation) · analytics · smoke tests · GSC · publication.

---

## Git

Diff CS-4B.1 : `simulateurs/capacite-emprunt.html` (design), `tests/simulators/cs4b1-design.test.js` (nouveau), `docs/CS-4B.1-POLISH-DESIGN.md` (nouveau). `index.html` (préexistant) exclu. Commit `CS-4B.1 : polish design et conversion simulateur`. **Aucun merge main, aucune production.**

**STOP.** CS-4C non démarré. noindex conservé, hors sitemap.
