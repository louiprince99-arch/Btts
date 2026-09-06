// Fetches fixtures from the openfootball/england repo directly (the
// human-maintained Football.TXT source, not the auto-generated
// football.json mirror — which turned out to skip League One/Two for
// the current season). Free, no key.
//
// File naming per season folder isn't assumed — it's discovered via
// GitHub's contents API and matched by keyword, since guessing exact
// names has already gone wrong once in this project.

const { parseFootballTxt } = require("./footballTxt");

const REPO_API = "https://api.github.com/repos/openfootball/england/contents";

const LEAGUE_KEYWORDS = {
  championship: ["championship"],
  league_one: ["league1", "league-one", "leagueone", "league_one"],
  league_two: ["league2", "league-two", "leaguetwo", "league_two"],
};

function seasonFolder() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return { folder: `${startYear}-${String(startYear + 1).slice(2)}`, startYear };
}

async function listSeasonFiles(folder) {
  const res = await fetch(`${REPO_API}/${folder}`, {
    headers: { "User-Agent": "btts-picker" },
  });
  if (!res.ok) {
    throw new Error(`GitHub listing failed for openfootball/england/${folder}: ${res.status}`);
  }
  return res.json();
}

function findFile(files, keywords) {
  return files.find((f) => {
    const lower = f.name.toLowerCase();
    return (lower.endsWith(".txt") || lower.endsWith(".json")) && keywords.some((kw) => lower.includes(kw));
  });
}

async function getLeagueMatches(leagueKey) {
  const { folder, startYear } = seasonFolder();
  const files = await listSeasonFiles(folder);
  const keywords = LEAGUE_KEYWORDS[leagueKey];
  const file = findFile(files, keywords);
  if (!file) {
    throw new Error(
      `Could not find a ${leagueKey} file in openfootball/england/${folder} (saw: ${files.map((f) => f.name).join(", ")})`
    );
  }

  const res = await fetch(file.download_url);
  if (!res.ok) throw new Error(`Fetching ${file.name} failed: ${res.status}`);

  if (file.name.toLowerCase().endsWith(".json")) {
    const data = await res.json();
    return (data.matches || []).map((m) => ({
      date: m.date,
      team1: m.team1,
      team2: m.team2,
      played: !!(m.score && m.score.ft),
    }));
  }

  const text = await res.text();
  return parseFootballTxt(text, startYear);
}

module.exports = { seasonFolder, getLeagueMatches };
