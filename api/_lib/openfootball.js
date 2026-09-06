// Fetches fixtures from openfootball/football.json on GitHub. Free,
// no key, no rate-limit worth worrying about for this use case.
//
// File naming inside each season folder isn't guaranteed stable, so
// rather than hardcode a guessed filename, this lists the folder via
// GitHub's API and matches by keyword — resilient to naming changes.

const REPO_API = "https://api.github.com/repos/openfootball/football.json/contents";

const LEAGUE_KEYWORDS = {
  championship: ["championship"],
  league_one: ["league1", "league-one", "leagueone", "league_one", "en.3"],
  league_two: ["league2", "league-two", "leaguetwo", "league_two", "en.4"],
};

function seasonFolder() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(2)}`;
}

async function listSeasonFiles() {
  const res = await fetch(`${REPO_API}/${seasonFolder()}`, {
    headers: { "User-Agent": "btts-picker" },
  });
  if (!res.ok) {
    throw new Error(`GitHub listing failed for ${seasonFolder()}: ${res.status}`);
  }
  return res.json(); // array of { name, download_url, ... }
}

function findFile(files, keywords) {
  return files.find((f) => {
    const lower = f.name.toLowerCase();
    return lower.endsWith(".json") && keywords.some((kw) => lower.includes(kw));
  });
}

async function getLeagueMatches(leagueKey) {
  const files = await listSeasonFiles();
  const keywords = LEAGUE_KEYWORDS[leagueKey];
  const file = findFile(files, keywords);
  if (!file) {
    throw new Error(`Could not find a ${leagueKey} file in ${seasonFolder()} (saw: ${files.map((f) => f.name).join(", ")})`);
  }
  const res = await fetch(file.download_url);
  if (!res.ok) throw new Error(`Fetching ${file.name} failed: ${res.status}`);
  const data = await res.json();
  return data.matches || [];
}

module.exports = { seasonFolder, getLeagueMatches };
