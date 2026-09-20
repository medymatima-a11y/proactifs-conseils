# Passe responsive finale — Section Diagnostics (`#lead-gen`)

**Projet :** Proactifs Conseils — site-web (home `index.html`)
**Date :** 19 septembre 2026
**Portée :** CSS responsive mobile de la section Diagnostics **uniquement**. Aucune modification JS, contenu, wording, autre section. Aucun déploiement.

---

## 1. Fichier modifié

- **`index.html`** — styles inline de la section `#lead-gen`. **3 règles `.lead-cards`** seulement. Aucun autre fichier.

## 2. Constat d'audit (avant intervention)

La section était déjà largement conforme (travail desktop existant). Vérifié :
- **Titre** : « Quel projet souhaitez-vous *concrétiser* ? » — déjà 2 lignes en mobile, « ? » collé à « concrétiser », `text-wrap:balance` + `clamp(23px,6.6vw,30px)`. ✅ déjà conforme.
- **Réassurance** : `2 min · Confidentiel · Sans engagement` — déjà 1 ligne (`.lead-trust-row span { white-space:nowrap }`). ✅
- **Cartes** : `.lead-card` déjà en `display:flex; flex-direction:column`, CTA `.lead-card-arrow` en `margin-top:auto`, `align-items:stretch` + `height:100%` → hauteurs égales par rangée, CTA en bas. ✅
- **Espacements** mobiles déjà resserrés (`lead-header 28px`, `badge 14px`, etc.). ✅

**Seul écart réel :** la 9e carte n'était centrée qu'à ≤600px. Entre **601 et 900px (ex. 768px)** la grille est en 2 colonnes mais la 9e carte restait **seule à gauche**.

## 3. Modification appliquée (centrage 9e carte, robuste au gap)

Variable `--lead-gap` introduite comme source unique du gap, réutilisée par le calcul de largeur → robuste si le gap change (§4).

```css
/* base */
.lead-cards { display:grid; grid-template-columns:repeat(3,1fr); --lead-gap:18px; gap:var(--lead-gap); }

/* @media(max-width:900px) — toute la plage 2 colonnes */
.lead-cards { grid-template-columns:repeat(2,1fr); }
.lead-cards > .lead-card:last-child:nth-child(odd) {
  grid-column:1 / -1; justify-self:center; width:calc((100% - var(--lead-gap)) / 2);
}

/* @media(max-width:600px) */
.lead-cards { grid-template-columns:1fr 1fr; --lead-gap:10px; gap:var(--lead-gap); align-items:stretch; }
/* (centrage 9e carte : règle unique gap-robuste dans le bloc <=900px) */
```

- La 9e carte conserve **exactement la largeur d'une colonne** (`justify-self:center` + largeur = 1 colonne). Pas de `width:100%`, pas d'étirement, pas de span visuel sur 2 colonnes.
- Garde `:last-child:nth-child(odd)` → ne se déclenche que si la dernière carte est réellement seule sur sa rangée (robuste si le nombre de cartes change).
- Suppression du centrage dupliqué codé en dur (`10px`) du bloc ≤600px.

## 4. Résultats par largeur

| Largeur | Colonnes | 9e carte centrée | Titre « ? » isolé | Overflow Diagnostics |
|---|---|---|---|---|
| 320 | 2 | ✅ (151 vs 155 px) | ❌ non | ✅ aucun |
| 375 | 2 | ✅ (176 vs 181 px) | ❌ non | ✅ aucun |
| 390 | 2 | ✅ (184 vs 189 px) | ❌ non | ✅ aucun |
| 430 | 2 | ✅ (204 vs 207 px) | ❌ non | ✅ aucun |
| 768 | 2 | ✅ **corrigé** (362 vs 364 px) | — (1 ligne) | ✅ aucun |
| 1440 | 3 | — (grille 3×3 pleine) | — (1 ligne) | ✅ aucun |

## 5. Confirmations demandées

- **Grille 2 colonnes** conservée (jamais 1 colonne) sur tout le mobile. ✅
- **9e carte centrée**, largeur identique à une carte normale. ✅
- **Titre sans « ? » isolé** : « Quel projet souhaitez-vous / concrétiser ? » — « concrétiser » garde son doré/italique. ✅
- **Réassurance** sur une seule ligne à 390px. ✅
- **CTA « Faire mon diagnostic »** alignés en bas, cartes de hauteur égale par rangée. ✅
- **Modal @390px** : aucune coupure ni overflow horizontal, croix de fermeture accessible, bouton « Commencer mon diagnostic → » entièrement visible. ✅ (aucune modification apportée à la modal)
- **Desktop 1440px** : rendu identique au validé (3×3). Aucune régression. ✅
- **Aucun overflow horizontal provoqué par Diagnostics** à 320/375/390/430/768/1440 (mesure `#lead-gen *` = 0 débordement). ✅

## 6. Note (hors périmètre)

Un léger scroll horizontal **document** subsiste à ≤390px, **non causé par Diagnostics** mais par le widget legacy `#simulateurs` (`.sim-form` / `.sim-results`) et la navigation. Conformément au périmètre strict, ces éléments n'ont **pas** été touchés, et aucun `overflow-x:hidden` global n'a été ajouté pour masquer le problème.

## 7. Non touché

JS (`openWizard`, `wizSubmit`), contenu, wording, 9 diagnostics, questions/réponses, icônes, Supabase, tracking, header, hero, autres sections, footer, SEO, structured data. Espacements desktop inchangés.

## 8. git diff --stat

```
index.html | 420 +++++++++++++++++++++++++++++++++----------------------------
(inclut le travail Diagnostics préexistant ; la présente passe = +net ~3 lignes CSS,
strictement dans les règles .lead-cards)
```

**Pas de commit · pas de push · pas de déploiement.**

*Fin de passe responsive Diagnostics. CSS uniquement, section conforme aux 6 breakpoints.*
