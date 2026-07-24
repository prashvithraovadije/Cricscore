// ═══════════════════════════════════════════════════════════════
//   INNINGS — innings end, player of match, result
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   INNINGS END
// ═══════════════════════════════════════════════════════════════
function promptEndInnings() {
  if (confirm('End this innings now?')) endInnings();
}

function endInnings() {
  const m = matchState;
  const inn = m.innings[m.curInn];
  inn.batsmen.forEach(b => { if (b.status === 'batting') b.status = 'not out'; });

  if (m.format !== 'test') {
    // Original limited-overs flow: exactly 2 innings.
    if (m.curInn === 0) {
      showInningsSummary(inn, m.curInn);
    } else {
      showResult();
    }
    return;
  }

  // Test flow: up to 4 innings, with a possible follow-on decision after
  // innings 2 and an early finish if a result is already certain.
  if (m.curInn < 3 && !testResultAlreadyDecided(m)) {
    if (m.curInn === 1) {
      showFollowOnDecision();
    } else {
      showInningsSummary(inn, m.curInn);
    }
  } else {
    showResult();
  }
}

// Shared "innings complete" overlay, used between every innings except
// the very last one of the match.
function showInningsSummary(inn, curInnIdx) {
  const m = matchState;
  const teamName = m.teams[inn.batTeam].name;
  const ordinal = ['1st','2nd','3rd','4th'][curInnIdx] || (curInnIdx+1)+'th';
  document.getElementById('isSummaryTitle').textContent = teamName + ' — ' + ordinal + ' Innings Complete' + (inn.declared ? ' (Declared)' : '');
  document.getElementById('isSummaryScore').textContent = inn.score + '/' + inn.wickets;
  document.getElementById('isSummaryDetails').textContent = fmtOvers(inn.balls) + ' overs · Extras: ' + (inn.extras.wide+inn.extras.noBall+inn.extras.bye+inn.extras.legBye);
  const targetRow = document.getElementById('isTargetVal').closest('.is-target') || document.getElementById('isTargetVal').parentElement;
  if (m.format === 'test') {
    // Only the chasing side in the final innings has a single meaningful
    // target number; mid-match Test scores don't map to one, so hide it.
    if (targetRow) targetRow.style.display = 'none';
  } else {
    if (targetRow) targetRow.style.display = '';
    document.getElementById('isTargetVal').textContent = inn.score + 1;
  }
  const tp = [...inn.batsmen].filter(b=>b.balls>0).sort((a,b)=>b.runs-a.runs)[0];
  document.getElementById('is1stPerf').innerHTML = tp
    ? '<div class="rec-item"><span class="rec-rank gold">⭐</span><div style="flex:1"><div style="font-size:10px;color:var(--text-dim)">Top Scorer</div><div style="font-size:13px;color:var(--text)">' + tp.name + '</div></div><div class="rec-val">' + tp.runs + '(' + tp.balls + 'b)</div></div>'
    : '';
  const btn = document.getElementById('isStartNextBtn');
  if (btn) btn.textContent = 'Start ' + (['2nd','3rd','4th'][curInnIdx] || (curInnIdx+2)+'th') + ' Innings →';
  document.getElementById('inningsSummaryOverlay').classList.add('show');
}

// After the 2nd innings of a Test, check whether the side bowling has the
// option to enforce the follow-on (conventionally a 200-run first-innings
// lead, though some boards use less for shorter formats — we use 150 here
// since most casual Tests in this app will be shorter than 5 days).
const FOLLOW_ON_MARGIN = 150;
function showFollowOnDecision() {
  const m = matchState;
  const inn1 = m.innings[0], inn2 = m.innings[1];
  const lead = inn1.score - inn2.score;
  if (lead < FOLLOW_ON_MARGIN || m.followOnUsed) {
    // No follow-on available — normal order, team that batted 1st now bats 3rd.
    proceedAfterSecondInnings(false);
    return;
  }
  document.getElementById('followOnLeadText').textContent =
    m.teams[inn1.batTeam].name + ' lead by ' + lead + ' runs and can enforce the follow-on.';
  document.getElementById('followOnOverlay').classList.add('show');
}
function decideFollowOn(enforce) {
  document.getElementById('followOnOverlay').classList.remove('show');
  proceedAfterSecondInnings(enforce);
}
function proceedAfterSecondInnings(followOnEnforced) {
  const m = matchState;
  const inn1 = m.innings[0], inn2 = m.innings[1];
  if (followOnEnforced) {
    m.followOnUsed = true;
    // The side that just finished batting (2nd innings) bats again immediately.
    showInningsSummaryForThirdInnings(inn2.batTeam, inn1.batTeam);
  } else {
    showInningsSummaryForThirdInnings(inn1.batTeam, inn2.batTeam);
  }
}
function showInningsSummaryForThirdInnings(nextBatTeam, nextBwlTeam) {
  pendingNextInningsTeams = { bat: nextBatTeam, bwl: nextBwlTeam };
  showInningsSummary(matchState.innings[1], 1);
}
let pendingNextInningsTeams = null;

