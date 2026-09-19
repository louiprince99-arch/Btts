// Bzzoiro Sports Data (BSD) client — all live data for every picker.
//
// Speed notes:
// - League IDs are hardcoded from bzzoiro's own league list
//   (sports.bzzoiro.com/leagues/), so no /leagues/ lookup call is
//   needed. Any league without an `id` falls back to a name lookup.
// - Pagination uses limit/offset + `count`: first page tells us how
//   many pages exist, the rest are fetched in parallel.
// - 429s are retried briefly instead of failing the whole league.
//
// Env var required:
//   BZZOIRO_API_KEY

const BASE = "https://sports.bzzoiro.com/api/v2";
const MAX_PAGES = 20;
const PAGE_LIMIT = 200; // bzzoiro max

// seasonStartMonth: 7 = Jul (European seasons), 1 = Jan (calendar-year
// leagues). Used to scope "played this season" matches.
const LEAGUE_INFO = {
  // EFL
  championship: { id: 12, name: "Championship", country: "England" },
  league_one: { id: 86, name: "League One", country: "England" },
  league_two: { id: 87, name: "League Two", country: "England" },
  // Top 5
  premier_league: { id: 1, name: "Premier League", country: "England" },
  la_liga: { id: 3, name: "La Liga", country: "Spain" },
  serie_a: { id: 4, name: "Serie A", country: "Italy" },
  bundesliga: { id: 5, name: "Bundesliga", country: "Germany" },
  ligue_1: { id: 6, name: "Ligue 1", country: "France" },
  // Rest of the top 20
  primeira_liga: { id: 2, name: "Liga Portugal Betclic", country: "Portugal" },
  eredivisie: { id: 10, name: "Eredivisie", country: "Netherlands" },
  belgian_pro: { id: 14, name: "Pro League", country: "Belgium" },
  super_lig: { id: 11, name: "Trendyol Super Lig", country: "Turkey" },
  scottish_prem: { id: 13, name: "Scottish Premiership", country: "Scotland" },
  bundesliga_2: { id: 94, name: "2. Bundesliga", country: "Germany" },
  segunda: { id: 38, name: "Segunda División", country: "Spain" },
  austrian_bl: { id: 96, name: "Austrian Bundesliga", country: "Austria" },
  swiss_super: { id: 15, name: "Super League", country: "Switzerland" },
  greek_super: { id: 24, name: "Stoiximan Super League", country: "Greece" },
  danish_super: { id: 84, name: "Danish Superliga", country: "Denmark" },
  brasileirao: { id: 9, name: "Brasileirão Serie A", country: "Brazil", seasonStartMonth: 1 },
  argentina_lpf: { id: 85, name: "Liga Profesional de Fútbol", country: "Argentina", seasonStartMonth: 1 },
  mls: { id: 18, name: "MLS", country: "USA", seasonStartMonth: 1 },
};

