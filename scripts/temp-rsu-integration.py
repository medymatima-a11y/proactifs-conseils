#!/usr/bin/env python3
# TEMPORAIRE — intégration du service "Fiscalité RSU & stock-options" (à retirer après exécution)
# Modifie index.html (carte service, carte quiz, flow wizard, footer), bilan-patrimonial.html (option) et vercel.json (rewrite).
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def load(name):
    with open(os.path.join(ROOT, name), 'rb') as f:
        return f.read().decode('utf-8')

def save(name, s):
    with open(os.path.join(ROOT, name), 'wb') as f:
        f.write(s.encode('utf-8'))

def nl(s):
    return '\r\n' if '\r\n' in s[:2000] else '\n'

def insert_after_line(s, anchor, block):
    i = s.find(anchor)
    if i == -1:
        raise SystemExit('ANCRE INTROUVABLE: ' + anchor[:60])
    j = s.find('\n', i) + 1
    return s[:j] + block + s[j:]

# ---------- index.html ----------
s = load('index.html')
if "openWizard('rsu')" in s:
    print('index.html : déjà intégré, rien à faire')
else:
    N = nl(s)
    # 1. Carte service (grille services, après Déclaration d'impôts)
    i = s.find('<a class="svc-link" href="/declaration-impots-ile-de-france">')
    if i == -1: raise SystemExit('ancre svc declaration introuvable')
    p1 = s.find('        </div>', i)
    p2 = s.find('      </div>', p1)
    j = s.find('\n', p2) + 1
    card = (
        '      <div class="svc-card reveal d1">' + N +
        '        <img class="svc-img" src="/images/placement-financier.webp" alt="Fiscalité RSU, stock-options et actions gratuites">' + N +
        '        <div class="svc-body">' + N +
        '          <div class="svc-icon"><svg width="20" height="20" fill="none" stroke="#1E7A6E" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>' + N +
        '          <div class="svc-title">Fiscalité RSU &amp; stock-options</div>' + N +
        '          <p class="svc-desc">RSU, BSPCE, actions gratuites, ESPP… Déclarez sans erreur et transformez vos actions en patrimoine.</p>' + N +
        '          <a class="svc-link" href="/fiscalite-rsu-stock-options">En savoir plus <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>' + N +
        '        </div>' + N +
        '      </div>' + N
    )
    s = s[:j] + card + s[j:]

    # 2. Carte quiz (lead-cards, après Déclarer mes impôts)
    i = s.find('<div class="lead-card-desc">Revenus fonciers, LMNP, plus-values</div>')
    if i == -1: raise SystemExit('ancre lead-card declaration introuvable')
    p = s.find('      </div>', i)
    j = s.find('\n', p) + 1
    lead = (
        '      <div class="lead-card" onclick="openWizard(\'rsu\')">' + N +
        '        <div class="lead-card-icon">' + N +
        '          <svg width="20" height="20" fill="none" stroke="#C4973A" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>' + N +
        '        </div>' + N +
        '        <div class="lead-card-title">Optimiser mes RSU / stock-options</div>' + N +
        '        <div class="lead-card-desc">RSU, BSPCE, actions gratuites, dividendes</div>' + N +
        '        <div class="lead-card-arrow">Commencer <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>' + N +
        '      </div>' + N
    )
    s = s[:j] + lead + s[j:]

    # 3. Flow wizard rsu (avant la fermeture de l'objet flows)
    i = s.find("let wizService='', wizStep=0, wizAnswers=[];")
    if i == -1: raise SystemExit('ancre let wizService introuvable')
    k = s.rfind('};', 0, i)
    if k == -1: raise SystemExit('fermeture flows introuvable')
    flow = (
        '  ,rsu: {' + N +
        '    name:"Actionnariat salarié",' + N +
        '    steps:[' + N +
        '      { q:"Quel type de plan d\'actionnariat possédez-vous\\u00a0?", sub:"", opts:[' + N +
        '        {l:"RSU (Restricted Stock Units)", d:"Actions débloquées au vesting"},' + N +
        '        {l:"Stock-options ou BSPCE", d:"Options ou bons de souscription"},' + N +
        '        {l:"Actions gratuites (AGA)", d:"Plan d\'attribution français"},' + N +
        '        {l:"ESPP", d:"Actions achetées à prix réduit"},' + N +
        '        {l:"Plusieurs types", d:"RSU + ESPP, ou autre combinaison"}' + N +
        '      ]},' + N +
        '      { q:"Avez-vous vendu des actions cette année ou l\'an dernier\\u00a0?", sub:"", opts:[' + N +
        '        {l:"Oui, j\'ai vendu des actions", d:""},' + N +
        '        {l:"Non, pas encore", d:""},' + N +
        '        {l:"Sell-to-cover automatique au vesting", d:""}' + N +
        '      ]},' + N +
        '      { q:"Votre compte est-il détenu chez un courtier à l\'étranger\\u00a0?", sub:"Formulaire 3916 : déclaration obligatoire chaque année", opts:[' + N +
        '        {l:"Oui, et je le déclare chaque année", d:""},' + N +
        '        {l:"Oui, mais pas déclaré chaque année", d:""},' + N +
        '        {l:"Non, compte en France", d:""},' + N +
        '        {l:"Je ne sais pas", d:""}' + N +
        '      ]},' + N +
        '      { q:"Quelle part de votre patrimoine est investie dans les actions de votre entreprise\\u00a0?", sub:"", opts:[' + N +
        '        {l:"Moins de 10\\u00a0%", d:""},' + N +
        '        {l:"Entre 10 et 30\\u00a0%", d:""},' + N +
        '        {l:"Plus de 30\\u00a0%", d:""},' + N +
        '        {l:"Je ne sais pas exactement", d:""}' + N +
        '      ]},' + N +
        '      { q:"Informations complémentaires", sub:"Précisez votre situation ou vos questions si vous le souhaitez.", type:"textarea" }' + N +
        '    ]' + N +
        '  }' + N
    )
    s = s[:k] + flow + s[k:]

    # 4. wizIntros
    s = insert_after_line(s, "declaration:  { icon:'📋'",
        "  rsu:          { icon:'📊', title:'Vos actions, bien déclarées et bien investies', desc:'Quelques questions pour évaluer la fiscalité de vos RSU, stock-options ou BSPCE.' }," + N)

    # 5. lastStepLabels
    s = insert_after_line(s, "declaration:  'Faire vérifier ma déclaration →',",
        "    rsu:          'Recevoir mon analyse actionnariat →'," + N)

    # 6. _srcMap
    s = insert_after_line(s, "declaration:  'Quiz Déclaration impôts',",
        "      rsu:          'Quiz Actionnariat salarié'," + N)

    # 7. Footer services
    s = insert_after_line(s, '<a href="/optimisation-fiscale-ile-de-france">Optimisation fiscale</a>',
        '        <a href="/fiscalite-rsu-stock-options">Fiscalité RSU &amp; stock-options</a>' + N)

    save('index.html', s)
    print('index.html : 7 insertions OK')

# ---------- bilan-patrimonial.html ----------
s = load('bilan-patrimonial.html')
if 'value="actionnariat"' in s:
    print('bilan-patrimonial.html : déjà intégré')
else:
    N = nl(s)
    s = insert_after_line(s, '<option value="epargne">Placer mon épargne</option>',
        '            <option value="actionnariat">Optimiser mes RSU / stock-options</option>' + N)
    save('bilan-patrimonial.html', s)
    print('bilan-patrimonial.html : option ajoutée')

# ---------- vercel.json ----------
s = load('vercel.json')
if '/fiscalite-rsu-stock-options' in s:
    print('vercel.json : déjà intégré')
else:
    N = nl(s)
    s = insert_after_line(s, '"/optimisation-fiscale-ile-de-france.html" },',
        '    { "source": "/fiscalite-rsu-stock-options",       "destination": "/fiscalite-rsu-stock-options.html" },' + N)
    save('vercel.json', s)
    print('vercel.json : rewrite ajouté')

print('Terminé.')
