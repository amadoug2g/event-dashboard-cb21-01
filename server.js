/**
 * server.js — Les Grandes Conversations / CB21
 * Read-only consultation app — proxies WeezEvent API server-side.
 * Credentials never exposed to the client. Auto-refreshes access token on expiry.
 */

require('dotenv').config();
const express  = require('express');
const https    = require('https');
const path     = require('path');
const qs       = require('querystring');

const app  = express();
const PORT = process.env.PORT || 3000;

const WZ_API_KEY  = process.env.WZ_API_KEY;
const WZ_EVENT_ID = process.env.WZ_EVENT_ID;
const WZ_USERNAME = process.env.WZ_USERNAME;
const WZ_PASSWORD = process.env.WZ_PASSWORD;
const SYNC_SECRET = process.env.SYNC_SECRET;
const REFRESH_MS  = parseInt(process.env.REFRESH_INTERVAL || '300000', 10);

let WZ_TOKEN = process.env.WZ_TOKEN;

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = {
  participants: [],
  lastSync: null,
  error: null,
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = qs.stringify(body);
    const opts = Object.assign(require('url').parse(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    });
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Token refresh ─────────────────────────────────────────────────────────────
async function refreshToken() {
  if (!WZ_USERNAME || !WZ_PASSWORD) throw new Error('No credentials for token refresh');
  console.log('[auth] Refreshing WeezEvent access token…');
  const res = await httpsPost('https://api.weezevent.com/auth/access_token', {
    username: WZ_USERNAME,
    password: WZ_PASSWORD,
    api_key:  WZ_API_KEY,
  });
  if (!res.body.accessToken) throw new Error('Token refresh failed: ' + JSON.stringify(res.body));
  WZ_TOKEN = res.body.accessToken;
  console.log('[auth] Token refreshed OK');
}

// ── WeezEvent fetch ───────────────────────────────────────────────────────────
async function fetchParticipants(token) {
  const url = `https://api.weezevent.com/participant/list` +
    `?api_key=${encodeURIComponent(WZ_API_KEY)}` +
    `&access_token=${encodeURIComponent(token)}` +
    `&id_event[]=${encodeURIComponent(WZ_EVENT_ID)}` +
    `&full=1`;
  return httpsGet(url);
}

async function syncParticipants() {
  if (!WZ_API_KEY || !WZ_TOKEN || !WZ_EVENT_ID) {
    cache.error = 'Configuration manquante — contacter l\'administrateur';
    console.warn('[sync] Missing env vars');
    return;
  }
  try {
    let res = await fetchParticipants(WZ_TOKEN);

    // If token expired (401 or API error), refresh and retry once
    if (res.status === 401 || res.body?.error) {
      await refreshToken();
      res = await fetchParticipants(WZ_TOKEN);
    }

    const raw = res.body.participants || res.body.data || res.body;
    cache.participants = Array.isArray(raw) ? raw : [];
    cache.lastSync = new Date().toISOString();
    cache.error = null;
    console.log(`[sync] OK — ${cache.participants.length} participants @ ${cache.lastSync}`);
  } catch (err) {
    cache.error = 'Erreur de synchronisation — réessai dans quelques minutes';
    console.error('[sync] Error:', err.message);
  }
}

// ── Routes (read-only) ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'analyse-cb21.html'));
});

app.get('/api/participants', (req, res) => {
  res.json({
    participants: cache.participants,
    lastSync:     cache.lastSync,
    error:        cache.error,
    count:        cache.participants.length,
  });
});

// Manual sync — protected by secret token
app.post('/api/sync', (req, res) => {
  const token = req.headers['x-sync-token'] || req.query.token;
  if (!SYNC_SECRET || token !== SYNC_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  syncParticipants().then(() => {
    res.json({ ok: true, lastSync: cache.lastSync, error: cache.error });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Polling WeezEvent every ${REFRESH_MS / 1000}s`);
  syncParticipants();
  setInterval(syncParticipants, REFRESH_MS);
});
