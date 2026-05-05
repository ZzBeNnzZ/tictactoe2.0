import assert from "assert";

import { createMemoryLeaderboardStore } from "./leaderboard-store.js";
import {
  checkWinner,
  createEmptyBoard,
  isDraw,
  isValidSettings,
  placeMark,
} from "./game-logic.js";
import {
  createEmptyLocalStats,
  recordLocalDraw,
  recordLocalWin,
} from "./public/local-stats.js";
import {
  flipStatusMessage,
  formatOnlineRoomCode,
  getOnlineVisibilityState,
} from "./public/online-view.js";
import { normalizeUsername, validateUsername } from "./public/username.js";
import { createRoomStore } from "./room-state.js";

let passed = 0;
let failed = 0;
const tests = [];

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(className) {
    this.classes.add(className);
  }

  remove(className) {
    this.classes.delete(className);
  }

  contains(className) {
    return this.classes.has(className);
  }
}

class FakeStatusElement {
  constructor() {
    this.textContent = "";
    this.dataset = {};
    this.hidden = false;
    this.classList = new FakeClassList();
    this.listeners = {};
  }

  addEventListener(eventName, handler) {
    this.listeners[eventName] = this.listeners[eventName] || [];
    this.listeners[eventName].push(handler);
  }

  dispatchAnimationEnd() {
    const handlers = this.listeners.animationend || [];
    this.listeners.animationend = [];
    for (const handler of handlers) {
      handler();
    }
  }
}

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    await runTest(name, fn);
  }
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── Settings validation ──────────────────────────────────────────────────────

test("validates board size and win length settings", () => {
  assert.equal(isValidSettings(3, 3).valid, true);
  assert.deepEqual(isValidSettings(2, 3), {
    valid: false,
    message: "Board size must be at least 3.",
  });
  assert.deepEqual(isValidSettings(4, 2), {
    valid: false,
    message: "Win length must be at least 3.",
  });
  assert.deepEqual(isValidSettings(4, 5), {
    valid: false,
    message: "Win length cannot be greater than board size.",
  });
});

// ── Win detection ─────────────────────────────────────────────────────────────

test("detects a horizontal winner from the last move", () => {
  const board = createEmptyBoard(5);
  board[2][0] = "X";
  board[2][1] = "X";
  board[2][2] = "X";
  board[2][3] = "X";

  assert.deepEqual(checkWinner(board, 2, 3, 4), {
    won: true,
    cells: [
      [2, 3],
      [2, 2],
      [2, 1],
      [2, 0],
    ],
  });
});

test("detects a vertical winner from the last move", () => {
  const board = createEmptyBoard(5);
  board[1][3] = "O";
  board[2][3] = "O";
  board[3][3] = "O";
  board[4][3] = "O";

  assert.equal(checkWinner(board, 4, 3, 4).won, true);
});

test("detects both diagonal winner directions", () => {
  const downBoard = createEmptyBoard(5);
  downBoard[0][0] = "X";
  downBoard[1][1] = "X";
  downBoard[2][2] = "X";
  downBoard[3][3] = "X";

  const upBoard = createEmptyBoard(5);
  upBoard[4][0] = "O";
  upBoard[3][1] = "O";
  upBoard[2][2] = "O";
  upBoard[1][3] = "O";

  assert.equal(checkWinner(downBoard, 3, 3, 4).won, true);
  assert.equal(checkWinner(upBoard, 1, 3, 4).won, true);
});

// ── 5-in-a-row (default win condition) ───────────────────────────────────────

test("detects 5-in-a-row win horizontally on a 10x10 board", () => {
  const board = createEmptyBoard(10);
  board[4][2] = "X";
  board[4][3] = "X";
  board[4][4] = "X";
  board[4][5] = "X";
  board[4][6] = "X";

  const result = checkWinner(board, 4, 6, 5);
  assert.equal(result.won, true, "should detect 5 horizontal X marks as a win");
  assert.equal(result.cells.length, 5, "should return exactly 5 winning cells");
});

test("detects 5-in-a-row win vertically on a 10x10 board", () => {
  const board = createEmptyBoard(10);
  board[2][7] = "O";
  board[3][7] = "O";
  board[4][7] = "O";
  board[5][7] = "O";
  board[6][7] = "O";

  const result = checkWinner(board, 6, 7, 5);
  assert.equal(result.won, true, "should detect 5 vertical O marks as a win");
});

