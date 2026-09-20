// Finishing quality: does a team actually convert the xG it creates?
//
// ratio = actual goals per game / xG per game (season to date)
//   < 1  -> wasteful (creating chances, not scoring them)
//   > 1  -> clinical
//
// Small samples are noisy, so the ratio is shrunk toward 1.0 based on
// games played (weight = n / (n + SHRINK_GAMES)) and clamped, so one
// freak result can't swing a team's numbers too far. The result scales
// the team's scoring rate only (goalsForHome / goalsForAway).
//
// Example: 6 games, 0.5 goals/game from 1.2 xG/game -> raw 0.42,
// weight 0.5 -> factor ~0.71, i.e. their xG gets marked down ~29%.

const SHRINK_GAMES = 6;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.25;

// stats: output of getStandings (goalsForHome = season xG per game)
// played: output of getPlayedMatches for the same league
function applyFinishing(stats, played) {
  const goals = {};
  const games = {};
  for (const m of played) {
    goals[m.homeTeamId] = (goals[m.homeTeamId] || 0) + m.homeScore;
    goals[m.awayTeamId] = (goals[m.awayTeamId] || 0) + m.awayScore;
    games[m.homeTeamId] = (games[m.homeTeamId] || 0) + 1;
    games[m.awayTeamId] = (games[m.awayTeamId] || 0) + 1;
  }

  const out = {};
  for (const [id, team] of Object.entries(stats)) {
    const n = games[id] || 0;
    const xgPerGame = team.goalsForHome;
    let factor = 1;

    if (n > 0 && xgPerGame > 0) {
      const ratio = goals[id] / n / xgPerGame;
      const weight = n / (n + SHRINK_GAMES);
      factor = 1 + weight * (ratio - 1);
      factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
    }

    out[id] = {
      ...team,
      goalsForHome: team.goalsForHome * factor,
      goalsForAway: team.goalsForAway * factor,
      finishingFactor: Number(factor.toFixed(2)),
    };
  }
  return out;
}

module.exports = { applyFinishing };
