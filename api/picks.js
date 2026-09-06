const { LEAGUES, getLeagueStats } = require("./_lib/bundledStats");
const { getLeagueMatches } = require("./_lib/openfootball");
const { buildResolver } = require("./_lib/teamMatch");
const { bttsProbability } = require("./_lib/model");

// GET /api/picks?slate=midweek|saturday
// Stats (with real xG) come from a bundled data snapshot (see
// /data/*.json — refresh by re-generating from a fresh download);
// fixtures come from the openfootball/england repo (Football.TXT
// source), fetched live.

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

    for (const leagueKey of Object.keys(LEAGUES)) {
      const [statsByName, matches] = await Promise.all([
        getLeagueStats(leagueKey),
        getLeagueMatches(leagueKey),
      ]);
      const resolve = buildResolver(statsByName);

      for (const m of matches) {
        if (!m.date) continue;
        const kickoff = new Date(`${m.date}T15:00:00Z`);
        if (kickoff < from || kickoff > to) continue;
        if (m.played) continue; // already played

        const homeStats = resolve(m.team1);
        const awayStats = resolve(m.team2);
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
      leaguesCovered: Object.keys(LEAGUES),
      window: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      picks: candidates.slice(0, 6),
      unmatchedFixtures: unmatched, // fixtures skipped due to a name-matching miss
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
