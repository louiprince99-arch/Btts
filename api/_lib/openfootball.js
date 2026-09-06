// Fetches fixtures from openfootball/football.json (the auto-generated
// JSON mirror, not the raw .txt source — reliable documented schema:
// { name, matches: [{ date, team1, team2, score }] }).
//
// Confirmed directly (not guessed) for the 2026-27 season folder:
//   en.1.json = Premier League
//   en.2.json = Championship
// League One/Two have no file here at all yet — the upstream
// Football.TXT source files for those two divisions haven't been
// created for this season by the (volunteer-maintained) project.
// getLeagueMatches() throws a clear, specific error for them rather
// than pretending to look.

const RAW_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";

const LEAGUE_FILES = {
  championship: "en.2.json",
  // league_one / league_two: not published for 2026-27 yet — see note above.
};

function seasonFolder() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

async function getLeagueMatches(leagueKey) {
  const fileName = LEAGUE_FILES[leagueKey];
  if (!fileName) {
    throw new Error(
      `${leagueKey} has no published fixture file for ${seasonFolder()} yet (upstream data gap, not a code bug)`
    );
  }

  const folder = seasonFolder();
  const res = await fetch(`${RAW_BASE}/${folder}/${fileName}`);
  if (!res.ok) {
    throw new Error(`Fetching ${folder}/${fileName} failed: ${res.status}`);
  }
  const data = await res.json();
  return (data.matches || []).map((m) => ({
    date: m.date,
    team1: m.team1,
    team2: m.team2,
    played: !!(m.score && m.score.ft),
  }));
}

module.exports = { seasonFolder, getLeagueMatches };
