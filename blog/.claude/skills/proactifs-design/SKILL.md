---
name: proactifs-design
description: "Système de design complet du site proactifsconseils.fr (cabinet de gestion de patrimoine Proactifs Conseils, Colombes 92). Utilise ce skill systématiquement pour toute création ou modification de page HTML du site : nouvelle page de service, article de blog, page ville, page de conversion, landing page, refonte d'une section existante. Contient les variables CSS, typographies, patterns nav/hero/sections/footer/cards/buttons exacts, ainsi que les boilerplates SEO, le routage Vercel, et les règles de cohérence. Ne jamais créer une page Proactifs sans lire ce skill d'abord."
---

# Design System — proactifsconseils.fr

Site statique HTML/CSS/JS hébergé sur Vercel. Pages de référence absolues : `preparation-retraite.html` et `optimisation-fiscale-ile-de-france.html`.

---

## 1. Variables CSS (à copier dans chaque `<style>`)

```css
:root {
  --ivory:      #FAFAF7;      /* fond principal pages */
  --sand:       #F3F1EB;      /* sections alternées, breadcrumb */
  --forest:     #132D1E;      /* vert foncé : hero, footer, CTA sections */
  --forest-mid: #1C3D28;      /* gradient légèrement plus clair */
  --ink:        #111827;      /* texte principal */
  --ink-soft:   #374151;      /* texte secondaire, sous-titres */
  --gold:       #C4973A;      /* or : accents, boutons, em italiques */
  --gold-light: #E8C97A;      /* or clair : hover, em sur fond sombre */
  --gold-pale:  #FBF4E3;      /* or très pâle : fond badges gold */
  --teal:       #1E7A6E;      /* teal : sec-label, breadcrumb liens */
  --teal-light: #2A9D8F;
  --teal-pale:  #E6F4F2;      /* fond badges teal */
  --slate:      #6B7280;      /* gris légendes, hero sous-titres */
  --border:     #E5E2DA;      /* bordures cards, tableaux */
  --white:      #FFFFFF;
  --shadow-sm:  0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04);
  --shadow-md:  0 4px 16px rgba(17,24,39,.08), 0 2px 6px rgba(17,24,39,.04);
  --shadow-lg:  0 12px 40px rgba(17,24,39,.1),  0 4px 12px rgba(17,24,39,.06);
  --r-sm: 10px;
  --r-md: 16px;
  --r-lg: 24px;
  --r-xl: 32px;
}
```

**Jamais utiliser :** `--navy`, `#0d1f3c`, `--text`, `--gray`, `#c9a84c`, police Inter, Playfair Display.

**Mapping de migration (vieux → nouveau) :**
| Ancien | Nouveau |
|---|---|
| `--navy: #0d1f3c` | `--forest: #132D1E` |
| `--text: #2c3e50` | `--ink: #111827` |
| `--text-light: #6b7a8d` | `--ink-soft: #374151` |
| `--gray: #f5f6f8` | `--sand: #F3F1EB` |
| `#c9a84c` | `#C4973A` |
| `'Inter', sans-serif` | `'DM Sans', sans-serif` |
| `'Playfair Display', serif` | `'Fraunces', serif` |

---

## 2. Typographie

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Usage | Police |
|---|---|
| Texte courant, body | `'DM Sans', sans-serif` |
| Titres H1/H2/H3, `<em>` italiques | `'Fraunces', serif` |
| Labels mono, badges, `sec-label`, chiffres stats | `'DM Mono', monospace` |

**Règle em :** `<em>` dans les titres = toujours `color: var(--gold); font-style: italic;`  
Sur fond sombre (hero forest) : `color: var(--gold-light); font-style: italic;`

---

## 3. HEAD boilerplate

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/favicon.png">
  <title>[Titre SEO – max 60 car] | Proactifs Conseils</title>
  <meta name="description" content="[Description 150 car max. Finir par →]">
  <link rel="canonical" href="https://www.proactifsconseils.fr/[slug]">
  <!-- Schema.org selon type de page (voir section 9) -->
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* variables CSS ici */
  </style>
