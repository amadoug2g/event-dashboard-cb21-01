/**
 * server.js — Les Grandes Conversations / CB21
 * Read-only consultation app — proxies WeezEvent API server-side,
 * serves the HTML dashboard. No mutation endpoints exposed publicly.
 */

require('dotenv').config();
const express = require('express');
const https   = require('https');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const WZ_API_KEY  = process.env.WZ_API_KEY;
const WZ_TOKEN    = process.env.WZ_TOKEN;
const WZ_EVENT_ID = process.env.WZ_EVENT_ID;
const SYNC_SECRET = process.env.SYNC_SECRET;
const REFRESH_MS  = parseInt(process.env.REFRESH_INTERVAL || '300000', 10);

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = {
  participants: [],
  lastSync: null,
  error: null,
};

// ── WeezEvent fetch ───────────────────────────────────────────────────────────
function fetchWeezEvent() {
  return new Promise((resolve, reject) => {
    const url = `https://api.weezevent.com/participant/list` +
      `?api_key=${encodeURIComponent(WZ_API_KEY)}` +
      `&access_token=${encodeURIComponent(WZ_TOKEN)}` +
      `&id_event[]=${encodeURIComponent(WZ_EVENT_ID)}` +
      `&full=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function syncParticipants() {
  if (!WZ_API_KEY || !WZ_TOKEN || !WZ_EVENT_ID) {
    cache.error = 'Configuration manquante — contacter l\'administrateur';
    console.warn('[sync] Missing env vars');
    return;
  }
  try {
    const json = await fetchWeezEvent();
    const raw = json.participants || json.data || json;
    cache.participants = Array.isArray(raw) ? raw : [];
    cache.lastSync = new Date().toISOString();
    cache.error = null;
    console.log(`[sync] OK — ${cache.participants.length} participants @ ${cache.lastSync}`);
  } catch (err) {
    cache.error = 'Erreur de synchronisation — réessai dans quelques minutes';
    console.error('[sync] Error:', err.message);
  }
}

// ── Routes (lecture seule) ────────────────────────────────────────────────────

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

// Manual sync — protected by secret token, not exposed publicly
app.post('/api/sync', (req, res) => {
  const token = req.headers['x-sync-token'] || req.query.token;
  if (!SYNC_SECRET || token !== SYNC_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  syncParticipants().then(() => {
    res.json({ ok: true, lastSync: cache.lastSync });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Polling WeezEvent every ${REFRESH_MS / 1000}s`);
  syncParticipants();
  setInterval(syncParticipants, REFRESH_MS);
});
