# CS-6C — Publication du simulateur TAUX D'ENDETTEMENT

**Projet :** Proactifs Conseils — Simulateurs V2
**Branche :** `credit-simulateurs-v2` · HEAD `87f390a` (aucun commit en CS-6C)
**Date :** 19 septembre 2026
**Statut :** ✅ Intégration/publication réalisée et vérifiée en local — **non commité, non déployé**. En attente de validation ChatGPT.

> CS-6C = **publication / intégration uniquement**. Le simulateur, son moteur, son UX, ses textes et son design restent **gelés tels que validés en CS-6B**. Le hub `/simulateurs` n'est **pas** créé (réservé à CS-7).

---

## 1. État git initial

- Branche : `credit-simulateurs-v2` · HEAD `87f390a` (CS-5E.1).
- Fichiers CS-6 présents et intacts : `prototype-endettement.js`, `taux-endettement.html`, `cs6-endettement.test.js`, `docs/CS-6A…`, `docs/CS-6B…`.
- `index.html` = modification locale préexistante **hors périmètre**, jamais touchée.
- Aucun `git add .` / `-A` / `reset --hard` / `clean`.

## 2. Simulateur gelé — vérifié

Aucune modification de : `calculateDebtRatio`, `core.js`, `calc-credit.js`, `calc-immo.js`, `rates.js`, `credit-policy.js`, `ui.js`, `lead.js`, agrégation, tolérance ±0,2, textes d'interprétation, payload lead, analytics, exemples, design, contenu SEO, CTA.
`git status` ne liste **aucun** de ces fichiers (moteurs/policy/UI) comme modifié. `prototype-endettement.js` reste l'adaptateur CS-6B inchangé (marqueurs `debt_ratio`, `REFERENCE_DISPLAY_TOLERANCE_POINTS = 0.2`, `POLICY.maxDebtRatio`, `POLICY.rentalIncomeRetention` intacts).

## 3. Passage en indexation

- `simulateurs/taux-endettement.html` : `robots` **`noindex,nofollow` → `index, follow`**.
- Aucun `noindex`/`nofollow` résiduel (0 occurrence).
- Aucune URL preview / localhost résiduelle (0 occurrence).

## 4. Canonical

`<link rel="canonical" href="https://proactifsconseils.fr/simulateurs/taux-endettement">` — conservé, correct, unique.

## 5. Breadcrumb central

