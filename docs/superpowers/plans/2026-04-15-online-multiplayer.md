# Online Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time online multiplayer so two players on different computers can play via a shared 6-character room code.

**Architecture:** A Node.js + Socket.io server manages game rooms and is the single source of truth for game state. Player A creates a room and shares the code; Player B joins with that code. All moves are sent to the server, validated there, then broadcast to both clients. Pure game logic is extracted to `game-logic.js` and shared by the server and existing tests. The existing local (offline) mode stays intact — online mode is a separate screen toggled by a button.

**Tech Stack:** Node.js 18+, Express 4, Socket.io 4, vanilla JS (no framework change), existing CSS extended for new UI.

---

## File Map

| File                | Role                                                          | Action                                  |
| ------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `game-logic.js`     | Pure game functions (board, win check, draw)                  | **Create** (extracted from `app.js`)    |
| `server.js`         | Express + Socket.io server, room state                        | **Create**                              |
| `public/index.html` | Main page — local + online mode toggle, room lobby            | **Create** (replaces root `index.html`) |
| `public/styles.css` | All styles including new lobby/online UI                      | **Create** (replaces root `styles.css`) |
| `public/app.js`     | Local offline game (unchanged logic)                          | **Move** from root                      |
| `public/client.js`  | Online mode: Socket.io connection, room flow, board rendering | **Create**                              |
| `app.test.mjs`      | Tests — update import path to `game-logic.js`                 | **Modify**                              |
| `package.json`      | Add `express`, `socket.io`, `start` script                    | **Modify**                              |

---

## Socket.io Event Contract

**Client → Server:**
| Event | Payload | Description |
|---|---|---|
| `create-room` | `{ size, winLength }` | Create a new room |
| `join-room` | `{ code }` | Join existing room by code |
| `make-move` | `{ row, col }` | Place a mark |

**Server → Client:**
| Event | Payload | Description |
|---|---|---|
| `room-created` | `{ code }` | Room created, waiting for opponent |
| `room-error` | `{ message }` | Validation or join error |
| `game-start` | `{ player, size, winLength, board }` | Both players connected, game begins |
| `game-update` | `{ board, currentPlayer, winner, winningCells, movesPlayed }` | State after every move |
| `opponent-disconnected` | — | Other player left |

---

## Task 1: Extract pure game logic to `game-logic.js`

**Files:**

- Create: `game-logic.js`
- Modify: `app.test.mjs` (update import)

- [ ] **Step 1: Create `game-logic.js`**

```javascript
const directionPairs = [
  [
    [0, 1],
    [0, -1],
  ],
  [
    [1, 0],
    [-1, 0],
  ],
  [
    [1, 1],
    [-1, -1],
  ],
  [
    [-1, 1],
    [1, -1],
  ],
];

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
}

export function isValidSettings(size, winLength) {
  if (!Number.isInteger(size) || size < 3) {
    return { valid: false, message: "Board size must be at least 3." };
  }
  if (!Number.isInteger(winLength) || winLength < 3) {
    return { valid: false, message: "Win length must be at least 3." };
  }
  if (winLength > size) {
    return {
      valid: false,
      message: "Win length cannot be greater than board size.",
    };
  }
  return { valid: true, message: "" };
}

export function placeMark(board, row, col, player, gameOver) {
  if (gameOver || board[row][col] !== "") return false;
  board[row][col] = player;
  return true;
}

export function countDirection(board, row, col, rowStep, colStep) {
  const player = board[row][col];
  const cells = [];
  let r = row + rowStep;
  let c = col + colStep;
  while (
    r >= 0 &&
    r < board.length &&
    c >= 0 &&
    c < board.length &&
    board[r][c] === player
  ) {
    cells.push([r, c]);
    r += rowStep;
    c += colStep;
  }
  return { count: cells.length, cells };
}

export function checkWinner(board, row, col, winLength) {
  if (!board[row] || !board[row][col]) return { won: false, cells: [] };
  for (const [forward, backward] of directionPairs) {
    const fw = countDirection(board, row, col, forward[0], forward[1]);
    const bw = countDirection(board, row, col, backward[0], backward[1]);
    const cells = [[row, col], ...fw.cells, ...bw.cells];
    if (1 + fw.count + bw.count >= winLength) {
      return { won: true, cells: cells.slice(0, winLength) };
    }
  }
  return { won: false, cells: [] };
}

export function isDraw(board, movesPlayed) {
  return movesPlayed === board.length * board.length;
}
```

