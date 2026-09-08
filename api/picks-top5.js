const { computeCandidates, buildResponse } = require("./_lib/pickEngine");

// GET /api/picks-top5
// Premier League, La Liga, Serie A, Bundesliga, Ligue 1 — weekend
// fixtures only (Saturday 00:00 through Sunday 23:59 UK time), since
// that's when these five actually play the bulk of their games.
// Same scoring pipeline as the EFL picker, see _lib/pickEngine.js.

const LEAGUES = ["premier_league", "la_liga", "serie_a", "bundesliga", "ligue_1"];

function nextWeekday(from, targetDay) {
  const d = new Date(from);
  const diff = (targetDay - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weekendWindow() {
  const now = new Date();
  const sat = nextWeekday(now, 6);
  const sun = new Date(sat);
  sun.setUTCDate(sun.getUTCDate() + 1);
  sun.setUTCHours(23, 59, 59, 0);
  return { from: sat, to: sun };
}

module.exports = async (req, res) => {
  try {
    const { from, to } = weekendWindow();
    const result = await computeCandidates(LEAGUES, from, to);
    res.status(200).json(buildResponse("weekend", LEAGUES, from, to, result));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
