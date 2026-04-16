# Leaderboard and Simple Username Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple remembered usernames, browser-only local stats, and a Supabase Postgres-backed online leaderboard.

**Architecture:** Username identity is intentionally casual: users type a public display name, the browser stores it in a long-lived cookie, and the server treats matching usernames as the same leaderboard player. Local mode records browser-only stats in `localStorage`; online mode sends usernames to the server, and the server records trusted online results to Postgres when games end.

**Tech Stack:** Node.js 18+, Express 4, Socket.io 4, Supabase Postgres via the `postgres` npm package, vanilla browser JavaScript, existing Node `assert` tests.

---

## File Map

| File | Role | Action |
| --- | --- | --- |
| `public/username.js` | Shared username normalization and validation | Create |
| `public/identity.js` | Cookie-backed browser username state | Create |
| `public/local-stats.js` | Browser-only local leaderboard helpers | Create |
| `leaderboard-store.js` | Memory and Postgres leaderboard stores | Create |
| `server.js` | HTTP API, leaderboard store lifecycle, username-aware Socket.io events | Modify |
| `room-state.js` | Store usernames in rooms and return game result metadata | Modify |
| `public/index.html` | Username UI, local player names, local stats, online leaderboard | Modify |
| `public/styles.css` | Username and leaderboard styles | Modify |
| `public/app.js` | Local stats recording and local player name handling | Modify |
| `public/client.js` | Online username enforcement and leaderboard rendering | Modify |
| `app.test.mjs` | Username, local stats, room result, leaderboard store tests | Modify |
| `package.json` | Add `postgres` dependency | Modify |
| `README.md` | Add Supabase setup and leaderboard usage docs | Modify |
| `docs/project-structure.md` | Document new identity, stats, and DB modules | Modify |

---

## Database Setup

Run this SQL in the Supabase SQL editor before deploying with `DATABASE_URL`.

```sql
create table if not exists leaderboard_players (
  username text primary key,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  games_played integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_players_rank_idx
  on leaderboard_players (wins desc, games_played desc, username asc);
```

Use the Supabase direct Postgres connection string as:

```bash
export DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
```

On Render, add the same value as an environment variable named `DATABASE_URL`.

---

## Task 1: Add Username Normalization and Validation

**Files:**

- Create: `public/username.js`
- Modify: `app.test.mjs`

- [ ] **Step 1: Write failing username tests**

Add this import near the top of `app.test.mjs`:

```javascript
import { normalizeUsername, validateUsername } from "./public/username.js";
```

Add these tests before the summary section:

