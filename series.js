// ═══════════════════════════════════════════════════════════════
//   SERIES MODE
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   SERIES MODE
// ═══════════════════════════════════════════════════════════════

// Series state persisted in storage
const SERIES_KEY = 'cricscore_v2_series';

let seriesState = null; // null = no active series
let selectedSeriesType = null;

// Format configs
const SERIES_FORMATS = {
  tri:  { label: 'Tri-Series',     teams: 3, matchCount: 6,  desc: '3 teams · Each pair plays twice in round-robin · 6 matches total · Top 2 qualify for final' },
  bi3:  { label: 'Best of 3',      teams: 2, matchCount: 3,  desc: '2 teams · First to win 2 matches wins the series' },
  bi5:  { label: '5-Match Series', teams: 2, matchCount: 5,  desc: '2 teams · First to win 3 matches wins the series' },
  bi7:  { label: '7-Match Series', teams: 2, matchCount: 7,  desc: '2 teams · First to win 4 matches wins the series' }
};

// Team color dots for visual distinction
const TEAM_COLORS = ['#FF6B00', '#00C9FF', '#AAFF00', '#B84FFF'];

function onSeriesModeToggle() {
  const on = document.getElementById('seriesModeToggle').checked;
  document.getElementById('seriesConfig').classList.toggle('visible', on);
  document.getElementById('tossCardOuter').style.display = on ? 'none' : '';
  document.getElementById('startMatchBtn').textContent = on ? 'Start Series →' : 'Start Match →';
  if (!on) selectedSeriesType = null;
}

function selectSeriesType(type) {
  selectedSeriesType = type;
  document.querySelectorAll('.series-type-btn').forEach(btn => btn.classList.remove('selected'));
  document.getElementById('stype-' + type).classList.add('selected');
  const fmt = SERIES_FORMATS[type];
  document.getElementById('seriesFormatDesc').textContent = fmt.desc;
  document.getElementById('triTeamConfig').style.display = type === 'tri' ? 'block' : 'none';
}

async function loadSeries() {
  try { const r = await store.get(SERIES_KEY); return r ? JSON.parse(r.value) : null; } catch(e) { return null; }
}
async function saveSeries(s) {
  try { await store.set(SERIES_KEY, JSON.stringify(s)); } catch(e) { console.error('saveSeries failed', e); }
}
async function clearSeriesStorage() {
  try { await store.set(SERIES_KEY, JSON.stringify(null)); } catch(e) {}
}

// Build the fixture schedule for a series
function buildFixtures(format, teams) {
  const fixtures = [];
  if (format === 'tri') {
    // Round-robin: each pair plays twice
    const pairs = [[0,1],[0,2],[1,2],[1,0],[2,0],[2,1]];
    pairs.forEach((pair, i) => {
      fixtures.push({ matchNum: i+1, homeIdx: pair[0], awayIdx: pair[1], result: null });
    });
  } else {
    // Bilateral: matchCount single-team fixtures
    const count = SERIES_FORMATS[format].matchCount;
    for (let i = 0; i < count; i++) {
      // Alternate who bats first by convention (toss happens per match anyway)
      fixtures.push({ matchNum: i+1, homeIdx: i%2, awayIdx: (i+1)%2, result: null });
    }
  }
  return fixtures;
}

// Initialize a brand-new series
function initSeries() {
  const fmt = selectedSeriesType;
  if (!fmt) { showToast('Please select a series format', true); return false; }
  const teamA = document.getElementById('teamAName').value.trim() || 'Team Alpha';
  const teamB = document.getElementById('teamBName').value.trim() || 'Team Beta';
  const playersA = [...setupState.teamA.players];
  const playersB = [...setupState.teamB.players];
  if (playersA.length < 1 || playersB.length < 1) { showToast('Each team needs at least 1 player', true); return false; }

  const teams = [
    { id: 'A', name: teamA, players: playersA, color: TEAM_COLORS[0] },
    { id: 'B', name: teamB, players: playersB, color: TEAM_COLORS[1] }
  ];
  if (fmt === 'tri') {
    const teamC = document.getElementById('teamCName').value.trim() || 'Team Gamma';
    teams.push({ id: 'C', name: teamC, players: playersA.slice(), color: TEAM_COLORS[2] }); // C uses A's roster
  }

  const fixtures = buildFixtures(fmt, teams);
  seriesState = {
    id: Date.now(),
    format: fmt,
    label: SERIES_FORMATS[fmt].label,
    overs: oversVal,
    singleBatting: document.getElementById('singleBattingToggle').checked,
    teams,
    fixtures,
    currentFixtureIdx: 0,
    complete: false,
    winner: null
  };
  return true;
}

