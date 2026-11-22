/* ============================================================
   Clé d'idempotence des formulaires — client
   Fichier partagé par les dix pages qui écrivent dans `leads` via
   /api/subscribe et /api/subscribe-guide.

   À quoi ça sert. Les pages ont une garde de réentrance, mais elle ne protège
   que le navigateur qui l'exécute : elle ne peut rien contre une réponse perdue
   en route, un rechargement, un onglet dupliqué. Or chaque ligne insérée dans
   `leads` déclenche en base une notification interne ET un email de
   confirmation au visiteur. Un doublon n'est donc pas qu'une ligne de trop.
   D'où cette clé, jointe à chaque envoi : le serveur n'enregistre qu'une fois
   par clé (voir le bloc « Idempotence » de api/subscribe.js).

   Ce n'est pas une déduplication sur l'email. Une même personne peut adresser
   autant de demandes légitimes qu'elle veut : chacune reçoit sa propre clé.

   Ce qu'est une « demande logique », concrètement :
   - Même contenu, même session → même clé. Couvre la nouvelle tentative après
     un échec réseau ou un refus serveur, et le rechargement de la page suivi
     d'une saisie identique (sessionStorage survit au rechargement de l'onglet).
   - Contenu différent → nouvelle clé. Le visiteur a changé sa demande, ce n'est
     plus la même : elle doit pouvoir être enregistrée.
   - Succès confirmé, puis `oublier()` → nouvelle clé. Une demande volontaire
     de plus n'est pas un rejeu.
   - Nouvel onglet, navigateur fermé et réouvert → nouvelle session, donc
     nouvelle clé. C'est la frontière assumée du dispositif.

   L'empreinte calculée ici ne sert QU'À cette décision locale : réutiliser ou
   non la clé. Le serveur calcule la sienne, en SHA-256, et ne lit jamais
   celle-ci — sans quoi un client fautif pourrait faire passer un contenu
   différent pour un rejeu. Les deux n'ont pas à concorder, et un hachage
   rapide suffit donc ici.

   Jamais bloquant. sessionStorage indisponible (navigation privée, stockage
   bloqué) : une clé neuve est émise à chaque tentative. La protection serveur
   ne joue plus, le formulaire fonctionne exactement comme avant.
   ============================================================ */