```javascript
// -- Username validation ------------------------------------------------------

test("normalizes usernames for casual identity", () => {
  assert.equal(normalizeUsername("  ben   lee  "), "ben lee");
  assert.equal(normalizeUsername("ALEX_42"), "ALEX_42");
  assert.equal(normalizeUsername("bad<script>"), "badscript");
});

test("validates username length and allowed characters", () => {
  assert.deepEqual(validateUsername("Ben"), {
    valid: true,
    username: "Ben",
    message: "",
  });
  assert.deepEqual(validateUsername("A"), {
    valid: false,
    username: "A",
    message: "Name must be 2-20 characters.",
  });
  assert.deepEqual(validateUsername("a very very very long name"), {
    valid: false,
    username: "a very very very long name",
    message: "Name must be 2-20 characters.",
  });
  assert.deepEqual(validateUsername("???"), {
    valid: false,
    username: "",
    message: "Use letters, numbers, spaces, dashes, or underscores.",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `public/username.js`.

- [ ] **Step 3: Create username module**

Create `public/username.js`:

```javascript
const USERNAME_ALLOWED_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function normalizeUsername(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateUsername(value) {
  const username = normalizeUsername(value);

  if (username.length < 2 || username.length > 20) {
    return {
      valid: false,
      username,
      message: "Name must be 2-20 characters.",
    };
  }

  if (!USERNAME_ALLOWED_PATTERN.test(username)) {
    return {
      valid: false,
      username,
      message: "Use letters, numbers, spaces, dashes, or underscores.",
    };
  }

  return {
    valid: true,
    username,
    message: "",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests pass, with 2 new username tests.

- [ ] **Step 5: Commit**

```bash
git add app.test.mjs public/username.js
git commit -m "feat: add username validation"
```

---

## Task 2: Add Cookie-Backed Browser Identity UI

**Files:**

- Create: `public/identity.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/client.js`

- [ ] **Step 1: Add identity UI to HTML**

In `public/index.html`, insert this section after the intro section and before `.mode-toggle`:

```html
<section class="identity-panel" aria-labelledby="identity-heading">
  <div>
    <h2 id="identity-heading">Player name</h2>
    <p class="identity-copy">Your name is remembered on this computer.</p>
  </div>
  <form class="identity-form" id="identity-form">
    <label for="username-input">
      Name
      <input
        id="username-input"
        name="username"
        type="text"
        maxlength="20"
        autocomplete="nickname"
        placeholder="Enter your name"
      />
    </label>
    <button type="submit">Use name</button>
  </form>
  <p class="identity-current" id="identity-current" role="status"></p>
</section>
```

- [ ] **Step 2: Create browser identity module**

Create `public/identity.js`:

```javascript
import { validateUsername } from "./username.js";

const COOKIE_NAME = "ttt_username";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

let currentUsername = readUsernameCookie();

export function getCurrentUsername() {
  return currentUsername;
}

export function initIdentity() {
  const form = document.querySelector("#identity-form");
  const input = document.querySelector("#username-input");
  const current = document.querySelector("#identity-current");

  if (!form || !input || !current) {
    return;
  }

  input.value = currentUsername;
  renderIdentity(current, "");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = validateUsername(input.value);

    if (!result.valid) {
      renderIdentity(current, result.message);
      return;
    }

    currentUsername = result.username;
    writeUsernameCookie(currentUsername);
    input.value = currentUsername;
    renderIdentity(current, "");
    window.dispatchEvent(
      new CustomEvent("ttt:username-change", {
        detail: { username: currentUsername },
      }),
    );
  });
}

function renderIdentity(element, errorMessage) {
  if (errorMessage) {
    element.textContent = errorMessage;
    element.dataset.type = "error";
    return;
  }

  element.textContent = currentUsername
    ? `Playing as ${currentUsername}`
    : "Enter a name before playing online.";
  element.dataset.type = currentUsername ? "ready" : "waiting";
}

function readUsernameCookie() {
  const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) {
    return "";
  }

  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const result = validateUsername(value);
  return result.valid ? result.username : "";
}

function writeUsernameCookie(username) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    username,
  )}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
```

- [ ] **Step 3: Initialize identity in `public/client.js`**

Add this import to the top of `public/client.js`:

```javascript
import { getCurrentUsername, initIdentity } from "./identity.js";
```

Call this immediately after element constants:

```javascript
initIdentity();
```

- [ ] **Step 4: Require username for online room actions**

In `public/client.js`, update the create-room submit handler before emitting:

```javascript
const username = getCurrentUsername();
if (!username) {
  setLobbyStatus("Enter a name before creating a room.", "error");
  return;
}
socket.emit("create-room", { size, winLength, username });
```

Update the join-room submit handler before emitting:

```javascript
const username = getCurrentUsername();
if (!username) {
  setLobbyStatus("Enter a name before joining a room.", "error");
  return;
}
socket.emit("join-room", { code, username });
```

- [ ] **Step 5: Add identity styles**

Append to `public/styles.css`:

```css
.identity-panel {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 18px;
  padding: 16px 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.identity-panel h2 {
  font-size: 1rem;
  font-weight: 800;
}

.identity-copy,
.identity-current {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.9rem;
}

.identity-current[data-type="ready"] {
  color: var(--accent);
  font-weight: 700;
}

.identity-current[data-type="error"] {
  color: var(--x-color);
  font-weight: 700;
}

.identity-form {
  display: flex;
  gap: 8px;
  align-items: end;
}

.identity-form input {
  width: 180px;
  padding: 10px 12px;
  background: var(--bg);
  color: var(--text);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
}

.identity-form input:focus {
  border-color: var(--accent);
  outline: none;
}

@media (max-width: 600px) {
  .identity-panel {
    grid-template-columns: 1fr;
  }

  .identity-form {
    display: grid;
    grid-template-columns: 1fr;
  }

  .identity-form input {
    width: 100%;
  }
}
```

- [ ] **Step 6: Run syntax and tests**

```bash
node --check public/identity.js
node --check public/client.js
npm test
```

Expected: syntax checks pass and tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/styles.css public/client.js public/identity.js
git commit -m "feat: add remembered username UI"
```

---

## Task 3: Add Browser-Only Local Stats

**Files:**

- Create: `public/local-stats.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `app.test.mjs`

- [ ] **Step 1: Write failing local stats tests**

Add this import to `app.test.mjs`:

```javascript
import {
  createEmptyLocalStats,
  recordLocalDraw,
  recordLocalWin,
} from "./public/local-stats.js";
```

Add these tests before the summary:

```javascript
// -- Local stats --------------------------------------------------------------

test("records local wins and losses by username", () => {
  const stats = createEmptyLocalStats();
  recordLocalWin(stats, "Ben", "Guest");

  assert.deepEqual(stats.players.Ben, {
    wins: 1,
    losses: 0,
    draws: 0,
  });
  assert.deepEqual(stats.players.Guest, {
    wins: 0,
    losses: 1,
    draws: 0,
  });
});

test("records local draws for both players", () => {
  const stats = createEmptyLocalStats();
  recordLocalDraw(stats, "Ben", "Alex");

  assert.deepEqual(stats.players.Ben, {
    wins: 0,
    losses: 0,
    draws: 1,
  });
  assert.deepEqual(stats.players.Alex, {
    wins: 0,
    losses: 0,
    draws: 1,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `public/local-stats.js`.

- [ ] **Step 3: Create local stats module**

Create `public/local-stats.js`:

```javascript
import { normalizeUsername } from "./username.js";

export const LOCAL_STATS_KEY = "ttt_local_stats_v1";

export function createEmptyLocalStats() {
  return { players: {} };
}

export function readLocalStats(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_STATS_KEY) || "");
    if (parsed && typeof parsed === "object" && parsed.players) {
      return parsed;
    }
  } catch {
    return createEmptyLocalStats();
  }

  return createEmptyLocalStats();
}

