const { getPredictions } = require("./_lib/bzzoiro");

// GET /api/picks?slate=midweek|saturday
// Fully live — no bundled snapshot, no cron, no manual refresh.
// Uses bzzoiro's own ML prediction per fixture (their BTTS market),
// which is built on their internal xG model, rather than computing
// our own from raw stats.

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

function looksFinished(status) {
  return /final|finish|ended|ft\b|full.?time/i.test(status || "");
}

module.exports = async (req, res) => {
  try {
    const slate = req.query.slate === "saturday" ? "saturday" : "midweek";
    const { from, to } = windowForSlate(slate);

    const candidates = [];
    const leagueErrors = [];

    for (const leagueKey of LEAGUES) {
      let predictions;
      try {
        predictions = await getPredictions(leagueKey);
      } catch (err) {
        leagueErrors.push({ league: leagueKey, error: err.message });
        continue;
      }

      for (const p of predictions) {
        const event = p.event || {};
        if (!event.event_date) continue;
        const kickoff = new Date(event.event_date);
        if (kickoff < from || kickoff > to) continue;
        if (looksFinished(event.status)) continue;

        const btts = p.markets && p.markets.btts;
        const xg = p.markets && p.markets.expected_goals;
        if (!btts || typeof btts.prob_yes !== "number") continue;

        candidates.push({
          league: leagueKey,
          kickoff: kickoff.toISOString(),
          home: event.home_team,
          away: event.away_team,
          bttsProbability: Number((btts.prob_yes / 100).toFixed(3)),
          homeExpectedGoals: xg ? xg.home : null,
          awayExpectedGoals: xg ? xg.away : null,
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
      leagueErrors,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
