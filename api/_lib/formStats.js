// Two things computed from real match results (goals, not xG):
//
// 1. Recent-form weighting — split by venue. A team's home xG rate
//    gets nudged by their recent HOME games vs their season home
//    average; their away rate by recent AWAY games vs their season
//    away average. A team can be in great home form and poor away
//    form at the same time — this keeps those separate rather than
//    blending them into one combined "form" number.
// 2. Historical BTTS rate — plain fact: in what fraction of this
//    team's games so far did both sides score. Not venue-split (kept
//    as one overall figure), used only as a sanity check elsewhere.

const RECENT_GAMES = 5;
const MIN_GAMES_FOR_FORM = 2; // don't adjust off 1 home game, too noisy

function perTeamMatchLog(teamId, matches) {
  return matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .map((m) => {
      const isHome = m.homeTeamId === teamId;
      return {
        date: m.date,
        isHome,
        scored: isHome ? m.homeScore : m.awayScore,
        conceded: isHome ? m.awayScore : m.homeScore,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function average(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

// Returns { forRatio, againstRatio } comparing this venue's recent
// games to this venue's season average — or {1, 1} if too few games
// have been played at that venue yet to say anything meaningful.
function venueFormRatio(venueLog) {
  if (venueLog.length < MIN_GAMES_FOR_FORM) return { forRatio: 1, againstRatio: 1 };

  const seasonAvgFor = average(venueLog.map((g) => g.scored));
  const seasonAvgAgainst = average(venueLog.map((g) => g.conceded));
  const recent = venueLog.slice(-RECENT_GAMES);
  const recentAvgFor = average(recent.map((g) => g.scored));
  const recentAvgAgainst = average(recent.map((g) => g.conceded));

  return {
    forRatio: seasonAvgFor ? recentAvgFor / seasonAvgFor : 1,
    againstRatio: seasonAvgAgainst ? recentAvgAgainst / seasonAvgAgainst : 1,
  };
}

// stats: output of getStandings, optionally already schedule-adjusted
// matches: output of bzzoiro.getPlayedMatches for the same league
function applyFormAndHistory(stats, matches) {
  const adjusted = {};

  for (const [id, team] of Object.entries(stats)) {
    const log = perTeamMatchLog(Number(id), matches);

    if (!log.length) {
      adjusted[id] = { ...team, bttsRate: null, formGamesUsed: 0 };
      continue;
    }

    const homeLog = log.filter((g) => g.isHome);
    const awayLog = log.filter((g) => !g.isHome);

    const homeForm = venueFormRatio(homeLog);
    const awayForm = venueFormRatio(awayLog);

    const bttsRate = log.filter((g) => g.scored > 0 && g.conceded > 0).length / log.length;

    adjusted[id] = {
      ...team,
      goalsForHome: team.goalsForHome * homeForm.forRatio,
      goalsAgainstHome: team.goalsAgainstHome * homeForm.againstRatio,
      goalsForAway: team.goalsForAway * awayForm.forRatio,
      goalsAgainstAway: team.goalsAgainstAway * awayForm.againstRatio,
      bttsRate: Number(bttsRate.toFixed(3)),
      homeFormGamesUsed: Math.min(homeLog.length, RECENT_GAMES),
      awayFormGamesUsed: Math.min(awayLog.length, RECENT_GAMES),
    };
  }

  return adjusted;
}

module.exports = { applyFormAndHistory };
