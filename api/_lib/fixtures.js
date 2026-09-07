// Routes each league to whichever fixture source actually has it.
// Championship: openfootball (confirmed working).
// League One/Two: bzzoiro (openfootball doesn't have these published
// for this season — see api/_lib/openfootball.js for details).

const openfootball = require("./openfootball");
const bzzoiro = require("./bzzoiro");

async function getLeagueMatches(leagueKey, fromISO, toISO) {
  if (leagueKey === "league_one" || leagueKey === "league_two") {
    return bzzoiro.getLeagueMatches(leagueKey, fromISO, toISO);
  }
  // openfootball returns the whole season — picks.js filters by window itself.
  return openfootball.getLeagueMatches(leagueKey);
}

module.exports = { getLeagueMatches };