const leagueIdCache = new Map();
const leagueIdPromises = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawGet(url, attempt = 0) {
  const key = process.env.BZZOIRO_API_KEY;
  if (!key) throw new Error("BZZOIRO_API_KEY env var is not set");

  const res = await fetch(url, { headers: { Authorization: `Token ${key}` } });

  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 3000)
      : 700 * (attempt + 1);
    await sleep(wait);
    return rawGet(url, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`bzzoiro request failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

function buildUrl(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  return url.toString();
}

async function apiGet(path, params = {}) {
  return rawGet(buildUrl(path, params));
}

// First page gives `count`; remaining offset pages fetched in parallel.
// Falls back to following `next` sequentially if `count` isn't present.
async function apiGetAllPages(path, params, arrayKey) {
  const limit = params.limit || PAGE_LIMIT;
  const first = await apiGet(path, { ...params, limit, offset: 0 });
  const pick = (p) => p[arrayKey] || p.results || [];
  let items = pick(first);

  if (!first.next) return items;

  if (typeof first.count === "number") {
    const pages = Math.min(Math.ceil(first.count / limit), MAX_PAGES);
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        apiGet(path, { ...params, limit, offset: (i + 1) * limit })
      )
    );
    for (const p of rest) items = items.concat(pick(p));
    return items;
  }

  let page = first;
  let n = 1;
  while (page.next && n < MAX_PAGES) {
    page = await rawGet(page.next);
    items = items.concat(pick(page));
    n += 1;
  }
  return items;
}

async function findLeagueId(leagueKey) {
  const info = LEAGUE_INFO[leagueKey];
  if (!info) throw new Error(`Unknown league key: ${leagueKey}`);
  if (info.id) return info.id;

  if (leagueIdCache.has(leagueKey)) return leagueIdCache.get(leagueKey);
  if (leagueIdPromises.has(leagueKey)) return leagueIdPromises.get(leagueKey);

  const promise = (async () => {
    const data = await apiGet("/leagues/", { country: info.country, limit: 200 });
    const leagues = data.results || data.leagues || [];
    const match = leagues.find(
      (l) => (l.name || "").toLowerCase() === info.name.toLowerCase()
    );
    if (!match) {
      throw new Error(
        `Could not find "${info.name}" in bzzoiro's ${info.country} leagues (saw: ${leagues
          .map((l) => l.name)
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

function looksFinished(status) {
  return /final|finish|ended|ft\b|full.?time/i.test(status || "");
}

// Postponed/cancelled/suspended/abandoned fixtures are excluded.
function looksUnavailable(status) {
  return /postpon|cancel|suspend|abandon/i.test(status || "");
}

async function getLeagueMatches(leagueKey, fromISO, toISO) {
  const leagueId = await findLeagueId(leagueKey);

  const events = await apiGetAllPages(
    "/events/",
    { league_id: leagueId, date_from: fromISO, date_to: toISO, limit: PAGE_LIMIT },
    "events"
  );

  return events.map((e) => ({
    date: (e.event_date || "").slice(0, 10),
    kickoffISO: e.event_date || null,
    team1: e.home_team,
    team2: e.away_team,
    team1Id: e.home_team_id,
    team2Id: e.away_team_id,
    played: looksFinished(e.status) || looksUnavailable(e.status),
  }));
}

async function getStandings(leagueKey) {
  const leagueId = await findLeagueId(leagueKey);
  const data = await apiGet(`/leagues/${leagueId}/standings/`);
  const rows = data.standings || [];
  const stats = {};

  for (const row of rows) {
    if (!row.played) continue;
    const xgFor = typeof row.xgf === "number" ? row.xgf / row.played : null;
    const xgAgainst = typeof row.xga === "number" ? row.xga / row.played : null;
    if (xgFor === null || xgAgainst === null) continue;

    stats[row.team_id] = {
      name: row.team_name,
      teamId: row.team_id,
      played: row.played,
      points: row.pts,
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
  const data = await apiGet("/predictions/", { league_id: leagueId, limit: 200 });
  return data.results || data.predictions || [];
}

function seasonStartISO(leagueKey, now = new Date()) {
  const startMonth = (LEAGUE_INFO[leagueKey] && LEAGUE_INFO[leagueKey].seasonStartMonth) || 7;
  const year =
    now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

async function getPlayedMatches(leagueKey) {
  const leagueId = await findLeagueId(leagueKey);
  const now = new Date();

  const events = await apiGetAllPages(
    "/events/",
    {
      league_id: leagueId,
      date_from: seasonStartISO(leagueKey, now),
      date_to: now.toISOString().slice(0, 10),
      limit: PAGE_LIMIT,
    },
    "events"
  );

  return events
    .filter((e) => typeof e.home_score === "number" && typeof e.away_score === "number")
    .map((e) => ({
      homeTeamId: e.home_team_id,
      awayTeamId: e.away_team_id,
      date: e.event_date,
      homeScore: e.home_score,
      awayScore: e.away_score,
    }));
}

module.exports = {
  LEAGUE_INFO,
  getLeagueMatches,
  getPredictions,
  getStandings,
  getPlayedMatches,
};
