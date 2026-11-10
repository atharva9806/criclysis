# Data sources and provenance

This file records where every field on Criclysis comes from, under what
licence, and what the data does *not* cover. Counts are from the 9 Nov 2026
build (GitHub Actions run 42620030605); the data is refreshed daily.

In short:

| Source | What it provides | Licence |
|---|---|---|
| [Cricsheet](https://cricsheet.org) JSON archives | Every ball of every match: batter, bowler, runs, extras, wickets, plus match info | CC BY 4.0 |
| Cricsheet people register (`register/people.csv`) | A link from ESPNcricinfo player ids to Cricsheet person ids, used to attach bowling styles and photos | CC BY 4.0 |
| `data/player_styles.csv` | Bowling style, batting hand, role and country | Not open data; see section 2 |
| `data/styles.csv` | 72 hand-curated corrections | Part of this repository |
| [Wikidata](https://www.wikidata.org) and [Wikimedia Commons](https://commons.wikimedia.org) | Player photos, each with its author and licence; never a number | Per image: CC0, public domain, CC BY, CC BY-SA or GODL-India; see section 3 |

Nothing else is used. There is no live-score API, no scraping and no paid
feed. The pipeline uses the network in two places: `python -m pipeline fetch`,
which downloads Cricsheet's files, and `python -m pipeline build --photos`,
which asks Wikidata and Commons for photos (section 3).

## 1. Ball-by-ball match data: Cricsheet

Every delivery on the site comes from [Cricsheet](https://cricsheet.org).

- **Files.** `python -m pipeline fetch` downloads one zip per format from
  `cricsheet.org/downloads/`: `tests_json.zip`, `odis_json.zip` and
  `t20s_json.zip`. Each zip holds men's and women's matches side by side;
  each match's `info.gender` tells them apart.
- **Licence.** Cricsheet publishes the data under the
  [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/),
  which requires credit wherever the data appears.
- **Credit.** The site credits Cricsheet (CC BY 4.0) in the footer and on
  every data view, together with the "data as of" date. The build also writes
  the credit into `manifest.json`, every replay file and `winprob.json`.
- **Politeness.** All downloads go through `pipeline/net.py`. It sends an
  honest User-Agent, checks `robots.txt` before every host, waits at least two
  seconds between requests to the same host, and caches what it downloads.
  If `robots.txt` disallows a file, or the host can't be reached to check it,
  nothing is requested.

### Coverage: read this before trusting a career total

As of the 9 Nov 2026 build (refreshed daily): 10,009 matches, 201 teams and
382 venues, with data through 2 Nov 2026.

| formatKey | Matches | Deliveries | Players | Venues | First match | Last match |
|---|---|---|---|---|---|---|
| `test-m` (men's Tests) | 899 | 1,730,523 | 1,071 | 100 | 2001-12-19 | 2026-10-28 |
| `odi-m` (men's ODIs) | 2,617 | 1,388,575 | 2,018 | 186 | 2002-06-27 | 2026-11-02 |
| `t20i-m` (men's T20Is) | 3,649 | 820,257 | 4,814 | 241 | 2005-02-17 | 2026-11-01 |
| `test-w` (women's Tests) | 24 | 46,751 | 154 | 19 | 2003-02-22 | 2026-07-10 |
| `odi-w` (women's ODIs) | 620 | 324,698 | 703 | 128 | 2007-01-22 | 2026-10-28 |
| `t20i-w` (women's T20Is) | 2,200 | 499,829 | 2,795 | 238 | 2009-06-18 | 2026-10-25 |

"Players" here counts everyone who batted or bowled in that formatKey. A
player gets a profile page once they have faced 60 balls, or bowled 240 balls
or taken 5 wickets, in at least one format: 5,329 players in this build.

**Ball-by-ball data does not reach back to the start of international
cricket.** A career that began before coverage starts is counted only from
that point, so some totals are partial and will not match the player's full
career record. Women's Tests are thin: 24 matches in total. The site computes
the coverage range from the data and shows it on the home page, on every
player profile and on the Method page, so the limitation travels with the
numbers.

### Identity

Players are keyed by Cricsheet's person id (`info.registry` in each match
file), never by name. Two cricketers who share a name stay separate.

### The GitHub-release mirror (in the code, not used)

`pipeline/sources/cricsheet.py` lists one fallback mirror in `MIRRORS`: GitHub
Release copies of the men's archives. It is not used, for three reasons:

- The daily refresh passes `--no-mirror`, so it downloads from cricsheet.org
  only.
- The mirror is incomplete. It has no women's archives, no Afghanistan
  matches, and its latest match is 2026-06-28 (`docs/ARCHITECTURE.md` §7 R2).
- When checked from the development sandbox on 9 Nov 2026, the pipeline's
  `robots.txt` check refused the mirror's URLs, so the fallback downloads
  nothing.

Mirrored data would still be Cricsheet data under CC BY 4.0, with the same
credit obligation.

## 2. Bowling style and batting hand

Cricsheet names the bowler for every ball but never says **what kind of
bowler** they are. That one attribute is what the matchup analysis ("against
left-arm wrist spin in the middle overs") turns on. It comes from two local
files, joined in [`pipeline/enrich.py`](../pipeline/enrich.py). Nothing is
fetched for it.

### `data/player_styles.csv`

- **Contents.** 14,419 rows. Every row has a name and an ESPNcricinfo player
  id; 11,996 have a bowling style and 14,395 a batting hand (counted from the
  file).
- **Provenance, as far as the repository records it.** The file header says
  it was generated by
  [`pipeline/sources/playermeta.py`](../pipeline/sources/playermeta.py). That
  module describes its input as "a published player-metadata table" whose
  attributes "ultimately originate from public player profiles", and says the
  rows carry ESPNcricinfo ids. The file arrived in this repository in commit
  `b3ef4a8` (8 Oct 2026), ported with the rest of the pipeline from an earlier
  project. **The exact upstream table, its author and its licence are not
  recorded anywhere in the repository, so they are unknown.**
- **Licensing caveat.** These attributes are not open data in the way
  Cricsheet is. Treat the file as convenience metadata, not a redistributable
  dataset. Before publishing or commercialising a deployment, source the
  attributes from a feed you are licensed to use and pass it in with
  `python -m pipeline build --styles-file your.csv`.

### `data/styles.csv`

72 hand-curated rows for frequently seen international bowlers, marked
`source=curated`. It arrived in the same commit; who curated it, and from what
reference, is not recorded. It is the place for corrections.

### How a row finds its player

The layers are applied in rising order of precedence: `player_styles.csv`,
then an optional `--styles-file`, then `styles.csv`, which nothing overrides.
A row attaches to a player:

- **by id,** when its ESPNcricinfo id maps to a Cricsheet person id through
  Cricsheet's people register (`register/people.csv`, downloaded by `fetch`).
  An ESPNcricinfo id that the register gives to two people is ignored;
- **by name,** only when the name belongs to exactly one person in the corpus
  (both genders), appears on exactly one row of the file, and the row's
  country is a team that person played for.

Otherwise the player gets no style rather than a guessed one. In the 9 Nov
2026 build, 6,718 players were resolved by id, 65 by name, and 1 was rejected
because its name belongs to more than one person. 5,650 players have a
bowling style and 6,776 a batting hand.

Bowlers with no style drop out of the bowling-type splits only; every other
statistic is unaffected. Bowlers still missing a style, per formatKey:

| `test-m` | `odi-m` | `t20i-m` | `test-w` | `odi-w` | `t20i-w` |
|---|---|---|---|---|---|
| 11 | 59 | 711 | 2 | 36 | 510 |

The Method page shows the same per-format count from the current build.

## 3. Player photos: Wikidata and Wikimedia Commons

Photos are optional decoration on the player page, never data. `build
--photos` (`pipeline/photos.py`), which the daily refresh runs, finds them by
id only:

1. Cricsheet's people register gives each player's ESPNcricinfo ids
   (`key_cricinfo`, `key_cricinfo_2`).
2. One SPARQL query to the Wikidata Query Service lists every item with an
   ESPNcricinfo player id (property P2697) and its image (P18). The same
   query reads P2697's formatter URL, and the join is refused unless it
   points at espncricinfo.com.
3. The Commons API, 50 files per call, gives each image's 480px thumbnail,
   author (`Artist`, as plain text) and licence (`LicenseShortName`,
   `LicenseUrl`).

- **Licences.** Only CC0, public domain, CC BY and CC BY-SA (any version) and
  the Government Open Data Licence – India (GODL-India, reuse with
  attribution; many Indian government photos) are kept. Everything else
  (GFDL, NonCommercial, NoDerivatives, others) is dropped and counted in the
  build log.
- **Titles.** P18 values are percent-decoded and normalised as MediaWiki
  does (underscores to spaces, NFC, first letter upper case); Commons' own
  `normalized` and `redirects` (renamed files) map its answers back.
  Commons gives a thumbnail URL for only some of the files in each request,
  so files answered without one are asked for again.
- **Hosts.** A thumbnail is used only from `upload.wikimedia.org`, or from
  `commons.wikimedia.org` under `/w/thumb.php` or `/wiki/Special:FilePath/`,
  and a file page only from `commons.wikimedia.org/wiki/File:` (or its
  mobile host), all as https; anything else is refused, so the site never
  hotlinks from another host. Without a thumbnail, the original on
  `upload.wikimedia.org` is scaled with `Special:FilePath/<name>?width=480`.
- **Credit.** Every photo is shown with "Photo: author, licence", linked to
  the file's Commons page and the licence. The Method page explains the
  source. Nothing comes from Cricbuzz, ESPNcricinfo or photo agencies.
- **Nothing guessed.** An ESPNcricinfo id claimed by two Wikidata items, a
  player whose ids lead to two items, and an item two players lead to all
  get no photo.
- **Politeness.** A User-Agent naming the project and its repository, two
  seconds between requests, `maxlag`, and few calls: one query and about one
  Commons call per 50 photos, then nothing for six days (the answers are
  cached in `.cache/photos/photos.json`, which the refresh keeps between runs).
  `pipeline/net.py` exempts exactly the two API endpoints from its
  `robots.txt` check: Wikimedia's `robots.txt` addresses crawlers, and these
  are documented APIs for programs.
- **Outages.** If Wikidata or Commons is down or slow, the build uses the
  cached answers, however old, or builds without photos. It never fails
  because of them.

## What is not in the data

- **Ball tracking:** line, length, speed, swing and turn. No openly licensed
  ball-by-ball dataset carries them, so the site makes no claims about them.
- **Shot direction and field placement.**
- **Fielding quality and fitness.** They can't be measured from this data, so
  they are left out.
- **Domestic and franchise cricket.** `fetch` can download the IPL, BBL and
  PSL archives, but `build` only accepts Tests, ODIs and T20Is.

## Known limitations

- **Partial careers** for players whose careers began before ball-by-ball
  coverage (see Coverage above).
- **One person id, two people.** Four Cricsheet person ids appear in both
  men's and women's matches. In each case Cricsheet's registry gives one id
  to two different people:

  | Name | Women's side | Men's side |
  |---|---|---|
  | Hassan Nawaz | Singapore | Pakistan |
  | N Magagula | Eswatini | Swaziland |
  | S Ravikumar | Sri Lanka | Costa Rica |
  | Dilum Fernando | Bahrain | Romania |

  A profile has one gender, so the build keeps the side with more balls faced
  or bowled and logs a warning naming both sides and their matches. The other
  person's matches still count in team and match records, but they have no
  profile page. This is an upstream registry issue; the fix belongs in
  Cricsheet's data.
- **Style coverage is thinnest in T20Is,** where many associate-nation
  bowlers have no recorded style (711 men's and 510 women's bowlers, above).

## Reproducing a build

```bash
python -m pipeline fetch --formats test odi t20i            # archives and people register
python -m pipeline build --genders male female              # data/out
python -m pipeline winprob --genders male female            # data/out/winprob.json
python -m pipeline replays --all --genders male female      # data/out/replays/
python -m pipeline verify-replays --data data/out           # check replays against the build
```

`cricsheet.org` must be reachable. From the development sandbox it is not, so
local work uses the committed fixture in `fixtures/data-out` (110 men's
matches); see [OPERATIONS.md](OPERATIONS.md).
