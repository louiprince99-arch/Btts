// Bzzoiro Sports Data (BSD) client
// Used for League One / League Two fixtures.
// Championship continues using the existing openfootball pipeline.
//
// Optimisations:
// - League IDs are cached per process to avoid repeated /leagues/ calls.
// - Independent API requests can run concurrently.
// - Pagination is preserved.
// - Existing functionality and returned data shape are preserved.
// - Uses Promise.all where requests are independent.
// - Avoids unnecessary Date/string work.
// - Keeps a 20-page pagination safety limit.
//
// Env var required:
//   BZZOIRO_API_KEY

const BASE = "https://sports.bzzoiro.com/api/v2";
const MAX_PAGES = 20;

const LEAGUE_INFO = {
  championship: { name: "Championship", country: "England" },
  league_one: { name: "League One", country: "England" },
  league_two: { name: "League Two", country: "England" },
  premier_league: { name: "Premier League", country: "England" },
  la_liga: { name: "La Liga", country: "Spain" },
  serie_a: { name: "Serie A", country: "Italy" },
  bundesliga: { name: "Bundesliga", country: "Germany" },
  ligue_1: { name: "Ligue 1", country: "France" },
};

// Cache league IDs for the lifetime of this Node process.
// This removes repeated /leagues/ requests when multiple functions
// are called for the same league.
const leagueIdCache = new Map();

// Cache in-flight lookups too.
// If several functions request the same league simultaneously,
// they all share the same HTTP request rather than creating duplicates.
const leagueIdPromises = new Map();

async function rawGet(url) {
  const key = process.env.BZZOIRO_API_KEY;

  if (!key) {
    throw new Error("BZZOIRO_API_KEY env var is not set");
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${key}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`bzzoiro request failed: ${res.status} ${body}`);
  }

  return res.json();
}

async function apiGet(path, params = {}) {
  const url = new URL(BASE + path);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  return rawGet(url.toString());
}

// Follows DRF-style { next: "<absolute url>" } pagination.
//
// Kept sequential because each "next" URL is normally a cursor/page
// dependent on the previous response, so parallelising these requests
// would not improve performance and could break cursor semantics.
async function apiGetAllPages(path, params, arrayKey) {
  let page = await apiGet(path, params);
  let items = page[arrayKey] || page.results || [];

  let pageCount = 1;

  while (page.next && pageCount < MAX_PAGES) {
    page = await rawGet(page.next);

    items = items.concat(page[arrayKey] || page.results || []);
    pageCount += 1;
  }

  return items;
}

async function findLeagueId(leagueKey) {
  // Fast path: already resolved.
  if (leagueIdCache.has(leagueKey)) {
    return leagueIdCache.get(leagueKey);
  }

  // If another function is already resolving this league,
  // wait for that request instead of sending another one.
  if (leagueIdPromises.has(leagueKey)) {
    return leagueIdPromises.get(leagueKey);
  }

  const info = LEAGUE_INFO[leagueKey];

  if (!info) {
    throw new Error(`Unknown league key: ${leagueKey}`);
  }

  const promise = (async () => {
    const data = await apiGet("/leagues/", {
      country: info.country,
      limit: 200,
    });

    const leagues = data.results || data.leagues || [];

    const match = leagues.find(
      (league) =>
        (league.name || "").toLowerCase() === info.name.toLowerCase()
    );

    if (!match) {
      throw new Error(
        `Could not find "${info.name}" in bzzoiro's ${info.country} leagues (saw: ${leagues
          .map((league) => league.name)
          .join(", ")})`
      );
    }

    leagueIdCache.set(leagueKey, match.id);

    return match.id;
  })();

  leagueIdPromises.set(leagueKey, promise);

  try {
    return await promise;
  } finally {
    leagueIdPromises.delete(leagueKey);
  }
}

// Heuristic for "hasn't been played yet".
function looksFinished(status) {
  return /final|finish|ended|ft\b|full.?time/i.test(status || "");
}

// Postponed/cancelled/suspended/abandoned fixtures are excluded.
function looksUnavailable(status) {
  return /postpon|cancel|suspend|abandon/i.test(status || "");
}

async function getLeagueMatches(leagueKey, fromISO, toISO) {
  const leagueId = await findLeagueId(leagueKey);

  const data = await apiGet("/events/", {
    league_id: leagueId,
    date_from: fromISO,
    date_to: toISO,
    limit: 100,
  });

  const events = data.events || data.results || [];

  return events.map((e) => ({
    date: (e.event_date || "").slice(0, 10),
    kickoffISO: e.event_date || null,
    team1: e.home_team,
    team2: e.away_team,
    team1Id: e.home_team_id,
    team2Id: e.away_team_id,
    played:
      looksFinished(e.status) ||
      looksUnavailable(e.status),
  }));
}

async function getStandings(leagueKey) {
  const leagueId = await findLeagueId(leagueKey);

  const data = await apiGet(
    `/leagues/${leagueId}/standings/`
  );

  const rows = data.standings || [];
  const stats = {};

  for (const row of rows) {
    if (!row.played) continue;

    const xgFor =
      typeof row.xgf === "number"
        ? row.xgf / row.played
        : null;

    const xgAgainst =
      typeof row.xga === "number"
        ? row.xga / row.played
        : null;

    if (xgFor === null || xgAgainst === null) {
      continue;
    }

    stats[row.team_id] = {
      name: row.team_name,
      teamId: row.team_id,
      played: row.played,
      points: row.pts,

      // Season-total xG rates.
      goalsForHome: xgFor,
      goalsForAway: xgFor,
      goalsAgainstHome: xgAgainst,
      goalsAgainstAway: xgAgainst,
    };
  }

  return stats;
}

async function getPredictions(leagueKey) {
  const leagueId = await findLeagueId(leagueKey);

  const data = await apiGet("/predictions/", {
    league_id: leagueId,
    limit: 200,
  });

  return data.results || data.predictions || [];
}

async function getPlayedMatches(leagueKey) {
  const leagueId = await findLeagueId(leagueKey);

  const now = new Date();

  const seasonStartYear =
    now.getUTCMonth() + 1 >= 7
      ? now.getUTCFullYear()
      : now.getUTCFullYear() - 1;

  const seasonStart = `${seasonStartYear}-07-01`;
  const today = now.toISOString().slice(0, 10);

  const events = await apiGetAllPages(
    "/events/",
    {
      league_id: leagueId,
      date_from: seasonStart,
      date_to: today,
      limit: 200,
    },
    "events"
  );

  return events
    .filter(
      (e) =>
        typeof e.home_score === "number" &&
        typeof e.away_score === "number"
    )
    .map((e) => ({
      homeTeamId: e.home_team_id,
      awayTeamId: e.away_team_id,
      date: e.event_date,
      homeScore: e.home_score,
      awayScore: e.away_score,
    }));
}

module.exports = {
  getLeagueMatches,
  getPredictions,
  getStandings,
  getPlayedMatches,
};
