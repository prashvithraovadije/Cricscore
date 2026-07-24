// ═══════════════════════════════════════════════════════════════
//   VOICE — voice control manager
//   Extracted from the original single-file Crickscorer app.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//   VOICE MANAGER  —  Phase 1: Voice Foundation · Phase 2: Basic Scoring
//                      Phase 3: Conversation Engine
//
//   Voice Manager
//   │
//   ├── Speech Recognition   (continuous listening, start/stop, auto-restart,
//   │                         confidence threshold, basic noise filtering)
//   ├── Text To Speech       (rate, gender, volume)
//   ├── Conversation State   (multi-turn follow-up questions)
//   ├── Command Parser       (Phase 2 scoring vocabulary + control words)
//   ├── Player Name Matcher  (fuzzy-matches spoken names to the squad list)
//   ├── Match Controller     (change bowler / next batsman via the app's
//   │                         own selection functions)
//   └── Score Controller     (delegates to recordBall / processBall)
//
//   Everything below is self-contained; the rest of the app is untouched
//   except that recordBall()/processBall() now accept an optional extra-
//   runs count (see the scoring section), and undo/redo got a redo stack.
// ═══════════════════════════════════════════════════════════════════════

const VoiceManager = (() => {

  // ───────────────────────── settings (persisted) ─────────────────────
  const DEFAULT_SETTINGS = { rate: 1, volume: 1, gender: 'auto', confidence: 0.5, lang: 'en-IN' };

  function loadSettings() {
    try {
      const raw = localStorage.getItem('voiceSettings');
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings() {
    try { localStorage.setItem('voiceSettings', JSON.stringify(settings)); } catch (e) {}
  }
  const settings = loadSettings();

  // ───────────────────────── text to speech ────────────────────────────
  const TTS = {
    voices: [],
    init() {
      if (!('speechSynthesis' in window)) return;
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.onvoiceschanged = load;
    },
    pickVoice() {
      if (!this.voices.length) return null;
      const english = this.voices.filter(v => /^en/i.test(v.lang));
      const pool = english.length ? english : this.voices;
      if (settings.gender === 'auto') return pool[0];
      const femaleHints = /female|zira|samantha|victoria|susan|karen|moira|tessa|fiona|salli|joanna/i;
      const maleHints = /male|david|daniel|alex|fred|george|mark|guy|matthew/i;
      const wanted = settings.gender === 'female' ? femaleHints : maleHints;
      return pool.find(v => wanted.test(v.name)) || pool[0];
    },
    speak(text) {
      if (!text) return;
      if (!('speechSynthesis' in window)) return;
      try {
        speechSynthesis.cancel(); // don't let responses queue up and get stale
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pickVoice();
        if (v) u.voice = v;
        u.rate = settings.rate;
        u.volume = settings.volume;
        u.lang = settings.lang;
        speechSynthesis.speak(u);
      } catch (e) { console.warn('TTS failed', e); }
    }
  };
  TTS.init();

  function say(text) {
    showVoiceCaption(text, 'app');
    TTS.speak(text);
  }

  // ───────────────────────── conversation state ────────────────────────
  // mode: 'idle' | 'awaiting_dismissal_type' | 'awaiting_next_batsman'
  //     | 'awaiting_bowler_name' | 'awaiting_wide_count'
  //     | 'awaiting_noball_runs' | 'awaiting_bye_count'
  //     | 'awaiting_legbye_count' | 'disambiguate_bowler'
  //     | 'disambiguate_batsman'
  let convo = { mode: 'idle', data: {} };
  function resetConvo() { convo = { mode: 'idle', data: {} }; }

  // ───────────────────────── small helpers ──────────────────────────────
  function currentInnings() {
    return matchState ? matchState.innings[matchState.curInn] : null;
  }

  const NUMBER_WORDS = {
    zero: 0, dot: 0, nought: 0, none: 0, no: 0,
    one: 1, single: 1, won: 1,
    two: 2, double: 2, to: 2, too: 2,
    three: 3, triple: 3,
    four: 4, boundary: 4, for: 4,
    five: 5,
    six: 6, maximum: 6, sixes: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
  };
  function wordToNumber(tok) {
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, tok) ? NUMBER_WORDS[tok] : null;
  }
  function extractFirstNumber(transcript) {
    const tokens = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      const n = wordToNumber(t);
      if (n !== null) return n;
    }
    return null;
  }

  // Simple Levenshtein distance for near-miss name matching (mishears etc).
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = a[i - 1] === b[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
      }
    }
    return d[m][n];
  }

  // candidates: [{ name, idx }]. Returns candidates sorted by match score, best first.
  function bestNameMatches(transcript, candidates) {
    const t = ' ' + transcript.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const words = t.trim().split(/\s+/).filter(Boolean);
    const scored = candidates.map(c => {
      const cname = c.name.toLowerCase();
      let score = 0;
      if (t.includes(' ' + cname + ' ')) {
        score = 100; // whole name spoken verbatim
      } else {
        const cwords = cname.split(/\s+/);
        cwords.forEach(cw => {
          words.forEach(w => {
            if (w === cw) score += 20;
            else if (w.length > 2 && cw.length > 2 && levenshtein(w, cw) <= 1) score += 10;
          });
        });
      }
      return { name: c.name, idx: c.idx, score };
    }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
    return scored;
  }

  // ───────────────────────── caption / status UI ────────────────────────
  function showVoiceCaption(text, kind) {
    const bar = document.getElementById('voiceCaption');
    if (!bar) return;
    bar.textContent = text;
    bar.classList.remove('hidden');
    bar.classList.toggle('voice-caption-app', kind === 'app');
    bar.classList.toggle('voice-caption-heard', kind === 'heard');
  }
  function hideVoiceCaption() {
    const bar = document.getElementById('voiceCaption');
    if (bar) bar.classList.add('hidden');
  }

  // ───────────────────────── dismissal vocabulary ───────────────────────
  const DISMISSAL_WORDS = [
    { re: /\brun\s?-?\s?out\b/i,        mode: 'Run Out' },
    { re: /\bl\s?\.?\s?b\s?\.?\s?w\b|\bleg\s?before\b/i, mode: 'LBW' },
    { re: /\bstump(ed)?\b/i,            mode: 'Stumped' },
    { re: /\bhit\s?wicket\b/i,          mode: 'Hit Wicket' },
    { re: /\bcaught\b|\bcatch\b/i,      mode: 'Caught' },
    { re: /\bbowled\b/i,                mode: 'Bowled' },
  ];

  // ═══════════════════════ MATCH / SCORE CONTROLLERS ════════════════════
  function scoreRun(code, label, extraRuns) {
    if (!matchState) { say('Start a match first.'); return; }
    recordBall(code, extraRuns);
    say(label);
  }

  function beginWicket() {
    if (!matchState) { say('Start a match first.'); return; }
    convo = { mode: 'awaiting_dismissal_type', data: {} };
    say('How was he out?');
  }

  function applyDismissal(mode) {
    processBall('W', mode, 'striker');
    if (matchState.phase === 'select_next_batsman') {
      // renderMatch()'s phase-transition hook (promptForNextBatsman) already
      // set convo + spoke the prompt as part of processBall() above — avoid
      // firing TTS twice for the same event.
    } else {
      resetConvo();
      say('Wicket recorded.');
    }
  }

  function beginChangeBowler(inlineName) {
    if (!matchState) { say('Start a match first.'); return; }
    if (matchState.phase !== 'select_bowler') {
      say("Bowler can only change at the end of the over.");
      return;
    }
    if (inlineName) { resolveBowlerByName(inlineName); return; }
    convo = { mode: 'awaiting_bowler_name', data: {} };
    say('Who is the next bowler?');
  }

  function resolveBowlerByName(transcript) {
    const inn = currentInnings();
    if (!inn) return;
    const candidates = inn.bowlers.map((b, i) => ({ name: b.name, idx: i }));
    const matches = bestNameMatches(transcript, candidates);
    if (!matches.length) {
      convo = { mode: 'awaiting_bowler_name', data: {} };
      say("I didn't catch that. Who is the next bowler?");
      return;
    }
    if (matches.length > 1 && matches[0].score === matches[1].score) {
      convo = { mode: 'disambiguate_bowler', data: { options: matches.slice(0, 3) } };
      say('Did you mean ' + matches.slice(0, 2).map(m => m.name).join(' or ') + '?');
      return;
    }
    selectBowler(matches[0].idx);
    confirmBowler();
    resetConvo();
    say('Bowler changed.');
  }

  function beginNextBatsman(inlineName) {
    if (inlineName) { resolveNextBatsmanByName(inlineName); return; }
    convo = { mode: 'awaiting_next_batsman', data: {} };
    say('Who is the next batsman?');
  }

  function resolveNextBatsmanByName(transcript) {
    const inn = currentInnings();
    if (!inn) return;
    const candidates = inn.batsmen
      .map((b, i) => ({ name: b.name, idx: i, status: b.status }))
      .filter(b => b.status === 'yet to bat');
    const matches = bestNameMatches(transcript, candidates);
    if (!matches.length) {
      convo = { mode: 'awaiting_next_batsman', data: {} };
      say("I didn't catch that. Who is the next batsman?");
      return;
    }
    if (matches.length > 1 && matches[0].score === matches[1].score) {
      convo = { mode: 'disambiguate_batsman', data: { options: matches.slice(0, 3) } };
      say('Did you mean ' + matches.slice(0, 2).map(m => m.name).join(' or ') + '?');
      return;
    }
    selectNextBatsman(matches[0].idx);
    confirmNextBatsman();
    resetConvo();
    say(matches[0].name + ' selected.');
  }

  // ═══════════════════════════ CONFIRMATION FLOW ═════════════════════════
  function askConfirm(question, onYes, onNo) {
    convo = { mode: 'awaiting_confirm', data: { onYes, onNo } };
    say(question);
  }

  // ═══════════════════════════ PHASE 5 — EDITING ═════════════════════════
  function correctLastBall(code, extraRuns) {
    if (!matchState || !matchState.undoStack || !matchState.undoStack.length) { say("There's no ball to correct."); return false; }
    undoLastBall();
    recordBall(code, extraRuns);
    return true;
  }

  // ═══════════════════════════ PHASE 7 — ASK ANYTHING ════════════════════
  function getChaseInfo() {
    const m = matchState, inn = currentInnings();
    if (!m || !inn) return null;
    if (m.format !== 'test' && m.curInn === 1 && m.innings[0]) {
      const tgt = m.innings[0].score + 1;
      const rem = tgt - inn.score;
      const ballsLeft = m.overs * 6 - inn.balls;
      return { target: tgt, runsNeeded: Math.max(rem, 0), ballsLeft: Math.max(ballsLeft, 0), rrr: (rem > 0 && ballsLeft > 0) ? rem / (ballsLeft / 6) : 0 };
    }
    if (m.format === 'test' && m.curInn === 3) {
      const target = testTargetForFinalInnings(m);
      if (target !== null) return { target, runsNeeded: Math.max(target - inn.score, 0), ballsLeft: null, rrr: null };
    }
    return null;
  }
  function answerCurrentScore() {
    const inn = currentInnings();
    if (!inn) { say('No match in progress.'); return; }
    say('Score is ' + inn.score + ' for ' + inn.wickets + ' in ' + fmtOvers(inn.balls) + ' overs.');
  }
  function answerCRR() {
    const inn = currentInnings();
    if (!inn) { say('No match in progress.'); return; }
    const overs = inn.balls / 6;
    say('Current run rate is ' + (overs > 0 ? (inn.score / overs).toFixed(2) : '0.00') + '.');
  }
  function answerRRR() {
    const info = getChaseInfo();
    if (!info || !info.rrr) { say("There's no chase in progress right now."); return; }
    say('Required run rate is ' + info.rrr.toFixed(2) + '.');
  }
  function answerTarget() {
    const info = getChaseInfo();
    if (!info) { say('There is no target set yet.'); return; }
    say('Target is ' + info.target + '.');
  }
  function answerRunsNeeded() {
    const info = getChaseInfo();
    if (!info) { say("There's no chase in progress right now."); return; }
    say(info.runsNeeded + (info.runsNeeded === 1 ? ' run needed.' : ' runs needed.'));
  }
  function answerOversLeft() {
    const m = matchState, inn = currentInnings();
    if (!m || !inn) { say('No match in progress.'); return; }
    if (m.format === 'test') { say("There's no over limit in this Test innings."); return; }
    const left = Math.max(m.overs * 6 - inn.balls, 0);
    say(fmtOvers(left) + ' overs left.');
  }
  function answerBallsRemaining() {
    const m = matchState, inn = currentInnings();
    if (!m || !inn) { say('No match in progress.'); return; }
    if (m.format === 'test') { say("There's no ball limit in this Test innings."); return; }
    const left = Math.max(m.overs * 6 - inn.balls, 0);
    say(left + (left === 1 ? ' ball remaining.' : ' balls remaining.'));
  }
  function answerHighestScorer() {
    const inn = currentInnings();
    if (!inn) { say('No match in progress.'); return; }
    const withRuns = inn.batsmen.filter(b => b.balls > 0 || b.runs > 0);
    if (!withRuns.length) { say('Nobody has batted yet.'); return; }
    const top = withRuns.reduce((a, b) => b.runs > a.runs ? b : a);
    say(top.name + ' is the highest scorer with ' + top.runs + ' off ' + top.balls + ' balls.');
  }
  function answerBestBowler() {
    const inn = currentInnings();
    if (!inn) { say('No match in progress.'); return; }
    const withBalls = inn.bowlers.filter(b => b.balls > 0);
    if (!withBalls.length) { say('Nobody has bowled yet.'); return; }
    const top = withBalls.reduce((a, b) => {
      if (b.wickets !== a.wickets) return b.wickets > a.wickets ? b : a;
      const aEcon = a.runs / (a.balls / 6), bEcon = b.runs / (b.balls / 6);
      return bEcon < aEcon ? b : a;
    });
    say(top.name + ' leads with ' + top.wickets + (top.wickets === 1 ? ' wicket' : ' wickets') + ' for ' + top.runs + ' runs.');
  }
  function answerWhoBatting() {
    const inn = currentInnings();
    if (!inn || inn.striker === null) { say('No batsmen at the crease yet.'); return; }
    const striker = inn.batsmen[inn.striker];
    const nonStriker = inn.nonStriker !== null ? inn.batsmen[inn.nonStriker] : null;
    say(striker.name + ' is on strike' + (nonStriker ? ', with ' + nonStriker.name + ' at the other end.' : '.'));
  }
  function answerWhoBowling() {
    const inn = currentInnings();
    if (!inn || inn.currentBowler === null) { say('No bowler is currently set.'); return; }
    say(inn.bowlers[inn.currentBowler].name + ' is bowling.');
  }

  // ═══════════════════════════ PHASE 8 — PLAYER STATS ════════════════════
  function allSquadCandidates() {
    const inn = currentInnings();
    if (!inn) return [];
    const seen = new Set();
    const list = [];
    inn.batsmen.forEach(b => { if (!seen.has(b.name)) { seen.add(b.name); list.push({ name: b.name }); } });
    inn.bowlers.forEach(b => { if (!seen.has(b.name)) { seen.add(b.name); list.push({ name: b.name }); } });
    return list;
  }
  function handleStatQuery(transcript, statKind) {
    const inn = currentInnings();
    if (!inn) { say('No match in progress.'); return; }
    const matches = bestNameMatches(transcript, allSquadCandidates());
    let name = matches.length ? matches[0].name : null;
    let bat = null, bwl = null;
    if (name) {
      bat = inn.batsmen.find(b => b.name === name) || null;
      bwl = inn.bowlers.find(b => b.name === name) || null;
    } else if (['runs', 'sr', 'fours', 'sixes'].includes(statKind) && inn.striker !== null) {
      bat = inn.batsmen[inn.striker]; name = bat.name;
    } else if (['wkts', 'econ'].includes(statKind) && inn.currentBowler !== null) {
      bwl = inn.bowlers[inn.currentBowler]; name = bwl.name;
    }
    if (!name) { say("I couldn't tell who you meant."); return; }
    switch (statKind) {
      case 'runs':
        if (!bat) { say(name + " hasn't batted yet."); return; }
        say(name + ' has scored ' + bat.runs + ' off ' + bat.balls + ' balls.');
        return;
      case 'sr':
        if (!bat || bat.balls === 0) { say(name + ' has no strike rate yet.'); return; }
        say(name + "'s strike rate is " + ((bat.runs / bat.balls) * 100).toFixed(1) + '.');
        return;
      case 'fours':
        if (!bat) { say(name + " hasn't batted yet."); return; }
        say(name + ' has hit ' + bat.fours + (bat.fours === 1 ? ' four.' : ' fours.'));
        return;
      case 'sixes':
        if (!bat) { say(name + " hasn't batted yet."); return; }
        say(name + ' has hit ' + bat.sixes + (bat.sixes === 1 ? ' six.' : ' sixes.'));
        return;
      case 'wkts':
        if (!bwl) { say(name + " hasn't bowled yet."); return; }
        say(name + ' has taken ' + bwl.wickets + (bwl.wickets === 1 ? ' wicket.' : ' wickets.'));
        return;
      case 'econ':
        if (!bwl || bwl.balls === 0) { say(name + ' has no economy rate yet.'); return; }
        say(name + "'s economy is " + (bwl.runs / (bwl.balls / 6)).toFixed(2) + '.');
        return;
    }
  }

  // Phase 2 vocabulary. Order matters — more specific phrases are checked
  // before generic run-value words (e.g. "no ball" before a stray "no").
  // `always: true` marks commands still allowed while the match is paused
  // (queries, stats, and match-control words); everything else that would
  // change the score is blocked with a reminder while paused.
  const IDLE_COMMANDS = [
    // ── Phase 5: corrections (must come before the plain extras/number
    //    words below, since a correction sentence often contains them) ──
    { re: /\blast\s+(ball|delivery)\s+was\s+(?:a\s+|an\s+)?([a-z0-9]+)/i, run: (t, m) => {
        const n = wordToNumber(m[2].toLowerCase());
        if (n === null || n > 6) { say("I didn't catch the correct run value."); return; }
        if (correctLastBall(String(n))) say('Corrected to ' + n + (n === 1 ? ' run.' : ' runs.'));
      } },
    { re: /\bthat\s+was\s+(?:a\s+|an\s+)?(wide|no\s?ball|leg\s?bye|bye)\b/i, run: (t, m) => {
        const kind = m[1].toLowerCase().replace(/\s+/g, '');
        const code = kind === 'wide' ? 'Wd' : kind === 'noball' ? 'Nb' : kind === 'legbye' ? 'LB' : 'Bye';
        if (correctLastBall(code)) say('Corrected to a ' + m[1] + '.');
      } },

    // ── Phase 9: match control ──
    { re: /\bsave\s+match\b/i, always: true, run: () => {
        if (!matchState) { say('No match in progress.'); return; }
        askConfirm('Are you sure you want to save this match?', () => {
          const overlay = document.getElementById('resultOverlay');
          if (overlay && overlay.classList.contains('show')) { saveMatchAndNew(); say('Match saved.'); }
          else say("The match isn't finished yet.");
        });
      } },
    { re: /\b(finish|end)\s+(the\s+)?match\b|\bend\s+innings\b/i, always: true, run: () => {
        if (!matchState) { say('No match in progress.'); return; }
        askConfirm('Are you sure you want to end this innings?', () => { endInnings(); say('Innings ended.'); });
      } },
    { re: /\bpause\s+match\b/i, always: true, run: () => {
        if (!matchState) { say('No match in progress.'); return; }
        matchState.voicePaused = true;
        say('Match paused. Say resume match to continue.');
      } },
    { re: /\bresume\s+match\b/i, always: true, run: () => {
        if (matchState) matchState.voicePaused = false;
        say('Match resumed.');
      } },

    // ── Phase 7: ask anything ──
    { re: /\brequired run rate\b|\brrr\b/i,               always: true, run: () => answerRRR() },
    { re: /\bcurrent run rate\b|\brun rate\b|\bcrr\b/i,   always: true, run: () => answerCRR() },
    { re: /\bovers?\s+(left|remaining)\b/i,               always: true, run: () => answerOversLeft() },
    { re: /\bballs?\s+(left|remaining)\b/i,                always: true, run: () => answerBallsRemaining() },
    { re: /\brun[s]?\s+(needed|required)\b|\bhow many runs\b/i, always: true, run: () => answerRunsNeeded() },
    { re: /\btarget\b/i,                                   always: true, run: () => answerTarget() },
    { re: /\bhighest\s+scorer|\btop\s+scorer\b/i,          always: true, run: () => answerHighestScorer() },
    { re: /\bbest\s+bowler\b/i,                            always: true, run: () => answerBestBowler() },
    { re: /\bwho.?s\s+bowling\b|\bwho\s+is\s+bowling\b|\bcurrent\s+bowler\b/i, always: true, run: () => answerWhoBowling() },
    { re: /\bwho.?s\s+batting\b|\bwho\s+is\s+batting\b|\bon\s+strike\b/i,      always: true, run: () => answerWhoBatting() },

    // ── Phase 8: player stats ──
    { re: /\bstrike\s?rate\b/i,   always: true, run: (t) => handleStatQuery(t, 'sr') },
    { re: /\beconomy\b/i,         always: true, run: (t) => handleStatQuery(t, 'econ') },
    { re: /\bwickets\b/i,         always: true, run: (t) => handleStatQuery(t, 'wkts') },
    { re: /\bfours\b/i,           always: true, run: (t) => handleStatQuery(t, 'fours') },
    { re: /\bsixes\b/i,           always: true, run: (t) => handleStatQuery(t, 'sixes') },
    { re: /\bscore\b/i,           always: true, run: (t) => {
        const named = bestNameMatches(t, allSquadCandidates());
        named.length ? handleStatQuery(t, 'runs') : answerCurrentScore();
      } },

    // ── Phase 2/6: scoring, extras, editing, player selection ──
    { re: /\bwicket\b|\bout\b/i,                          run: () => beginWicket() },
    { re: /\bno\s?ball\b/i,                               run: () => { convo = { mode: 'awaiting_noball_runs', data: {} }; say('Any bat runs?'); } },
    { re: /\bleg\s?byes?\b/i,                             run: () => { convo = { mode: 'awaiting_legbye_count', data: {} }; say('How many leg byes?'); } },
    { re: /\bbyes?\b/i,                                   run: () => { convo = { mode: 'awaiting_bye_count', data: {} }; say('How many byes?'); } },
    { re: /\bwide\b/i,                                    run: () => { convo = { mode: 'awaiting_wide_count', data: {} }; say('How many wides?'); } },
    { re: /\bredo\b/i,                                    always: true, run: () => say(redoLastAction() ? 'Redone.' : "There's nothing to redo.") },
    { re: /\bundo\b/i,                                    always: true, run: () => { undoLastBall(); say('Removed last ball.'); } },
    { re: /\bswap\s?strike\b|\bswitch\s?strike\b/i,       run: () => say(swapStrike() ? 'Strike swapped.' : "There's no partner to swap with.") },
    { re: /\b(change|next|new)\s+bowler\b/i,              run: () => beginChangeBowler() },
    { re: /\bbring\s+(.+)/i,                              run: (t, m) => beginChangeBowler(m[1]) },
    { re: /\b(next|new)\s+batsman\s+(.+)/i,               run: (t, m) => beginNextBatsman(m[2]) },
    { re: /\bsend\s+(.+)/i,                                run: (t, m) => beginNextBatsman(m[1]) },
    { re: /\b(dot(\s?ball)?|\b0\b|zero|no\s?run)\b/i,     run: () => scoreRun('0', 'Dot ball.') },
    { re: /\b(single|one|\b1\b)\b/i,                      run: () => scoreRun('1', 'One run added.') },
    { re: /\b(double|two|\b2\b)\b/i,                      run: () => scoreRun('2', 'Two runs added.') },
    { re: /\b(triple|three|\b3\b)\b/i,                    run: () => scoreRun('3', 'Three runs added.') },
    { re: /\b(four|boundary|\b4\b)\b/i,                   run: () => scoreRun('4', 'Four added.') },
    { re: /\b(five|\b5\b)\b/i,                             run: () => scoreRun('5', 'Five runs added.') },
    { re: /\b(six|maximum|\b6\b)\b/i,                     run: () => scoreRun('6', 'Six added.') },
  ];

  function handleIdleUtterance(transcript) {
    for (const cmd of IDLE_COMMANDS) {
      const m = transcript.match(cmd.re);
      if (m) {
        if (matchState && matchState.voicePaused && !cmd.always) {
          say('Match is paused. Say resume match to continue.');
          return true;
        }
        cmd.run(transcript, m);
        return true;
      }
    }
    return false; // nothing matched — ignored on purpose so continuous listening doesn't misfire on chatter
  }

  // ─────────────────────── conversation continuation ────────────────────
  function handleConversationUtterance(transcript) {
    switch (convo.mode) {
      case 'awaiting_dismissal_type': {
        const hit = DISMISSAL_WORDS.find(d => d.re.test(transcript));
        if (!hit) { say("Sorry, how was he out? Bowled, caught, LBW, run out, stumped, or hit wicket?"); return; }
        applyDismissal(hit.mode);
        return;
      }
      case 'awaiting_next_batsman':
        resolveNextBatsmanByName(transcript);
        return;
      case 'awaiting_bowler_name':
        resolveBowlerByName(transcript);
        return;
      case 'disambiguate_bowler': {
        const matches = bestNameMatches(transcript, convo.data.options);
        if (!matches.length) { say('Sorry, which one — ' + convo.data.options.slice(0, 2).map(o => o.name).join(' or ') + '?'); return; }
        selectBowler(matches[0].idx);
        confirmBowler();
        resetConvo();
        say('Bowler changed.');
        return;
      }
      case 'disambiguate_batsman': {
        const matches = bestNameMatches(transcript, convo.data.options);
        if (!matches.length) { say('Sorry, which one — ' + convo.data.options.slice(0, 2).map(o => o.name).join(' or ') + '?'); return; }
        selectNextBatsman(matches[0].idx);
        confirmNextBatsman();
        resetConvo();
        say(matches[0].name + ' selected.');
        return;
      }
      case 'awaiting_wide_count': {
        const n = extractFirstNumber(transcript);
        if (n === null || n < 1) { say('How many wides — just say a number.'); return; }
        recordBall('Wd', n);
        resetConvo();
        say(n + (n === 1 ? ' wide added.' : ' wides added.'));
        return;
      }
      case 'awaiting_noball_runs': {
        let n = extractFirstNumber(transcript);
        if (n === null) n = /\bno\b|\bnone\b/i.test(transcript) ? 0 : null;
        if (n === null) { say('Any bat runs — say a number, or "none".'); return; }
        recordBall('Nb', n);
        resetConvo();
        say('No ball' + (n > 0 ? ' plus ' + n + (n === 1 ? ' run' : ' runs') : '') + ' recorded.');
        return;
      }
      case 'awaiting_bye_count': {
        const n = extractFirstNumber(transcript);
        if (n === null || n < 1) { say('How many byes — just say a number.'); return; }
        recordBall('Bye', n);
        resetConvo();
        say(n + (n === 1 ? ' bye added.' : ' byes added.'));
        return;
      }
      case 'awaiting_legbye_count': {
        const n = extractFirstNumber(transcript);
        if (n === null || n < 1) { say('How many leg byes — just say a number.'); return; }
        recordBall('LB', n);
        resetConvo();
        say(n + (n === 1 ? ' leg bye added.' : ' leg byes added.'));
        return;
      }
      case 'awaiting_confirm': {
        const { onYes, onNo } = convo.data;
        if (/\b(yes|yeah|yep|yup|confirm|sure|correct)\b/i.test(transcript)) {
          resetConvo();
          if (onYes) onYes();
        } else if (/\b(no|nope|nah|cancel|don't|stop)\b/i.test(transcript)) {
          resetConvo();
          say('Okay, cancelled.');
          if (onNo) onNo();
        } else {
          say('Please say yes or no.');
        }
        return;
      }
      default:
        resetConvo();
        handleIdleUtterance(transcript);
    }
  }

  function handleUtterance(rawTranscript) {
    const transcript = rawTranscript.trim().toLowerCase();
    if (!transcript) return;
    showVoiceCaption('"' + rawTranscript.trim() + '"', 'heard');
    let handled;
    if (convo.mode === 'idle') handled = handleIdleUtterance(transcript);
    else { handleConversationUtterance(transcript); handled = true; }
    if (!handled) {
      // Heard something, understood nothing — surface it so this is
      // distinguishable from the mic not picking anything up at all.
      setTimeout(() => showVoiceCaption('🤔 Didn\'t recognize: "' + rawTranscript.trim() + '"', 'app'), 400);
    }
  }

  // ═══════════════════════════ SPEECH RECOGNITION ════════════════════════
  let recognition = null;
  let active = false;
  let lastTranscript = '';
  let lastTranscriptAt = 0;

  function handleResult(event) {
    const result = event.results[event.results.length - 1];
    if (!result || !result.isFinal) return;
    const alt = result[0];
    const confidence = typeof alt.confidence === 'number' ? alt.confidence : 1;
    const transcript = (alt.transcript || '').trim();
    if (!transcript) return;
    // Noise filtering: drop low-confidence results and immediate exact repeats
    // (a common artifact of the recognizer re-firing on the same audio).
    if (confidence > 0 && confidence < settings.confidence) return;
    const now = Date.now();
    if (transcript.toLowerCase() === lastTranscript && now - lastTranscriptAt < 1200) return;
    lastTranscript = transcript.toLowerCase();
    lastTranscriptAt = now;
    handleUtterance(transcript);
  }

  function buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = settings.lang;
    r.onresult = handleResult;
    r.onerror = (e) => {
      console.warn('voice recognition error', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        showToast('Microphone permission denied or blocked', true);
        showVoiceCaption('🚫 Microphone blocked — check the site permission icon in the address bar.', 'app');
        stop();
      } else if (e.error === 'audio-capture') {
        showToast('No microphone found', true);
        stop();
      } else if (e.error === 'network') {
        showVoiceCaption('⚠️ Network hiccup — reconnecting…', 'app');
        // onend below will auto-restart.
      }
      // 'no-speech' / 'aborted' are transient and expected during continuous
      // listening — onend below handles restarting.
    };
    r.onend = () => {
      if (active) { try { recognition.start(); } catch (e) { console.warn('restart failed', e); } }
    };
    return r;
  }

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Voice scoring is not supported in this browser', true); return; }
    if (!matchState) { showToast('Start a match first', true); return; }

    // Chrome (and most browsers) only remember a microphone grant on a
    // "secure context" — https, or localhost during development. On a plain
    // http:// or file:// origin the permission can't persist, so every
    // restart of continuous recognition re-prompts you. Warn up front
    // instead of leaving you to guess why the prompt keeps reappearing.
    if (window.isSecureContext === false) {
      showToast('This page isn\'t served over HTTPS — the browser can\'t remember mic permission and will re-ask repeatedly. Host it over HTTPS (or localhost) to fix this.', true);
    }

    // Reuse one instance across the whole voice session instead of building
    // a fresh one on every click — fewer moving parts, one permission
    // handshake per session rather than one per restart.
    if (!recognition) recognition = buildRecognition();

    try {
      recognition.start();
      active = true;
      resetConvo();
      updateButton();
      showVoiceCaption('🎙️ Listening…', 'app');
      showToast('🎙️ Voice scoring on — say "four", "wicket", "change bowler"…');
    } catch (e) {
      console.error('could not start voice recognition', e);
      showToast('Could not start voice scoring', true);
    }
  }

  function stop() {
    active = false;
    resetConvo();
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    updateButton();
    hideVoiceCaption();
    showToast('🎙️ Voice scoring off');
  }

  function toggle() { active ? stop() : start(); }

  function updateButton() {
    const btn = document.getElementById('voiceScoringBtn');
    if (!btn) return;
    btn.textContent = active ? '🔴 Voice On' : '🎙️ Voice';
    btn.classList.toggle('btn-danger', active);
    btn.classList.toggle('btn-ghost', !active);
  }

  // ═══════════════════════════ SETTINGS UI GLUE ══════════════════════════
  function openSettings() {
    document.getElementById('voiceRateInput').value = settings.rate;
    document.getElementById('voiceRateLabel').textContent = settings.rate.toFixed(1) + '×';
    document.getElementById('voiceVolumeInput').value = settings.volume;
    document.getElementById('voiceVolumeLabel').textContent = Math.round(settings.volume * 100) + '%';
    document.getElementById('voiceGenderInput').value = settings.gender;
    document.getElementById('voiceConfidenceInput').value = settings.confidence;
    document.getElementById('voiceConfidenceLabel').textContent = Math.round(settings.confidence * 100) + '%';
    document.getElementById('voiceSettingsModal').classList.add('show');
  }
  function closeSettings() {
    document.getElementById('voiceSettingsModal').classList.remove('show');
  }
  function applySettingsFromUI() {
    settings.rate = parseFloat(document.getElementById('voiceRateInput').value) || 1;
    settings.volume = parseFloat(document.getElementById('voiceVolumeInput').value);
    if (isNaN(settings.volume)) settings.volume = 1;
    settings.gender = document.getElementById('voiceGenderInput').value;
    settings.confidence = parseFloat(document.getElementById('voiceConfidenceInput').value) || 0;
    saveSettings();
    TTS.speak('Voice settings updated.');
  }

  function announce(text) {
    // Emoji read poorly (or not at all) by most TTS engines — strip them.
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    TTS.speak(clean);
  }

  function simulate(text) {
    // Runs typed text through the exact same pipeline real speech uses —
    // same conversation state, same command parser, same TTS responses —
    // so it's a faithful test even though no audio was involved.
    if (!text || !text.trim()) return;
    handleUtterance(text);
  }

  // Called by renderMatch() the moment the match phase becomes
  // 'select_bowler' — i.e. right when an over finishes — so the app asks
  // out loud instead of silently waiting for the user to say "change
  // bowler" first. Only speaks while voice scoring is actually on, and
  // puts the conversation straight into 'awaiting_bowler_name' so the
  // very next thing the user says (just the bowler's name, nothing else)
  // is caught correctly.
  function promptForBowler() {
    if (!active) return;
    convo = { mode: 'awaiting_bowler_name', data: {} };
    say('Over complete! Who is bowling next?');
  }

  // Same idea for when a wicket falls and a new batsman is needed.
  function promptForNextBatsman() {
    if (!active) return;
    convo = { mode: 'awaiting_next_batsman', data: {} };
    say('Who is the next batsman?');
  }

  // Called once play resumes (phase back to 'live') so a pending
  // "who's the next bowler/batsman?" conversation doesn't linger if the
  // user answered by tapping the UI instead of speaking.
  function cancelPendingPrompt() {
    if (convo.mode === 'awaiting_bowler_name' || convo.mode === 'disambiguate_bowler' ||
        convo.mode === 'awaiting_next_batsman' || convo.mode === 'disambiguate_batsman') {
      resetConvo();
    }
  }

  return {
    toggle, start, stop,
    get active() { return active; },
    openSettings, closeSettings, applySettingsFromUI, announce, simulate,
    promptForBowler, promptForNextBatsman, cancelPendingPrompt
  };
})();

