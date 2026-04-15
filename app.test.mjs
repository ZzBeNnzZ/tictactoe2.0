import assert from "assert";

import {
  checkWinner,
  createEmptyBoard,
  isDraw,
  isValidSettings,
  placeMark,
} from "./game-logic.js";
import { createRoomStore } from "./room-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
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
  const rooms = createRoomStore({ generateCode: () => "abc123" });

  const created = rooms.createRoom({ socketId: "socket-a", size: 3, winLength: 3 });
  assert.equal(created.ok, true);
  assert.equal(created.code, "ABC123");

  const joined = rooms.joinRoom({ socketId: "socket-b", code: "abc123" });
  assert.equal(joined.ok, true);
  assert.deepEqual(joined.players, [
    { socketId: "socket-a", player: "X" },
    { socketId: "socket-b", player: "O" },
  ]);
  assert.equal(joined.room.board.length, 3);

  assert.deepEqual(rooms.joinRoom({ socketId: "socket-c", code: "ABC123" }), {
    ok: false,
    message: "Room is full.",
  });
});

test("validates turns and returns winner updates after online moves", () => {
  const rooms = createRoomStore({ generateCode: () => "WIN001" });
  rooms.createRoom({ socketId: "x-player", size: 3, winLength: 3 });
  rooms.joinRoom({ socketId: "o-player", code: "WIN001" });

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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