</head>
```

---

## 4. Navigation (identique sur toutes les pages)

### HTML

```html
<nav id="nav">
  <a href="/" class="nav-logo">
    <img src="/images/proactifs-logo.png" alt="Proactifs Conseils"
         style="height:48px;width:auto;display:block;opacity:.9">
  </a>
  <ul class="nav-links">
    <li><a href="/#services">Nos services</a></li>
    <li><a href="/#simulateurs">Simulateurs</a></li>
    <li><a href="/#approche">Notre approche</a></li>
    <li><a href="/#temoignages">Témoignages</a></li>
    <li><a href="/#contact">Contact</a></li>
    <li><a href="/blog">Blog</a></li>
  </ul>
  <button class="hamburger" id="hamburger" aria-label="Menu">
    <span></span><span></span><span></span>
  </button>
  <a href="/bilan-patrimonial-gratuit" class="nav-cta-btn">Prendre rendez-vous</a>
</nav>

<div class="mobile-menu" id="mobileMenu">
  <a href="/#services">Nos services</a>
  <a href="/#simulateurs">Simulateurs</a>
  <a href="/#approche">Notre approche</a>
  <a href="/#temoignages">Témoignages</a>
  <a href="/#contact">Contact</a>
  <a href="/blog">Blog</a>
  <a href="/bilan-patrimonial-gratuit">Prendre rendez-vous</a>
</div>
```

Sur les **pages blog** (articles + index blog), le lien Blog reçoit `class="active"` :
```html
<li><a href="/blog" class="active">Blog</a></li>
```

### CSS nav

```css
#nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 72px;
  background: transparent;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px;
  transition: all 0.3s ease;
}
#nav.scrolled {
  background: rgba(250,250,247,.98);
  box-shadow: var(--shadow-md);
  height: 68px;
}
.nav-logo { display: flex; align-items: center; text-decoration: none; }
.nav-logo img { height: 48px; width: auto; display: block; }
.nav-links { display: flex; list-style: none; gap: 40px; flex: 1; margin-left: 60px; }
.nav-links a {
  text-decoration: none; color: var(--ink);
  font-size: 14px; font-weight: 500; transition: color 0.2s;
}
.nav-links a:hover { color: var(--gold); }
.nav-links a.active { color: var(--gold); }
#nav:not(.scrolled) .nav-links a { color: var(--white); }
#nav:not(.scrolled) .nav-links a:hover { color: var(--gold-light); }
#nav:not(.scrolled) .nav-links a.active { color: var(--gold-light); }
.nav-cta-btn {
  background: var(--gold); color: var(--ink);
  padding: 10px 24px; border-radius: var(--r-md);
  font-weight: 600; font-size: 13px;
  transition: all 0.2s; white-space: nowrap;
}
.nav-cta-btn:hover { background: var(--gold-light); box-shadow: var(--shadow-md); }
.hamburger { display: none; flex-direction: column; background: none; border: none; cursor: pointer; gap: 6px; }
.hamburger span { width: 24px; height: 2px; background: var(--ink); transition: all 0.3s; }
#nav:not(.scrolled) .hamburger span { background: var(--white); }
.hamburger.open span:nth-child(1) { transform: rotate(45deg) translate(8px,8px); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: rotate(-45deg) translate(7px,-7px); }
.mobile-menu {
  display: none; position: fixed; top: 72px; left: 0; right: 0;
  background: var(--white); flex-direction: column; padding: 20px; gap: 12px; z-index: 99;
}
.mobile-menu.open { display: flex; }
.mobile-menu a {
  padding: 12px 16px; text-decoration: none; color: var(--ink);
  font-weight: 500; border-radius: var(--r-sm); transition: all 0.2s;
}
.mobile-menu a:hover { background: var(--sand); color: var(--gold); }
```

### JS nav (scroll + hamburger)

```javascript
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
});
document.getElementById('hamburger').addEventListener('click', function() {
  this.classList.toggle('open');
  document.getElementById('mobileMenu').classList.toggle('open');
});
```

---

## 5. Breadcrumb

```html
<div class="breadcrumb" style="background:var(--sand);padding:12px 40px;font-size:13px;color:var(--slate);margin-top:72px;">
  <a href="/" style="color:var(--teal);text-decoration:none;">Accueil</a>
  › [Titre de la page]
