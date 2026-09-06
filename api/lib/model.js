// Simple independent-Poisson BTTS model.
// P(team scores >=1 goal) = 1 - e^-lambda, lambda = expected goals.
// Expected goals blend the attacking team's scoring rate with the
// opponent's conceding rate (both venue-specific).

function pScores(lambda) {
  return 1 - Math.exp(-lambda);
}

function bttsProbability(homeStats, awayStats) {
  const homeLambda = (homeStats.goalsForHome + awayStats.goalsAgainstAway) / 2;
  const awayLambda = (awayStats.goalsForAway + homeStats.goalsAgainstHome) / 2;

  const pHomeScores = pScores(homeLambda);
  const pAwayScores = pScores(awayLambda);

  return {
    bttsProbability: pHomeScores * pAwayScores,
    homeExpectedGoals: Number(homeLambda.toFixed(2)),
    awayExpectedGoals: Number(awayLambda.toFixed(2)),
  };
}

module.exports = { bttsProbability };