- [ ] **Step 2: Update `app.test.mjs` import**

Replace:

```javascript
import {
  checkWinner,
  createEmptyBoard,
  isDraw,
  isValidSettings,
  placeMark,
} from "./app.js";
```

With:

```javascript
import {
  checkWinner,
  createEmptyBoard,
  isDraw,
  isValidSettings,
  placeMark,
} from "./game-logic.js";
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: `11 tests: 11 passed, 0 failed`

- [ ] **Step 4: Commit**

Tell the user to check everything so far and commit

---

## Task 2: Set up Express server with static file serving

**Files:**

- Modify: `package.json`
- Create: `server.js`
- Create: `public/` directory

- [ ] **Step 1: Check Node.js version**

```bash
node --version
```

If below v18, install Node 18 via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or restart terminal
nvm install 18
nvm use 18
node --version    # must show v18.x.x
```

- [ ] **Step 2: Install server dependencies**

```bash
npm install express socket.io
```

- [ ] **Step 3: Create `public/` and copy existing frontend files**

```bash
mkdir -p public
cp index.html public/index.html
cp styles.css public/styles.css
cp app.js public/app.js
```

The root copies remain temporarily — they'll be deleted in Task 5 after the public/ versions are updated.

- [ ] **Step 4: Create `server.js`**

```javascript
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  checkWinner,
  createEmptyBoard,
  isDraw,
  isValidSettings,
} from "./game-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, "public")));

// Room store
const rooms = new Map();

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createRoom(size, winLength) {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));
  const room = {
    code,
    players: [], // index 0 = X, index 1 = O
    board: createEmptyBoard(size),
    currentPlayer: "X",
    winner: null, // "X" | "O" | "draw" | null
    winningCells: [],
    movesPlayed: 0,
    size,
    winLength,
  };
  rooms.set(code, room);
  return room;
}

io.on("connection", (socket) => {
  let currentRoomCode = null;

  // ── Create room ──────────────────────────────────────────────────────────
  socket.on("create-room", ({ size, winLength }) => {
    const v = isValidSettings(size, winLength);
    if (!v.valid) {
      socket.emit("room-error", { message: v.message });
      return;
    }
    const room = createRoom(size, winLength);
    currentRoomCode = room.code;
    room.players.push(socket.id);
    socket.join(room.code);
    socket.emit("room-created", { code: room.code });
  });

  // ── Join room ────────────────────────────────────────────────────────────
  socket.on("join-room", ({ code }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) {
      socket.emit("room-error", { message: "Room not found." });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit("room-error", { message: "Room is full." });
      return;
    }
    currentRoomCode = room.code;
    room.players.push(socket.id);
    socket.join(room.code);

    const base = {
      size: room.size,
      winLength: room.winLength,
      board: room.board,
    };
    io.to(room.players[0]).emit("game-start", { ...base, player: "X" });
    io.to(room.players[1]).emit("game-start", { ...base, player: "O" });
  });

  // ── Make move ────────────────────────────────────────────────────────────
  socket.on("make-move", ({ row, col }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.winner) return;

    const playerIndex = room.players.indexOf(socket.id);
    const playerMark = playerIndex === 0 ? "X" : "O";
    if (playerMark !== room.currentPlayer) return;

    if (
      row < 0 ||
      row >= room.size ||
      col < 0 ||
      col >= room.size ||
      room.board[row][col] !== ""
    )
      return;

    room.board[row][col] = room.currentPlayer;
    room.movesPlayed += 1;

    const result = checkWinner(room.board, row, col, room.winLength);
    if (result.won) {
      room.winner = room.currentPlayer;
      room.winningCells = result.cells;
    } else if (isDraw(room.board, room.movesPlayed)) {
      room.winner = "draw";
    } else {
      room.currentPlayer = room.currentPlayer === "X" ? "O" : "X";
    }

    io.to(room.code).emit("game-update", {
      board: room.board,
      currentPlayer: room.currentPlayer,
      winner: room.winner,
      winningCells: room.winningCells,
      movesPlayed: room.movesPlayed,
    });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (!currentRoomCode) return;
    socket.to(currentRoomCode).emit("opponent-disconnected");
    rooms.delete(currentRoomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 5: Add `start` script to `package.json`**

In the `"scripts"` object, add:

```json
"start": "node server.js"
```

- [ ] **Step 6: Start server and verify static files load**

```bash
npm start
```

Open http://localhost:3000 in browser. Should see the existing game.
Kill with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add server.js public/ package.json package-lock.json
git commit -m "feat: add Express + Socket.io server serving static files"
```

