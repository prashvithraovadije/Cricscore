// ═══════════════════════════════════════════════════════════════
//   SCORING — render, ball processing, wickets, keyboard shortcuts
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   RENDER
// ═══════════════════════════════════════════════════════════════
// Tracks the last match phase we already voice-announced, so the
// "who's the next bowler / next batsman" TTS prompt fires exactly once
// per transition into that phase instead of on every re-render.
let _voiceAnnouncedPhase = null;

function renderMatch() {
  if (!matchState) return;
  const m = matchState;
  const inn = m.innings[m.curInn];
  const isTest = m.format === 'test';

  // Header
  document.getElementById('headerScore').textContent = inn.score + '/' + inn.wickets;
  document.getElementById('headerOvers').textContent = '(' + fmtOvers(inn.balls) + ' ov)';
  const badge = document.getElementById('inningsBadge');
  const ordinals = ['1st Innings','2nd Innings','3rd Innings','4th Innings'];
  badge.textContent = ordinals[m.curInn] || ((m.curInn+1) + ' Innings');
  badge.className = 'innings-badge' + (m.curInn % 2 === 1 ? ' second' : '');

  document.getElementById('targetBadge').classList.add('hidden');
  const crrEl = document.getElementById('crrBadge');
  const oversFaced = inn.balls / 6;
  crrEl.textContent = 'CRR: ' + (oversFaced > 0 ? (inn.score / oversFaced).toFixed(2) : '0.00');
  if (!isTest && m.curInn === 1 && m.innings[0]) {
    const tgt = m.innings[0].score + 1;
    const rem = tgt - inn.score;
    const ballsLeft = m.overs * 6 - inn.balls;
    document.getElementById('targetBadge').textContent = 'Target: ' + tgt + (rem > 0 && ballsLeft > 0 ? ' · Need ' + rem + ' off ' + ballsLeft + 'b' : '');
    document.getElementById('targetBadge').classList.remove('hidden');
    document.getElementById('headerOvers').textContent = '(' + fmtOvers(inn.balls) + ' ov)';
    // Required run rate only means something while there are still balls left to chase with.
    if (rem > 0 && ballsLeft > 0) {
      crrEl.textContent += ' · RRR: ' + (rem / (ballsLeft / 6)).toFixed(2);
    }
  } else if (isTest && m.curInn === 3) {
    // 4th innings of a Test: show the aggregate target (runs still needed
    // on a combined basis), the one number that actually matters to a
    // chasing side in the final innings.
    const target = testTargetForFinalInnings(m);
    if (target !== null) {
      const rem = target - inn.score;
      document.getElementById('targetBadge').textContent = 'Target: ' + target + (rem > 0 ? ' · Need ' + rem + ' more' : '');
      document.getElementById('targetBadge').classList.remove('hidden');
    }
  }

  // Current partnership (runs/balls added by whichever pair is at the
  // crease right now), reconstructed live from this innings' ball-by-ball log.
  const pshipBadge = document.getElementById('partnershipBadge');
  const partnerships = computePartnerships(inn.ballLog);
  const curPship = partnerships[partnerships.length - 1];
  if (curPship && curPship.batsmen.length === 2) {
    pshipBadge.textContent = "P'ship: " + curPship.runs + '(' + curPship.balls + ')';
    pshipBadge.classList.remove('hidden');
  } else {
    pshipBadge.classList.add('hidden');
  }

  // Rough live win-probability while the second (chasing) side is batting
  // in a limited-overs game. This is a simple heuristic, not a statistical
  // model — it leans on required-vs-current run rate and wickets in hand,
  // just to give a rough feel during a close finish.
  const winBadge = document.getElementById('winProbBadge');
  if (!isTest && m.curInn === 1 && m.innings[0]) {
    const tgt = m.innings[0].score + 1;
    const rem = tgt - inn.score;
    const ballsLeft = m.overs * 6 - inn.balls;
    const wicketsLeft = 10 - inn.wickets;
    if (rem <= 0) {
      winBadge.textContent = 'Win%: Chasing side 100%';
      winBadge.classList.remove('hidden');
    } else if (ballsLeft <= 0 || wicketsLeft <= 0) {
      winBadge.textContent = 'Win%: Defending side 100%';
      winBadge.classList.remove('hidden');
    } else {
      const rrr = rem / (ballsLeft / 6);
      const crr = oversFaced > 0 ? inn.score / oversFaced : 0;
      // Higher required rate relative to current form, and fewer wickets
      // in hand, both push the estimate down for the chasing side.
      const rateFactor = crr > 0 ? (crr - rrr) / Math.max(crr, rrr, 1) : -0.3;
      const wicketFactor = (wicketsLeft - 5) / 10;
      let chasingWinPct = 50 + rateFactor * 45 + wicketFactor * 20;
      chasingWinPct = Math.max(2, Math.min(98, Math.round(chasingWinPct)));
      winBadge.textContent = 'Win%: Chasing ' + chasingWinPct + '% · Defending ' + (100 - chasingWinPct) + '%';
      winBadge.classList.remove('hidden');
    }
  } else {
    winBadge.classList.add('hidden');
  }

  // Phase UI
  const phases = ['selectBatsmenSection','selectBowlerSection','selectNextBatsmanSection',
    'liveScoringSection','liveBowlerSection','overProgressSection','ballButtonsSection'];
  phases.forEach(p => document.getElementById(p).classList.add('hidden'));

  if (m.phase === 'select_batsmen') {
    show('selectBatsmenSection');
    renderStrikerList(inn);
    renderNonStrikerList(inn);
  } else if (m.phase === 'select_bowler') {
    show('selectBowlerSection');
    renderBowlerList(inn);
    // Proactively prompt by voice the moment the over ends — regardless of
    // whether the last ball was scored by voice or by tapping a button.
    // Guarded so it only fires once per transition into this phase, not on
    // every re-render while the panel is still open.
    if (_voiceAnnouncedPhase !== 'select_bowler' && typeof VoiceManager !== 'undefined') {
      VoiceManager.promptForBowler();
    }
    _voiceAnnouncedPhase = 'select_bowler';
  } else if (m.phase === 'select_next_batsman') {
    show('selectNextBatsmanSection');
    renderNextBatsmanList(inn);
    show('liveScoringSection'); show('liveBowlerSection'); show('overProgressSection');
    updateLiveCards(inn);
    if (_voiceAnnouncedPhase !== 'select_next_batsman' && typeof VoiceManager !== 'undefined') {
      VoiceManager.promptForNextBatsman();
    }
    _voiceAnnouncedPhase = 'select_next_batsman';
  } else if (m.phase === 'live') {
    show('liveScoringSection'); show('liveBowlerSection');
    show('overProgressSection'); show('ballButtonsSection');
    updateLiveCards(inn);
    if (_voiceAnnouncedPhase !== null && typeof VoiceManager !== 'undefined') {
      VoiceManager.cancelPendingPrompt();
    }
    _voiceAnnouncedPhase = null;
  }

  // Declare is only meaningful in a Test innings that's still live, with
  // at least some runs on the board and the side not already all out.
  const declareBtn = document.getElementById('declareBtn');
  const canDeclare = isTest && m.phase === 'live' && inn.balls > 0 &&
    inn.wickets < Math.max(inn.batsmen.length - 1, 1);
  declareBtn.classList.toggle('hidden', !canDeclare);

  renderBattingScorecard(inn);
  renderBowlingScorecard(inn);
  renderMatchHighlights(inn);
  // NOTE: renderAllRecords() intentionally NOT called here — career/format
  // records only change when a match is saved (doSave), never mid-innings,
  // so rebuilding that whole panel on every single ball was pure waste.
  // It's rendered once when the app loads and again right after a save.

  // Refresh player stats tab if visible
  if (currentRightTab === 'player-stats') renderMatchPlayerStats(currentPSTeam);

  // Every render = every ball / wicket / undo / batsman-bowler change —
  // persist immediately so nothing is ever lost to a refresh or closed tab.
  autosaveMatch();
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }

