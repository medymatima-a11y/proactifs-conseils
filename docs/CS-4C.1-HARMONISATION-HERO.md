# CS-4C.1 — Harmonisation visuelle hero + entrée simulateur

**Page :** `/simulateurs/capacite-emprunt` · **Date :** 18/09/2026
**Branche :** `credit-simulateurs-v2` · **Base :** CS-4C `8ff4009` (main prod `d1f706e`)
**Nature :** correction **visuelle uniquement** (CSS scopé). Aucun changement fonctionnel, SEO, moteur, lead, analytics, header, breadcrumb, sitemap.

---

## Problème initial
Hero fonctionnel mais peu « Proactifs » : CTA or trop large/rectangulaire (barre pleine largeur sur mobile), hero + simulateur perçus comme un seul bloc ivoire continu, H1 mobile trop haut, intro trop large, séparation promesse/outil insuffisante, or non conforme à la charte.

## Audit couleur or (#D2B41E vs #C4973A)
- `#C4973A` : **101 occurrences** dans le CSS/pages réelles ; c'est la valeur du token `--gold` sur tout le site (accueil, bilan, blog…) et l'or des CTA premium.
- `#D2B41E` : **4 occurrences**, toutes dans mes fichiers CS-4C (`simulators.css`, prototype, page simulateur) — introduit à tort en CS-4C.
- **Conclusion : l'or de marque réel est `#C4973A`.** CS-4C.1 aligne le simulateur dessus. (Note : une préférence enregistrée mentionnait `#D2B41E` ; elle est contredite par la production — à actualiser côté préférences si confirmé.)

## Couleur retenue + justification
`--gold: #C4973A` (token page) + `--sim-gold: #C4973A` (override scopé `.cap-wrap .sim-root`, sans toucher `simulators.css` partagé). Hover CTA : `#B0862F` (or assombri). Texte sur or : `#241C06` (contraste ≈ 6:1, AA). Le CTA hero correspond désormais visuellement au bouton « Prendre rendez-vous ».

## CTA hero
- Bouton pill premium : `inline-flex`, `width:auto`, `border-radius:999px`, padding généreux (15px 34px desktop, 14px 28px mobile), légère ombre or.
- **Fin de la barre pleine largeur** : la règle mobile `display:block` (qui étirait le `<a>` sur 100 %) est remplacée par `inline-flex` centré avec marges latérales (`max-width:calc(100% - 8px)`).
- `text-decoration:none` explicite sur `.sim-cta` + `:hover/:focus/:visited` (plus aucun soulignement de lien).

## Hero
- Composition éditoriale centrée : `.cap-hero` `max-width` 780→**860px**, intro 620→**680px**, respiration verticale accrue (padding 44px haut).
- H1 (Cormorant Garamond, forest conservés) : `clamp(34px,5vw,46px)` → **`clamp(30px,4.4vw,44px)`**, line-height 1.08→1.14. Desktop 44px (présent sans être démesuré), **mobile 30px** (2–3 lignes au lieu de 4–5).
- Intro : 17→16.5px. Réassurance « Gratuit · Sans engagement · Résultat immédiat » conservée, allégée, wrap propre sur mobile.
- **Fonts conservées** (Cormorant Garamond / Nunito Sans du site actuel). Passage Fraunces/DM Sans → backlog DESIGN-SYSTEM-V2.

## Séparation hero / simulateur + carte outil
- Le wizard devient une **carte outil premium** : `.cap-wrap #simulateur .sim-container` fond blanc, bordure 1px `--line`, `border-radius:20px` (16px mobile), ombre très légère (`0 20px 44px -26px rgba(16,46,34,.22)`), padding confortable, `max-width:772px` centrée.
- La carte blanche détachée sur le bandeau ivoire (`--iv`) crée la séparation promesse/outil, sans ligne ni gradient.
- Rendu sobre, patrimonial — pas d'effet fintech/dashboard.

## Responsive
- Carte avec gouttières latérales 16px sur mobile (ne touche jamais les bords).
- **0 débordement horizontal** vérifié 320 / 390 / 1440 (captures).
- Options en colonne, chiffres lisibles sans zoom.

## Gelé (inchangé — hors périmètre)
Progress bar & état sélectionné = **teal** (jamais or). Breadcrumb centralisé, header, footer, moteur (`computeCapacityV2`/`buildFinancingInput`/`calculateRequiredIncomeForLoan`), politique CS-3, taux CS-3.5, SEO (title/H1/H2/FAQ/canonical/Schema), robots `index, follow`, sitemap, lead `/api/subscribe` + anti double-submit + consentement, GA4 + 5 events. `simulators.css` partagé **non modifié**.

## Fichiers modifiés
- `simulateurs/capacite-emprunt.html` — **CSS inline uniquement** (bloc `<style>`).
- `docs/CS-4C.1-HARMONISATION-HERO.md` (ce document).
- `index.html` : modification préexistante **exclue** du commit.

## Tests & contrôles
- `node --test tests/simulators/*.test.js` : **191 / 191 PASS**.
- `build-header.js --check` : 0 désync. `build-breadcrumbs.js --check` : 49/49. `check-mobile-nav.js` : 65 pages, 0 régression.
- Diff : CSS-only, aucun autre fichier touché.
- Contrôles rendu : CTA `rgb(196,151,58)` = #C4973A, `text-decoration:none`, `display:inline-flex` (320/390/1440), H1 44px desktop / 30px mobile, ombre carte présente.

## Captures
Desktop 1440, mobile 390, mobile 320, état sélectionné + « Continuer ».

## Git
Commit `CS-4C.1 : harmonisation visuelle hero simulateur` sur `credit-simulateurs-v2`.
**PAS DE MERGE MAIN. PAS DE DÉPLOIEMENT PRODUCTION.** En attente de validation visuelle.

---

## Micro-corrections post-validation (mobile 320–430)
Validation visuelle OK ; 2 ajustements mobiles uniquement (CSS `@media max-width:600px`, aucun autre changement) :
1. **Respiration hero réduite ~12 %** via les espacements verticaux seulement (band-hero padding-top 18→8, cap-hero padding-top 22→16, intro margin-bottom 18→12, hero-cta margin 12→8, reassure margin-top 10→8) — H1 et textes inchangés → la carte simulateur apparaît plus tôt.
2. **Bouton « Continuer » (étape unique)** limité à ~72 % de la largeur utile de la carte, aligné à droite, clairement secondaire par rapport au CTA hero. Desktop inchangé (position à droite). Rangées Retour+Continuer inchangées (50/50).
Contrôles : 191/191 tests, header/breadcrumbs/mobile OK, 0 débordement 320/390, Continuer ≈ 72 % largeur utile.
