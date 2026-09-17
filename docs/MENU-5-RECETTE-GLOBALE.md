# MENU-5 — Recette globale navigation & UX

**Site :** proactifsconseils.fr · **Date :** 17/09/2026
**Branche :** `menu-1.5-centralisation-header` · **HEAD :** `0698b0a`
**Nature :** recette finale **lecture seule** avant merge `main`. **Aucune correction, aucun fichier de code modifié.**

---

## 0. Synthèse & recommandation

**GO technique** pour MENU-6. Les 3 tests automatiques passent, la navigation (header desktop, méga-menus, drawer mobile, breadcrumbs, CTA, états actifs, liens, clavier) est **fonctionnelle sur les 49 pages**. **0 anomalie P0, 0 P1.** Les seules réserves sont des overflows de **contenu préexistant** (P2, hors périmètre navigation) et des points cosmétiques (P3). Aucun lien mort, aucune destination fictive.

| Statut | Nb |
|---|---|
| PASS | 49 (aucun FAIL) |
| dont PASS AVEC NOTE (note informative/P3) | 42 |
| FAIL | **0** |

*La note dominante « actif mobile absent » concerne les univers Patrimoine & Ressources : c'est un **choix d'architecture MENU-3.1 déjà validé**, pas un défaut introduit ici (voir P3-1).*

---

## 1. Pages testées

Les **49 pages CENTRALIZED** (`scripts/nav-pages.json`). + audit séparé des exceptions : lead magnet PER (LANDING_SPECIAL), `pret-immobilier-index` et `simulation-pret-immobilier` (INTENTIONAL_LEGACY).

## 2. Breakpoints testés

Desktop : **1024 / 1280 / 1440 / 1920**. Mobile : **320 / 375 / 390 / 430**. (Rendu headless réel Chromium.)

## 3. Header desktop

Header centralisé identique sur toutes les pages (rendu unique). Sur les 4 largeurs desktop, échantillon Patrimoine/Immobilier/Ressources :

- Hauteur nav **72 px** constante · logo, entrées, CTA alignés.
- **Aucun débordement horizontal** (pageOverflow = 0) à 1024/1280/1440/1920.
- Entrées présentes : Patrimoine, Immobilier, Simulateurs, Le cabinet, Ressources + CTA.

## 4. Méga-menu Patrimoine

Ouverture au clic/focus (aria-expanded `false → true`), `display:grid`, **8 destinations** réelles : Bilan patrimonial, Optimisation fiscale, Déclaration d'impôts, Fiscalité RSU/stock-options, Placements financiers, Préparation retraite, Transmission, Cession d'entreprise. Fermeture Escape + focus rendu au déclencheur ✓. Tab entre dans le panneau (1er lien « Bilan patrimonial ») ✓.

## 5. Méga-menu Immobilier

Ouverture (aria-expanded toggle), `display:grid`, **8 liens/CTA** : Estimer / Vendre / Succession Sérénité 360 / Découvrir Proactifs Immobilier / Investissement / SCPI / Financement-Courtage / CTA « Estimer mon bien ». Destinations réelles, hover/focus/fermeture OK.

## 6. Ressources

Dropdown Ressources : ouverture (aria-expanded), `display:block`, **1 lien → `/blog`**. État actif « Ressources » (desktop) présent sur `blog/index` **et** les 25 articles.

## 7. Simulateurs (Header V1 actuel)