</div>
```

---

## 6. Hero — Pages Services (svc-hero)

```html
<section class="svc-hero">
  <div class="container">
    <div class="hero-badge">[SUJET] · Île-de-France</div>
    <h1>[Titre principal avec <em>mot clé en or</em>]</h1>
    <p>[Sous-titre 18px, max 600px, ligne 1.7]</p>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-value">XX%</div>
        <div class="hero-stat-label">[label mono]</div>
      </div>
      <!-- 2-3 stats max -->
    </div>
    <a href="/bilan-patrimonial-gratuit" class="btn-primary">Prendre rendez-vous →</a>
  </div>
</section>
```

```css
.svc-hero {
  background: linear-gradient(135deg, #0a1f14 0%, var(--forest) 100%);
  padding: 120px 40px;
  margin-top: 72px;
  position: relative; overflow: hidden; color: var(--white);
}
.svc-hero::before {
  content: ''; position: absolute; top: 0; right: 0;
  width: 50%; height: 100%;
  background: url('/images/[photo].jpg') right center / cover;
  opacity: 0.15; z-index: 0;
}
.svc-hero > * { position: relative; z-index: 1; }
.hero-badge {
  display: inline-block;
  background: rgba(232,201,122,0.2); border: 1px solid rgba(232,201,122,0.4);
  color: var(--gold-light); padding: 8px 16px; border-radius: var(--r-sm);
  font-size: 12px; font-family: 'DM Mono', monospace;
  font-weight: 500; text-transform: uppercase; margin-bottom: 24px;
}
.svc-hero h1 {
  font-family: 'Fraunces', serif; font-size: 56px; font-weight: 700;
  line-height: 1.2; margin-bottom: 20px; max-width: 700px;
}
.svc-hero h1 em { color: var(--gold-light); font-style: italic; font-weight: 600; }
.svc-hero > .container > p {
  font-size: 18px; color: rgba(255,255,255,.9); max-width: 600px;
  margin-bottom: 60px; line-height: 1.7;
}
.hero-stats {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 40px; max-width: 700px; margin-bottom: 48px;
}
.hero-stat { border-right: 1px solid rgba(232,201,122,.3); }
.hero-stat:last-child { border-right: none; }
.hero-stat-value {
  font-family: 'Fraunces', serif; font-size: 36px; font-weight: 700;
  color: var(--gold-light); margin-bottom: 4px;
}
.hero-stat-label { font-size: 13px; color: rgba(255,255,255,.7); text-transform: uppercase; font-family: 'DM Mono', monospace; }
```

---

## 7. Hero — Articles Blog (article-hero)

```html
<section class="article-hero">
  <div class="container" style="max-width:1200px;margin:0 auto;">
    <div class="article-meta">
      <span class="article-cat">[Catégorie]</span>
      <span>· [Date] · [X min de lecture]</span>
    </div>
    <h1>[Titre de l'article avec <em>mot clé</em>]</h1>
    <p class="article-intro">[Introduction 2-3 lignes max]</p>
    <div class="article-author">
      <div class="author-avatar">GO</div>
      <div>
        <strong>Medy Matima</strong>
        <span>Conseiller en Gestion de Patrimoine — Proactifs Conseils</span>
      </div>
    </div>
  </div>
</section>
```

```css
.article-hero {
  background: linear-gradient(135deg, #0a1f14 0%, var(--forest) 60%, #1a4030 100%);
  padding: 80px 40px 100px; color: var(--white);
  position: relative; overflow: hidden;
}
.article-hero::after {
  content: ''; position: absolute; bottom: -1px; left: 0; right: 0;
  height: 60px; background: var(--white); clip-path: ellipse(55% 100% at 50% 100%);
}
.article-cat {
  background: rgba(196,151,58,.2); color: var(--gold-light);
  padding: 4px 12px; border-radius: 20px; font-size: 12px;
  font-family: 'DM Mono', monospace; font-weight: 500; text-transform: uppercase;
}
.article-hero h1 {
  font-family: 'Fraunces', serif; font-size: 48px; font-weight: 700;
  line-height: 1.15; margin: 20px 0; max-width: 800px;
}
.article-hero h1 em { color: var(--gold-light); font-style: italic; }
.article-intro { font-size: 18px; color: rgba(255,255,255,.85); max-width: 700px; line-height: 1.7; margin-bottom: 32px; }
.author-avatar {
  width: 44px; height: 44px; border-radius: 50%; background: var(--gold);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; color: var(--ink);
}
```

---

## 8. Sections — Patterns standards

```css
.sec { padding: 96px 40px; }
.sec-sand { background: var(--sand); }
.sec-white { background: var(--white); }
.sec-forest { background: var(--forest); color: var(--white); }
.container { max-width: 1200px; margin: 0 auto; }

/* Label section (DM Mono, teal, barre avant) */
.sec-label {
  font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500;
  color: var(--teal); text-transform: uppercase; letter-spacing: 1px;
  position: relative; display: inline-block;
  padding-left: 20px; margin-bottom: 16px;
}
.sec-label::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 12px; height: 1px; background: var(--teal);
}
.sec-forest .sec-label { color: var(--gold-light); }
.sec-forest .sec-label::before { background: var(--gold-light); }

/* Titre section */
.sec-title {
  font-family: 'Fraunces', serif; font-size: 44px; font-weight: 700;
  line-height: 1.2; margin-bottom: 40px; max-width: 900px;
}
.sec-title em { color: var(--gold); font-style: italic; font-weight: 600; }
.sec-forest .sec-title { color: var(--white); }
.sec-forest .sec-title em { color: var(--gold-light); }
```

---

## 9. Cards — Composants

### Solution Card (grille 3 colonnes)

```css
.solution-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 32px; }
.solution-card {
  background: var(--white); border-radius: var(--r-lg); padding: 40px;
  box-shadow: var(--shadow-sm); transition: all 0.3s ease;
}
.solution-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-4px); }
.solution-tag {
  display: inline-block; background: var(--teal-pale); color: var(--teal);
  padding: 6px 12px; border-radius: var(--r-sm);
  font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace;
  text-transform: uppercase; margin-bottom: 16px;
}
.solution-card h3 { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
.solution-card p { font-size: 14px; color: var(--ink-soft); line-height: 1.7; }
```

### Process Steps (fond forest, numéros or)

```css
.process-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 48px; }
.process-step { position: relative; padding-left: 60px; }
.process-step::before {
  content: attr(data-step); position: absolute; left: 0; top: 0;
  width: 48px; height: 48px; background: var(--gold); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; color: var(--ink);
}
.process-step h3 { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
```

Usage HTML : `<div class="process-step" data-step="1">`

---

## 10. Boutons

```css
.btn-primary {
  background: var(--gold); color: var(--ink);
  padding: 12px 32px; border: none; border-radius: var(--r-md);
  font-weight: 600; font-size: 14px; cursor: pointer;
  transition: all 0.2s; text-decoration: none; display: inline-block;
}
.btn-primary:hover { background: var(--gold-light); box-shadow: var(--shadow-md); }

.btn-secondary {
  background: transparent; color: var(--ink);
  padding: 12px 32px; border: 1.5px solid var(--border); border-radius: var(--r-md);
  font-weight: 500; font-size: 14px; cursor: pointer;
  transition: all 0.2s; text-decoration: none; display: inline-block;
}
.btn-secondary:hover { border-color: var(--gold); color: var(--gold); background: var(--gold-pale); }

/* Sur fond forest */
.btn-primary-light {
  background: var(--white); color: var(--forest);
  padding: 14px 32px; border-radius: var(--r-md);
  font-weight: 600; font-size: 15px; transition: all 0.2s;
}
.btn-primary-light:hover { background: var(--gold-pale); }
```

---

## 11. CTA de fin de page (section de conversion)

Pattern standard : fond `var(--forest)`, titre Fraunces blanc, sous-titre `rgba(255,255,255,.8)`, deux boutons.

```html
<section class="sec sec-forest" style="text-align:center;">
  <div class="container">
    <div class="sec-label">[Label mono]</div>
    <h2 class="sec-title">Titre avec <em>mot en or</em></h2>
    <p style="font-size:18px;color:rgba(255,255,255,.8);max-width:560px;margin:0 auto 48px;line-height:1.7;">[Accroche]</p>
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
      <a href="/bilan-patrimonial-gratuit" class="btn-primary-light">Prendre rendez-vous</a>
      <a href="/#contact" style="color:var(--gold-light);padding:14px 32px;font-size:15px;font-weight:500;">Nous contacter →</a>
    </div>
  </div>
</section>
```

---

## 12. Footer

```html
<footer style="background:#080C10;color:rgba(255,255,255,.8);padding:64px 40px 32px;">
  <div class="container">
    <div style="display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1.4fr;gap:48px;margin-bottom:48px;">
      <!-- Col 1: Logo + description -->
      <div>
        <img src="/images/proactifs-logo.png" alt="Proactifs Conseils" style="height:40px;margin-bottom:16px;opacity:.9">
        <p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,.6);max-width:280px;">Cabinet de gestion de patrimoine indépendant. Colombes (92), Hauts-de-Seine.</p>
      </div>
      <!-- Col 2-4: Liens -->
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:24px;font-size:12px;color:rgba(255,255,255,.4);">
      © 2026 Proactifs Conseils · Mentions légales
    </div>
  </div>
