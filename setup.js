// ═══════════════════════════════════════════════════════════════
//   SETUP — match setup + match init
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   SETUP
// ═══════════════════════════════════════════════════════════════
function selectMatchFormat(fmt) {
  matchFormat = fmt;
  document.getElementById('mfmt-limited').classList.toggle('selected', fmt === 'limited');
  document.getElementById('mfmt-test').classList.toggle('selected', fmt === 'test');
  document.getElementById('oversRow').style.display = fmt === 'test' ? 'none' : '';
  document.getElementById('testInfoRow').style.display = fmt === 'test' ? '' : 'none';
  // Series mode (points table / NRR) is built around single-innings limited
  // overs matches, so it isn't offered for Test format — switch it off and
  // hide the panel rather than letting the two systems conflict.
  const seriesPanel = document.getElementById('seriesModePanel');
  const seriesToggle = document.getElementById('seriesModeToggle');
  if (fmt === 'test') {
    if (seriesToggle.checked) { seriesToggle.checked = false; onSeriesModeToggle(); }
    seriesPanel.style.display = 'none';
  } else {
    seriesPanel.style.display = '';
  }
  const startBtn = document.getElementById('startMatchBtn');
  if (startBtn && !seriesToggle.checked) {
    startBtn.textContent = fmt === 'test' ? 'Start Test Match →' : 'Start Match →';
  }
}

function changeOvers(d) {
  oversVal = Math.max(1, Math.min(50, oversVal + d));
  document.getElementById('oversDisplay').textContent = oversVal;
}

async function addPlayer(team) {
  const input = document.getElementById('team' + team + 'PlayerInput');
  const name = input.value.trim();
  if (!name) return;
  setupState['team' + team].players.push(name);
  input.value = '';
  renderPlayerList(team);
  await rememberPlayer(name);
}

// One-tap add from the "previously used" chips — no typing needed.
async function quickAddPlayer(team, name) {
  setupState['team' + team].players.push(name);
  renderPlayerList(team);
  renderKnownPlayersUI();
}

function renderKnownPlayersUI() {
  const datalist = document.getElementById('knownPlayersList');
  if (datalist) datalist.innerHTML = knownPlayers.map(p => `<option value="${p}"></option>`).join('');

  ['A', 'B'].forEach(team => {
    const el = document.getElementById('team' + team + 'QuickPlayers');
    if (!el) return;
    const used = setupState['team' + team].players;
    const available = knownPlayers.filter(p => !used.includes(p));
    if (!available.length) { el.innerHTML = ''; return; }
    el.innerHTML = available.map(p =>
      `<span class="quick-player-chip" onclick="quickAddPlayer('${team}','${p.replace(/'/g, "\\'")}')">+ ${p}</span>`
    ).join('');
  });
}

function removePlayer(team, idx) {
  setupState['team' + team].players.splice(idx, 1);
  renderPlayerList(team);
  renderKnownPlayersUI();
}

