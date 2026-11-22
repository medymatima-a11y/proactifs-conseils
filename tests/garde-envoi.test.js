'use strict';
/* Garde de réentrance de l'ENVOI — deux formulaires concernés :
     - declaration-rsu-espp-france.html (diagnostic en overlay, bouton onclick)
     - immobilier/succession-colombes.html (formulaire, écouteur `submit`)

   Le double clic réel observé au navigateur produisait deux POST. La garde
   corrigée est un drapeau de réentrance DANS la fonction de soumission : elle
   ne dépend ni du libellé du bouton, ni de son attribut `disabled`.

   Cycle de vie attendu, identique sur les deux pages :
     échec   → garde libérée, saisie conservée, nouvelle tentative possible ;
     succès  → garde maintenue, aucun second envoi ;
     remise à zéro explicite (« Nouvelle demande », réouverture du diagnostic)
             → un nouvel envoi redevient possible.

   Les tests EXÉCUTENT le script réel de chaque page dans un bac à sable, avec
   un DOM factice et un `fetch` instrumenté. Aucun appel réseau, aucune clé. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DECL = 'declaration-rsu-espp-france.html';
const SUCC = 'immobilier/succession-colombes.html';
const DECL_SRC = read(DECL);
const SUCC_SRC = read(SUCC);

/* Extrait le bloc <script> qui contient un marqueur donné. */
function scriptContenant(html, marqueur, nom) {
  const i = html.indexOf(marqueur);
  assert.ok(i > 0, 'marqueur introuvable dans ' + nom + ' : ' + marqueur);
  const debut = html.lastIndexOf('<script', i);
  const ouvre = html.indexOf('>', debut) + 1;
  const ferme = html.indexOf('</script>', i);
  assert.ok(debut > 0 && ferme > ouvre, 'bloc <script> introuvable dans ' + nom);
  return html.slice(ouvre, ferme);
}

const attendreBoucle = () => new Promise((r) => setImmediate(r));

/* `fetch` instrumenté : chaque appel reste en attente jusqu'à `repondre()`. */
function bacFetch() {
  const appels = [];
  const attente = [];
  return {
    appels,
    fetch(url, opts) {
      appels.push({ url, opts });
      return new Promise((resolve, reject) => attente.push({ resolve, reject }));
    },
    async repondre(i, rep) { attente[i].resolve(rep); await attendreBoucle(); },
    async couper(i) { attente[i].reject(new Error('reseau simule indisponible')); await attendreBoucle(); },
  };
}

/* DOM factice : un objet par identifiant, les écouteurs sont capturés. */
function bacDom(valeurs) {
  const elements = new Map();
  const ecouteurs = [];
  function el(id) {
    if (!elements.has(id)) {
      const e = {
        id,
        value: Object.prototype.hasOwnProperty.call(valeurs, id) ? valeurs[id] : '',
        textContent: '', innerHTML: '', className: '', disabled: false, hidden: false,
        checked: false, reinitialise: false,
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, fn) { ecouteurs.push({ id, type, fn }); },
        reset() { e.reinitialise = true; },
      };
      elements.set(id, e);
    }
    return elements.get(id);
  }
  const document = {
    getElementById: (id) => el(id),
    querySelector: (sel) => el('sel:' + sel),
    querySelectorAll: () => [],
    addEventListener(type, fn) { ecouteurs.push({ id: 'document', type, fn }); },
    body: { style: {} },
  };
  function ecouteur(id, type) {
    const h = ecouteurs.filter((x) => x.id === id && x.type === type);
    assert.strictEqual(h.length, 1, 'un seul ecouteur ' + type + ' attendu sur ' + id + ', trouve ' + h.length);
    return h[0].fn;
  }
  return { document, el, ecouteur };
}

function minuteurSansBlocage() {
  return {
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    clearTimeout: (t) => clearTimeout(t),
  };
}

/* ════════════ 1. declaration-rsu-espp-france.html ════════════ */

function montageDeclaration() {
  const src = scriptContenant(DECL_SRC, 'let actioSending = false;', DECL);
  const net = bacFetch();
  const dom = bacDom({ wPrenom: 'Lea', wNom: 'Durand', wEmail: 'lea@exemple.test', wTel: '0600000000', wSituation: 'Schwab' });
  const bac = Object.assign({
    document: dom.document,
    fetch: net.fetch,
    alert: () => { throw new Error('validation inattendue : alert() appele'); },
    console: { warn() {}, error() {}, log() {} },
    AbortController,
  }, minuteurSansBlocage());
  bac.window = bac;
  vm.createContext(bac);
  vm.runInContext(src, bac);
  // Le diagnostic est ouvert puis rempli : état de départ réel.
  bac.openActioWizard();
  return { bac, net, dom, envoyer: () => bac.actioWizSubmit() };
}

