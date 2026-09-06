# BTTS Picker

Weekly BTTS (both teams to score) accumulator picks for the EFL
Championship, League One and League Two, ranked by a Poisson model
built from each team's home/away scoring and conceding averages.

No free source gives real xG for these three leagues, so this uses
goals-for/against averages instead — same shape of model, swap in
xG later (e.g. FootyStats API) if you upgrade.

Everything is computed live, on request — no cron jobs, no stored
history, no database. Loading the page calls the API-Football API
there and then.

## Setup (Vercel dashboard + GitHub web editor — no CLI needed)

1. **Push these files** to a new GitHub repo (upload via the web
   editor, or drag the folder into github.com/new).
2. **Import the repo into Vercel** as a new project.
3. In **Settings → Environment Variables**, add:
   - `FOOTBALL_API_KEY` — your API-Football key
   - `FOOTBALL_API_PROVIDER` — `direct` if the key is from
     api-football.com directly, or `rapidapi` if it's a RapidAPI key
4. Redeploy. That's it — open the site and it fetches picks live.

## Pages

- `/` — the picks page (loads both slates)
- `/api/picks?slate=midweek` — Tue–Thu fixtures, raw JSON
- `/api/picks?slate=saturday` — Saturday fixtures, raw JSON

## Rate limit — read this

API-Football's free tier is **100 requests/day**. Each full call to
`/api/picks` costs roughly:

- 1 request per league to list teams (3 total)
- 1 request per team for stats (~72 total across all three leagues)
- 1 request per league for fixtures (3 total)

≈ **78 requests per slate call**. Loading the page (both slates)
costs ~156 requests — already over the free daily limit in one page
load. Practically:

- Load the page **once a day at most**, ideally only when you
  actually want to check picks.
- If you refresh a few times while testing, you'll burn through the
  quota fast — API-Football just starts erroring until the quota
  resets at midnight UTC.
- If this becomes annoying, the fix is to cache team stats (they
  only change slowly) and only re-fetch fixtures live — happy to
  add that back in if you change your mind on avoiding storage.

## Notes

- League IDs are fixed to Championship=40, League One=41, League
  Two=42 (API-Football's standard IDs) and filtered by season, so
  cup competitions and other seasons are never included.
- BTTS probability = `(1 − e^-λ_home) × (1 − e^-λ_away)`, an
  independence assumption — good enough for ranking, not a true
  bivariate model.