function startSecondInnings() {
  document.getElementById('inningsSummaryOverlay').classList.remove('show');
  const m = matchState;
  if (m.format === 'test' && m.curInn >= 1) {
    // Moving into the 3rd or 4th innings — team order was already decided
    // (follow-on or normal) and stashed in pendingNextInningsTeams.
    const teams = pendingNextInningsTeams || { bat: m.innings[m.curInn].bwlTeam, bwl: m.innings[m.curInn].batTeam };
    m.innings[m.curInn + 1] = makeInnings(teams.bat, teams.bwl);
    m.curInn++;
    pendingNextInningsTeams = null;
  } else {
    const bf = m.innings[0].batTeam;
    const sb = bf === 'A' ? 'B' : 'A';
    m.innings[1] = makeInnings(sb, bf);
    m.curInn = 1;
  }
  m.phase = 'select_batsmen';
  tempStriker = null; tempNonStriker = null; tempBowler = null;
  renderMatch();
}

// ─── DECLARE INNINGS (Test only) ────────────────────────────────────────
function confirmDeclareInnings() {
  const m = matchState;
  const inn = m.innings[m.curInn];
  if (confirm('Declare the innings at ' + inn.score + '/' + inn.wickets + '?')) {
    inn.declared = true;
    inn.batsmen.forEach(b => { if (b.status === 'batting') b.status = 'not out'; });
    endInnings();
  }
}

// ─── TEST RESULT HELPERS ────────────────────────────────────────────────
// True once the outcome is mathematically locked in before all 4 innings
// have been played — specifically: the 3rd innings has just finished and
// the team that's batted twice already (1 innings) still trails the team
// that's only batted once so far by enough that an "innings" win is
// certain regardless of what a notional 4th innings could add (since the
// side that's behind has no more innings left to bat).
function testResultAlreadyDecided(m) {
  if (m.curInn !== 2) return false; // only relevant right as the 3rd innings ends
  const inn3 = m.innings[2];
  const twiceBattedTeam = inn3.batTeam; // batted in innings 1 (or 2, if follow-on) and now again
  const onceBattedTeam = inn3.bwlTeam;  // has only had one innings so far, and would bat 4th next
  const twiceBattedTotal = m.innings.slice(0,3).filter(i => i && i.batTeam === twiceBattedTeam).reduce((s,i)=>s+i.score,0);
  const onceBattedTotal = m.innings.filter(i => i && i.batTeam === onceBattedTeam).reduce((s,i)=>s+i.score,0);
  // The team that's already had two completed innings is finished batting.
  // If their aggregate is still behind, the other side has won by an
  // innings (they'll never need to bat a 4th time) — match over.
  return twiceBattedTotal < onceBattedTotal;
}
// The aggregate target a 4th-innings side needs to reach: their team's
// 2nd-innings score (if following on or batting 2nd) plus what's needed
// to overhaul the other side's combined total.
function testTargetForFinalInnings(m) {
  if (m.innings.length < 4) return null;
  const inn4 = m.innings[3];
  const battingTeam = inn4.batTeam;
  const oppTeam = inn4.bwlTeam;
  const battingTeamEarlier = m.innings.slice(0,3).filter(i => i && i.batTeam === battingTeam).reduce((s,i)=>s+i.score,0);
  const oppTotal = m.innings.slice(0,3).filter(i => i && i.batTeam === oppTeam).reduce((s,i)=>s+i.score,0);
  return oppTotal - battingTeamEarlier + 1;
}

// ═══════════════════════════════════════════════════════════════
//   PLAYER OF THE MATCH
// ═══════════════════════════════════════════════════════════════
// Simple, transparent impact score: batting runs (with a boundary bonus)
// plus bowling wickets/maidens (with a runs-conceded penalty). Whoever has
// the single highest combined score across every innings of the match wins
// the award. Ties are broken by whoever's team actually won.
function computeMatchMOTM(m) {
  const allInnings = m.innings.filter(Boolean);
  const points = {};
  const bump = (name, team, amt) => {
    if (!points[name]) points[name] = { name, team, pts: 0 };
    points[name].pts += amt;
  };
  allInnings.forEach(inn => {
    inn.batsmen.filter(b => b.balls > 0).forEach(b => {
      bump(b.name, m.teams[inn.batTeam].name, b.runs + b.fours*1 + b.sixes*2);
    });
    inn.bowlers.filter(b => b.balls > 0).forEach(b => {
      bump(b.name, m.teams[inn.bwlTeam].name, b.wickets*20 + (b.maidens||0)*5 - b.runs*0.5);
    });
  });
  const winnerName = m.result ? m.result.winner : null;
  const ranked = Object.values(points).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const aWon = winnerName && a.team === winnerName ? 1 : 0;
    const bWon = winnerName && b.team === winnerName ? 1 : 0;
    return bWon - aWon;
  });
  return ranked[0] || null;
}

