# CS-6D — Mise en production du simulateur TAUX D'ENDETTEMENT + QA

**Projet :** Proactifs Conseils — Simulateurs V2
**Date :** 19 septembre 2026
**Statut :** ✅ **En production, vérifié.** Simulateur taux d'endettement publié, indexable, calculs et neutralité validés en conditions réelles.

---

## 1. Commits & merge

| Élément | Valeur |
|---|---|
| Commit CS-6 (branche) | **`9465b85`** — « CS-6 : publier le simulateur taux d'endettement » (9 fichiers, 1814 insertions) |
| Merge dans main | **`fdb0580`** — « Merge branch 'credit-simulateurs-v2' » (stratégie `ort`, propre, aucun conflit) |
| `origin/main` (production) | **`fdb0580`** |
| `origin/credit-simulateurs-v2` | `9465b85` |
| Sitemap post-merge | régénéré → **inchangé** (aucun commit doc supplémentaire) |
| `index.html` | ✅ **hors commit** (modification locale préexistante, conservée `M`) |

Staging fichier par fichier (jamais `git add .` / `-A`). Merge réalisé sans éditeur (`--no-edit`).

## 2. Fichiers commités (9)

```
assets/js/simulators/prototype-endettement.js
simulateurs/taux-endettement.html
tests/simulators/cs6-endettement.test.js
docs/CS-6A-AUDIT-TAUX-ENDETTEMENT.md
docs/CS-6B-TAUX-ENDETTEMENT.md
docs/CS-6C-PUBLICATION-TAUX-ENDETTEMENT.md
scripts/nav-pages.json
scripts/breadcrumb-pages.json
sitemap.xml
```

## 3. Vercel

| Élément | Valeur |
|---|---|
| Projet | `proactifs-conseils` (`prj_UV1ePWwfHptsIludIC2VSmLw9l3n`) |
| Déploiement production | `dpl_Ek1FzMYExbKN5VTRUwK4v9U6FB7H` |
| Commit déployé | `fdb0580` (main) |
| État | **READY** · target **production** |

## 4. Tests avant commit (tous verts)

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ **257/257** |
| `node --test tests/generate-sitemap.test.js` | ✅ 4/4 |
| `node scripts/build-header.js --check` | ✅ exit 0 |
| `node scripts/build-breadcrumbs.js --check` | ✅ 51/51 |
| `node scripts/check-mobile-nav.js` | ✅ 67 pages |
| `node scripts/generate-sitemap.js` | ✅ 53 URLs (1 exclue = redirigée) |

## 5. QA production — page

Testé sur **https://proactifsconseils.fr/simulateurs/taux-endettement** :

| Vérif | Résultat |
|---|---|
| HTTP | **200** |
| robots | **index, follow** |
| canonical | `https://proactifsconseils.fr/simulateurs/taux-endettement` |
| noindex résiduel | **0** |
| H1 | « Calculez votre taux d'endettement » |
| Breadcrumb | Accueil (lien) › **Simulateurs (non cliquable)** › Taux d'endettement |
| Header global | présent (Patrimoine, Immobilier, Simulateurs, Le cabinet, Ressources) |
| FAQ | présente (« Questions fréquentes ») |

## 6. QA production — calculs (en direct, JS exécuté)

| Scénario | Saisie | Attendu | Obtenu |
|---|---|---|---|
| A | 4 200 € · crédit 900 € · nouvelle mens. 510 € | 33,6 % · sous le repère | ✅ **33,6 %** · sous |
| B | 4 500 € · charges 1 700 € | 37,8 % · dépasse | ✅ **37,8 %** · dépasse |
| C | 10 000 € · charges 3 490 € | 34,9 % · autour | ✅ **34,9 %** · autour |
| 0 | 3 000 € · charges 0 € | 0,0 % | ✅ **0,0 %** · sous · **aucun NaN** |

Aucune erreur JS, aucun `NaN` sur aucun scénario.

## 7. QA production — policy 35 % / locatif 70 %

- « Repère utilisé pour cette simulation : **35 %** » affiché — **jamais** « seuil légal », « limite bancaire » ni « critère d'acceptation » (uniquement en dénégation dans le contenu).
- Revenus locatifs saisis → avertissement live : **« Hypothèse de simulation : 70 % des revenus locatifs sont retenus. »** (ex. 3 000 € + locatif 1 000 € → revenus retenus 3 700 €, taux 24,3 %).
- `MAX_DEBT_RATIO` et `RENTAL_RETENTION` lus depuis `POLICY` dans l'adaptateur servi en production (vérifié).

## 8. QA production — lead

- Page référence **`/api/subscribe`** (2 occurrences) ; adaptateur production : `service: 'credit'`, `source: 'simulateur_taux_endettement'`.
- Aucune donnée financière dans le payload. **Aucun faux prospect envoyé** (test bout-en-bout laissé à Medy avec une adresse de test).

## 9. QA production — analytics

- `simulator_type = 'debt_ratio'`.
- `simulation_result` = **`{ bucket: res.bucket }`** uniquement (below/around/above_reference). Aucun revenu, charge, mensualité, ratio exact ni PII.

## 10. QA production — sitemap

**https://proactifsconseils.fr/sitemap.xml** (HTTP 200) :

- `/simulateurs/capacite-emprunt` ✅ présent
- `/simulateurs/mensualite-credit` ✅ présent
- `/simulateurs/taux-endettement` ✅ **présent**
- `/simulation-pret-immobilier` ✅ **absent**

## 11. QA production — responsive

Largeurs **1440 / 390 / 320** : aucun débordement horizontal, `XX,X %` sur une ligne, CTA utilisable, breadcrumb correct, panneau résultat compact.

## 12. QA production — anciennes pages (aucune régression)

| URL | Résultat |
|---|---|
| `/simulateurs/capacite-emprunt` | **200** |
| `/simulateurs/mensualite-credit` | **200** |
| `/simulation-pret-immobilier` | **308 → /simulateurs/capacite-emprunt → 200** (pas de boucle) |

## 13. Fichiers gelés — vérifiés

Aucune modification des moteurs / socle : `core.js`, `calc-credit.js`, `calc-immo.js`, `rates.js`, `credit-policy.js`, `ui.js`, `lead.js`. `calculateDebtRatio` inchangé. Adaptateur CS-6B inchangé (agrégation, tolérance ±0,2, textes, payload, analytics, exemples, design, SEO, CTA). `index.html`, home `#simulateurs`, hub `/simulateurs`, `pret-immobilier-index`, `courtage-credit-immobilier`, capacité, mensualité, API, Supabase/Brevo/Systeme.io : non touchés.

## 14. État git final

```
origin/main (production) : fdb0580   Merge branch 'credit-simulateurs-v2'
                            9465b85   CS-6 : publier le simulateur taux d'endettement
origin/credit-simulateurs-v2 : 9465b85
index.html : hors commit (modif locale préexistante)
```

> Ce rapport (`docs/CS-6D-PRODUCTION-QA.md`) est laissé **non commité** volontairement, pour éviter une boucle de commit/déploiement uniquement documentaire (cf. cadrage §16). Il pourra être intégré à un prochain commit groupé.

## 15. Anomalies

Aucune. Publication conforme, indexable, calculs et neutralité validés en production.

## 16. Non démarré (conforme au cadrage)

CS-7 (hub `/simulateurs`) — non commencé. Home `#simulateurs`, menu Simulateurs, lien header : inchangés.

*Fin CS-6D. Simulateur taux d'endettement en production et vérifié. En attente de validation ChatGPT.*
