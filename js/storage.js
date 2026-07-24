// ═══════════════════════════════════════════════════════════════
//   STORAGE — storage adapter + save/load helpers
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   STORAGE ADAPTER
//   Three tiers, in priority order:
//   1. Firestore — when a Google account is signed in, every key
//      lives under users/{uid}/appdata/{key} so it follows that
//      account to any device.
//   2. window.storage — only exists inside the Claude.ai artifact
//      preview.
//   3. localStorage — plain browser fallback for signed-out use.
// ═══════════════════════════════════════════════════════════════
const hasArtifactStorage = typeof window.storage !== 'undefined'
  && window.storage && typeof window.storage.get === 'function';

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null; // set by onAuthStateChanged below

const ALL_STORE_KEYS = [
  'cricscore_v2_history', 'cricscore_v2_records', 'cricscore_v2_known_players',
  'cricscore_v2_theme', 'cricscore_v2_live_match', 'cricscore_v2_series',
  'cricscore_fastest_recovered_v1'
];

function cloudDoc(key) {
  return db.collection('users').doc(currentUser.uid).collection('appdata').doc(key);
}

const store = {
  async get(key) {
    if (currentUser) {
      try {
        const snap = await cloudDoc(key).get();
        return snap.exists ? { key, value: snap.data().value } : null;
      } catch(e) { console.error('firestore.get failed', key, e); return null; }
    }
    if (hasArtifactStorage) {
      try { return await window.storage.get(key, false); }
      catch(e) { console.error('storage.get failed', key, e); return null; }
    }
    try {
      const v = localStorage.getItem(key);
      return v !== null ? { key, value: v } : null;
    } catch(e) { console.error('localStorage.get failed', key, e); return null; }
  },
  async set(key, value) {
    if (currentUser) {
      try { await cloudDoc(key).set({ value }); return { key, value }; }
      catch(e) { console.error('firestore.set failed', key, e); return null; }
    }
    if (hasArtifactStorage) {
      try { return await window.storage.set(key, value, false); }
      catch(e) { console.error('storage.set failed', key, e); return null; }
    }
    try { localStorage.setItem(key, value); return { key, value }; }
    catch(e) { console.error('localStorage.set failed', key, e); return null; }
  }
};


// ═══════════════════════════════════════════════════════════════
//   STORAGE
// ═══════════════════════════════════════════════════════════════
async function loadHistory() {
  try { const r = await store.get(STORAGE_KEY); return r ? JSON.parse(r.value) : []; } catch(e) { console.error('loadHistory failed', e); return []; }
}
async function saveHistory(h) {
  try { await store.set(STORAGE_KEY, JSON.stringify(h)); } catch(e) { console.error('saveHistory failed', e); }
}
async function loadRecords() {
  try { const r = await store.get(RECORDS_KEY); return r ? migrateRecords(JSON.parse(r.value)) : emptyRecords(); } catch(e) { console.error('loadRecords failed', e); return emptyRecords(); }
}
async function saveRecords(r) {
  try { await store.set(RECORDS_KEY, JSON.stringify(r)); } catch(e) { console.error('saveRecords failed', e); }
}
async function loadKnownPlayers() {
  try { const r = await store.get(KNOWN_PLAYERS_KEY); return r ? JSON.parse(r.value) : []; } catch(e) { console.error('loadKnownPlayers failed', e); return []; }
}
async function saveKnownPlayers(list) {
  try { await store.set(KNOWN_PLAYERS_KEY, JSON.stringify(list)); } catch(e) { console.error('saveKnownPlayers failed', e); }
}

