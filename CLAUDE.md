# Criclysis: project guide

A portfolio project: cricket analytics for every international team, built from
real ball-by-ball data.

## The four things this project must deliver

1. **Match analysis for every international team.** Men's and women's Tests,
   ODIs and T20Is, including associate nations: results, head-to-head, venues,
   formats and seasons.
2. **Analysis of cricketers.** Career records, strengths and weaknesses measured
   against comparable players, matchups by bowling type and phase, and form.
3. **Live tracking without any API.**
   - No live-score API, no API keys and no paid plans, ever.
   - "Live" means two things:
     (a) a scheduled GitHub Action downloads Cricsheet's public daily files and
     refreshes the database, so new internationals appear within about a day;
     (b) a replay engine plays real historical matches ball by ball, with
     win probability, projected and par scores, matchup cards and player
     strengths and weaknesses.
   - Do not scrape live-score websites.
4. **A clean UI.** Modern, fast, accessible and responsive from 360px up. Every
   view has loading, empty and error states.

## Non-negotiables

- **Never fabricate data.**
  - Every number shown must trace back to Cricsheet data.
  - No random generators, hand-typed ratings or "simulated" matches presented
    as real.
  - If something can't be measured (fielding, fitness), leave it out rather
    than invent it.
- Show the sample size behind statistical claims, and hide findings below the
  sample threshold.
- Credit Cricsheet (CC BY 4.0) wherever its data is shown.
- Secrets live only in GitHub and Vercel secrets. Never commit `.env`.

## Layout

| Path | What |
|---|---|
| `pipeline/` | Python 3.11+, standard library only. Downloads Cricsheet, aggregates, analyses, fits the win-probability model and exports replays. CLI: `python -m pipeline --help` |
| `tests/` | Python unit tests: `python -m unittest discover -s tests -p "test_*.py"` |
| `web/` | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + Drizzle ORM + PostgreSQL + Recharts |
| `web/scripts/import/` | Importer from a build (`data/out`) into Postgres, and the fingerprint check: `npm run import`, `npm run check-fingerprint` |
| `data/` | Small reference data (bowling styles). Generated output goes to `data/out/` and is gitignored |
| `fixtures/` | Committed builds for local work and CI: `data-out/` (110 men's matches, v2) and `data-out-v1/` (older men's sample for importer tests) |
| `scripts/ci/` | CI helpers: refresh plan, smoke test and routes, log redaction, build-volume summary, and their tests |
| `docs/` | `ARCHITECTURE.md` (design and output contract), `DATA_SOURCES.md` (sources, licences, coverage), `WINPROB.md` (win-probability method and validation), `OPERATIONS.md` (setup, refresh, recovery, local development), `screenshots/` |
| `.github/workflows/` | CI (`ci.yml`), plus the daily data refresh (`refresh.yml`) |

## Working conventions

- Each piece of work goes on a feature branch with a PR into `main`; CI must be
  green before merging.
- Before calling work done, run the checks:
  - pipeline: Python tests;
  - web: `npm run typecheck`, `npm run lint` and `npm run build`.
- Verify UI in a production build (`next build && next start`), not
  `next dev`: in this environment dev mode can render pages that never
  hydrate.
- No Cricsheet archives can be downloaded from the development sandbox:
  cricsheet.org is blocked, and the pipeline's robots.txt check refuses the
  GitHub-release mirror in `pipeline/sources/cricsheet.py`. Work locally
  against the committed fixture `fixtures/data-out` (110 men's matches). The
  full corpus, men's and women's, is built and checked only on GitHub
  Actions (`refresh.yml`).
- Hosting is free tier: Vercel for the web app, Neon for Postgres.
