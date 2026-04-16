# Project Structure

This project is a Node.js + Express + Socket.io app with vanilla browser JavaScript.

## Runtime Overview

The server is the source of truth for online games. Browsers send room and move events through Socket.io. The server validates those events, updates room state, and broadcasts board updates to both players.

Local games run entirely in the browser through `public/app.js`. Online games run through `public/client.js` and the server-side room store.

## File Map

```text
.
├── README.md
├── package.json
├── package-lock.json
├── server.js
├── game-logic.js
├── leaderboard-store.js
├── room-state.js
├── app.test.mjs
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── username.js
│   ├── identity.js
│   ├── local-stats.js
│   ├── online-view.js
│   ├── app.js
│   └── client.js
└── docs/
    ├── project-structure.md
    └── superpowers/
        ├── plans/
        │   ├── 2026-04-15-online-multiplayer.md
        │   └── 2026-04-15-leaderboard.md
        └── specs/
            └── 2026-04-15-animation-system-design.md
```

## Server Files

### `server.js`

Owns the HTTP server and Socket.io event wiring.

Responsibilities:

- Create the Express app.
- Serve static files from `public/`.
- Create the Socket.io server.
- Create the leaderboard store.
- Expose `/api/leaderboard` and `/api/leaderboard/:username`.
- Listen for `create-room`, `join-room`, and `make-move`.
- Emit `room-created`, `room-error`, `game-start`, `game-update`, and `opponent-disconnected`.
- Delegate room rules to `room-state.js`.

`server.js` should stay thin. Game rules belong in `game-logic.js` or `room-state.js`.

### `room-state.js`

Owns online room state and online move validation.

Responsibilities:

- Create rooms with 6-character codes.
- Track which socket is player `X` and which socket is player `O`.
- Store each online player's public username.
- Reject missing, full, or invalid rooms.
- Reject invalid usernames.
- Reject out-of-turn moves.
- Reject out-of-bounds or occupied-cell moves.
- Update board state after valid moves.
- Detect wins and draws using `game-logic.js`.
- Return game result metadata when an online game ends.
- Delete rooms when a player disconnects.

Rooms are stored in memory with `Map`. This is simple and works for one server instance. If the app scales to multiple instances, this layer needs shared storage such as Redis.

### `leaderboard-store.js`

Online leaderboard persistence. Uses Supabase Postgres when `DATABASE_URL` is set and in-memory storage otherwise.

Exports:

- `createMemoryLeaderboardStore()`
- `createPostgresLeaderboardStore({ databaseUrl })`
- `createLeaderboardStore({ databaseUrl })`

### `game-logic.js`

Owns pure game functions shared by tests and server-side room logic.

Exports:

- `createEmptyBoard(size)`
- `isValidSettings(size, winLength)`
- `placeMark(board, row, col, player, gameOver)`
- `countDirection(board, row, col, rowStep, colStep)`
- `checkWinner(board, row, col, winLength)`
- `isDraw(board, movesPlayed)`

This file should not depend on the DOM, Socket.io, or Express.

## Browser Files

### `public/index.html`

Main app page.

Contains:

- Public username form.
- Local/Online mode toggle.
- Local player name inputs.
- Local game controls.
- Local scoreboard and board.
- Browser-only local stats list.
- Online create-room form.
- Online join-room form.
- Online game board.
- Online leaderboard list.
- Socket.io browser script.
- `app.js` and `client.js` scripts.

### `public/styles.css`

All app styling.

Contains:

- Page layout.
- Settings controls.
- Scoreboard and sliding turn indicator.
- Board and cell styling.
- Winning-cell styling.
- Local/online mode toggle.
- Online lobby layout (action toggle + create/join panels).
- Online player badge and leave button.
- Username and leaderboard sections.
- Full animation system: slide-in/out panel transitions, cell ripple, status flip, board confetti, leaderboard stagger, reduced-motion override.

### `public/username.js`

Shared username normalization and validation used by browser and server tests.

### `public/identity.js`

Cookie-backed browser identity state. Stores the public username in `ttt_username` and emits `ttt:username-change` when it changes.

### `public/local-stats.js`

Browser-only local leaderboard storage helpers. Stores local results in `localStorage` under `ttt_local_stats_v1`.

### `public/online-view.js`

Online view helpers shared between `client.js` and any code that needs to know which panels are visible.

Exports:

- `formatOnlineRoomCode(code)` — formats room code for display.
- `getOnlineVisibilityState(view)` — returns `{ pageView, lobbyHidden, gameHidden }` for a given view name.

### `public/app.js`

Owns local offline game behavior.

Responsibilities:

- Keep local game state.
- Read local player names.
- Build the local board.
- Render local moves.
- Handle local clicks.
- Record local wins, losses, and draws in browser storage.
- Update scores and sliding turn indicator.
- Render browser-only local stats.
- Show local win/draw status.
- Trigger confetti on win and cell ripple on click.
- Animate status message changes (flip effect).

It imports no server code and does not use Socket.io.

### `public/client.js`

Owns online multiplayer browser behavior.

Responsibilities:

- Connect to Socket.io.
- Initialize cookie-backed username identity.
- Switch between Local and Online views with animated slide transitions.
- Toggle lobby Create/Join panels with animated slide transitions.
- Emit username-aware `create-room`, `join-room`, and `make-move`.
- Render online board state from server events.
- Fetch and render `/api/leaderboard`.
- Disable cells when it is not this browser's turn.
- Show room errors, win/draw status, and disconnect status with flip animation.
- Trigger confetti on win and cell ripple on click.
- Handle the Leave Game button.

It treats the server as the source of truth. It should not decide whether a move is valid beyond basic UI guard checks.

## Tests

### `app.test.mjs`

Node-based test runner using built-in `assert`.

Covers:

- Settings validation.
- Board creation.
- Win detection.
- Draw detection.
- Mark placement.
- Online room creation/join behavior.
- Online turn validation.
- Online win update payloads.
- Username validation.
- Browser-only local stats helpers.
- Online leaderboard store ranking.
- Online game result metadata.

Run tests with:

```bash
npm test
```

## Socket Event Contract

Client to server:

| Event | Payload | Purpose |
| --- | --- | --- |
| `create-room` | `{ size, winLength, username }` | Create online room |
| `join-room` | `{ code, username }` | Join existing room |
| `make-move` | `{ row, col }` | Attempt move |

Server to client:

| Event | Payload | Purpose |
| --- | --- | --- |
| `room-created` | `{ code }` | Room created |
| `room-error` | `{ message }` | Room or move problem |
| `game-start` | `{ player, size, winLength, board, players }` | Both players connected |
| `game-update` | `{ board, currentPlayer, winner, winningCells, movesPlayed }` | Board changed |
| `opponent-disconnected` | none | Other player left |

## Data Ownership

Local mode:

- Source of truth: `public/app.js`
- State owner: browser tab
- Stats owner: browser `localStorage`
- Network: none

Online mode:

- Source of truth: `room-state.js`
- State owner: Node server process
- Leaderboard owner: `leaderboard-store.js`
- Client role: render state and send user intent
- Network: Socket.io

## Deployment Shape

The app should be deployed as a Node web service:

```bash
npm install
npm start
```

Static hosting alone is not enough because Socket.io needs the Node server in `server.js`.
