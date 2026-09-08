const { getStandings, getPlayedMatches } = require("./_lib/bzzoiro");
const { getLeagueMatches } = require("./_lib/fixtures");
const { buildResolver } = require("./_lib/teamMatch");
const { bttsProbability } = require("./_lib/model");
const { applyScheduleAdjustment } = require("./_lib/scheduleAdjust");
const { applyFormAndHistory } = require("./_lib/formStats");

// GET /api/picks?slate=midweek|saturday
// Our own Poisson BTTS calc (see _lib/model.js), fed by live season xG
// stats from bzzoiro's standings endpoint. Each team's rate is then:
//   1. adjusted for strength of schedule (_lib/scheduleAdjust.js)
//   2. adjusted for recent form, using actual goals from their last 5
//      games vs their season average (_lib/formStats.js)
// Each pick also carries a plain historical BTTS rate (no model, just
// "how often has this team's games had both sides scoring") as a
// sanity check alongside the calculated probability. The response
// includes accaProbability per slate — the combined probability of
// all 6 picks landing together, not just each one individually.
// Nothing bundled, nothing frozen — every call hits the API fresh.

const LEAGUES = ["championship", "league_one", "league_two"];

function nextWeekday(from, targetDay) {
  const d = new Date(from);
  const diff = (targetDay - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function windowForSlate(slate) {
  const now = new Date();
  if (slate === "saturday") {
    const sat = nextWeekday(now, 6);
    const end = new Date(sat);
    end.setUTCHours(23, 59, 59, 0);
    return { from: sat, to: end };
  }
  const tue = nextWeekday(now, 2);
  const thu = new Date(tue);
  thu.setUTCDate(thu.getUTCDate() + 2);
  return { from: tue, to: thu };
}

module.exports = async (req, res) => {
  try {
    const slate = req.query.slate === "saturday" ? "saturday" : "midweek";
    const { from, to } = windowForSlate(slate);

    const candidates = [];
    const unmatched = [];
    const leagueErrors = [];
    const debugByLeague = {};

    for (const leagueKey of LEAGUES) {
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

      // Fallback name-based resolver, for fixtures sources that don't
      // carry bzzoiro's team ids.
      const statsByName = {};
      for (const s of Object.values(statsByTeamId)) statsByName[s.name] = s;
      const resolveByName = buildResolver(statsByName);

      for (const m of matches) {
        if (!m.date) continue;
        const kickoff = new Date(`${m.date}T15:00:00Z`);
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
          historicalBttsRate, // plain fact from real results, not model-derived — a sanity check
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

    const topPicks = candidates.slice(0, 6);
    const accaProbability = topPicks.length
      ? Number(topPicks.reduce((prod, p) => prod * p.bttsProbability, 1).toFixed(4))
      : null;

    res.status(200).json({
      slate,
      leaguesCovered: LEAGUES,
      window: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      picks: topPicks,
      accaProbability, // combined probability of all picks landing together
      candidateCountByLeague, // total fixtures scored per league, before trimming to top 6
      debugByLeague,
      unmatchedFixtures: unmatched,
      leagueErrors,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
