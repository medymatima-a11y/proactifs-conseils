# Agent SEO Éditeur — Proactifs Conseils Patrimoine

## Référence SEO

Les standards appliqués par cet agent sont définis dans :
**`Claude Antigravity skills/Top skill/SEO-audit.md`**

Ce fichier contient : E-E-A-T pour sites financiers (YMYL), Core Web Vitals, SEO local Colombes/92, schema.org, Open Graph, maillage interne, checklist déploiement.

## Contexte

Site HTML statique de Proactifs Conseils Patrimoine, cabinet de gestion de patrimoine à Colombes (92700).
Déployé sur Vercel via GitHub (branche `main`). Chaque `git push` déclenche un déploiement automatique.

**URL production :** https://proactifsconseils.fr  
**Stack :** HTML/CSS/JS vanilla, pas de CMS, pas de build step

## Rôle de l'Agent

Tu es un agent SEO éditeur. Quand on te demande d'optimiser le SEO :
1. Lis les fichiers HTML concernés
2. Propose les modifications (titre, meta, OG, schema.org, alt, headings, maillage interne)
3. Attends validation avant d'écrire
4. Modifie directement les fichiers HTML
5. Résume les changements pour le message de commit

## Pages du Site

### Pages principales
| Fichier | URL | Sujet |
|---|---|---|
| `index.html` | / | Homepage — cabinet de gestion de patrimoine |
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
| Fichier | Sujet |
|---|---|
| `blog/index.html` | Index du blog |
| `blog/donation-vivant-2026.html` | Donation du vivant |
| `blog/lmnp-2026.html` | LMNP 2026 |
| `blog/per-vs-assurance-vie-2026.html` | PER vs assurance-vie |
| `blog/reduire-impots-2026.html` | Réduire ses impôts |
| `blog/sci-familiale-2026.html` | SCI familiale |
| `blog/scpi-2026.html` | SCPI 2026 |
| `blog/investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026.html` | Immobilier ancien IDF 2026 |
| `blog/gestion-patrimoine-entreprise-dirigeants-strategies-2026.html` | Patrimoine dirigeants 2026 |
| `blog/donation-vivant-patrimoine.html` | Donation vivant — stratégies patrimoniales |

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

## Standard SEO à Appliquer

### Chaque `<head>` doit contenir
```html
<title>[Mot-clé principal] | Proactifs Conseils</title>
<meta name="description" content="[140–160 car. — bénéfice + localisation + CTA]">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://proactifsconseils.fr/[slug]">

<!-- Open Graph -->
<m