test("detects 5-in-a-row win diagonally on a 10x10 board", () => {
  const board = createEmptyBoard(10);
  board[0][0] = "X";
  board[1][1] = "X";
  board[2][2] = "X";
  board[3][3] = "X";
  board[4][4] = "X";

  assert.equal(checkWinner(board, 4, 4, 5).won, true, "should detect 5 diagonal X marks as a win");
});

test("does not trigger win with only 4-in-a-row when win length is 5", () => {
  const board = createEmptyBoard(10);
  board[3][0] = "O";
  board[3][1] = "O";
  board[3][2] = "O";
  board[3][3] = "O";

  assert.equal(checkWinner(board, 3, 3, 5).won, false, "4 in a row should not win when 5 required");
});

test("detects win exactly at 5 even with more marks nearby (no over-counting)", () => {
  const board = createEmptyBoard(10);
  // 6 in a row — should still detect as a win (>= 5)
  board[0][0] = "X";
  board[0][1] = "X";
  board[0][2] = "X";
  board[0][3] = "X";
  board[0][4] = "X";
  board[0][5] = "X";

  assert.equal(checkWinner(board, 0, 5, 5).won, true, "6 in a row should win when 5 required");
});

// ── Mark placement ────────────────────────────────────────────────────────────

test("places marks only in empty cells while the game is active", () => {
  const board = createEmptyBoard(3);

  assert.equal(placeMark(board, 0, 0, "X", false), true);
  assert.equal(board[0][0], "X");
  assert.equal(placeMark(board, 0, 0, "O", false), false);
  assert.equal(board[0][0], "X");
  assert.equal(placeMark(board, 0, 1, "O", true), false);
  assert.equal(board[0][1], "");
});

// ── Draw detection ────────────────────────────────────────────────────────────

test("detects a draw when every cell is filled without a winner", () => {
  const board = [
    ["X", "O", "X"],
    ["X", "O", "O"],
    ["O", "X", "X"],
  ];

  assert.equal(isDraw(board, 9), true);
  assert.equal(isDraw(board, 8), false);
});

// ── Online room state ────────────────────────────────────────────────────────