// ═══════════════════════════════════════════════════════════════
//   RESULT
// ═══════════════════════════════════════════════════════════════
function showResult() {
  if (VoiceManager.active) stopVoiceScoring();
  const m = matchState;
  if (m.format === 'test') { showTestResult(); return; }

  const inn1 = m.innings[0], inn2 = m.innings[1];
  const t1 = m.teams[inn1.batTeam].name, t2 = m.teams[inn2.batTeam].name;
  let winner, margin;
  if (inn2.score > inn1.score) {
    winner = t2;
    const wLeft = inn2.batsmen.filter(b => !b.status.startsWith('out') && b.status !== 'yet to bat').length;
    margin = 'won by ' + wLeft + ' wicket' + (wLeft!==1?'s':'');
  } else if (inn1.score > inn2.score) {
    winner = t1;
    const diff = inn1.score - inn2.score;
    margin = 'won by ' + diff + ' run' + (diff!==1?'s':'');
  } else {
    winner = 'Match Tied'; margin = '';
  }

  // Series mode badge in result
  let seriesBadge = '';
  if (seriesState) {
    const fix = seriesState.fixtures[seriesState.currentFixtureIdx];
    seriesBadge = '<div style="background:var(--surface2);border:1px solid var(--accent);border-radius:20px;font-size:11px;color:var(--accent);padding:3px 12px;display:inline-block;margin-bottom:12px;font-family:var(--font-display);font-weight:700">' +
      seriesState.label + ' · Match ' + fix.matchNum + ' of ' + seriesState.fixtures.length + '</div><br>';
  }

  document.getElementById('resultWinner').innerHTML = seriesBadge + winner;
  document.getElementById('resultMargin').textContent = margin;
  document.getElementById('resultStats').innerHTML =
    '<div class="res-stat"><div class="res-stat-val">' + inn1.score + '/' + inn1.wickets + '</div><div class="res-stat-lbl">' + t1 + '</div></div>' +
    '<div class="res-stat"><div class="res-stat-val">' + inn2.score + '/' + inn2.wickets + '</div><div class="res-stat-lbl">' + t2 + '</div></div>' +
    '<div class="res-stat"><div class="res-stat-val">' + m.overs + '</div><div class="res-stat-lbl">Overs</div></div>';
  const allBat = [...inn1.batsmen.filter(b=>b.balls>0), ...inn2.batsmen.filter(b=>b.balls>0)];
  const topS = [...allBat].sort((a,b)=>b.runs-a.runs)[0];
  const top6 = [...allBat].sort((a,b)=>b.sixes-a.sixes)[0];
  const topSR = [...allBat].filter(b=>b.balls>=5).sort((a,b)=>(b.runs/b.balls)-(a.runs/a.balls))[0];
  m.result = { winner, margin };
  const motm = computeMatchMOTM(m);
  m.motm = motm ? motm.name : null;
  document.getElementById('resultPerf').innerHTML = '<div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;font-size:13px">' +
    (motm ? '<div class="rec-item" style="padding:4px 0">🏅 Player of the Match: <strong style="color:var(--text);margin-left:4px">' + motm.name + '</strong></div>' : '') +
    (topS ? '<div class="rec-item" style="padding:4px 0">⭐ Top Scorer: <strong style="color:var(--text);margin-left:4px">' + topS.name + ' — ' + topS.runs + '(' + topS.balls + 'b)</strong></div>' : '') +
    (top6 && top6.sixes > 0 ? '<div class="rec-item" style="padding:4px 0">💥 Most Sixes: <strong style="color:var(--text);margin-left:4px">' + top6.name + ' — ' + top6.sixes + '</strong></div>' : '') +
    (topSR ? '<div class="rec-item" style="padding:4px 0">⚡ Best SR: <strong style="color:var(--text);margin-left:4px">' + topSR.name + ' — ' + (topSR.runs/topSR.balls*100).toFixed(1) + '</strong></div>' : '') +
    '</div>';

  // If in series mode, record this match's result
  if (seriesState) {
    recordSeriesMatchResult(winner, inn1, inn2);
  }

  document.getElementById('resultOverlay').classList.add('show');
}