</footer>
```

Liens footer : `color:rgba(255,255,255,.6)`, hover `var(--gold-light)`.

---

## 13. Contact anchor (ancre page d'accueil)

L'ancre `#contact` pointe vers un `<div>` positionné **avant le footer**, pas sur le footer lui-même. Utiliser `scroll-margin-top: 80px` :

```html
<div id="contact" style="scroll-margin-top:80px;"></div>
<footer ...>
```

---

## 14. Schema.org selon type de page

**Page service :**
```json
{"@context":"https://schema.org","@type":"Service","name":"[Nom service]",
 "provider":{"@type":"FinancialService","name":"Proactifs Conseils",
   "address":{"@type":"PostalAddress","streetAddress":"54 Rue du Bournard","addressLocality":"Colombes","postalCode":"92700","addressCountry":"FR"},
   "telephone":"+33184782830"},
 "description":"[Description]","areaServed":["Colombes","Hauts-de-Seine","Île-de-France"]}
```

**Article blog :**
```json
{"@context":"https://schema.org","@type":"Article",
 "headline":"[Titre]","datePublished":"2026-[MM]-[DD]","dateModified":"2026-[MM]-[DD]",
 "author":{"@type":"Person","name":"Medy Matima"},
 "publisher":{"@type":"Organization","name":"Proactifs Conseils","url":"https://www.proactifsconseils.fr"}}
```

