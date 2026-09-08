# Chirish and GLS BTTS Picks

Live BTTS (both teams to score) picks for the EFL Championship,
League One and League Two — generated on demand, ranked by our own
model rather than a black-box prediction.

## How it works

Tap **Generate** on the page. That triggers `/api/picks?slate=midweek`
and `/api/picks?slate=saturday`, which each do the following, live,
every time — nothing bundled, nothing cached, no cron:

1. **Work out the date window** — Tue–Thu for midweek, the coming
   Saturday for the weekend slate.
2. **Pull standings** for all three leagues from bzzoiro — each
   team's season xG-for/xG-against, divided by games played to get a
   per-game rate. Also pulls every finished match this season, to see
   who's actually played whom.
3. **Strength-of-schedule adjustment** — a team's xG rate gets scaled
   by the average points-per-game of the opponents they've actually
   faced so far, versus the league average. Padded stats from a soft
   run of fixtures get discounted; strong numbers against tough
   opponents get a boost. Uses opponents' *current* standing, not
   their standing at the time of that specific match — a fine
   early-season proxy, gets blunter as the season goes on and form
   shifts more.
4. **Pull fixtures** for the date window, also from bzzoiro, matched
   to the adjusted stats by bzzoiro's own team IDs (exact match,
   since both come from the same source).
5. **Calculate BTTS probability per fixture** — Poisson-based:
   `(1 − e^-λ_home) × (1 − e^-λ_away)`, where each λ blends a team's
   own (adjusted) scoring rate with the opponent's (adjusted)
   conceding rate, home/away specific.
6. **Rank and cut** — every fixture across all three leagues goes into
   one pool, sorted by BTTS probability, top 6 taken regardless of
   which league they come from. A league can end up with zero picks
   in a given slate if its fixtures don't rank highly enough that
   week — that's by design, not a bug.

## Setup (Vercel dashboard + GitHub web editor — no CLI needed)

1. Push these files to a GitHub repo, root layout as below.
2. Import into Vercel.
3. **Settings → Environment Variables** → add `BZZOIRO_API_KEY`.
4. Redeploy.

## Repo structure

```
btts-picker/
├── api/
│   ├── picks.js
│   └── _lib/
│       ├── bzzoiro.js          (all live data — standings, fixtures, matchups)
│       ├── fixtures.js         (fixtures dispatcher — currently just bzzoiro)
│       ├── scheduleAdjust.js   (strength-of-schedule adjustment)
│       ├── teamMatch.js        (name-based fallback matcher, rarely needed now)
│       └── model.js            (Poisson BTTS calc)
├── index.html
├── package.json
└── README.md
```

## Pages

- `/` — the picks page. Nothing loads until you tap Generate.
- `/api/picks?slate=midweek` — raw JSON, Tue–Thu fixtures
- `/api/picks?slate=saturday` — raw JSON, Saturday fixtures

Response includes `candidateCountByLeague` (how many fixtures were
scored per league before trimming to the top 6 — useful for checking
whether a league is missing because of a real fetch problem, or just
got outranked that week), plus `unmatchedFixtures` and `leagueErrors`
for anything that failed to load or match cleanly.

## Notes

- Times shown are always UK time (`Europe/London`), regardless of
  device settings.
- We tried API-Football, football-data.org, footballdata.io, and
  openfootball before landing here — none had free, current-season,
  automatic coverage of all three English divisions together.
  bzzoiro (a small, newer provider) does, plus real standings-level
  xG, which made building our own model on top of it possible.
