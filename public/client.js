import { getCurrentUsername, initIdentity } from "./identity.js";
import {
  flipStatusMessage,
  formatOnlineRoomCode,
  getOnlineVisibilityState,
} from "./online-view.js";

const socket = io();

let myPlayer = null;
let gameState = null;
let gameSize = 10;
let currentRoomCode = "";

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
const elOnlineRoomCode = document.querySelector("#online-room-code");
const elBtnLeave = document.querySelector("#btn-leave");
const elRematchActions = document.querySelector("#online-rematch-actions");
const elBtnRematch = document.querySelector("#btn-rematch");
const elOnlineLeaderboard = document.querySelector("#online-leaderboard-list");
const elRefreshLeaderboard = document.querySelector("#btn-refresh-leaderboard");
const elBtnLobbyCreate = document.querySelector("#btn-lobby-create");
const elBtnLobbyJoin = document.querySelector("#btn-lobby-join");
const elLobbyCreatePanel = document.querySelector("#lobby-create-panel");
const elLobbyJoinPanel = document.querySelector("#lobby-join-panel");

initIdentity();
loadOnlineLeaderboard();

// --- Animation helpers ---

function slideInPanel(el, direction) {
  el.hidden = false;
  const cls = direction === "right" ? "slide-in-right" : "slide-in-left";
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function fadeHidePanel(el, onDone) {
  if (el.hidden) {
    if (onDone) onDone();
    return;
  }
  el.classList.add("fade-out-quick");
  el.addEventListener("animationend", () => {
    el.classList.remove("fade-out-quick");
    el.hidden = true;
    if (onDone) onDone();
  }, { once: true });
}

function triggerRipple(cell, player) {
  const ripple = document.createElement("span");
  ripple.className = "cell-ripple";
  ripple.style.setProperty("--ripple-color", player === "X" ? "var(--x-color)" : "var(--o-color)");
  cell.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

function triggerConfetti(boardEl) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const rect = boardEl.getBoundingClientRect();
  const container = document.createElement("div");
  container.className = "confetti-container";
  container.style.top = `${rect.top}px`;
  container.style.left = `${rect.left}px`;
  container.style.width = `${rect.width}px`;
  container.style.height = `${rect.height}px`;
  container.style.setProperty("--fall-dist", `${rect.height + 20}px`);

  const colors = ["var(--x-color)", "var(--o-color)", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#C084FC"];

  for (let i = 0; i < 90; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${Math.random() * 100}%`);
    piece.style.setProperty("--size", `${4 + Math.random() * 7}px`);
    piece.style.setProperty("--color", colors[Math.floor(Math.random() * colors.length)]);
    piece.style.setProperty("--rotation", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
    piece.style.setProperty("--duration", `${0.7 + Math.random() * 0.8}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.5}s`);
    container.append(piece);
  }

  document.body.append(container);
  setTimeout(() => container.remove(), 1600);
}

elBtnLocal.addEventListener("click", () => {
  if (!elLocalMode.hidden) return;
  elBtnLocal.classList.add("active");
  elBtnOnline.classList.remove("active");
  document.body.dataset.view = "local";
  fadeHidePanel(elOnlineMode, () => slideInPanel(elLocalMode, "left"));
});

elBtnOnline.addEventListener("click", () => {
  if (!elOnlineMode.hidden) return;
  elBtnOnline.classList.add("active");
  elBtnLocal.classList.remove("active");
  fadeHidePanel(elLocalMode, () => {
    applyOnlineView("lobby");
    slideInPanel(elOnlineMode, "right");
  });
});

elOnlineSettings.addEventListener("submit", (event) => {
  event.preventDefault();
  const size = Number(elOnlineBoardSize.value);
  const winLength = Number(elOnlineWinLength.value);
  const username = getCurrentUsername();
  if (!username) {
    setLobbyStatus("Enter a name before creating a room.", "error");
    return;
  }

  setLobbyStatus("", "");
  socket.emit("create-room", { size, winLength, username });
});

elJoinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = elJoinInput.value.trim().toUpperCase();
  if (!code) {
    return;
  }

  const username = getCurrentUsername();
  if (!username) {
    setLobbyStatus("Enter a name before joining a room.", "error");
    return;
  }

  setLobbyStatus("", "");
  socket.emit("join-room", { code, username });
});

elBtnLeave.addEventListener("click", () => {
  socket.disconnect();
  socket.connect();
  showLobby();
});

elBtnRematch.addEventListener("click", () => {
  if (!gameState || !gameState.winner) {
    return;
  }

  elBtnRematch.disabled = true;
  setOnlineStatus("Waiting for the other player to click Rematch...", "waiting");
  socket.emit("request-rematch");
});

elRefreshLeaderboard.addEventListener("click", () => {
  loadOnlineLeaderboard();
});

elBtnLobbyCreate.addEventListener("click", () => {
  if (!elLobbyCreatePanel.hidden) return;
  elBtnLobbyCreate.classList.add("active");
  elBtnLobbyJoin.classList.remove("active");
  setLobbyStatus("", "");
  if (!elLobbyJoinPanel.hidden) {
    fadeHidePanel(elLobbyJoinPanel, () => slideInPanel(elLobbyCreatePanel, "left"));
  } else {
    slideInPanel(elLobbyCreatePanel, "left");
  }
});

elBtnLobbyJoin.addEventListener("click", () => {
  if (!elLobbyJoinPanel.hidden) return;
  elBtnLobbyJoin.classList.add("active");
  elBtnLobbyCreate.classList.remove("active");
  setLobbyStatus("", "");
  if (!elLobbyCreatePanel.hidden) {
    fadeHidePanel(elLobbyCreatePanel, () => slideInPanel(elLobbyJoinPanel, "right"));
  } else {
    slideInPanel(elLobbyJoinPanel, "right");
  }
});

window.addEventListener("ttt:username-change", () => {
  loadOnlineLeaderboard();
});

socket.on("room-created", ({ code }) => {
  currentRoomCode = code;
  elRoomCode.textContent = code;
  elRoomCreated.hidden = false;
  setLobbyStatus("Waiting for opponent...", "waiting");
});

socket.on("room-error", ({ message }) => {
  setLobbyStatus(message, "error");
});

socket.on("game-start", ({ player, size, board, code }) => {
  myPlayer = player;
  currentRoomCode = code || currentRoomCode;
  gameSize = size;
  gameState = {
    board,
    currentPlayer: "X",
    winner: null,
    winningCells: [],
    movesPlayed: 0,
  };

  elPlayerBadge.className = `online-player-badge badge-${player.toLowerCase()}`;
  elPlayerBadge.innerHTML = `You are <strong>${player}</strong>`;
  elOnlineRoomCode.textContent = formatOnlineRoomCode(currentRoomCode);

  hideRematchControls();
  showGame();
  buildOnlineBoard(size);
  renderOnlineBoard();
  setOnlineStatus(player === "X" ? "Your turn" : "Player X's turn", "x");
});

socket.on("game-update", (update) => {
  gameState = update;
  renderOnlineBoard();

  if (update.winner === "draw") {
    setOnlineStatus("Draw game", "draw");
    showRematchControls();
    loadOnlineLeaderboard();
    return;
  }

  if (update.winner) {
    const youWon = update.winner === myPlayer;
    setOnlineStatus(youWon ? "You win!" : `Player ${update.winner} wins`, `win-${update.winner.toLowerCase()}`);
    showRematchControls();
    triggerConfetti(elOnlineBoard);
    loadOnlineLeaderboard();
    return;
  }

  const yourTurn = update.currentPlayer === myPlayer;
  setOnlineStatus(yourTurn ? "Your turn" : `Player ${update.currentPlayer}'s turn`, update.currentPlayer.toLowerCase());
});

socket.on("rematch-requested", ({ requestedBy } = {}) => {
  showRematchControls();

  if (requestedBy === socket.id) {
    elBtnRematch.disabled = true;
    setOnlineStatus("Waiting for the other player to click Rematch...", "waiting");
    return;
  }

  elBtnRematch.disabled = false;
  setOnlineStatus("Opponent wants a rematch. Click Rematch to start again.", "waiting");
});

socket.on("rematch-error", ({ message }) => {
  if (gameState && gameState.winner) {
    elBtnRematch.disabled = false;
  }
  setOnlineStatus(message, "error");
});

socket.on("opponent-disconnected", () => {
  setOnlineStatus("Opponent disconnected", "draw");
  hideRematchControls();
  for (const cell of elOnlineBoard.querySelectorAll(".cell")) {
    cell.disabled = true;
  }
});

function buildOnlineBoard(size) {
  elOnlineBoard.innerHTML = "";
  elOnlineBoard.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  const boardPx = Math.min(window.innerWidth * 0.96, 600);
  const cellPx = Math.floor(boardPx / size);
  elOnlineBoard.style.fontSize = `${Math.max(10, Math.floor(cellPx * 0.55))}px`;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
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
  if (!gameState) {
    return;
  }

  const { board, currentPlayer, winner, winningCells } = gameState;
  const boardClosed = Boolean(winner);
  const myTurn = currentPlayer === myPlayer && !boardClosed;

  elOnlineBoard.dataset.currentPlayer = myTurn ? myPlayer : "";

  for (let row = 0; row < gameSize; row += 1) {
    for (let col = 0; col < gameSize; col += 1) {
      const mark = board[row][col];
      const cell = elOnlineBoard.children[row * gameSize + col];

      cell.textContent = mark;
      cell.disabled = boardClosed || mark !== "" || !myTurn;
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}${mark ? `, ${mark}` : ""}`);

      if (mark) {
        cell.dataset.mark = mark;
      } else {
        delete cell.dataset.mark;
      }

      const isWinning = winningCells.some(([winRow, winCol]) => winRow === row && winCol === col);
      cell.classList.toggle("winning", isWinning);
    }
  }
}

function handleOnlineCellClick(row, col) {
  if (!gameState || gameState.winner) {
    return;
  }

  if (gameState.currentPlayer !== myPlayer || gameState.board[row][col] !== "") {
    return;
  }

  const cell = elOnlineBoard.children[row * gameSize + col];
  if (cell) triggerRipple(cell, myPlayer);

  socket.emit("make-move", { row, col });
}

function showLobby() {
  elRoomCreated.hidden = true;
  elJoinInput.value = "";
  setLobbyStatus("", "");
  myPlayer = null;
  gameState = null;
  currentRoomCode = "";
  elOnlineRoomCode.textContent = "";
  hideRematchControls();
  elBtnLobbyCreate.classList.remove("active");
  elBtnLobbyJoin.classList.remove("active");
  elLobbyCreatePanel.hidden = true;
  elLobbyJoinPanel.hidden = true;

  fadeHidePanel(elOnlineGame, () => {
    document.body.dataset.view = "online-lobby";
    elLobby.hidden = false;
    void elLobby.offsetWidth;
    elLobby.classList.add("slide-in-left");
    elLobby.addEventListener("animationend", () => elLobby.classList.remove("slide-in-left"), { once: true });
  });
}

function showGame() {
  fadeHidePanel(elLobby, () => {
    document.body.dataset.view = "online-game";
    elOnlineGame.hidden = false;
    void elOnlineGame.offsetWidth;
    elOnlineGame.classList.add("slide-in-right");
    elOnlineGame.addEventListener("animationend", () => elOnlineGame.classList.remove("slide-in-right"), { once: true });
  });
}

function applyOnlineView(view) {
  const state = getOnlineVisibilityState(view);
  document.body.dataset.view = state.pageView;
  elLobby.hidden = state.lobbyHidden;
  elOnlineGame.hidden = state.gameHidden;
}

function setLobbyStatus(message, type) {
  flipStatusMessage(elLobbyStatus, message, type, { autoHide: true });
}

function setOnlineStatus(message, type) {
  flipStatusMessage(elOnlineStatus, message, type);
}

function showRematchControls() {
  elRematchActions.hidden = false;
  elBtnRematch.disabled = false;
}

function hideRematchControls() {
  elRematchActions.hidden = true;
  elBtnRematch.disabled = false;
}

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

  const medals = ["🥇", "🥈", "🥉"];
  const me = getCurrentUsername();

  elOnlineLeaderboard.innerHTML = players
    .map((player, index) => {
      const rank = index < 3 ? medals[index] : `${index + 1}`;
      const isMe = me && player.username === me;
      return `
        <div class="leaderboard-row${isMe ? " leaderboard-row--me" : ""}" style="--i: ${index}">
          <span class="leaderboard-rank">${rank}</span>
          <span class="leaderboard-username">${player.username}</span>
          <span class="leaderboard-stats">
            <span class="leaderboard-stat-w">${player.wins}W</span>
            <span class="leaderboard-stat-l">${player.losses}L</span>
            <span class="leaderboard-stat-d">${player.draws}D</span>
          </span>
        </div>
      `;
    })
    .join("");
}
