import { normalizeUsername } from "./username.js";

export const LOCAL_STATS_KEY = "ttt_local_stats_v1";

export function createEmptyLocalStats() {
  return { players: {} };
}

export function readLocalStats(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_STATS_KEY) || "");
    if (parsed && typeof parsed === "object" && parsed.players) {
      return parsed;
    }
  } catch {
    return createEmptyLocalStats();
  }

  return createEmptyLocalStats();
}

export function writeLocalStats(stats, storage = window.localStorage) {
  storage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
}

export function recordLocalWin(stats, winnerName, loserName) {
  const winner = ensurePlayer(stats, winnerName || "Player X");
  const loser = ensurePlayer(stats, loserName || "Player O");

  winner.wins += 1;
  loser.losses += 1;
  return stats;
}

export function recordLocalDraw(stats, playerXName, playerOName) {
  ensurePlayer(stats, playerXName || "Player X").draws += 1;
  ensurePlayer(stats, playerOName || "Player O").draws += 1;
  return stats;
}

export function getLocalRows(stats) {
  return Object.entries(stats.players)
    .map(([username, row]) => ({ username, ...row }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.draws !== a.draws) return b.draws - a.draws;
      return a.username.localeCompare(b.username);
    });
}

function ensurePlayer(stats, name) {
  const username = normalizeUsername(name) || "Guest";
  if (!stats.players[username]) {
    stats.players[username] = {
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  return stats.players[username];
}
