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
