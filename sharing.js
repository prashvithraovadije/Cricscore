// ═══════════════════════════════════════════════════════════════
//   MATCH SHARING — cross-account match/profile sharing
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   MATCH SHARING — send a match's stats to someone else's account
//   Flow: sharer writes a copy of the match to shared_matches/{code}
//   (a flat, not-per-user collection). The recipient opens
//   ?import=CODE while signed into their own account; the app reads
//   that doc and merges the match into their own history + records
//   using the exact same logic as a normal save (see doSave above).
// ═══════════════════════════════════════════════════════════════
function sharedMatchDoc(code) { return db.collection('shared_matches').doc(code); }

function genShareCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/1/i/l/o — easy to read aloud
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// Writes a JSON-safe copy of a match to the shared collection and returns
// { code, link }. Requires the sharer to be signed in (so we know who to
// credit it to and can rate-limit/trace abuse later if needed).
async function shareMatch(matchLike) {
  if (!currentUser) throw new Error('not-signed-in');
  // Deep-clone via JSON to strip any non-serializable fields and guarantee
  // this is exactly what doSave() will see on the other end.
  const clone = JSON.parse(JSON.stringify(matchLike));
  // A match shared straight off the Result screen isn't "saved" yet, so it
  // has no .series field — force it to null so the importer's own
  // in-progress series (if any) never silently swallows this match.
  if (clone.series === undefined) clone.series = null;

  let code, attempts = 0;
  do {
    code = genShareCode();
    attempts++;
    const existing = await sharedMatchDoc(code).get();
    if (!existing.exists) break;
  } while (attempts < 5);

  await sharedMatchDoc(code).set({
    match: clone,
    sharedByUid: currentUser.uid,
    sharedByName: currentUser.displayName || currentUser.email || 'A friend',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const link = location.origin + location.pathname + '?import=' + code;
  return { code, link };
}

// Holds an ?import= code seen before the user was signed in, so it can be
// retried the moment sign-in completes.
let pendingImportCode = null;
let pendingImportSeriesCode = null;

function checkUrlForImportCode() {
  const params = new URLSearchParams(location.search);
  const code = params.get('import');
  if (code) pendingImportCode = code.trim();
  const seriesCode = params.get('importSeries');
  if (seriesCode) pendingImportSeriesCode = seriesCode.trim();
  const profileCode = params.get('profile');
  if (profileCode) {
    // Public profiles don't require sign-in to view, so this can run right away.
    openPublicProfile(profileCode.trim());
    const url = new URL(location.href);
    url.searchParams.delete('profile');
    history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }
}

// Strips ?import=... from the address bar without reloading, so refreshing
// the page (or importing a second match later) doesn't re-trigger this one.
function clearImportCodeFromUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('import');
  url.searchParams.delete('importSeries');
  history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
}

async function tryPendingImport() {
  if (pendingImportSeriesCode) {
    if (!currentUser) { showToast('Sign in with Google to import this series', true); }
    else {
      const code = pendingImportSeriesCode;
      pendingImportSeriesCode = null;
      await importSharedSeriesByCode(code);
    }
  }
  if (!pendingImportCode) return;
  if (!currentUser) {
    showToast('Sign in with Google to import this match', true);
    return;
  }
  const code = pendingImportCode;
  pendingImportCode = null;
  await importSharedMatchByCode(code);
}

async function importSharedMatchByCode(code) {
  code = (code || '').trim().toLowerCase();
  if (!code) return;
  if (!currentUser) { showToast('Sign in with Google first, then try the import again', true); return; }
  let snap;
  try { snap = await sharedMatchDoc(code).get(); }
  catch(e) { console.error('import fetch failed', e); showToast('Could not reach the share — check your connection', true); return; }
  if (!snap.exists) { showToast('That share link/code was not found', true); clearImportCodeFromUrl(); return; }

  const data = snap.data();
  const m = data.match;
  const teamsLabel = (m.teams?.A?.name || 'Team A') + ' vs ' + (m.teams?.B?.name || 'Team B');
  const dateLabel = m.date ? new Date(m.date).toLocaleDateString() : '';
  const sharedBy = data.sharedByName || 'a friend';

  const ok = confirm(
    '📥 Import match into your stats?\n\n' + teamsLabel + (dateLabel ? ' · ' + dateLabel : '') +
    '\nShared by ' + sharedBy +
    '\n\nThis adds the full scorecard and player stats from this match into your own History and Records.'
  );
  clearImportCodeFromUrl();
  if (!ok) return;

  m._sharedBy = sharedBy;
  try {
    await doSave(m);
    showToast('✅ Match imported — check History & Records');
    if (document.getElementById('historyScreen')?.classList.contains('active')) await renderHistory();
    await renderAllRecords();
    markShareAsImported(sharedMatchDoc(code));
  } catch(e) {
    console.error('import merge failed', e);
    showToast('Import failed — the shared data looked incomplete', true);
  }
}

// Records that the current user imported a share, so the original sharer
// can see it was picked up (visible via "My Shares").
async function markShareAsImported(docRef) {
  if (!currentUser) return;
  try {
    await docRef.update({
      importedBy: firebase.firestore.FieldValue.arrayUnion({
        uid: currentUser.uid, name: currentUser.displayName || currentUser.email || 'Someone', at: Date.now()
      })
    });
  } catch(e) { console.warn('could not record import receipt', e); }
}

// Keeps a small local (per-device) log of shares you've created, so "My
// Shares" can show whether each one has been imported yet.
async function recordMyShare(kind, code, label) {
  try {
    const raw = await store.get('myShares');
    const list = raw ? JSON.parse(raw.value) : [];
    list.unshift({ kind, code, label, createdAt: Date.now() });
    await store.set('myShares', JSON.stringify(list.slice(0, 30)));
  } catch(e) { console.warn('could not record share', e); }
}

async function openMyShares() {
  const raw = await store.get('myShares').catch(() => null);
  const list = raw ? JSON.parse(raw.value) : [];
  const modal = document.getElementById('mySharesModal');
  const body = document.getElementById('mySharesBody');
  if (!list.length) {
    body.innerHTML = '<div class="empty-state">You haven\'t shared anything yet</div>';
    modal.classList.add('show');
    return;
  }
  body.innerHTML = list.map(s => '<div class="rec-item" id="myshare-'+s.code+'">' +
    '<div style="flex:1"><div class="rec-name">'+(s.label||s.code)+'</div>' +
    '<div class="rec-team">'+({match:'Match',series:'Series',profile:'Profile'}[s.kind]||s.kind)+' · '+new Date(s.createdAt).toLocaleDateString()+'</div></div>' +
    '<div style="font-size:12px;color:var(--text-dim)">Checking…</div></div>').join('');
  modal.classList.add('show');

  const collFor = k => k === 'series' ? 'shared_series' : k === 'profile' ? 'shared_profiles' : 'shared_matches';
  for (const s of list) {
    try {
      const snap = await db.collection(collFor(s.kind)).doc(s.code).get();
      const el = document.getElementById('myshare-'+s.code);
      if (!el) continue;
      const importedBy = snap.exists ? (snap.data().importedBy || []) : [];
      const statusEl = el.querySelector('div:last-child');
      statusEl.innerHTML = !snap.exists ? '<span style="color:var(--text-dim)">Not found</span>' :
        s.kind === 'profile' ? '<span style="color:var(--text-dim)">🔗 View-only link (no import step)</span>' :
        importedBy.length ? '<span style="color:var(--green)">✅ Imported by ' + importedBy.map(i=>i.name).join(', ') + '</span>' :
        '<span style="color:var(--text-dim)">Not imported yet</span>';
    } catch(e) { /* ignore individual lookup failures */ }
  }
}

function closeMySharesModal() {
  document.getElementById('mySharesModal').classList.remove('show');
}

// Lets someone paste a code by hand (e.g. if a link got mangled by a
// messaging app) instead of needing the full ?import=... URL.
function promptImportCode() {
  const code = prompt('Paste the share code your friend sent you (the letters after "import=" in their link):');
  if (code) importSharedMatchByCode(code);
}

// ── Share modal (used both from the just-finished Result screen and from
// a saved History entry) ───────────────────────────────────────────────
async function openShareModal(matchLike) {
  if (!currentUser) {
    showToast('Sign in with Google to share this match', true);
    return;
  }
  showToast('Creating share link…');
  try {
    const { code, link } = await shareMatch(matchLike);
    const label = (matchLike.teams?.A?.name || 'Team A') + ' vs ' + (matchLike.teams?.B?.name || 'Team B');
    await recordMyShare('match', code, label);
    presentShareLink(link);
  } catch(e) {
    console.error('share failed', e);
    showToast('Could not create the share link — try again', true);
  }
}

function shareCurrentResult() {
  if (!matchState) return;
  openShareModal(matchState);
}

function shareHistoryMatch() {
  const m = lastHistoryData.find(h => h.id === openHistoryMatchId);
  if (!m) return;
  openShareModal(m);
}

// ── Share a whole series at once ────────────────────────────────────────
function sharedSeriesDoc(code) { return db.collection('shared_series').doc(code); }

async function shareSeries() {
  if (!seriesState) { showToast('No active series to share', true); return; }
  if (!currentUser) { showToast('Sign in with Google to share this series', true); return; }
  const history = await loadHistory();
  const matches = history.filter(m => m.series && m.series.seriesId === seriesState.id);
  if (!matches.length) { showToast('No completed matches in this series yet', true); return; }

  showToast('Creating share link…');
  try {
    const clone = JSON.parse(JSON.stringify(matches));
    let code, attempts = 0;
    do {
      code = genShareCode(); attempts++;
      const ex = await sharedSeriesDoc(code).get();
      if (!ex.exists) break;
    } while (attempts < 5);
    await sharedSeriesDoc(code).set({
      matches: clone,
      seriesLabel: seriesState.label,
      sharedByUid: currentUser.uid,
      sharedByName: currentUser.displayName || currentUser.email || 'A friend',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const link = location.origin + location.pathname + '?importSeries=' + code;
    await recordMyShare('series', code, seriesState.label);
    presentShareLink(link);
  } catch(e) {
    console.error('series share failed', e);
    showToast('Could not create the series link — try again', true);
  }
}

async function importSharedSeriesByCode(code) {
  code = (code || '').trim().toLowerCase();
  if (!code) return;
  if (!currentUser) { showToast('Sign in with Google first, then try the import again', true); return; }
  let snap;
  try { snap = await sharedSeriesDoc(code).get(); }
  catch(e) { console.error('series import fetch failed', e); showToast('Could not reach the share — check your connection', true); return; }
  if (!snap.exists) { showToast('That series link/code was not found', true); clearImportCodeFromUrl(); return; }

  const data = snap.data();
  const matches = data.matches || [];
  const sharedBy = data.sharedByName || 'a friend';
  const ok = confirm(
    '📥 Import series "' + (data.seriesLabel || 'Series') + '"?\n\n' +
    matches.length + ' match' + (matches.length!==1?'es':'') + ' · shared by ' + sharedBy +
    '\n\nThis adds every match in this series to your own History and Records.'
  );
  clearImportCodeFromUrl();
  if (!ok) return;

  let imported = 0;
  for (const m of matches) {
    m._sharedBy = sharedBy;
    try { await doSave(m); imported++; }
    catch(e) { console.error('series match import failed', e); }
  }
  showToast('✅ Imported ' + imported + '/' + matches.length + ' matches from the series');
  if (document.getElementById('historyScreen')?.classList.contains('active')) await renderHistory();
  await renderAllRecords();
  if (imported > 0) markShareAsImported(sharedSeriesDoc(code));
}

function closeShareLinkOverlay() {
  document.getElementById('shareLinkOverlay').classList.remove('show');
}

// Populates the share modal (link text + QR code) and shows it. Shared by
// match, series, and profile sharing so the QR logic lives in one place.
function presentShareLink(link) {
  document.getElementById('shareLinkInput').value = link;
  const qrEl = document.getElementById('shareQrCode');
  qrEl.innerHTML = '';
  try {
    if (window.QRCode) new QRCode(qrEl, { text: link, width: 160, height: 160, colorDark: '#000000', colorLight: '#ffffff' });
  } catch(e) { console.warn('QR generation failed', e); }
  document.getElementById('shareLinkOverlay').classList.add('show');
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard?.writeText(input.value).then(
    () => showToast('Link copied!'),
    () => document.execCommand('copy')
  );
}

// ── Head-to-Head comparison ─────────────────────────────────────────────
function openHeadToHead() {
  const roster = careerRosterCache || [];
  if (roster.length < 2) { showToast('Need at least 2 players with stats to compare'); return; }
  const names = roster.map(p => p.name).sort();
  const opts = names.map(n => '<option value="'+n+'">'+n+'</option>').join('');
  document.getElementById('h2hPlayerA').innerHTML = opts;
  document.getElementById('h2hPlayerB').innerHTML = opts;
  document.getElementById('h2hPlayerB').selectedIndex = Math.min(1, names.length - 1);
  document.getElementById('h2hResults').innerHTML = '';
  document.getElementById('headToHeadModal').classList.add('show');
}

async function renderHeadToHead() {
  const nameA = document.getElementById('h2hPlayerA').value;
  const nameB = document.getElementById('h2hPlayerB').value;
  const resultsEl = document.getElementById('h2hResults');
  if (!nameA || !nameB || nameA === nameB) { resultsEl.innerHTML = '<div class="empty-state">Pick two different players</div>'; return; }
  const roster = careerRosterCache || [];
  const pA = roster.find(p => p.name === nameA), pB = roster.find(p => p.name === nameB);
  if (!pA || !pB) return;

  const history = await loadHistory();
  const formatKey = fmtKey(currentStatsFormatTab);
  const h2h = computeHeadToHead(history, nameA, nameB, formatKey);

  const row = (label, valA, valB, higherBetter) => {
    const aWins = higherBetter ? valA > valB : valA < valB;
    const bWins = higherBetter ? valB > valA : valB < valA;
    return '<tr><td style="text-align:right;font-weight:'+(aWins?'700':'400')+';color:'+(aWins?'var(--accent2)':'var(--text)')+'">'+valA+'</td>' +
      '<td style="text-align:center;color:var(--text-dim);font-size:11px">'+label+'</td>' +
      '<td style="text-align:left;font-weight:'+(bWins?'700':'400')+';color:'+(bWins?'var(--accent2)':'var(--text)')+'">'+valB+'</td></tr>';
  };

  resultsEl.innerHTML =
    '<div style="display:flex;justify-content:space-between;font-family:var(--font-display);font-weight:700;margin-bottom:10px">' +
      '<div>'+nameA+'</div><div>'+nameB+'</div></div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      row('Matches', pA.matches, pB.matches, true) +
      row('Runs', pA.runs, pB.runs, true) +
      row('Average', fmtAvg(pA.avg), fmtAvg(pB.avg), true) +
      row('Strike Rate', pA.sr===null?'—':pA.sr.toFixed(1), pB.sr===null?'—':pB.sr.toFixed(1), true) +
      row('Highest Score', pA.highestScore, pB.highestScore, true) +
      row('Sixes', pA.sixes, pB.sixes, true) +
      row('Wickets', pA.bowling.wickets, pB.bowling.wickets, true) +
      row('Economy', pA.bowling.economy===null?'—':pA.bowling.economy.toFixed(1), pB.bowling.economy===null?'—':pB.bowling.economy.toFixed(1), false) +
      row('POTM Awards', pA.motmAwards, pB.motmAwards, true) +
    '</table>' +
    '<div class="pm-section-title" style="margin-top:16px">On the Field</div>' +
    '<div style="font-size:13px;color:var(--text-muted);line-height:1.8">' +
      (h2h.matchesFacedOff > 0 ? (
        '🎯 ' + nameA + ' has dismissed ' + nameB + ' <strong style="color:var(--text)">' + h2h.aDismissedB + '</strong> time' + (h2h.aDismissedB!==1?'s':'') + '<br>' +
        '🎯 ' + nameB + ' has dismissed ' + nameA + ' <strong style="color:var(--text)">' + h2h.bDismissedA + '</strong> time' + (h2h.bDismissedA!==1?'s':'') + '<br>' +
        '🏏 ' + nameA + ' has scored ' + h2h.aRunsVsB + ' runs off ' + h2h.bBallsVsA + ' balls facing ' + nameB + '<br>' +
        '🏏 ' + nameB + ' has scored ' + h2h.bRunsVsA + ' runs off ' + h2h.aBallsVsB + ' balls facing ' + nameA + '<br>' +
        '📅 They\'ve faced off in <strong style="color:var(--text)">' + h2h.matchesFacedOff + '</strong> match' + (h2h.matchesFacedOff!==1?'es':'')
      ) : 'These two haven\'t bowled at each other in any saved match yet.') +
    '</div>';
}