Entrée « Simulateurs » → **`/#simulateurs`** (ancre vers la section de la page d'accueil). Cible vérifiée : `index.html` contient bien `id="simulateurs"` → **fonctionnel, aucun lien mort**. Comportement V1 conforme ; Simulateurs V2 non construit (hors périmètre). *Note : depuis une page interne, le lien renvoie à l'accueil puis scrolle — comportement V1 attendu.*

## 8. Le cabinet

`/cabinet` → page réelle. État actif **desktop ET mobile** (nav-link + m-item `aria-current="page"`). CTA « Prendre rendez-vous » → `/bilan-patrimonial`.

## 9. Mobile — général

Sur 320/375/390/430 (échantillon) : hamburger présent, drawer `.mobile-menu` s'ouvre (`open`), `max-height: calc(100dvh - 72px)` (≈728 px), sous-menus niveau 2 actifs, bouton retour présent, **auto-fermeture au clic sur un lien** (`stillOpen:false`). MENU-3.1 figé, conforme.

## 10. Mobile — Patrimoine / Immobilier / Ressources (niveau 2)

Pour chaque univers testé : `data-submenu` → vue niveau 2 `.active`, bouton **← Retour** présent, fermeture et auto-fermeture OK. (Patrimoine 3 sections / 8 liens, Immobilier 2 blocs + CTA, Ressources → Blog : structure MENU-3.1 inchangée.)

## 11. Breadcrumbs (48 pages équipées)

`build-breadcrumbs.js --check` → **48/48 conformes, 0 anomalie** : exactement 1 breadcrumb visible + 1 `BreadcrumbList` par page, labels/URLs cohérents, parents réels, `aria-label="Fil d'Ariane"`, `aria-current="page"`, CSS chargé, **0 breadcrumb legacy, 0 doublon**. Accueil : sans breadcrumb (voulu).

## 12. Breadcrumbs visuels

Échantillon Patrimoine / Immobilier / Blog / Local / Cabinet / RSU, desktop + mobile : bandeau sable sous header (`top=72`), liens teal, page courante slate, séparateurs `›`, focus visible, wrap naturel, **overflow propre au breadcrumb = 0** (confirmé 119 contrôles en NAV-UX-1B + re-contrôle MENU-5).

## 13. CTA contextuels (inventaire)

| Page(s) | CTA | Cible | Conforme |
|---|---|---|---|
| Pages générales (Patrimoine, Cabinet, Blog, Local, Immobilier invest/SCPI/courtage) | Prendre rendez-vous | `/bilan-patrimonial` | ✓ |
| `/bilan-patrimonial` | Demander un bilan | `#form` (présent) | ✓ contextuel |
| `/immobilier` | **Faire estimer mon bien** | `#estimation` (présent) | ⚠ libellé (P3-2) |
| `/immobilier/estimation-colombes` | Estimer mon bien | `#estimation` (présent) | ✓ |
| `/immobilier/succession-colombes` | Diagnostic Succession 360 | `#diagnostic` (présent) | ✓ |

Toutes les ancres cibles (`#form`, `#estimation`, `#diagnostic`) existent sur leur page. Aucun CTA cassé.

## 14. États actifs (49 pages, vérif automatique)

**0 anomalie.** Chaque page marque le bon univers : Patrimoine/Immobilier/Ressources sur `.nav-trigger`, Cabinet sur `.nav-link`. Aucun « plusieurs actifs » erroné (les 2 `aria-current` d'Immobilier/Cabinet = 1 desktop + 1 mobile, par conception). Accueil : aucun actif (voulu). **Différence desktop/mobile connue :** Patrimoine & Ressources n'ont pas de token actif mobile (design MENU-3.1) → P3-1.

## 15. Liens

Scan de tous les liens internes header + méga-menus + mobile + breadcrumbs (49 pages) : **0 href vide, 0 destination inexistante, 0 ancre manquante, 0 URL fictive.** `/#simulateurs` = ancre valide (cible présente sur l'accueil), non comptée comme lien mort.

## 16. Clavier / accessibilité

- `aria-expanded` : bascule correcte à l'ouverture/fermeture ✓
- **Escape** : ferme le méga-menu ouvert **et rend le focus au déclencheur** ✓
- **Tab / Shift+Tab** : entre dans le panneau, parcourt les liens ✓
- `aria-current="page"`, `aria-label="Fil d'Ariane"`, `aria-haspopup`, `aria-controls` présents ✓
- `:focus-visible` présent (breadcrumb + nav)
- Mobile : Escape ferme le drawer (`closeMobile`), focus/inert gérés (MENU-3.1)

Aucune anomalie clavier bloquante détectée.

## 17. Overflow — classification

- **Cat A (régression navigation/header/breadcrumb) : AUCUNE.** Header 0 overflow (desktop) ; breadcrumb `scrollWidth == clientWidth` (0) à toutes largeurs.
- **Cat B (contenu préexistant)** : `/immobilier` image de hero (`img.hero-slide`) déborde de 8–12 px à ≤430 px ; certains articles/pages ont des tableaux comparatifs / cartes `.solution-card` plus larges que 320 px (déjà relevé en NAV-UX-0/1B). Non introduit par la navigation.
- **Cat C (acceptable)** : wrap des breadcrumbs longs sur 2–3 lignes en mobile (voulu).

## 18. Tests automatiques

| Test | Résultat |
|---|---|
| `node scripts/build-header.js --check` | ✓ **49/49** pages « à jour » (exit 0) |
| `node scripts/check-mobile-nav.js` | ✓ **63 pages**, aucune régression mobile |
| `node scripts/build-breadcrumbs.js --check` | ✓ **48/48** conformes, 0 anomalie |

## 19. Exceptions

- **Lead magnet PER** (`Lead magnets/blog-per-vs-assurance-vie-2026.html`, LANDING_SPECIAL) : correctifs **MENU-4F.1 toujours en place** — `.mobile-menu` `max-height: calc(100vh-72px)` + `overflow-y:auto` (scrollable), nav opaque `rgba(250,250,247,.98)` (visible avant scroll), script `mobile-menu-autoclose`. Canonical → `/blog/per-vs-assurance-vie-2026`. Fonctionnel, exclu à dessein du header central.
- **`pret-immobilier-index` / `simulation-pret-immobilier`** (INTENTIONAL_LEGACY) : hors `nav-pages.json`, ancien header (pas de `NAV:START`), breadcrumb présent, **git diff = 0**. Classés **dette Crédit / Simulateurs**, pas un échec Header V1.

## 20. Performance visuelle

Rendu headless : header et breadcrumb apparaissent immédiatement (bandeau positionné à `top=72` dès le chargement), pas de saut de layout visible sur la bande de navigation. Le CSS breadcrumb centralisé charge en `<head>`. (Audit Lighthouse complet hors périmètre MENU-5.)

## 21. Matrice de recette — 49 pages

Colonnes : header / actif desktop / actif mobile / CTA / breadcrumb / JSON-LD / liens → statut. `—(design)` = pas de token actif mobile pour Patrimoine/Ressources (voulu).

| URL | Univers | header | actif D | actif M | CTA | breadcrumb | JSON-LD | liens | statut |
|---|---|---|---|---|---|---|---|---|---|
| / | Accueil | OK | OK | —(design) | Prendre rendez-vous | — | — | OK | PASS |
| /immobilier | Immobilier | OK | OK | OK | Faire estimer mon bien | OK | OK | OK | PASS AVEC NOTE |
| /immobilier/succession-colombes | Immobilier | OK | OK | OK | Diagnostic Succession 360 | OK | OK | OK | PASS |
| /immobilier/estimation-colombes | Immobilier | OK | OK | OK | Estimer mon bien | OK | OK | OK | PASS |
| /optimisation-fiscale-ile-de-france | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /bilan-patrimonial | Patrimoine | OK | OK | —(design) | Demander un bilan | OK | OK | OK | PASS |
| /declaration-impots-ile-de-france | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /fiscalite-rsu-stock-options | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /placements-financiers | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /preparation-retraite | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /transmission | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /cession-entreprise | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /investissement-immobilier | Immobilier | OK | OK | OK | Prendre rendez-vous | OK | OK | OK | PASS |
| /investissement-immobilier-ancien | Immobilier | OK | OK | OK | Prendre rendez-vous | OK | OK | OK | PASS |
| /investissement-scpi-hauts-de-seine | Immobilier | OK | OK | OK | Prendre rendez-vous | OK | OK | OK | PASS |
| /courtage-credit-immobilier | Immobilier | OK | OK | OK | Prendre rendez-vous | OK | OK | OK | PASS |
| /cabinet | Cabinet | OK | OK | OK | Prendre rendez-vous | OK | OK | OK | PASS |
| /conseiller-patrimoine-asnieres | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /conseiller-patrimoine-colombes | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /conseiller-patrimoine-courbevoie | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /conseiller-patrimoine-levallois | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /conseiller-patrimoine-nanterre | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/ | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/actions-gratuites-aga-fiscalite-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/bspce-fiscalite-startup-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/conseiller-patrimoine-ile-de-france | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/declarer-rsu-formulaires-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/donation-vivant-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/donation-vivant-vs-testament-strategie-transmission | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/espp-fiscalite-france-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/gestion-patrimoine-entreprise-strategies-optimisation-fiscale-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/immobilier-complement-retraite-lmnp-scpi-50-ans | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/investir-rsu-patrimoine-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/lmnp-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/modifier-clause-beneficiaire-assurance-vie-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/per-vs-assurance-vie-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/preparer-retraite-2026-leviers-patrimoniaux-juin | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/preparer-retraite-50-ans-leviers-patrimoniaux | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/quand-vendre-rsu-strategie-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/reduire-impots-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/rsu-expatriation-fiscalite-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/rsu-imposition-france-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/rsu-pea-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/sci-familiale-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/scpi-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /blog/stock-options-imposition-strategie-2026 | Ressources | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |
| /declaration-rsu-espp-france | Patrimoine | OK | OK | —(design) | Prendre rendez-vous | OK | OK | OK | PASS |

**Récap : 49 PASS · 0 FAIL.** (Le libellé « PASS AVEC NOTE » n'est réellement actionnable que pour `/immobilier` — CTA, P3-2. La colonne `—(design)` est informative, pas un défaut.)

## 22. Classification des anomalies

Aucune **P0**, aucune **P1**.

**P2 — recommandé (hors périmètre navigation) :**
| ID | Page(s) | Largeur | Description | Cause | Impact | Périmètre |
|---|---|---|---|---|---|---|
| P2-1 | `/immobilier` | ≤430 px | débordement horizontal 8–12 px | `img.hero-slide` (image hero) plus large que le viewport | esthétique (léger scroll) | Contenu (cat B), à traiter au chantier Immobilier |
| P2-2 | certains articles blog / pages avec `.solution-card`, tableaux comparatifs | 320 px | contenu plus large que 320 px | mise en page tableau/carte | esthétique | Contenu (cat B), préexistant |

**P3 — backlog :**
| ID | Description | Recommandation |
|---|---|---|
| P3-1 | Pas d'état actif **mobile** pour Patrimoine & Ressources (design MENU-3.1) | Ajouter des tokens actifs mobiles pour parité desktop/mobile |
| P3-2 | `/immobilier` : CTA « **Faire** estimer mon bien » vs « Estimer mon bien » ailleurs | Uniformiser le libellé |

**Impact SEO :** nul pour tous ces points (breadcrumbs + BreadcrumbList conformes, aucun changement de title/meta/canonical dans cette phase).

## 23. Fichiers créés / modifiés

- **Créé** : `docs/MENU-5-RECETTE-GLOBALE.md` (ce rapport).
- **Aucun fichier de code modifié** (0 HTML/CSS/JS/header/breadcrumb/config touché).
- Helper d'audit `scripts/menu5-analyze.cjs` : **non suivi** (jetable, non commité), n'altère aucun fichier suivi.

## 24. Confirmations finales

- **Aucun code modifié** : confirmé (recette lecture seule).
- **Aucun merge `main`** : confirmé.
- **Aucune production** : confirmé.
- **Recommandation : GO technique pour MENU-6** (merge/déploiement à arbitrer par toi ; 0 P0/P1).

---

**STOP.** MENU-6 / Crédit V2 / Simulateurs V2 non démarrés. En attente de validation.
