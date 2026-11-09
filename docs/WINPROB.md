# Win probability, projected score and par score

The replay pages show three numbers at every ball of a limited-overs match:

- **Win probability:** the chance that each side wins from this position.
- **Projected score:** where the batting side's innings is likely to finish,
  with an 80% range.
- **Par score:** the first-innings total that gives the side batting first an
  even chance, adjusted for the ground.

All three come from models learned from Cricsheet ball-by-ball history
(CC BY 4.0). Nothing is hand-tuned. The code is
[`pipeline/winprob.py`](../pipeline/winprob.py) (Python standard library only).
The site evaluates the same exported model through a TypeScript port,
[`web/src/lib/winprob/model.ts`](../web/src/lib/winprob/model.ts).

The numbers in this file are from the 9 Nov 2026 build (GitHub Actions run
42620030605). The models are refitted on every daily refresh that finds new
data. Each build's full validation, including the calibration tables, is
stored in `winprob.json` under `formats.<formatKey>.validation`. The site's
Method page (`/method`) reads it from the database and shows it.

```bash
python -m pipeline fetch --formats test odi t20i   # download the archives
python -m pipeline winprob --genders male female   # writes data/out/winprob.json
```

## Four models, one per format and gender

Each limited-overs format and gender has its own model. Men's and women's
matches are never pooled.

| formatKey | Meaning |
|---|---|
| `odi-m` | Men's ODIs (50 overs a side) |
| `odi-w` | Women's ODIs (50 overs a side) |
| `t20i-m` | Men's T20 internationals (20 overs a side) |
| `t20i-w` | Women's T20 internationals (20 overs a side) |

Tests have no model: a Test can be drawn, and these models only know two
outcomes. A formatKey with fewer than 100 usable matches gets no model
(`MIN_MODEL_MATCHES`); all four clear that bar.

### Which matches are used

A match is **usable** when all of these hold:

- it was scheduled for the full 50 or 20 overs, and the chase target was set
  over the full length;
- no rain rule or other method decided it (Cricsheet's `outcome.method` is
  empty), so matches settled by DLS are left out;
- it has a winner or was tied, so no-results and abandoned matches are left
  out;
- both innings have at least one legal ball.

In these matches the target means what the model assumes it means. On the
replay pages, a match outside this scope (a DLS result, an awarded match, a
shortened match) says why and shows no win probability.

## 1. Resources: how many more runs?

For a side with `u` legal balls left and `w` wickets down, the expected
further runs follow the curve used by Duckworth-Lewis:

    R(u, w) = Z_w · (1 − e^(−b_w · u))

- `Z_w` and `b_w` are fitted separately for each wicket count (0 to 9) by
  weighted least squares. The data is the average further runs from each
  (balls left, wickets) state, over every **completed** first innings (all
  out, or every over bowled). `b_w` is searched on a grid of 400 values; `Z_w`
  then has a closed form.
- One rule is enforced afterwards: losing a wicket can never add resources.
  The curve for `w` wickets is capped by the curve for `w − 1`.
- The spread of real outcomes around `R` gives a variance-to-mean ratio for
  each wicket count. That ratio sets the width of the projection range.

**Projected score** = runs so far + `R(u, w)`. The 80% range is ±1.2816
standard deviations, and its lower end is never below the runs already scored.

## 2. Chase model

What decides a chase is how much of the remaining resources the target still
demands:

    x = log(runs needed / R(u, w))

A chase that needs exactly what an average side scores from here sits near
50%. One that needs twice that is close to lost.

- The model is a logistic regression with five features: `1`, `x`, `x·f`, `f`
  and `x·w/10`, where `f` is the fraction of the innings' balls still left.
- Every ball state of every usable chase is a training row. Tied matches are
  left out of this fit.
- Rows are grouped into bins first (6 balls × wicket count × 0.05 of `x`), so
  the fit sees a few thousand weighted rows instead of every ball.
- The fit uses Newton-Raphson with a tiny ridge penalty (1e-3), for numerical
  stability only. No third-party libraries are used.

## 3. First innings and par

Before a target exists, the model averages over the possible final totals:

1. The resources model gives the likely final total: a normal distribution
   with mean "runs so far + `R`" and the variance from section 1.
2. For each total `T`, the chase model gives the chance that a chase of
   `T + 1` from ball 1 fails.
3. The first-innings win probability is the average of those chances,
   weighted by how likely each total is.

**Par score** is the smallest first-innings total at which the side batting
first has at least a 50% chance. As of the 9 Nov 2026 build (refreshed
daily), par is **258** in men's ODIs, **233** in women's ODIs, **150** in
men's T20Is and **114** in women's T20Is.

**Ground par.** Each ground's par is shifted by how much more or less teams
score there than average:

    ground par = par + (ground average − overall average) × n / (n + 8)

- `n` is the number of first innings counted at the ground. An innings counts
  when it ran its course (all out or every over bowled) in a full-length match.