// Thin wrappers so the existing button/onclick markup keeps working.
function toggleVoiceScoring() { VoiceManager.toggle(); }
function startVoiceScoring() { VoiceManager.start(); }
function stopVoiceScoring() { VoiceManager.stop(); }
function openVoiceSettings() { VoiceManager.openSettings(); }
function closeVoiceSettings() { VoiceManager.closeSettings(); }
function saveVoiceSettings() { VoiceManager.applySettingsFromUI(); VoiceManager.closeSettings(); }
function toggleVoiceTestConsole() {
  const el = document.getElementById('voiceTestConsole');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    document.getElementById('voiceCaption').classList.remove('hidden');
    document.getElementById('voiceTestInput').focus();
  }
}
function runVoiceTest() {
  const input = document.getElementById('voiceTestInput');
  const text = input.value;
  if (!text.trim()) return;
  VoiceManager.simulate(text);
  input.value = '';
  input.focus();
}


// ── Player profile sharing — a public, read-only career page ───────────
// Anyone with the link can view it (no sign-in required to view), similar
// in spirit to a public Google Doc link. Creating a share still requires
// being signed in.
let currentPublicProfileData = null; // set while viewing someone else's shared profile

async function shareProfile(playerName) {
  if (!currentUser) { showToast('Sign in with Google to share a profile', true); return; }
  let p = (careerRosterCache || []).find(x => x.name === playerName);
  let sr50 = null, sr100 = null;
  if (p) {
    const allRec = await loadRecords();
    const rec = allRec[fmtKey(currentStatsFormatTab)];
    sr50 = rec.fastest50.find(r => r.name === playerName) || null;
    sr100 = rec.fastest100.find(r => r.name === playerName) || null;
  } else if (currentPublicProfileData && currentPublicProfileData.profile.name === playerName) {
    p = currentPublicProfileData.profile;
    sr50 = currentPublicProfileData.sr50; sr100 = currentPublicProfileData.sr100;
  }
  if (!p) { showToast("Could not find that player's stats to share", true); return; }

  showToast('Creating share link…');
  try {
    const clone = JSON.parse(JSON.stringify(p));
    let code, attempts = 0;
    do {
      code = genShareCode(); attempts++;
      const ex = await db.collection('shared_profiles').doc(code).get();
      if (!ex.exists) break;
    } while (attempts < 5);
    await db.collection('shared_profiles').doc(code).set({
      profile: clone,
      sr50: sr50 ? JSON.parse(JSON.stringify(sr50)) : null,
      sr100: sr100 ? JSON.parse(JSON.stringify(sr100)) : null,
      sharedByUid: currentUser.uid,
      sharedByName: currentUser.displayName || currentUser.email || 'A friend',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const link = location.origin + location.pathname + '?profile=' + code;
    await recordMyShare('profile', code, playerName);
    presentShareLink(link);
  } catch(e) {
    console.error('profile share failed', e);
    showToast('Could not create the profile link — try again', true);
  }
}

async function openPublicProfile(code) {
  let snap;
  try { snap = await db.collection('shared_profiles').doc(code).get(); }
  catch(e) { console.error('profile fetch failed', e); showToast('Could not load that profile link', true); return; }
  if (!snap.exists) { showToast('That profile link was not found', true); return; }

  const data = snap.data();
  currentPublicProfileData = data;
  const p = data.profile;
  const sr50 = data.sr50, sr100 = data.sr100;
  const initials = p.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = p.role === 'ar' ? 'All-rounder' : p.role === 'bowl' ? 'Bowler' : 'Batter';

  document.getElementById('careerProfileHead').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 16px;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<div class="pm-avatar" style="width:56px;height:56px;font-size:22px">'+initials+'</div>' +
        '<div><div class="pm-name">'+p.name+'</div>' +
        '<div class="pm-team">'+(p.team||'')+' · '+roleLabel+' · shared by '+(data.sharedByName||'a friend')+'</div></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<div style="text-align:center"><div class="rating-chip '+ratingClass(p.rating)+'" style="font-size:20px;padding:6px 14px">'+p.rating+'</div>' +
        '<div style="font-size:9px;color:var(--text-dim);margin-top:2px">OVERALL RATING</div></div>' +
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'careerProfileModal\').classList.remove(\'show\')">✕</button>' +
      '</div>' +
    '</div>';

  const tabs = [['overview','Overview'],['analytics','Performance Analytics'],['career','Career Statistics'],
    ['achievements','Achievements'],['matches','Recent Matches'],['graphs','Graphs']];
  careerProfileCurrentTab = 'overview';
  document.getElementById('careerProfileTabs').innerHTML = tabs.map(([k,l]) =>
    '<button class="cp-tab'+(careerProfileCurrentTab===k?' active':'')+'" data-cptab="'+k+'" onclick="switchCareerProfileTab(\''+k+'\')">'+l+'</button>').join('');

  const panels = {
    overview: buildCPOverview(p, sr50, sr100),
    analytics: buildCPAnalytics(p),
    career: buildCPCareerStats(p),
    achievements: buildCPAchievements(p, sr50, sr100),
    matches: buildCPRecentMatches(p),
    graphs: buildCPGraphs(p)
  };
  document.getElementById('careerProfilePanels').innerHTML = tabs.map(([k]) =>
    '<div class="cp-panel'+(careerProfileCurrentTab===k?' active':'')+'" data-cppanel="'+k+'">'+panels[k]+'</div>').join('');

  document.getElementById('careerProfileModal').classList.add('show');
}




