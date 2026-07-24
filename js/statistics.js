// ═══════════════════════════════════════════════════════════════
//   STATISTICS — player stats, stats screen, career dashboard
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   PLAYER STATS
// ═══════════════════════════════════════════════════════════════
function showTeamPickerForPlayer() {
  if (!matchState) return;
  const m = matchState;
  document.getElementById('teamPickerBtnA').textContent = '🏏 ' + m.teams.A.name;
  document.getElementById('teamPickerBtnB').textContent = '🎯 ' + m.teams.B.name;
  document.getElementById('teamPickerModal').classList.add('show');
}

function showPlayerPickerForTeam(team) {
  document.getElementById('teamPickerModal').classList.remove('show');
  if (!matchState) return;
  const m = matchState;
  const modal = document.getElementById('playerPickerModal');
  document.getElementById('playerPickerTitle').textContent = m.teams[team].name + ' — Players';
  document.getElementById('playerPickerList').innerHTML = m.teams[team].players.map(p =>
    '<div class="select-item" onclick="showPlayerModal(\'' + p.replace(/'/g,"\\'") + '\',\'' + team + '\')">' +
    '<span>' + p + '</span></div>'
  ).join('');
  modal.classList.add('show');
}

async function showPlayerModal(playerName, team) {
  document.getElementById('playerPickerModal').classList.remove('show');
  const m = matchState;
  if (!m) return;
  const allRec = await loadRecords();
  const rec = allRec[fmtKey(m.format)];
  const modal = document.getElementById('playerDetailModal');
  const content = document.getElementById('playerDetailContent');

  let batData = null;
  m.innings.filter(Boolean).forEach(inn => {
    const b = inn.batsmen.find(b => b.name === playerName);
    if (b && b.balls > 0) batData = b;
  });

  const totalRec = rec.totalRuns[playerName];
  const pc = rec.playerCareer ? rec.playerCareer[playerName] : null;
  const hsRec = rec.highestScores.find(r => r.name === playerName);
  const sr50 = rec.fastest50.find(r => r.name === playerName);
  const sr100 = rec.fastest100.find(r => r.name === playerName);
  const initials = playerName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  const careerHS = pc?.highestScore || hsRec?.runs || '—';
  const careerSR = (pc && pc.totalBalls >= 5) ? (pc.totalRuns/pc.totalBalls*100).toFixed(1) : '—';
  const careerMatches = pc?.matches || totalRec?.matches || 0;
  const careerRuns = pc?.totalRuns || totalRec?.runs || 0;
  const winRate = (pc && pc.winRateMatches > 0) ? Math.round((pc.wins/pc.winRateMatches)*100) + '%' : '—';
  const formatLabel = m.format === 'test' ? '🎩 Test' : '🏏 Normal';
  const dv = careerDerived(pc);

  content.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<div style="font-family:var(--font-display);font-size:18px;font-weight:700">Player Profile</div>' +
    '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'playerDetailModal\').classList.remove(\'show\')">✕</button></div>' +
    '<div class="pm-header"><div class="pm-avatar">' + initials + '</div>' +
    '<div><div class="pm-name">' + playerName + '</div><div class="pm-team">' + (m.teams[team]?.name||'') + ' · ' + formatLabel + ' stats</div></div></div>' +
    (batData
      ? '<div class="pm-section-title">This Match</div>' +
        '<div class="pm-stats-grid">' +
        '<div class="pm-stat"><span class="pm-stat-val" style="color:' + (batData.runs>=100?'var(--yellow)':batData.runs>=50?'var(--accent2)':'var(--text)') + '">' + batData.runs + '</span><span class="pm-stat-lbl">Runs</span></div>' +
        '<div class="pm-stat"><span class="pm-stat-val">' + batData.balls + '</span><span class="pm-stat-lbl">Balls</span></div>' +
        '<div class="pm-stat"><span class="pm-stat-val">' + (batData.balls>0?(batData.runs/batData.balls*100).toFixed(1):'-') + '</span><span class="pm-stat-lbl">SR</span></div>' +
        '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--green)">' + batData.fours + '</span><span class="pm-stat-lbl">4s</span></div>' +
        '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">' + batData.sixes + '</span><span class="pm-stat-lbl">6s</span></div>' +
        '<div class="pm-stat"><span class="pm-stat-val" style="color:' + (batData.status.startsWith('out')?'var(--red)':'var(--green)') + '">' + (batData.status.startsWith('out')?'Out':'N/O') + '</span><span class="pm-stat-lbl">Status</span></div>' +
        '</div>'
      : '<div style="color:var(--text-dim);font-size:13px;margin-bottom:12px;padding:8px;background:var(--surface2);border-radius:6px;text-align:center">No batting data this match yet</div>') +
    '<div class="pm-section-title" style="margin-top:8px">Career Stats (' + formatLabel + ')</div>' +
    '<div class="pm-stats-grid">' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent2)">' + careerRuns + '</span><span class="pm-stat-lbl">Total Runs</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + careerMatches + '</span><span class="pm-stat-lbl">Matches</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">' + careerHS + '</span><span class="pm-stat-lbl">Highest</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--green)">' + (pc?.totalFours||0) + '</span><span class="pm-stat-lbl">Career 4s</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">' + (pc?.totalSixes||0) + '</span><span class="pm-stat-lbl">Career 6s</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + careerSR + '</span><span class="pm-stat-lbl">Career SR</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--purple)">' + (pc?.maidens||0) + '</span><span class="pm-stat-lbl">Maidens</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent)">' + winRate + '</span><span class="pm-stat-lbl">Win Rate</span></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
    '<div class="pm-stat"><span class="pm-stat-val">' + (sr50?sr50.balls+'b':'—') + '</span><span class="pm-stat-lbl">Fastest 50</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + (sr100?sr100.balls+'b':'—') + '</span><span class="pm-stat-lbl">Fastest 100</span></div>' +
    '</div>' +
    '<div class="pm-section-title" style="margin-top:12px">Advanced Stats</div>' +
    '<div class="pm-stats-grid">' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">' + fmtAvg(dv.avg) + '</span><span class="pm-stat-lbl">Average ⭐</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + dv.innings + '</span><span class="pm-stat-lbl">Innings</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--green)">' + dv.notOuts + '</span><span class="pm-stat-lbl">Not Outs</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + dv.balls + '</span><span class="pm-stat-lbl">Balls Faced</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent2)">' + fmtPct(dv.boundaryPct) + '</span><span class="pm-stat-lbl">Boundary %</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent2)">' + dv.boundaryRuns + '</span><span class="pm-stat-lbl">Boundary Runs</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--text-muted)">' + fmtPct(dv.dotPct) + '</span><span class="pm-stat-lbl">Dot Ball %</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent3)">' + dv.thirties + '</span><span class="pm-stat-lbl">30s</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--red)">' + dv.ducks + '</span><span class="pm-stat-lbl">Ducks (0s)</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">🏅 ' + dv.motmAwards + '</span><span class="pm-stat-lbl">Player of the Match</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">' + (dv.runsPerMatch===null?'—':dv.runsPerMatch.toFixed(1)) + '</span><span class="pm-stat-lbl">Runs per Match</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:' + (dv.consistency===null?'var(--text-dim)':dv.consistency>=70?'var(--green)':dv.consistency>=40?'var(--yellow)':'var(--red)') + '">' + (dv.consistency===null?'—':dv.consistency) + '</span><span class="pm-stat-lbl" title="Based on variance of innings scores — higher means more consistent">Consistency Rating</span></div>' +
    '</div>';

  modal.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════
