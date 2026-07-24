// ═══════════════════════════════════════════════════════════════
//   UI — milestone banner, toasts, right-panel tabs
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   MILESTONE BANNER SYSTEM
// ═══════════════════════════════════════════════════════════════
let milestoneQueue = [];
let milestoneActive = false;

function showMilestone(text) {
  milestoneQueue.push(text);
  if (typeof VoiceManager !== 'undefined' && VoiceManager.active) {
    VoiceManager.announce(text);
  }
  if (!milestoneActive) processNextMilestone();
}

function processNextMilestone() {
  if (!milestoneQueue.length) { milestoneActive = false; return; }
  milestoneActive = true;
  const banner = document.getElementById('milestoneBanner');
  banner.textContent = milestoneQueue.shift();
  banner.classList.add('show');
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(processNextMilestone, 500);
  }, 3500);
}

// Quick, non-blocking notice — used instead of alert() anywhere inside the
// scoring flow so a mis-tap never stalls the scorer with a dialog they have
// to dismiss before the next ball can be recorded.
let toastTimer = null;
function showToast(text, warn) {
  const t = document.getElementById('toastBanner');
  clearTimeout(toastTimer);
  t.textContent = text;
  t.classList.toggle('warn', !!warn);
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}


// ═══════════════════════════════════════════════════════════════
//   RIGHT PANEL TABS
// ═══════════════════════════════════════════════════════════════
let currentRightTab = 'records';
let currentPSTeam = 'A';

function switchRightTab(tab) {
  currentRightTab = tab;
  document.getElementById('rightRecordsPanel').style.display = tab === 'records' ? '' : 'none';
  document.getElementById('rightPlayerStatsPanel').style.display = tab === 'player-stats' ? '' : 'none';
  document.getElementById('tabRecords').className = 'right-tab' + (tab === 'records' ? ' active' : '');
  document.getElementById('tabPlayerStats').className = 'right-tab' + (tab === 'player-stats' ? ' active' : '');
  if (tab === 'player-stats') renderMatchPlayerStats(currentPSTeam);
}

function switchPSTeam(team) {
  currentPSTeam = team;
  if (matchState) {
    document.getElementById('psTabA').textContent = matchState.teams.A.name;
    document.getElementById('psTabB').textContent = matchState.teams.B.name;
  }
  document.getElementById('psTabA').className = 'btn btn-sm ' + (team === 'A' ? 'btn-primary' : 'btn-ghost');
  document.getElementById('psTabB').className = 'btn btn-sm ' + (team === 'B' ? 'btn-primary' : 'btn-ghost');
  renderMatchPlayerStats(team);
}

function renderMatchPlayerStats(team) {
  const content = document.getElementById('playerStatsContent');
  if (!matchState) { content.innerHTML = '<div class="empty-state">No active match</div>'; return; }
  const m = matchState;

  // Update team button labels
  document.getElementById('psTabA').textContent = m.teams.A.name;
  document.getElementById('psTabB').textContent = m.teams.B.name;
  document.getElementById('psTabA').className = 'btn btn-sm ' + (team === 'A' ? 'btn-primary' : 'btn-ghost');
  document.getElementById('psTabB').className = 'btn btn-sm ' + (team === 'B' ? 'btn-primary' : 'btn-ghost');

  // Build player data for the selected team (across both innings)
  const playerData = {};
  m.teams[team].players.forEach(name => {
    playerData[name] = { name, runs:0, balls:0, fours:0, sixes:0, status:'yet to bat' };
  });
  [m.innings[0], m.innings[1]].forEach(inn => {
    if (!inn || inn.batTeam !== team) return;
    inn.batsmen.forEach(b => { playerData[b.name] = { ...b }; });
  });

  const players = Object.values(playerData);
  if (!players.length) { content.innerHTML = '<div class="empty-state">No players in this team</div>'; return; }

  let rows = players.map(p => {
    const sr = p.balls > 0 ? (p.runs/p.balls*100).toFixed(1) : '—';
    const isBatting = p.status === 'batting';
    const isNotOut = p.status === 'not out';
    const isYet = p.status === 'yet to bat';
    const isOut = !isBatting && !isNotOut && !isYet;
    const statusColor = isBatting ? 'var(--accent2)' : isNotOut ? 'var(--green)' : isOut ? 'var(--red)' : 'var(--text-dim)';
    const statusLabel = isBatting ? '▶ batting' : isNotOut ? 'not out' : isYet ? 'yet to bat' : p.status.replace('out: ','');
    const runsColor = p.runs >= 100 ? 'var(--yellow)' : p.runs >= 50 ? 'var(--accent2)' : 'var(--text)';
    const dash = '—';
    return '<tr onclick="showPlayerModal(\'' + p.name.replace(/'/g,"\\'") + '\',\'' + team + '\')">' +
      '<td><div style="font-family:var(--font-display);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:85px">' + p.name + '</div>' +
      '<div style="font-size:10px;color:' + statusColor + '">' + statusLabel + '</div></td>' +
      '<td style="font-family:var(--font-display);font-weight:700;font-size:15px;color:' + runsColor + '">' + (!isYet ? p.runs : dash) + '</td>' +
      '<td>' + (!isYet ? p.balls : dash) + '</td>' +
      '<td><span class="four-badge">' + (!isYet ? p.fours : dash) + '</span></td>' +
      '<td><span class="six-badge">' + (!isYet ? p.sixes : dash) + '</span></td>' +
      '<td style="color:var(--accent2);font-family:var(--font-display);font-size:12px">' + (!isYet ? sr : dash) + '</td>' +
      '</tr>';
  }).join('');

  content.innerHTML = '<div style="overflow-x:auto">' +
    '<table class="ps-table">' +
    '<thead><tr><th style="min-width:85px">Player</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}


