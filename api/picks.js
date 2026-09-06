const { LEAGUES, currentSeason, getTeams, getTeamStats, getFixturesInRange } = require("./_lib/apiFootball");
const { bttsProbability } = require("./_lib/model");

// GET /api/picks?slate=midweek|saturday
// Computes everything live from API-Football on each call — no cron,
// no stored history. Fine for personal, occasional use; be aware each
// full call costs ~78 API-Football requests (free tier = 100/day), so
// don't hit this more than once or twice a day.

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

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
  // default: midweek = Tue-Thu of current week
  const tue = nextWeekday(now, 2);
  const thu = new Date(tue);
  thu.setUTCDate(thu.getUTCDate() + 2);
  return { from: tue, to: thu };
}

module.exports = async (req, res) => {
  try {
    const slate = req.query.slate === "saturday" ? "saturday" : "midweek";
    const season = currentSeason();
    const { from, to } = windowForSlate(slate);

    const candidates = [];

    for (const [leagueKey, leagueId] of Object.entries(LEAGUES)) {
      const teams = await getTeams(leagueId, season);

      const statsByTeam = {};
      for (const team of teams) {
        statsByTeam[team.id] = await getTeamStats(leagueId, season, team.id);
      }

      const fixtures = await getFixturesInRange(leagueId, season, toISODate(from), toISODate(to));

      for (const fx of fixtures) {
        // Only this league's own current-season fixtures — no cups, no other seasons.
        if (fx.league.id !== leagueId || fx.league.season !== season) continue;

        const homeStats = statsByTeam[fx.teams.home.id];
        const awayStats = statsByTeam[fx.teams.away.id];
        if (!homeStats || !awayStats) continue;

        const { bttsProbability: prob, homeExpectedGoals, awayExpectedGoals } =
          bttsProbability(homeStats, awayStats);

        candidates.push({
          league: leagueKey,
          fixtureId: fx.fixture.id,
          kickoff: fx.fixture.date,
          home: fx.teams.home.name,
          away: fx.teams.away.name,
          bttsProbability: Number(prob.toFixed(3)),
          homeExpectedGoals,
          awayExpectedGoals,
        });
      }
    }

    candidates.sort((a, b) => b.bttsProbability - a.bttsProbability);

    res.status(200).json({
      slate,
      season,
      window: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      picks: candidates.slice(0, 6),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