- Bascule **preview-local → système centralisé** : retrait du fil d'Ariane et du JSON-LD preview, ajout au registre `scripts/breadcrumb-pages.json`, régénération par `node scripts/build-breadcrumbs.js`.
- Fil produit : **Accueil › Simulateurs › Taux d'endettement**
  - `Accueil` = lien `/`
  - `Simulateurs` = **label non cliquable** (`<span>`, pas d'URL) — cohérent avec Capacité et Mensualité, car le hub `/simulateurs` n'existe pas encore.
  - `Taux d'endettement` = page courante (`aria-current="page"`).
- `BreadcrumbList` JSON-LD régénéré entre marqueurs, cohérent avec le fil visible.
- `build-breadcrumbs --check` : **51/51 conformes, 0 anomalie**.

## 6. Header central

- Ajout de `simulateurs/taux-endettement.html` au registre `scripts/nav-pages.json`.
- `node scripts/build-header.js` : page **enregistrée et à jour**.
- Le header global **ne change pas** : le lien `Simulateurs → #simulateurs` reste inchangé (aucun menu Simulateurs créé — réservé CS-7).
- `build-header --check` : **exit 0**.

## 7. Sitemap

- Régénération par **`node scripts/generate-sitemap.js`** (générateur corrigé CS-5E.1, aucune édition manuelle).
- Résultat : **53 URLs** (1 source de redirection permanente exclue automatiquement).
  - `/simulateurs/capacite-emprunt` = présent ✅
  - `/simulateurs/mensualite-credit` = présent ✅
  - `/simulateurs/taux-endettement` = **présent** ✅
  - `/simulation-pret-immobilier` = **absent** ✅
- `sitemap.xml` bien formé (validation XML OK).

## 8. SEO final (vérifié sans réécriture)

- `title` : « Calcul du taux d'endettement | Simulateur gratuit | Proactifs »
- `meta description` : centrée sur le calcul du taux d'endettement + repère indicatif 35 %.
- `H1` : « Calculez votre taux d'endettement »
- `canonical` / `robots` : corrects (voir §3–4).
- `FAQPage` JSON-LD : présent (1).
- **Intention préservée** : *calcul du taux d'endettement* — pas *capacité d'emprunt*, ni *mensualité de crédit*, ni *courtier crédit*. Aucune nouvelle optimisation éditoriale effectuée.

## 9. Maillage (vérifié, aucun ajout)

Liens internes présents et absolus : `/simulateurs/capacite-emprunt` (1), `/simulateurs/mensualite-credit` (1), `/courtage-credit-immobilier` (4). Aucun lien cassé, aucun nouveau lien ajouté.

## 10. Lead (vérifié statiquement)

- CTA « Étudier mon financement » → `POST /api/subscribe` (transport réel dans la page).
- Adaptateur : `service: 'credit'`, `source: 'simulateur_taux_endettement'`.
- **Aucune donnée financière** dans le payload (identité seule + attribution de source). Aucun faux lead envoyé.

## 11. Analytics (vérifié)

- `simulator_type = 'debt_ratio'`.
- `simulation_result` = **`{ bucket: res.bucket }`** uniquement (below/around/above_reference).
- Aucun revenu, charge, mensualité, ratio exact, ni PII. Aucune configuration analytics modifiée.

## 12. Tests

Assertions CS-6 adaptées preview → publication (K1) + nouveau bloc **L (intégration centrale)** :

| Suite / contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **257/257** (254 + 3 tests L) |
| `node --test tests/generate-sitemap.test.js` | ✅ 4/4 |
| `node scripts/build-header.js --check` | ✅ exit 0 |
| `node scripts/build-breadcrumbs.js --check` | ✅ **51/51**, 0 anomalie |
| `node scripts/check-mobile-nav.js` | ✅ 67 pages, aucune régression |

Nouvelles assertions CS-6C :
- K1 : `index, follow` + aucun `noindex`/preview résiduel + canonical.
- L1 : sitemap (taux-endettement présent · capacité/mensualité présents · simulation-pret absent).
- L2 : header central (page dans `nav-pages.json` + marqueurs NAV).
- L3 : breadcrumb central (entrée registre + `Simulateurs` non cliquable + page courante + JSON-LD BreadcrumbList).

Aucune régression.

## 13. QA locale (Playwright, mirror local, fonts/GA4 bloqués)

Page **publiée** rejouée — largeurs **1440 / 390 / 320**, aucun overflow, breadcrumb visible, aucune erreur JS.

| Scénario | Saisie | Résultat attendu | Obtenu |
|---|---|---|---|
| A | 4 200 € · crédit 900 € · nouvelle mens. 510 € | 33,6 % · sous le repère | ✅ 33,6 % (1440/390/320) |
| B | 4 500 € · charges 1 700 € | 37,8 % · dépasse le repère | ✅ 37,8 % (390) |
| C | 10 000 € · charges 3 490 € | 34,9 % · autour du repère | ✅ 34,9 % (320) |

## 14. Responsive

Aucun débordement horizontal aux 3 largeurs, `XX,X %` sur une ligne, panneau résultat compact, formulaire et breadcrumb utilisables, header central cohérent.

## 15. Fichiers créés / modifiés

**Créés (CS-6, untracked) :**
```
assets/js/simulators/prototype-endettement.js
simulateurs/taux-endettement.html
tests/simulators/cs6-endettement.test.js
docs/CS-6A-AUDIT-TAUX-ENDETTEMENT.md
docs/CS-6B-TAUX-ENDETTEMENT.md
docs/CS-6C-PUBLICATION-TAUX-ENDETTEMENT.md   (ce rapport)
```

**Modifiés (publication, tracked) :**
```
scripts/nav-pages.json          (+ simulateurs/taux-endettement.html)
scripts/breadcrumb-pages.json   (+ entrée Taux d'endettement, Simulateurs non cliquable)
sitemap.xml                     (+ /simulateurs/taux-endettement)
```

Aucun autre fichier fonctionnel modifié. `index.html` = hors périmètre (modif locale préexistante, non stagée).

## 16. Non touché (conforme au cadrage)

`index.html`, home `#simulateurs`, hub `/simulateurs` (non créé), `pret-immobilier-index` + sous-domaine, `courtage-credit-immobilier`, capacité, mensualité, moteurs, taux, policy, `/api/subscribe`, Supabase, Brevo, Systeme.io, header global, CSS global.

## 17. État git final

```
Branche : credit-simulateurs-v2   HEAD : 87f390a   (inchangé — aucun commit)

Modifiés (tracked) :
  scripts/breadcrumb-pages.json
  scripts/nav-pages.json
  sitemap.xml
  index.html                     (hors périmètre, jamais touché)

Nouveaux (untracked) :
  assets/js/simulators/prototype-endettement.js
  simulateurs/taux-endettement.html
  tests/simulators/cs6-endettement.test.js
  docs/CS-6A-AUDIT-TAUX-ENDETTEMENT.md
  docs/CS-6B-TAUX-ENDETTEMENT.md
  docs/CS-6C-PUBLICATION-TAUX-ENDETTEMENT.md
```

**PAS de commit · PAS de push · PAS de merge main · PAS de déploiement.**

*Fin CS-6C. Publication intégrée et vérifiée en local. En attente de validation ChatGPT avant mise en production (commit + merge main + déploiement). CS-7 (hub) non démarré.*