function updateLiveCards(inn) {
  const s = inn.striker !== null ? inn.batsmen[inn.striker] : null;
  const ns = inn.nonStriker !== null ? inn.batsmen[inn.nonStriker] : null;
  const b = inn.currentBowler !== null ? inn.bowlers[inn.currentBowler] : null;
  if (s) {
    document.getElementById('strikerName').textContent = s.name;
    document.getElementById('strikerRuns').textContent = s.runs;
    document.getElementById('strikerBalls').textContent = s.balls;
    document.getElementById('strikerFours').textContent = s.fours;
    document.getElementById('strikerSixes').textContent = s.sixes;
    document.getElementById('strikerSR').textContent = s.balls > 0 ? (s.runs/s.balls*100).toFixed(1) : '0.0';
  }
  if (ns) {
    document.getElementById('nonStrikerCard').style.display = '';
    document.getElementById('nonStrikerName').textContent = ns.name;
    document.getElementById('nsRuns').textContent = ns.runs;
    document.getElementById('nsBalls').textContent = ns.balls;
    document.getElementById('nsSR').textContent = ns.balls > 0 ? (ns.runs/ns.balls*100).toFixed(1) : '0.0';
  } else {
    document.getElementById('nonStrikerCard').style.display = 'none';
  }
  if (b) {
    document.getElementById('bowlerNameDisplay').textContent = b.name;
    document.getElementById('bowlerOvers').textContent = fmtOvers(b.balls);
    document.getElementById('bowlerRuns').textContent = b.runs;
    document.getElementById('bowlerWickets').textContent = b.wickets;
    document.getElementById('bowlerMaidens').textContent = b.maidens || 0;
    const ov = b.balls / 6;
    document.getElementById('bowlerEcon').textContent = ov > 0 ? (b.runs/ov).toFixed(1) : '0.0';
  }
  renderOverDots(inn);
  document.getElementById('overLabel').textContent = 'Over ' + (inn.overIdx + 1);
  const overRuns = inn.currentOverBalls.reduce((acc, b) => {
    if (['Wd','Nb'].includes(b)) return acc + 1;
    if (['Bye','LB'].includes(b)) return acc + 1;
    const n = parseInt(b);
    return isNaN(n) ? acc : acc + n;
  }, 0);
  document.getElementById('overRunsLabel').textContent = overRuns + ' runs this over';
}

