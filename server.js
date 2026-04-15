import express from "express";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

import { createRoomStore } from "./room-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = createRoomStore();

app.use(express.static(join(__dirname, "public")));

io.on("connection", (socket) => {
  socket.on("create-room", ({ size, winLength } = {}) => {
    const result = rooms.createRoom({ socketId: socket.id, size, winLength });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);
    socket.emit("room-created", { code: result.code });
  });

  socket.on("join-room", ({ code } = {}) => {
    const result = rooms.joinRoom({ socketId: socket.id, code });
    if (!result.ok) {
      socket.emit("room-error", { message: result.message });
      return;
    }

    socket.join(result.code);

    for (const assignment of result.players) {
      io.to(assignment.socketId).emit("game-start", {
        player: assignment.player,
        size: result.room.size,
        winLength: result.room.winLength,
        board: result.room.board,
      });
    }
  });

  socket.on("make-move", ({ row, col } = {}) => {
    const result = rooms.makeMove({ socketId: socket.id, row, col });
    if (result.ok) {
      io.to(result.code).emit("game-update", result.update);
    }
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
