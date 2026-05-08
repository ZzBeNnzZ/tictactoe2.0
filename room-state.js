import { checkWinner, createEmptyBoard, isDraw, isValidSettings } from "./game-logic.js";
import { validateUsername } from "./public/username.js";

const GRACE_PERIOD_MS = 30_000;

function defaultGenerateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function playerForIndex(index) {
  return index === 0 ? "X" : "O";
}

function playerToAssignment(player, index) {
  const mark = player.mark || playerForIndex(index);
  return {
    socketId: player.socketId,
    username: player.username,
    player: mark,
    mark,
  };
}

function assignRandomMarks(room, random) {
  const xPlayerIndex = random() < 0.5 ? 0 : 1;

  room.players.forEach((player, index) => {
    player.mark = index === xPlayerIndex ? "X" : "O";
  });
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

export function createRoomStore({ generateCode = defaultGenerateCode, random = Math.random } = {}) {
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

  function createRoom({ socketId, username, size, winLength, reconnectToken }) {
    const validation = isValidSettings(size, winLength);
    if (!validation.valid) {
      return { ok: false, message: validation.message };
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return { ok: false, message: usernameValidation.message };
    }

    const code = generateUniqueCode();
    const room = {
      code,
      players: [
        {
          socketId,
          username: usernameValidation.username,
          mark: "X",
          reconnectToken: reconnectToken || null,
        },
      ],
      board: createEmptyBoard(size),
      currentPlayer: "X",
      winner: null,
      winningCells: [],
      movesPlayed: 0,
      size,
      winLength,
      rematchRequests: new Set(),
      disconnectedPlayers: new Map(),
    };

    rooms.set(code, room);
    socketRooms.set(socketId, code);
    return { ok: true, code, room };
  }

  function joinRoom({ socketId, username, code, reconnectToken }) {
    const room = rooms.get(normalizeCode(code));
    if (!room) {
      return { ok: false, message: "Room not found." };
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return { ok: false, message: usernameValidation.message };
    }

    if (room.players.some((player) => player.socketId === socketId)) {
      return { ok: false, message: "You are already in this room." };
    }

    if (room.players.length >= 2) {
      return { ok: false, message: "Room is full." };
    }

    room.players.push({
      socketId,
      username: usernameValidation.username,
      mark: playerForIndex(room.players.length),
      reconnectToken: reconnectToken || null,
    });
    assignRandomMarks(room, random);
    socketRooms.set(socketId, room.code);

    return {
      ok: true,
      code: room.code,
      room,
      players: room.players.map(playerToAssignment),
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

    const playerIndex = room.players.findIndex((player) => player.socketId === socketId);
    const roomPlayer = room.players[playerIndex];
    const playerMark = roomPlayer?.mark || playerForIndex(playerIndex);

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
      gameResult: room.winner ? buildGameResult(room) : null,
    };
  }

  function requestRematch({ socketId }) {
    const code = socketRooms.get(socketId);
    const room = rooms.get(code);

    if (!room || !room.players.some((player) => player.socketId === socketId)) {
      return { ok: false, message: "Room not found." };
    }

    if (room.players.length < 2) {
      return { ok: false, message: "Waiting for opponent." };
    }

    if (!room.winner) {
      return { ok: false, message: "Game is not over." };
    }

    room.rematchRequests.add(socketId);

    if (room.rematchRequests.size < 2) {
      return {
        ok: true,
        code: room.code,
        ready: false,
        requestedBy: socketId,
      };
    }

    assignRandomMarks(room, random);
    room.board = createEmptyBoard(room.size);
    room.currentPlayer = "X";
    room.winner = null;
    room.winningCells = [];
    room.movesPlayed = 0;
    room.rematchRequests.clear();

    return {
      ok: true,
      code: room.code,
      ready: true,
      requestedBy: socketId,
      room,
      players: room.players.map(playerToAssignment),
      update: buildUpdate(room),
    };
  }

  // Graceful disconnect: keeps room alive for GRACE_PERIOD_MS so player can rejoin.
  // onExpire(code, opponentSocketIds) fires if they don't return in time.
  function disconnect(socketId, onExpire) {
    const code = socketRooms.get(socketId);
    const room = rooms.get(code);

    if (!room) {
      socketRooms.delete(socketId);
      return { ok: false };
    }

    const playerIndex = room.players.findIndex((p) => p.socketId === socketId);
    if (playerIndex === -1) {
      socketRooms.delete(socketId);
      return { ok: false };
    }

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    socketRooms.delete(socketId);

    const opponentSocketIds = room.players.map((p) => p.socketId);

    if (player.reconnectToken) {
      const timer = setTimeout(() => {
        room.disconnectedPlayers.delete(player.reconnectToken);
        if (room.players.length === 0 && room.disconnectedPlayers.size === 0) {
          rooms.delete(code);
        }
        if (onExpire) onExpire(code, opponentSocketIds);
      }, GRACE_PERIOD_MS);

      room.disconnectedPlayers.set(player.reconnectToken, { ...player, timer });
    } else {
      if (room.players.length === 0 && room.disconnectedPlayers.size === 0) {
        rooms.delete(code);
      }
    }

    return {
      ok: true,
      code,
      opponentSocketIds,
      canRejoin: Boolean(player.reconnectToken),
    };
  }

  // Immediate room deletion — used when a player intentionally clicks Leave.
  function leaveRoom(socketId) {
    const code = socketRooms.get(socketId);
    const room = rooms.get(code);

    if (!room) {
      socketRooms.delete(socketId);
      return { ok: false };
    }

    const opponentSocketIds = room.players
      .filter((p) => p.socketId !== socketId)
      .map((p) => p.socketId);

    for (const [, dp] of room.disconnectedPlayers) {
      clearTimeout(dp.timer);
    }
    for (const player of room.players) {
      socketRooms.delete(player.socketId);
    }
    rooms.delete(code);

    return { ok: true, code, opponentSocketIds };
  }

  function rejoinRoom({ socketId, token, code }) {
    const normalizedCode = normalizeCode(code);
    const room = rooms.get(normalizedCode);

    if (!room) {
      return { ok: false, message: "Room not found or has expired." };
    }

    const disconnected = room.disconnectedPlayers.get(token);
    if (!disconnected) {
      return { ok: false, message: "Rejoin token is invalid or has expired." };
    }

    clearTimeout(disconnected.timer);
    room.disconnectedPlayers.delete(token);

    const player = {
      socketId,
      username: disconnected.username,
      mark: disconnected.mark,
      reconnectToken: token,
    };
    room.players.push(player);
    socketRooms.set(socketId, normalizedCode);

    const opponentSocketIds = room.players
      .filter((p) => p.socketId !== socketId)
      .map((p) => p.socketId);

    return {
      ok: true,
      code: normalizedCode,
      room,
      player,
      players: room.players.map(playerToAssignment),
      opponentSocketIds,
      update: buildUpdate(room),
    };
  }

  return {
    createRoom,
    joinRoom,
    makeMove,
    requestRematch,
    disconnect,
    leaveRoom,
    rejoinRoom,
  };
}
