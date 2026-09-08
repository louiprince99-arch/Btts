// Two things computed from real match results (goals, not xG):
//
// 1. Recent-form weighting — a team's xG-based rate (already schedule-
//    adjusted) gets nudged by how their actual goals in their last few
//    games compare to their season average. A team on a hot/cold
//    streak right now looks more like their recent games, less like
//    their August form.
// 2. Historical BTTS rate — the plain, model-free fact: in what
//    fraction of this team's games so far did both sides score. Used
//    as a sanity check alongside the model's probability, not a
//    replacement for it.

const RECENT_GAMES = 5;

function perTeamMatchLog(teamId, matches) {
  return matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .map((m) => {
      const isHome = m.homeTeamId === teamId;
      return {
        date: m.date,
        scored: isHome ? m.homeScore : m.awayScore,
        conceded: isHome ? m.awayScore : m.homeScore,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function average(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

// stats: output of getStandings (optionally already schedule-adjusted)
// matches: output of bzzoiro.getPlayedMatches for the same league
function applyFormAndHistory(stats, matches) {
  const adjusted = {};

  for (const [id, team] of Object.entries(stats)) {
    const log = perTeamMatchLog(Number(id), matches);

    if (!log.length) {
      adjusted[id] = { ...team, bttsRate: null, formGamesUsed: 0 };
      continue;
    }

    const seasonAvgFor = average(log.map((g) => g.scored));
    const seasonAvgAgainst = average(log.map((g) => g.conceded));

    const recent = log.slice(-RECENT_GAMES);
    const recentAvgFor = average(recent.map((g) => g.scored));
    const recentAvgAgainst = average(recent.map((g) => g.conceded));

    const forRatio = seasonAvgFor ? recentAvgFor / seasonAvgFor : 1;
    const againstRatio = seasonAvgAgainst ? recentAvgAgainst / seasonAvgAgainst : 1;

    const bttsRate = log.filter((g) => g.scored > 0 && g.conceded > 0).length / log.length;

    adjusted[id] = {
      ...team,
      goalsForHome: team.goalsForHome * forRatio,
      goalsForAway: team.goalsForAway * forRatio,
      goalsAgainstHome: team.goalsAgainstHome * againstRatio,
      goalsAgainstAway: team.goalsAgainstAway * againstRatio,
      bttsRate: Number(bttsRate.toFixed(3)),
      formGamesUsed: recent.length,
    };
  }

  return adjusted;
}

module.exports = { applyFormAndHistory };