---

## Task 3: Add online lobby UI to `public/index.html`

**Files:**

- Modify: `public/index.html`

- [ ] **Step 1: Replace `public/index.html` with version that includes mode toggle and lobby**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tic Tac Toe</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="game-shell">
      <section class="intro" aria-labelledby="game-title">
        <h1 id="game-title">Tic Tac Toe</h1>
        <p class="lead">
          First to get N in a row wins. Horizontal, vertical, or diagonal.
        </p>
      </section>

      <!-- Mode toggle -->
      <div class="mode-toggle" role="group" aria-label="Game mode">
        <button class="mode-btn active" id="btn-mode-local" type="button">
          Local
        </button>
        <button class="mode-btn" id="btn-mode-online" type="button">
          Online
        </button>
      </div>

      <!-- ── LOCAL MODE ─────────────────────────────────────────────────── -->
      <div id="local-mode">
        <form class="controls" id="settings-form">
          <label for="board-size">
            Board size
            <input
              id="board-size"
              name="board-size"
              type="number"
              min="3"
              max="20"
              value="10"
              inputmode="numeric"
            />
          </label>
          <label for="win-length">
            In a row to win
            <input
              id="win-length"
              name="win-length"
              type="number"
              min="3"
              value="5"
              inputmode="numeric"
            />
          </label>
          <button type="submit">New Game</button>
        </form>

        <div class="scoreboard" aria-label="Score">
          <div class="score-card player-x" id="score-card-x">
            <span class="player-label">Player X</span>
            <span class="score" id="score-x">0</span>
          </div>
          <div class="score-divider">vs</div>
          <div class="score-card player-o" id="score-card-o">
            <span class="player-label">Player O</span>
            <span class="score" id="score-o">0</span>
          </div>
        </div>

        <p
          class="status"
          id="local-status"
          role="status"
          aria-live="polite"
        ></p>

        <section class="board-wrap" aria-label="Game board">
          <div class="board" id="local-board"></div>
        </section>
      </div>

      <!-- ── ONLINE MODE ────────────────────────────────────────────────── -->
      <div id="online-mode" hidden>
        <!-- Lobby: before game starts -->
        <div id="online-lobby">
          <div class="lobby-section">
            <h2 class="lobby-heading">Create a room</h2>
            <form class="controls" id="online-settings-form">
              <label for="online-board-size">
                Board size
                <input
                  id="online-board-size"
                  type="number"
                  min="3"
                  max="20"
                  value="10"
                  inputmode="numeric"
                />
              </label>
              <label for="online-win-length">
                In a row to win
                <input
                  id="online-win-length"
                  type="number"
                  min="3"
                  value="5"
                  inputmode="numeric"
                />
              </label>
              <button type="submit">Create Room</button>
            </form>
            <div id="room-created-info" hidden>
              <p class="lobby-waiting">Share this code with your opponent:</p>
              <p class="room-code" id="room-code-display"></p>
              <p class="lobby-waiting">Waiting for opponent to join…</p>
            </div>
          </div>

          <div class="lobby-divider">or</div>

          <div class="lobby-section">
            <h2 class="lobby-heading">Join a room</h2>
            <form class="join-form" id="join-form">
              <input
                id="join-code-input"
                type="text"
                maxlength="6"
                placeholder="Enter room code"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="submit">Join</button>
            </form>
          </div>

          <p
            class="status"
            id="lobby-status"
            role="status"
            aria-live="polite"
          ></p>
        </div>

        <!-- Game: after both players connect -->
        <div id="online-game" hidden>
          <div class="online-player-badge" id="online-player-badge"></div>
          <p
            class="status"
            id="online-status"
            role="status"
            aria-live="polite"
          ></p>
          <section class="board-wrap" aria-label="Game board">
            <div class="board" id="online-board"></div>
          </section>
          <button class="leave-btn" id="btn-leave" type="button">
            Leave game
          </button>
        </div>
      </div>
    </main>

    <script type="module" src="app.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <script type="module" src="client.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Restart server and verify page loads without console errors**