// ─── TEST RESULT (aggregate across up to 4 innings) ─────────────────────
function showTestResult() {
  const m = matchState;
  const teamTotal = (tk) => m.innings.filter(i => i && i.batTeam === tk).reduce((s,i)=>s+i.score,0);
  const teamWickets = (tk) => m.innings.filter(i => i && i.batTeam === tk);
  const totalA = teamTotal('A'), totalB = teamTotal('B');
  const tA = m.teams.A.name, tB = m.teams.B.name;
  const inningsOf = (tk) => m.innings.filter(i => i && i.batTeam === tk);

  let winner, margin;
  const lastInn = m.innings[m.innings.length - 1];
  const chasingTeam = lastInn ? lastInn.batTeam : null;
  const chasingInnings = chasingTeam ? inningsOf(chasingTeam) : [];
  const chasingAllOut = lastInn ? (m.loneBatsman
    ? lastInn.wickets >= lastInn.batsmen.length
    : lastInn.wickets >= Math.max(lastInn.batsmen.length - 1, 1)) || lastInn.declared : false;

  if (totalA === totalB) {
    winner = 'Match Tied'; margin = '';
  } else {
    const higher = totalA > totalB ? 'A' : 'B';
    const lower = higher === 'A' ? 'B' : 'A';
    winner = m.teams[higher].name;
    const higherInningsCount = inningsOf(higher).length;
    const lowerInningsCount = inningsOf(lower).length;
    // Win "by an innings": the side with fewer completed innings never
    // got to bat again because they were so far behind.
    if (higherInningsCount < lowerInningsCount) {
      margin = 'won by an innings and ' + (teamTotal(higher) - teamTotal(lower)) + ' runs';
    } else if (chasingTeam === higher && !chasingAllOut) {
      const wLeft = lastInn.batsmen.filter(b => !b.status.startsWith('out') && b.status !== 'yet to bat').length;
      margin = 'won by ' + wLeft + ' wicket' + (wLeft!==1?'s':'');
    } else {
      margin = 'won by ' + (totalA - totalB > 0 ? totalA - totalB : totalB - totalA) + ' runs';
    }
  }

  let seriesBadge = '';
  document.getElementById('resultWinner').innerHTML = seriesBadge + winner;
  document.getElementById('resultMargin').textContent = margin;

  const statHtml = m.innings.map((inn, idx) => {
    if (!inn) return '';
    const ord = ['1st','2nd','3rd','4th'][idx] || (idx+1)+'th';
    return '<div class="res-stat"><div class="res-stat-val">' + inn.score + '/' + inn.wickets + (inn.declared?'d':'') + '</div><div class="res-stat-lbl">' + m.teams[inn.batTeam].name + ' (' + ord + ')</div></div>';
  }).join('');
  document.getElementById('resultStats').innerHTML = statHtml;

  const allBat = m.innings.filter(Boolean).flatMap(inn => inn.batsmen.filter(b=>b.balls>0));
  const topS = [...allBat].sort((a,b)=>b.runs-a.runs)[0];
  const top6 = [...allBat].sort((a,b)=>b.sixes-a.sixes)[0];
  const allBowl = m.innings.filter(Boolean).flatMap(inn => inn.bowlers.filter(b=>b.balls>0));
  const topW = [...allBowl].sort((a,b)=>b.wickets-a.wickets)[0];
  m.result = { winner, margin };
  const motm = computeMatchMOTM(m);
  m.motm = motm ? motm.name : null;
  document.getElementById('resultPerf').innerHTML = '<div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;font-size:13px">' +
    (motm ? '<div class="rec-item" style="padding:4px 0">🏅 Player of the Match: <strong style="color:var(--text);margin-left:4px">' + motm.name + '</strong></div>' : '') +
    (topS ? '<div class="rec-item" style="padding:4px 0">⭐ Top Scorer: <strong style="color:var(--text);margin-left:4px">' + topS.name + ' — ' + topS.runs + '(' + topS.balls + 'b)</strong></div>' : '') +
    (top6 && top6.sixes > 0 ? '<div class="rec-item" style="padding:4px 0">💥 Most Sixes: <strong style="color:var(--text);margin-left:4px">' + top6.name + ' — ' + top6.sixes + '</strong></div>' : '') +
    (topW && topW.wickets > 0 ? '<div class="rec-item" style="padding:4px 0">🎯 Best Bowling: <strong style="color:var(--text);margin-left:4px">' + topW.name + ' — ' + topW.wickets + ' wkts</strong></div>' : '') +
    '</div>';

  document.getElementById('resultOverlay').classList.add('show');
}

async function saveMatchAndNew() {
  await doSave();
  document.getElementById('resultOverlay').classList.remove('show');
  tossFlipped = false; tossWinnerTeam = null;
  document.getElementById('tossResult').textContent = '';
  document.getElementById('tossChoice').classList.add('hidden');
  delete setupState.battingFirst;
  updateSeriesResultButtons(false);
  showScreen('setupScreen');
}

async function viewHistoryFromResult() {
  await doSave();
  document.getElementById('resultOverlay').classList.remove('show');
  showScreen('historyScreen');
}

