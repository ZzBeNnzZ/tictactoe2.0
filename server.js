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
  socket.on("create-room", ({ size, winLength, username } = {}) => {
    const result = rooms.createRoom({
      socketId: socket.id,
      username,
      size,
      winLength,
    });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);
    socket.emit("room-created", { code: result.code });
  });

  socket.on("join-room", ({ code, username } = {}) => {
    const result = rooms.joinRoom({ socketId: socket.id, username, code });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);

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

  socket.on("disconnect", () => {
    const result = rooms.disconnect(socket.id);
    if (!result.ok) {
      return;
    }

    for (const opponentSocketId of result.opponentSocketIds) {
      io.to(opponentSocketId).emit("opponent-disconnected");
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
