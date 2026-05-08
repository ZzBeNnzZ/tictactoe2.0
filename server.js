import express from "express";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

import { createLeaderboardStore } from "./leaderboard-store.js";
import { createRoomStore } from "./room-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = createRoomStore();
const leaderboard = createLeaderboardStore();
await leaderboard.ensureSchema();

app.get("/api/leaderboard", async (req, res) => {
  const players = await leaderboard.getLeaderboard({ limit: 10 });
  res.json({ players });
});

app.get("/api/leaderboard/:username", async (req, res) => {
  const player = await leaderboard.getPlayer(req.params.username);
  res.json({ player });
});

app.use(express.static(join(__dirname, "public")));

io.on("connection", (socket) => {
  // Tracks sockets that sent leave-room so the follow-up disconnect event is ignored.
  let intentionalLeave = false;

  function emitGameStart(result) {
    for (const assignment of result.players) {
      io.to(assignment.socketId).emit("game-start", {
        code: result.code,
        player: assignment.player,
        size: result.room.size,
        winLength: result.room.winLength,
        board: result.room.board,
        players: result.players.map(({ username, mark }) => ({ username, mark })),
      });
    }
  }

  socket.on("create-room", ({ size, winLength, username, reconnectToken } = {}) => {
    const result = rooms.createRoom({
      socketId: socket.id,
      username,
      size,
      winLength,
      reconnectToken,
    });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);
    socket.emit("room-created", { code: result.code });
  });

  socket.on("join-room", ({ code, username, reconnectToken } = {}) => {
    const result = rooms.joinRoom({ socketId: socket.id, username, code, reconnectToken });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);
    emitGameStart(result);
  });

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

  socket.on("request-rematch", () => {
    const result = rooms.requestRematch({ socketId: socket.id });
    if (!result.ok) {
      socket.emit("rematch-error", { message: result.message });
      return;
    }

    if (!result.ready) {
      io.to(result.code).emit("rematch-requested", { requestedBy: result.requestedBy });
      return;
    }

    emitGameStart(result);
  });

  // Intentional leave — bypasses grace period and permanently removes the room.
  socket.on("leave-room", () => {
    intentionalLeave = true;
    const result = rooms.leaveRoom(socket.id);
    if (!result.ok) {
      return;
    }

    for (const opponentSocketId of result.opponentSocketIds) {
      io.to(opponentSocketId).emit("opponent-left-permanently");
    }
  });

  // Player attempting to rejoin after disconnect/refresh within the grace period.
  socket.on("rejoin-room", ({ code, token } = {}) => {
    const result = rooms.rejoinRoom({ socketId: socket.id, token, code });
    if (!result.ok) {
      socket.emit("rejoin-failed", { message: result.message });
      return;
    }

    socket.join(result.code);

    socket.emit("rejoin-success", {
      code: result.code,
      player: result.player.mark,
      size: result.room.size,
      winLength: result.room.winLength,
      board: result.room.board,
      players: result.players.map(({ username, mark }) => ({ username, mark })),
      update: result.update,
    });

    for (const opponentSocketId of result.opponentSocketIds) {
      io.to(opponentSocketId).emit("opponent-rejoined");
    }
  });

  socket.on("disconnect", () => {
    if (intentionalLeave) {
      return;
    }

    const result = rooms.disconnect(socket.id, (code, opponentSocketIds) => {
      for (const opponentSocketId of opponentSocketIds) {
        io.to(opponentSocketId).emit("opponent-left-permanently");
      }
    });

    if (!result.ok) {
      return;
    }

    for (const opponentSocketId of result.opponentSocketIds) {
      io.to(opponentSocketId).emit("opponent-disconnected", {
        canRejoin: result.canRejoin,
        graceSeconds: 30,
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
