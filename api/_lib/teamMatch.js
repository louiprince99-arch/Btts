// football-data.co.uk and openfootball name teams differently
// ("Nott'm Forest" vs "Nottingham Forest", "Wolves" vs "Wolverhampton
// Wanderers"). This resolves a name from one source to the matching
// stats entry from the other — exact/alias match first, fuzzy
// fallback second. Unmatched names are reported by the caller rather
// than guessed.

// Well-known football-data.co.uk abbreviations -> their common full name.
// Only includes ones that are genuinely ambiguous to auto-match;
// straightforward name pairs are left to the fuzzy matcher below.
const ALIASES = {
  "nott'm forest": "nottingham forest",
  "sheffield weds": "sheffield wednesday",
  wolves: "wolverhampton wanderers",
  "west brom": "west bromwich albion",
  "man utd": "manchester united",
  "man united": "manchester united",
  "man city": "manchester city",
  qpr: "queens park rangers",
  "milton keynes dons": "mk dons",
  "bristol rvs": "bristol rovers",
  preston: "preston north end",
  peterboro: "peterborough united",
  "newport county": "newport county afc",
  spurs: "tottenham hotspur",
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.'']/g, "")
    .replace(/\bfc\b|\bafc\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(name) {
  return new Set(normalize(name).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

// Builds a lookup so resolve() can find a statsByName entry for any
// fixture-source team name.
function buildResolver(statsByName) {
  const normalizedIndex = {};
  for (const name of Object.keys(statsByName)) {
    normalizedIndex[normalize(name)] = name;
  }

  return function resolve(fixtureName) {
    const norm = normalize(fixtureName);

    if (normalizedIndex[norm]) return statsByName[normalizedIndex[norm]];

    const aliased = ALIASES[norm];
    if (aliased && normalizedIndex[normalize(aliased)]) {
      return statsByName[normalizedIndex[normalize(aliased)]];
    }
    for (const [abbrev, full] of Object.entries(ALIASES)) {
      if (normalize(full) === norm && normalizedIndex[normalize(abbrev)]) {
        return statsByName[normalizedIndex[normalize(abbrev)]];
      }
    }

    for (const [candidateNorm, originalName] of Object.entries(normalizedIndex)) {
      if (candidateNorm.includes(norm) || norm.includes(candidateNorm)) {
        return statsByName[originalName];
      }
    }

    let best = null;
    let bestScore = 0;
    for (const originalName of Object.keys(statsByName)) {
      const score = jaccard(fixtureName, originalName);
      if (score > bestScore) {
        bestScore = score;
        best = originalName;
      }
    }
    if (best && bestScore >= 0.5) return statsByName[best];

    return null;
  };
}

module.exports = { buildResolver, normalize };