// Called from startMatch() when series mode is on
async function startSeriesFirstMatch() {
  if (!initSeries()) return;
  await saveSeries(seriesState);
  document.getElementById('headerSeriesBtn').style.display = '';
  launchNextSeriesFixture();
}

function launchNextSeriesFixture() {
  const s = seriesState;
  const idx = s.fixtures.findIndex(f => !f.result);
  if (idx === -1) { checkSeriesEnd(); return; }
  s.currentFixtureIdx = idx;
  const fix = s.fixtures[idx];
  const home = s.teams[fix.homeIdx];
  const away = s.teams[fix.awayIdx];

  // Override setupState with this fixture's teams
  setupState.teamA = { name: home.name, players: [...home.players] };
  setupState.teamB = { name: away.name, players: [...away.players] };
  setupState.battingFirst = 'A'; // home bats first by default (no toss in series)
  oversVal = s.overs;

  // Show a quick "next match" toast
  showMilestone('⚡ Match ' + fix.matchNum + ': ' + home.name + ' vs ' + away.name);

  initMatch();
  showScreen('matchScreen');
}

// After a match ends in series mode, record result and continue
async function recordSeriesMatchResult(winnerName, inn1, inn2) {
  const s = seriesState;
  if (!s) return;
  const fix = s.fixtures[s.currentFixtureIdx];
  const home = s.teams[fix.homeIdx];
  const away = s.teams[fix.awayIdx];

  // Determine which team (home=idx0 / away=idx1) won
  let winnerTeamIdx = null;
  if (winnerName === home.name) winnerTeamIdx = fix.homeIdx;
  else if (winnerName === away.name) winnerTeamIdx = fix.awayIdx;
  // else: tie

  // ─── ICC-CORRECT NRR CALCULATION ─────────────────────────────
  // NRR = (Runs scored / Overs faced) − (Runs conceded / Overs bowled)
  //
  // Key ICC rule on overs:
  //   • Team batting FIRST: always use MAX overs as denominator
  //     (whether they used all overs or were dismissed early, they
  //      had the full quota available, so maxOvers is the fair baseline)
  //   • Team batting SECOND:
  //     – If they WON (successful chase): use ACTUAL overs taken
  //     – If they LOST (all out or time ran out): use MAX overs
  //
  // NRR is NOT computed per-match then averaged — it must be
  // accumulated across all matches as raw runs+overs totals, then
  // a single division is done at standings time.
  // ─────────────────────────────────────────────────────────────
  const maxOvers = s.overs;
  function toDecimalOvers(balls) { return Math.floor(balls / 6) + (balls % 6) / 6; }

  const awayWon = inn2.score > inn1.score;

  // Home (batting first): always maxOvers
  const homeOversFaced = maxOvers;
  // Away (batting second): actual overs if they won, else maxOvers
  const awayOversFaced = awayWon ? (toDecimalOvers(inn2.balls) || maxOvers) : maxOvers;

  fix.result = {
    homeScore: inn1.score + '/' + inn1.wickets,
    awayScore: inn2.score + '/' + inn2.wickets,
    homeBalls: inn1.balls,
    awayBalls: inn2.balls,
    winnerTeamIdx,
    tied: winnerTeamIdx === null,
    // Store raw runs + overs so getStandings can aggregate correctly
    homeRunsScored: inn1.score,
    homeOversFaced,
    awayRunsScored: inn2.score,
    awayOversFaced,
  };

  await saveSeries(s);
  checkSeriesEnd();
}

