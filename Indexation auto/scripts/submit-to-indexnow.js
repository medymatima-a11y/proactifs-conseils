#!/usr/bin/env node
/**
 * Soumet une liste d'URLs à IndexNow (Bing, Yandex, Seznam, Naver).
 *
 * Prérequis :
 * - Fichier {KEY}.txt hébergé à la racine du site avec la clé en contenu
 *   ex: https://proactifsconseils.fr/cc5c2c356f2cc4936f46810d6ddba8b8.txt
 *
 * Usage :
 *   node scripts/submit-to-indexnow.js "url1" "url2" ...
 *   echo "url1" | node scripts/submit-to-indexnow.js -
 *
 * Variables d'env :
 *   DRY_RUN=1  : log uniquement
 */

const https = require('https');

const HOST = 'proactifsconseils.fr';
const KEY = 'cc5c2c356f2cc4936f46810d6ddba8b8';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function readUrlsFromArgv() {
  const args = process.argv.slice(2);
  if (args.length === 0) return [];
  if (args.length === 1 && args[0] === '-') {
    const input = require('fs').readFileSync(0, 'utf8');
    return input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

function submit(urls) {
  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const urls = readUrlsFromArgv();
  if (urls.length === 0) {
    console.log('[indexnow] aucune URL à soumettre');
    return;
  }

  if (process.env.DRY_RUN) {
    console.log('[indexnow] DRY_RUN — URLs qui seraient soumises :');
    urls.forEach((u) => console.log('  ' + u));
    return;
  }

  // IndexNow accepte max 10 000 URLs par requête, mais on batch par 100 par sécurité
  const BATCH = 100;
  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    console.log(`[indexnow] envoi de ${slice.length} URLs (batch ${i / BATCH + 1})`);
    try {
      const res = await submit(slice);
      // 200 = OK, 202 = Accepted, 422 = URLs invalides, 429 = trop de requêtes
      if (res.status === 200 || res.status === 202) {
        console.log(`  ✓ status ${res.status}`);
      } else {
        console.log(`  ⚠ status ${res.status} — ${res.body.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`  ✗ erreur :`, err.message);
    }
  }
}

main().catch((err) => {
  console.error('[indexnow] erreur fatale :', err.message);
  process.exit(1);
});
