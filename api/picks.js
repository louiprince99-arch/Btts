const { getStandings } = require("./_lib/bzzoiro");
const { getLeagueMatches } = require("./_lib/fixtures");
const { buildResolver } = require("./_lib/teamMatch");
const { bttsProbability } = require("./_lib/model");

// GET /api/picks?slate=midweek|saturday
// Our own Poisson BTTS calc (see _lib/model.js), fed by live season xG
// stats from bzzoiro's standings endpoint (xgf/xga, season-total —
// not split by home/away, since that split isn't confirmed available;
// see _lib/bzzoiro.js). Fixtures: Championship from openfootball,
// League One/Two from bzzoiro (see _lib/fixtures.js). Nothing bundled,
// nothing frozen — every call hits both APIs fresh.

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

    for (const leagueKey of LEAGUES) {
      let statsByTeamId, matches;
      try {
        [statsByTeamId, matches] = await Promise.all([
          getStandings(leagueKey),
          getLeagueMatches(leagueKey, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)),
        ]);
      } catch (err) {
        leagueErrors.push({ league: leagueKey, error: err.message });
        continue;
      }

      // Fallback name-based resolver, for fixtures sources (openfootball)
      // that don't carry bzzoiro's team ids.
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

        candidates.push({
          league: leagueKey,
          kickoff: kickoff.toISOString(),
          home: m.team1,
          away: m.team2,
          bttsProbability: Number(prob.toFixed(3)),
          homeExpectedGoals,
          awayExpectedGoals,
        });
      }
    }

    candidates.sort((a, b) => b.bttsProbability - a.bttsProbability);

    res.status(200).json({
      slate,
      leaguesCovered: LEAGUES,
      window: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      picks: candidates.slice(0, 6),
      unmatchedFixtures: unmatched,
      leagueErrors,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
