# Operations runbook

How to set up, run, check and repair Criclysis. It is written for an owner
who is not a database or CI specialist. Every step uses free tiers.

**The moving parts:**

- **GitHub Actions** runs the daily refresh (`.github/workflows/refresh.yml`).
  It downloads Cricsheet's files, builds the dataset with the Python pipeline,
  checks it, and loads it into the database.
- **Neon** hosts the PostgreSQL database (free tier, 0.5 GB storage cap).
- **Vercel** hosts the website, the Next.js app in `web/`. It only reads the
  database.

**Names used below.** Only names are given here; the values live in GitHub and
Vercel settings and must never be committed.

| Name | Kind | Where | Value |
|---|---|---|---|
| `DATABASE_URL` | secret | GitHub | Neon **direct** connection string |
| `DATABASE_URL` | environment variable | Vercel | Neon **pooled** connection string |
| `REVALIDATE_SECRET` | secret / environment variable | GitHub and Vercel | The same random string in both |
| `SITE_URL` | variable (not secret) | GitHub | The site's address, for example the Vercel URL |

---

## 1. First-time setup (web pages only)

You need accounts on GitHub, [Neon](https://neon.tech) and
[Vercel](https://vercel.com), and the repository on GitHub. Allow about 20
minutes. Button names below were correct when written; the sites change their
wording from time to time.

### Step 1: Create the database on Neon

1. Sign in to Neon and choose **New project**. Give it a name (for example
   `criclysis`). If asked for a Postgres version, choose 16, which CI tests
   against. Pick the region closest to your Vercel region.
2. On the project dashboard, choose **Connect**. A dialog shows a connection
   string.
3. Turn **Connection pooling off** and copy the string. This is the
   **direct** URL.
4. Turn **Connection pooling on** and copy the string again. This is the
   **pooled** URL; its host name contains `-pooler`.

Why two: the importer and migrations need the direct URL, because they hold a
database lock for the whole import and change the schema. A pooled connection
can't keep that lock. The website only reads, and the pooled URL copes better
with many short visits.

### Step 2: Add the GitHub secrets

1. Make the shared secret: a random string of 32 or more letters and digits.
   A password manager's generator is fine, or run one of these:
   - macOS or Linux: `openssl rand -hex 32`
   - Windows (PowerShell): `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })`
2. On GitHub, open the repository, then **Settings → Secrets and variables →
   Actions**.
3. Under **Secrets**, choose **New repository secret** twice:
   - `DATABASE_URL` = the Neon **direct** URL;
   - `REVALIDATE_SECRET` = the random string.

### Step 3: Run the first refresh

1. Open the repository's **Actions** tab and choose **Daily data refresh** on
   the left.
2. Choose **Run workflow**, tick **force**, leave **import** ticked, and
   confirm.
3. Open the run and wait. As a guide, the 9 Nov 2026 run took about 4–6
   minutes, of which the download took about 10 seconds.

**Success looks like:** the run is green. **Revalidate the site** shows as
skipped, because `SITE_URL` is not set yet. The run summary
starts with a **Refresh plan** table saying which steps ran and why. The
import step's log ends with `import complete in …s` and lists each table's
size and the total database size. The full-import database size has not been
written down yet; it will be measured on the first import, so record it from
that log.

### Step 4: Deploy the website on Vercel

1. Sign in to Vercel and choose **Add New… → Project**, then import the
   GitHub repository.
2. Next to **Root Directory**, choose **Edit** and select `web`. Vercel should
   detect Next.js.
3. Open **Environment Variables** and add:
   - `DATABASE_URL` = the Neon **pooled** URL;
   - `REVALIDATE_SECRET` = the same random string as on GitHub.
4. Choose **Deploy**. If Vercel asks for a Node.js version, choose 22.x, which
   CI uses.

**Success looks like:** the deployment finishes and Vercel shows the site's
address. Open it: the home page shows the match and delivery counts for the
current build. Then open `/api/health` on the same address (see section 4).

### Step 5: Connect the refresh to the site

1. On GitHub, open **Settings → Secrets and variables → Actions → Variables**.
2. Choose **New repository variable**: `SITE_URL` = the site's address from
   Vercel, starting with `https://`.

From now on, each refresh that imports new data also tells the site to drop
its cached pages, so new matches appear straight away.

---

## 2. The daily refresh, step by step

The workflow runs every day at **04:23 UTC**. GitHub often starts scheduled
runs late, so expect it some time after that. You can also start it by hand:
**Actions → Daily data refresh → Run workflow**.

### Inputs (manual runs only)

- **force** (off by default): rebuild and import even if Cricsheet's files
  are unchanged. Use it after changing pipeline code. It is **not** needed
  after a failed run: a failed run imports nothing, so the next run sees the
  files as changed anyway.
- **import** (on by default): off means build only. The run then skips the
  migration, the "unchanged" check, the import and the revalidation, and
  uploads the whole build as an artifact named `data-out-<run id>`, kept for
  3 days. Use it to inspect a build without touching the site.

Scheduled runs always import and never force.

### Steps

After checking out the code, **Plan the run** (`scripts/ci/refresh-plan.sh`)
decides which later steps may run and writes the reasons to the run summary.
Then:

| # | Step | What it does | Skipped when |
|---|---|---|---|
| 1 | Install web dependencies | `npm ci` in `web/` | no web step will run |
| 2 | Migrate the database | `npm run db:migrate`. Safe to repeat, so it runs even when nothing else will | import is off, or the `DATABASE_URL` secret is missing |
| 3 | Fetch the Cricsheet archives | `python -m pipeline fetch --refresh --no-mirror --formats test odi t20i`: three zips plus the people register, from cricsheet.org only | never |
| 4 | Fingerprint the archives | `python -m pipeline fingerprint`: a checksum of the downloaded files | never |
| 5 | Compare with the last import | `npm run check-fingerprint`: prints `changed` or `unchanged` against the last complete import | import is off, force is on, or no `DATABASE_URL` |
| 6 | Build men's and women's data | `python -m pipeline build --genders male female --photos`, between restoring and saving the weekly player-photo cache (`.cache/photos`). Photo counts and any Wikidata or Commons failure go to the run summary; a photo outage never fails the step | the files are unchanged |
| 7 | Fit the win-probability models | `python -m pipeline winprob --genders male female` | unchanged |
| 8 | Export replays | `python -m pipeline replays --all --genders male female` | unchanged |
| 9 | **Check the replays against the build** | `python -m pipeline verify-replays --data data/out` | unchanged |
| 10 | Summarise the build volume | writes a size table to the run summary | unchanged |
| 11 | Check the TypeScript win-probability port | `npm run test:golden` on the new `winprob.json` | unchanged |
| 12 | **Check the TypeScript replay engine against the build** | `npm run test:replays` on the new build | unchanged |
| 13 | Import into Postgres | `npm run import -- --data ../data/out`; the log is saved with the secret masked | unchanged, import off, or no `DATABASE_URL` |
| 14 | Revalidate the site | `POST $SITE_URL/api/revalidate` with the shared secret | no import, or `REVALIDATE_SECRET` or `SITE_URL` missing |
| 15 | Upload | with import on: `manifest.json`, `fingerprint.json` and the import report, kept 14 days; with import off: the whole build, kept 3 days | never |

**When the files are unchanged**, step 5 prints `unchanged`, steps 6–14 are
skipped, and the run ends green with the notice "Unchanged, skipped".

**Every step only runs if all earlier steps passed** (apart from the volume
summary and the uploads, which always run). A failed fetch, build, replay
check or golden test means the import never starts, and the site keeps
serving its current data.

**The two replay checks (steps 9 and 12)** run before the import. They replay
every match and compare the result with the rest of the build:

- each innings' runs, wickets, legal balls and penalty runs against
  `matches.json`;
- each bowler's balls, runs conceded, wickets and maidens against their player
  file;
- each team's top bowlers against the same figures summed over the replays
  (the Python check).

In the 9 Nov 2026 build all 10,009 replays agreed: 21,432 innings and 116,443
bowling innings in the Python check, and 109,118 bowling innings in the
TypeScript check.

**Schema changes.** A separate job in the same workflow runs
`npm run db:migrate` whenever a push to `main` changes `web/drizzle/`. It
shares the refresh's queue, so a migration never runs during an import.

**Inactivity.** GitHub turns off scheduled workflows in a public repository
after 60 days without activity in the repository. The site keeps serving its
last import and `/api/health` reports `stale`. To resume, open **Actions →
Daily data refresh**, choose **Enable workflow**, then **Run workflow** once.

---

## 3. What the importer guarantees

The importer is `web/scripts/import/index.mjs`. It is written so that a bad
build or a crash can't leave the site half-empty.

```bash
cd web
npm run import -- --data ../data/out [--allow-shrink] [--budget-mb 400] [--format-keys odi-w,t20i-w] [--report report.json]
```

| Exit code | Meaning |
|---|---|
| 0 | Imported |
| 1 | Error. Nothing was written, or the import stopped at a batch boundary |
| 2 | Imported, but the database is larger than `--budget-mb` |
| 3 | Another import holds the lock; nothing was done |

**One writer at a time.** The importer takes a Postgres advisory lock (a
named lock held for the session) before anything else, and exits with code 3
if another import holds it. The workflow's `refresh` queue also never runs
two refreshes at once. If a previous import was killed, its `running` record
is marked `aborted` at the start of the next one.

**Only changed rows are written.** Every row carries a hash of its content. An
upsert (insert, or update if it exists) only rewrites a row whose hash has
changed. Re-importing the same build changes 0 rows; CI checks this on every
pull request.

**Small transactions.** Reference data (teams, venues, matches, models) goes
in one transaction, players in batches of 50, replays in batches of 200, and
deletions in one final transaction. A failure stops at a batch boundary; the
next run only redoes rows whose hashes still differ. The importer also runs
`VACUUM (ANALYZE)` after every 1,000 changed player-formats, so space freed by
replaced rows is reused.

**Guards.** All of these run before any data is written:

- **Demo guard.** The build's `manifest.json` must say
  `provenance.dataset: "live"`, meaning real Cricsheet output. Anything else
  (for example simulated test data) is refused.
- **Shrink guard.** For each formatKey, the number of players, matches, team
  summaries and models must not fall more than 5% below the last complete
  import. The same applies to the total number of teams and venues. Matches
  marked as having a replay must still have a replay file. Otherwise the
  import stops with `Shrink guard: this build would delete data: …`. If the
  drop is expected, re-run with `--allow-shrink`.
- **Missing files.** If a whole input file is missing (for example
  `venues.json`), that entity is skipped with a warning and none of its
  stored rows are deleted.

**Budget guard.** After the import, the importer measures every table and the
whole database. If the database is larger than `--budget-mb` (default 400
MB, under Neon's 0.5 GB cap), it exits with code 2. The data is already
imported; the code is a warning that fails the workflow step so you notice.

**Partial runs.** `--format-keys odi-w,t20i-w` rewrites only those formatKeys
(their player records, matches, replays, team summaries and models). The run
is recorded as `partial`. It never becomes the active dataset, the
"unchanged" baseline or the shrink-guard baseline; those use complete runs
only.

**Run history.** Each import adds a row to the `dataset_meta` table with its
status (`running`, `complete`, `partial`, `failed` or `aborted`), counts and
per-table changes. The last 30 rows are kept, plus the latest complete one.

---

## 4. Checking health

Open `<your site>/api/health`. It is never cached.

| Response | Meaning |
|---|---|
| `{"ok":true,"dataset":{…,"stale":false}}` | Healthy |
| `{"ok":true,"dataset":{…,"stale":true}}` | The last complete import finished more than 72 hours ago |
| `{"ok":true,"dataset":null}` | The database is reachable but has never had a complete import |
| HTTP 500 with `{"ok":false}` | The site can't read the database |

`dataset` also holds `buildId`, `generatedAt` (when the build was made),
`importedAt` (when its import finished) and `ageHours` (hours since then).

`stale` is based on the last **import**, and an import only happens when
Cricsheet's files change. So `stale: true` has two possible causes:

- refreshes are failing or not running (see section 5); or
- Cricsheet has published nothing new for three days.

The Actions run history tells you which: green runs with the notice
"Unchanged, skipped" mean the second.

A free uptime monitor pointed at `/api/health` can alert you when `ok` is
false or `stale` is true.

---

## 5. When something goes wrong

In every case below, **the site keeps serving its last good data**. Nothing
is urgent unless `/api/health` returns `ok: false`.

### A refresh run failed

1. Open **Actions → Daily data refresh** and the failed run. Look at the
   **Refresh plan** table in the summary, then at the first red step.
2. By step:
   - **Fetch** failed: cricsheet.org was unreachable, or its `robots.txt`
     disallowed the download. Wait and choose **Re-run jobs**, or let the
     next day's run retry.
   - **Build, winprob or replays** failed: usually a pipeline bug or a new
     quirk in Cricsheet's data. The log names the match. Fix the code on a
     branch, merge it, then **Run workflow** (with **force** if Cricsheet's
     files haven't changed since).
   - **Replay checks** failed: see the next playbook.
   - **Golden test** failed: the TypeScript win-probability port no longer
     matches the Python model. Fix the port or the model; nothing was
     imported.
   - **Import** failed: the log says why. A guard is the common case (see
     below). Exit code 3 means another import held the lock; wait and
     re-run.
   - **Revalidate** failed: the data is imported, but the site may keep
     showing cached pages for up to 24 hours, until its caches expire. Check
     that `REVALIDATE_SECRET` matches in GitHub and Vercel, and that
     `SITE_URL` is the right address.
3. You don't need **force** to retry after a failure: no import happened, so
   the next run sees the files as changed.

### A guard stopped the import

- **Shrink guard.** First find out why the counts fell: the message lists
  each formatKey and count, as `before -> after`. Cricsheet occasionally
  removes or merges matches, which can be fine. A large drop usually means a
  build problem; fix that instead. If the drop is genuine:
  1. **Run workflow** with **import** off. Download the `data-out-<run id>`
     artifact from the run page and unzip it.
  2. On your computer (see section 6 for the tools), with `DATABASE_URL` set
     to the Neon **direct** URL in `web/.env`, run
     `npm run import -- --data <folder containing manifest.json> --allow-shrink`
     from `web/`.
  3. Delete `web/.env` afterwards if you don't need it.

  The workflow has no `--allow-shrink` input on purpose.
- **Demo guard.** Someone tried to import output that isn't real Cricsheet
  data. Don't override it; import a real build.
- **Budget guard (exit code 2).** See "The database is near Neon's cap".

### The replay check failed

The Python check prints up to 20 mismatches, for example
`1448350: JE Root (a343262c) bowled (balls, runs, wickets, maidens) [...] in the replay but [...] in their player file`.
The TypeScript check fails its test with a similar list. Nothing was imported.

It means the replay files and the statistics disagree about the same balls,
so one of them counts something differently, often a rare kind of extra or
dismissal. To investigate:

1. **Run workflow** with **import** off and download the artifact.
2. From the repository root:
   `python -m pipeline verify-replays --data <build folder> --max-errors 200`.
3. From `web/`: set `REPLAY_DATA_DIR` to the build folder and run
   `npm run test:replays`.
4. Open the named match on [cricsheet.org](https://cricsheet.org) and compare.
   Fix the counting on a branch, with a test, and merge. The next run picks
   it up.

### The database is near Neon's 0.5 GB cap

1. Find the current size. The import log (in the run's
   `refresh-report-<run id>` artifact, file `import-report.txt`) lists each
   table's size and the whole database, and Neon's dashboard shows storage.
2. The importer already vacuums as it goes, and only rewrites changed rows.
   Whether Neon also counts its history (restore window) against the cap is
   not verified (`docs/ARCHITECTURE.md` §7 R5); check Neon's storage page.
3. If the data has genuinely grown, the options are a paid Neon plan or a
   code change that stores less. Raising `--budget-mb` only silences the
   warning.

### Rotating a secret

- **Database password.** In Neon, reset the database role's password. Copy
  the new direct and pooled URLs. Update the GitHub secret `DATABASE_URL`
  (direct) and the Vercel variable `DATABASE_URL` (pooled). In Vercel,
  redeploy the latest deployment, because changed variables only apply to new
  deployments. Then check `/api/health`.
- **`REVALIDATE_SECRET`.** Make a new random string. Update it in GitHub and
  in Vercel, then redeploy on Vercel. Until both match, the revalidate step
  fails (the data is still imported).
- **Site address.** If the address changes (for example a custom domain),
  update the GitHub variable `SITE_URL`.

---

## 6. Local development

cricsheet.org is blocked from the development sandbox, so local work uses
the committed fixture `fixtures/data-out`: 110 men's matches (20 Tests, 40
ODIs, 50 T20Is), mostly between Australia, England, India and South Africa,
plus five other selected matches. The full corpus is only built and checked
on GitHub Actions.

**You need:** Python 3.11 or later (standard library only, nothing to
install), Node.js 22, and PostgreSQL 16.

**Database.** The simplest route on any operating system is Docker. This
starts PostgreSQL 16 on your own machine only, with the user, database and
port that `web/.env.example` expects:

```bash
docker run --name criclysis-db -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=criclysis -p 127.0.0.1:5432:5432 -d postgres:16
```

`trust` means no password, which is acceptable only for a database bound to
your own machine like this one. Without Docker, install PostgreSQL 16 from
[postgresql.org](https://www.postgresql.org/download/), create a database
named `criclysis`, and edit `DATABASE_URL` in `web/.env` to match your user
and password.

**Steps**, from the repository root:

```bash
python -m unittest discover -s tests -p "test_*.py"   # pipeline tests
cd web
npm ci
cp .env.example .env              # Windows: copy .env.example .env
npm run db:migrate
npm run import -- --data ../fixtures/data-out
npm run build
npm run start                     # http://localhost:3000
```

**Success looks like** (measured in the development sandbox on 9 Nov 2026):

- the Python tests end with `OK`;
- `db:migrate` ends with `migrations applied successfully!`;
- the first import reports `changes: 11902 rows` and a database of 10.6 MB,
  and ends with `import complete in …s` (0.6 s in the sandbox);
- importing again prints `changes: none (0 rows changed)`;
- `http://localhost:3000/api/health` shows `"ok":true` and the fixture's build
  id.

**Use the production build to check the UI.** `npm run dev` (`next dev`) is
fine for editing, but in some sandboxes its pages render and never hydrate:
they look right, but buttons and toggles do nothing. Check UI changes with
`npm run build` and `npm run start`.

**Other checks** (all run in CI):

```bash
# from web/
npm run typecheck
npm run lint
npm test              # all unit tests (vitest)
npm run test:golden   # TypeScript win-probability port vs Python (fixture's winprob.json)
npm run test:replays  # replay engine vs the fixture's matches and player files
```

**Full pipeline**, where cricsheet.org is reachable (not from the sandbox):

```bash
python -m pipeline --help
python -m pipeline fetch --formats test odi t20i
python -m pipeline build --genders male female   # add --photos for Wikimedia photos (needs query.wikidata.org and commons.wikimedia.org)
python -m pipeline winprob --genders male female
python -m pipeline replays --all --genders male female
python -m pipeline verify-replays --data data/out
```

Output goes to `data/out/`, which is not committed.
