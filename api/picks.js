const { computeCandidates, buildResponse } = require("./_lib/pickEngine");

// GET /api/picks?slate=midweek|saturday
// EFL Championship / League One / League Two. See _lib/pickEngine.js
// for the actual scoring pipeline — this file just picks the leagues
// and date window.

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

module.exports = async (req, res) => {
  try {
    const slate = req.query.slate === "saturday" ? "saturday" : "midweek";
    const { from, to } = windowForSlate(slate);
    const result = await computeCandidates(LEAGUES, from, to);
    res.status(200).json(buildResponse(slate, LEAGUES, from, to, result));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