function renderOverDots(inn) {
  const wrap = document.getElementById('overDots');
  const balls = inn.currentOverBalls;
  let html = '';
  for (let i = 0; i < 6; i++) {
    if (i < balls.length) {
      const b = balls[i];
      const lbl = b === 'Wd' ? 'Wd' : b === 'Nb' ? 'NB' : b === 'Bye' ? 'B' : b === 'LB' ? 'LB' : b;
      html += '<div class="over-dot dot-' + b + '">' + lbl + '</div>';
    } else {
      html += '<div class="over-dot empty"></div>';
    }
  }
  wrap.innerHTML = html;
}

function renderStrikerList(inn) {
  const avail = inn.batsmen.filter(b => b.status === 'yet to bat');
  document.getElementById('strikerSelectList').innerHTML = avail.map(b => {
    const idx = inn.batsmen.indexOf(b);
    return '<div class="select-item" id="str_' + idx + '" onclick="selectStriker(' + idx + ')">' + b.name + '</div>';
  }).join('') || '<div class="empty-state">No available batsmen</div>';
}

function renderNonStrikerList(inn) {
  const avail = inn.batsmen.filter(b => b.status === 'yet to bat');
  const panel = document.getElementById('nonStrikerPanel');
  if (avail.length <= 1) {
    // Solo batter – hide non-striker picker
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';
  document.getElementById('nonStrikerSelectList').innerHTML = avail.map(b => {
    const idx = inn.batsmen.indexOf(b);
    return '<div class="select-item" id="ns_' + idx + '" onclick="selectNonStriker(' + idx + ')">' + b.name + '</div>';
  }).join('') || '<div class="empty-state">No available batsmen</div>';
}

function selectStriker(idx) {
  tempStriker = idx;
  document.querySelectorAll('[id^="str_"]').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('str_' + idx);
  if (el) el.classList.add('selected');
}
function selectNonStriker(idx) {
  tempNonStriker = idx;
  document.querySelectorAll('[id^="ns_"]').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('ns_' + idx);
  if (el) el.classList.add('selected');
}

function confirmBatsmen() {
  const inn = matchState.innings[matchState.curInn];
  const avail = inn.batsmen.filter(b => b.status === 'yet to bat');

  if (avail.length <= 1) {
    // Solo batter mode — only a striker, no non-striker
    if (tempStriker === null) { showToast('Select the opening batsman', true); return; }
    inn.striker = tempStriker;
    inn.nonStriker = null;
    inn.batsmen[tempStriker].status = 'batting';
    tempStriker = null; tempNonStriker = null;
    matchState.phase = 'select_bowler';
    renderMatch(); return;
  }

  if (tempStriker === null || tempNonStriker === null) { showToast('Select both striker and non-striker', true); return; }
  if (tempStriker === tempNonStriker) { showToast('Must be different players', true); return; }
  inn.striker = tempStriker;
  inn.nonStriker = tempNonStriker;
  inn.batsmen[tempStriker].status = 'batting';
  inn.batsmen[tempNonStriker].status = 'batting';
  tempStriker = null; tempNonStriker = null;
  matchState.phase = 'select_bowler';
  renderMatch();
}

function renderBowlerList(inn) {
  document.getElementById('bowlerSelectList').innerHTML = inn.bowlers.map((b, i) =>
    '<div class="select-item" id="bwl_' + i + '" onclick="selectBowler(' + i + ')">' +
    '<span>' + b.name + '</span>' +
    '<span style="margin-left:auto;font-size:11px;color:var(--text-dim)">' + fmtOvers(b.balls) + ' ov · ' + b.runs + 'R · ' + b.wickets + 'W</span>' +
    '</div>'
  ).join('');
}

function selectBowler(idx) {
  tempBowler = idx;
  document.querySelectorAll('[id^="bwl_"]').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('bwl_' + idx);
  if (el) el.classList.add('selected');
}

function confirmBowler() {
  if (tempBowler === null) { showToast('Select a bowler', true); return; }
  const inn = matchState.innings[matchState.curInn];
  inn.currentBowler = tempBowler;
  inn.currentOverBalls = [];
  tempBowler = null;
  matchState.phase = 'live';
  renderMatch();
}

function renderNextBatsmanList(inn) {
  const avail = inn.batsmen.filter(b => b.status === 'yet to bat');
  document.getElementById('nextBatsmanSelectList').innerHTML = avail.length
    ? avail.map(b => {
        const idx = inn.batsmen.indexOf(b);
        return '<div class="select-item" id="nxt_' + idx + '" onclick="selectNextBatsman(' + idx + ')">' + b.name + '</div>';
      }).join('')
    : '<div class="empty-state">No more batsmen</div>';
}

function selectNextBatsman(idx) {
  tempNextBatsman = idx;
  document.querySelectorAll('[id^="nxt_"]').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('nxt_' + idx);
  if (el) el.classList.add('selected');
}

function confirmNextBatsman() {
  if (tempNextBatsman === null) { showToast('Select next batsman', true); return; }
  const inn = matchState.innings[matchState.curInn];
  if (inn.vacantSlot === 'nonStriker') {
    inn.nonStriker = tempNextBatsman;
  } else {
    inn.striker = tempNextBatsman;
  }
  inn.batsmen[tempNextBatsman].status = 'batting';
  inn.vacantSlot = null;
  tempNextBatsman = null;
  matchState.phase = 'live';
  renderMatch();
}

// ═══════════════════════════════════════════════════════════════
//   BALL PROCESSING
// ═══════════════════════════════════════════════════════════════
let pendingWicketVictim = 'striker';

function swapStrike() {
  const inn = matchState && matchState.innings[matchState.curInn];
  if (!inn || inn.nonStriker === null) return false;
  pushUndoSnapshot();
  const tmp = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = tmp;
  renderMatch();
  return true;
}

function recordBall(result, extraRuns) {
  if (result === 'W') {
    openWicketModal();
    return;
  }
  processBall(result, null, undefined, extraRuns);
}

// Only asks "who got out" when there IS a non-striker to choose between —
// solo-batter innings skip straight to the dismissal-type buttons exactly
// as before, so that flow stays one tap.
function openWicketModal() {
  const inn = matchState.innings[matchState.curInn];
  pendingWicketVictim = 'striker';
  const chooser = document.getElementById('wicketVictimChooser');
  if (inn.nonStriker !== null) {
    chooser.style.display = '';
    document.getElementById('wicketVictimStrikerBtn').textContent = inn.batsmen[inn.striker].name + ' (Striker)';
    document.getElementById('wicketVictimNonStrikerBtn').textContent = inn.batsmen[inn.nonStriker].name + ' (Non-Striker)';
    selectWicketVictim('striker');
  } else {
    chooser.style.display = 'none';
  }
  document.getElementById('wicketModal').classList.add('show');
}

function selectWicketVictim(v) {
  pendingWicketVictim = v;
  const s = document.getElementById('wicketVictimStrikerBtn');
  const n = document.getElementById('wicketVictimNonStrikerBtn');
  s.classList.toggle('btn-primary', v === 'striker');
  s.classList.toggle('btn-secondary', v !== 'striker');
  n.classList.toggle('btn-primary', v === 'nonStriker');
  n.classList.toggle('btn-secondary', v !== 'nonStriker');
}

function confirmWicket(mode) {
  document.getElementById('wicketModal').classList.remove('show');
  const victim = pendingWicketVictim;
  pendingWicketVictim = 'striker';
  processBall('W', mode, victim);
}

// ═══════════════════════════════════════════════════════════════
//   KEYBOARD SHORTCUTS FOR SCORING
//   0-6 = runs, w = wicket, l = leg bye, b = bye,
//   n = no ball, d = wide, u = undo last ball
// ═══════════════════════════════════════════════════════════════
const BALL_KEY_MAP = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6',
  'w': 'W',
  'l': 'LB',
  'b': 'Bye',
  'n': 'Nb',
  'd': 'Wd'
};

