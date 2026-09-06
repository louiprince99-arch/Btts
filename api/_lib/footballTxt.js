// Minimal parser for the openfootball "Football.TXT" format.
// Handles the two line shapes that matter for fixtures:
//   [Aug/15]                          <- date header, applies to lines below
//   Newport County 3-0 Rochdale       <- played match (score)
//   Newport County v Rochdale         <- not yet played (no score)
// Anything else (headers, blank lines, "= Div1" section markers) is ignored.

const DATE_LINE = /^\[([A-Za-z]{3})\/?\s*(\d{1,2})\]/;
const SCORED_LINE = /^(.+?)\s+(\d+)-(\d+)\s+(.+)$/;
const UNPLAYED_LINE = /^(.+?)\s+v\s+(.+)$/i;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function inferYear(monthIndex, seasonStartYear) {
  // English seasons run Aug (start year) through May (start year + 1).
  return monthIndex >= 6 ? seasonStartYear : seasonStartYear + 1;
}

function parseFootballTxt(text, seasonStartYear) {
  const matches = [];
  let currentDate = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("=") || line.startsWith("#")) continue;

    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const monthIdx = MONTHS[dateMatch[1].toLowerCase()];
      const day = parseInt(dateMatch[2], 10);
      if (monthIdx !== undefined && !Number.isNaN(day)) {
        const year = inferYear(monthIdx, seasonStartYear);
        currentDate = new Date(Date.UTC(year, monthIdx, day));
      }
      continue;
    }

    if (!currentDate) continue; // fixture line before any date header — skip

    const scored = line.match(SCORED_LINE);
    if (scored) {
      matches.push({
        date: currentDate.toISOString().slice(0, 10),
        team1: scored[1].trim(),
        team2: scored[4].trim(),
        played: true,
      });
      continue;
    }

    const unplayed = line.match(UNPLAYED_LINE);
    if (unplayed) {
      matches.push({
        date: currentDate.toISOString().slice(0, 10),
        team1: unplayed[1].trim(),
        team2: unplayed[2].trim(),
        played: false,
      });
    }
  }

  return matches;
}

module.exports = { parseFootballTxt };
