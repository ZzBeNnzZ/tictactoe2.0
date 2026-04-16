import { getCurrentUsername } from "./identity.js";
import {
  getLocalRows,
  readLocalStats,
  recordLocalDraw,
  recordLocalWin,
  writeLocalStats,
} from "./local-stats.js";
import { normalizeUsername } from "./username.js";

export const game = {
  size: 10,
  winLength: 5,
  board: [],
  currentPlayer: "X",
  winner: null,
  winningCells: [],
  movesPlayed: 0,
};

export const scores = { X: 0, O: 0 };

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
      scoreboard: document.querySelector(".scoreboard"),
      turnIndicator: document.querySelector("#turn-indicator"),
      localPlayerXName: document.querySelector("#local-player-x-name"),
      localPlayerOName: document.querySelector("#local-player-o-name"),
      localStatsList: document.querySelector("#local-stats-list"),
    };

function flipStatus(el, message, type) {
  if (!message) {
    el.textContent = "";
    el.dataset.type = "";
    return;
  }
  if (el.textContent && !el.classList.contains("flip-out")) {
    el.classList.remove("flip-in");
    el.classList.add("flip-out");
    el.addEventListener("animationend", () => {
      el.textContent = message;
      el.dataset.type = type || "";
      el.classList.remove("flip-out");
      el.classList.add("flip-in");
      el.addEventListener("animationend", () => el.classList.remove("flip-in"), { once: true });
    }, { once: true });
  } else {
    el.classList.remove("flip-out");
    el.textContent = message;
    el.dataset.type = type || "";
    el.classList.add("flip-in");
    el.addEventListener("animationend", () => el.classList.remove("flip-in"), { once: true });
  }
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

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
}