test('declaration : deux declenchements rapproches -> un seul POST', async () => {
  const m = montageDeclaration();
  m.envoyer();          // premier clic : fetch en vol
  m.envoyer();          // second clic immédiat (double clic réel)
  m.envoyer();          // troisième, par acquit de conscience
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1, 'le double clic doit produire un seul POST');
  assert.strictEqual(m.net.appels[0].url, '/api/subscribe');
});

test('declaration : validation au clavier pendant l\'envoi -> aucun second POST', async () => {
  // Le bouton a le focus : Entrée déclenche le même appel que le clic.
  const m = montageDeclaration();
  m.envoyer();
  await attendreBoucle();   // le visiteur appuie sur Entrée juste après
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1);
});

test('declaration : echec serveur -> garde liberee, nouvelle tentative possible', async () => {
  const m = montageDeclaration();
  m.envoyer();
  await m.net.repondre(0, { ok: false, status: 500 });
  const btn = m.dom.el('sel:#wizContact .wiz-submit-btn');
  assert.strictEqual(btn.disabled, false, 'le bouton doit etre reactive apres un echec');
  assert.strictEqual(m.dom.el('wizError').style.display, 'block', 'le message d\'erreur doit etre affiche');
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2, 'une nouvelle tentative doit pouvoir partir');
});

test('declaration : coupure reseau -> la garde est liberee elle aussi', async () => {
  const m = montageDeclaration();
  m.envoyer();
  await m.net.couper(0);
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2);
});

test('declaration : succes -> la garde reste posee, aucun second POST', async () => {
  const m = montageDeclaration();
  m.envoyer();
  await m.net.repondre(0, { ok: true, status: 200 });
  assert.strictEqual(m.dom.el('wizThanks').style.display, 'block', 'ecran de remerciement attendu');
  m.envoyer();
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1, 'apres un succes, aucun envoi supplementaire');
});

test('declaration : reouverture du diagnostic -> un nouvel envoi redevient possible', async () => {
  const m = montageDeclaration();
  m.envoyer();
  await m.net.repondre(0, { ok: true, status: 200 });
  m.bac.openActioWizard();      // équivalent du bouton « Nouvelle demande »
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2, 'la reouverture doit remettre la garde a zero');
});

test('declaration : la garde est le premier geste de la fonction', () => {
  assert.ok(/async function actioWizSubmit\(\) \{\s*\n\s*if \(actioSending\) return;/.test(DECL_SRC),
    'la verification de reentrance doit preceder toute lecture de champ');
  // Un seul endroit pose la garde ; trois la mettent à faux : la déclaration,
  // la réouverture du diagnostic et la branche d'échec. Aucun autre.
  assert.strictEqual((DECL_SRC.match(/actioSending = true;/g) || []).length, 1);
  assert.strictEqual((DECL_SRC.match(/let actioSending = false;/g) || []).length, 1);
  assert.strictEqual((DECL_SRC.match(/actioSending = false;/g) || []).length, 3);
  // La libération inconditionnelle après le fetch ne doit plus exister.
  assert.ok(!/clearTimeout\(timer\);\s*\n\s*\}\s*\n\s*\n?\s*actioSending = false;/.test(DECL_SRC),
    'la garde ne doit plus etre liberee sur le chemin de succes');
  // Le drapeau de conversion garde son rôle propre, inchangé.
  assert.ok(/if \(!actioConvSent\) \{\s*\n\s*actioConvSent = true;/.test(DECL_SRC));
  assert.ok(DECL_SRC.includes("gtag('event', 'ads_conversion_Formulaire_1', { event_category: 'wizard', event_label: 'declaration-rsu-espp' })"));
});

/* ════════════ 2. immobilier/succession-colombes.html ════════════ */

function montageSuccession() {
  const src = scriptContenant(SUCC_SRC, 'let successionSending = false;', SUCC);
  const net = bacFetch();
  const dom = bacDom({
    's-prenom': 'Paul', 's-email': 'paul@exemple.test', 's-tel': '0600000000',
    's-ville': 'Colombes', 's-heritiers': '2', 's-statut': 'Succession en cours',
  });
  const bac = Object.assign({
    document: dom.document,
    fetch: net.fetch,
    console: { warn() {}, error() {}, log() {} },
    IntersectionObserver: function () { this.observe = function () {}; },
  }, minuteurSansBlocage());
  bac.window = bac;
  bac.window.addEventListener = () => {};
  vm.createContext(bac);
  vm.runInContext(src, bac);
  const form = dom.el('successionForm');
  const soumettre = dom.ecouteur('successionForm', 'submit');
  const ev = () => { const e = { empeche: 0, preventDefault() { e.empeche++; } }; return e; };
  return {
    bac, net, dom, form, ev,
    envoyer: (e) => soumettre.call(form, e || ev()),
    nouvelleDemande: () => dom.ecouteur('successionReset', 'click').call(dom.el('successionReset'), ev()),
  };
}

test('succession : deux declenchements rapproches -> un seul POST', async () => {
  const m = montageSuccession();
  m.envoyer();
  m.envoyer();
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1, 'le double clic doit produire un seul POST');
  assert.strictEqual(m.net.appels[0].url, '/api/subscribe');
});

