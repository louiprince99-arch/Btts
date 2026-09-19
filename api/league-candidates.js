const { getStandings, getPlayedMatches, getLeagueMatches } = require("./_lib/bzzoiro");
const { buildResolver } = require("./_lib/teamMatch");
const { bttsProbability } = require("./_lib/model");
const { applyScheduleAdjustment } = require("./_lib/scheduleAdjust");
const { applyFormAndHistory } = require("./_lib/formStats");

// GET /api/league-candidates?league=<key>
//
// One league per call, weekend only:
//   weekend = next Sat 00:00 -> Sun 23:59 (UTC)
// The top-20 page fires one of these per league in parallel and pools
// the results in the browser, so each function stays small and fast,
// no single request has to wait on 20 leagues, and picks fill in as
// leagues land.
//
// Speed: fixtures are fetched first (1 call for the weekend window).
// If the league has nothing to score, it returns straight away —
// standings + played matches are only fetched when there's a fixture
// to use them on.
//
// Same scoring as every other picker: xG standings -> schedule
// strength -> venue form -> Poisson BTTS.

const TOP20 = new Set([
  "premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1",
  "primeira_liga", "eredivisie", "belgian_pro", "super_lig", "scottish_prem",
  "championship", "bundesliga_2", "segunda", "austrian_bl", "swiss_super",
  "greek_super", "danish_super", "brasileirao", "mls",
]);

function nextWeekday(from, targetDay) {
  const d = new Date(from);
  const diff = (targetDay - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weekendWindow(now = new Date()) {
  const sat = nextWeekday(now, 6);
  const sunEnd = new Date(sat);
  sunEnd.setUTCDate(sunEnd.getUTCDate() + 1);
  sunEnd.setUTCHours(23, 59, 59, 0);

  return { from: sat, to: sunEnd };
}

const day = (d) => d.toISOString().slice(0, 10);

module.exports = async (req, res) => {
  const league = req.query.league;
  const now = new Date();
  const w = weekendWindow(now);
  const base = {
    league,
    generatedAt: now.toISOString(),
    window: { from: w.from.toISOString(), to: w.to.toISOString() },
  };

  if (!TOP20.has(league)) {
    return res.status(400).json({ ...base, error: `Unknown league: ${league}` });
  }

  try {
    const matches = await getLeagueMatches(league, day(w.from), day(w.to));

    // Keep only unplayed, not-yet-kicked-off weekend fixtures.
    const upcoming = [];
    for (const m of matches) {
      if (m.played || !m.date) continue;
      const kickoff = m.kickoffISO ? new Date(m.kickoffISO) : new Date(`${m.date}T15:00:00Z`);
      if (kickoff <= now || kickoff < w.from || kickoff > w.to) continue;
      upcoming.push({ ...m, kickoff });
    }

    if (!upcoming.length) {
      return res.status(200).json({ ...base, candidates: [], unmatched: [], fixturesInWindow: 0 });
    }

    let [stats, played] = await Promise.all([getStandings(league), getPlayedMatches(league)]);

    if (!Object.keys(stats).length) {
      return res.status(200).json({
        ...base,
        candidates: [],
        unmatched: [],
        fixturesInWindow: upcoming.length,
        error: "No xG standings available for this league yet",
      });
    }

    stats = applyScheduleAdjustment(stats, played);
    stats = applyFormAndHistory(stats, played);

    const byName = {};
    for (const s of Object.values(stats)) byName[s.name] = s;
    const resolveByName = buildResolver(byName);

    const candidates = [];
    const unmatched = [];

    for (const m of upcoming) {
      const home = (m.team1Id && stats[m.team1Id]) || resolveByName(m.team1);
      const away = (m.team2Id && stats[m.team2Id]) || resolveByName(m.team2);
      if (!home || !away) {
        unmatched.push({ league, home: m.team1, away: m.team2 });
        continue;
      }

      const { bttsProbability: prob, homeExpectedGoals, awayExpectedGoals } =
        bttsProbability(home, away);

      candidates.push({
        league,
        slate: "weekend",
        kickoff: m.kickoff.toISOString(),
        home: m.team1,
        away: m.team2,
        bttsProbability: Number(prob.toFixed(3)),
        historicalBttsRate:
          home.bttsRate != null && away.bttsRate != null
            ? Number(((home.bttsRate + away.bttsRate) / 2).toFixed(3))
            : null,
        homeExpectedGoals,
        awayExpectedGoals,
        homeScheduleStrength: home.scheduleStrength,
        awayScheduleStrength: away.scheduleStrength,
      });
    }

    candidates.sort((a, b) => b.bttsProbability - a.bttsProbability);

    res.status(200).json({
      ...base,
      candidates,
      unmatched,
      fixturesInWindow: upcoming.length,
      teamsInStandings: Object.keys(stats).length,
      playedMatchesFetched: played.length,
    });
  } catch (err) {
    res.status(502).json({ ...base, error: err.message });
  }
};
