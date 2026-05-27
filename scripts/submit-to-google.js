#!/usr/bin/env node
/**
 * Soumet une liste d'URLs à la Google Indexing API.
 *
 * Prérequis :
 * - Compte de service Google Cloud avec l'Indexing API activée
 * - Service account ajouté comme Propriétaire dans Search Console
 * - Secret GitHub GOOGLE_INDEXING_API_KEY contenant le JSON complet du compte de service
 *
 * Usage :
 *   node scripts/submit-to-google.js "url1" "url2" ...
 *   OU
 *   echo "url1\nurl2" | node scripts/submit-to-google.js -
 *
 * Variables d'env :
 *   GOOGLE_INDEXING_API_KEY  : contenu JSON du compte de service (obligatoire)
 *   DRY_RUN=1                 : log uniquement, n'appelle pas l'API
 */

const crypto = require('crypto');
const https = require('https');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPE = 'https://www.googleapis.com/auth/indexing';

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(creds) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.private_key);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) resolve(parsed.access_token);
            else reject(new Error(`Token error: ${data}`));
          } catch (e) {
            reject(new Error(`Token parse error: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postNotification(token, url) {
  const body = JSON.stringify({ url, type: 'URL_UPDATED' });
  return new Promise((resolve) => {
    const req = https.request(
      INDEXING_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ url, status: res.statusCode, body: data });
        });
      }
    );
    req.on('error', (err) => resolve({ url, status: 0, body: err.message }));
    req.write(body);
    req.end();
  });
}

function readUrlsFromArgv() {
  const args = process.argv.slice(2);
  if (args.length === 0) return [];
  if (args.length === 1 && args[0] === '-') {
    const input = require('fs').readFileSync(0, 'utf8');
    return input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

async function main() {
  const urls = readUrlsFromArgv();
  if (urls.length === 0) {
    console.log('[google] aucune URL à soumettre');
    return;
  }

  if (process.env.DRY_RUN) {
    console.log('[google] DRY_RUN — URLs qui seraient soumises :');
    urls.forEach((u) => console.log('  ' + u));
    return;
  }

  const keyJson = process.env.GOOGLE_INDEXING_API_KEY;
  if (!keyJson) {
    console.error('[google] GOOGLE_INDEXING_API_KEY manquante — skip');
    process.exit(0); // skip, ne casse pas le workflow
  }

  let creds;
  try {
    creds = JSON.parse(keyJson);
  } catch (e) {
    console.error('[google] GOOGLE_INDEXING_API_KEY n\'est pas du JSON valide');
    process.exit(1);
  }

  if (!creds.client_email || !creds.private_key) {
    console.error('[google] JSON invalide : client_email ou private_key manquant');
    process.exit(1);
  }

  console.log(`[google] obtention du token pour ${creds.client_email}`);
  const token = await getAccessToken(creds);

  console.log(`[google] soumission de ${urls.length} URLs`);
  for (const url of urls) {
    const result = await postNotification(token, url);
    if (result.status === 200) {
      console.log(`  ✓ ${url}`);
    } else {
      console.log(`  ✗ ${url} (status ${result.status}) — ${result.body.slice(0, 200)}`);
    }
  }
}

main().catch((err) => {
  console.error('[google] erreur fatale :', err.message);
  process.exit(1);
});
