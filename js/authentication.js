// ═══════════════════════════════════════════════════════════════
//   AUTH — Google Sign-In + cross-device sync
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   AUTH — Google Sign-In + cross-device sync
// ═══════════════════════════════════════════════════════════════
async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    console.error('sign-in failed', e);
    showToast('Sign-in failed — try again', true);
  }
}

async function signOutUser() {
  try { await auth.signOut(); }
  catch(e) { console.error('sign-out failed', e); }
}

// The first time a device signs in, if the cloud account has no data yet
// but this browser has local matches/records, copy them up so nothing
// already scored gets lost.
async function migrateLocalToCloudIfNeeded() {
  if (!currentUser) return;
  for (const key of ALL_STORE_KEYS) {
    try {
      const cloudSnap = await cloudDoc(key).get();
      if (cloudSnap.exists) continue; // cloud already has this key, don't overwrite
      const localVal = hasArtifactStorage ? null : localStorage.getItem(key);
      if (localVal !== null && localVal !== '') {
        await cloudDoc(key).set({ value: localVal });
      }
    } catch(e) { console.error('migration failed for', key, e); }
  }
}

function renderAuthArea() {
  const el = document.getElementById('authArea');
  if (currentUser) {
    el.innerHTML =
      '<img class="auth-avatar" src="' + (currentUser.photoURL || '') + '" alt="">' +
      '<span class="auth-name" title="' + (currentUser.displayName || currentUser.email || '') + '">' +
      (currentUser.displayName || currentUser.email || 'Signed in') + '</span>' +
      '<button class="btn btn-ghost btn-sm" onclick="signOutUser()"><span class="btn-label">Sign out</span></button>';
  } else {
    el.innerHTML =
      '<button class="btn btn-google btn-sm" onclick="signInWithGoogle()">' +
      '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.4 0 10.2-1.9 13.8-5.1l-6.4-5.4C29.4 36.6 26.9 37.5 24 37.5c-5.4 0-9.9-3.1-11.3-7.9l-6.6 5.1C9.5 40.6 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2 3.9-3.7 5.2l6.4 5.4C40.7 36.5 45 30.9 45 24c0-1.4-.1-2.4-.4-3.5z"/></svg>' +
      '<span class="btn-label">Sign in with Google</span></button>';
  }
}

// Reload every piece of app data from whichever backend is now active
// (called on first load once auth state is known, and again any time
// the user signs in or out mid-session).
async function reloadAppData() {
  const savedTheme = await loadTheme();
  applyTheme(savedTheme);

  knownPlayers = await loadKnownPlayers();
  renderKnownPlayersUI();
  await recoverFastestRecordsFromHistory();
  await renderAllRecords();

  const savedSeries = await loadSeries();
  seriesState = savedSeries || null;
  document.getElementById('headerSeriesBtn').style.display = seriesState ? '' : 'none';

  const savedMatch = await loadLiveMatch();
  if (savedMatch && savedMatch.matchState) {
    matchState = savedMatch.matchState;
    setupState = savedMatch.setupState || setupState;
    matchFormat = savedMatch.matchFormat || matchFormat;
    oversVal = savedMatch.oversVal || oversVal;
    showScreen('matchScreen');
    renderMatch();
  } else if (seriesState) {
    renderSeriesScreen();
    showScreen('seriesScreen');
  } else {
    showScreen('setupScreen');
  }
}

let oversVal = 20;
let matchFormat = 'limited'; // 'limited' | 'test'
let tossFlipped = false;
let tossWinnerTeam = null;
let tempStriker = null, tempNonStriker = null, tempBowler = null, tempNextBatsman = null;

let setupState = {
  teamA: { name: 'Team Alpha', players: [] },
  teamB: { name: 'Team Beta', players: [] }
};

let matchState = null;
let knownPlayers = [];


