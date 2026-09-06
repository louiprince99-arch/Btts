# BTTS Picker

Weekly BTTS (both teams to score) picks for the EFL Championship,
League One and League Two, ranked by a Poisson model built from real
match xG — not a paid API, just two free public sources:

- **Stats (with real xG):** football-data.co.uk's public season CSVs,
  fetched directly by the server. No signup, no key.
- **Fixtures:** `openfootball/football.json` on GitHub — free, no key,
  confirmed to cover all three English divisions.

No `FOOTBALL_API_KEY` / `FOOTBALL_DATA_API_KEY` / anything — this
version needs **no environment variables at all**.

## Why this took a few tries

API-Football's free tier only allows 2022-2024 seasons (no current
season, at any price point below Pro). football-data.org's catalog
doesn't include League One or League Two at all. footballdata.io's
free plan covers neither, and League Two isn't in their catalog even
on their paid Pro plan. Combining two independent free public data
sources was the option that actually covers all three leagues, live,
for free.

The trade-off: the two sources name teams slightly differently
("Nott'm Forest" vs "Nottingham Forest"), so a small number of
fixtures may get skipped if the matcher can't confidently pair them —
these are reported in the response (`unmatchedFixtures`) and shown
under each list on the page, rather than silently guessed.

## Setup (Vercel dashboard + GitHub web editor — no CLI needed)

1. Push these files to a GitHub repo, root layout as below.
2. Import into Vercel.
3. Deploy — no environment variables to configure.

## Repo structure

```
btts-picker/
├── api/
│   ├── picks.js
│   └── _lib/
│       ├── footballDataCoUk.js   (stats + xG)
│       ├── openfootball.js       (fixtures)
│       ├── teamMatch.js          (name resolution between sources)
│       └── model.js              (Poisson BTTS calc)
├── index.html
├── package.json
└── README.md
```

## Pages

- `/` — the picks page (both slates)
- `/api/picks?slate=midweek` — Tue–Thu fixtures, JSON
- `/api/picks?slate=saturday` — Saturday fixtures, JSON

## Notes

- BTTS probability = `(1 − e^-λ_home) × (1 − e^-λ_away)`, using each
  team's average home/away xG-for and xG-against — an independence
  assumption, good enough for ranking, not a true bivariate model.
- Season/competition are inferred from the current date and matched
  by file/CSV naming — no cups, since neither source's league
  files include cup fixtures.
- If football-data.co.uk changes their CSV column names, or
  openfootball renames a season's files, the relevant fetch will
  throw a clear error rather than fail silently — check `/api/picks`
  directly if picks stop appearing.
