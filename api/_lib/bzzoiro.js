// Bzzoiro Sports Data (BSD) client — used only for League One/League
// Two fixtures, since no other free source has had them. Championship
// keeps using the existing openfootball pipeline, which already works.
//
// Docs confirm (not guessed): GET /api/v2/leagues/ -> { count, results }
// GET /api/v2/events/?league_id=&date_from=&date_to= -> { count, events }
// League IDs aren't hardcoded — resolved by name/country lookup each
// time, since guessing IDs has gone wrong for every other provider in
// this project.
//
// Env var required: BZZOIRO_API_KEY

const BASE = "https://sports.bzzoiro.com/api/v2";

const LEAGUE_NAMES = {
  league_one: "League One",
  league_two: "League Two",
};

async function apiGet(path, params = {}) {
  const key = process.env.BZZOIRO_API_KEY;
  if (!key) throw new Error("BZZOIRO_API_KEY env var is not set");

  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`bzzoiro ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function findLeagueId(leagueKey) {
  const targetName = LEAGUE_NAMES[leagueKey];
  const data = await apiGet("/leagues/", { country: "England", limit: 200 });
  const leagues = data.results || data.leagues || [];
  const match = leagues.find((l) => (l.name || "").toLowerCase() === targetName.toLowerCase());
  if (!match) {
    throw new Error(
      `Could not find "${targetName}" in bzzoiro's England leagues (saw: ${leagues.map((l) => l.name).join(", ")})`
    );
  }
  return match.id;
}

// Heuristic for "hasn't been played yet" — the exact status enum isn't
// documented, so treat anything that doesn't look like a finished
// match as upcoming, rather than risk silently dropping fixtures.
function looksFinished(status) {
  return /final|finish|ended|ft\b|full.?time/i.test(status || "");
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
    team1: e.home_team,
    team2: e.away_team,
    played: looksFinished(e.status),
  }));
}

module.exports = { getLeagueMatches };
