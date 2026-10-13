# SDCV dashboard: design

Date: 2026-10-13. Status: approved by Jay.

## Goal

A public page that tracks the SDCV journey (Stop Doomscrolling, Create Value). The start point is 2026-10-13 10:30 ET. It shows three numbers and nothing else:

1. **Subscription spent.** Claude Pro, 28 CAD + 13% HST (31.64 CAD), charged on the 18th of each month. The first counted charge is 2026-10-18.
2. **Value generated.** CAD 0 until there is real profit. Jay sets it by hand.
3. **Lines of code**, from Jay's GitHub repos:
   - **Headline:** lines written since SDCV.
   - **Smaller, beside it:** total codebase size.

It must be readable from anywhere, and it must keep updating when Jay's PCs are off.

## Where it lives

- Public repo `haejung017/sdcv`. Local copy: `SDCV/dashboard/`.
- Served by GitHub Pages at `https://haejung017.github.io/sdcv`.
- The private control-center file `SDCV/CLAUDE.md` is outside this repo and is never published.

```
index.html                     the page (one file: HTML, CSS, JS)
config.json                    edited by hand
data/stats.json                written by the robot
data/history.json              written by the robot, one row per day
scripts/count.mjs              line counter, Node 20+, no dependencies
scripts/count.test.mjs         tests (node --test)
.github/workflows/update.yml   daily run + manual "Run workflow" button
```

## config.json

```json
{
  "sdcv_start": "2026-10-13T10:30:00-04:00",
  "subscription": { "plan": "Claude Pro", "amount": 28, "tax_rate": 0.13, "tax_label": "HST", "currency": "CAD", "charge_day": 18, "first_charge": "2026-10-18" },
  "value_generated": { "amount": 0, "currency": "CAD" },
  "projects": [
    { "name": "Libriso",   "repo": "haejung017/Libriso",   "baseline": "9d9055d" },
    { "name": "ReportGen", "repo": "haejung017/ReportGen", "baseline": "9edc44b" },
    { "name": "TheClimb",  "repo": "haejung017/TheClimb",  "baseline": "de2997c" },
    { "name": "POCRD",     "repo": "haejung017/POCRD",     "baseline": "89d452c" }
  ]
}
```

Each `baseline` is the default branch's HEAD on 2026-10-13, right after Jay pushed the current Libriso and ReportGen builds. Use full SHAs in the real file.

## Counting rules

Both numbers use the **default branch only**.

**Which files count.** A file counts only if it passes both checks:
- **Code extension:** `.R .r .Rmd .qmd .js .jsx .mjs .cjs .ts .tsx .py .css .scss .html .sql .sh .ps1`
- **Not in an excluded path:**
  - folders `node_modules/ dist/ build/ renv/ .venv/ venv/ vendor/ coverage/ test-results/ playwright-report/ .wrangler/`
  - minified files `*.min.js` and `*.min.css`
  - any extra paths listed per project in `config.json` under `"exclude"`, for bundled third-party code found while checking the real repos

**Codebase size:** the number of non-blank lines in the counted files at HEAD.

**Written since SDCV:** the sum of `git log --numstat` additions over commits after the baseline, on counted files only. This counts a changed line as added, which is how git reports it. Binary files show as `-` and count 0.

**Only commits authored at or after `sdcv_start` count.** Merging an old branch later (Libriso has several) doesn't count its pre-SDCV work. This rule was added after the first real run: Libriso's 12:46 merge of Oct 10 commits showed as 2,091 "new" lines. Libriso's baseline was then moved to that merge (`cadfcfe`).

## The robot (.github/workflows/update.yml)

- **Triggers:** `schedule` at 10:00 UTC daily (about 6 AM ET), plus `workflow_dispatch`.
- **Read access:**
  - One read-only **deploy key** per private repo.
  - The matching private keys are stored as repo secrets: `KEY_LIBRISO`, `KEY_REPORTGEN`, `KEY_THECLIMB`, `KEY_POCRD`.
  - Each key can read only its own repo and can't write anywhere.
- **Steps:**
  1. Clone each repo over SSH with full history.
  2. Run `node scripts/count.mjs`.
  3. Write `data/stats.json`.
  4. Add or replace today's row in `data/history.json`.
  5. Commit as `github-actions[bot]` if anything changed.
- **Deploy:** Pages is set to deploy from the `main` branch root, so every data commit publishes automatically.

**If a repo can't be cloned or counted:**
- Its previous numbers are kept, marked `"stale_since": "<date>"`, and the run still succeeds for the other repos.
- The page shows a visible warning for that project.

## data/stats.json

```json
{
  "updated_at": "2026-10-14T10:00:12Z",
  "projects": [
    { "name": "Libriso", "loc": 18234, "since_sdcv": 412, "last_commit": "2026-10-13T12:34:50-04:00", "stale_since": null }
  ],
  "totals": { "loc": 51234, "since_sdcv": 412 }
}
```

`data/history.json` is an array of `{ "date": "YYYY-MM-DD", "since_sdcv": n, "loc": n }`, with one row per day.

## The page (index.html)

**Layout, top to bottom** (Jay changed the order on 2026-10-13, after launch):
1. **Header:** "SDCV · Stop Doomscrolling, Create Value", plus "Day N". Day 1 is 2026-10-13.
2. **Per-project table:** name, written since SDCV, codebase size, last commit date, and a stale warning if needed.
3. **One line chart:** cumulative lines written since SDCV, by day, drawn as inline SVG with no chart library.
4. **Three cards:**
   - **Lines written since SDCV:** the big number, with codebase size beneath it.
   - **Subscription spent:** calculated in the browser from `config.json`, as 31.64 (28 + 13% HST, rounded to the cent) × the number of charge dates from `first_charge` up to today. It stays correct even if the robot stops.
   - **Value generated:** taken from `config.json`.
5. **Footer:** "Last updated …" and a one-line note on what counts.

**Constraints:**
- Single file, no build step.
- Works at 375 px width.
- Light and dark themes via `prefers-color-scheme`.
- Loads `config.json` and the data files with `fetch`, using cache-busting query strings.

## Testing

1. `scripts/count.test.mjs` creates a throwaway git repo in a temp folder, with code files, an excluded folder, a minified file and a JSON file. It checks the codebase size, and checks that additions after a baseline are counted correctly.
2. Run the counter locally against the 4 real repos. Check the exclusion list by looking at the biggest counted files in each repo, so that bundled libraries aren't counted.
3. Open the page locally, check it at 375 px, and check it again after the first real robot run.

## Out of scope

- Session-time tracking.
- Claude.ai chat usage.
- Projects that aren't on GitHub.
- A YouTube channel.
- Backfilling history from before 2026-10-13.
- A custom domain.
