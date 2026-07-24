// ═══════════════════════════════════════════════════════════════
//   INIT — application entry point
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   INIT
// ═══════════════════════════════════════════════════════════════
// One-time repair for the "undefinedb" bug: those broken leaderboard
// entries got scrubbed out by migrateRecords, but the real ball-by-ball
// data to recreate them correctly was there all along in each match's
// saved ball log. This rebuilds Fastest 50/100 fresh from history instead
// of leaving that data gone, using the same milestone logic as a live match.
const FASTEST_RECOVERY_FLAG = 'cricscore_fastest_recovered_v1';
async function recoverFastestRecordsFromHistory() {
  try {
    const already = await store.get(FASTEST_RECOVERY_FLAG);
    if (already) return;
  } catch(e) { /* not run yet */ }

  const history = await loadHistory();
  if (!history.length) { try { await store.set(FASTEST_RECOVERY_FLAG, '1'); } catch(e){} return; }

  const rebuilt = { normal: { fastest50:[], fastest100:[] }, test: { fastest50:[], fastest100:[] } };
  history.forEach(m => {
    const fk = fmtKey(m.format);
    (m.innings || []).filter(Boolean).forEach(inn => {
      const teamName = (m.teams && m.teams[inn.batTeam] && m.teams[inn.batTeam].name) || inn.batTeam;
      (inn.batsmen || []).forEach(b => {
        if (!(b.balls > 0 || (b.status && b.status !== 'yet to bat'))) return;
        const ms = computeMilestoneBalls(inn.ballLog, b.name);
        if (typeof ms.fifty === 'number')   rebuilt[fk].fastest50.push({ name: b.name, team: teamName, balls: ms.fifty });
        if (typeof ms.hundred === 'number') rebuilt[fk].fastest100.push({ name: b.name, team: teamName, balls: ms.hundred });
      });
    });
  });

  const allRecords = await loadRecords();
  ['normal','test'].forEach(fk => {
    rebuilt[fk].fastest50.sort((a,b)=>a.balls-b.balls);
    rebuilt[fk].fastest100.sort((a,b)=>a.balls-b.balls);
    allRecords[fk].fastest50 = rebuilt[fk].fastest50.slice(0,5);
    allRecords[fk].fastest100 = rebuilt[fk].fastest100.slice(0,5);
  });
  await saveRecords(allRecords);
  try { await store.set(FASTEST_RECOVERY_FLAG, '1'); } catch(e){}
}

async function init() {
  renderPlayerList('A');
  renderPlayerList('B');
  await reloadAppData();
}

checkUrlForImportCode();

// Wait for Firebase to resolve whether a Google account is already signed
// in on this device before loading any data — this avoids briefly flashing
// local data and then swapping to cloud data a moment later.
let authReady = false;
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  renderAuthArea();

  if (!authReady) {
    authReady = true;
    if (user) await migrateLocalToCloudIfNeeded();
    init();
    await tryPendingImport();
    return;
  }

  // Auth state changed after the app already loaded (user clicked sign in
  // or sign out mid-session) — bring in the right data for the new state.
  if (user) {
    showToast('Signed in as ' + (user.displayName || user.email || 'Google account'));
    await migrateLocalToCloudIfNeeded();
  } else {
    showToast('Signed out — using this device\'s local storage');
  }
  await reloadAppData();
  await tryPendingImport();
});