test("creates a room, starts both players on join, and rejects a third player", () => {
  const rooms = createRoomStore({ generateCode: () => "abc123", random: () => 0 });

  const created = rooms.createRoom({
    socketId: "socket-a",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  assert.equal(created.ok, true);
  assert.equal(created.code, "ABC123");

  const joined = rooms.joinRoom({
    socketId: "socket-b",
    username: "Alex",
    code: "abc123",
  });
  assert.equal(joined.ok, true);
  assert.deepEqual(joined.players, [
    { socketId: "socket-a", username: "Ben", player: "X", mark: "X" },
    { socketId: "socket-b", username: "Alex", player: "O", mark: "O" },
  ]);
  assert.equal(joined.room.board.length, 3);

  assert.deepEqual(rooms.joinRoom({ socketId: "socket-c", username: "Cara", code: "ABC123" }), {
    ok: false,
    message: "Room is full.",
  });
});

test("randomly assigns the first online starter when a room fills", () => {
  const creatorStarts = createRoomStore({ generateCode: () => "RND001", random: () => 0 });
  creatorStarts.createRoom({
    socketId: "socket-a",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  assert.deepEqual(
    creatorStarts.joinRoom({
      socketId: "socket-b",
      username: "Alex",
      code: "RND001",
    }).players,
    [
      { socketId: "socket-a", username: "Ben", player: "X", mark: "X" },
      { socketId: "socket-b", username: "Alex", player: "O", mark: "O" },
    ],
  );

  const joinerStarts = createRoomStore({ generateCode: () => "RND002", random: () => 0.75 });
  joinerStarts.createRoom({
    socketId: "socket-a",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  assert.deepEqual(
    joinerStarts.joinRoom({
      socketId: "socket-b",
      username: "Alex",
      code: "RND002",
    }).players,
    [
      { socketId: "socket-a", username: "Ben", player: "O", mark: "O" },
      { socketId: "socket-b", username: "Alex", player: "X", mark: "X" },
    ],
  );
});

test("validates turns and returns winner updates after online moves", () => {
  const rooms = createRoomStore({ generateCode: () => "WIN001", random: () => 0 });
  rooms.createRoom({
    socketId: "x-player",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  rooms.joinRoom({
    socketId: "o-player",
    username: "Alex",
    code: "WIN001",
  });

  assert.deepEqual(rooms.makeMove({ socketId: "o-player", row: 0, col: 0 }), {
    ok: false,
    message: "Not your turn.",
  });

  assert.equal(rooms.makeMove({ socketId: "x-player", row: 0, col: 0 }).ok, true);
  assert.equal(rooms.makeMove({ socketId: "o-player", row: 1, col: 0 }).ok, true);
  assert.equal(rooms.makeMove({ socketId: "x-player", row: 0, col: 1 }).ok, true);
  assert.equal(rooms.makeMove({ socketId: "o-player", row: 1, col: 1 }).ok, true);
  const winningMove = rooms.makeMove({ socketId: "x-player", row: 0, col: 2 });

  assert.equal(winningMove.ok, true);
  assert.deepEqual(winningMove.update, {
    board: [
      ["X", "X", "X"],
      ["O", "O", ""],
      ["", "", ""],
    ],
    currentPlayer: "X",
    winner: "X",
    winningCells: [
      [0, 2],
      [0, 1],
      [0, 0],
    ],
    movesPlayed: 5,
  });
});

test("returns online result metadata when a game ends", () => {
  const rooms = createRoomStore({ generateCode: () => "WIN002", random: () => 0 });
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

test("requires both online players to request a rematch before resetting", () => {
  const randomValues = [0, 0.75];
  const rooms = createRoomStore({
    generateCode: () => "REM001",
    random: () => (randomValues.length ? randomValues.shift() : 0),
  });
  rooms.createRoom({
    socketId: "x-player",
    username: "Ben",
    size: 3,
    winLength: 3,
  });
  rooms.joinRoom({
    socketId: "o-player",
    username: "Alex",
    code: "REM001",
  });

  assert.deepEqual(rooms.requestRematch({ socketId: "x-player" }), {
    ok: false,
    message: "Game is not over.",
  });

  rooms.makeMove({ socketId: "x-player", row: 0, col: 0 });
  rooms.makeMove({ socketId: "o-player", row: 1, col: 0 });
  rooms.makeMove({ socketId: "x-player", row: 0, col: 1 });
  rooms.makeMove({ socketId: "o-player", row: 1, col: 1 });
  rooms.makeMove({ socketId: "x-player", row: 0, col: 2 });

  assert.deepEqual(rooms.requestRematch({ socketId: "x-player" }), {
    ok: true,
    code: "REM001",
    ready: false,
    requestedBy: "x-player",
  });

  const rematch = rooms.requestRematch({ socketId: "o-player" });
  assert.equal(rematch.ok, true);
  assert.equal(rematch.ready, true);
  assert.equal(rematch.code, "REM001");
  assert.deepEqual(rematch.players, [
    { socketId: "x-player", username: "Ben", player: "O", mark: "O" },
    { socketId: "o-player", username: "Alex", player: "X", mark: "X" },
  ]);
  assert.deepEqual(rematch.update, {
    board: [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ],
    currentPlayer: "X",
    winner: null,
    winningCells: [],
    movesPlayed: 0,
  });
  assert.equal(rematch.room.size, 3);
  assert.equal(rematch.room.winLength, 3);

  assert.deepEqual(rooms.makeMove({ socketId: "x-player", row: 0, col: 0 }), {
    ok: false,
    message: "Not your turn.",
  });
  assert.equal(rooms.makeMove({ socketId: "o-player", row: 0, col: 0 }).ok, true);
});

// -- Online view state --------------------------------------------------------

test("uses a dedicated online board view after game start", () => {
  assert.deepEqual(getOnlineVisibilityState("game"), {
    pageView: "online-game",
    lobbyHidden: true,
    gameHidden: false,
  });
});

test("returns to the online lobby view from the board view", () => {
  assert.deepEqual(getOnlineVisibilityState("lobby"), {
    pageView: "online-lobby",
    lobbyHidden: false,
    gameHidden: true,
  });
});

test("formats online room code for the game header", () => {
  assert.equal(formatOnlineRoomCode("abc123"), "Room ABC123");
  assert.equal(formatOnlineRoomCode(""), "Room");
});

test("ignores stale status flip callbacks after a newer status update", () => {
  const status = new FakeStatusElement();

  flipStatusMessage(status, "You win!", "win-x");
  flipStatusMessage(status, "Waiting for the other player to click Rematch...", "waiting");
  flipStatusMessage(status, "Your turn", "x");
  status.dispatchAnimationEnd();

  assert.equal(status.textContent, "Your turn");
  assert.equal(status.dataset.type, "x");
  assert.equal(status.classList.contains("flip-out"), false);
});

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

// ── Summary ───────────────────────────────────────────────────────────────────

await runTests();

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