// ─── LIVE MATCH AUTOSAVE ────────────────────────────────────────────
// Persists the match currently being scored (including the setup state
// needed to rebuild the setup screen if the match is abandoned) so a
// closed tab, refresh, or dead phone battery never loses an over of
// scoring. Saved after every render — i.e. after every ball, wicket,
// batsman/bowler change, and undo — with no explicit "Save" step.
let liveMatchSaveTimer = null;
function autosaveMatch() {
  clearTimeout(liveMatchSaveTimer);
  liveMatchSaveTimer = setTimeout(async () => {
    try {
      if (matchState) {
        await store.set(LIVE_MATCH_KEY, JSON.stringify({ matchState, setupState, matchFormat, oversVal }));
      } else {
        await store.set(LIVE_MATCH_KEY, '');
      }
    } catch(e) { console.error('autosaveMatch failed', e); }
  }, 150);
}
async function loadLiveMatch() {
  try { const r = await store.get(LIVE_MATCH_KEY); return (r && r.value) ? JSON.parse(r.value) : null; } catch(e) { console.error('loadLiveMatch failed', e); return null; }
}
async function clearLiveMatch() {
  try { await store.set(LIVE_MATCH_KEY, ''); } catch(e) { console.error('clearLiveMatch failed', e); }
}

// ─── THEME ──────────────────────────────────────────────────────
// Persisted the same way as everything else (artifact storage when
// previewed in Claude.ai, localStorage when run as a standalone
// file) so the choice survives a reload, a closed tab, or coming
// back two days later.
async function loadTheme() {
  try { const r = await store.get(THEME_KEY); return r ? r.value : 'dark'; } catch(e) { return 'dark'; }
}
async function saveTheme(t) {
  try { await store.set(THEME_KEY, t); } catch(e) { console.error('saveTheme failed', e); }
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  const btn = document.getElementById('themeToggleBtn');
  const label = document.getElementById('themeToggleLabel');
  if (label) label.textContent = t === 'light' ? 'Light' : 'Dark';
  if (btn) btn.firstChild.textContent = t === 'light' ? '☀️ ' : '🌙 ';
}
async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  await saveTheme(next);
}
// Remembers a player name so it can be quickly re-added in future matches
// without retyping it (one tap from the quick-add chips, or autocomplete).
async function rememberPlayer(name) {
  const exists = knownPlayers.some(p => p.toLowerCase() === name.toLowerCase());
  if (exists) return;
  knownPlayers.push(name);
  knownPlayers.sort((a, b) => a.localeCompare(b));
  await saveKnownPlayers(knownPlayers);
  renderKnownPlayersUI();
}
// Records are kept separately per match format so a Test hundred and a
// T20 hundred never get mixed into the same leaderboard.
function emptyFormatRecords() {
  return {
    highestScores:[], mostSixes:[], mostFours:[], mostOnes:[], mostTwos:[], mostMaidens:[],
    fastest50:[], fastest100:[], highestSR:[], totalRuns:{}, playerCareer:{},
    teamHighestScores:[], teamLowestScores:[], teamHighestChases:[], teamLowestDefended:[]
  };
}
function emptyRecords() {
  return { normal: emptyFormatRecords(), test: emptyFormatRecords() };
}
// Older saves (pre format-split) stored everything flat at the top level.
// Treat that legacy data as "normal" format records so nothing is lost,
// and make sure both format buckets always exist going forward.
function migrateRecords(r) {
  if (!r) return emptyRecords();
  // Clean out any "undefinedb" entries a past bug left in fastest50/100 —
  // those had balls:undefined instead of a real ball count.
  const scrubFastest = (fmt) => {
    if (!fmt) return;
    if (Array.isArray(fmt.fastest50))  fmt.fastest50  = fmt.fastest50.filter(x => typeof x.balls === 'number');
    if (Array.isArray(fmt.fastest100)) fmt.fastest100 = fmt.fastest100.filter(x => typeof x.balls === 'number');
  };
  if (r.normal && r.test) {
    if (!r.normal.mostMaidens) r.normal.mostMaidens = [];
    if (!r.test.mostMaidens) r.test.mostMaidens = [];
    scrubFastest(r.normal);
    scrubFastest(r.test);
    return r;
  }
  const legacy = emptyFormatRecords();
  Object.keys(legacy).forEach(k => { if (r[k] !== undefined) legacy[k] = r[k]; });
  scrubFastest(legacy);
  return { normal: legacy, test: emptyFormatRecords() };
}
function fmtKey(format) { return format === 'test' ? 'test' : 'normal'; }


