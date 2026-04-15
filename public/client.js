const socket = io();

let myPlayer = null;
let gameState = null;
let gameSize = 10;

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

elOnlineSettings.addEventListener("submit", (event) => {
  event.preventDefault();
  const size = Number(elOnlineBoardSize.value);
  const winLength = Number(elOnlineWinLength.value);
  setLobbyStatus("", "");
  socket.emit("create-room", { size, winLength });
});

elJoinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = elJoinInput.value.trim().toUpperCase();
  if (!code) {
    return;
  }

  setLobbyStatus("", "");
  socket.emit("join-room", { code });
});

elBtnLeave.addEventListener("click", () => {
  socket.disconnect();
  socket.connect();
  showLobby();
});

socket.on("room-created", ({ code }) => {
  elRoomCode.textContent = code;
  elRoomCreated.hidden = false;
  setLobbyStatus("Waiting for opponent...", "waiting");
});

socket.on("room-error", ({ message }) => {
  setLobbyStatus(message, "error");
});

socket.on("game-start", ({ player, size, board }) => {
  myPlayer = player;
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
    return;
  }

  if (update.winner) {
    const youWon = update.winner === myPlayer;
    setOnlineStatus(youWon ? "You win!" : `Player ${update.winner} wins`, `win-${update.winner.toLowerCase()}`);
    return;
  }

  const yourTurn = update.currentPlayer === myPlayer;
  setOnlineStatus(yourTurn ? "Your turn" : `Player ${update.currentPlayer}'s turn`, update.currentPlayer.toLowerCase());
});

socket.on("opponent-disconnected", () => {
  setOnlineStatus("Opponent disconnected", "draw");
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

  socket.emit("make-move", { row, col });
}

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