**Page ville :**
```json
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Proactifs Conseils — [Ville]",
 "@id":"https://www.proactifsconseils.fr/conseiller-patrimoine-[ville]",
 "url":"https://www.proactifsconseils.fr/conseiller-patrimoine-[ville]",
 "telephone":"+33184782830","address":{"@type":"PostalAddress","addressLocality":"[Ville]","postalCode":"[CP]","addressCountry":"FR"},
 "areaServed":"[Ville]","priceRange":"Sur devis"}
```

---

## 15. Vercel routing

Chaque nouvelle page HTML nécessite un rewrite dans `vercel.json` :

```json
{ "source": "/[slug]", "destination": "/[slug].html" }
```

Et une entrée dans `sitemap.xml` avec `lastmod` à la date de création.

---

## 16. Responsive (breakpoints clés)

```css
@media (max-width: 768px) {
  .nav-links, .nav-cta-btn { display: none; }
  .hamburger { display: flex; }
  .svc-hero h1 { font-size: 36px; }
  .svc-hero { padding: 80px 24px; }
  .sec { padding: 60px 24px; }
  .sec-title { font-size: 32px; }
  .solution-grid { grid-template-columns: 1fr; }
  .process-grid { grid-template-columns: 1fr; gap: 32px; }
  .hero-stats { grid-template-columns: 1fr; gap: 24px; }
  .hero-stat { border-right: none; border-bottom: 1px solid rgba(232,201,122,.3); padding-bottom: 20px; }
  .hero-stat:last-child { border-bottom: none; }
}
```

