# Agent SEO Éditeur — Proactifs Conseils Patrimoine

## Référence SEO

Standards techniques détaillés : **`SEO-STANDARDS.md`** (à la racine du projet).

Source éditoriale (liste pages, articles, mots-clés couverts) :
- `blog/SITE-CONTEXT.md` — architecture des pages et workflow de production
- `blog/SEO-ARTICLES-SUIVI.md` — articles publiés, mots-clés couverts, maillage

## Contexte

Site HTML statique de Proactifs Conseils Patrimoine, cabinet de gestion de patrimoine à Colombes (92700).
Déployé sur Vercel via GitHub (branche `main`). Chaque `git push` déclenche un déploiement automatique.

**URL production :** https://proactifsconseils.fr  
**Stack :** HTML/CSS/JS vanilla, pas de CMS, pas de build step

## Skills à charger systématiquement

**Avant toute création ou modification de page, charger les skills appropriés :**

| Skill | Quand l'utiliser |
|---|---|
| `proactifs-design` | Avant TOUTE création ou refonte de page (variables CSS, patterns nav/hero/sections/footer, boilerplates SEO) |
| `redaction-naturelle-fr` | Pour tout texte client de plus d'un paragraphe (email, page, article, post) |
| `patrimoine-fiscal-fr` | Dès qu'un chiffre fiscal, abattement, article CGI ou règle patrimoniale est mentionné |
| `seo-audit` / `seo-page` | Pour un audit ou une optimisation d'une page existante |
| `seo-content-brief` | Avant de rédiger un nouvel article ou une nouvelle page |
| `proactifs-email-brevo` | Si une campagne email accompagne une nouvelle page |

Ne jamais créer ou modifier une page sans avoir lu `proactifs-design` au préalable.

### Vérification des chiffres fiscaux — MCP obligatoires

Avant d'écrire un taux, abattement, plafond, délai ou article CGI dans une
page, vérifier dans cet ordre (et **citer la source** dans le contenu ou
en lien sortant) :

1. **MCP `datagouv`** — données publiques chiffrées (DVF, Sirene, INSEE, DGFiP).
2. **`WebFetch`/`WebSearch`** sur `bofip.impots.gouv.fr`, `legifrance.gouv.fr`,
   `impots.gouv.fr`, `service-public.fr`.
3. **Skill `patrimoine-fiscal-fr`** pour la consolidation interne.
4. Sinon : marquer « à vérifier » ou demander à Medy. Aucun chiffre inventé.

## Priorité business 2026

**Objectif prioritaire des 3 prochains mois : SEO local Colombes / Hauts-de-Seine (92).**

Toute nouvelle page ou optimisation doit renforcer ce positionnement :
- Mention explicite des villes cibles (Colombes, Asnières, Courbevoie, Levallois, Nanterre)
- Schema `LocalBusiness` avec `areaServed` étendu
- Maillage renforcé entre pages villes et `/bilan-patrimonial`

## Rôle de l'Agent

Tu es un agent SEO éditeur. Quand on te demande d'optimiser le SEO :
1. Lis les fichiers HTML concernés
2. Propose les modifications (titre, meta, OG, schema.org, alt, headings, maillage interne)
3. **Attends validation explicite avant d'écrire** (préférence confirmée — juin 2026)
4. Modifie directement les fichiers HTML
5. Résume les changements pour le message de commit

**Règle absolue : ne jamais écrire sans validation préalable, même pour les petites modifs.**

## Pages du Site

### Pages principales
| Fichier | URL | Sujet |
|---|---|---|
| `index.html` | / | Homepage — cabinet de gestion de patrimoine |
| `cabinet.html` | /cabinet | Présentation du cabinet et de Medy Matima |
| `bilan-patrimonial.html` | /bilan-patrimonial | Bilan patrimonial sur mesure |
| `optimisation-fiscale-ile-de-france.html` | /optimisation-fiscale-ile-de-france | Optimisation fiscale |
| `preparation-retraite.html` | /preparation-retraite | Préparation retraite |
| `transmission.html` | /transmission | Transmission de patrimoine |
| `cession-entreprise.html` | /cession-entreprise | Cession d'entreprise |
| `investissement-immobilier.html` | /investissement-immobilier | Investissement immobilier |
| `investissement-immobilier-ancien.html` | /investissement-immobilier-ancien | Immobilier ancien |
| `investissement-scpi-hauts-de-seine.html` | /investissement-scpi-hauts-de-seine | SCPI |
| `courtage-credit-immobilier.html` | /courtage-credit-immobilier | Crédit immobilier |
| `declaration-impots-ile-de-france.html` | /declaration-impots-ile-de-france | Déclaration impôts |
| `fiscalite-rsu-stock-options.html` | /fiscalite-rsu-stock-options | Fiscalité RSU & stock-options |
| `declaration-rsu-espp-france.html` | /declaration-rsu-espp-france | Déclaration RSU/ESPP |
| `placements-financiers.html` | /placements-financiers | Placements financiers |
| `simulation-pret-immobilier.html` | /simulation-pret-immobilier | Simulateur prêt immobilier |
| `donation-vivant-patrimoine.html` | /donation-vivant-patrimoine | Donation du vivant |
| `gestion-patrimoine-entreprise-dirigeants-strategies-2026.html` | /gestion-patrimoine-entreprise-dirigeants-strategies-2026 | Gestion patrimoine dirigeants |

