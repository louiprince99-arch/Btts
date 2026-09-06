// Team stats (with real xG) bundled into the repo as one gzipped JSON
// file — see /data/stats.json.gz. Generated from a football-data.co.uk
// season file (see README for how to refresh it).
//
// This exists because fetching football-data.co.uk live from a
// Vercel function gets a 503 — almost certainly a block on
// datacenter/hosting-provider IPs, not something fixable in code.
// Bundling avoids the live fetch entirely.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const LEAGUES = {
  championship: "championship",
  league_one: "league_one",
  league_two: "league_two",
};

let cached = null;

function loadAll() {
  if (cached) return cached;
  const filePath = path.join(__dirname, "..", "..", "data", "stats.json.gz");
  const compressed = fs.readFileSync(filePath);
  const json = zlib.gunzipSync(compressed).toString("utf-8");
  cached = JSON.parse(json).leagues;
  return cached;
}

function getLeagueStats(leagueKey) {
  const all = loadAll();
  return all[leagueKey];
}

module.exports = { LEAGUES, getLeagueStats };