function getStandings(s) {
  // Build points table
  const table = s.teams.map((t, i) => ({
    idx: i, name: t.name, color: t.color,
    p: 0, w: 0, l: 0, tied: 0, pts: 0, nrr: 0,
    // Raw accumulators for aggregate NRR (ICC method)
    _rf: 0, _of: 0, _ra: 0, _oa: 0, _hasNRR: false
  }));

  s.fixtures.forEach(fix => {
    if (!fix.result) return;
    const r = fix.result;
    const home = table[fix.homeIdx];
    const away = table[fix.awayIdx];
    home.p++; away.p++;

    // Points
    if (r.tied) {
      home.tied++; away.tied++;
      home.pts++; away.pts++;
    } else if (r.winnerTeamIdx === fix.homeIdx) {
      home.w++; away.l++;
      home.pts += 2;
    } else {
      away.w++; home.l++;
      away.pts += 2;
    }

    // NRR — accumulate raw runs & overs (new format) or fall back to legacy sum
    if (r.homeRunsScored !== undefined) {
      // ✅ New ICC-correct format: accumulate raw components
      home._rf += r.homeRunsScored;  home._of += r.homeOversFaced;
      home._ra += r.awayRunsScored;  home._oa += r.awayOversFaced;
      away._rf += r.awayRunsScored;  away._of += r.awayOversFaced;
      away._ra += r.homeRunsScored;  away._oa += r.homeOversFaced;
      home._hasNRR = true; away._hasNRR = true;
    } else {
      // ⚠️ Legacy fallback for old saved series data
      home.nrr += (r.homeNRR || 0);
      away.nrr += (r.awayNRR || 0);
    }
  });

  // Compute aggregate NRR for teams with new-format data
  // NRR = (Total runs scored / Total overs faced) − (Total runs conceded / Total overs bowled)
  table.forEach(row => {
    if (row._hasNRR && row._of > 0 && row._oa > 0) {
      row.nrr = (row._rf / row._of) - (row._ra / row._oa);
    }
  });

  return table.sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w);
}

function checkSeriesEnd() {
  const s = seriesState;
  const fmt = s.format;
  const remaining = s.fixtures.filter(f => !f.result).length;

  if (fmt === 'bi3' || fmt === 'bi5' || fmt === 'bi7') {
    const needed = { bi3: 2, bi5: 3, bi7: 4 }[fmt];
    const standings = getStandings(s);
    const leader = standings[0];
    if (leader.w >= needed) {
      // Series decided early
      s.complete = true;
      s.winner = leader.name;
      saveSeries(s);
      showSeriesResult();
      return;
    }
    if (remaining === 0) {
      // All matches played — winner by most wins
      s.complete = true;
      s.winner = leader.name;
      saveSeries(s);
      showSeriesResult();
      return;
    }
  } else if (fmt === 'tri') {
    if (remaining === 0) {
      const standings = getStandings(s);
      s.complete = true;
      s.winner = standings[0].name;
      saveSeries(s);
      showSeriesResult();
      return;
    }
  }
  // More matches remain — show result overlay then go to series screen
  updateSeriesResultButtons(true);
}

function updateSeriesResultButtons(hasMore) {
  const primary = document.getElementById('resultPrimaryBtn');
  const secondary = document.getElementById('resultSecondaryBtn');
  if (seriesState) {
    if (hasMore) {
      primary.textContent = '▶ Next Series Match';
      primary.onclick = async () => {
        await doSaveAndContinueSeries();
      };
    } else {
      primary.textContent = '🏆 View Series Result';
      primary.onclick = async () => {
        await doSave();
        document.getElementById('resultOverlay').classList.remove('show');
        goToSeriesScreen();
      };
    }
    secondary.textContent = '📊 Series Table';
    secondary.onclick = async () => {
      await doSave();
      document.getElementById('resultOverlay').classList.remove('show');
      goToSeriesScreen();
    };
  } else {
    primary.textContent = 'Save & New Match';
    primary.onclick = saveMatchAndNew;
    secondary.textContent = 'View History';
    secondary.onclick = viewHistoryFromResult;
  }
}

async function doSaveAndContinueSeries() {
  await doSave();
  document.getElementById('resultOverlay').classList.remove('show');
  launchNextSeriesFixture();
}

function goToSeriesScreen() {
  if (!seriesState) { showScreen('historyScreen'); return; }
  renderSeriesScreen();
  showScreen('seriesScreen');
}