(function (w) {
  'use strict';

  var PREFIXE = 'pc_idem_';

  function entrepot() {
    try {
      var s = w.sessionStorage;
      // Une simple lecture suffit à déclencher l'exception des contextes où
      // l'accès est refusé : on la provoque ici, une fois, plutôt qu'au
      // moment de l'envoi.
      s.getItem(PREFIXE + '_sonde');
      return s;
    } catch (e) {
      return null;
    }
  }

  /* Identifiant aléatoire. crypto.randomUUID() sur tous les navigateurs
     courants ; getRandomValues en repli ; Math.random en dernier recours, où
     l'unicité n'est plus garantie cryptographiquement — sans conséquence ici,
     la clé n'étant pas un secret mais un identifiant de requête. */
  function identifiant() {
    try {
      if (w.crypto && typeof w.crypto.randomUUID === 'function') return w.crypto.randomUUID();
      if (w.crypto && typeof w.crypto.getRandomValues === 'function') {
        var o = new Uint8Array(16);
        w.crypto.getRandomValues(o);
        var hex = '';
        for (var i = 0; i < o.length; i++) hex += ('0' + o[i].toString(16)).slice(-2);
        return hex;
      }
    } catch (e) { /* repli ci-dessous */ }
    var t = String(Date.now().toString(36));
    var r = String(Math.random()).slice(2) + String(Math.random()).slice(2);
    return (t + r).slice(0, 40);
  }

  /* JSON à clés triées, pour que deux objets de même contenu donnent le même
     texte quel que soit l'ordre de leurs propriétés. */
  function canonique(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      var out = [];
      for (var i = 0; i < v.length; i++) out.push(canonique(v[i]));
      return '[' + out.join(',') + ']';
    }
    var cles = Object.keys(v).sort();
    var parts = [];
    for (var k = 0; k < cles.length; k++) {
      parts.push(JSON.stringify(cles[k]) + ':' + canonique(v[cles[k]]));
    }
    return '{' + parts.join(',') + '}';
  }

  /* Champs volatils, exclus de l'empreinte. Le jeton anti-robot est régénéré à
     CHAQUE tentative (il ne vaut qu'une fois) : laissé dedans, il ferait de
     tout réessai un contenu « différent », donc une clé neuve, donc un doublon
     — l'exact contraire du but. Le champ piège et la clé elle-même n'ont pas
     davantage à peser sur l'identité de la demande. */
  var VOLATILES = ['captchaToken', 'idempotencyKey', 'hp'];

  function sansVolatiles(charge) {
    if (!charge || typeof charge !== 'object') return charge;
    var out = {};
    var cles = Object.keys(charge);
    for (var i = 0; i < cles.length; i++) {
      if (VOLATILES.indexOf(cles[i]) !== -1) continue;
      out[cles[i]] = charge[cles[i]];
    }
    return out;
  }

  /* Deux hachages 32 bits indépendants plus la longueur. Non cryptographique,
     et c'est voulu : une collision ferait réutiliser une clé pour un contenu
     différent, cas que le serveur refuse explicitement en 409. La combinaison
     rend ce risque négligeable sans dépendre de crypto.subtle, qui est
     asynchrone et imposerait de rendre tous les envois asynchrones. */
  function empreinte(charge) {
    var s;
    try { s = canonique(sansVolatiles(charge)); } catch (e) { return null; }
    var fnv = 0x811c9dc5;
    var djb = 5381;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      fnv = (fnv ^ c) >>> 0;
      fnv = (fnv + ((fnv << 1) + (fnv << 4) + (fnv << 7) + (fnv << 8) + (fnv << 24))) >>> 0;
      djb = (((djb << 5) + djb) + c) >>> 0;
    }
    return fnv.toString(16) + '-' + djb.toString(16) + '-' + s.length.toString(16);
  }

  /* Clé de la demande en cours pour cette portée (un identifiant par
     formulaire : 'subscribe:index', 'subscribe:succession', 'guide'…).
     Retourne toujours une chaîne : en cas de stockage indisponible, une clé
     neuve, qui ne protège rien mais ne casse rien. */
  function cle(portee, charge) {
    var e = empreinte(charge);
    var st = entrepot();
    var nom = PREFIXE + String(portee || 'defaut');
    if (st && e) {
      try {
        var brut = st.getItem(nom);
        if (brut) {
          var garde = JSON.parse(brut);
          // Même contenu que la dernière tentative : c'est un réessai, la clé
          // est conservée telle quelle.
          if (garde && garde.e === e && typeof garde.c === 'string' && garde.c) return garde.c;
        }
      } catch (err) { /* entrée illisible : on en pose une neuve */ }
    }
    var neuve = identifiant();
    if (st && e) {
      try { st.setItem(nom, JSON.stringify({ c: neuve, e: e })); } catch (err) { /* quota, mode privé */ }
    }
    return neuve;
  }

  /* À appeler quand une demande est CONFIRMÉE par le serveur, ou quand le
     visiteur repart explicitement d'une feuille blanche. La prochaine demande
     recevra une clé neuve, même à contenu identique. Ne jamais appeler sur un
     échec : c'est précisément là que la clé doit survivre. */
  function oublier(portee) {
    var st = entrepot();
    if (!st) return;
    try { st.removeItem(PREFIXE + String(portee || 'defaut')); } catch (e) { /* sans effet */ }
  }

  w.ProactifsIdem = {
    cle: cle,
    oublier: oublier,
    // Exposés pour les tests et le diagnostic ; aucune page ne les appelle.
    empreinte: empreinte,
    canonique: canonique,
    disponible: function () { return entrepot() !== null; }
  };
})(window);
