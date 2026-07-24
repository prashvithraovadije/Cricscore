// ═══════════════════════════════════════════════════════════════
//   SCORECARD — scorecard, highlights, partnerships, over history
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   SCORECARD
// ═══════════════════════════════════════════════════════════════
function renderBattingScorecard(inn) {
  const teamName = matchState.teams[inn.batTeam].name;
  document.getElementById('battingTeamHead').textContent = teamName + ' — Batting';
  const batted = inn.batsmen.filter(b => b.status !== 'yet to bat');
  const yetTo = inn.batsmen.filter(b => b.status === 'yet to bat');
  let html = batted.map(b => {
    const sr = b.balls > 0 ? (b.runs/b.balls*100).toFixed(1) : '-';
    const statusEl = b.status === 'batting'
      ? '<span style="color:var(--accent2);font-size:10px">batting ▶</span>'
      : b.status === 'not out'
        ? '<span class="not-out">not out</span>'
        : '<span class="batting-status">' + b.status.replace('out: ','') + '</span>';
    const runsColor = b.runs >= 100 ? 'var(--yellow)' : b.runs >= 50 ? 'var(--accent2)' : 'var(--text)';
    return '<tr onclick="showPlayerModal(\'' + b.name.replace(/'/g,"\\'") + '\',\'' + inn.batTeam + '\')" style="cursor:pointer">' +
      '<td><div class="batting-name">' + b.name + '</div><div>' + statusEl + '</div></td>' +
      '<td class="runs-cell" style="color:' + runsColor + '">' + b.runs + '</td>' +
      '<td>' + b.balls + '</td>' +
      '<td><span class="four-badge">' + b.fours + '</span></td>' +
      '<td><span class="six-badge">' + b.sixes + '</span></td>' +
      '<td class="sr-cell">' + sr + '</td></tr>';
  }).join('');
  if (yetTo.length) {
    html += '<tr><td colspan="6" style="padding:6px 10px;font-size:11px;color:var(--text-dim)">Yet to bat: ' + yetTo.map(b=>b.name).join(', ') + '</td></tr>';
  }
  document.getElementById('battingTbody').innerHTML = html;
  const e = inn.extras;
  document.getElementById('extrasRow').textContent = 'Extras: ' + (e.wide+e.noBall+e.bye+e.legBye) +
    ' (Wd ' + e.wide + ', Nb ' + e.noBall + ', B ' + e.bye + ', LB ' + e.legBye + ')';
}

function renderBowlingScorecard(inn) {
  const bowled = inn.bowlers.filter(b => b.balls > 0);
  if (!bowled.length) {
    document.getElementById('bowlingTbody').innerHTML = '<tr><td colspan="6" style="padding:10px;font-size:13px;color:var(--text-muted)">No bowling yet</td></tr>';
    return;
  }
  document.getElementById('bowlingTbody').innerHTML = bowled.map(b => {
    const ov = b.balls/6;
    const econ = ov > 0 ? (b.runs/ov).toFixed(1) : '-';
    return '<tr><td class="batting-name">' + b.name + '</td>' +
      '<td>' + fmtOvers(b.balls) + '</td><td>' + (b.maidens||0) + '</td><td>' + b.runs + '</td>' +
      '<td style="color:' + (b.wickets>0?'var(--red)':'var(--text)') + ';font-family:var(--font-display);font-size:14px;font-weight:700">' + b.wickets + '</td>' +
      '<td class="sr-cell">' + econ + '</td></tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//   MATCH HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════
function renderMatchHighlights(inn) {
  const el = document.getElementById('matchHighlightsList');
  const batted = inn.batsmen.filter(b => b.balls > 0);
  if (!batted.length) { el.innerHTML = '<div class="empty-state" style="padding:8px">Stats appear as you play</div>'; return; }
  const top = [...batted].sort((a,b) => b.runs-a.runs)[0];
  const topSR = [...batted].filter(b=>b.balls>=5).sort((a,b)=>(b.runs/b.balls)-(a.runs/a.balls))[0];
  const topSix = [...batted].sort((a,b)=>b.sixes-a.sixes)[0];
  const topBwl = inn.bowlers.filter(b=>b.balls>0).sort((a,b)=>b.wickets-a.wickets)[0];
  let html = '';
  if (top) html += hlItem('🏆 Top Scorer', top.name, top.runs+'('+top.balls+'b)');
  if (topSix && topSix.sixes > 0) html += hlItem('💥 Most Sixes', topSix.name, topSix.sixes+'×6');
  if (topSR && topSR.balls >= 5) html += hlItem('⚡ Best SR', topSR.name, (topSR.runs/topSR.balls*100).toFixed(1));
  if (topBwl && topBwl.wickets > 0) html += hlItem('🎯 Best Bowler', topBwl.name, topBwl.wickets+'/'+topBwl.runs);
  el.innerHTML = html || '<div class="empty-state" style="padding:8px">Play in progress...</div>';
}

function hlItem(label, name, val) {
  return '<div class="rec-item"><div style="flex:1"><div style="font-size:10px;color:var(--text-dim)">' + label + '</div>' +
    '<div style="font-size:13px;font-weight:500;color:var(--text)">' + name + '</div></div>' +
    '<div class="rec-val">' + val + '</div></div>';
}


// ═══════════════════════════════════════════════════════════════
//   PARTNERSHIP HELPERS
//   Reconstructs each batting partnership (pair of batsmen at the crease)
//   from a ballLog. Needs nonStrikerName on each ball, which older saved
//   matches (before this feature) won't have — those are simply skipped.
// ═══════════════════════════════════════════════════════════════
function computePartnerships(ballLog) {
  const balls = (ballLog || []).filter(b => b.nonStrikerName !== undefined);
  if (!balls.length) return [];
  const partnerships = [];
  let cur = null;
  const pairKey = (a, b) => [a, b || '·'].sort().join('|');

  balls.forEach((b, idx) => {
    const key = pairKey(b.batsmanName, b.nonStrikerName);
    if (!cur || cur.key !== key) {
      if (cur) partnerships.push(cur);
      cur = { key, batsmen: [b.batsmanName, b.nonStrikerName].filter(Boolean), runs: 0, balls: 0, unbeaten: true };
    }
    cur.runs += b.totalRuns;
    if (!b.isExtra) cur.balls++;
    if (b.result === 'W') cur.unbeaten = false;
  });
  if (cur) partnerships.push(cur);
  return partnerships;
}

// ═══════════════════════════════════════════════════════════════
//   OVER HISTORY HELPERS
// ═══════════════════════════════════════════════════════════════
function groupBallsIntoOvers(ballLog) {
  const overs = [];
  let curOver = [], legal = 0;
  (ballLog || []).forEach(ball => {
    curOver.push(ball);
    if (!ball.isExtra) legal++;
    if (legal >= 6) { overs.push(curOver); curOver = []; legal = 0; }
  });
  if (curOver.length) overs.push(curOver);
  return overs;
}

function renderPartnershipList(ballLog) {
  const list = computePartnerships(ballLog);
  if (!list.length) return '';
  const rows = list.map((p, i) => {
    const rr = p.balls > 0 ? (p.runs / p.balls * 100).toFixed(1) : '-';
    const names = p.batsmen.length === 2 ? p.batsmen.join(' & ') : (p.batsmen[0] || '?') + ' (unbroken)';
    return '<tr><td>' + (i+1) + (p.unbeaten ? '*' : '') + '</td><td class="batting-name">' + names + '</td>' +
      '<td class="runs-cell">' + p.runs + '</td><td>' + p.balls + '</td><td class="sr-cell">' + rr + '</td></tr>';
  }).join('');
  return '<div class="section-head" style="color:var(--accent2);margin-top:8px">Partnerships</div>' +
    '<div style="overflow-x:auto"><table class="scorecard-table"><thead><tr><th>Wkt</th><th style="min-width:150px">Pair</th><th>Runs</th><th>Balls</th><th>RR</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderOverHistory(ballLog) {
  const overs = groupBallsIntoOvers(ballLog);
  if (!overs.length) return '';
  const lblMap = { 'Wd':'Wd','Nb':'NB','Bye':'B','LB':'LB','W':'W','0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6' };
  const rows = overs.map((over, idx) => {
    const bowlerName = over.length ? (over[over.length-1].bowlerName || '') : '';
    const overRuns = over.reduce((sum, b) => sum + (b.totalRuns || 0), 0);
    const balls = over.map(b => {
      const cls = 'hd-b-' + b.result;
      const lbl = lblMap[b.result] || b.result;
      return '<div class="hd-ball ' + cls + '">' + lbl + '</div>';
    }).join('');
    return '<div class="over-history-row">' +
      '<div class="over-num-badge">Ov ' + (idx+1) + '</div>' +
      '<div class="over-ball-list">' + balls + '</div>' +
      '<div class="over-runs-badge">+' + overRuns + '</div>' +
      '<div class="over-bowler-label">' + bowlerName + '</div>' +
      '</div>';
  }).join('');
  return '<div class="over-history-section"><div class="over-history-title">⚡ Ball-by-Ball (Every Over)</div>' + rows + '</div>';
}

// Tapping a history card opens this — full batting (R/B/4s/6s/SR) and
// bowling figures for both innings of that saved match.
function showHistoryDetail(id) {
  const m = lastHistoryData.find(h => h.id === id);
  if (!m) return;
  openHistoryMatchId = id;
  const t1 = m.teams.A?.name || 'Team A', t2 = m.teams.B?.name || 'Team B';
  const d = new Date(m.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  document.getElementById('hdTeams').textContent = t1 + ' vs ' + t2;

  // Date line — include series context if present
  let dateLine = d;
  if (m.series) {
    dateLine += '  ·  ' + m.series.seriesLabel + ' — Match ' + m.series.matchNum + ' of ' + m.series.totalMatches;
  }
  document.getElementById('hdDate').textContent = dateLine;
  document.getElementById('hdResult').textContent = '🏆 ' + (m.result?.winner||'?') + (m.result?.margin ? ' · ' + m.result.margin : '');

  const container = document.getElementById('hdInningsContainer');
  const innings = (m.innings || []).filter(Boolean);
  if (!innings.length) {
    container.innerHTML = '<div class="empty-state" style="padding:16px 0">Detailed scorecard isn\'t available for this match — it was saved before per-batsman stats were added.</div>';
  } else {
    container.innerHTML = innings.map((inn, idx) => {
      const teamName = m.teams[inn.batTeam]?.name || inn.batTeam;
      const ordinalLabel = m.format === 'test' ? (['1st','2nd','3rd','4th'][idx] || (idx+1)+'th') + ' Innings · ' : '';
      const batRows = inn.batsmen.filter(b => b.balls > 0 || (b.status && b.status !== 'yet to bat')).map(b => {
        const sr = b.balls > 0 ? (b.runs/b.balls*100).toFixed(1) : '-';
        const statusText = b.status === 'batting' ? 'batting' : b.status === 'not out' ? 'not out' : (b.status||'').replace('out: ','');
        const runsColor = b.runs >= 100 ? 'var(--yellow)' : b.runs >= 50 ? 'var(--accent2)' : 'var(--text)';
        const milestone = b.runs >= 100 ? ' 💯' : b.runs >= 50 ? ' ★' : '';
        return '<tr><td><div class="batting-name">' + b.name + milestone + '</div><div class="batting-status">' + statusText + '</div></td>' +
          '<td class="runs-cell" style="color:' + runsColor + '">' + b.runs + '</td>' +
          '<td>' + b.balls + '</td>' +
          '<td><span class="four-badge">' + b.fours + '</span></td>' +
          '<td><span class="six-badge">' + b.sixes + '</span></td>' +
          '<td class="sr-cell">' + sr + '</td></tr>';
      }).join('');
      const e = inn.extras || { wide:0, noBall:0, bye:0, legBye:0 };
      const bowlRows = (inn.bowlers || []).filter(b => b.balls > 0).map(b => {
        const ov = b.balls / 6;
        const econ = ov > 0 ? (b.runs/ov).toFixed(1) : '-';
        return '<tr><td class="batting-name">' + b.name + '</td><td>' + fmtOvers(b.balls) + '</td><td>' + (b.maidens||0) + '</td><td>' + b.runs + '</td>' +
          '<td style="color:' + (b.wickets>0?'var(--red)':'var(--text)') + ';font-family:var(--font-display);font-size:14px;font-weight:700">' + b.wickets + '</td>' +
          '<td class="sr-cell">' + econ + '</td></tr>';
      }).join('');

      // Ball-by-ball over breakdown
      const overHtml = renderOverHistory(inn.ballLog);
      const partnershipHtml = renderPartnershipList(inn.ballLog);

      return '<div style="margin-bottom:28px">' +
        '<div class="section-head">' + ordinalLabel + teamName + ' — ' + inn.score + '/' + inn.wickets + (inn.declared?'d':'') + ' (' + fmtOvers(inn.balls) + ' ov)</div>' +
        // Batting scorecard
        '<div style="overflow-x:auto"><table class="scorecard-table"><thead><tr><th style="min-width:130px">Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>' +
        (batRows || '<tr><td colspan="6" style="padding:8px 10px;font-size:12px;color:var(--text-dim)">No batting data</td></tr>') +
        '</tbody></table></div>' +
        '<div style="padding:8px 10px;background:var(--surface2);font-size:12px;color:var(--text-muted)">Extras: ' + (e.wide+e.noBall+e.bye+e.legBye) + ' (Wd ' + e.wide + ', Nb ' + e.noBall + ', B ' + e.bye + ', LB ' + e.legBye + ')</div>' +
        // Bowling scorecard
        (bowlRows ? '<div class="section-head" style="color:var(--accent3);margin-top:8px">Bowling</div><div style="overflow-x:auto"><table class="scorecard-table"><thead><tr><th style="min-width:130px">Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>' + bowlRows + '</tbody></table></div>' : '') +
        // Partnerships
        partnershipHtml +
        // Ball-by-ball over breakdown
        (overHtml || '<div style="padding:10px 14px;font-size:12px;color:var(--text-dim)">Ball-by-ball data not available for this match (saved before this feature was added)</div>') +
        '</div>';
    }).join('');
  }
  document.getElementById('historyDetailOverlay').classList.add('show');
}

function closeHistoryDetail() {
  document.getElementById('historyDetailOverlay').classList.remove('show');
  openHistoryMatchId = null;
}

async function deleteHistoryMatch() {
  if (openHistoryMatchId === null) return;
  const pin = prompt('Enter PIN to delete this match:');
  if (pin === null) return;
  if (pin !== '7893297603') { alert('Incorrect PIN. Match not deleted.'); return; }
  if (!confirm('Delete this match from history? This cannot be undone.')) return;
  const history = await loadHistory();
  const filtered = history.filter(h => h.id !== openHistoryMatchId);
  await saveHistory(filtered);
  document.getElementById('historyDetailOverlay').classList.remove('show');
  openHistoryMatchId = null;
  renderHistory();
}

async function clearHistory() {
  const pin = prompt('Enter PIN to clear all data:');
  if (pin === null) return;
  if (pin !== '7893297603') { alert('Incorrect PIN. Data not cleared.'); return; }
  if (!confirm('PIN correct. Clear ALL data — match history, records, known players and series? This cannot be undone.')) return;
  await saveHistory([]);
  await saveRecords(emptyRecords());
  await saveKnownPlayers([]);
  await clearSeriesStorage();
  knownPlayers = [];
  seriesState = null;
  renderKnownPlayersUI();
  renderHistory();
  renderAllRecords();
  document.getElementById('headerSeriesBtn').style.display = 'none';
}