async function renderSeriesScreen() {
  const s = seriesState;
  if (!s) return;
  document.getElementById('seriesTitleDisplay').textContent = s.label;
  document.getElementById('seriesSubtitleDisplay').textContent =
    s.teams.map(t => t.name).join(' · ') + ' · ' + s.overs + ' overs';

  renderPointsTable(s);
  renderFixtureList(s);
  await renderSeriesTopPerformers(s);
  renderNextMatchArea(s);
}

function renderPointsTable(s) {
  const standings = getStandings(s);
  const fmt = s.format;
  let html = '<div style="overflow-x:auto"><table class="points-table"><thead><tr>' +
    '<th style="text-align:left;padding-left:14px">Team</th>' +
    '<th>M</th><th>W</th><th>L</th>' +
    '<th>Pts</th>' +
    '<th title="Net Run Rate = (Total Runs Scored ÷ Total Overs Faced) − (Total Runs Conceded ÷ Total Overs Bowled)">NRR ℹ</th>' +
    '</tr></thead><tbody>';
  standings.forEach((row, i) => {
    const nrrStr = row.nrr.toFixed(3);
    const nrrClass = row.nrr > 0 ? 'nrr-positive' : row.nrr < 0 ? 'nrr-negative' : 'nrr-zero';
    const isLeader = i === 0 && row.p > 0;
    html += '<tr' + (isLeader ? ' class="leader-row"' : '') + '>' +
      '<td style="padding-left:14px"><span class="pt-rank">' + (i+1) + '</span>' +
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + row.color + ';margin-right:6px"></span>' +
      '<span class="pt-team">' + row.name + '</span>' + (isLeader ? ' <span style="font-size:10px;color:var(--accent)">▲</span>' : '') + '</td>' +
      '<td>' + row.p + '</td><td style="color:var(--green)">' + row.w + '</td>' +
      '<td style="color:var(--red)">' + row.l + '</td>' +
      '<td><span class="pt-pts">' + row.pts + '</span></td>' +
      '<td><span class="pt-nrr ' + nrrClass + '">' + (row.nrr >= 0 ? '+' : '') + nrrStr + '</span></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>' +
    '<div style="font-size:10px;color:var(--text-dim);padding:6px 14px 2px;font-style:italic">' +
    'NRR = (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled) · dismissed teams count as full ' + s.overs + '-over innings</div>';
  document.getElementById('seriesPointsTable').innerHTML = html;
}

function renderFixtureList(s) {
  let html = '';
  s.fixtures.forEach((fix, i) => {
    const home = s.teams[fix.homeIdx];
    const away = s.teams[fix.awayIdx];
    const isDone = !!fix.result;
    const isCurrent = !isDone && i === s.currentFixtureIdx;
    let statusBadge, resultText = '';
    if (isDone) {
      statusBadge = '<span class="fix-status-badge fix-status-done">Done</span>';
      const r = fix.result;
      if (r.tied) resultText = 'Match Tied';
      else resultText = s.teams[r.winnerTeamIdx].name + ' won';
      resultText += ' · ' + home.name + ' ' + r.homeScore + ' vs ' + away.name + ' ' + r.awayScore;
    } else if (isCurrent && !s.complete) {
      statusBadge = '<span class="fix-status-badge fix-status-live">▶ Next</span>';
    } else {
      statusBadge = '<span class="fix-status-badge fix-status-pending">Upcoming</span>';
    }
    html += '<div class="fixture-item">' +
      '<div class="fix-num">M' + fix.matchNum + '</div>' +
      '<div>' +
        '<div class="fix-teams">' +
          '<span style="color:' + home.color + '">' + home.name + '</span>' +
          '<span style="color:var(--text-dim);margin:0 6px">vs</span>' +
          '<span style="color:' + away.color + '">' + away.name + '</span>' +
        '</div>' +
        (resultText ? '<div class="fix-result">' + resultText + '</div>' : '') +
      '</div>' +
      '<div style="margin-left:auto">' + statusBadge + '</div>' +
      '</div>';
  });
  document.getElementById('seriesFixtures').innerHTML = html || '<div class="empty-state">No fixtures generated</div>';
}

function renderNextMatchArea(s) {
  const area = document.getElementById('seriesNextMatchArea');
  if (s.complete) {
    area.innerHTML = '<div class="card" style="text-align:center;padding:20px">' +
      '<div style="font-size:28px;margin-bottom:8px">🏆</div>' +
      '<div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--accent)">' + s.winner + '</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Series Champion</div>' +
      '<button class="btn btn-primary" style="width:100%" onclick="showSeriesResult()">View Series Trophy</button>' +
      '</div>';
    return;
  }
  const nextIdx = s.fixtures.findIndex(f => !f.result);
  if (nextIdx === -1) { area.innerHTML = ''; return; }
  const fix = s.fixtures[nextIdx];
  const home = s.teams[fix.homeIdx];
  const away = s.teams[fix.awayIdx];
  area.innerHTML = '<div class="card">' +
    '<div class="card-title" style="margin-bottom:12px">▶ Next Match — M' + fix.matchNum + '</div>' +
    '<div style="text-align:center;margin-bottom:16px">' +
      '<div style="font-family:var(--font-display);font-size:22px;font-weight:700">' +
        '<span style="color:' + home.color + '">' + home.name + '</span>' +
        '<span style="color:var(--text-dim);margin:0 10px">vs</span>' +
        '<span style="color:' + away.color + '">' + away.name + '</span>' +
      '</div>' +
    '</div>' +
    '<button class="btn btn-primary" style="width:100%" onclick="launchNextSeriesFixture()">🏏 Start This Match</button>' +
    '</div>';
}

async function renderSeriesTopPerformers(s) {
  const history = await loadHistory();
  // Find all history entries belonging to this series
  const seriesMatches = history.filter(m => m.series && m.series.seriesId === s.id);
  const el = document.getElementById('seriesTopPerformers');
  if (!seriesMatches.length) {
    el.innerHTML = '<div class="empty-state">Play matches to see top performers</div>';
    return;
  }

  // Aggregate batsmen across all innings of all series matches
  const battingMap = {}; // name -> { runs, balls, fours, sixes, matches, team }
  const bowlingMap = {}; // name -> { wickets, runsConceded, balls, matches, team }
  seriesMatches.forEach(m => {
    (m.innings || []).filter(Boolean).forEach(inn => {
      (inn.batsmen || []).filter(b => b.balls > 0).forEach(b => {
        if (!battingMap[b.name]) battingMap[b.name] = { runs:0, balls:0, fours:0, sixes:0, matches:0, team: inn.batTeam };
        battingMap[b.name].runs  += b.runs;
        battingMap[b.name].balls += b.balls;
        battingMap[b.name].fours += b.fours;
        battingMap[b.name].sixes += b.sixes;
        battingMap[b.name].matches++;
      });
      (inn.bowlers || []).filter(bw => bw.balls > 0).forEach(bw => {
        if (!bowlingMap[bw.name]) bowlingMap[bw.name] = { wickets:0, runsConceded:0, balls:0, matches:0, team: inn.bwlTeam };
        bowlingMap[bw.name].wickets      += bw.wickets;
        bowlingMap[bw.name].runsConceded += bw.runs;
        bowlingMap[bw.name].balls        += bw.balls;
        bowlingMap[bw.name].matches++;
      });
    });
  });

  const batters = Object.entries(battingMap).map(([name, d]) => ({ name, ...d }));
  const bowlers = Object.entries(bowlingMap).map(([name, d]) => ({ name, ...d }));

  // Orange Cap: most runs (ties broken by fewer balls, i.e. better strike rate)
  const orangeCap = [...batters].sort((a,b) => b.runs - a.runs || a.balls - b.balls).slice(0,5);
  // Purple Cap: most wickets (ties broken by fewer runs conceded, i.e. better economy)
  const purpleCap  = [...bowlers].sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded).slice(0,5);
  const mostSixes  = [...batters].sort((a,b) => b.sixes - a.sixes).filter(p => p.sixes > 0).slice(0,3);
  const mostFours  = [...batters].sort((a,b) => b.fours - a.fours).filter(p => p.fours > 0).slice(0,3);

  function capList(arr, valFn, capColor) {
    return arr.map((p, i) => {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-family:var(--font-display);font-size:12px;font-weight:700;color:var(--text-dim);min-width:18px">' + (i+1) + '</span>' +
        (i === 0 ? '<span style="font-size:13px" title="Cap holder">🧢</span>' : '<span style="width:13px"></span>') +
        '<span style="flex:1;font-size:13px;font-weight:' + (i===0?'700':'500') + '">' + p.name + '<span style="color:var(--text-dim);font-weight:400"> · ' + p.team + '</span></span>' +
        '<span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:' + capColor + '">' + valFn(p) + '</span>' +
        '</div>';
    }).join('');
  }

  function miniList(arr, valFn) {
    return arr.map((p, i) => {
      const medal = ['🥇','🥈','🥉'][i] || '';
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:13px;min-width:20px">' + medal + '</span>' +
        '<span style="flex:1;font-size:13px;font-weight:500">' + p.name + '</span>' +
        '<span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--accent2)">' + valFn(p) + '</span>' +
        '</div>';
    }).join('');
  }

  el.innerHTML =
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#FF8C00;margin-bottom:6px">🟠 Orange Cap · Most Runs</div>' +
      (orangeCap.length ? capList(orangeCap, p => p.runs + ' (' + p.balls + 'b)', '#FF8C00') : '<div style="font-size:12px;color:var(--text-dim)">No qualifying innings yet</div>') +
    '</div>' +
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--purple);margin-bottom:6px">🟣 Purple Cap · Most Wickets</div>' +
      (purpleCap.length ? capList(purpleCap, p => p.wickets + 'w (' + fmtOvers(p.balls) + ' ov)', 'var(--purple)') : '<div style="font-size:12px;color:var(--text-dim)">No wickets taken yet</div>') +
    '</div>' +
    (mostSixes.length ? '<div style="margin-bottom:14px">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px">💥 Most Sixes</div>' +
      miniList(mostSixes, p => p.sixes + '×6') +
    '</div>' : '') +
    (mostFours.length ? '<div>' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px">🏏 Most Fours</div>' +
      miniList(mostFours, p => p.fours + '×4') +
    '</div>' : '') +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:10px">' + seriesMatches.length + ' match' + (seriesMatches.length!==1?'es':'') + ' completed</div>';
}

