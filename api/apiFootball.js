// Wrapper for API-Football. Supports either direct (api-sports.io) or RapidAPI hosting.
// Set env vars in Vercel dashboard:
//   FOOTBALL_API_KEY      - your key
//   FOOTBALL_API_PROVIDER - "direct" (default) or "rapidapi"

const LEAGUES = {
  championship: 40,
  league_one: 41,
  league_two: 42,
};

function currentSeason() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  // English season starts ~July/Aug; before July, still previous season
  return m >= 7 ? y : y - 1;
}

function baseConfig() {
  const key = process.env.FOOTBALL_API_KEY;
  const provider = (process.env.FOOTBALL_API_PROVIDER || "direct").toLowerCase();
  if (!key) throw new Error("FOOTBALL_API_KEY env var is not set");

  if (provider === "rapidapi") {
    return {
      base: "https://api-football-v1.p.rapidapi.com/v3",
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
      },
    };
  }
  return {
    base: "https://v3.football.api-sports.io",
    headers: { "x-apisports-key": key },
  };
}

async function apiGet(path, params = {}) {
  const { base, headers } = baseConfig();
  const url = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API-Football ${path} failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

async function getTeams(leagueId, season) {
  const resp = await apiGet("/teams", { league: leagueId, season });
  return resp.map((t) => ({ id: t.team.id, name: t.team.name }));
}

async function getTeamStats(leagueId, season, teamId) {
  const resp = await apiGet("/teams/statistics", {
    league: leagueId,
    season,
    team: teamId,
  });
  const g = resp.goals;
  return {
    teamId,
    goalsForHome: parseFloat(g.for.average.home) || 0,
    goalsForAway: parseFloat(g.for.average.away) || 0,
    goalsAgainstHome: parseFloat(g.against.average.home) || 0,
    goalsAgainstAway: parseFloat(g.against.average.away) || 0,
  };
}

async function getFixturesInRange(leagueId, season, fromISO, toISO) {
  return apiGet("/fixtures", {
    league: leagueId,
    season,
    from: fromISO,
    to: toISO,
  });
}

module.exports = {
  LEAGUES,
  currentSeason,
  getTeams,
  getTeamStats,
  getFixturesInRange,
};