document.addEventListener('keydown', function(e) {
  // Don't hijack typing in text fields, or shortcuts with modifier keys held.
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

  // Only score via keyboard while the live match screen is showing.
  const matchScreen = document.getElementById('matchScreen');
  if (!matchScreen || !matchScreen.classList.contains('active')) return;

  // If the wicket dismissal-type modal is open, let its own buttons handle input.
  const wicketModal = document.getElementById('wicketModal');
  if (wicketModal && wicketModal.classList.contains('show')) return;

  const key = e.key.toLowerCase();

  if (key === 'u') {
    e.preventDefault();
    undoLastBall();
    return;
  }

  const mapped = BALL_KEY_MAP[key];
  if (mapped !== undefined) {
    e.preventDefault();
    recordBall(mapped);
  }
});

function processBall(result, wicketMode, victim, extraRuns) {
  const m = matchState;
  const inn = m.innings[m.curInn];
  // Snapshot the WHOLE match state before touching anything, so undo can
  // restore everything (runs, wicket, extras, strike, bowler figures,
  // batsman stats, partnership, over progress) by just putting this back —
  // instead of manually reversing each field one at a time.
  pushUndoSnapshot();
  const striker = inn.batsmen[inn.striker];
  const bowler = inn.bowlers[inn.currentBowler];
  // Who is actually dismissed — normally the striker, but a run out (etc.)
  // can just as easily end the non-striker's innings.
  const outBatsman = (result === 'W' && victim === 'nonStriker' && inn.nonStriker !== null)
    ? inn.batsmen[inn.nonStriker] : striker;

  const isWide = result === 'Wd';
  const isNoBall = result === 'Nb';
  const isExtra = isWide || isNoBall;
  const isByeExtra = result === 'Bye' || result === 'LB';
  const isLegal = !isExtra;

  // Runs
  let totalRuns = 0, batsmanRuns = 0;
  if (!isNaN(parseInt(result))) {
    totalRuns = batsmanRuns = parseInt(result);
  } else if (isWide) {
    // "3 wides" is the TOTAL extras on the ball (the compulsory 1 plus any run byes),
    // matching how it's conventionally spoken and recorded.
    totalRuns = (extraRuns != null && extraRuns >= 0) ? extraRuns : 1;
  } else if (isNoBall) {
    // The no-ball penalty run is fixed at 1; any spoken number is runs the
    // batsman actually struck off the free hit, credited to them below.
    const batRuns = (extraRuns != null && extraRuns >= 0) ? extraRuns : 0;
    totalRuns = 1 + batRuns;
    batsmanRuns = batRuns;
  } else if (isByeExtra) {
    totalRuns = (extraRuns != null && extraRuns >= 0) ? extraRuns : 1;
  }

  // Score
  inn.score += totalRuns;
  if (isWide) inn.extras.wide++;
  else if (isNoBall) inn.extras.noBall++;
  else if (result === 'Bye') inn.extras.bye++;
  else if (result === 'LB') inn.extras.legBye++;

  // Batsman
  if (isLegal && !isByeExtra) { /* balls only if not bye/lb? No — byes still count as balls faced */ }
  if (isLegal) striker.balls++;
  if (batsmanRuns > 0 && !isByeExtra) {
    striker.runs += batsmanRuns;
    if (result === '4' || (isNoBall && batsmanRuns === 4)) striker.fours++;
    if (result === '6' || (isNoBall && batsmanRuns === 6)) striker.sixes++;
  }
  if (striker.runs >= 50 && striker.fifty === null) {
    striker.fifty = striker.balls;
    showMilestone('🎉 FIFTY! ' + striker.name + ' scores a half-century! 50★');
  }
  if (striker.runs >= 100 && striker.hundred === null) {
    striker.hundred = striker.balls;
    showMilestone('💯 CENTURY! ' + striker.name + ' reaches a hundred! 100★');
  }
  if (striker.runs >= 150 && striker.hundredfifty === null) {
    striker.hundredfifty = striker.balls;
    showMilestone('🌟 150! ' + striker.name + ' smashes a breathtaking 150! 150★');
  }
  if (striker.runs >= 200 && striker.twohundred === null) {
    striker.twohundred = striker.balls;
    showMilestone('🚀 DOUBLE CENTURY! ' + striker.name + ' reaches 200! 200★');
  }

  // Bowler
  if (isLegal) { bowler.balls++; bowler.ballsInCurrentOver = (bowler.ballsInCurrentOver||0) + 1; }
  if (!isByeExtra) { bowler.runs += totalRuns; bowler.runsInCurrentOver = (bowler.runsInCurrentOver||0) + totalRuns; }
  else { bowler.runsInCurrentOver = (bowler.runsInCurrentOver||0) + totalRuns; } // byes/leg-byes still count against a maiden
  if (result === 'W') {
    inn.wickets++; bowler.wickets++;
    outBatsman.status = 'out: ' + (wicketMode || 'dismissed');
    // Remember which slot (striker/non-striker) the incoming batsman needs
    // to fill, so confirmNextBatsman() puts them in the right place.
    inn.vacantSlot = (outBatsman === striker) ? 'striker' : 'nonStriker';
  }

  // Log
  const comm = mkComm(result, outBatsman, bowler, wicketMode, batsmanRuns);
  inn.ballLog.push({ result, totalRuns, batsmanRuns, batsmanName: striker.name, nonStrikerName: inn.nonStriker ? inn.nonStriker.name : null, bowlerName: bowler.name, comm, isExtra });
  inn.currentOverBalls.push(result);

  // Legal ball count
  const legalThisOver = inn.currentOverBalls.filter(b => !['Wd','Nb'].includes(b)).length;
  inn.balls = inn.overIdx * 6 + legalThisOver;

  // Rotate strike on odd runs (only if non-striker exists)
  if ([1, 3, 5].includes(batsmanRuns) && inn.nonStriker !== null) {
    const tmp = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = tmp;
  }

  // Render commentary
  renderComm(inn.ballLog.slice(-12).reverse());

  // Check innings end
  // Limited overs: capped by m.overs. Test: no over cap — only all-out,
  // a declaration (handled separately by declareInnings()), or the side
  // batting 4th passing the aggregate target ends the innings.
  const maxBalls = m.format === 'test' ? Infinity : m.overs * 6;
  const allOut = m.loneBatsman
    ? inn.wickets >= inn.batsmen.length
    : inn.wickets >= Math.max(inn.batsmen.length - 1, 1);
  // A run-chase only auto-completes the innings in limited overs that way;
  // a Test "chase" is judged on the aggregate target in the 4th innings.
  const chaseComplete = m.format !== 'test' && m.curInn === 1 && m.innings[0] && inn.score > m.innings[0].score;
  const testChaseComplete = m.format === 'test' && m.curInn === 3 && (() => {
    const target = testTargetForFinalInnings(m);
    return target !== null && inn.score >= target;
  })();
  if (inn.balls >= maxBalls || allOut || chaseComplete || testChaseComplete) {
    inn.batsmen.forEach(b => { if (b.status === 'batting') b.status = 'not out'; });
    endInnings(); return;
  }

  // After wicket — need next batsman
  if (result === 'W') {
    const stillToBat = inn.batsmen.some(b => b.status === 'yet to bat');
    if (!stillToBat) {
      // No replacement left in the squad — under Single Batting, the
      // remaining not-out partner just keeps batting alone.
      const soloIdx = inn.batsmen.findIndex(b => b.status === 'batting');
      if (soloIdx !== -1) {
        inn.striker = soloIdx;
        inn.nonStriker = null;
        renderMatch(); return;
      }
    }
    m.phase = 'select_next_batsman';
    renderMatch(); return;
  }

  // Over complete
  if (legalThisOver >= 6) {
    // A maiden is an over with zero runs scored off it (extras included,
    // by the simplified scoring this app uses for byes/leg-byes).
    if ((bowler.runsInCurrentOver||0) === 0) bowler.maidens = (bowler.maidens||0) + 1;
    bowler.ballsInCurrentOver = 0; bowler.runsInCurrentOver = 0;
    // Rotate strike at end of over (only if non-striker exists)
    if (inn.nonStriker !== null) {
      const tmp = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = tmp;
    }
    inn.overIdx++;
    inn.balls = inn.overIdx * 6;
    inn.currentOverBalls = [];
    m.phase = 'select_bowler';
    renderMatch(); return;
  }

  renderMatch();
}