export function writeLocalStats(stats, storage = window.localStorage) {
  storage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
}

export function recordLocalWin(stats, winnerName, loserName) {
  const winner = ensurePlayer(stats, winnerName || "Player X");
  const loser = ensurePlayer(stats, loserName || "Player O");

  winner.wins += 1;
  loser.losses += 1;
  return stats;
}

export function recordLocalDraw(stats, playerXName, playerOName) {
  ensurePlayer(stats, playerXName || "Player X").draws += 1;
  ensurePlayer(stats, playerOName || "Player O").draws += 1;
  return stats;
}

export function getLocalRows(stats) {
  return Object.entries(stats.players)
    .map(([username, row]) => ({ username, ...row }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.draws !== a.draws) return b.draws - a.draws;
      return a.username.localeCompare(b.username);
    });
}

function ensurePlayer(stats, name) {
  const username = normalizeUsername(name) || "Guest";
  if (!stats.players[username]) {
    stats.players[username] = {
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  return stats.players[username];
}
```

- [ ] **Step 4: Add local player name UI**

In `public/index.html`, inside `#local-mode`, place this before the settings form:

```html
<div class="local-name-row" aria-label="Local player names">
  <label for="local-player-x-name">
    Player X name
    <input
      id="local-player-x-name"
      type="text"
      maxlength="20"
      placeholder="Player X"
      autocomplete="off"
    />
  </label>
  <label for="local-player-o-name">
    Player O name
    <input
      id="local-player-o-name"
      type="text"
      maxlength="20"
      placeholder="Player O"
      autocomplete="off"
    />
  </label>
</div>
```

Place this after the local board section:

```html
<section class="leaderboard-section" aria-labelledby="local-stats-heading">
  <h2 id="local-stats-heading">This Browser Stats</h2>
  <div class="leaderboard-list" id="local-stats-list"></div>
</section>
```

- [ ] **Step 5: Integrate stats into local game**

Add imports at the top of `public/app.js`:

```javascript
import { getCurrentUsername } from "./identity.js";
import {
  getLocalRows,
  readLocalStats,
  recordLocalDraw,
  recordLocalWin,
  writeLocalStats,
} from "./local-stats.js";
import { normalizeUsername } from "./username.js";
```

Add these entries to the `elements` object:

```javascript
localPlayerXName: document.querySelector("#local-player-x-name"),
localPlayerOName: document.querySelector("#local-player-o-name"),
localStatsList: document.querySelector("#local-stats-list"),
```

Add these helpers near `updateScoreDisplay()`:

```javascript
function getLocalPlayerNames() {
  return {
    X: normalizeUsername(elements.localPlayerXName.value) || "Player X",
    O: normalizeUsername(elements.localPlayerOName.value) || "Player O",
  };
}

function recordLocalResult(type, winnerMark = "") {
  const stats = readLocalStats();
  const names = getLocalPlayerNames();

  if (type === "draw") {
    recordLocalDraw(stats, names.X, names.O);
  } else {
    const loserMark = winnerMark === "X" ? "O" : "X";
    recordLocalWin(stats, names[winnerMark], names[loserMark]);
  }

  writeLocalStats(stats);
  renderLocalStats();
}

function renderLocalStats() {
  if (!elements || !elements.localStatsList) return;

  const rows = getLocalRows(readLocalStats()).slice(0, 10);
  if (rows.length === 0) {
    elements.localStatsList.innerHTML = `<p class="leaderboard-empty">No local games yet.</p>`;
    return;
  }

  elements.localStatsList.innerHTML = rows
    .map(
      (row, index) => `
        <div class="leaderboard-row">
          <span>${index + 1}. ${row.username}</span>
          <span>${row.wins}W ${row.losses}L ${row.draws}D</span>
        </div>
      `,
    )
    .join("");
}
```

In the winning branch of `handleCellClick`, after score update, add:

```javascript
recordLocalResult("win", game.currentPlayer);
```

In the draw branch of `handleCellClick`, before `return true`, add:

```javascript
recordLocalResult("draw");
```

Inside `if (elements) { ... }`, before `startGame(...)`, add:

```javascript
elements.localPlayerXName.value = getCurrentUsername();
window.addEventListener("ttt:username-change", (event) => {
  if (!elements.localPlayerXName.value) {
    elements.localPlayerXName.value = event.detail.username;
  }
});
renderLocalStats();
```

- [ ] **Step 6: Add local stats styles**

Append to `public/styles.css`:

```css
.local-name-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.local-name-row input {
  padding: 10px 12px;
  background: var(--bg);
  color: var(--text);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
}

.leaderboard-section {
  margin-top: 20px;
  padding: 16px 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.leaderboard-section h2 {
  margin-bottom: 12px;
  font-size: 1rem;
  font-weight: 800;
}

.leaderboard-list {
  display: grid;
  gap: 8px;
}

.leaderboard-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.95rem;
}

.leaderboard-row:last-child {
  border-bottom: none;
}

.leaderboard-empty {
  color: var(--muted);
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .local-name-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run checks**

```bash
node --check public/local-stats.js
node --check public/app.js
npm test
```

Expected: syntax checks pass and tests pass.

- [ ] **Step 8: Commit**

```bash
git add app.test.mjs public/index.html public/styles.css public/app.js public/local-stats.js
git commit -m "feat: add browser local stats"
```

---

## Task 4: Add Leaderboard Store With Memory and Supabase Postgres Backends

**Files:**

- Create: `leaderboard-store.js`
- Modify: `app.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Postgres client**

```bash
npm install postgres
```

Expected: `package.json` includes `"postgres"` in dependencies.

- [ ] **Step 2: Write failing leaderboard store tests**

Add this import to `app.test.mjs`:

```javascript
import { createMemoryLeaderboardStore } from "./leaderboard-store.js";
```

Add these tests before the summary:

```javascript
// -- Online leaderboard store -------------------------------------------------

test("records online wins, losses, and draws", async () => {
  const store = createMemoryLeaderboardStore();

  await store.recordGameResult({
    type: "win",
    winnerUsername: "Ben",
    loserUsername: "Alex",
    players: [
      { username: "Ben", mark: "X" },
      { username: "Alex", mark: "O" },
    ],
  });

  await store.recordGameResult({
    type: "draw",
    players: [
      { username: "Ben", mark: "X" },
      { username: "Alex", mark: "O" },
    ],
  });

  assert.deepEqual(await store.getPlayer("Ben"), {
    username: "Ben",
    wins: 1,
    losses: 0,
    draws: 1,
    gamesPlayed: 2,
    winRate: 0.5,
  });
  assert.deepEqual(await store.getPlayer("Alex"), {
    username: "Alex",
    wins: 0,
    losses: 1,
    draws: 1,
    gamesPlayed: 2,
    winRate: 0,
  });
});

test("sorts leaderboard by wins, win rate, games played, then username", async () => {
  const store = createMemoryLeaderboardStore();

  await store.recordGameResult({
    type: "win",
    winnerUsername: "Cara",
    loserUsername: "Ben",
    players: [
      { username: "Cara", mark: "X" },
      { username: "Ben", mark: "O" },
    ],
  });
  await store.recordGameResult({
    type: "win",
    winnerUsername: "Alex",
    loserUsername: "Ben",
    players: [
      { username: "Alex", mark: "X" },
      { username: "Ben", mark: "O" },
    ],
  });

  assert.deepEqual(
    (await store.getLeaderboard({ limit: 3 })).map((row) => row.username),
    ["Alex", "Cara", "Ben"],
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `leaderboard-store.js`.

- [ ] **Step 4: Create leaderboard store**

Create `leaderboard-store.js`:

```javascript
import postgres from "postgres";

function createEmptyPlayer(username) {
  return {
    username,
    wins: 0,
    losses: 0,
    draws: 0,
    gamesPlayed: 0,
    winRate: 0,
  };
}

function withWinRate(player) {
  const gamesPlayed = player.gamesPlayed;
  return {
    ...player,
    winRate: gamesPlayed === 0 ? 0 : player.wins / gamesPlayed,
  };
}

export function createMemoryLeaderboardStore() {
  const players = new Map();

  function ensurePlayer(username) {
    if (!players.has(username)) {
      players.set(username, createEmptyPlayer(username));
    }
    return players.get(username);
  }

  async function recordGameResult(result) {
    if (result.type === "draw") {
      for (const player of result.players) {
        const row = ensurePlayer(player.username);
        row.draws += 1;
        row.gamesPlayed += 1;
      }
      return;
    }

    const winner = ensurePlayer(result.winnerUsername);
    const loser = ensurePlayer(result.loserUsername);
    winner.wins += 1;
    winner.gamesPlayed += 1;
    loser.losses += 1;
    loser.gamesPlayed += 1;
  }

  async function getPlayer(username) {
    return withWinRate(ensurePlayer(username));
  }

  async function getLeaderboard({ limit = 10 } = {}) {
    return [...players.values()]
      .map(withWinRate)
      .sort(comparePlayers)
      .slice(0, limit);
  }

  async function ensureSchema() {}
  async function close() {}

  return {
    ensureSchema,
    recordGameResult,
    getPlayer,
    getLeaderboard,
    close,
  };
}

export function createPostgresLeaderboardStore({ databaseUrl }) {
  const sql = postgres(databaseUrl, { ssl: "require" });

  async function ensureSchema() {
    await sql`
      create table if not exists leaderboard_players (
        username text primary key,
        wins integer not null default 0,
        losses integer not null default 0,
        draws integer not null default 0,
        games_played integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists leaderboard_players_rank_idx
        on leaderboard_players (wins desc, games_played desc, username asc)
    `;
  }

  async function recordGameResult(result) {
    if (result.type === "draw") {
      for (const player of result.players) {
        await incrementPlayer(player.username, { wins: 0, losses: 0, draws: 1 });
      }
      return;
    }

    await incrementPlayer(result.winnerUsername, {
      wins: 1,
      losses: 0,
      draws: 0,
    });
    await incrementPlayer(result.loserUsername, {
      wins: 0,
      losses: 1,
      draws: 0,
    });
  }

  async function incrementPlayer(username, { wins, losses, draws }) {
    await sql`
      insert into leaderboard_players (username, wins, losses, draws, games_played)
      values (${username}, ${wins}, ${losses}, ${draws}, 1)
      on conflict (username) do update set
        wins = leaderboard_players.wins + ${wins},
        losses = leaderboard_players.losses + ${losses},
        draws = leaderboard_players.draws + ${draws},
        games_played = leaderboard_players.games_played + 1,
        updated_at = now()
    `;
  }

  async function getPlayer(username) {
    const rows = await sql`
      select
        username,
        wins,
        losses,
        draws,
        games_played as "gamesPlayed",
        case
          when games_played = 0 then 0
          else wins::float / games_played
        end as "winRate"
      from leaderboard_players
      where username = ${username}
    `;

    return rows[0] || withWinRate(createEmptyPlayer(username));
  }

  async function getLeaderboard({ limit = 10 } = {}) {
    return await sql`
      select
        username,
        wins,
        losses,
        draws,
        games_played as "gamesPlayed",
        case
          when games_played = 0 then 0
          else wins::float / games_played
        end as "winRate"
      from leaderboard_players
      order by wins desc, "winRate" desc, games_played desc, username asc
      limit ${limit}
    `;
  }

  async function close() {
    await sql.end();
  }

  return {
    ensureSchema,
    recordGameResult,
    getPlayer,
    getLeaderboard,
    close,
  };
}

export function createLeaderboardStore({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl) {
    return createPostgresLeaderboardStore({ databaseUrl });
  }

  console.warn("DATABASE_URL is not set. Using in-memory leaderboard store.");
  return createMemoryLeaderboardStore();
}

function comparePlayers(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  return a.username.localeCompare(b.username);
}
```

- [ ] **Step 5: Run tests**

```bash
node --check leaderboard-store.js
npm test
```

Expected: syntax check passes and tests pass.

- [ ] **Step 6: Commit**

```bash
git add app.test.mjs leaderboard-store.js package.json package-lock.json
git commit -m "feat: add leaderboard store"
```

---

## Task 5: Make Online Rooms Username-Aware and Return Game Results

**Files:**

- Modify: `room-state.js`
- Modify: `app.test.mjs`

- [ ] **Step 1: Update existing room tests to include usernames**

In current `createRoom` calls in `app.test.mjs`, pass `username`.

Example:

```javascript
const created = rooms.createRoom({
  socketId: "socket-a",
  username: "Ben",
  size: 3,
  winLength: 3,
});
```

In current `joinRoom` calls:

```javascript
const joined = rooms.joinRoom({
  socketId: "socket-b",
  username: "Alex",
  code: "abc123",
});
```

Update expected players:

```javascript
assert.deepEqual(joined.players, [
  { socketId: "socket-a", username: "Ben", player: "X", mark: "X" },
  { socketId: "socket-b", username: "Alex", player: "O", mark: "O" },
]);
```

- [ ] **Step 2: Add result metadata test**

Add this test:

```javascript
test("returns online result metadata when a game ends", () => {
  const rooms = createRoomStore({ generateCode: () => "WIN002" });
  rooms.createRoom({
    socketId: "x-player",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  rooms.joinRoom({
    socketId: "o-player",
    username: "Alex",
    code: "WIN002",
  });

  rooms.makeMove({ socketId: "x-player", row: 0, col: 0 });
  rooms.makeMove({ socketId: "o-player", row: 1, col: 0 });
  rooms.makeMove({ socketId: "x-player", row: 0, col: 1 });
  rooms.makeMove({ socketId: "o-player", row: 1, col: 1 });
  const winningMove = rooms.makeMove({ socketId: "x-player", row: 0, col: 2 });

  assert.deepEqual(winningMove.gameResult, {
    type: "win",
    winnerUsername: "Ben",
    loserUsername: "Alex",
    players: [
      { username: "Ben", mark: "X" },
      { username: "Alex", mark: "O" },
    ],
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: room tests fail because `room-state.js` does not accept or return usernames yet.

- [ ] **Step 4: Modify `room-state.js` imports**

Add:

```javascript
import { validateUsername } from "./public/username.js";
```

- [ ] **Step 5: Store username objects in rooms**

Change player storage from socket id strings to player objects:

```javascript
players: [
  {
    socketId,
    username: usernameValidation.username,
    mark: "X",
  },
],
```

In `createRoom`, validate username before creating the room:

```javascript
const usernameValidation = validateUsername(username);
if (!usernameValidation.valid) {
  return { ok: false, message: usernameValidation.message };
}
```

In `joinRoom`, validate username before joining:

```javascript
const usernameValidation = validateUsername(username);
if (!usernameValidation.valid) {
  return { ok: false, message: usernameValidation.message };
}
```

Update player helpers:

```javascript
function playerForIndex(index) {
  return index === 0 ? "X" : "O";
}

function playerToAssignment(player, index) {
  const mark = playerForIndex(index);
  return {
    socketId: player.socketId,
    username: player.username,
    player: mark,
    mark,
  };
}
```

Use `room.players.map(playerToAssignment)` when returning `players`.

- [ ] **Step 6: Update move lookup**

In `makeMove`, replace socket id lookup with object lookup:

```javascript
const playerIndex = room.players.findIndex((player) => player.socketId === socketId);
const roomPlayer = room.players[playerIndex];
const playerMark = roomPlayer?.mark || playerForIndex(playerIndex);
```

Update disconnect filtering:

```javascript
const opponentSocketIds = room.players
  .filter((player) => player.socketId !== socketId)
  .map((player) => player.socketId);
for (const player of room.players) {
  socketRooms.delete(player.socketId);
}
```

- [ ] **Step 7: Add result metadata helper**

Add:

```javascript
function buildGameResult(room) {
  const players = room.players.map((player) => ({
    username: player.username,
    mark: player.mark,
  }));

  if (room.winner === "draw") {
    return {
      type: "draw",
      players,
    };
  }

  const winner = room.players.find((player) => player.mark === room.winner);
  const loser = room.players.find((player) => player.mark !== room.winner);

  return {
    type: "win",
    winnerUsername: winner.username,
    loserUsername: loser.username,
    players,
  };
}
```

In `makeMove`, return `gameResult`:

```javascript
return {
  ok: true,
  code: room.code,
  update: buildUpdate(room),
  gameResult: room.winner ? buildGameResult(room) : null,
};
```

- [ ] **Step 8: Run tests**

```bash
node --check room-state.js
npm test
```

Expected: syntax check passes and tests pass.

- [ ] **Step 9: Commit**

```bash
git add app.test.mjs room-state.js
git commit -m "feat: attach usernames to online rooms"
```

---

## Task 6: Record Online Results and Expose Leaderboard API

**Files:**

- Modify: `server.js`
- Modify: `app.test.mjs`

- [ ] **Step 1: Import and create leaderboard store**

In `server.js`, add:

```javascript
import { createLeaderboardStore } from "./leaderboard-store.js";
```

After `const rooms = createRoomStore();`, add:

```javascript
const leaderboard = createLeaderboardStore();
await leaderboard.ensureSchema();
```

- [ ] **Step 2: Add API endpoints**

In `server.js`, before `app.use(express.static(...))`, add:

```javascript
app.get("/api/leaderboard", async (req, res) => {
  const players = await leaderboard.getLeaderboard({ limit: 10 });
  res.json({ players });
});

app.get("/api/leaderboard/:username", async (req, res) => {
  const player = await leaderboard.getPlayer(req.params.username);
  res.json({ player });
});
```

- [ ] **Step 3: Pass usernames to room store**

Update Socket.io create room:

```javascript
socket.on("create-room", ({ size, winLength, username } = {}) => {
  const result = rooms.createRoom({
    socketId: socket.id,
    username,
    size,
    winLength,
  });
```

Update join room:

```javascript
socket.on("join-room", ({ code, username } = {}) => {
  const result = rooms.joinRoom({ socketId: socket.id, username, code });
```

- [ ] **Step 4: Include opponent names in game-start**

When emitting `game-start`, include `players`:

```javascript
io.to(assignment.socketId).emit("game-start", {
  player: assignment.player,
  size: result.room.size,
  winLength: result.room.winLength,
  board: result.room.board,
  players: result.players.map(({ username, mark }) => ({ username, mark })),
});
```

- [ ] **Step 5: Record leaderboard result after valid ending move**

Change make-move handler to async:

```javascript
socket.on("make-move", async ({ row, col } = {}) => {
  const result = rooms.makeMove({ socketId: socket.id, row, col });
  if (!result.ok) {
    return;
  }

  if (result.gameResult) {
    try {
      await leaderboard.recordGameResult(result.gameResult);
    } catch (error) {
      console.error("Failed to record leaderboard result:", error);
    }
  }

  io.to(result.code).emit("game-update", result.update);
});
```

- [ ] **Step 6: Run checks**

```bash
node --check server.js
npm test
```

Expected: syntax check passes and tests pass.

- [ ] **Step 7: Start server and verify API**

Without Supabase:

```bash
npm start
```

In another terminal:

```bash
curl -s http://localhost:3000/api/leaderboard
```

Expected:

```json
{"players":[]}
```

Stop server with `Ctrl+C`.

- [ ] **Step 8: Commit**

```bash
git add server.js app.test.mjs
git commit -m "feat: record online leaderboard results"
```

---

## Task 7: Render Online Leaderboard in Browser

**Files:**

- Modify: `public/index.html`
- Modify: `public/client.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add online leaderboard HTML**

In `public/index.html`, inside `#online-mode`, after `#online-game`, add:

```html
<section class="leaderboard-section" aria-labelledby="online-leaderboard-heading">
  <h2 id="online-leaderboard-heading">Online Leaderboard</h2>
  <div class="leaderboard-list" id="online-leaderboard-list"></div>
  <button class="secondary-btn" id="btn-refresh-leaderboard" type="button">
    Refresh leaderboard
  </button>
</section>
```

- [ ] **Step 2: Add client element references**

In `public/client.js`, add:

```javascript
const elOnlineLeaderboard = document.querySelector("#online-leaderboard-list");
const elRefreshLeaderboard = document.querySelector("#btn-refresh-leaderboard");
```

- [ ] **Step 3: Fetch and render leaderboard**

Add:

```javascript
elRefreshLeaderboard.addEventListener("click", () => {
  loadOnlineLeaderboard();
});

window.addEventListener("ttt:username-change", () => {
  loadOnlineLeaderboard();
});

async function loadOnlineLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard");
    const data = await response.json();
    renderOnlineLeaderboard(data.players || []);
  } catch {
    elOnlineLeaderboard.innerHTML = `<p class="leaderboard-empty">Leaderboard unavailable.</p>`;
  }
}

function renderOnlineLeaderboard(players) {
  if (players.length === 0) {
    elOnlineLeaderboard.innerHTML = `<p class="leaderboard-empty">No online games yet.</p>`;
    return;
  }

  elOnlineLeaderboard.innerHTML = players
    .map(
      (player, index) => `
        <div class="leaderboard-row">
          <span>${index + 1}. ${player.username}</span>
          <span>${player.wins}W ${player.losses}L ${player.draws}D</span>
        </div>
      `,
    )
    .join("");
}
```

Call `loadOnlineLeaderboard();` once after `initIdentity();`.

Call it again after a game ends:

```javascript
if (update.winner) {
  loadOnlineLeaderboard();
}
```

- [ ] **Step 4: Add secondary button styles**

Append:

```css
.secondary-btn {
  margin-top: 12px;
  padding: 8px 14px;
  background: transparent;
  color: var(--muted);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.secondary-btn:hover,
.secondary-btn:focus-visible {
  color: var(--text);
  border-color: var(--accent);
  outline: none;
}
```

- [ ] **Step 5: Run checks**

```bash
node --check public/client.js
npm test
```

Expected: syntax check passes and tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/client.js public/styles.css
git commit -m "feat: show online leaderboard"
```

---

## Task 8: Manual Supabase and Browser Verification

**Files:**

- No code changes.

- [ ] **Step 1: Create Supabase project**

In Supabase:

1. Create a project.
2. Open SQL Editor.
3. Run the SQL from the Database Setup section.
4. Copy the Postgres connection string.

- [ ] **Step 2: Run locally against Supabase**

```bash
export DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
npm start
```

- [ ] **Step 3: Verify online leaderboard flow**

1. Open `http://localhost:3000` in two tabs.
2. Enter username `Ben` in Tab 1.
3. Enter username `Alex` in Tab 2.
4. Tab 1 creates online room.
5. Tab 2 joins with code.
6. Finish a game where Ben wins.
7. Verify Online Leaderboard shows Ben with `1W 0L 0D` and Alex with `0W 1L 0D`.
8. Refresh both tabs.
9. Verify username is remembered.

- [ ] **Step 4: Verify local stats flow**

1. Open Local mode.
2. Confirm Player X defaults to remembered username.
3. Set Player O to `Guest`.
4. Finish a local game.
5. Verify This Browser Stats updates.
6. Restart server.
7. Verify local stats remain in the same browser.

- [ ] **Step 5: Verify Supabase persistence**

1. Stop server.
2. Start server again with same `DATABASE_URL`.
3. Open `/api/leaderboard`.
4. Verify previous online results still exist.

---

## Task 9: Update Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/project-structure.md`

- [ ] **Step 1: Update README**

Add sections for:

```markdown
## Username Login

The app uses a simple public username. There is no password. The browser stores the username in a long-lived cookie named `ttt_username`.

## Leaderboards

- Local stats are stored in this browser only.
- Online leaderboard results are stored by the server in Postgres.
- Same username means same online leaderboard player.

## Supabase Setup

1. Create a Supabase project.
2. Run the `leaderboard_players` table SQL from `docs/superpowers/plans/2026-04-15-leaderboard.md`.
3. Copy the Postgres connection string.
4. Set `DATABASE_URL` locally or in Render.
```

- [ ] **Step 2: Update project structure docs**

Add entries for:

```markdown
### `public/username.js`

Shared username normalization and validation used by browser and server tests.

### `public/identity.js`

Cookie-backed browser identity state.

### `public/local-stats.js`

Browser-only local leaderboard storage helpers.

### `leaderboard-store.js`

Online leaderboard persistence. Uses Supabase Postgres when `DATABASE_URL` is set and in-memory storage otherwise.
```

- [ ] **Step 3: Run docs check and tests**

```bash
rg "DATABASE_URL|ttt_username|leaderboard_players" README.md docs/project-structure.md docs/superpowers/plans/2026-04-15-leaderboard.md
npm test
```

Expected: `rg` finds all terms and tests pass.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/project-structure.md
git commit -m "docs: document leaderboard setup"
```

---

## Final Verification Checklist

- [ ] `npm test` passes.
- [ ] `node --check server.js` passes.
- [ ] `node --check room-state.js` passes.
- [ ] `node --check leaderboard-store.js` passes.
- [ ] `node --check public/client.js` passes.
- [ ] `node --check public/app.js` passes.
- [ ] `node --check public/identity.js` passes.
- [ ] `node --check public/local-stats.js` passes.
- [ ] Browser remembers username after refresh.
- [ ] Online mode rejects create/join when no username is set.
- [ ] Online game records winner and loser in Supabase.
- [ ] Online draw records both players' draws.
- [ ] Local game updates This Browser Stats only.
- [ ] `/api/leaderboard` returns JSON with players sorted by rank.
- [ ] Render has `DATABASE_URL` set before production deploy.

---

## Known Constraints

- Username login is not secure authentication.
- Anyone can type the same username and contribute to that leaderboard row.
- Local stats are browser-controlled and can be edited by users.
- Online leaderboard is trusted only because game results are validated on the server.
- In-memory leaderboard fallback is for development only; deployed persistence requires `DATABASE_URL`.