```bash
npm start
```

Open http://localhost:3000. Check browser DevTools console — no errors. Local tab should show the game, Online tab should show lobby UI.
Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add online lobby UI to index.html"
```

---

## Task 4: Extend `public/styles.css` with lobby and online styles

**Files:**

- Modify: `public/styles.css`

- [ ] **Step 1: Append the following to the end of `public/styles.css`**

```css
/* ── Mode toggle ──────────────────────────────────────────────────────────── */

.mode-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  padding: 4px;
  background: var(--border);
  border-radius: 10px;
  width: fit-content;
}

.mode-btn {
  padding: 7px 20px;
  background: transparent;
  color: var(--muted);
  border: none;
  border-radius: 7px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.mode-btn:hover {
  color: var(--text);
}

.mode-btn.active {
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* ── Online lobby ─────────────────────────────────────────────────────────── */

#online-lobby {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}

.lobby-section {
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.lobby-heading {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.lobby-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-top: 60px;
}

.lobby-waiting {
  margin: 12px 0 4px;
  font-size: 0.9rem;
  color: var(--muted);
}

.room-code {
  margin: 6px 0;
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--accent);
  font-family: monospace;
}

.join-form {
  display: flex;
  gap: 8px;
}

.join-form input {
  flex: 1;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: monospace;
  color: var(--text);
  background: var(--bg);
  transition: border-color 0.15s;
}

.join-form input:focus {
  outline: none;
  border-color: var(--accent);
}

.join-form button {
  padding: 10px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.join-form button:hover {
  background: var(--accent-hover);
}

/* ── Online game ──────────────────────────────────────────────────────────── */

.online-player-badge {
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 10px;
}

.online-player-badge strong {
  font-size: 1.2rem;
}

.online-player-badge.badge-x strong {
  color: var(--x-color);
}
.online-player-badge.badge-o strong {
  color: var(--o-color);
}

.leave-btn {
  display: block;
  margin: 14px auto 0;
  padding: 8px 20px;
  background: transparent;
  color: var(--muted);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.leave-btn:hover {
  color: var(--x-color);
  border-color: var(--x-color);
}

@media (max-width: 600px) {
  #online-lobby {
    grid-template-columns: 1fr;
  }

  .lobby-divider {
    padding-top: 0;
  }
}
```

- [ ] **Step 2: Verify styles look right**

```bash
npm start
```

Open http://localhost:3000. Click "Online" tab. Should see two-column lobby with Create/Join sections.
Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "feat: add online lobby and game styles"
```

---

## Task 5: Create `public/client.js` — online mode logic

**Files:**

- Create: `public/client.js`

- [ ] **Step 1: Create `public/client.js`**

```javascript
// Online multiplayer client
// Requires socket.io loaded via <script src="/socket.io/socket.io.js">

const socket = io();

// ── State ──────────────────────────────────────────────────────────────────
let myPlayer = null; // "X" or "O"
let gameState = null; // last game-update payload
let gameSize = 10;
let gameWinLength = 5;

// ── Element refs ───────────────────────────────────────────────────────────
const elBtnLocal = document.querySelector("#btn-mode-local");
const elBtnOnline = document.querySelector("#btn-mode-online");
const elLocalMode = document.querySelector("#local-mode");
const elOnlineMode = document.querySelector("#online-mode");
const elLobby = document.querySelector("#online-lobby");
const elOnlineGame = document.querySelector("#online-game");
const elOnlineBoard = document.querySelector("#online-board");
const elOnlineSettings = document.querySelector("#online-settings-form");
const elOnlineBoardSize = document.querySelector("#online-board-size");
const elOnlineWinLength = document.querySelector("#online-win-length");
const elRoomCreated = document.querySelector("#room-created-info");
const elRoomCode = document.querySelector("#room-code-display");
const elJoinForm = document.querySelector("#join-form");
const elJoinInput = document.querySelector("#join-code-input");
const elLobbyStatus = document.querySelector("#lobby-status");
const elOnlineStatus = document.querySelector("#online-status");
const elPlayerBadge = document.querySelector("#online-player-badge");
const elBtnLeave = document.querySelector("#btn-leave");

// ── Mode toggle ────────────────────────────────────────────────────────────
elBtnLocal.addEventListener("click", () => {
  elBtnLocal.classList.add("active");
  elBtnOnline.classList.remove("active");
  elLocalMode.hidden = false;
  elOnlineMode.hidden = true;
});

elBtnOnline.addEventListener("click", () => {
  elBtnOnline.classList.add("active");
  elBtnLocal.classList.remove("active");
  elLocalMode.hidden = true;
  elOnlineMode.hidden = false;
});

// ── Create room ────────────────────────────────────────────────────────────
elOnlineSettings.addEventListener("submit", (e) => {
  e.preventDefault();
  const size = Number(elOnlineBoardSize.value);
  const winLength = Number(elOnlineWinLength.value);
  setLobbyStatus("", "");
  socket.emit("create-room", { size, winLength });
});

// ── Join room ──────────────────────────────────────────────────────────────
elJoinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = elJoinInput.value.trim().toUpperCase();
  if (!code) return;
  setLobbyStatus("", "");
  socket.emit("join-room", { code });
});

// ── Leave game ─────────────────────────────────────────────────────────────
elBtnLeave.addEventListener("click", () => {
  socket.disconnect();
  socket.connect();
  showLobby();
});

// ── Socket events ──────────────────────────────────────────────────────────
socket.on("room-created", ({ code }) => {
  elRoomCode.textContent = code;
  elRoomCreated.hidden = false;
  setLobbyStatus("Waiting for opponent…", "waiting");
});

socket.on("room-error", ({ message }) => {
  setLobbyStatus(message, "error");
});

socket.on("game-start", ({ player, size, winLength, board }) => {
  myPlayer = player;
  gameSize = size;
  gameWinLength = winLength;
  gameState = {
    board,
    currentPlayer: "X",
    winner: null,
    winningCells: [],
    movesPlayed: 0,
  };

  elPlayerBadge.className = `online-player-badge badge-${player.toLowerCase()}`;
  elPlayerBadge.innerHTML = `You are <strong>${player}</strong>`;

  showGame();
  buildOnlineBoard(size);
  renderOnlineBoard();
  setOnlineStatus(`Player X's turn`, "x");
});

socket.on("game-update", (update) => {
  gameState = update;
  renderOnlineBoard();

  if (update.winner === "draw") {
    setOnlineStatus("Draw game", "draw");
  } else if (update.winner) {
    const youWon = update.winner === myPlayer;
    setOnlineStatus(
      youWon ? "You win!" : `Player ${update.winner} wins`,
      `win-${update.winner.toLowerCase()}`,
    );
  } else {
    const yourTurn = update.currentPlayer === myPlayer;
    setOnlineStatus(
      yourTurn ? "Your turn" : `Player ${update.currentPlayer}'s turn`,
      update.currentPlayer.toLowerCase(),
    );
  }
});

socket.on("opponent-disconnected", () => {
  setOnlineStatus("Opponent disconnected", "draw");
  // Disable all cells
  for (const cell of elOnlineBoard.querySelectorAll(".cell")) {
    cell.disabled = true;
  }
});

// ── Board rendering ────────────────────────────────────────────────────────
function buildOnlineBoard(size) {
  elOnlineBoard.innerHTML = "";
  elOnlineBoard.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  const boardPx = Math.min(window.innerWidth * 0.96, 600);
  const cellPx = Math.floor(boardPx / size);
  elOnlineBoard.style.fontSize = `${Math.max(10, Math.floor(cellPx * 0.55))}px`;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
      cell.addEventListener("click", () => handleOnlineCellClick(row, col));
      elOnlineBoard.append(cell);
    }
  }
}