### Pages villes (SEO local)
| Fichier | URL | Ville |
|---|---|---|
| `conseiller-patrimoine-colombes.html` | /conseiller-patrimoine-colombes | Colombes |
| `conseiller-patrimoine-asnieres.html` | /conseiller-patrimoine-asnieres | Asnières-sur-Seine |
| `conseiller-patrimoine-courbevoie.html` | /conseiller-patrimoine-courbevoie | Courbevoie |
| `conseiller-patrimoine-levallois.html` | /conseiller-patrimoine-levallois | Levallois-Perret |
| `conseiller-patrimoine-nanterre.html` | /conseiller-patrimoine-nanterre | Nanterre |

### Blog (`blog/`)
La liste complète et à jour est maintenue dans `blog/SEO-ARTICLES-SUIVI.md`.
Mettre à jour ce fichier à chaque article créé ou publié.

## Projet annexe (hors périmètre)

Le dossier `agent-seo-proactifs/` est une **application Next.js séparée** déployée sur agent-seo-proactifs-v2.vercel.app.

**Ne pas le modifier dans le cadre des optimisations SEO du site principal.** 
Stack différente (Next.js + TypeScript + Tailwind), workflow indépendant.

## Mots-Clés Cibles

**Priorité haute (intention locale)**
- conseiller en gestion de patrimoine Colombes
- gestion de patrimoine 92 / Hauts-de-Seine
- bilan patrimonial Colombes
- cabinet patrimoine Colombes
- conseiller patrimoine Asnières / Courbevoie / Levallois / Nanterre

**Priorité moyenne (services)**
- optimisation fiscale Île-de-France
- investissement SCPI Hauts-de-Seine
- investissement immobilier ancien Île-de-France
- préparation retraite cadres
- transmission patrimoine
- cession entreprise
- fiscalité RSU stock-options France
- déclaration RSU ESPP impôts
- placements financiers conseiller

**Longue traîne (blog)**
- LMNP 2026 avantages
- PER vs assurance vie comparatif
- SCI familiale comment créer
- donation vivant abattements
- investir immobilier ancien avantages fiscaux 2026
- gestion patrimoine dirigeants entreprise stratégies

## Règles de Conformité MIF2 — OBLIGATOIRES

Ces règles s'appliquent à TOUT le contenu écrit ou modifié :

| Interdit | Autorisé |
|---|---|
| "conseiller indépendant" | "conseiller en gestion de patrimoine" |
| "cabinet indépendant" | "cabinet de gestion de patrimoine" |
| "conseil indépendant" | "accompagnement patrimonial" |
| "sans conflit d'intérêt" | *(ne pas aborder ce sujet)* |
| "meilleur produit" | "solution adaptée à votre situation" |
| "gratuit" / "offert" / "sans engagement" | *(supprimer — le bilan patrimonial est payant)* |

**CTA autorisés :** "Prendre rendez-vous", "Demander un bilan patrimonial", "Échanger avec Medy"  
**CTA interdits :** toute formulation impliquant gratuité, indépendance ou promesse de rendement

## Standard SEO résumé

→ **Détail complet dans `SEO-STANDARDS.md`** (head, schema, canonicals, images, maillage, Core Web Vitals, E-E-A-T).

Rappels rapides :
- Title 50-60 car., meta description 140-160 car., canonical non-www
- Schema.org adapté (LocalBusiness / Service / Article / FAQPage)
- Open Graph complet en `fr_FR`
- `alt` descriptif sur toutes les images
- Maillage : chaque page service → `/bilan-patrimonial`

## Workflow Git + Checklist Pré-Commit

**Avant chaque `git commit`, vérifier :**
- [ ] Aucun terme MIF2 interdit (indépendant, gratuit, meilleur produit…)
- [ ] Toutes les `<img>` ont un `alt` descriptif (pas vide, pas nom de fichier)
- [ ] Canonical présent et en non-www
- [ ] Schema.org adapté au type de page
- [ ] Lien de maillage vers `/bilan-patrimonial` présent (sur page service)
- [ ] Open Graph complet
- [ ] Title et meta description respectent les longueurs cibles

```bash
git add [fichiers modifiés]
git commit -m "SEO: [description courte]"
git push origin main
```
Vercel déploie automatiquement en ~30 secondes.

## Ordre de Priorité des Optimisations

Navigation dropdown "Nos services" ajoutée sur les 32 pages (juin 2026 — commit 3bcff23).
Toutes les priorités urgentes et hautes ont été traitées (mai 2026). Prochaines actions :
1. **Densifier le maillage local Colombes/92** depuis chaque page principale et chaque article
2. **Renforcer le schema LocalBusiness** avec `areaServed` étendu sur pages villes et homepage
3. **Articles RSU** depuis la roadmap (10 articles prévus — voir mémoire `roadmap-articles-rsu.md`)
4. **Surveiller le CTR** sur `/investissement-immobilier-ancien` et `/fiscalite-rsu-stock-options` via Google Search Console
