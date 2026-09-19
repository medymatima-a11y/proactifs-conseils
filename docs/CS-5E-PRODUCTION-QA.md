# CS-5E — Merge production + QA post-déploiement

**Projet :** Proactifs Conseils — Simulateurs V2
**Phase :** CS-5E — mise en production (merge main) + QA. Aucun nouveau développement.
**Date :** 19 septembre 2026
**Statut :** ✅ déployé en production · QA effectuée · **2 anomalies constatées (non corrigées, hors périmètre CS-5E)**

---

## 1. Contexte git

| Élément | Valeur |
|---|---|
| Branche source | `credit-simulateurs-v2` |
| Commit validé fusionné | `856d5c3` — *CS-5C/5D : architecture simulateurs et publication mensualite* |
| SHA `main` avant | `acbffcd` — CS-4C.1 merge |
| SHA `main` après (tip) | `5b4f326` — inclut le merge CS-5E de `856d5c3` **+** un commit automatique *« régénération automatique du sitemap [skip ci] »* |
| `856d5c3` intégré à main ? | ✅ oui (ancêtre de `origin/main`) |
| `index.html` | ✅ **non inclus** dans le merge (resté en modification locale hors périmètre) |

## 2. Méthode de merge

- Merge réalisé côté PowerShell (le sandbox n'a pas les identifiants GitHub) :
  `git checkout main` → `git merge credit-simulateurs-v2 -m "CS-5E : merge production simulateurs (CS-5C/5D/5D.1)"` → `git push origin main` → `git checkout credit-simulateurs-v2`.
- **Aucun conflit** (vérifié au préalable par merge-tree : `sitemap.xml` auto-fusionné, seul fichier « changed in both »).
- Incident opérationnel : un `.git/index.lock` résiduel (issu d'opérations git côté sandbox) a bloqué une première tentative ; résolu en écartant le lock, puis merge propre. Les 2 stashes préexistants de Medy (`WIP on main`) n'ont pas été touchés.
- Un **hook post-merge** a régénéré `sitemap.xml` et créé le commit `5b4f326` — voir anomalie §11.

## 3. Déploiement Vercel

- Déclenché automatiquement par le push sur `main` (projet git-connecté, `main` = production).
- Aucune configuration Vercel modifiée. Aucune nouvelle URL créée manuellement.

## 4. Tests avant merge

| Contrôle | Résultat |
|---|---|
| `node --test tests/simulators/*.test.js` | ✅ 221/221 |
| `build-header.js --check` | ✅ à jour |
| `build-breadcrumbs.js --check` | ✅ 50/50, 0 anomalie |
| `check-mobile-nav.js` | ✅ 66 pages, aucune régression |

## 5. QA production — Mensualité

URL : **https://proactifsconseils.fr/simulateurs/mensualite-credit**

| Contrôle | Observé |
|---|---|
| HTTP | **200** ✅ |
| `meta robots` | **index, follow** ✅ |
| noindex résiduel | **0** ✅ |
| canonical | `https://proactifsconseils.fr/simulateurs/mensualite-credit` ✅ |
| title | « Simulateur de mensualité de crédit immobilier \| Proactifs » ✅ |
| H1 | « Calculez la mensualité de votre crédit immobilier » ✅ |
| header central | présent (Patrimoine · Immobilier · Simulateurs · Le cabinet · Ressources · CTA) ✅ |
| breadcrumb | `Accueil` (lien) › `Simulateurs` (**span non cliquable**) › `Mensualité de crédit` ✅ — aucun lien mort vers `/simulateurs` |
| footer | présent ✅ |

**Scénarios (rendus live sur l'URL production) :**

| Scénario | Attendu | Observé prod |
|---|---|---|
| A — 250 000 € / 20 ans / taux Proactifs / assurance inconnue | 1 450 €/mois ; capital 250 000 ; intérêts ≈ 98 000 ; total ≈ 348 000 | ✅ **1 450 €** ; 250 000 € ; 98 000 € ; 348 000 € |
| B — 300 000 € / 20 ans / 4,10 % / assurance 38 € | 1 872 €/mois | ✅ **1 872 €** |

Responsive : aucun débordement horizontal à 390 px (mobile) ✅.

## 6. QA production — Redirection legacy

URL testée : **https://proactifsconseils.fr/simulation-pret-immobilier**

| Contrôle | Observé |
|---|---|
| Code HTTP | **308** (Permanent Redirect) |
| Destination | `https://proactifsconseils.fr/simulateurs/capacite-emprunt` ✅ |
| Boucle | aucune ✅ |
| Destination finale | HTTP **200** ✅ |

⚠️ **Nuance 301 vs 308 :** Vercel émet un **308** pour `"permanent": true` (et non un 301). Le 308 est une redirection **permanente**, traitée par Google et Bing comme équivalente au 301 pour la consolidation/indexation (différence : le 308 préserve la méthode HTTP). La cible et la permanence demandées sont donc respectées ; seul le code numérique diffère de « 301 ». Un 301 littéral n'est pas produisible via `vercel.json` `redirects` (permanent → 308, temporaire → 307) — il faudrait un autre mécanisme si un 301 strict est exigé.

## 7. QA production — Lead

- `POST /api/subscribe` présent dans la page ✅
- Transport **mock absent** (0 occurrence de « mock ») ✅
- Payload et gestion succès/erreur : conformes (inchangés depuis CS-5D.1).

**Test bout-en-bout réel :** **NON effectué** (pas de faux prospect envoyé en production, conformément au brief §7). À réaliser manuellement par Medy avec une adresse de test contrôlée par Proactifs pour confirmer l'arrivée du lead (Supabase/Brevo/Systeme.io).

## 8. QA production — Sitemap

URL : **https://proactifsconseils.fr/sitemap.xml** (HTTP 200)

| Entrée | Attendu | Observé |
|---|---|---|
| `/simulateurs/mensualite-credit` | présent | ✅ **présent** |
| `/simulateurs/capacite-emprunt` | présent | ✅ présent |
| `/simulation-pret-immobilier` | **absent** | ❌ **ENCORE PRÉSENT** — voir anomalie §11 |

## 9. Tests / QA — récapitulatif

- Tests unitaires simulateurs : 221/221 ✅
- QA HTTP/SEO production : mensualité 200 + index + canonical ✅
- QA fonctionnelle live A/B : ✅ (1 450 € / 1 872 €)
- QA responsive : ✅ (pas d'overflow)
- Redirection : permanente 308 vers capacité, sans boucle ✅ (code 308, pas 301)
- Sitemap : mensualité ajoutée ✅, mais simulation-pret non retiré ❌

## 10. Éléments non touchés (conforme au cadrage)

- `index.html` : hors merge (modification locale préservée).
- Home `#simulateurs` (3 calculateurs inline legacy) : non touchée.
- `pret-immobilier-index.html` + sous-domaine `pret-immobilier.proactifsconseils.fr` : non touchés.
- Hub `/simulateurs` : non créé.
- CS-6 / taux-endettement : non commencé.
- Moteurs / taux / policy / `ACTIVE_MARKET_REFERENCE` : intacts.
- Header / navigation / API / config Vercel : non modifiés au-delà du contenu déjà validé.

## 11. Problèmes constatés (NON corrigés — hors périmètre CS-5E)

### 🔴 A. Sitemap — `/simulation-pret-immobilier` réintroduit
Le hook de **régénération automatique** du sitemap (`scripts/generate-sitemap.js`, commit `5b4f326`) reconstruit `sitemap.xml` à partir des pages présentes sur le disque. Comme le fichier legacy `simulation-pret-immobilier.html` a été **conservé** (décision CS-5D : ne pas supprimer, la 308 prime), le générateur a **re-listé son URL** — annulant le retrait fait manuellement en CS-5D. Résultat : une URL redirigée en 308 figure encore au sitemap (incohérence SEO mineure).
**Correctif recommandé (phase distincte, pas CS-5E) :** exclure les pages redirigées de `generate-sitemap.js` (liste d'exclusion / lecture des `redirects` de `vercel.json`), ou retirer/`410` le fichier legacy. À ne pas mélanger avec un correctif fonctionnel.

### 🟠 B. Code de redirection 308 au lieu de 301
Attendu « 301 » au brief ; Vercel émet **308** pour une redirection permanente. Fonctionnellement et SEO-équivalent au 301. **Décision requise :** accepter le 308 (recommandé, standard Vercel) ou exiger un 301 littéral (nécessiterait un autre mécanisme).

## 12. État git final

- `origin/main` = `5b4f326` (production, inclut `856d5c3` + régénération sitemap auto).
- `credit-simulateurs-v2` = `856d5c3` (inchangée).
- `index.html` : toujours en modification locale hors périmètre (non commité).
- Ce document `docs/CS-5E-PRODUCTION-QA.md` : créé en local, **non commité** (documentaire ; à commiter séparément si souhaité, sans le mélanger à un correctif).

---

*Fin CS-5E. Mise en production réussie ; 2 anomalies documentées à arbitrer (sitemap + 308). Aucun développement supplémentaire. À valider par ChatGPT.*
