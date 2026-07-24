// ═══════════════════════════════════════════════════════════════
//   RECORDS — records + head-to-head helper
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   RECORDS
// ═══════════════════════════════════════════════════════════════
// Turns the raw accumulated playerCareer object into the derived display
// stats requested for player profiles: Average, Innings, Not Outs, Balls
// Faced, Boundary %, Boundary Runs, Dot Ball %, 30s, Ducks, POTM awards,
// Runs per Match, and a Consistency Rating.
function careerDerived(pc) {
  if (!pc) pc = {};
  const innings   = pc.innings || 0;
  const timesOut  = pc.timesOut || 0;
  const notOuts   = pc.notOuts || 0;
  const balls     = pc.totalBalls || 0;
  const runs      = pc.totalRuns || 0;
  const matches   = pc.matches || 0;
  const dotBalls  = pc.dotBalls || 0;
  const boundaryRuns = (pc.totalFours||0)*4 + (pc.totalSixes||0)*6;
  // Average = Runs ÷ Times Out. If a player has never been out, a
  // traditional average is undefined ("infinity") rather than 0.
  const avg = timesOut > 0 ? (runs/timesOut) : (runs > 0 ? Infinity : null);
  const boundaryPct = runs > 0 ? (boundaryRuns/runs*100) : null;
  const dotPct = balls > 0 ? (dotBalls/balls*100) : null;
  const runsPerMatch = matches > 0 ? (runs/matches) : null;
  // Consistency Rating: 0-100, based on the coefficient of variation (CV)
  // of a player's innings scores — a lower CV (scores clustered near the
  // mean) means a more consistent player. Needs at least 3 innings to be
  // meaningful.
  let consistency = null;
  const scores = pc.scores || [];
  if (innings >= 3 && runs > 0) {
    const mean = runs/innings;
    const variance = scores.reduce((s,r)=>s+Math.pow(r-mean,2),0)/innings;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev/mean;
    consistency = Math.max(0, Math.min(100, Math.round(100 - cv*100)));
  }
  return {
    avg, innings, notOuts, balls, boundaryRuns, boundaryPct, dotPct,
    thirties: pc.thirties||0, ducks: pc.ducks||0, motmAwards: pc.motmAwards||0,
    runsPerMatch, consistency
  };
}
function fmtAvg(avg) { return avg === null ? '—' : avg === Infinity ? '∞' : avg.toFixed(2); }
function fmtPct(p) { return p === null ? '—' : p.toFixed(1) + '%'; }