const COMM = {
  '0': ['Dot ball. Tight line from the bowler.', 'Defended solidly. No run.', 'Beats the bat — dot!', 'Watchful defence.'],
  '1': ['Quick single taken!', 'Pushed to mid-on for one.', 'Rotates the strike.', 'Tucks it away for a single.'],
  '2': ['Good running! Two taken.', 'Placed beautifully for two.', 'They scamper back for a second.'],
  '3': ['Excellent running! Three taken.', 'Drives hard, comes back for the third.'],
  '4': ['FOUR! Races to the boundary!', 'FOUR! Cracking shot!', 'FOUR! Nothing the fielder could do!', 'FOUR! Brilliantly placed!'],
  '5': ['Five! Overthrows add to the total!'],
  '6': ['SIX! Goes all the way!', 'MAXIMUM! What a hit!', 'SIX! Over the ropes!', 'HUGE SIX! Into the crowd!'],
  'Wd': ['Wide! Strays down leg.', 'Wide called — going down leg side.'],
  'Nb': ['No-ball! Overstepping! Free hit coming up!', 'NO BALL! The bowler has overstepped.'],
  'Bye': ['Byes! Keeper fumbles it.', 'Byes off the pads.'],
  'LB': ['Leg byes taken.', 'Off the pad, leg byes.']
};

