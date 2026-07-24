// ═══════════════════════════════════════════════════════════════
//   HISTORY — match history screen
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//   HISTORY
// ═══════════════════════════════════════════════════════════════
let lastHistoryData = [];
let openHistoryMatchId = null;

async function renderHistory() {
  const history = await loadHistory();
  lastHistoryData = history;
  const grid = document.getElementById('historyGrid');
  if (!history.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div style="font-size:32px;margin-bottom:8px">📋</div>No matches played yet</div>';
    return;
  }

  // Group matches: series matches cluster under a series header; standalone matches are solo.
  // We iterate in order (newest first) and collect groups.
  const groups = []; // each group: { type:'series'|'match', seriesId, seriesLabel, matches:[] } or { type:'match', match }
  const seriesGroupMap = {}; // seriesId -> group index in groups[]

  history.forEach(m => {
    if (m.series && m.series.seriesId) {
      const sid = m.series.seriesId;
      if (seriesGroupMap[sid] === undefined) {
        seriesGroupMap[sid] = groups.length;
        groups.push({ type: 'series', seriesId: sid, seriesLabel: m.series.seriesLabel, totalMatches: m.series.totalMatches, matches: [] });
      }
      groups[seriesGroupMap[sid]].matches.push(m);
    } else {
      groups.push({ type: 'match', match: m });
    }
  });

  let html = '';
  groups.forEach(group => {
    if (group.type === 'match') {
      html += renderHistoryCard(group.match);
    } else {
      // Series group header + cards
      const played = group.matches.length;
      const total  = group.totalMatches || '?';
      html += `
        <div style="grid-column:1/-1;margin-top:8px;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:16px">🏆</span>
            <span style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--accent)">${group.seriesLabel}</span>
            <span style="font-size:11px;color:var(--text-muted);background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:2px 10px">${played} / ${total} matches played</span>
          </div>
          <div style="height:1px;background:linear-gradient(90deg,var(--accent),transparent);margin-top:8px;margin-bottom:12px"></div>
        </div>`;
      // Sort series matches by matchNum so they display in order (oldest first within the cluster)
      const sorted = [...group.matches].sort((a,b) => (a.series.matchNum||0) - (b.series.matchNum||0));
      sorted.forEach(m => { html += renderHistoryCard(m, group.seriesLabel); });
      // Closing spacer
      html += `<div style="grid-column:1/-1;margin-bottom:8px"></div>`;
    }
  });

  grid.innerHTML = html;
}

function renderHistoryCard(m, seriesLabel) {
  const d   = new Date(m.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric', weekday:'short'});
  const t1  = m.teams.A?.name || 'A';
  const t2  = m.teams.B?.name || 'B';
  const isTest = m.format === 'test';
  const seriesBadge = m.series
    ? `<span style="font-size:10px;font-weight:700;color:var(--accent);background:rgba(255,107,0,0.12);border:1px solid rgba(255,107,0,0.3);border-radius:20px;padding:1px 8px;letter-spacing:0.5px">M${m.series.matchNum}</span>`
    : '';
  const formatBadge = isTest
    ? `<span style="font-size:10px;font-weight:700;color:var(--purple);background:rgba(184,79,255,0.12);border:1px solid rgba(184,79,255,0.3);border-radius:20px;padding:1px 8px;letter-spacing:0.5px">🎩 TEST</span>`
    : '';
  // Test matches can have up to 4 innings; show each on its own line rather
  // than the legacy score1/score2 pair which only covers the first two.
  const scoresHtml = isTest && Array.isArray(m.innings) && m.innings.some(Boolean)
    ? m.innings.filter(Boolean).map((inn, idx) => {
        const ord = ['1st','2nd','3rd','4th'][idx] || (idx+1)+'th';
        return '<div>' + (m.teams[inn.batTeam]?.name||'') + ' (' + ord + '): ' + inn.score + '/' + inn.wickets + (inn.declared?'d':'') + '</div>';
      }).join('')
    : '<div>' + (m.teams[m.bf]?.name||t1) + ': ' + m.score1 + '</div><div>' + (m.teams[m.bf==='A'?'B':'A']?.name||t2) + ': ' + m.score2 + '</div>';
  return (
    '<div class="history-card" onclick="showHistoryDetail(' + m.id + ')" style="cursor:pointer">' +
    '<div class="hc-header">' +
      '<div class="hc-teams" style="display:flex;align-items:center;gap:8px">' + t1 + ' vs ' + t2 + seriesBadge + formatBadge + '</div>' +
      '<div class="hc-date">📅 ' + d + '</div>' +
    '</div>' +
    '<div class="hc-body">' +
      '<div class="hc-result">🏆 ' + (m.result?.winner||'?') + (m.result?.margin?' · '+m.result.margin:'') + '</div>' +
      '<div class="hc-scores">' + scoresHtml + '</div>' +
      '<div class="hc-top">Top scorer: <strong>' + m.topScorer + '</strong> — ' + m.topScorerRuns + ' runs</div>' +
    '</div></div>'
  );
}


