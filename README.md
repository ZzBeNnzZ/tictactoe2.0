# Adjustable Tic Tac Toe

A simple browser-based tic tac toe game with configurable board size and win length.

## Features

- Play locally with two players: `X` and `O`
- Choose any board size of `3 x 3` or larger
- Choose the adjacent marks needed to win
- Detects wins horizontally, vertically, and diagonally
- Detects draw games
- Highlights the winning row
- Runs as a static web page with no build step

## How to Play

Open `index.html` in a web browser.

1. Enter a board size.
2. Enter the number of adjacent marks required to win.
3. Select `New Game`.
4. Players take turns placing `X` and `O`.

Example settings:

- Classic tic tac toe: board size `3`, adjacent marks `3`
- Larger game: board size `5`, adjacent marks `4`
- Gomoku-style game: board size `7`, adjacent marks `5`

## Validation Rules

- Board size must be at least `3`.
- Adjacent marks to win must be at least `3`.
- Adjacent marks to win cannot be greater than the board size.

## Project Files

- `index.html`: game page, form controls, status area, and board container
- `styles.css`: responsive layout and game styling
- `app.js`: game state, rendering, move handling, win detection, and draw detection
- `app.test.mjs`: automated tests for the core game logic
- `package.json`: test script and JavaScript module setting

## Run Tests

Node.js is required for the tests.

```bash
npm test
```

The app itself does not require Node.js or a development server. Node.js is only used to run the logic tests.
