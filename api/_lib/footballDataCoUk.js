// Fetches football-data.co.uk's public season CSVs directly. No key,
// no signup. Columns include real match xG (HxG/AxG) for these
// leagues, which none of the free APIs we tried actually offer.
//
// URL pattern: https://www.football-data.co.uk/mmz4281/{season}/{code}.csv
// where season is e.g. "2627" for 2026/27, and code is E1 (Championship),
// E2 (League One), E3 (League Two).

const LEAGUES = {
  championship: "E1",
  league_one: "E2",
  league_two: "E3",
};

function seasonCode() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  const endYear = startYear + 1;
  const two = (n) => String(n % 100).padStart(2, "0");
  return `${two(startYear)}${two(endYear)}`;
}

// Minimal CSV parser — football-data.co.uk fields don't contain
// embedded commas, so a plain split is safe here.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] !== undefined ? cells[i].trim() : ""));
    return row;
  });
}

async function fetchLeagueCsv(code) {
  const url = `https://www.football-data.co.uk/mmz4281/${seasonCode()}/${code}.csv`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; btts-picker/1.0)",
      Accept: "text/csv,text/plain,*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`football-data.co.uk fetch failed for ${code}: ${res.status}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

function num(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// Aggregates per-team home/away xG-for and xG-against averages.
// Falls back to actual goals (FTHG/FTAG) for any match missing xG data.
function computeTeamStats(rows) {
  const acc = {}; // name -> { homeXgFor, homeXgAgainst, homeCount, awayXgFor, awayXgAgainst, awayCount }

  function ensure(name) {
    if (!acc[name]) {
      acc[name] = { homeXgFor: 0, homeXgAgainst: 0, homeCount: 0, awayXgFor: 0, awayXgAgainst: 0, awayCount: 0 };
    }
    return acc[name];
  }

  for (const row of rows) {
    const home = row.HomeTeam;
    const away = row.AwayTeam;
    if (!home || !away) continue;

    const fthg = num(row.FTHG, null);
    const ftag = num(row.FTAG, null);
    if (fthg === null || ftag === null) continue; // match not yet played

    const hxg = num(row.HxG, fthg);
    const axg = num(row.AxG, ftag);

    const h = ensure(home);
    h.homeXgFor += hxg;
    h.homeXgAgainst += axg;
    h.homeCount += 1;

    const a = ensure(away);
    a.awayXgFor += axg;
    a.awayXgAgainst += hxg;
    a.awayCount += 1;
  }

  const stats = {};
  for (const [name, s] of Object.entries(acc)) {
    stats[name] = {
      name,
      goalsForHome: s.homeCount ? s.homeXgFor / s.homeCount : 0,
      goalsAgainstHome: s.homeCount ? s.homeXgAgainst / s.homeCount : 0,
      goalsForAway: s.awayCount ? s.awayXgFor / s.awayCount : 0,
      goalsAgainstAway: s.awayCount ? s.awayXgAgainst / s.awayCount : 0,
    };
  }
  return stats;
}

async function getLeagueStats(leagueKey) {
  const code = LEAGUES[leagueKey];
  const rows = await fetchLeagueCsv(code);
  return computeTeamStats(rows);
}

module.exports = { LEAGUES, seasonCode, getLeagueStats };
