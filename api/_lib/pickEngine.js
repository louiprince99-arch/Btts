const { getStandings, getPlayedMatches } = require("./bzzoiro");
const { getLeagueMatches } = require("./fixtures");
const { buildResolver } = require("./teamMatch");
const { bttsProbability } = require("./model");
const { applyScheduleAdjustment } = require("./scheduleAdjust");
const { applyFormAndHistory } = require("./formStats");

// Runs the full pipeline for a set of leagues and a date window:
//   live standings -> schedule-strength adjustment -> venue-specific
//   recent-form adjustment -> match to fixtures -> score BTTS.
// Shared by every picker (EFL, top-5 European, any future one) so the
// actual scoring logic only exists in one place.
async function computeCandidates(leagueKeys, from, to) {
  const candidates = [];
  const unmatched = [];
  const leagueErrors = [];
  const debugByLeague = {};

  for (const leagueKey of leagueKeys) {
    let statsByTeamId, matches, playedMatches;
    try {
      [statsByTeamId, matches, playedMatches] = await Promise.all([
        getStandings(leagueKey),
        getLeagueMatches(leagueKey, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)),
        getPlayedMatches(leagueKey),
      ]);
    } catch (err) {
      leagueErrors.push({ league: leagueKey, error: err.message });
      continue;
    }

    debugByLeague[leagueKey] = {
      teamsInStandings: Object.keys(statsByTeamId).length,
      matchesFetched: playedMatches.length,
    };

    statsByTeamId = applyScheduleAdjustment(statsByTeamId, playedMatches);
    statsByTeamId = applyFormAndHistory(statsByTeamId, playedMatches);

    const statsByName = {};
    for (const s of Object.values(statsByTeamId)) statsByName[s.name] = s;
    const resolveByName = buildResolver(statsByName);

    for (const m of matches) {
      if (!m.date) continue;
      const kickoff = m.kickoffISO ? new Date(m.kickoffISO) : new Date(`${m.date}T15:00:00Z`);
      if (kickoff < from || kickoff > to) continue;
      if (m.played) continue;

      const homeStats = (m.team1Id && statsByTeamId[m.team1Id]) || resolveByName(m.team1);
      const awayStats = (m.team2Id && statsByTeamId[m.team2Id]) || resolveByName(m.team2);

      if (!homeStats || !awayStats) {
        unmatched.push({ league: leagueKey, home: m.team1, away: m.team2 });
        continue;
      }

      const { bttsProbability: prob, homeExpectedGoals, awayExpectedGoals } =
        bttsProbability(homeStats, awayStats);

      const historicalBttsRate =
        homeStats.bttsRate !== null && awayStats.bttsRate !== null
          ? Number(((homeStats.bttsRate + awayStats.bttsRate) / 2).toFixed(3))
          : null;

      candidates.push({
        league: leagueKey,
        kickoff: kickoff.toISOString(),
        home: m.team1,
        away: m.team2,
        bttsProbability: Number(prob.toFixed(3)),
        historicalBttsRate,
        homeExpectedGoals,
        awayExpectedGoals,
        homeScheduleStrength: homeStats.scheduleStrength,
        awayScheduleStrength: awayStats.scheduleStrength,
      });
    }
  }

  candidates.sort((a, b) => b.bttsProbability - a.bttsProbability);

  const candidateCountByLeague = {};
  for (const c of candidates) {
    candidateCountByLeague[c.league] = (candidateCountByLeague[c.league] || 0) + 1;
  }

  return { candidates, unmatched, leagueErrors, debugByLeague, candidateCountByLeague };
}

function buildResponse(slate, leagueKeys, from, to, result) {
  const topPicks = result.candidates.slice(0, 6);
  const accaProbability = topPicks.length
    ? Number(topPicks.reduce((prod, p) => prod * p.bttsProbability, 1).toFixed(4))
    : null;

  return {
    slate,
    leaguesCovered: leagueKeys,
    window: { from: from.toISOString(), to: to.toISOString() },
    generatedAt: new Date().toISOString(),
    picks: topPicks,
    accaProbability,
    candidateCountByLeague: result.candidateCountByLeague,
    debugByLeague: result.debugByLeague,
    unmatchedFixtures: result.unmatched,
    leagueErrors: result.leagueErrors,
  };
}

module.exports = { computeCandidates, buildResponse };
