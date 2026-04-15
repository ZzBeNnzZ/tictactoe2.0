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
    };

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

  game.movesPlayed += 1;
  const result = checkWinner(game.board, row, col, game.winLength);

  if (result.won) {
    game.winner = game.currentPlayer;
    game.winningCells = result.cells;
    scores[game.currentPlayer] += 1;
    setStatus(`Player ${game.currentPlayer} wins!`, `win-${game.currentPlayer.toLowerCase()}`);
    renderBoard();
    updateScoreDisplay();
    return true;
  }

  if (isDraw(game.board, game.movesPlayed)) {
    setStatus("Draw game", "draw");
    renderBoard();
    return true;
  }

  game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
  setStatus(`Player ${game.currentPlayer}'s turn`, game.currentPlayer.toLowerCase());
  renderBoard();
  return true;
}

export function setStatus(message, type = "") {
  if (elements) {
    elements.status.textContent = message;
    elements.status.dataset.type = type;
  }
}

function updateScoreDisplay() {
  if (!elements) return;

  elements.scoreX.textContent = scores.X;
  elements.scoreO.textContent = scores.O;

  elements.scoreCardX.classList.toggle("active-turn", game.currentPlayer === "X" && !game.winner);
  elements.scoreCardO.classList.toggle("active-turn", game.currentPlayer === "O" && !game.winner);
}

function isWinningCell(row, col) {
  return game.winningCells.some(([winRow, winCol]) => winRow === row && winCol === col);
}

if (elements) {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame(Number(elements.sizeInput.value), Number(elements.winInput.value));
  });

  startGame(Number(elements.sizeInput.value), Number(elements.winInput.value));
}