function renderOnlineBoard() {
  if (!gameState) return;

  const { board, currentPlayer, winner, winningCells } = gameState;
  const boardClosed = Boolean(winner);
  const myTurn = currentPlayer === myPlayer && !boardClosed;

  elOnlineBoard.dataset.currentPlayer = myTurn ? myPlayer : "";

  for (let row = 0; row < gameSize; row++) {
    for (let col = 0; col < gameSize; col++) {
      const mark = board[row][col];
      const cell = elOnlineBoard.children[row * gameSize + col];

      cell.textContent = mark;
      cell.disabled = boardClosed || mark !== "" || !myTurn;
      cell.setAttribute(
        "aria-label",
        `Row ${row + 1}, column ${col + 1}${mark ? `, ${mark}` : ""}`,
      );

      if (mark) {
        cell.dataset.mark = mark;
      } else {
        delete cell.dataset.mark;
      }

      const isWinning = winningCells.some(([r, c]) => r === row && c === col);
      cell.classList.toggle("winning", isWinning);
    }
  }
}

function handleOnlineCellClick(row, col) {
  if (!gameState || gameState.winner) return;
  if (gameState.currentPlayer !== myPlayer) return;
  if (gameState.board[row][col] !== "") return;
  socket.emit("make-move", { row, col });
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showLobby() {
  elLobby.hidden = false;
  elOnlineGame.hidden = true;
  elRoomCreated.hidden = true;
  elJoinInput.value = "";
  setLobbyStatus("", "");
  myPlayer = null;
  gameState = null;
}

function showGame() {
  elLobby.hidden = true;
  elOnlineGame.hidden = false;
}

function setLobbyStatus(message, type) {
  elLobbyStatus.textContent = message;
  elLobbyStatus.dataset.type = type;
}

function setOnlineStatus(message, type) {
  elOnlineStatus.textContent = message;
  elOnlineStatus.dataset.type = type;
}
```

- [ ] **Step 2: Restart server**

```bash
npm start
```

- [ ] **Step 3: Test online flow with two browser tabs**

1. Open http://localhost:3000 in Tab 1. Click "Online".
2. Click "Create Room". A 6-character code appears.
3. Open http://localhost:3000 in Tab 2. Click "Online".
4. Type the code from Tab 1 into "Join a room". Click Join.
5. Both tabs should switch to the game board.
6. Tab 1 is X, Tab 2 is O. Verify only the current player's tab allows clicking.
7. Place 5 in a row — verify win is detected and both tabs show the winner.
8. Close Tab 2 — verify Tab 1 shows "Opponent disconnected".

- [ ] **Step 4: Commit**

```bash
git add public/client.js
git commit -m "feat: add online multiplayer client with Socket.io"
```

---

## Task 6: Clean up and update `public/app.js`

**Files:**

- Modify: `public/app.js` (update board element IDs to match new HTML)
- Delete root copies of frontend files that now live in `public/`

- [ ] **Step 1: Update element IDs in `public/app.js`**

The local mode board is now `#local-board` and status is `#local-status`. In `public/app.js`, find the `elements` object:

```javascript
const elements =
  typeof document === "undefined"
    ? null
    : {
        form: document.querySelector("#settings-form"),
        board: document.querySelector("#board"),
        status: document.querySelector("#status"),
        sizeInput: document.querySelector("#board-size"),
        winInput: document.querySelector("#win-length"),
        scoreX: document.querySelector("#score-x"),
        scoreO: document.querySelector("#score-o"),
        scoreCardX: document.querySelector("#score-card-x"),
        scoreCardO: document.querySelector("#score-card-o"),
      };
```

Replace with:

```javascript
const elements =
  typeof document === "undefined"
    ? null
    : {
        form: document.querySelector("#settings-form"),
        board: document.querySelector("#local-board"),
        status: document.querySelector("#local-status"),
        sizeInput: document.querySelector("#board-size"),
        winInput: document.querySelector("#win-length"),
        scoreX: document.querySelector("#score-x"),
        scoreO: document.querySelector("#score-o"),
        scoreCardX: document.querySelector("#score-card-x"),
        scoreCardO: document.querySelector("#score-card-o"),
      };
```

- [ ] **Step 2: Verify local game still works**

```bash
npm start
```

Open http://localhost:3000. "Local" tab: play a game, verify moves, win detection, and score tracking all work.

- [ ] **Step 3: Remove root frontend files (now superseded by `public/`)**

```bash
rm index.html styles.css app.js
```

- [ ] **Step 4: Run tests (app.test.mjs in root still imports from game-logic.js — no path change needed)**

```bash
npm test
```

Expected: `11 tests: 11 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git rm index.html styles.css app.js
git commit -m "feat: update local game for new HTML structure, remove root frontend files"
```

---

## Task 7: Deploy to the internet (Render free tier)

**Files:**

- No code changes — deploy as-is

- [ ] **Step 1: Push code to GitHub**

```bash
git remote add origin https://github.com/YOUR_USERNAME/tic-tac-toe.git
git push -u origin main
```

- [ ] **Step 2: Create Render account and new Web Service**

1. Go to https://render.com and sign up (free).
2. Click "New → Web Service".
3. Connect your GitHub repo.
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Environment:** `Node`
5. Click "Deploy".

- [ ] **Step 3: Verify deployed URL**

Render gives a URL like `https://tic-tac-toe-xxxx.onrender.com`.
Open in two separate devices or browser profiles. Play a full online game.

> **Note:** Free Render instances sleep after 15 minutes of inactivity. First load after sleep takes ~30 seconds. Upgrade to a paid plan ($7/mo) to keep it awake.

---

## Testing Checklist

Run through these manually after Task 6 is complete:

- [ ] Local mode: 3×3 game plays to win and draw correctly
- [ ] Local mode: 10×10 game with 5-in-a-row detects win horizontally, vertically, diagonally
- [ ] Local mode: score increments on win, persists across new games
- [ ] Online mode: create room shows 6-character code
- [ ] Online mode: invalid code shows error message
- [ ] Online mode: full room (2 players) rejects a third joiner
- [ ] Online mode: both players see the board after joining
- [ ] Online mode: only the current player's tab can click cells
- [ ] Online mode: 5-in-a-row win detected on both tabs simultaneously
- [ ] Online mode: closing one tab shows "Opponent disconnected" on the other
- [ ] Online mode: "Leave game" returns to the lobby

---

## Known Limitations (not in scope)

- No reconnection if network drops mid-game (socket disconnect = room deleted)
- No game replay or rematch button
- Free Render tier sleeps after inactivity
- Room codes are not collision-proof at very high concurrency (acceptable for a personal project)
