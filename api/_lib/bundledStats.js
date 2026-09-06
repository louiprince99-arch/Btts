// Team stats (with real xG) bundled into the repo as static JSON,
// generated from a football-data.co.uk season file (see
// scripts note in README for how to refresh these).
//
// This exists because fetching football-data.co.uk live from a
// Vercel function gets a 503 — almost certainly a block on
// datacenter/hosting-provider IPs, not something fixable in code.
// Bundling avoids the live fetch entirely.

const path = require("path");

const LEAGUES = {
  championship: "championship",
  league_one: "league_one",
  league_two: "league_two",
};

function getLeagueStats(leagueKey) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const data = require(path.join(__dirname, "..", "..", "data", `${leagueKey}.json`));
  return data.teams;
}

module.exports = { LEAGUES, getLeagueStats };
