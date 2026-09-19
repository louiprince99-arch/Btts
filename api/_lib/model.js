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

// Match result probabilities from the same expected goals, assuming
// independent Poisson scorelines (0-10 goals each side).
function poissonPmf(lambda, maxGoals = 10) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= maxGoals; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}

function resultProbabilities(homeLambda, awayLambda) {
  const h = poissonPmf(homeLambda);
  const a = poissonPmf(awayLambda);
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < h.length; i++) {
    for (let j = 0; j < a.length; j++) {
      const p = h[i] * a[j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away; // renormalise the tiny >10-goal tail
  return { home: home / total, draw: draw / total, away: away / total };
}

module.exports = { bttsProbability, resultProbabilities };