function showSeriesResult() {
  const s = seriesState;
  const standings = getStandings(s);
  document.getElementById('serChampion').textContent = standings[0].name;
  document.getElementById('serSubline').textContent = 'wins the ' + s.label + ' 🎉';

  let tableHtml = '<thead><tr style="font-size:11px;color:var(--text-dim)">' +
    '<th style="text-align:left;padding:6px 10px">Team</th>' +
    '<th style="padding:6px 10px">M</th><th style="padding:6px 10px">W</th>' +
    '<th style="padding:6px 10px">L</th><th style="padding:6px 10px">Pts</th><th style="padding:6px 10px">NRR</th>' +
    '</tr></thead><tbody>';
  standings.forEach((row, i) => {
    const nrrStr = (row.nrr >= 0 ? '+' : '') + row.nrr.toFixed(3);
    tableHtml += '<tr style="' + (i === 0 ? 'color:var(--accent)' : 'color:var(--text-muted)') + '">' +
      '<td style="text-align:left;padding:6px 10px;font-weight:700">' + (i === 0 ? '🥇 ' : (i === 1 ? '🥈 ' : '🥉 ')) + row.name + '</td>' +
      '<td style="padding:6px 10px">' + row.p + '</td>' +
      '<td style="padding:6px 10px">' + row.w + '</td>' +
      '<td style="padding:6px 10px">' + row.l + '</td>' +
      '<td style="padding:6px 10px;font-weight:700">' + row.pts + '</td>' +
      '<td style="padding:6px 10px">' + nrrStr + '</td>' +
      '</tr>';
  });
  tableHtml += '</tbody>';
  document.getElementById('serFinalTable').innerHTML = tableHtml;
  document.getElementById('seriesResultOverlay').classList.add('show');
}

function confirmEndSeries() {
  if (confirm('End this series? All progress will be cleared.')) {
    endSeriesAndReset();
  }
}

async function endSeriesAndReset() {
  seriesState = null;
  selectedSeriesType = null;
  await clearSeriesStorage();
  document.getElementById('seriesResultOverlay').classList.remove('show');
  document.getElementById('headerSeriesBtn').style.display = 'none';
  document.getElementById('seriesModeToggle').checked = false;
  onSeriesModeToggle();
  showScreen('setupScreen');
}