//   STATS SCREEN
// ═══════════════════════════════════════════════════════════════
let currentStatsTab = 'single';

function switchStatsTab(tab) {
  currentStatsTab = tab;
  ['single','team','career'].forEach(t => {
    document.getElementById('statsTab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
  });
  document.getElementById('statsIndividualPanel').style.display = tab === 'single' ? '' : 'none';
  document.getElementById('statsTeamPanel').style.display       = tab === 'team'   ? '' : 'none';
  document.getElementById('statsCareerPanel').style.display     = tab === 'career' ? '' : 'none';
}

let currentRecSubTab = 'single';
let currentRecFormatTab = 'normal';   // in-match side panel: 'normal' | 'test'
let currentStatsFormatTab = 'normal'; // dedicated stats screen: 'normal' | 'test'
function switchRecSubTab(sub) {
  currentRecSubTab = sub;
  document.getElementById('recSubTabSingle').classList.toggle('active', sub === 'single');
  document.getElementById('recSubTabTeam').classList.toggle('active',   sub === 'team');
  document.getElementById('recIndividualPanel').style.display = sub === 'single' ? '' : 'none';
  document.getElementById('recTeamPanel').style.display       = sub === 'team'   ? '' : 'none';
}

function switchRecFormatTab(fmt) {
  currentRecFormatTab = fmt;
  document.getElementById('recFmtTabNormal').classList.toggle('active', fmt === 'normal');
  document.getElementById('recFmtTabTest').classList.toggle('active',   fmt === 'test');
  renderAllRecords();
}

function switchStatsFormatTab(fmt) {
  currentStatsFormatTab = fmt;
  document.getElementById('statsFmtTabNormal').classList.toggle('active', fmt === 'normal');
  document.getElementById('statsFmtTabTest').classList.toggle('active',   fmt === 'test');
  renderStatsScreen();
}

async function renderStatsScreen() {
  const allRec = await loadRecords();
  const rec = allRec[fmtKey(currentStatsFormatTab)];
  const ranks = ['gold','silver','bronze','',''];
  const rankEmoji = ['🥇','🥈','🥉','4','5'];

  function mkList(items, valFn, metaFn) {
    if (!items || !items.length) return '<div style="padding:8px;font-size:12px;color:var(--text-dim)">No records yet</div>';
    return items.slice(0,5).map((item, i) =>
      '<div class="rec-item">' +
      '<span class="rec-rank ' + ranks[i] + '">' + rankEmoji[i] + '</span>' +
      '<div style="flex:1;min-width:0"><div class="rec-name">' + item.name + '</div><div class="rec-team">' + item.team + '</div></div>' +
      '<div style="text-align:right"><div class="rec-val">' + valFn(item) + '</div>' + (metaFn ? '<div class="rec-meta">' + metaFn(item) + '</div>' : '') + '</div>' +
      '</div>'
    ).join('');
  }

  // Individual records
  document.getElementById('sRecHighestScores').innerHTML = mkList(rec.highestScores, i=>i.runs+'', i=>'('+i.balls+'b)');
  document.getElementById('sRecMostRuns').innerHTML = mkList(
    Object.entries(rec.totalRuns||{}).map(([n,d])=>({name:n,...d})).sort((a,b)=>b.runs-a.runs),
    i=>i.runs+'', i=>i.matches+'m'
  );
  document.getElementById('sRecMostSixes').innerHTML = mkList(rec.mostSixes, i=>i.sixes+'×🎯', i=>i.runs+' runs');
  document.getElementById('sRecMostFours').innerHTML = mkList(rec.mostFours, i=>i.fours+'×4', i=>i.runs+' runs');
  document.getElementById('sRecMostTwos').innerHTML  = mkList(rec.mostTwos||[], i=>i.twos+'×2', i=>i.runs+' runs');
  document.getElementById('sRecMostOnes').innerHTML  = mkList(rec.mostOnes||[], i=>i.ones+'×1', i=>i.runs+' runs');
  document.getElementById('sRecFastest50').innerHTML = mkList(rec.fastest50, i=>i.balls+'b', i=>'50 off');
  document.getElementById('sRecFastest100').innerHTML = mkList(rec.fastest100, i=>i.balls+'b', i=>'100 off');
  document.getElementById('sRecHighestSR').innerHTML = mkList(rec.highestSR, i=>i.sr.toFixed(1), i=>i.balls+'b');
  document.getElementById('sRecMostMaidens').innerHTML = mkList(rec.mostMaidens||[], i=>i.maidens+'', i=>'maidens');

  // Team records
  function mkTeamRecFull(items, label, scoreColor, showOpp) {
    if (!items || !items.length) return '<div class="empty-state" style="padding:10px">No records yet</div>';
    return items.slice(0,5).map((item, i) =>
      '<div class="team-rec-card">' +
      '<div class="team-rec-label">' + (i===0?'🥇':i===1?'🥈':'🥉') + ' ' + (i+1) + '. ' + label + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">' +
        '<span class="team-rec-score" style="color:' + scoreColor + '">' + item.score + '/' + item.wickets + '</span>' +
        '<span class="team-rec-team">' + item.team + '</span>' +
      '</div>' +
      (item.players ? '<div class="team-rec-players">' + item.players + '</div>' : '') +
      '<div class="team-rec-date">' + (showOpp && item.opp ? 'vs ' + item.opp + ' · ' : '') + item.date + '</div>' +
      '</div>'
    ).join('');
  }

  const ths = rec.teamHighestScores  || [];
  const tls = rec.teamLowestScores   || [];
  const thc = rec.teamHighestChases  || [];
  const tld = rec.teamLowestDefended || [];

  document.getElementById('sTeamHighestScore').innerHTML  = mkTeamRecFull(ths, 'Highest Score', 'var(--accent2)', false);
  document.getElementById('sTeamLowestScore').innerHTML   = mkTeamRecFull(tls, 'Lowest Score',  'var(--red)',     false);
  document.getElementById('sTeamHighestChase').innerHTML  = mkTeamRecFull(thc, 'Highest Chase', 'var(--green)',   true);
  document.getElementById('sTeamLowestDefended').innerHTML= mkTeamRecFull(tld, 'Lowest Defended','var(--accent3)',true);

  // Career stats — professional dashboard (search, filters, sort, expand,
  // sparklines, ratings). See renderCareerDashboard() below.
  await renderCareerDashboard(rec);
}

// ═══════════════════════════════════════════════════════════════
//   CAREER STATS DASHBOARD (search, filters, sort, expand rows,
//   sparklines, overall rating, and full player profile modal)
// ═══════════════════════════════════════════════════════════════

// Bowling isn't accumulated incrementally like batting (records.playerCareer),
// so it's derived fresh from full match history every render. This also means
// it always reflects deletions correctly, unlike the incremental batting figures.
function computeBowlingCareer(history, formatKey, year) {
  const map = {};
  history.forEach(m => {
    if (fmtKey(m.format) !== formatKey) return;
    if (year && year !== 'all' && (!m.date || new Date(m.date).getFullYear() !== +year)) return;
    (m.innings || []).filter(Boolean).forEach(inn => {
      (inn.bowlers || []).filter(bw => bw.balls > 0).forEach(bw => {
        if (!map[bw.name]) map[bw.name] = { wickets:0, runsConceded:0, balls:0, maidens:0, matchIds:new Set(), team: inn.bwlTeam };
        map[bw.name].wickets += bw.wickets;
        map[bw.name].runsConceded += bw.runs;
        map[bw.name].balls += bw.balls;
        map[bw.name].maidens += (bw.maidens || 0);
        map[bw.name].matchIds.add(m.id);
        if (inn.bwlTeam) map[bw.name].team = inn.bwlTeam;
      });
    });
  });
  const out = {};
  Object.entries(map).forEach(([name, d]) => {
    out[name] = { wickets: d.wickets, runsConceded: d.runsConceded, balls: d.balls, maidens: d.maidens, matches: d.matchIds.size, team: d.team };
  });
  return out;
}

// Derives batting career stats directly from history (rather than the
// cumulative, all-time-only records.playerCareer totals) so a specific
// year/season can be isolated. Used only when a year filter is active —
// "All time" still uses the richer playerCareer data (which also tracks
// POTM awards and win% that per-ball history alone can't reconstruct).
function computeBattingCareer(history, formatKey, year) {
  const map = {};
  history.forEach(m => {
    if (fmtKey(m.format) !== formatKey) return;
    if (year && year !== 'all' && (!m.date || new Date(m.date).getFullYear() !== +year)) return;
    (m.innings || []).filter(Boolean).forEach(inn => {
      (inn.batsmen || []).filter(b => b.balls > 0 || (b.status && b.status !== 'yet to bat')).forEach(b => {
        if (!map[b.name]) map[b.name] = { totalRuns:0, totalBalls:0, totalFours:0, totalSixes:0, totalOnes:0, totalTwos:0,
          highestScore:0, fifties:0, hundreds:0, hundredfifties:0, doubleHundreds:0, notOuts:0, timesOut:0, matchIds:new Set(), team: inn.batTeam };
        const d = map[b.name];
        d.totalRuns += b.runs; d.totalBalls += b.balls;
        d.totalFours += (b.fours||0); d.totalSixes += (b.sixes||0);
        d.totalOnes += (b.ones||0); d.totalTwos += (b.twos||0);
        if (b.runs > d.highestScore) d.highestScore = b.runs;
        if (b.runs >= 200) d.doubleHundreds++;
        else if (b.runs >= 150) d.hundredfifties++;
        else if (b.runs >= 100) d.hundreds++;
        else if (b.runs >= 50) d.fifties++;
        const isNotOut = String(b.status||'').startsWith('not') || b.status === 'batting';
        if (isNotOut) d.notOuts++; else d.timesOut++;
        d.matchIds.add(m.id);
        if (inn.batTeam) d.team = inn.batTeam;
      });
    });
  });
  const out = {};
  Object.entries(map).forEach(([name, d]) => {
    out[name] = { totalRuns:d.totalRuns, totalBalls:d.totalBalls, totalFours:d.totalFours, totalSixes:d.totalSixes,
      totalOnes:d.totalOnes, totalTwos:d.totalTwos, highestScore:d.highestScore, fifties:d.fifties, hundreds:d.hundreds,
      hundredfifties:d.hundredfifties, doubleHundreds:d.doubleHundreds, notOuts:d.notOuts, timesOut:d.timesOut,
      matches: d.matchIds.size, team: d.team };
  });
  return out;
}

function bowlingDerived(bd) {
  if (!bd || !bd.balls) return { overs: '0.0', economy: null, average: null, wickets: 0 };
  const overs = fmtOvers(bd.balls);
  const economy = bd.balls > 0 ? (bd.runsConceded / (bd.balls/6)) : null;
  const average = bd.wickets > 0 ? (bd.runsConceded / bd.wickets) : null;
  return { overs, economy, average, wickets: bd.wickets };
}

// Pulls each match a player appeared in (batting and/or bowling), newest
// first, for the Recent Matches tab and the sparkline mini-chart.
function getPlayerRecentPerformances(history, name, formatKey, limit) {
  const out = [];
  for (const m of history) {
    if (fmtKey(m.format) !== formatKey) continue;
    let batEntry = null, bowlEntry = null, myTeam = null, oppTeam = null;
    (m.innings || []).filter(Boolean).forEach(inn => {
      const b = (inn.batsmen || []).find(x => x.name === name && x.balls > 0);
      if (b && !batEntry) { batEntry = b; myTeam = inn.batTeam; oppTeam = inn.bwlTeam; }
      const bw = (inn.bowlers || []).find(x => x.name === name && x.balls > 0);
      if (bw && !bowlEntry) { bowlEntry = bw; if (!myTeam) { myTeam = inn.bwlTeam; oppTeam = inn.batTeam; } }
    });
    if (!batEntry && !bowlEntry) continue;
    out.push({
      date: m.date,
      opp: oppTeam || '',
      runs: batEntry ? batEntry.runs : null,
      balls: batEntry ? batEntry.balls : null,
      out: batEntry ? !String(batEntry.status||'').startsWith('not') : null,
      wickets: bowlEntry ? bowlEntry.wickets : null,
      bowlRuns: bowlEntry ? bowlEntry.runs : null,
      bowlBalls: bowlEntry ? bowlEntry.balls : null,
      resultWinner: m.result ? m.result.winner : ''
    });
    if (out.length >= limit) break;
  }
  return out; // newest-first (history is already stored newest-first)
}

// Overall Rating (0-100): a weighted blend of run-scoring, average, strike
// rate, consistency, win %, POTM awards and milestones for batting; wickets,
// economy and bowling average for bowling. All-rounders blend both halves.
function calcOverallRating(p) {
  const avgScore = p.avg === null ? 0 : p.avg === Infinity ? 100 : Math.min(100, p.avg * 2);
  const srScore = p.sr === null ? 0 : Math.min(100, p.sr);
  const runsScore = Math.min(100, p.runs / 5);
  const consistencyScore = p.consistency === null ? 50 : p.consistency;
  const milestoneScore = Math.min(100, p.fifties*5 + p.hundreds*15 + p.hundredfifties*25 + p.doubleHundreds*40);
  const battingRating = avgScore*0.25 + srScore*0.2 + runsScore*0.2 + consistencyScore*0.15 + milestoneScore*0.2;

  const bwl = p.bowling;
  const wicketsScore = Math.min(100, bwl.wickets * 4);
  const economyScore = bwl.economy === null ? 50 : Math.max(0, 100 - bwl.economy*8);
  const bowlAvgScore = bwl.average === null ? 50 : Math.max(0, 100 - bwl.average*3);
  const bowlingRating = wicketsScore*0.4 + economyScore*0.3 + bowlAvgScore*0.3;

  const winPctScore = p.winPct === null ? 50 : p.winPct;
  const potmScore = Math.min(100, p.motmAwards * 20);

  let overall;
  if (p.role === 'bowl') overall = bowlingRating*0.6 + winPctScore*0.2 + potmScore*0.2;
  else if (p.role === 'ar') overall = battingRating*0.35 + bowlingRating*0.35 + winPctScore*0.15 + potmScore*0.15;
  else overall = battingRating*0.6 + winPctScore*0.2 + potmScore*0.2;
  return Math.max(1, Math.min(100, Math.round(overall)));
}
function ratingClass(r) { return r >= 80 ? 'rating-elite' : r >= 60 ? 'rating-good' : r >= 40 ? 'rating-avg' : 'rating-low'; }

// Builds the full merged batting+bowling dataset for every player who has
// ever appeared, for the currently selected format. Cached until the format
// tab or underlying records/history change (renderCareerDashboard invalidates it).
let careerRosterCache = null;
let careerRosterCacheKey = null;
async function buildCareerRoster(rec, formatKey, year) {
  const history = await loadHistory();
  year = year || 'all';

  if (year !== 'all') {
    // Year-scoped view: everything is derived fresh from history for that
    // year. A few all-time-only metrics (POTM awards, win%, dot-ball %,
    // consistency score) aren't reconstructable from per-ball history alone,
    // so they're shown as unavailable rather than guessed at.
    const battingMap = computeBattingCareer(history, formatKey, year);
    const bowlingMap = computeBowlingCareer(history, formatKey, year);
    const names = new Set([...Object.keys(battingMap), ...Object.keys(bowlingMap)]);
    const roster = [];
    names.forEach(name => {
      const bc = battingMap[name] || {};
      const bd = bowlingDerived(bowlingMap[name]);
      const runs = bc.totalRuns || 0;
      const balls = bc.totalBalls || 0;
      const sr = balls >= 5 ? (runs/balls*100) : null;
      const timesOut = bc.timesOut || 0;
      const avg = timesOut > 0 ? runs/timesOut : (bc.notOuts > 0 ? runs : null);
      const isBat = (bc.matches || 0) > 0 && runs >= 0 && balls > 0;
      const isBowl = bd.wickets > 0 || (bowlingMap[name] && bowlingMap[name].balls >= 12);
      const role = (isBat && isBowl) ? 'ar' : isBowl ? 'bowl' : 'bat';
      const recentAll = getPlayerRecentPerformances(history, name, formatKey, 200)
        .filter(r => !r.date || new Date(r.date).getFullYear() === +year);
      const recent = recentAll.slice(0, 10);
      const sparkline = recent.slice(0, 7).reverse().map(r => r.runs !== null ? r.runs : (r.wickets !== null ? r.wickets*20 : 0));
      const p = {
        name, team: bc.team || (bowlingMap[name] && bowlingMap[name].team) || '',
        matches: Math.max(bc.matches || 0, (bowlingMap[name] && bowlingMap[name].matches) || 0),
        innings: (bc.timesOut||0) + (bc.notOuts||0), notOuts: bc.notOuts||0, timesOut,
        runs, balls, fours: bc.totalFours||0, sixes: bc.totalSixes||0, ones: bc.totalOnes||0, twos: bc.totalTwos||0,
        highestScore: bc.highestScore || 0,
        fifties: bc.fifties||0, hundreds: bc.hundreds||0, hundredfifties: bc.hundredfifties||0, doubleHundreds: bc.doubleHundreds||0,
        thirties: null, ducks: null, battingMaidens: 0,
        motmAwards: 0, wins: 0, winRateMatches: 0, winPct: null,
        avg, sr, dotPct: null, boundaryPct: null, boundaryRuns: (bc.totalFours||0)*4 + (bc.totalSixes||0)*6,
        runsPerMatch: (bc.matches||0) > 0 ? runs/bc.matches : null, consistency: null,
        bowling: { wickets: bd.wickets, overs: bd.overs, economy: bd.economy, average: bd.average,
                   runsConceded: (bowlingMap[name]&&bowlingMap[name].runsConceded)||0, maidens: (bowlingMap[name]&&bowlingMap[name].maidens)||0 },
        role, recent, sparkline, yearScoped: true
      };
      p.rating = calcOverallRating(p);
      roster.push(p);
    });
    return roster;
  }

  const bowlingMap = computeBowlingCareer(history, formatKey);
  const pcMap = rec.playerCareer || {};
  const names = new Set([...Object.keys(pcMap), ...Object.keys(bowlingMap)]);
  const roster = [];
  names.forEach(name => {
    const pc = pcMap[name] || {};
    const d = careerDerived(pc);
    const bd = bowlingDerived(bowlingMap[name]);
    const runs = pc.totalRuns || 0;
    const balls = pc.totalBalls || 0;
    const sr = balls >= 5 ? (runs/balls*100) : null;
    const winPct = (pc.winRateMatches > 0) ? Math.round((pc.wins/pc.winRateMatches)*100) : null;
    const isBat = (pc.matches || 0) > 0 && (runs > 0 || d.innings > 0);
    const isBowl = bd.wickets > 0 || (bowlingMap[name] && bowlingMap[name].balls >= 12);
    const role = (isBat && isBowl) ? 'ar' : isBowl ? 'bowl' : 'bat';
    const recent = getPlayerRecentPerformances(history, name, formatKey, 10);
    const sparkline = recent.slice(0, 7).reverse().map(r => r.runs !== null ? r.runs : (r.wickets !== null ? r.wickets*20 : 0));
    const p = {
      name, team: pc.team || (bowlingMap[name] && bowlingMap[name].team) || '',
      matches: Math.max(pc.matches || 0, (bowlingMap[name] && bowlingMap[name].matches) || 0),
      innings: d.innings, notOuts: d.notOuts, timesOut: pc.timesOut || 0,
      runs, balls, fours: pc.totalFours||0, sixes: pc.totalSixes||0, ones: pc.totalOnes||0, twos: pc.totalTwos||0,
      highestScore: pc.highestScore || 0,
      fifties: pc.fifties||0, hundreds: pc.hundreds||0, hundredfifties: pc.hundredfifties||0, doubleHundreds: pc.doubleHundreds||0,
      thirties: d.thirties, ducks: d.ducks, battingMaidens: pc.maidens||0,
      motmAwards: d.motmAwards, wins: pc.wins||0, winRateMatches: pc.winRateMatches||0, winPct,
      avg: d.avg, sr, dotPct: d.dotPct, boundaryPct: d.boundaryPct, boundaryRuns: d.boundaryRuns,
      runsPerMatch: d.runsPerMatch, consistency: d.consistency,
      bowling: { wickets: bd.wickets, overs: bd.overs, economy: bd.economy, average: bd.average,
                 runsConceded: (bowlingMap[name]&&bowlingMap[name].runsConceded)||0, maidens: (bowlingMap[name]&&bowlingMap[name].maidens)||0 },
      role, recent, sparkline
    };
    p.rating = calcOverallRating(p);
    roster.push(p);
  });
  return roster;
}

// UI state for the dashboard
let careerFilterState = 'all';
let careerSearchState = '';
let careerYearFilter = 'all';
let careerYearOptionsPopulated = false;
let careerSortField = 'runs';
let careerSortDir = 'desc';
let careerRenderLimit = 30;
let careerExpandedNames = new Set();

async function populateCareerYearOptions() {
  const history = await loadHistory();
  const years = new Set();
  history.forEach(m => { if (m.date) years.add(new Date(m.date).getFullYear()); });
  const sorted = [...years].sort((a,b) => b - a);
  const sel = document.getElementById('careerYearSelect');
  if (!sel) return;
  const current = sel.value || 'all';
  sel.innerHTML = '<option value="all">All time</option>' + sorted.map(y => '<option value="' + y + '">' + y + '</option>').join('');
  sel.value = sorted.includes(+current) || current === 'all' ? current : 'all';
  careerYearOptionsPopulated = true;
}

function onCareerYearChange(val) {
  careerYearFilter = val || 'all';
  careerRosterCacheKey = null; // force a rebuild with the new year scope
  careerRenderLimit = 30;
  renderStatsScreen();
}

async function renderCareerDashboard(rec) {
  const formatKey = fmtKey(currentStatsFormatTab);
  if (!careerYearOptionsPopulated) await populateCareerYearOptions();
  const cacheKey = formatKey + ':' + careerYearFilter + ':' + JSON.stringify(rec.playerCareer ? Object.keys(rec.playerCareer).length : 0) + ':' + (await loadHistory()).length;
  if (careerRosterCacheKey !== cacheKey) {
    careerRosterCache = await buildCareerRoster(rec, formatKey, careerYearFilter);
    careerRosterCacheKey = cacheKey;
    careerRenderLimit = 30;
  }
  renderCareerTable();
}

function getFilteredSortedCareerRoster() {
  let list = careerRosterCache || [];
  if (careerSearchState.trim()) {
    const q = careerSearchState.trim().toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  switch (careerFilterState) {
    case 'batters': list = list.filter(p => p.role === 'bat' || p.role === 'ar'); break;
    case 'bowlers': list = list.filter(p => p.role === 'bowl' || p.role === 'ar'); break;
    case 'allrounders': list = list.filter(p => p.role === 'ar'); break;
    case 'topRuns': list = [...list].sort((a,b)=>b.runs-a.runs); break;
    case 'topWickets': list = [...list].filter(p=>p.bowling.wickets>0).sort((a,b)=>b.bowling.wickets-a.bowling.wickets); break;
    case 'topSixes': list = [...list].sort((a,b)=>b.sixes-a.sixes); break;
    case 'topHundreds': list = [...list].sort((a,b)=>b.hundreds-a.hundreds); break;
    case 'topPOTM': list = [...list].sort((a,b)=>b.motmAwards-a.motmAwards); break;
  }
  // Preset filters above already impose their own sort; for 'all' / role
  // filters, apply the active column sort instead.
  if (['all','batters','bowlers','allrounders'].includes(careerFilterState)) {
    const f = careerSortField, dir = careerSortDir === 'asc' ? 1 : -1;
    const val = (p) => {
      switch (f) {
        case 'name': return p.name.toLowerCase();
        case 'matches': return p.matches;
        case 'runs': return p.runs;
        case 'highestScore': return p.highestScore;
        case 'avg': return p.avg === null ? -1 : p.avg === Infinity ? 999999 : p.avg;
        case 'sr': return p.sr === null ? -1 : p.sr;
        case 'wickets': return p.bowling.wickets;
        case 'winPct': return p.winPct === null ? -1 : p.winPct;
        case 'motmAwards': return p.motmAwards;
        case 'rating': return p.rating;
        default: return p.runs;
      }
    };
    list = [...list].sort((a,b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1*dir; if (av > bv) return 1*dir; return 0;
    });
  }
  return list;
}

function makeSparklineSVG(values, color) {
  const vals = (values && values.length) ? values : [0];
  const w = 64, h = 24, pad = 2;
  const max = Math.max(1, ...vals);
  const stepX = vals.length > 1 ? (w - pad*2) / (vals.length - 1) : 0;
  const pts = vals.map((v,i) => {
    const x = pad + i*stepX;
    const y = h - pad - (v/max)*(h - pad*2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const lastX = pad + (vals.length-1)*stepX;
  const lastY = h - pad - (vals[vals.length-1]/max)*(h - pad*2);
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="overflow:visible">' +
    '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="'+lastX.toFixed(1)+'" cy="'+lastY.toFixed(1)+'" r="2" fill="'+color+'"/>' +
    '</svg>';
}

function esc(name) { return name.replace(/'/g, "\\'"); }

function renderCareerTable() {
  const content = document.getElementById('statsPlayerCareerContent');
  const countEl = document.getElementById('careerResultCount');
  const list = getFilteredSortedCareerRoster();
  if (!careerRosterCache || !careerRosterCache.length) {
    content.innerHTML = '<div class="empty-state">Play matches to see career stats here</div>';
    if (countEl) countEl.textContent = '';
    return;
  }
  if (!list.length) {
    content.innerHTML = '<div class="empty-state">No players match your search/filter</div>';
    if (countEl) countEl.textContent = '';
    return;
  }
  if (countEl) countEl.textContent = list.length + ' player' + (list.length!==1?'s':'');

  const visible = list.slice(0, careerRenderLimit);
  const showWickets = visible.some(p => p.bowling.wickets > 0 || p.role !== 'bat');

  const arrow = (f) => careerSortField === f ? '<span class="sort-arrow">' + (careerSortDir==='asc'?'▲':'▼') + '</span>' : '<span class="sort-arrow">↕</span>';
  const th = (f, label, extraStyle) => '<th class="sortable' + (careerSortField===f?' sorted':'') + '" style="' + (extraStyle||'') + '" onclick="sortCareerBy(\''+f+'\')">' + label + arrow(f) + '</th>';

  const headHtml = '<tr><th style="min-width:150px">Player</th><th>📈 Form</th>' +
    th('matches','🎮 M') + th('runs','🏏 Runs') + th('highestScore','HS') +
    th('avg','⭐ Avg') + th('sr','⚡ SR') +
    (showWickets ? th('wickets','🎯 Wkts') : '') +
    th('winPct','Win %') + th('motmAwards','🏆 POTM') + th('rating','🏅 Rating') + '<th></th></tr>';

  const rows = visible.map(p => buildCareerRowHTML(p, showWickets)).join('');

  content.innerHTML =
    '<div class="career-table-scroll"><table class="career-table">' +
    '<thead>' + headHtml + '</thead><tbody>' + rows + '</tbody></table></div>' +
    (list.length > visible.length ? '<div class="career-load-more"><button class="btn btn-ghost btn-sm" onclick="careerLoadMore()">Load more players (' + (list.length - visible.length) + ' remaining)</button></div>' : '');
}

function buildCareerRowHTML(p, showWickets) {
  const initials = p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const hsColor = p.highestScore >= 100 ? 'var(--yellow)' : p.highestScore >= 50 ? 'var(--accent2)' : 'var(--text)';
  const roleLabel = p.role === 'ar' ? 'All-rounder' : p.role === 'bowl' ? 'Bowler' : 'Batter';
  const roleClass = p.role === 'ar' ? 'ar' : p.role === 'bowl' ? 'bowl' : 'bat';
  const sparkColor = p.role === 'bowl' ? 'var(--accent3)' : 'var(--accent2)';
  const winPctTxt = p.winPct === null ? '—' : p.winPct + '%';
  const isOpen = careerExpandedNames.has(p.name);
  const n = esc(p.name);

  const mainRow =
    '<tr class="career-main-row">' +
      '<td data-label="Player"><div class="player-name-cell" onclick="openCareerProfile(\''+n+'\')">' +
        '<div class="player-mini-avatar">'+initials+'</div>' +
        '<div><div style="font-family:var(--font-display);font-size:13px;font-weight:600">'+p.name+'</div>' +
        '<div style="font-size:9px;color:var(--text-dim)">'+(p.team||'')+'</div>' +
        '<span class="role-badge '+roleClass+'">'+roleLabel+'</span></div>' +
      '</div></td>' +
      '<td data-label="Form" class="sparkline-cell career-cell-hide-mobile">'+makeSparklineSVG(p.sparkline, sparkColor)+'</td>' +
      '<td data-label="Matches" style="font-size:13px;color:var(--text-muted)">'+p.matches+'</td>' +
      '<td data-label="Runs" style="font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--accent2)">'+p.runs+'</td>' +
      '<td data-label="HS" style="color:'+hsColor+';font-family:var(--font-display);font-weight:700">'+p.highestScore+'</td>' +
      '<td data-label="Avg" style="font-family:var(--font-display);font-weight:700;font-size:13px;color:var(--yellow)" title="Runs ÷ Times Out">'+fmtAvg(p.avg)+'</td>' +
      '<td data-label="SR" style="font-family:var(--font-display);font-size:12px;color:var(--accent2)">'+(p.sr===null?'—':p.sr.toFixed(1))+'</td>' +
      (showWickets ? '<td data-label="Wickets" style="font-family:var(--font-display);font-weight:700;font-size:13px;color:var(--accent3)">'+(p.bowling.wickets||'—')+'</td>' : '') +
      '<td data-label="Win %" style="font-family:var(--font-display);font-size:12px;color:var(--accent)">'+winPctTxt+'</td>' +
      '<td data-label="POTM" style="font-family:var(--font-display);font-size:12px;color:var(--yellow)">🏅 '+p.motmAwards+'</td>' +
      '<td data-label="Rating"><span class="rating-chip '+ratingClass(p.rating)+'">'+p.rating+'</span></td>' +
      '<td data-label=""><button class="expand-btn'+(isOpen?' open':'')+'" onclick="toggleCareerExpand(\''+n+'\')">▼</button></td>' +
    '</tr>';

  const expandRow =
    '<tr class="career-expand-row'+(isOpen?' open':'')+'" id="careerExpand_'+encodeURIComponent(p.name)+'">' +
      '<td colspan="12"><div class="career-expand-inner">' + buildCareerExpandHTML(p) + '</div></td>' +
    '</tr>';

  return mainRow + expandRow;
}

function buildCareerExpandHTML(p) {
  const stat = (val, lbl, color) => '<div class="expand-stat"><span class="expand-stat-val" style="color:'+(color||'var(--text)')+'">'+val+'</span><span class="expand-stat-lbl">'+lbl+'</span></div>';
  let html = '<div class="expand-stats-grid">' +
    stat(p.innings, 'Innings') +
    stat(p.notOuts, 'Not Outs', 'var(--green)') +
    stat(p.balls, 'Balls Faced') +
    stat(fmtPct(p.dotPct), 'Dot Ball %') +
    stat(p.fours, '4s', 'var(--green)') +
    stat(p.sixes, '6s', 'var(--yellow)') +
    stat(p.thirties, '30s', 'var(--accent3)') +
    stat(p.fifties, '50s', 'var(--accent2)') +
    stat(p.hundreds, '100s', 'var(--yellow)') +
    stat(p.hundredfifties, '150s', 'var(--purple)') +
    stat(p.doubleHundreds, '200s', 'var(--red)') +
    stat(p.ducks, 'Ducks', 'var(--red)') +
    stat(fmtPct(p.boundaryPct), 'Boundary %', 'var(--accent2)') +
    stat(p.boundaryRuns, 'Boundary Runs', 'var(--accent2)') +
    stat(p.runsPerMatch===null?'—':p.runsPerMatch.toFixed(1), 'Runs/Match') +
    stat(p.consistency===null?'—':p.consistency, 'Consistency');
  if (p.bowling.wickets > 0 || p.bowling.overs !== '0.0') {
    html += stat(p.bowling.overs, 'Overs Bowled', 'var(--accent3)') +
      stat(p.bowling.wickets, 'Wickets', 'var(--accent3)') +
      stat(p.bowling.economy===null?'—':p.bowling.economy.toFixed(2), 'Economy', 'var(--accent3)') +
      stat(p.bowling.average===null?'—':p.bowling.average.toFixed(2), 'Bowling Avg', 'var(--accent3)') +
      stat(p.bowling.maidens, 'Maidens', 'var(--accent3)');
  }
  html += '</div>' +
    '<div style="text-align:right;margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="openCareerProfile(\''+esc(p.name)+'\')">View Full Profile →</button></div>';
  return html;
}

function onCareerSearchInput(val) {
  careerSearchState = val;
  careerRenderLimit = 30;
  renderCareerTable();
}
function setCareerFilter(key) {
  careerFilterState = key;
  careerRenderLimit = 30;
  document.querySelectorAll('#careerFilterRow .career-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === key));
  renderCareerTable();
}
function sortCareerBy(field) {
  if (careerSortField === field) careerSortDir = careerSortDir === 'desc' ? 'asc' : 'desc';
  else { careerSortField = field; careerSortDir = 'desc'; }
  renderCareerTable();
}
function toggleCareerExpand(name) {
  if (careerExpandedNames.has(name)) careerExpandedNames.delete(name);
  else careerExpandedNames.add(name);
  renderCareerTable();
}
function careerLoadMore() {
  careerRenderLimit += 30;
  renderCareerTable();
}

// ── Full Player Profile Dashboard (Overview / Analytics / Career Stats /
//    Achievements / Records / Recent Matches / Graphs) ──────────────────
let careerProfileCurrentTab = 'overview';
async function openCareerProfile(playerName) {
  const p = (careerRosterCache || []).find(x => x.name === playerName);
  if (!p) return;
  const allRec = await loadRecords();
  const rec = allRec[fmtKey(currentStatsFormatTab)];
  const sr50 = rec.fastest50.find(r => r.name === playerName);
  const sr100 = rec.fastest100.find(r => r.name === playerName);
  const initials = playerName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = p.role === 'ar' ? 'All-rounder' : p.role === 'bowl' ? 'Bowler' : 'Batter';
  const formatLabel = currentStatsFormatTab === 'test' ? '🎩 Test' : '🏏 Normal';

  document.getElementById('careerProfileHead').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 16px;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<div class="pm-avatar" style="width:56px;height:56px;font-size:22px">'+initials+'</div>' +
        '<div><div class="pm-name">'+playerName+'</div>' +
        '<div class="pm-team">'+(p.team||'')+' · '+roleLabel+' · '+formatLabel+'</div></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<div style="text-align:center"><div class="rating-chip '+ratingClass(p.rating)+'" style="font-size:20px;padding:6px 14px">'+p.rating+'</div>' +
        '<div style="font-size:9px;color:var(--text-dim);margin-top:2px">OVERALL RATING</div></div>' +
        '<button class="btn btn-ghost btn-sm" onclick="shareProfile('+JSON.stringify(playerName)+')">🔗 Share</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'careerProfileModal\').classList.remove(\'show\')">✕</button>' +
      '</div>' +
    '</div>';

  const tabs = [
    ['overview','Overview'], ['analytics','Performance Analytics'], ['career','Career Statistics'],
    ['achievements','Achievements'], ['records','Records'], ['matches','Recent Matches'], ['graphs','Graphs']
  ];
  document.getElementById('careerProfileTabs').innerHTML = tabs.map(([k,l]) =>
    '<button class="cp-tab'+(careerProfileCurrentTab===k?' active':'')+'" data-cptab="'+k+'" onclick="switchCareerProfileTab(\''+k+'\')">'+l+'</button>').join('');

  const panels = {
    overview: buildCPOverview(p, sr50, sr100),
    analytics: buildCPAnalytics(p),
    career: buildCPCareerStats(p),
    achievements: buildCPAchievements(p, sr50, sr100),
    records: buildCPRecords(p, rec),
    matches: buildCPRecentMatches(p),
    graphs: buildCPGraphs(p)
  };
  document.getElementById('careerProfilePanels').innerHTML = tabs.map(([k]) =>
    '<div class="cp-panel'+(careerProfileCurrentTab===k?' active':'')+'" data-cppanel="'+k+'">'+panels[k]+'</div>').join('');

  document.getElementById('careerProfileModal').classList.add('show');
}
function switchCareerProfileTab(tab) {
  careerProfileCurrentTab = tab;
  document.querySelectorAll('#careerProfileTabs .cp-tab').forEach(t => t.classList.toggle('active', t.dataset.cptab === tab));
  document.querySelectorAll('#careerProfilePanels .cp-panel').forEach(t => t.classList.toggle('active', t.dataset.cppanel === tab));
}

function buildCPOverview(p, sr50, sr100) {
  const winPctTxt = p.winPct===null?'—':p.winPct+'%';
  return '<div class="pm-stats-grid" style="grid-template-columns:repeat(4,1fr)">' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent2)">'+p.runs+'</span><span class="pm-stat-lbl">🏏 Runs</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">'+p.matches+'</span><span class="pm-stat-lbl">Matches</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">'+fmtAvg(p.avg)+'</span><span class="pm-stat-lbl">⭐ Average</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent2)">'+(p.sr===null?'—':p.sr.toFixed(1))+'</span><span class="pm-stat-lbl">⚡ Strike Rate</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent3)">'+(p.bowling.wickets||'—')+'</span><span class="pm-stat-lbl">🎯 Wickets</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--accent)">'+winPctTxt+'</span><span class="pm-stat-lbl">Win %</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">🏆 '+p.motmAwards+'</span><span class="pm-stat-lbl">POTM</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val" style="color:var(--yellow)">'+p.highestScore+'</span><span class="pm-stat-lbl">Highest Score</span></div>' +
    '</div>' +
    '<div class="pm-section-title" style="margin-top:16px">Recent Form</div>' +
    '<div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;display:flex;align-items:center;justify-content:center">' +
    makeSparklineSVG(p.sparkline.length?p.sparkline:[0], p.role==='bowl'?'var(--accent3)':'var(--accent2)').replace('width="64" height="24"','width="280" height="60"').replace('viewBox="0 0 64 24"','viewBox="0 0 64 24" preserveAspectRatio="none"') +
    '</div>' +
    '<div class="pm-section-title" style="margin-top:16px">Fastest Milestones</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
    '<div class="pm-stat"><span class="pm-stat-val">'+(sr50?sr50.balls+'b':'—')+'</span><span class="pm-stat-lbl">Fastest 50</span></div>' +
    '<div class="pm-stat"><span class="pm-stat-val">'+(sr100?sr100.balls+'b':'—')+'</span><span class="pm-stat-lbl">Fastest 100</span></div>' +
    '</div>';
}

function buildCPAnalytics(p) {
  const bar = (label, val, color) => {
    const pct = Math.max(2, Math.min(100, val));
    return '<div class="cp-bar-row"><div class="cp-bar-label">'+label+'</div>' +
      '<div class="cp-bar-track"><div class="cp-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>' +
      '<div class="cp-bar-val">'+Math.round(val)+'</div></div>';
  };
  const avgScore = p.avg===null?0:p.avg===Infinity?100:Math.min(100,p.avg*2);
  const srScore = p.sr===null?0:Math.min(100,p.sr);
  const consistencyScore = p.consistency===null?0:p.consistency;
  const winScore = p.winPct===null?0:p.winPct;
  const boundaryScore = p.boundaryPct===null?0:p.boundaryPct;
  const dotScore = p.dotPct===null?0:p.dotPct;
  let html = '<div class="pm-section-title">Batting Analytics</div>' +
    bar('Average', avgScore, 'linear-gradient(90deg,var(--yellow),var(--accent2))') +
    bar('Strike Rate', srScore, 'linear-gradient(90deg,var(--accent),var(--accent2))') +
    bar('Consistency', consistencyScore, 'linear-gradient(90deg,var(--accent3),var(--green))') +
    bar('Boundary %', boundaryScore, 'linear-gradient(90deg,var(--accent2),var(--yellow))') +
    bar('Dot Ball %', dotScore, 'linear-gradient(90deg,var(--text-dim),var(--text-muted))') +
    bar('Win Rate', winScore, 'linear-gradient(90deg,var(--accent),var(--yellow))');
  if (p.bowling.wickets > 0 || p.bowling.overs !== '0.0') {
    const econScore = p.bowling.economy===null?0:Math.max(0,100-p.bowling.economy*8);
    const bwlAvgScore = p.bowling.average===null?0:Math.max(0,100-p.bowling.average*3);
    html += '<div class="pm-section-title" style="margin-top:16px">Bowling Analytics</div>' +
      bar('Economy', econScore, 'linear-gradient(90deg,var(--accent3),var(--purple))') +
      bar('Bowling Avg', bwlAvgScore, 'linear-gradient(90deg,var(--purple),var(--accent3))') +
      bar('Wickets Impact', Math.min(100,p.bowling.wickets*4), 'linear-gradient(90deg,var(--accent3),var(--green))');
  }
  return html;
}

function buildCPCareerStats(p) {
  const stat = (val, lbl, color) => '<div class="pm-stat"><span class="pm-stat-val" style="color:'+(color||'var(--text)')+'">'+val+'</span><span class="pm-stat-lbl">'+lbl+'</span></div>';
  let html = '<div class="pm-section-title">Batting Career</div><div class="pm-stats-grid">' +
    stat(p.matches,'Matches') + stat(p.innings,'Innings') + stat(p.notOuts,'Not Outs','var(--green)') +
    stat(p.runs,'Total Runs','var(--accent2)') + stat(p.highestScore,'Highest','var(--yellow)') + stat(fmtAvg(p.avg),'Average','var(--yellow)') +
    stat(p.balls,'Balls Faced') + stat(p.sr===null?'—':p.sr.toFixed(1),'Strike Rate','var(--accent2)') + stat(fmtPct(p.dotPct),'Dot Ball %') +
    stat(p.fours,'4s','var(--green)') + stat(p.sixes,'6s','var(--yellow)') + stat(p.thirties,'30s','var(--accent3)') +
    stat(p.fifties,'50s','var(--accent2)') + stat(p.hundreds,'100s','var(--yellow)') + stat(p.hundredfifties,'150s','var(--purple)') +
    stat(p.doubleHundreds,'200s','var(--red)') + stat(p.ducks,'Ducks','var(--red)') + stat(p.runsPerMatch===null?'—':p.runsPerMatch.toFixed(1),'Runs/Match') +
    stat(fmtPct(p.boundaryPct),'Boundary %','var(--accent2)') + stat(p.boundaryRuns,'Boundary Runs','var(--accent2)') +
    stat(p.consistency===null?'—':p.consistency,'Consistency') +
    '</div>';
  html += '<div class="pm-section-title" style="margin-top:16px">Bowling Career</div><div class="pm-stats-grid">' +
    stat(p.bowling.overs,'Overs','var(--accent3)') + stat(p.bowling.wickets,'Wickets','var(--accent3)') +
    stat(p.bowling.runsConceded,'Runs Conceded') + stat(p.bowling.economy===null?'—':p.bowling.economy.toFixed(2),'Economy','var(--accent3)') +
    stat(p.bowling.average===null?'—':p.bowling.average.toFixed(2),'Bowling Avg','var(--accent3)') + stat(p.bowling.maidens,'Maidens','var(--accent3)') +
    '</div>';
  return html;
}

function buildCPAchievements(p, sr50, sr100) {
  const achieve = (icon, title, sub) => '<div class="cp-achieve"><div class="cp-achieve-icon">'+icon+'</div><div><div class="cp-achieve-title">'+title+'</div><div class="cp-achieve-sub">'+sub+'</div></div></div>';
  const list = [];
  if (p.hundreds>0) list.push(achieve('💯','Century Maker',p.hundreds+' hundred'+(p.hundreds!==1?'s':'')+' scored'));
  if (p.hundredfifties>0) list.push(achieve('🎖️','150 Club',p.hundredfifties+' knock'+(p.hundredfifties!==1?'s':'')+' of 150+'));
  if (p.doubleHundreds>0) list.push(achieve('👑','Double Century',p.doubleHundreds+' double hundred'+(p.doubleHundreds!==1?'s':'')));
  if (p.fifties>0) list.push(achieve('🏏','Half-Century Specialist',p.fifties+' fifty'+(p.fifties!==1?'ies':'')+' scored'));
  if (p.sixes>=10) list.push(achieve('💥','Big Hitter',p.sixes+' career sixes'));
  if (p.motmAwards>0) list.push(achieve('🏆','Match Winner',p.motmAwards+' Player of the Match award'+(p.motmAwards!==1?'s':'')));
  if (p.bowling.wickets>=5) list.push(achieve('🎯','Wicket Taker',p.bowling.wickets+' career wickets'));
  if (sr50) list.push(achieve('⚡','Rapid Fifty','Fastest 50 in just '+sr50.balls+' balls'));
  if (sr100) list.push(achieve('🚀','Blazing Hundred','Fastest 100 in just '+sr100.balls+' balls'));
  if (p.consistency!==null && p.consistency>=75) list.push(achieve('🎯','Mr. Consistent','Consistency rating of '+p.consistency+'/100'));
  if (p.winPct!==null && p.winPct>=60) list.push(achieve('🍀','Winning Habit',p.winPct+'% win rate across '+p.winRateMatches+' matches'));
  if (!list.length) return '<div class="empty-state">No milestone achievements unlocked yet — keep playing!</div>';
  return list.join('');
}

function buildCPRecords(p, rec) {
  const stat = (val, lbl, color) => '<div class="pm-stat"><span class="pm-stat-val" style="color:'+(color||'var(--text)')+'">'+val+'</span><span class="pm-stat-lbl">'+lbl+'</span></div>';
  const hsRank = (rec.highestScores||[]).findIndex(r=>r.name===p.name);
  const sixesRank = (rec.mostSixes||[]).findIndex(r=>r.name===p.name);
  const foursRank = (rec.mostFours||[]).findIndex(r=>r.name===p.name);
  const srRank = (rec.highestSR||[]).findIndex(r=>r.name===p.name);
  const rankTxt = (i) => i===-1?'Unranked':'#'+(i+1)+' All-Time';
  return '<div class="pm-section-title">All-Time Ranking</div><div class="pm-stats-grid">' +
    stat(rankTxt(hsRank),'Highest Score',hsRank===0?'var(--yellow)':'var(--text)') +
    stat(rankTxt(sixesRank),'Most Sixes',sixesRank===0?'var(--yellow)':'var(--text)') +
    stat(rankTxt(foursRank),'Most Fours',foursRank===0?'var(--yellow)':'var(--text)') +
    stat(rankTxt(srRank),'Best Strike Rate',srRank===0?'var(--yellow)':'var(--text)') +
    '</div>' +
    '<div class="pm-section-title" style="margin-top:16px">Personal Bests</div><div class="pm-stats-grid">' +
    stat(p.highestScore,'Highest Score','var(--yellow)') +
    stat(p.bowling.wickets,'Best Bowling (career wkts)','var(--accent3)') +
    stat(p.sr===null?'—':p.sr.toFixed(1),'Best Career SR','var(--accent2)') +
    '</div>';
}

function buildCPRecentMatches(p) {
  if (!p.recent.length) return '<div class="empty-state">No recent matches recorded</div>';
  return p.recent.map(r => {
    const d = new Date(r.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    const batPart = r.runs!==null ? '<span style="color:var(--accent2);font-weight:700">'+r.runs+(r.out?'':'*')+'</span> ('+r.balls+'b)' : '';
    const bwlPart = r.wickets!==null ? '<span style="color:var(--accent3);font-weight:700">'+r.wickets+'/'+r.bowlRuns+'</span> ('+fmtOvers(r.bowlBalls)+' ov)' : '';
    return '<div class="cp-match-row"><div>' +
      '<div style="font-weight:600">vs '+(r.opp||'—')+'</div><div style="color:var(--text-dim);font-size:10px">'+d+'</div></div>' +
      '<div style="text-align:right">'+[batPart,bwlPart].filter(Boolean).join(' · ')+'</div></div>';
  }).join('');
}

function buildCPGraphs(p) {
  const w = 560, h = 160, pad = 24;
  const vals = p.recent.slice(0,10).reverse().map(r => r.runs!==null?r.runs:0);
  const max = Math.max(10, ...vals);
  const barW = vals.length ? (w - pad*2) / vals.length : 0;
  const bars = vals.map((v,i) => {
    const bh = (v/max) * (h - pad*2);
    const x = pad + i*barW + barW*0.15;
    const y = h - pad - bh;
    return '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(barW*0.7).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="3" fill="var(--accent2)"/>' +
      '<text x="'+(x+barW*0.35).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" font-size="10" fill="var(--text-muted)" text-anchor="middle">'+v+'</text>';
  }).join('');
  const runsChart = '<svg width="100%" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMinYMid meet">' +
    '<line x1="'+pad+'" y1="'+(h-pad)+'" x2="'+(w-pad)+'" y2="'+(h-pad)+'" stroke="var(--border)"/>' + bars + '</svg>';

  const boundaryTotal = p.fours + p.sixes || 1;
  const fourPct = Math.round(p.fours/boundaryTotal*100);
  const donutR = 46, circ = 2*Math.PI*donutR;
  const donut = '<svg width="120" height="120" viewBox="0 0 120 120">' +
    '<circle cx="60" cy="60" r="'+donutR+'" fill="none" stroke="var(--surface2)" stroke-width="16"/>' +
    '<circle cx="60" cy="60" r="'+donutR+'" fill="none" stroke="var(--green)" stroke-width="16" ' +
      'stroke-dasharray="'+(circ*fourPct/100).toFixed(1)+' '+circ.toFixed(1)+'" transform="rotate(-90 60 60)"/>' +
    '<circle cx="60" cy="60" r="'+donutR+'" fill="none" stroke="var(--yellow)" stroke-width="16" ' +
      'stroke-dasharray="'+(circ*(100-fourPct)/100).toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="-'+(circ*fourPct/100).toFixed(1)+'" transform="rotate(-90 60 60)"/>' +
    '<text x="60" y="65" font-size="16" fill="var(--text)" text-anchor="middle" font-weight="700">'+(p.fours+p.sixes)+'</text>' +
    '</svg>';

  return '<div class="pm-section-title">Runs — Last '+vals.length+' Innings</div>' + runsChart +
    '<div class="pm-section-title" style="margin-top:20px">Boundary Composition</div>' +
    '<div style="display:flex;align-items:center;gap:20px">' + donut +
    '<div><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:10px;height:10px;background:var(--green);border-radius:2px;display:inline-block"></span> '+p.fours+' fours</div>' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:var(--yellow);border-radius:2px;display:inline-block"></span> '+p.sixes+' sixes</div></div>' +
    '</div>';
}


