# Adjustable Tic Tac Toe

A browser-based tic tac toe game with configurable board size, configurable win length, local play, and real-time online multiplayer rooms.

## Features

- Local two-player game on one device
- Online two-player game through 6-character room codes
- Remembered public username for online play
- Browser-only local stats
- Online leaderboard backed by Postgres when `DATABASE_URL` is set
- Configurable board size of `3 x 3` or larger
- Configurable adjacent marks needed to win
- Server-validated online moves
- Win detection horizontally, vertically, and diagonally
- Draw detection
- Winning-cell highlights
- Socket.io realtime updates

## Requirements

- Node.js `18` or newer
- npm

## Install

```bash
npm install
```

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Play Local Mode

1. Open the app.
2. Select `Local`.
3. Enter a board size.
4. Enter the number of adjacent marks required to win.
5. Select `New Game`.
6. Players take turns placing `X` and `O`.

Example settings:

- Classic tic tac toe: board size `3`, adjacent marks `3`
- Larger game: board size `5`, adjacent marks `4`
- Gomoku-style game: board size `10`, adjacent marks `5`

## Play Online Mode

1. Player 1 opens the app.
2. Enter a player name.
3. Select `Online`.
4. Select `Create Room`.
5. Share the 6-character room code with Player 2.
6. Player 2 opens the same app URL.
7. Enter a player name.
8. Select `Online`.
9. Enter the room code and select `Join`.
10. Player 1 is `X`; Player 2 is `O`.

Only the current player's browser can make a move. The server validates moves and broadcasts the updated board to both players.

## Username Login

The app uses a simple public username. There is no password. The browser stores the username in a long-lived cookie named `ttt_username`.

## Leaderboards

- Local stats are stored in this browser only.
- Online leaderboard results are stored by the server in Postgres.
- Same username means same online leaderboard player.
- If `DATABASE_URL` is not set, the server uses an in-memory leaderboard for local development.

## Supabase Setup

1. Create a Supabase project.
2. Run the `leaderboard_players` table SQL from `docs/superpowers/plans/2026-04-15-leaderboard.md`.
3. Copy the direct Postgres connection string.
4. Set `DATABASE_URL` locally or in Render.

Local example:

```bash
export DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
npm start
```

## Same Wi-Fi Testing

Start the server:

```bash
npm start
```

Find your local IP address:

```bash
hostname -I
```

Other devices on the same network can open:

```text
http://YOUR_LOCAL_IP:3000
```

Your firewall must allow connections to port `3000`.

## Run Tests

```bash
npm test
```

The tests cover shared game logic and server-side room behavior.

## Deployment

Deploy as a Node.js web service, not as a static site. The app needs a long-running server for Socket.io.

Render settings:

- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
- Environment variable: `DATABASE_URL`

After deployment, both players open the same public URL and use Online mode.

## Validation Rules

- Board size must be at least `3`.
- Adjacent marks to win must be at least `3`.
- Adjacent marks to win cannot be greater than board size.
- Online room codes must match an active room.
- Online rooms allow exactly two players.
- Online moves must be in bounds, empty, and made by the current player.
- Online room creation and joining require a valid username.
- Usernames must be 2-20 characters and use letters, numbers, spaces, dashes, or underscores.

## Project Structure

See [`docs/project-structure.md`](docs/project-structure.md) for file responsibilities, runtime flow, and data ownership.

## Known Limitations

- Rooms live in server memory.
- Rooms disappear if the server restarts or sleeps.
- The in-memory leaderboard resets when the server restarts.
- No reconnect support after network loss.
- No rematch button.
- No persistent game history.
