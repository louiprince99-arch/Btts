// Adjusts each team's raw season xG-for/xG-against rate by the
// average quality (points-per-game) of the opponents they've actually
// faced so far — a cheap proxy for strength-of-schedule bias, without
// needing per-match team-level xG (which isn't available without many
// extra API calls).
//
// A team that's padded its xG-for against weak opponents gets that
// number discounted; one that's done it against strong opponents gets
// a boost. Same idea in reverse for xG-against.

function ppg(team) {
  return team.played ? team.points / team.played : 0;
}

// standings: { [teamId]: { name, teamId, played, points, goalsForHome... } }
//   — must include `played` and `points` per team (raw, pre-xG-rate).
// matchups: [{ homeTeamId, awayTeamId }, ...] — every finished match.
function applyScheduleAdjustment(standings, matchups) {
  const teamIds = Object.keys(standings);
  if (!teamIds.length) return standings;

  const leagueAvgPpg =
    teamIds.reduce((sum, id) => sum + ppg(standings[id]), 0) / teamIds.length;
  if (!leagueAvgPpg) return standings; // no data yet (start of season) — skip adjustment

  const opponents = {}; // teamId -> [opponentTeamId, ...]
  for (const id of teamIds) opponents[id] = [];
  for (const m of matchups) {
    if (standings[m.homeTeamId] && standings[m.awayTeamId]) {
      opponents[m.homeTeamId].push(m.awayTeamId);
      opponents[m.awayTeamId].push(m.homeTeamId);
    }
  }

  const adjusted = {};
  for (const id of teamIds) {
    const team = standings[id];
    const oppList = opponents[id];
    const oppAvgPpg = oppList.length
      ? oppList.reduce((sum, oppId) => sum + (standings[oppId] ? ppg(standings[oppId]) : leagueAvgPpg), 0) / oppList.length
      : leagueAvgPpg; // no games yet — no adjustment

    const strengthRatio = oppAvgPpg / leagueAvgPpg; // >1 = tougher-than-average schedule faced

    adjusted[id] = {
      ...team,
      goalsForHome: team.goalsForHome * strengthRatio,
      goalsForAway: team.goalsForAway * strengthRatio,
      goalsAgainstHome: team.goalsAgainstHome / strengthRatio,
      goalsAgainstAway: team.goalsAgainstAway / strengthRatio,
      scheduleStrength: Number(strengthRatio.toFixed(2)), // exposed for transparency
    };
  }
  return adjusted;
}

module.exports = { applyScheduleAdjustment };