- The `n / (n + 8)` factor shrinks the shift toward zero when a ground has few
  matches, so one freak game can't set its par.
- Grounds with fewer than five such innings get no ground par.
- The replay page states the sample, for example "from 8 completed first
  innings".

## 4. Weighting recent matches

Cricket changes, so recent matches can count for more. A match's weight is
`0.5 ^ (age / half-life)`, where the age is in years before the latest match
in the set.

The half-life is chosen without looking at the test set:

- The candidates are no weighting, 12, 8, 5 and 3 years.
- Each candidate is fitted on matches before 2020 and scored on 2020–2022.
  The score is the chase Brier plus the first-innings Brier (on every 12th
  first-innings state).
- The lowest score wins. With fewer than 50 matches before 2020, or fewer than
  20 in 2020–2022, no weighting is used.

In the 9 Nov 2026 build the search chose 12 years for men's ODIs, 5 years for
women's ODIs, 12 years for men's T20Is and no recency weighting for women's
T20Is. The score of every candidate is in `validation.halfLifeSelection`.

## Validation

Each model is trained on usable matches before **1 January 2023**, then scored
on the usable matches from that date on, which it never saw.

- The **Brier score** is the mean squared error of the probability. Lower is
  better.
- The **baseline** is a constant forecast given at every ball: the share of
  decided training matches won by the side batting first (or one minus that,
  for the chasing side).
- **Skill** = 1 − Brier / baseline Brier: the share of the baseline's error
  that the model removes.
- Every chase ball state is scored, and every 6th first-innings ball state.
  Tied matches are skipped.

As of the 9 Nov 2026 build (refreshed daily):

| formatKey | Usable matches | Train (before 2023) | Holdout (2023 on) | Half-life | Chase Brier (baseline) | Chase skill | First-innings Brier | Par |
|---|---|---|---|---|---|---|---|---|
| `odi-m` | 2,222 | 1,790 | 432 | 12 years | **0.1354** (0.2504) | 46% | 0.2208 | 258 |
| `odi-w` | 533 | 317 | 216 | 5 years | **0.1114** (0.2537) | 56% | 0.2022 | 233 |
| `t20i-m` | 3,332 | 1,469 | 1,863 | 12 years | **0.1070** (0.2500) | 57% | 0.2006 | 150 |
| `t20i-w` | 2,035 | 718 | 1,317 | none | **0.1041** (0.2481) | 58% | 0.1986 | 114 |

Source: the refresh log of GitHub Actions run 42620030605. Chase skill is
computed here from the rounded Brier scores in the table; `winprob.json`
stores the exact value.

How to read it:

- The chase models remove roughly half of the constant forecast's error
  (46% to 58%).
- First-innings scores are worse for a real reason, not a modelling failure:
  at the halfway point nobody knows how well the chase will go. The
  first-innings baseline is stored next to each score in `winprob.json`.
- For T20Is the holdout is larger than the training set: more usable T20Is
  were played from 2023 on than before.
- The women's ODI model trains on 317 matches, the smallest sample of the four.

**Calibration.** For each model, `validation.chase.calibration` and
`validation.firstInnings.calibration` sort the holdout states into ten bins by
predicted probability (0–10%, 10–20% and so on). Each bin records its number
of states, the average prediction and the observed win rate. The Method page
draws the calibration chart from these, with a "View as table" fallback.

**After validation**, the exported model is refitted on all usable matches,
including those from 2023 on, with the same half-life. It is then reloaded
from its own rounded JSON. Par, ground pars and the golden test states are all
computed from that reloaded model, which is exactly what the site has.

## The TypeScript port

The site does not run Python. `web/src/lib/winprob/model.ts` is a line-for-line
port that reproduces Python's rounding (round half to even) and truncation.

- `winprob.json` carries 60 "golden" states per model with Python's exact
  outputs. `npm run test:golden` checks the port against them, with a
  tolerance of 1e-9 for probabilities and 1e-6 for runs.
- The daily refresh runs this test against the freshly built `winprob.json`
  before anything is imported. In the 9 Nov 2026 build the largest difference
  across all four models was 2.2e-16.

## Known limitations

- **Match state only.** The model knows runs, balls, wickets and the target.
  It does not know team strength, pitch, weather or who is at the crease. The
  matchup cards on the replay page add the player side, from each player's
  ball-by-ball record.
- **Replays are in-sample.** The exported model is fitted on every usable
  match, including the historical matches the replay pages play back. The
  out-of-sample evidence is the validation above, not the replays.
- **Rain-affected and shortened matches are out of scope.** The model is not
  applied to them, rather than applied wrongly.
- **Ties.** A two-outcome model cannot describe a tie, so a tied match shows
  no final probability.
- **Older matches still count.** With a 12-year half-life, men's matches from
  the 2000s still carry real weight. If modern sides chase differently, the
  calibration tables on the Method page are where it would show.