export function isValidSettings(size, winLength) {
  if (!Number.isInteger(size) || size < 3) {
    return {
      valid: false,
      message: "Board size must be at least 3.",
    };
  }

  if (!Number.isInteger(winLength) || winLength < 3) {
    return {
      valid: false,
      message: "Win length must be at least 3.",
    };
  }

  if (winLength > size) {
    return {
      valid: false,
      message: "Win length cannot be greater than board size.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

export function placeMark(board, row, col, player, gameOver) {
  if (gameOver || board[row][col] !== "") {
    return false;
  }

  board[row][col] = player;
  return true;
}

export function countDirection(board, row, col, rowStep, colStep) {
  const player = board[row][col];
  const cells = [];
  let nextRow = row + rowStep;
  let nextCol = col + colStep;

  while (
    nextRow >= 0 &&
    nextRow < board.length &&
    nextCol >= 0 &&
    nextCol < board.length &&
    board[nextRow][nextCol] === player
  ) {
    cells.push([nextRow, nextCol]);
    nextRow += rowStep;
    nextCol += colStep;
  }

  return {
    count: cells.length,
    cells,
  };
}

export function checkWinner(board, row, col, winLength) {
  if (!board[row] || !board[row][col]) {
    return {
      won: false,
      cells: [],
    };
  }

  for (const [forward, backward] of directionPairs) {
    const forwardRun = countDirection(board, row, col, forward[0], forward[1]);
    const backwardRun = countDirection(board, row, col, backward[0], backward[1]);
    const cells = [[row, col], ...forwardRun.cells, ...backwardRun.cells];

    if (1 + forwardRun.count + backwardRun.count >= winLength) {
      return {
        won: true,
        cells: cells.slice(0, winLength),
      };
    }
  }

  return {
    won: false,
    cells: [],
  };
}

export function isDraw(board, movesPlayed) {
  return movesPlayed === board.length * board.length;
}

export function startGame(size, winLength) {
  const validation = isValidSettings(size, winLength);

  if (!validation.valid) {
    setStatus(validation.message, "error");
    return false;
  }

  game.size = size;
  game.winLength = winLength;
  game.board = createEmptyBoard(size);
  game.currentPlayer = "X";
  game.winner = null;
  game.winningCells = [];
  game.movesPlayed = 0;

  buildBoard();
  renderBoard();
  setStatus(`Player X's turn`, "x");
  updateScoreDisplay();
  return true;
}

function buildBoard() {
  elements.board.innerHTML = "";
  elements.board.style.gridTemplateColumns = `repeat(${game.size}, 1fr)`;

  // Scale font size to fit cells — set once per game, not per move
  const boardPx = Math.min(window.innerWidth * 0.96, 600);
  const cellPx = Math.floor(boardPx / game.size);
  elements.board.style.fontSize = `${Math.max(10, Math.floor(cellPx * 0.55))}px`;

  for (let row = 0; row < game.size; row += 1) {
    for (let col = 0; col < game.size; col += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}`);
      cell.addEventListener("click", () => handleCellClick(row, col));
      elements.board.append(cell);
    }
  }
}

export function renderBoard() {
  if (!elements) {
    return;
  }

  const boardClosed = Boolean(game.winner) || isDraw(game.board, game.movesPlayed);

  elements.board.dataset.currentPlayer = game.currentPlayer;

  for (let row = 0; row < game.size; row += 1) {
    for (let col = 0; col < game.size; col += 1) {
      const mark = game.board[row][col];
      const cell = elements.board.children[row * game.size + col];

      cell.textContent = mark;
      cell.disabled = boardClosed || mark !== "";
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}${mark ? `, ${mark}` : ""}`);

      if (mark) {
        cell.dataset.mark = mark;
      } else {
        delete cell.dataset.mark;
      }

      if (isWinningCell(row, col)) {
        cell.classList.add("winning");
      } else {
        cell.classList.remove("winning");
      }
    }
  }
}

export function handleCellClick(row, col) {
  const gameOver = Boolean(game.winner) || isDraw(game.board, game.movesPlayed);

  if (!placeMark(game.board, row, col, game.currentPlayer, gameOver)) {
    return false;
  }

  const clickedCell = elements ? elements.board.children[row * game.size + col] : null;
  if (clickedCell) triggerRipple(clickedCell, game.currentPlayer);

  game.movesPlayed += 1;
  const result = checkWinner(game.board, row, col, game.winLength);

  if (result.won) {
    game.winner = game.currentPlayer;
    game.winningCells = result.cells;
    scores[game.currentPlayer] += 1;
    setStatus(`Player ${game.currentPlayer} wins!`, `win-${game.currentPlayer.toLowerCase()}`);
    renderBoard();
    updateScoreDisplay();
    if (elements) triggerConfetti(elements.board);
    recordLocalResult("win", game.currentPlayer);
    return true;
  }

  if (isDraw(game.board, game.movesPlayed)) {
    setStatus("Draw game", "draw");
    renderBoard();
    recordLocalResult("draw");
    return true;
  }

  game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
  setStatus(`Player ${game.currentPlayer}'s turn`, game.currentPlayer.toLowerCase());
  renderBoard();
  updateScoreDisplay();
  return true;
}

export function setStatus(message, type = "") {
  if (elements) {
    flipStatus(elements.status, message, type);
  }
}

function updateScoreDisplay() {
  if (!elements) return;

  elements.scoreX.textContent = scores.X;
  elements.scoreO.textContent = scores.O;

  const xActive = game.currentPlayer === "X" && !game.winner;
  const oActive = game.currentPlayer === "O" && !game.winner;
  elements.scoreCardX.classList.toggle("active-turn", xActive);
  elements.scoreCardO.classList.toggle("active-turn", oActive);

  if (elements.turnIndicator && elements.scoreboard) {
    const activeCard = xActive ? elements.scoreCardX : (oActive ? elements.scoreCardO : null);
    if (activeCard) {
      const boardRect = elements.scoreboard.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();
      elements.turnIndicator.style.left = `${cardRect.left - boardRect.left}px`;
      elements.turnIndicator.style.width = `${cardRect.width}px`;
      elements.turnIndicator.style.backgroundColor = xActive ? "var(--x-color)" : "var(--o-color)";
    }
  }
}

function getLocalPlayerNames() {
  return {
    X: normalizeUsername(elements.localPlayerXName.value) || "Player X",
    O: normalizeUsername(elements.localPlayerOName.value) || "Player O",
  };
}

function recordLocalResult(type, winnerMark = "") {
  const stats = readLocalStats();
  const names = getLocalPlayerNames();

  if (type === "draw") {
    recordLocalDraw(stats, names.X, names.O);
  } else {
    const loserMark = winnerMark === "X" ? "O" : "X";
    recordLocalWin(stats, names[winnerMark], names[loserMark]);
  }

  writeLocalStats(stats);
  renderLocalStats();
}

function renderLocalStats() {
  if (!elements || !elements.localStatsList) return;

  const rows = getLocalRows(readLocalStats()).slice(0, 10);
  if (rows.length === 0) {
    elements.localStatsList.innerHTML = `<p class="leaderboard-empty">No local games yet.</p>`;
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  elements.localStatsList.innerHTML = rows
    .map(
      (row, index) => {
        const rank = index < 3 ? medals[index] : `${index + 1}`;
        return `
        <div class="leaderboard-row" style="--i: ${index}">
          <span class="leaderboard-rank">${rank}</span>
          <span class="leaderboard-username">${row.username}</span>
          <span class="leaderboard-stats">
            <span class="leaderboard-stat-w">${row.wins}W</span>
            <span class="leaderboard-stat-l">${row.losses}L</span>
            <span class="leaderboard-stat-d">${row.draws}D</span>
          </span>
        </div>
      `;
      },
    )
    .join("");
}

function isWinningCell(row, col) {
  return game.winningCells.some(([winRow, winCol]) => winRow === row && winCol === col);
}

if (elements) {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame(Number(elements.sizeInput.value), Number(elements.winInput.value));
  });

  elements.localPlayerXName.value = getCurrentUsername();
  window.addEventListener("ttt:username-change", (event) => {
    if (!elements.localPlayerXName.value) {
      elements.localPlayerXName.value = event.detail.username;
    }
  });
  renderLocalStats();
  startGame(Number(elements.sizeInput.value), Number(elements.winInput.value));
}