test('succession : soumission implicite par Entree pendant l\'envoi -> aucun second POST', async () => {
  // Entrée dans un champ déclenche le même événement `submit` que le bouton.
  const m = montageSuccession();
  m.envoyer();
  await attendreBoucle();
  const e2 = m.ev();
  m.envoyer(e2);
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1);
  assert.strictEqual(e2.empeche, 1, 'preventDefault doit rester appele, meme quand la garde refuse');
});

test('succession : echec serveur -> garde liberee, saisie conservee, nouvelle tentative possible', async () => {
  const m = montageSuccession();
  m.envoyer();
  await m.net.repondre(0, { ok: false, status: 500 });
  assert.strictEqual(m.dom.el('successionBtn').disabled, false, 'bouton reactive apres echec');
  assert.strictEqual(m.form.hidden, false, 'le formulaire reste affiche');
  assert.strictEqual(m.form.reinitialise, false, 'la saisie ne doit pas etre effacee');
  assert.match(m.dom.el('successionMsg').textContent, /erreur est survenue/);
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2);
});

test('succession : coupure reseau -> la garde est liberee elle aussi', async () => {
  const m = montageSuccession();
  m.envoyer();
  await m.net.couper(0);
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2);
});

test('succession : succes -> la garde reste posee, aucun second POST', async () => {
  const m = montageSuccession();
  m.envoyer();
  await m.net.repondre(0, { ok: true, status: 200 });
  assert.strictEqual(m.form.hidden, true, 'formulaire masque apres succes');
  assert.strictEqual(m.dom.el('successionSuccess').hidden, false, 'ecran de confirmation attendu');
  m.envoyer();
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1, 'apres un succes, aucun envoi supplementaire');
});

test('succession : « Nouvelle demande » -> un nouvel envoi redevient possible', async () => {
  const m = montageSuccession();
  m.envoyer();
  await m.net.repondre(0, { ok: true, status: 200 });
  m.nouvelleDemande();
  assert.strictEqual(m.dom.el('successionBtn').disabled, false);
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 2, 'Nouvelle demande doit remettre la garde a zero');
});

test('succession : une saisie incomplete ne pose pas la garde', async () => {
  const m = montageSuccession();
  m.dom.el('s-ville').value = '';
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 0, 'aucun POST sans les champs obligatoires');
  m.dom.el('s-ville').value = 'Colombes';
  m.envoyer();
  await attendreBoucle();
  assert.strictEqual(m.net.appels.length, 1, 'la garde ne doit pas rester posee apres un refus de validation');
});

test('succession : garde posee apres preventDefault, un seul point de pose', () => {
  assert.ok(/ev\.preventDefault\(\);\s*\n\s*\/\/[^\n]*\n\s*if \(successionSending\) return;/.test(SUCC_SRC),
    'la garde doit etre verifiee juste apres preventDefault');
  // Un seul endroit pose la garde ; trois la mettent à faux : la déclaration,
  // la branche d'échec et « Nouvelle demande ». Aucun autre.
  assert.strictEqual((SUCC_SRC.match(/successionSending = true;/g) || []).length, 1);
  assert.strictEqual((SUCC_SRC.match(/let successionSending = false;/g) || []).length, 1);
  assert.strictEqual((SUCC_SRC.match(/successionSending = false;/g) || []).length, 3);
  // Rôles distincts : la mesure garde son propre drapeau, inchangé.
  assert.ok(/if \(!successionConvSent\) \{\s*\n\s*successionConvSent = true;/.test(SUCC_SRC));
  assert.ok(SUCC_SRC.includes("gtag('event', 'ads_conversion_Formulaire_1', { event_category: 'formulaire', event_label: 'succession-immobiliere' })"));
});

/* ════════════ 3. Contrat partagé ════════════ */

test('les deux pages gardent leur contrat de consentement et d\'anti-robot', () => {
  for (const [nom, src] of [[DECL, DECL_SRC], [SUCC, SUCC_SRC]]) {
    assert.ok(src.includes("consentVersion: 'marketing-consent-v1'"), nom + ' : version de consentement perdue');
    assert.ok(/consentMarketing: !!\(document\.getElementById\('pcConsent'\)/.test(src), nom + ' : case facultative perdue');
    assert.ok(src.includes('window.ProactifsCaptcha.reset()'), nom + ' : remise a zero du jeton anti-robot perdue');
    assert.ok(!/type="checkbox" id="pcConsent"[^>]*checked/.test(src), nom + ' : la case ne doit jamais etre prechochee');
  }
});