// Replays an innings' ball log for one batsman to find the ball count at
// which they first reached 50 and 100 runs. Used instead of trusting
// bat.fifty/bat.hundred off live match state, since that field can be
// missing on a match resumed from an older in-progress save — but the ball
// log itself is always present (even in saved history), so this works both
// for a live match just finishing and for reconstructing old records later.
function computeMilestoneBalls(ballLog, name) {
  let balls = 0, runs = 0, fifty = null, hundred = null;
  (ballLog || []).forEach(b => {
    if (b.batsmanName !== name) return;
    const isByeExtra = b.result === 'Bye' || b.result === 'LB';
    if (!b.isExtra) balls++;
    if (b.batsmanRuns > 0 && !isByeExtra) runs += b.batsmanRuns;
    if (runs >= 50 && fifty === null) fifty = balls;
    if (runs >= 100 && hundred === null) hundred = balls;
  });
  return { fifty, hundred };
}

async function doSave(importedMatch) {
  const isImport = !!importedMatch;
  if (!isImport && !matchState) return;
  const m = importedMatch || matchState;
  const history = await loadHistory();
  const allRecords = await loadRecords();
  const fk = fmtKey(m.format);
  const records = allRecords[fk];
  const allInnings = m.innings.filter(Boolean);
  const inn1 = m.innings[0], inn2 = m.innings[1]; // kept for limited-overs-only sections below
  // Combine every batting performance across every innings of the match
  // (2 for limited overs, up to 4 for Test) into one flat list.
  // Include any batsman who actually reached the crease (status !== 'yet to bat'),
  // not just those who faced a ball — a batsman can be given out (run out / stumped
  // etc.) on a wide or no-ball before facing a single legal delivery. Excluding them
  // was silently dropping that dismissal from career stats, which undercounts
  // "timesOut" and inflates the batting Average (Runs ÷ Times Out).
  const allBat = allInnings.flatMap(inn => inn.batsmen.filter(b=>b.balls>0 || (b.status && b.status !== 'yet to bat')).map(b=>({...b, team: inn.batTeam, _inn: inn})));
  // A player's team "won" the match if their team name matches the winner.
  const winnerName = m.result ? m.result.winner : null;
  const isWin = (teamKey) => winnerName && winnerName !== 'Match Tied' && winnerName === m.teams[teamKey].name;
  const isDecided = winnerName && winnerName !== 'Match Tied';

  allBat.forEach(bat => {
    const tn = m.teams[bat.team].name;
    const rec = { name:bat.name, team:tn, runs:bat.runs, balls:bat.balls };
    records.highestScores.push(rec);
    records.highestScores.sort((a,b)=>b.runs-a.runs);
    records.highestScores = records.highestScores.slice(0,5);
    records.mostSixes.push({...rec, sixes:bat.sixes});
    records.mostSixes.sort((a,b)=>b.sixes-a.sixes);
    records.mostSixes = records.mostSixes.slice(0,5);
    records.mostFours.push({...rec, fours:bat.fours});
    records.mostFours.sort((a,b)=>b.fours-a.fours);
    records.mostFours = records.mostFours.slice(0,5);
    // Count 1s and 2s from ball log
    if (!records.mostOnes) records.mostOnes = [];
    if (!records.mostTwos) records.mostTwos = [];
    const batInn = bat._inn;
    let ones = 0, twos = 0;
    if (batInn && batInn.ballLog) {
      batInn.ballLog.forEach(b => {
        if (b.batsmanName === bat.name && !b.isExtra) {
          if (b.batsmanRuns === 1) ones++;
          if (b.batsmanRuns === 2) twos++;
        }
      });
    }
    records.mostOnes.push({...rec, ones});
    records.mostOnes.sort((a,b)=>b.ones-a.ones);
    records.mostOnes = records.mostOnes.slice(0,5);
    records.mostTwos.push({...rec, twos});
    records.mostTwos.sort((a,b)=>b.twos-a.twos);
    records.mostTwos = records.mostTwos.slice(0,5);
    // Compute the ball count at which this innings crossed 50/100 purely
    // from the ball log, rather than trusting bat.fifty/bat.hundred off the
    // live match state — a match resumed from an older in-progress save can
    // be missing those fields entirely (undefined, not null), which is what
    // let broken "undefinedb" entries into these leaderboards before. The
    // ball log is always present, so this is reconstructible from history too.
    const milestones = computeMilestoneBalls(batInn && batInn.ballLog, bat.name);
    if (typeof milestones.fifty === 'number') {
      records.fastest50.push({name:bat.name, team:tn, balls:milestones.fifty});
      records.fastest50.sort((a,b)=>a.balls-b.balls);
      records.fastest50 = records.fastest50.slice(0,5);
    }
    if (typeof milestones.hundred === 'number') {
      records.fastest100.push({name:bat.name, team:tn, balls:milestones.hundred});
      records.fastest100.sort((a,b)=>a.balls-b.balls);
      records.fastest100 = records.fastest100.slice(0,5);
    }
    if (bat.balls >= 5) {
      const sr = bat.runs/bat.balls*100;
      records.highestSR.push({name:bat.name, team:tn, sr, balls:bat.balls});
      records.highestSR.sort((a,b)=>b.sr-a.sr);
      records.highestSR = records.highestSR.slice(0,5);
    }
    if (!records.totalRuns[bat.name]) records.totalRuns[bat.name] = {team:tn, runs:0, matches:0};
    records.totalRuns[bat.name].runs += bat.runs;
    records.totalRuns[bat.name].matches++;

    // Career stats (runs, balls, fours, sixes, highest score) — kept per
    // format so a player's Test career and limited-overs career never mix.
    if (!records.playerCareer) records.playerCareer = {};
    if (!records.playerCareer[bat.name]) {
      records.playerCareer[bat.name] = { team:tn, totalRuns:0, totalBalls:0, totalFours:0, totalSixes:0, totalOnes:0, totalTwos:0, highestScore:0, matches:0, fifties:0, hundreds:0, hundredfifties:0, doubleHundreds:0, wins:0, winRateMatches:0, maidens:0, innings:0, timesOut:0, notOuts:0, dotBalls:0, thirties:0, ducks:0, motmAwards:0, scores:[] };
    }
    const pc = records.playerCareer[bat.name];
    if (!pc.totalOnes) pc.totalOnes = 0;
    if (!pc.totalTwos) pc.totalTwos = 0;
    if (pc.wins === undefined) pc.wins = 0;
    if (pc.winRateMatches === undefined) pc.winRateMatches = 0;
    if (pc.maidens === undefined) pc.maidens = 0;
    // New per-innings stats — guarded so older saved records (created before
    // these fields existed) pick up sane defaults instead of NaN/undefined.
    if (pc.innings === undefined) pc.innings = 0;
    if (pc.timesOut === undefined) pc.timesOut = 0;
    if (pc.notOuts === undefined) pc.notOuts = 0;
    if (pc.dotBalls === undefined) pc.dotBalls = 0;
    if (pc.thirties === undefined) pc.thirties = 0;
    if (pc.ducks === undefined) pc.ducks = 0;
    if (pc.motmAwards === undefined) pc.motmAwards = 0;
    if (!pc.scores) pc.scores = [];
    const prevRuns = pc.totalRuns;
    const prevSixes = pc.totalSixes;
    const prevFours = pc.totalFours;
    pc.totalRuns += bat.runs;
    pc.totalBalls += bat.balls;
    pc.totalFours += bat.fours;
    pc.totalSixes += bat.sixes;
    pc.innings++;
    pc.scores.push(bat.runs);
    // Every completed innings is either a dismissal or a not-out — used for
    // the batting Average (runs ÷ times out) and Not Outs (NO) stat.
    const battedOut = !!(bat.status && bat.status.toString().startsWith('out'));
    if (battedOut) {
      pc.timesOut++;
      if (bat.runs === 0) pc.ducks++;
    } else {
      pc.notOuts++;
    }
    if (bat.runs >= 30 && bat.runs < 50) pc.thirties++;
    // Count 1s, 2s, and dot balls from this innings' ball log
    if (batInn && batInn.ballLog) {
      batInn.ballLog.forEach(b => {
        if (b.batsmanName === bat.name && !b.isExtra) {
          if (b.batsmanRuns === 1) pc.totalOnes++;
          if (b.batsmanRuns === 2) pc.totalTwos++;
          if (b.batsmanRuns === 0) pc.dotBalls++;
        }
      });
    }
    if (bat.runs > pc.highestScore) pc.highestScore = bat.runs;
    if (!pc.fifties) pc.fifties = 0;
    if (!pc.hundreds) pc.hundreds = 0;
    if (!pc.hundredfifties) pc.hundredfifties = 0;
    if (!pc.doubleHundreds) pc.doubleHundreds = 0;
    // Count this innings' milestone only once, under the HIGHEST tier reached.
    // e.g. a century should only bump "100s", not also bump "50s".
    if (bat.runs >= 200) { pc.doubleHundreds++; }
    else if (bat.runs >= 150) { pc.hundredfifties++; }
    else if (bat.runs >= 100) { pc.hundreds++; }
    else if (bat.runs >= 50) { pc.fifties++; }

    // Career milestone celebrations
    const runMilestones = [500,1000,1500,2000,2500,3000,4000,5000];
    for (const rm of runMilestones) {
      if (prevRuns < rm && pc.totalRuns >= rm) {
        showMilestone('🏆 ' + bat.name + ' has scored ' + rm + ' career runs!');
      }
    }
    const sixMilestones = [25,50,75,100,150,200];
    for (const sm of sixMilestones) {
      if (prevSixes < sm && pc.totalSixes >= sm) {
        showMilestone('💥 ' + bat.name + ' hits ' + sm + ' career SIXES!');
      }
    }
    const fourMilestones = [50,100,150,200,300];
    for (const fm of fourMilestones) {
      if (prevFours < fm && pc.totalFours >= fm) {
        showMilestone('🔥 ' + bat.name + ' hits ' + fm + ' career FOURS!');
      }
    }
  });
  // pc.matches and win-rate tracking happen once per player per match (not
  // once per innings), so loop distinct names rather than allBat entries —
  // a player can appear twice in a Test (batted in 2 innings).
  const battedNames = new Set(allBat.map(b => b.name));
  // Also count anyone who bowled but never got to bat, so career matches /
  // win rate reflect everyone who actually took the field.
  const bowledNames = new Set(allInnings.flatMap(inn => inn.bowlers.filter(b=>b.balls>0).map(b=>b.name)));
  const allPlayerNames = new Set([...battedNames, ...bowledNames]);
  allPlayerNames.forEach(name => {
    const teamKey = m.teams.A.players.includes(name) ? 'A' : (m.teams.B.players.includes(name) ? 'B' : null);
    const tn = teamKey ? m.teams[teamKey].name : (allBat.find(b=>b.name===name)?.team ? m.teams[allBat.find(b=>b.name===name).team].name : '');
    if (!records.playerCareer[name]) {
      records.playerCareer[name] = { team:tn, totalRuns:0, totalBalls:0, totalFours:0, totalSixes:0, totalOnes:0, totalTwos:0, highestScore:0, matches:0, fifties:0, hundreds:0, hundredfifties:0, doubleHundreds:0, wins:0, winRateMatches:0, maidens:0, innings:0, timesOut:0, notOuts:0, dotBalls:0, thirties:0, ducks:0, motmAwards:0, scores:[] };
    }
    const pc = records.playerCareer[name];
    pc.matches++;
    if (isDecided && teamKey) {
      pc.winRateMatches = (pc.winRateMatches||0) + 1;
      if (isWin(teamKey)) pc.wins = (pc.wins||0) + 1;
    }
  });

  // ── Bowling: maidens record + career maidens ──────────────────────────
  if (!records.mostMaidens) records.mostMaidens = [];
  const allBowl = allInnings.flatMap(inn => inn.bowlers.filter(b=>b.balls>0).map(b=>({...b, team: inn.bwlTeam})));
  allBowl.forEach(bwl => {
    const tn = m.teams[bwl.team].name;
    if (bwl.maidens > 0) {
      records.mostMaidens.push({ name:bwl.name, team:tn, maidens:bwl.maidens });
      records.mostMaidens.sort((a,b)=>b.maidens-a.maidens);
      records.mostMaidens = records.mostMaidens.slice(0,5);
    }
    if (records.playerCareer[bwl.name]) {
      records.playerCareer[bwl.name].maidens = (records.playerCareer[bwl.name].maidens||0) + bwl.maidens;
    }
  });

  // ── Player of the Match award ─────────────────────────────────────────
  if (m.motm && records.playerCareer[m.motm]) {
    if (records.playerCareer[m.motm].motmAwards === undefined) records.playerCareer[m.motm].motmAwards = 0;
    records.playerCareer[m.motm].motmAwards++;
  }

  const topS = [...allBat].sort((a,b)=>b.runs-a.runs)[0];

  // ── Team Score Records ──────────────────────────────────────────────
  if (!records.teamHighestScores)  records.teamHighestScores  = [];
  if (!records.teamLowestScores)   records.teamLowestScores   = [];
  if (!records.teamHighestChases)  records.teamHighestChases  = [];
  if (!records.teamLowestDefended) records.teamLowestDefended = [];

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'});
  const matchDateStr = fmtDate(m.date);

  function topBatsmen(inn) {
    return (inn.batsmen||[]).filter(b=>b.runs>0).sort((a,b)=>b.runs-a.runs).slice(0,4).map(b=>b.name+' ('+b.runs+')').join(', ');
  }

  allInnings.forEach(inn => {
    const teamName = m.teams[inn.batTeam].name;
    const players  = topBatsmen(inn);
    const rec = { score:inn.score, wickets:inn.wickets, balls:inn.balls, team:teamName, players, date:matchDateStr, matchId:m.id };

    records.teamHighestScores.push(rec);
    records.teamHighestScores.sort((a,b)=>b.score-a.score||a.wickets-b.wickets);
    records.teamHighestScores = records.teamHighestScores.slice(0,5);

    const allOut  = inn.wickets >= Math.max((inn.batsmen||[]).length - 1, 1);
    // Test innings have no overs cap, so "innings done" there just means
    // all-out or declared; limited overs also checks the overs quota.
    const oversDone = m.format === 'test' ? (allOut || inn.declared) : inn.balls >= m.overs * 6;
    if (allOut || oversDone) {
      records.teamLowestScores.push(rec);
      records.teamLowestScores.sort((a,b)=>a.score-b.score||b.wickets-a.wickets);
      records.teamLowestScores = records.teamLowestScores.slice(0,5);
    }
  });

  // Chase/defend records only really make clean sense for the simple
  // 2-innings limited-overs game — Test results are innings/runs/wickets
  // margins already captured in history, so we keep this section scoped
  // to non-Test matches as before.
  if (m.format !== 'test' && inn1 && inn2 && m.result && m.result.winner !== 'Match Tied') {
    const firstTeam  = m.teams[inn1.batTeam].name;
    const secondTeam = m.teams[inn2.batTeam].name;
    const inn1Rec = { score:inn1.score, wickets:inn1.wickets, balls:inn1.balls, team:firstTeam,  players:topBatsmen(inn1), date:matchDateStr, matchId:m.id, opp:secondTeam };
    const inn2Rec = { score:inn2.score, wickets:inn2.wickets, balls:inn2.balls, team:secondTeam, players:topBatsmen(inn2), date:matchDateStr, matchId:m.id, opp:firstTeam  };
    if (inn2.score > inn1.score) {
      records.teamHighestChases.push(inn2Rec);
      records.teamHighestChases.sort((a,b)=>b.score-a.score);
      records.teamHighestChases = records.teamHighestChases.slice(0,5);
    } else {
      records.teamLowestDefended.push(inn1Rec);
      records.teamLowestDefended.sort((a,b)=>a.score-b.score);
      records.teamLowestDefended = records.teamLowestDefended.slice(0,5);
    }
  }
  const existingIdx = history.findIndex(h => h.id === m.id);
  if (existingIdx !== -1) history.splice(existingIdx, 1);
  const snapshotInnings = (inn) => inn ? {
    batTeam: inn.batTeam, bwlTeam: inn.bwlTeam,
    score: inn.score, wickets: inn.wickets, balls: inn.balls,
    declared: !!inn.declared,
    extras: { ...inn.extras },
    batsmen: inn.batsmen.map(b => ({ name:b.name, runs:b.runs, balls:b.balls, fours:b.fours, sixes:b.sixes, status:b.status })),
    bowlers: inn.bowlers.map(b => ({ name:b.name, balls:b.balls, runs:b.runs, wickets:b.wickets, maidens:b.maidens||0 })),
    ballLog: inn.ballLog.map(b => ({ result:b.result, totalRuns:b.totalRuns, batsmanRuns:b.batsmanRuns, batsmanName:b.batsmanName, nonStrikerName:b.nonStrikerName, bowlerName:b.bowlerName, isExtra:b.isExtra }))
  } : null;
  // Attach series metadata if this match is part of an active series.
  // Imported matches already carry their own series tag (or null) from the
  // sharer's side — don't let the importer's own in-progress series bleed in.
  const seriesMeta = (m.series !== undefined) ? m.series : (seriesState ? {
    seriesId:    seriesState.id,
    seriesLabel: seriesState.label,
    seriesFormat: seriesState.format,
    matchNum:    (seriesState.fixtures[seriesState.currentFixtureIdx]?.matchNum) || null,
    totalMatches: seriesState.fixtures.length
  } : null);

  history.unshift({
    id: isImport ? (m.id + '_shared_' + Date.now().toString(36)) : m.id,
    date: m.date, teams: m.teams,
    format: m.format || 'limited',
    overs: m.overs,
    motm: m.motm || null,
    result: m.result || {winner:'Incomplete',margin:''},
    score1: inn1 ? inn1.score+'/'+inn1.wickets+' ('+fmtOvers(inn1.balls)+' ov)' : '-',
    score2: inn2 ? inn2.score+'/'+inn2.wickets+' ('+fmtOvers(inn2.balls)+' ov)' : '-',
    bf: inn1?.batTeam,
    topScorer: topS?.name || '-', topScorerRuns: topS?.runs || 0,
    innings: m.innings.map(snapshotInnings),
    series: seriesMeta,
    ...(isImport ? { imported: true, sharedBy: m._sharedBy || null } : {})
  });
  await saveHistory(history);
  await saveRecords(allRecords);
  await renderAllRecords();
  // A freshly-finished live match has nothing left "in progress" to
  // autosave. An imported match never touched matchState/live-match state
  // in the first place, so there's nothing to clear either way — but only
  // the live-save path should ever touch the *current* live match.
  if (!isImport) await clearLiveMatch();
}