function mkComm(result, batsman, bowler, wMode, bRuns) {
  if (result === 'W') {
    return '🚨 OUT! ' + batsman.name + ' is dismissed — ' + (wMode || 'dismissed') + '! ' + bowler.name + ' gets the wicket!';
  }
  const arr = COMM[result];
  return arr ? arr[Math.floor(Math.random() * arr.length)] : 'Ball: ' + result;
}

function renderComm(balls) {
  document.getElementById('commentaryWrap').innerHTML = balls.map(b => {
    const tagMap = { 'Wd':'tag-Wd','Nb':'tag-Nb','Bye':'tag-Bye','LB':'tag-LB','W':'tag-W',
      '0':'tag-0','1':'tag-1','2':'tag-2','3':'tag-3','4':'tag-4','6':'tag-6' };
    const lblMap = { 'Wd':'Wide','Nb':'NB','Bye':'Bye','LB':'LB','W':'🚨W' };
    const cls = tagMap[b.result] || 'tag-0';
    const lbl = lblMap[b.result] || b.result;
    return '<div class="commentary-item"><span class="ball-tag ' + cls + '">' + lbl + '</span><span class="comm-text">' + b.comm + '</span></div>';
  }).join('') || '<div class="empty-state">No balls yet</div>';
}

// ─── UNDO (snapshot-based) ───────────────────────────────────────────
// Rather than manually reversing each field a ball touched (score, strike,
// bowler figures, over/maiden progress, milestone flags, …) — which is easy
// to get subtly wrong — we snapshot the whole match state immediately
// before every ball is processed. Undo just restores that snapshot, so it
// genuinely reverses EVERYTHING the ball did, in one click.
function pushUndoSnapshot() {
  if (!matchState.undoStack) matchState.undoStack = [];
  matchState.undoStack.push({
    curInn: matchState.curInn,
    phase: matchState.phase,
    innings: matchState.innings.map(inn => inn ? JSON.parse(JSON.stringify(inn)) : null)
  });
  // Cap history so autosave payload / memory doesn't grow without bound
  // across a very long Test innings.
  if (matchState.undoStack.length > 400) matchState.undoStack.shift();
  // A fresh action invalidates whatever used to be "ahead" of us.
  matchState.redoStack = [];
}

