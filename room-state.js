import { checkWinner, createEmptyBoard, isDraw, isValidSettings } from "./game-logic.js";

function defaultGenerateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function playerForIndex(index) {
  return index === 0 ? "X" : "O";
}

function buildUpdate(room) {
  return {
    board: room.board.map((row) => [...row]),
    currentPlayer: room.currentPlayer,
    winner: room.winner,
    winningCells: room.winningCells.map((cell) => [...cell]),
    movesPlayed: room.movesPlayed,
  };
}

export function createRoomStore({ generateCode = defaultGenerateCode } = {}) {
  const rooms = new Map();
  const socketRooms = new Map();

  function generateUniqueCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = normalizeCode(generateCode());
      if (code.length === 6 && !rooms.has(code)) {
        return code;
      }
    }
    throw new Error("Could not generate a unique room code.");
  }

  function createRoom({ socketId, size, winLength }) {
    const validation = isValidSettings(size, winLength);
    if (!validation.valid) {
      return { ok: false, message: validation.message };
    }

    const code = generateUniqueCode();
    const room = {
      code,
      players: [socketId],
      board: createEmptyBoard(size),
      currentPlayer: "X",
      winner: null,
      winningCells: [],
      movesPlayed: 0,
      size,
      winLength,
    };

    rooms.set(code, room);
    socketRooms.set(socketId, code);
    return { ok: true, code, room };
  }

  function joinRoom({ socketId, code }) {
    const room = rooms.get(normalizeCode(code));
    if (!room) {
      return { ok: false, message: "Room not found." };
    }

    if (room.players.includes(socketId)) {
      return { ok: false, message: "You are already in this room." };
    }

    if (room.players.length >= 2) {
      return { ok: false, message: "Room is full." };
    }

    room.players.push(socketId);
    socketRooms.set(socketId, room.code);

    return {
      ok: true,
      code: room.code,
      room,
      players: room.players.map((id, index) => ({
        socketId: id,
        player: playerForIndex(index),
      })),
    };
  }

  function makeMove({ socketId, row, col }) {
    const code = socketRooms.get(socketId);
    const room = rooms.get(code);

    if (!room) {
      return { ok: false, message: "Room not found." };
    }

    if (room.players.length < 2) {
      return { ok: false, message: "Waiting for opponent." };
    }

    if (room.winner) {
      return { ok: false, message: "Game is over." };
    }

    const playerIndex = room.players.indexOf(socketId);
    const playerMark = playerForIndex(playerIndex);

    if (playerIndex === -1) {
      return { ok: false, message: "Room not found." };
    }

    if (playerMark !== room.currentPlayer) {
      return { ok: false, message: "Not your turn." };
    }

    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= room.size ||
      col < 0 ||
      col >= room.size ||
      room.board[row][col] !== ""
    ) {
      return { ok: false, message: "Invalid move." };
    }

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

    return {
      ok: true,
      code: room.code,
      update: buildUpdate(room),
    };
  }

  function disconnect(socketId) {
    const code = socketRooms.get(socketId);
    const room = rooms.get(code);

    if (!room) {
      socketRooms.delete(socketId);
      return { ok: false };
    }

    const opponentSocketIds = room.players.filter((id) => id !== socketId);
    for (const playerSocketId of room.players) {
      socketRooms.delete(playerSocketId);
    }
    rooms.delete(code);

    return {
      ok: true,
      code,
      opponentSocketIds,
    };
  }

  return {
    createRoom,
    joinRoom,
    makeMove,
    disconnect,
  };
}
