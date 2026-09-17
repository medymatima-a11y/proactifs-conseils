# CS-0.5 — Validation avant développement (SEO · Formules · Migrations · Architecture)

**Site :** proactifsconseils.fr · **Date :** 17/09/2026 · **Branche :** `menu-1.5-centralisation-header`
**Source :** `docs/CREDIT-SIMULATEURS-V2.md` (CREDIT-SIM-0).
**Nature :** AUDIT & DÉCISION uniquement. 0 page / CSS / JS / formule / API / redirect / URL / sitemap / header / manifeste modifié. Aucun développement.

---

## 1. Synthèse exécutive

Le socle technique nécessaire à CS-1 est en place et compris : moteur de capacité fonctionnel (formule d'annuité + règle 35 %), pipeline lead `/api/subscribe` → Supabase `leads` (champ `source` disponible), tracking GA4/Ads. Trois points doivent être arbitrés **avant** de coder :
1. **`pret-immobilier-index`** est servi à la fois comme **landing de sous-domaine** (`pret-immobilier.proactifsconseils.fr`, via rewrite `vercel.json`) **et** indexé sur le domaine principal (sitemap, `index,follow`, canonical → sous-domaine) → **doublon/cannibalisation** avec `courtage-credit-immobilier`.
2. La **migration d'URL** du simulateur (`/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt`) est faisable proprement via `vercel.json` (301) mais touche plusieurs points (canonical, sitemap, JSON-LD, liens, GA4/Ads, agent SEO).
3. Les **règles financières** (barème de taux, 35 %, assurance, revenus locatifs, frais de notaire) sont soit codées **sans source/date**, soit **absentes** → validation métier requise avant CS-4+.

## 2. Décision recommandée — `pret-immobilier-index`

- **Constat technique** : `vercel.json` fait `rewrite` `host=pret-immobilier.proactifsconseils.fr` `/` → `/pret-immobilier-index.html`. La page a `canonical` → `https://pret-immobilier.proactifsconseils.fr/` (cohérent pour le sous-domaine) **mais** est aussi listée au **sitemap principal** `https://proactifsconseils.fr/pret-immobilier-index` en `index,follow`, et 0 lien interne. Intention quasi identique à `courtage-credit-immobilier` (courtier crédit/prêt immobilier 92/IDF).

**Matrice de scénarios :**

| Scénario | Avantages | Risques |
|---|---|---|
| **CONSERVER** (statu quo) | Aucun travail | Cannibalisation persistante ; signal sitemap/canonical contradictoire |
| **REPOSITIONNER** (sous-domaine = campagne dédiée, dé-indexer la version domaine principal) | Garde une landing ads distincte | Complexité multi-host ; maintien de 2 pages proches |
| **FUSIONNER** (rapatrier le meilleur contenu dans `/credit` ou courtage) | 1 seule page forte | Effort éditorial ; perte du sous-domaine |
| **REDIRIGER** ✅ (301 de la version domaine principal → `/courtage-credit-immobilier`, arbitrer le sous-domaine à part) | Consolide le signal SEO vers la page maillée (52 entrants) ; supprime la cannibalisation | Nécessite décision sur le sort du sous-domaine (ads ?) |

**Recommandation** : **REDIRIGER** `proactifsconseils.fr/pret-immobilier-index` → `/courtage-credit-immobilier` (301) + retrait du sitemap principal. Sort du **sous-domaine** `pret-immobilier.proactifsconseils.fr` à trancher séparément (le garder s'il sert à des campagnes payantes, avec son propre canonical ; sinon le retirer). **Aucune 301 effectuée ici.**

## 3. État GSC / GA4

**Données GSC / GA4 non tirées dans cet audit documentaire** — aucun chiffre inventé. Éléments d'infrastructure présents : GA4 `G-P53RQGXJZX` + Google Ads `AW-835423035` (repo) ; proxy Search Console `api/sc.js` (nécessite `GOOGLE_OAUTH_REFRESH_TOKEN` côté Vercel). Un tirage live GSC (impressions/clics/CTR/position/requêtes) et GA4 (sessions/événements/leads) peut être fait en étape séparée si souhaité ; il n'a pas été réalisé ici.

## 4. Séparation `/credit` vs `/courtage-credit-immobilier`

- **`/courtage-credit-immobilier`** = page **SERVICE** transactionnelle (le courtier, l'accompagnement, la recherche de financement, FAQ Service+FAQPage). Reste la page commerciale principale (52 entrants, dans le méga-menu Immobilier).
- **`/credit`** = **HUB** éditorial/navigationnel « Crédit & Financement » : présente l'univers, relie les sous-pages (courtage, prêt relais, invest locatif, hypothécaire, in fine, assurance emprunteur) et les outils.
- **Séparation sémantique** pour éviter la cannibalisation : le hub cible des requêtes larges/informationnelles (« crédit immobilier », « financement projet ») et ne duplique PAS le contenu service ; il **renvoie** vers courtage pour l'intention transactionnelle « courtier ».
- Recommandé pour `/credit` : **H1** « Crédit & financement de vos projets » ; **intention** : hub d'orientation ; **rôle funnel** : haut/milieu (découverte → oriente vers service/outils) ; **sections H2** : Financer votre projet · Financements patrimoniaux · Nos outils (simulateurs) · Pourquoi Proactifs ; **pages enfants** : cf. §23 ; **CTA principal** : « Étudier mon financement » → `/bilan-patrimonial` (ou formulaire dédié). *(Pas de rédaction complète ici.)*

## 5. Décision URL — simulateur capacité

Migration cible : `/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt`.
**Verdict : GO SOUS CONDITIONS.** Conditions : opérer en **une seule livraison atomique** (rewrite + 301 + canonical + sitemap + liens + JSON-LD/OG + GA4/Ads + agent SEO), corriger les typos title/H1 **au même moment**, et vérifier que l'agent SEO ne réécrit pas l'ancienne URL. Alternative acceptable si on veut minimiser le risque : **conserver l'URL actuelle** et la référencer depuis le hub (`/simulateurs`) — moins optimal sémantiquement mais zéro risque de redirection.

## 6. Plan de migration 301 (le jour J — non exécuté)

| Élément | Action |
|---|---|
| `vercel.json` | Ajouter `rewrite` `/simulateurs/capacite-emprunt` → fichier, **+ `redirect 301`** `/simulation-pret-immobilier` → `/simulateurs/capacite-emprunt` |
| Fichier | Créer `simulateurs/capacite-emprunt.html` (ou déplacer le contenu) |
| Canonical | Mettre à jour vers la nouvelle URL |
| Sitemap | Remplacer l'ancienne entrée par la nouvelle |
| Liens internes | Mettre à jour le lien depuis `courtage-credit-immobilier` (1 entrant) + tout futur hub |
| Breadcrumb / JSON-LD | Mettre à jour `url`/`item` (WebApplication + BreadcrumbList) |
| OG | `og:url` |
| `nav-pages.json` | Ajouter la nouvelle page (header centralisé) |
| Header | Éventuel token actif Simulateurs |
| CTA | Vérifier CTA internes pointant vers l'ancienne URL |
| GA4 / Google Ads | Vérifier les vues/conversions liées à l'URL ; recréer si suivi par page |
| Agent SEO | S'assurer qu'il ne régénère pas l'ancienne URL / ne réintroduit pas la page |
| Documentation | Consigner la migration |

**Risques** : perte de jus si 301 oubliée ; double contenu transitoire ; conversions Ads liées à l'ancienne URL ; agent SEO recréant l'ancien fichier. **Aucune migration effectuée.**

## 7. Formule actuelle détaillée (`wzCompute`, inchangée)

```
revenus = revenu1 + revenu2
mensMax = max(0, revenus × 0.35 − credits)          // A. mathématique  /  B. hypothèse métier 35 %
taux    = wzTaux(duree)                               // C. barème (voir §9)
tm      = taux / 100 / 12
nbMois  = duree × 12
facteur = (1 − (1 + tm)^(−nbMois)) / tm               // A. annuité (actualisation)
capacite = round(mensMax × facteur)
budget  = capacite + apport
```
- **A. Mathématique** : annuité classique (facteur d'actualisation) — correcte.
- **B. Hypothèses métier** : taux d'endettement **35 %** en dur ; addition simple des revenus des 2 emprunteurs ; crédits soustraits en euros de la mensualité max ; apport ajouté au capital pour donner le « budget ».
- **C. Barèmes** : `wzTaux` en dur (§9).
- **D. Données manquantes** : assurance (absente), charges hors crédits, pensions, revenus locatifs, « reste à vivre », taux différencié par profil.

## 8. Tableau des variables

| Variable | Champ | Utilisée ? | Comment | Manque / impact |
|---|---|---|---|---|
| Revenus nets | `wz-revenu` | ✅ | `revenu1` dans `revenus` | — |
| Co-emprunteur | `wz-revenu2` | ✅ | addition simple `revenu2` | pas de pondération |
| Revenus locatifs | — | ❌ | absent | à construire (pondération ~70 % à valider) |
| Autres revenus / pensions | — | ❌ | absent | à construire |
| Crédits existants | `wz-credits` | ✅ | `mensMax = revenus×0.35 − credits` | — |
| Loyer actuel | `wz-loyer` | ⚠️ **collecté, NON calculé** | seulement transmis dans le lead | ignoré du calcul (normal : disparaît après achat) |
| Charges (hors crédits) | — | ❌ | absent | impact « reste à vivre » |
| Apport | `wz-apport` | ✅ | `budget = capacite + apport` | — |
| Durée | `wz-duree` | ✅ | taux + nbMois | — |
| Taux | (auto) | ✅ | `wzTaux(duree)` | non saisissable ; barème figé |
| Assurance | — | ❌ | absent | non intégrée (§13) |

## 9. Barème `wzTaux(duree)` actuel

| Durée | Taux codé |
|---|---|
| ≤ 10 ans | 3,10 % |
| ≤ 15 ans | 3,30 % |
| ≤ 20 ans | 3,45 % |
| > 20 ans | 3,60 % |

**Valeurs en dur, sans source ni date dans le code.** → à qualifier de **barème technique actuel**, PAS de taux de marché validé. Aucun mécanisme de mise à jour. **Décision requise** : source + date + процédure d'actualisation (idéalement un module de barème daté/versionné, cf. §17).

## 10. Limites métier du moteur actuel

- Taux d'endettement fixe **35 %** sans exceptions (pas de saut d'endettement, pas de « reste à vivre », pas de règle HCSF détaillée).
- Pas de revenus locatifs / autres revenus / pensions.
- Pas d'assurance emprunteur.
- Taux non différencié par profil/apport, non saisissable.
- Addition brute des revenus (pas de quotient familial ni pondération).
Tout ceci **à arbitrer avant CS-4** (capacité) et CS-6 (endettement).

## 11. Règle des 35 %

- **Dans le code** : `revenus × 0.35 − credits` (mensualité max).
- **À valider (métier)** : 35 % assurance comprise (norme HCSF) — or le moteur **n'intègre pas l'assurance**, donc le 35 % porte ici sur la mensualité **hors assurance** → potentiel écart optimiste. À arbitrer.
- **Exceptions non gérées** : dérogations HCSF (20 % des dossiers), primo-accédants, reste à vivre, saut de charge. **Ne rien coder avant arbitrage.**

## 12. Revenus locatifs

Le moteur **ne traite pas** les revenus locatifs (aucun champ, aucune pondération). `wz-loyer` = **loyer payé** (charge actuelle, ignorée du calcul), à **ne pas confondre** avec des loyers perçus. → **fonctionnalité à construire** (avec règle de pondération à valider métier — typiquement ~70 %, **non figée ici**).

## 13. Assurance emprunteur

**Non intégrée** : ni dans `mensMax`, ni dans la mensualité, ni dans la capacité, ni dans un coût total (le moteur ne calcule pas de coût total). → manque à combler pour la mensualité (CS-5) et pour un 35 % « assurance comprise ». **Aucun taux d'assurance choisi ici.**

## 14. Spécification mensualité (`/simulateurs/mensualite-credit`)

Entrées : capital, durée, taux, assurance. Sorties : mensualité hors assurance, assurance, mensualité totale, intérêts, coût total.

| Élément | Statut |
|---|---|
| Facteur d'annuité `(1−(1+tm)^−n)/tm` | **RÉUTILISABLE** (présent dans wzCompute) |
| Mensualité = capital / facteur | À ADAPTER (inverse de la capacité) |
| Intérêts = (mensualité×nbMois) − capital | À CRÉER |
| Assurance (capital × taux_assurance / 12, ou sur CRD) | À CRÉER (taux à valider) |
| Coût total = intérêts + assurance (+ frais éventuels) | À CRÉER |

## 15. Spécification taux d'endettement (`/simulateurs/taux-endettement`)

Entrées possibles : revenus, co-emprunteur, autres revenus, charges, crédits existants, nouvelle mensualité. Sorties : endettement avant projet, endettement après projet, reste à vivre indicatif.
**Décisions nécessaires (non figées)** : quels revenus retenus et pondérations (locatif) ; définition du « reste à vivre » ; assurance comprise ou non ; seuil d'alerte (35 %) affiché comme indicatif ou bloquant.

## 16. Spécification frais de notaire (`/simulateurs/frais-notaire`)

Variables nécessaires : prix, **ancien/neuf** (droits de mutation pleins vs réduits), **département** (taux départemental des droits de mutation variable), nature (résidentiel), éventuellement montant du mobilier déductible. Composantes : droits de mutation + émoluments de notaire (barème dégressif par tranches) + débours + contribution de sécurité immobilière.
→ **nécessite une table de barème externe, datée et mise à jour périodiquement** (taux départementaux + barème émoluments). **Aucun taux inventé, aucun calcul codé ici.**

## 17. Architecture du moteur (validée / précisée)

Structure proposée **validée**, avec précisions :
```
assets/js/simulators/
  core.js        # parsing, validation, formatage € (fr-FR), helpers DOM-agnostiques
  rates.js       # BARÈMES DATÉS/VERSIONNÉS (taux par durée, taux assurance, barèmes notaire) — { version, date, source }
  calc-credit.js # fonctions PURES : annuite(), capacite(), mensualite(), endettement() — sans DOM
  calc-immo.js   # fonctions pures : fraisNotaire(), rendementLocatif()
  lead.js        # soumission -> /api/subscribe + events GA4 (aucune PII vers GA4)
  ui.js          # liaison DOM/wizard (seul module qui touche le DOM)
assets/css/simulators/simulators.css
```
Principes : **calcul 100 % pur et testable hors DOM** ; barèmes **isolés et versionnés** (auditables, mis à jour sans toucher aux formules) ; validation centralisée ; formatage centralisé ; tracking et soumission isolés dans `lead.js`. La formule inline actuelle devient la base testée de `calc-credit.js`.

## 18. Matrice de tests (à écrire en CS-1, non codée)

| Fonction | Entrée | Attendu / propriété | Type |
|---|---|---|---|
| annuite(taux,n) | taux>0 | facteur > 0 ; croît avec n | normal |
| annuite | taux=0 | **cas limite** : fallback linéaire (n mois) — à définir | limite |
| capacite | revenus=0 | 0 | limite |
| capacite | credits ≥ revenus×0.35 | mensMax=0 → capacité=0 | limite |
| capacite | apport>0 | budget = capacité + apport | normal |
| mensualite | capital,n,taux | mensualite × n ≥ capital | normal |
| mensualite | taux=0 | capital/n | limite |
| endettement | charges>revenus | >100 % géré proprement | limite |
| * | valeurs négatives / NaN / vides | rejet / 0, jamais NaN affiché | erreur |
| formatage | 1234567 | « 1 234 567 € » (fr-FR) | normal |
| arrondis | résultats | arrondi cohérent (€ entier) | normal |

## 19. Pipeline lead

Envoi actuel du simulateur : `POST /api/subscribe` avec
`{ prenom, nom:'', email, tel, situation, service:'credit', answers:[…texte…] }` (answers = projet, situation, revenus/co-emprunteur, charges crédits+loyer, apport+durée, avancement, **capacité estimée + mensualité max + taux**).
Schéma API `/api/subscribe` (Supabase `leads`) expose notamment : `email, prenom, nom, telephone, source`. → **le champ `source` permet déjà** un tag structuré. À **ajouter demain** (sans le faire maintenant) : `source_simulateur`, `type_simulation`, `resultat`, `duree`, `apport` en **champs structurés** plutôt qu'en texte libre. **À NE PAS transmettre** : pas plus de PII que nécessaire ; éviter de dupliquer des données sensibles ; ne jamais envoyer ces montants/PII vers GA4 (cf. §20).

## 20. Plan tracking

**Existant** : `generate_lead`, `conversion`, `ads_conversion_Formulaire_1` (GA4 `G-P53RQGXJZX` + Ads `AW-835423035`).

| Event (travail) | Déclencheur | Paramètres utiles (non-PII) | Objectif |
|---|---|---|---|
| `simulation_started` | ouverture/1er champ du wizard | `simulator: 'capacite'` | taux d'entrée |
| `simulation_completed` | étape résultat atteinte | `simulator`, `duree` | complétion |
| `simulation_result` | affichage résultat | `simulator`, tranche de capacité (buckets, pas montant exact) | qualification |
| `financing_cta_clicked` | clic CTA « Étudier mon financement » | `simulator`, `cta_location` | intention |
| `financing_lead_submitted` | soumission formulaire OK | `simulator` (+ mappe `generate_lead`) | conversion |

Règle : **aucune donnée personnelle** (email/tel/montant précis) dans GA4 — uniquement des tranches/labels. Non implémenté.

## 21. Brief `/simulateurs` (hub)

**H1** : « Simulateurs & outils Proactifs ». **title** (indicatif) : « Simulateurs crédit & patrimoine | Proactifs Conseils ». **Intention** : hub transversal, acquisition de leads. **H2** : Crédit (capacité, mensualité, taux d'endettement) · Immobilier (frais de notaire, rendement locatif) · Patrimoine (à venir). **CTA** : « Voir tous les simulateurs » / « Étudier mon financement ». **Maillage** : lié depuis le header (remplace l'ancre `/#simulateurs`), depuis `/credit`, depuis courtage et les pages immobilier ; chaque simulateur renvoie au hub (breadcrumb). Remplace l'actuelle ancre `#simulateurs` de l'accueil.

## 22. Futur méga-menu Simulateurs (hypothèse, non implémenté)

SIMULATEURS → **Crédit** (Capacité d'emprunt · Mensualité · Taux d'endettement · Prêt relais) · **Immobilier** (Frais de notaire · Rendement locatif) · **Patrimoine** (à venir). CTA « Voir tous les simulateurs ». À n'ajouter au header que quand assez de destinations existent (cf. CS-8).

## 23. Futur méga-menu Crédit (hypothèse, non implémenté)

CRÉDIT → **Financer votre projet** (Courtier crédit immobilier `/courtage-credit-immobilier` · Prêt relais · Financement invest. locatif) · **Financements patrimoniaux** (Prêt hypothécaire · Prêt in fine · Assurance emprunteur) · **Outils** (Capacité d'emprunt · Mensualités · Taux d'endettement). CTA « Étudier mon financement ». Ne lier que des pages existantes le jour du build.

## 24. Risques SEO

- Cannibalisation courtage ↔ pret-immobilier-index (+ signal sitemap/canonical contradictoire) — §2.
- Migration d'URL du simulateur sans 301 propre — §6.
- Nouveaux doublons /credit vs courtage vs univers Immobilier si le hub duplique le service — §4.
- Typos indexées : `<title>Simulation Prêt Immobilier **e** …</title>` et H1 « Simulation de … immobilièr**e** » (à corriger lors de la migration, §8/§26).

## 25. Risques métier

- Barème de taux **sans source/date** présenté comme réel — §9.
- 35 % **hors assurance** → capacité potentiellement optimiste — §11/§13.
- Absence de reste à vivre, revenus locatifs, dérogations — §10/§12/§15.
- Frais de notaire : barème externe obligatoire, sinon résultat faux — §16.
Tous ces points relèvent d'informations financières sensibles pour l'utilisateur → **validation métier obligatoire** avant mise en ligne d'un calcul.

## 26. Risques techniques

- Extraction du JS inline vers modules partagés sans régression (wizard, tracking) → tests §18.
- `vercel.json` = point unique des rewrites/redirects : toute nouvelle URL/301 passe par lui (risque de conflit avec `cleanUrls`/`trailingSlash`).
- Agent SEO susceptible de recréer/écraser des pages ou anciennes URLs.
- Header à 6 entrées : largeur desktop ≤ 1024 px (CS-8).
- Commit depuis le dossier monté : verrous git résiduels (`.git/*.lock`) — nettoyage côté Windows.

---

## DÉCISIONS BLOQUANTES AVANT CS-1 (Fondations)

1. **Structure moteur** : valider `assets/js/simulators/` avec barèmes **versionnés/datés** séparés des formules (§17).
2. **URL capacité** : GO migration `/simulateurs/capacite-emprunt` (avec 301) **ou** conserver l'URL actuelle (§5/§6).
3. **Périmètre CS-1** : extraire/tester la formule capacité existante **sans changer les résultats** (règle 35 % et barème conservés tels quels tant qu'ils ne sont pas validés).
4. **Plan d'événements GA4** : valider les noms/params (§20) — implémentation en CS-9.

## DÉCISIONS BLOQUANTES AVANT CS-4 (Capacité) et suivants

1. **Barème de taux** : source + date + fréquence d'actualisation (sinon afficher un avertissement « barème indicatif ») — §9.
2. **Règle 35 %** : assurance comprise ou non ; gestion (ou non) des dérogations et du reste à vivre — §11.
3. **Revenus locatifs / autres revenus** : intégrer ? avec quelle pondération ? — §12.
4. **Assurance emprunteur** : l'intégrer à la mensualité/capacité ? quel taux par défaut, saisissable ? — §13.
5. **Frais de notaire** (avant CS-7) : table de barème (droits départementaux + émoluments) + source + mise à jour — §16.
6. **Sort de `pret-immobilier-index` et du sous-domaine** (avant CS-2 Hub Crédit) — §2.
7. **Mentions légales / avertissement** : tout résultat = estimation indicative non contractuelle (à cadrer avec le métier).

---

**Audit figé.** 0 page / CSS / JS / formule / API / redirect / URL / sitemap / header / manifeste modifié. Attendre validation avant CS-1.
