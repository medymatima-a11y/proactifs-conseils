# Contexte site — proactifsconseils.fr

> **À lire au début de chaque session de création d'article ou de page.**
> Ce fichier est la source de vérité pour l'architecture, les pages existantes, et le workflow de production.

---

## 1. Le site

| Paramètre | Valeur |
|---|---|
| URL prod | https://proactifsconseils.fr |
| Stack | HTML statique / CSS / JS ES6 / Tailwind — hébergé sur Vercel |
| Dépôt GitHub | Proactifs Conseils (dossier local `Site web Proactifs Conseils\`) |
| Design system | Skill `proactifs-design` → **toujours lire ce skill avant toute création de page** |
| Analytics | Google Analytics : `G-P53RQGXJZX` |
| Cabinet | Proactifs Conseils — Conseiller en gestion de patrimoine — Colombes (92) |

---

## 2. Structure des pages principales

### Pages de service (hors articles)
| Page | Slug / fichier | Statut |
|---|---|---|
| Accueil | `/` → `index.html` | ✅ En ligne |
| Bilan patrimonial | `/bilan-patrimonial` → `bilan-patrimonial.html` | ✅ En ligne |
| Préparation retraite | `/preparation-retraite` → `preparation-retraite.html` | ✅ En ligne — **page de référence design** |
| Optimisation fiscale IDF | `/optimisation-fiscale-ile-de-france` → `optimisation-fiscale-ile-de-france.html` | ✅ En ligne — **page de référence design** |
| Transmission de patrimoine | `/transmission` → `transmission.html` | ✅ En ligne |
| Cession d'entreprise | `/cession-entreprise` → `cession-entreprise.html` | ✅ En ligne |
| Investissement immobilier | `/investissement-immobilier` → `investissement-immobilier.html` | ✅ En ligne |
| Immobilier ancien | `/investissement-immobilier-ancien` → `investissement-immobilier-ancien.html` | ✅ En ligne |
| SCPI Hauts-de-Seine | `/investissement-scpi-hauts-de-seine` → `investissement-scpi-hauts-de-seine.html` | ✅ En ligne |
| Crédit immobilier | `/courtage-credit-immobilier` → `courtage-credit-immobilier.html` | ✅ En ligne |
| Déclaration impôts IDF | `/declaration-impots-ile-de-france` → `declaration-impots-ile-de-france.html` | ✅ En ligne |
| Fiscalité RSU & stock-options | `/fiscalite-rsu-stock-options` → `fiscalite-rsu-stock-options.html` | ✅ En ligne |
| Déclaration RSU/ESPP | `/declaration-rsu-espp-france` → `declaration-rsu-espp-france.html` | ✅ En ligne |
| Placements financiers | `/placements-financiers` → `placements-financiers.html` | ✅ En ligne |
| Simulateur prêt immobilier | `/simulation-pret-immobilier` → `simulation-pret-immobilier.html` | ✅ En ligne |
| Donation du vivant | `/donation-vivant-patrimoine` → `donation-vivant-patrimoine.html` | ✅ En ligne |
| Gestion patrimoine dirigeants | `/gestion-patrimoine-entreprise-dirigeants-strategies-2026` → `gestion-patrimoine-entreprise-dirigeants-strategies-2026.html` | ✅ En ligne |
| Contact | `/contact` | ✅ En ligne |

### Pages villes (SEO local)
| Page | Slug / fichier | Statut |
|---|---|---|
| Conseiller patrimoine Colombes | `/conseiller-patrimoine-colombes` → `conseiller-patrimoine-colombes.html` | ✅ En ligne |
| Conseiller patrimoine Asnières | `/conseiller-patrimoine-asnieres` → `conseiller-patrimoine-asnieres.html` | ✅ En ligne |
| Conseiller patrimoine Courbevoie | `/conseiller-patrimoine-courbevoie` → `conseiller-patrimoine-courbevoie.html` | ✅ En ligne |
| Conseiller patrimoine Levallois | `/conseiller-patrimoine-levallois` → `conseiller-patrimoine-levallois.html` | ✅ En ligne |
| Conseiller patrimoine Nanterre | `/conseiller-patrimoine-nanterre` → `conseiller-patrimoine-nanterre.html` | ✅ En ligne |

### Articles de blog / SEO
→ Voir `SEO-ARTICLES-SUIVI.md` pour la liste complète.

---

## 3. L'Agent SEO Proactifs

| Paramètre | Valeur |
|---|---|
| URL dashboard | https://agent-seo-proactifs-v2.vercel.app/ |
| GitHub | medymatima-a11y/agent-seo-proactifs |
| Stack | TypeScript / Next.js — hébergé sur Vercel |
| Rôle | Génère des topics SEO et des brouillons d'articles pour proactifsconseils.fr |

**Workflow entre l'Agent SEO et Cowork :**
1. Medy approuve un topic dans le dashboard de l'agent SEO
2. L'agent génère le brouillon (statut "genere")
3. Dans Cowork : naviguer sur `https://agent-seo-proactifs-v2.vercel.app/` via Chrome → récupérer le contenu de l'article
4. Lire le skill `proactifs-design`
5. Créer la page HTML → **sauvegarder dans ce dossier Proactifs** avec le bon slug
6. Mettre à jour `SEO-ARTICLES-SUIVI.md`
7. Ajouter la route dans `vercel.json` du site principal

---

## 4. Comment demander la création d'un article

La phrase la plus efficace pour déclencher le bon workflow :

> *"Crée la page HTML pour l'article [slug ou titre] depuis l'agent SEO."*

Claude ira automatiquement :
- Naviguer sur le dashboard de l'agent SEO pour récupérer le brouillon
- Lire le skill `proactifs-design`
- Créer la page HTML dans ce dossier (`Proactifs\`)
- Mettre à jour `SEO-ARTICLES-SUIVI.md`

**À ne pas faire :** copier-coller le contenu manuellement — Claude peut aller le chercher directement.

---

## 5. Conventions de nommage

| Élément | Convention |
|---|---|
| Fichier HTML | Même slug que l'URL, ex. `investir-immobilier-ancien-ile-de-france-avantages-fiscaux-2026.html` |
| Slug URL | Kebab-case, en français, sans accents, ex. `/gestion-patrimoine-entreprise` |
| Route Vercel | À ajouter dans `vercel.json` : `{ "source": "/slug", "destination": "/slug.html" }` |

---

## 6. Maillage interne — règles

- Chaque article doit pointer vers **au moins 2 pages de service existantes** (retraite, fiscal, etc.)
- La sidebar doit contenir **2 articles liés** (consulter `SEO-ARTICLES-SUIVI.md` pour les slugs disponibles)
- Éviter les doublons de mots-clés : vérifier `SEO-ARTICLES-SUIVI.md` avant de créer un article sur un topic proche

---

## 7. Convention icônes

**Style choisi : SVG inline sur mesure (option A)**

- Stroke personnalisé : `stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"`
- Taille : 18px dans les cards, 24-28px dans les sidebar CTA
- Pas de librairie externe — SVG écrit directement dans le HTML
- Conteneurs colorés (classe utilitaire) :

```css
.ic-forest { background: rgba(19,45,30,.12); color: #132D1E; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; }
.ic-gold   { background: rgba(196,151,58,.12); color: #C4973A; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; }
.ic-teal   { background: rgba(30,122,110,.12); color: #1E7A6E; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; }
```

- Exemple card stratégie :
```html
<div class="strat-card">
  <div class="ic-teal">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6M9 13h4"/></svg>
  </div>
  <div><strong>Donation-partage</strong><br><small>Répartition équitable</small></div>
</div>
```

---

## 8. Règles rédactionnelles — termes interdits

| ❌ Interdit | ✅ À utiliser |
|---|---|
| "bilan offert" | "Prendre rendez-vous" |
| "bilan patrimonial offert" | "Prendre rendez-vous" |
| "demandez votre bilan" | "Prendre rendez-vous" |
| "bilan gratuit" | "Prendre rendez-vous" |

**Le mot "offert" est banni du site.** Le CTA unique est **"Prendre rendez-vous"** (lien vers `/bilan-patrimonial-gratuit`). Cette règle s'applique partout : boutons, sidebar, articles, exemples dans les visuels.

---

*Dernière mise à jour : 2026-06-14*