function snapshotCurrentState() {
  return {
    curInn: matchState.curInn,
    phase: matchState.phase,
    innings: matchState.innings.map(inn => inn ? JSON.parse(JSON.stringify(inn)) : null)
  };
}

function undoLastBall() {
  if (!matchState.undoStack || !matchState.undoStack.length) { showToast('Nothing to undo'); return; }
  if (!matchState.redoStack) matchState.redoStack = [];
  matchState.redoStack.push(snapshotCurrentState());
  const last = matchState.undoStack.pop();
  const remainingStack = matchState.undoStack;
  matchState.curInn = last.curInn;
  matchState.phase = last.phase;
  matchState.innings = last.innings;
  matchState.undoStack = remainingStack;
  renderMatch();
  const inn = matchState.innings[matchState.curInn];
  if (inn) renderComm(inn.ballLog.slice(-12).reverse());
}

function redoLastAction() {
  if (!matchState.redoStack || !matchState.redoStack.length) { showToast('Nothing to redo'); return false; }
  if (!matchState.undoStack) matchState.undoStack = [];
  matchState.undoStack.push(snapshotCurrentState());
  const next = matchState.redoStack.pop();
  matchState.curInn = next.curInn;
  matchState.phase = next.phase;
  matchState.innings = next.innings;
  renderMatch();
  const inn = matchState.innings[matchState.curInn];
  if (inn) renderComm(inn.ballLog.slice(-12).reverse());
  return true;
}