function renderPlayerList(team) {
  const el = document.getElementById('team' + team + 'List');
  const players = setupState['team' + team].players;
  if (!players.length) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:4px 0">No players added yet</div>';
    return;
  }
  el.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <span class="player-num">${i+1}</span>
      <span>${p}</span>
      <button onclick="removePlayer('${team}',${i})">×</button>
    </div>`).join('');
}

const DEFAULTS = {
  A: ['Rohit Sharma','Shikhar Dhawan','Virat Kohli','KL Rahul','Hardik Pandya','Dinesh Karthik','Axar Patel','Ravindra Jadeja','Jasprit Bumrah','Mohammad Shami','Kuldeep Yadav'],
  B: ['Ruturaj Gaikwad','Devon Conway','Moeen Ali','Ambati Rayudu','MS Dhoni','Shivam Dube','Deepak Chahar','Maheesh Theekshana','Tushar Deshpande','Simarjeet Singh','Matheesha Pathirana']
};

function fillDefault(team) {
  setupState['team' + team].players = [...DEFAULTS[team]];
  renderPlayerList(team);
  renderKnownPlayersUI();
}

function flipCoin() {
  if (tossFlipped) return;
  const coin = document.getElementById('coinEl');
  coin.classList.add('flipping');
  setTimeout(() => {
    coin.classList.remove('flipping');
    tossWinnerTeam = Math.random() < 0.5 ? 'A' : 'B';
    const teamName = document.getElementById('team' + tossWinnerTeam + 'Name').value || 'Team ' + tossWinnerTeam;
    document.getElementById('tossResult').textContent = '🎉 ' + teamName + ' wins the toss!';
    document.getElementById('tossChoice').classList.remove('hidden');
    tossFlipped = true;
  }, 1300);
}

function chooseBat() {
  finalizeChoice(tossWinnerTeam, 'bat');
}
function chooseBowl() {
  finalizeChoice(tossWinnerTeam === 'A' ? 'B' : 'A', 'bat');
}
function finalizeChoice(battingTeam, _) {
  setupState.battingFirst = battingTeam;
  const name = document.getElementById('team' + battingTeam + 'Name').value || 'Team ' + battingTeam;
  document.getElementById('tossResult').textContent = '✅ ' + name + ' will bat first';
  document.getElementById('tossChoice').classList.add('hidden');
}

function startMatch() {
  // Series mode: delegate to series init
  if (document.getElementById('seriesModeToggle').checked) {
    setupState.teamA.name = document.getElementById('teamAName').value.trim() || 'Team Alpha';
    setupState.teamB.name = document.getElementById('teamBName').value.trim() || 'Team Beta';
    setupState.teamA.players = [...setupState.teamA.players];
    setupState.teamB.players = [...setupState.teamB.players];
    oversVal = parseInt(document.getElementById('oversDisplay').textContent) || oversVal;
    startSeriesFirstMatch();
    return;
  }
  // Normal single match
  setupState.teamA.name = document.getElementById('teamAName').value.trim() || 'Team Alpha';
  setupState.teamB.name = document.getElementById('teamBName').value.trim() || 'Team Beta';
  setupState.overs = oversVal;
  setupState.singleBatting = document.getElementById('singleBattingToggle').checked;
  if (setupState.teamA.players.length < 1) { showToast('Team A needs at least 1 player', true); return; }
  if (setupState.teamB.players.length < 1) { showToast('Team B needs at least 1 player', true); return; }
  if (!setupState.battingFirst) { showToast('Please complete the toss first', true); return; }
  seriesState = null; // ensure no leftover series state
  updateSeriesResultButtons(false);
  initMatch();
  showScreen('matchScreen');
}

// ═══════════════════════════════════════════════════════════════
//   MATCH INIT
// ═══════════════════════════════════════════════════════════════
function initMatch() {
  const bf = setupState.battingFirst;
  const bwl = bf === 'A' ? 'B' : 'A';
  // Assign teams first so makeInnings can safely read matchState.teams
  matchState = {
    id: Date.now(),
    date: new Date().toISOString(),
    format: matchFormat, // 'limited' | 'test'
    teams: {
      A: { name: setupState.teamA.name, players: [...setupState.teamA.players] },
      B: { name: setupState.teamB.name, players: [...setupState.teamB.players] }
    },
    overs: matchFormat === 'test' ? null : oversVal,
    loneBatsman: !!setupState.singleBatting,
    innings: [],
    curInn: 0,
    phase: 'select_batsmen',
    followOnUsed: false
  };
  // Limited overs: fixed 2-slot innings array, one per side.
  // Test: up to 4 innings, built lazily as the match progresses (the order
  // can change if a follow-on is enforced), so we only seed the 1st innings.
  matchState.innings = matchFormat === 'test' ? [makeInnings(bf, bwl)] : [makeInnings(bf, bwl), null];
  tempStriker = null; tempNonStriker = null; tempBowler = null; tempNextBatsman = null;
  renderMatch();
}

function makeInnings(batTeam, bwlTeam) {
  return {
    batTeam, bwlTeam,
    score: 0, wickets: 0, balls: 0,
    declared: false,
    extras: { wide:0, noBall:0, bye:0, legBye:0 },
    batsmen: matchState.teams[batTeam].players.map(name => ({
      name, runs:0, balls:0, fours:0, sixes:0,
      status:'yet to bat', fifty:null, hundred:null, hundredfifty:null, twohundred:null
    })),
    bowlers: matchState.teams[bwlTeam].players.map(name => ({
      name, balls:0, runs:0, wickets:0, maidens:0, ballsInCurrentOver:0, runsInCurrentOver:0
    })),
    ballLog: [], striker:null, nonStriker:null, currentBowler:null,
    currentOverBalls: [], overIdx: 0
  };
}