---

## 17. Google Analytics

À ajouter dans le `<head>` de chaque page :

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-P53RQGXJZX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-P53RQGXJZX');
</script>
```

---

---

## 18. Typographie articles blog — Règles obligatoires

### Paragraphes justifiés

Tous les `<p>` du corps d'article doivent être justifiés. Les articles utilisent soit `.article-content` soit `.article-body` comme conteneur principal :

```css
.article-content p {
  font-size: 16px; line-height: 1.8; color: var(--ink-soft);
  margin-bottom: 20px; text-align: justify;
}
.article-body p {
  font-size: 16px; line-height: 1.8; color: var(--ink-soft);
  margin-bottom: 20px; text-align: justify;
}
```

### Strong sur fond sombre — bug fréquent

`.article-content strong` et `.article-body strong` reçoivent `color: var(--ink)` (#111827) par défaut. Sur fond `--forest` (#132D1E) c'est quasi invisible. Toujours surcharger :

```css
/* Bloc récapitulatif (.retenir-block) sur fond --forest */
.retenir-block strong { color: var(--gold-light); font-weight: 700; }

/* Tout <strong> dans une section fond sombre */
.sec-forest strong { color: var(--gold-light); }
```

Ne jamais laisser `var(--ink)` s'appliquer à un `<strong>` sur fond sombre.

### FAQ Accordéon

Chaque article avec section FAQ doit inclure ce JS avant `</body>` :

```javascript
document.querySelectorAll('.faq-question').forEach(q => {
  q.addEventListener('click', () => {
    q.parentElement.classList.toggle('open');
  });
});
```

CSS associé :

```css
.faq-item .faq-answer { display: none; }
.faq-item.open .faq-answer { display: block; }
.faq-chevron { transition: transform 0.3s; }
.faq-item.open .faq-chevron { transform: rotate(180deg); }
```

## 19. Règles d'or

1. **Pages de référence :** `preparation-retraite.html` et `optimisation-fiscale-ile-de-france.html`
2. **Em italic or** partout dans les titres — c'est la signature visuelle du site
3. **Hero toujours forest** (vert foncé gradient) sauf pages capture (bilan-patrimonial-gratuit)
4. **Sections alternées** : forest hero → sand → white → sand → forest (CTA)
5. **Bouton CTA** : toujours `background: var(--gold)` — jamais de bleu ni de vert
6. **Polices** : DM Sans + Fraunces + DM Mono. Jamais Inter ni Playfair
7. **Logo nav** : `height:48px; opacity:.9` — sans fond blanc ni padding
8. **Breadcrumb** : fond sand, lien teal, séparateur ›
9. **sec-label** : DM Mono, teal, barre 12px avant, uppercase
10. **Mobile** : hamburger à 768px, menu overlay ivory/white
11. **Paragraphes articles** : toujours `text-align: justify` sur `.article-content p` et `.article-body p`
12. **Strong sur fond sombre** : surcharger avec `color: var(--gold-light)` — jamais laisser `var(--ink)` sur `--forest`