# Crickscorer

A free live cricket scoring app for matches, tournaments and series — track runs, wickets, overs, stats and records in real time.

This project was reorganized from a single monolithic `index.html` file into a clean, deployment-ready static site. **No behaviour, markup, styling, or logic was changed** — every ID, class, function, storage key and feature works exactly as it did in the original file. Only the code was split into organized files.

## Project structure

```text
crickscorer/
│
├── index.html            Page markup, metadata, SEO tags, stylesheet + script loading
├── README.md
├── .gitignore
│
├── css/
│   ├── variables.css      CSS custom properties, dark/light theme variables
│   ├── base.css           Resets, body defaults
│   ├── layout.css         Header layout, screen show/hide mechanism
│   ├── components.css     Buttons, tabs, milestone banner, toast, "designed by" badge
│   ├── setup.css          New Match Setup screen (teams, players, overs, toss)
│   ├── match.css          Live scoring screen (score header, ball buttons, panels, commentary)
│   ├── history.css        Match History screen + over-by-over history detail
│   ├── stats.css          Stats screen, career dashboard, records panel, player-stats table
│   ├── series.css         Series/tournament mode (lobby, points table, fixtures, final result)
│   ├── modals.css         Result overlay, innings-summary, wicket modal, player modal, career profile modal
│   └── responsive.css     Cross-cutting mobile layout breakpoints
│
└── js/
    ├── config.js          Firebase project configuration
    ├── state.js           Global storage-key constants
    ├── storage.js         Storage adapter (Firestore / window.storage / localStorage tiers) + save/load helpers
    ├── ui.js               Milestone banner, toast notices, right-panel tab switching
    ├── sharing.js          Cross-account match & player-profile sharing (share codes, import/export)
    ├── voice.js            Voice control manager (speech recognition scoring)
    ├── authentication.js  Google Sign-In + cross-device sync
    ├── setup.js            Match setup screen + match initialization
    ├── navigation.js       Screen show/hide navigation
    ├── scoring.js          Match rendering, ball-by-ball processing, wicket modal, keyboard shortcuts
    ├── scorecard.js        Scorecard tables, match highlights, partnerships, over-by-over history
    ├── innings.js          Innings-end flow, player of the match, match result calculation
    ├── records.js          Cross-match records + head-to-head helper
    ├── history.js          Match History screen rendering
    ├── statistics.js       Player stats, Stats screen, Career Stats Dashboard
    ├── series.js           Series/tournament mode
    ├── utils.js            Small shared formatting helpers
    └── app.js              Application entry point / initialization
```

There is no `assets/` folder: the original app has no external image files. The favicon and all icons are inline (an SVG data-URI favicon plus emoji characters used directly in the markup), so nothing needed to be extracted there.

## How the split was done

The original file's JavaScript was already organized into clearly commented sections (e.g. `STATE`, `STORAGE ADAPTER`, `VOICE MANAGER`, `RENDER`, `BALL PROCESSING`, `SERIES MODE`, `INIT`, etc.). Each module above was created by extracting one or more of those original sections **verbatim**, in their original relative order, with nothing rewritten. All scripts are loaded as plain classic `<script>` tags (not ES modules) in the exact dependency order shown in `index.html`, which preserves the same shared global scope the original single `<script>` block had — every function, `const`, and `let` declared in one file is visible to files loaded after it, exactly as before.

Inline `onclick` / `onkeydown` handlers in the HTML were **left exactly as they were** rather than rewritten to `addEventListener`, since classic (non-module) scripts already expose their top-level function declarations globally — so every inline handler continues to resolve correctly with zero markup changes.

## Verification performed

Before delivery this reorganization was tested end-to-end in a headless browser environment (jsdom):

- Every JS file parses with no syntax errors, individually and concatenated in load order.
- CSS selector count and brace count exactly match the original stylesheet (430 top-level selectors, 436 rule blocks — nothing dropped or duplicated).
- JS brace count exactly matches the original script block (1077 opening / 1077 closing braces across both).
- The full page was loaded through a real local static server with the actual `index.html`, `css/*`, and `js/*` files (Firebase/QRCode CDN scripts stubbed out only because this sandbox has no outbound network access to those CDNs) — the app boots with **zero console errors**, the setup screen becomes active, the dark theme applies by default, filling default lineups populates both team lists, the coin toss animates and reports a winner, and starting the match successfully switches to the live scoring screen.

## Problems found in the original file

None. The source file was clean — well-commented, no leftover `console.log`/`debugger`/`TODO` statements, and no dead code was found. This was a pure reorganization; nothing needed to be corrected.

## Notes on local storage

The app stores everything client-side under these `localStorage` keys (unchanged from the original):

- `cricscore_v2_history` — match history
- `cricscore_v2_records` — cross-match records
- `cricscore_v2_known_players` — quick-add player list
- `cricscore_v2_theme` — dark/light theme preference
- `cricscore_v2_live_match` — in-progress match (for refresh recovery)
- `cricscore_v2_series` — active series/tournament state
- `cricscore_fastest_recovered_v1` — one-time internal migration flag

Because these key names were preserved exactly, anyone who already used the original single-file version will **not** lose their saved matches, players, or records when switching to this reorganized version.

## Notes on Firebase / authentication

The app uses Firebase (Auth + Firestore) for optional Google Sign-In and cross-device cloud sync. When signed out, all data lives only in `localStorage` on that device. When signed in with Google, data syncs to Firestore instead, keyed by the signed-in user.

The Firebase config in `js/config.js` is a **public, client-side Firebase configuration** (this is normal and expected for Firebase — it is not a secret credential; access is controlled by Firestore security rules on the backend, not by hiding this object). It was copied over unchanged.

## Running locally

Because the app loads several separate CSS and JS files via relative paths, you should serve it through a simple local static server rather than double-clicking `index.html` directly (some browsers restrict certain features when a page is opened via `file://`).

```bash
cd crickscorer
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploying to Netlify

1. Push this `crickscorer/` folder to a GitHub repository (or drag-and-drop the folder directly in the Netlify dashboard).
2. In Netlify: **Add new site → Import an existing project** (or **Deploy manually** for drag-and-drop).
3. Leave the build command empty and set the publish directory to the repository root (where `index.html` lives).
4. Deploy. No build step is required — this is a static HTML/CSS/JS site.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository, with `index.html` at the repository root (or inside a `/docs` folder, if you configure Pages that way).
2. In the repository settings, go to **Pages** and choose the branch (and folder) to publish from.
3. GitHub will serve the site at `https://<username>.github.io/<repository-name>/`.

## Deploying to Vercel

1. Import the repository in the Vercel dashboard.
2. Framework preset: **Other** (no build step).
3. Leave the build command empty and the output directory as the project root.
4. Deploy.

---

Designed & built by **Vadije Prashvith Nandan Rao**.