async function renderAllRecords() {
  const allRec = await loadRecords();
  const rec = allRec[fmtKey(currentRecFormatTab)];
  const ranks = ['gold','silver','bronze','',''];
  const rankEmoji = ['🥇','🥈','🥉','4','5'];

  function mkList(items, valFn, metaFn) {
    if (!items || !items.length) return '<div style="padding:8px;font-size:11px;color:var(--text-dim)">No records yet</div>';
    return items.slice(0,5).map((item, i) =>
      '<div class="rec-item">' +
      '<span class="rec-rank ' + ranks[i] + '">' + rankEmoji[i] + '</span>' +
      '<div style="flex:1;min-width:0"><div class="rec-name">' + item.name + '</div><div class="rec-team">' + item.team + '</div></div>' +
      '<div style="text-align:right"><div class="rec-val">' + valFn(item) + '</div>' + (metaFn ? '<div class="rec-meta">' + metaFn(item) + '</div>' : '') + '</div>' +
      '</div>'
    ).join('');
  }

  document.getElementById('recHighestScores').innerHTML = mkList(rec.highestScores, i=>i.runs+'', i=>'('+i.balls+'b)');
  document.getElementById('recMostSixes').innerHTML = mkList(rec.mostSixes, i=>i.sixes+'×🎯', i=>i.runs+' runs');
  document.getElementById('recMostFours').innerHTML = mkList(rec.mostFours, i=>i.fours+'×4', i=>i.runs+' runs');
  document.getElementById('recMostTwos').innerHTML  = mkList(rec.mostTwos||[], i=>i.twos+'×2', i=>i.runs+' runs');
  document.getElementById('recMostOnes').innerHTML  = mkList(rec.mostOnes||[], i=>i.ones+'×1', i=>i.runs+' runs');
  document.getElementById('recFastest50').innerHTML = mkList(rec.fastest50, i=>i.balls+'b', i=>'50 off');
  document.getElementById('recFastest100').innerHTML = mkList(rec.fastest100, i=>i.balls+'b', i=>'100 off');
  document.getElementById('recHighestSR').innerHTML = mkList(rec.highestSR, i=>i.sr.toFixed(1), i=>i.balls+'b');
  document.getElementById('recMostMaidens').innerHTML = mkList(rec.mostMaidens||[], i=>i.maidens+'', i=>'maidens');

  const runsArr = Object.entries(rec.totalRuns).map(([n,d])=>({name:n,...d})).sort((a,b)=>b.runs-a.runs);
  document.getElementById('recMostRuns').innerHTML = mkList(runsArr, i=>i.runs+'', i=>i.matches+'m');

  // Team records (right panel)
  function mkTeamRec(items, scoreFn, labelFn, showDefend) {
    if (!items || !items.length) return '<div style="padding:8px;font-size:11px;color:var(--text-dim)">No records yet</div>';
    return items.slice(0,3).map((item, i) => {
      const scoreColor = showDefend ? 'var(--accent3)' : 'var(--accent2)';
      return '<div class="team-rec-card">' +
        '<div class="team-rec-label">' + (i===0?'🥇 ':i===1?'🥈 ':'🥉 ') + labelFn(i) + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px">' +
          '<span class="team-rec-score" style="color:' + scoreColor + '">' + scoreFn(item) + '</span>' +
          '<span class="team-rec-team">' + item.team + '</span>' +
        '</div>' +
        (item.players ? '<div class="team-rec-players">' + item.players + '</div>' : '') +
        '<div class="team-rec-date">' + (item.opp ? 'vs ' + item.opp + ' · ' : '') + item.date + '</div>' +
        '</div>';
    }).join('');
  }

  const ths = rec.teamHighestScores || [];
  const tls = rec.teamLowestScores  || [];
  const thc = rec.teamHighestChases || [];
  const tld = rec.teamLowestDefended|| [];

  const highestEl  = document.getElementById('recTeamHighestScore');
  const chaseEl    = document.getElementById('recTeamHighestChase');
  const lowestEl   = document.getElementById('recTeamLowestScore');
  const defendedEl = document.getElementById('recTeamLowestDefended');

  if (highestEl)  highestEl.innerHTML  = mkTeamRec(ths, i=>i.score+'/'+i.wickets, _=>'Highest', false);
  if (chaseEl)    chaseEl.innerHTML    = mkTeamRec(thc, i=>i.score+'/'+i.wickets, _=>'Chase',   false);
  if (lowestEl)   lowestEl.innerHTML   = mkTeamRec(tls, i=>i.score+'/'+i.wickets, _=>'Lowest',  true);
  if (defendedEl) defendedEl.innerHTML = mkTeamRec(tld, i=>i.score+'/'+i.wickets, _=>'Defended',true);

  // Best Partnerships — derived fresh from history each time (like bowling
  // career stats), since it only applies to matches saved after this
  // feature shipped (older ones lack per-ball non-striker data).
  const pshipEl = document.getElementById('recBestPartnerships');
  if (pshipEl) {
    const hist = await loadHistory();
    const fk = fmtKey(currentRecFormatTab);
    const best = [];
    hist.filter(m => (m.format || 'limited') === fk || fmtKey(m.format) === fk).forEach(m => {
      (m.innings || []).forEach(inn => {
        computePartnerships(inn.ballLog).forEach(p => {
          if (p.batsmen.length === 2 && p.balls > 0) {
            best.push({ name: p.batsmen.join(' & '), team: inn.batTeam ? (m.teams?.[inn.batTeam]?.name || inn.batTeam) : '', runs: p.runs, balls: p.balls, unbeaten: p.unbeaten });
          }
        });
      });
    });
    best.sort((a,b) => b.runs - a.runs);
    pshipEl.innerHTML = mkList(best, i => i.runs + (i.unbeaten ? '*' : ''), i => i.balls + 'b');
  }
}


// ═══════════════════════════════════════════════════════════════
//   HEAD-TO-HEAD HELPER
// ═══════════════════════════════════════════════════════════════
function computeHeadToHead(history, nameA, nameB, formatKey) {
  let aDismissedB = 0, bDismissedA = 0, matchesFacedOff = 0;
  let aRunsVsB = 0, aBallsVsB = 0, bRunsVsA = 0, bBallsVsA = 0;
  history.forEach(m => {
    if (fmtKey(m.format) !== formatKey) return;
    let facedOff = false;
    (m.innings || []).filter(Boolean).forEach(inn => {
      (inn.ballLog || []).forEach(b => {
        if (b.batsmanName === nameA && b.bowlerName === nameB) {
          facedOff = true; aRunsVsB += b.batsmanRuns; if (!b.isExtra) aBallsVsB++;
          if (b.result === 'W') bDismissedA++;
        }
        if (b.batsmanName === nameB && b.bowlerName === nameA) {
          facedOff = true; bRunsVsA += b.batsmanRuns; if (!b.isExtra) bBallsVsA++;
          if (b.result === 'W') aDismissedB++;
        }
      });
    });
    if (facedOff) matchesFacedOff++;
  });
  return { aDismissedB, bDismissedA, matchesFacedOff, aRunsVsB, aBallsVsB, bRunsVsA, bBallsVsA };
}


