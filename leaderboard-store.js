import postgres from "postgres";

function createEmptyPlayer(username) {
  return {
    username,
    wins: 0,
    losses: 0,
    draws: 0,
    gamesPlayed: 0,
    winRate: 0,
  };
}

function withWinRate(player) {
  const gamesPlayed = player.gamesPlayed;
  return {
    ...player,
    winRate: gamesPlayed === 0 ? 0 : player.wins / gamesPlayed,
  };
}

export function createMemoryLeaderboardStore() {
  const players = new Map();

  function ensurePlayer(username) {
    if (!players.has(username)) {
      players.set(username, createEmptyPlayer(username));
    }
    return players.get(username);
  }

  async function recordGameResult(result) {
    if (result.type === "draw") {
      for (const player of result.players) {
        const row = ensurePlayer(player.username);
        row.draws += 1;
        row.gamesPlayed += 1;
      }
      return;
    }

    const winner = ensurePlayer(result.winnerUsername);
    const loser = ensurePlayer(result.loserUsername);
    winner.wins += 1;
    winner.gamesPlayed += 1;
    loser.losses += 1;
    loser.gamesPlayed += 1;
  }

  async function getPlayer(username) {
    return withWinRate(ensurePlayer(username));
  }

  async function getLeaderboard({ limit = 10 } = {}) {
    return [...players.values()]
      .map(withWinRate)
      .sort(comparePlayers)
      .slice(0, limit);
  }

  async function ensureSchema() {}
  async function close() {}

  return {
    ensureSchema,
    recordGameResult,
    getPlayer,
    getLeaderboard,
    close,
  };
}

export function createPostgresLeaderboardStore({ databaseUrl }) {
  const sql = postgres(databaseUrl, { ssl: "require" });

  async function ensureSchema() {
    await sql`
      create table if not exists leaderboard_players (
        username text primary key,
        wins integer not null default 0,
        losses integer not null default 0,
        draws integer not null default 0,
        games_played integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists leaderboard_players_rank_idx
        on leaderboard_players (wins desc, games_played desc, username asc)
    `;
  }

  async function recordGameResult(result) {
    if (result.type === "draw") {
      for (const player of result.players) {
        await incrementPlayer(player.username, { wins: 0, losses: 0, draws: 1 });
      }
      return;
    }

    await incrementPlayer(result.winnerUsername, {
      wins: 1,
      losses: 0,
      draws: 0,
    });
    await incrementPlayer(result.loserUsername, {
      wins: 0,
      losses: 1,
      draws: 0,
    });
  }

  async function incrementPlayer(username, { wins, losses, draws }) {
    await sql`
      insert into leaderboard_players (username, wins, losses, draws, games_played)
      values (${username}, ${wins}, ${losses}, ${draws}, 1)
      on conflict (username) do update set
        wins = leaderboard_players.wins + ${wins},
        losses = leaderboard_players.losses + ${losses},
        draws = leaderboard_players.draws + ${draws},
        games_played = leaderboard_players.games_played + 1,
        updated_at = now()
    `;
  }

  async function getPlayer(username) {
    const rows = await sql`
      select
        username,
        wins,
        losses,
        draws,
        games_played as "gamesPlayed",
        case
          when games_played = 0 then 0
          else wins::float / games_played
        end as "winRate"
      from leaderboard_players
      where username = ${username}
    `;

    return rows[0] || withWinRate(createEmptyPlayer(username));
  }

  async function getLeaderboard({ limit = 10 } = {}) {
    return await sql`
      select
        username,
        wins,
        losses,
        draws,
        games_played as "gamesPlayed",
        case
          when games_played = 0 then 0
          else wins::float / games_played
        end as "winRate"
      from leaderboard_players
      order by wins desc, "winRate" desc, games_played desc, username asc
      limit ${limit}
    `;
  }

  async function close() {
    await sql.end();
  }

  return {
    ensureSchema,
    recordGameResult,
    getPlayer,
    getLeaderboard,
    close,
  };
}

export function createLeaderboardStore({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl) {
    return createPostgresLeaderboardStore({ databaseUrl });
  }

  console.warn("DATABASE_URL is not set. Using in-memory leaderboard store.");
  return createMemoryLeaderboardStore();
}

function comparePlayers(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  return a.username.localeCompare(b.username);
}
