// All three leagues now go through bzzoiro. Championship used to come
// from openfootball, but that source's Championship file turned out
// to be missing matchdays that genuinely exist (confirmed against
// real fixtures) — same kind of gap as League One/Two had. bzzoiro
// covers Championship too, so routing everything through one source
// removes that risk and gives exact team-ID matching everywhere
// instead of fuzzy name matching for Championship.

const bzzoiro = require("./bzzoiro");

async function getLeagueMatches(leagueKey, fromISO, toISO) {
  return bzzoiro.getLeagueMatches(leagueKey, fromISO, toISO);
}

module.exports = { getLeagueMatches };
