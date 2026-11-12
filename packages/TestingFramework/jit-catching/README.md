# @memberjunction/jit-catching

Catching JiTTests for MJ. Design: [`plans/catching-jittests-design.md`](../../../plans/catching-jittests-design.md).

Private, repo-local. `jit-catch run --pr <n>` runs the whole pipeline locally; `generate`, `execute` and `assess` are the three CI jobs.

Requirements: Docker, `git`, `gh` (logged in), `ANTHROPIC_API_KEY`; for judges also `OPENAI_API_KEY` and `GEMINI_API_KEY`.
Settings: `jit-catch.settings.json` in this folder.
Runs write to `<repo>/.jit-catch/runs/<RunID>/`.

Generator models: a `claude-*` model runs on the Claude Agent SDK with `ANTHROPIC_API_KEY`; a `gemini-*` model runs on the MJ Gemini provider with `GEMINI_API_KEY`. Every generator model needs an entry in the settings `Prices`.

Analyzer: one LLM call per run reads the diff and returns the intent, a summary, the risks and the packages to test, with a cap of 8000 output tokens. When the reply is not valid JSON, a second attempt asks for a shorter reply (at most 6 risks, each field under 300 characters). When both replies are invalid, the run continues with no risk notes: the analysis has `Fallback: true` (otherwise `false`), stderr gets the line `run <run ID>: analyzer reply was not valid JSON twice; continuing with no risk notes`, and the report counts the run under "Analyzer fallbacks (no risk notes)". That count covers only runs with a readable generation file whose analysis recorded the flag; the report names how many runs have no generation file and how many older runs did not record the flag, and writes one stderr line for each generation file it cannot read.

## Commands

Options in brackets are optional; the usage text in `src/cli.ts` shows which command takes `--settings` and `--store`.

- `generate` / `run` — `--pr <n>` or `--head <sha> [--base <sha>]`, optional `--trigger`. `generate` writes tests for one PR; `run` runs generate, execute and assess in one go. `generate` records the milliseconds of each stage (analyze, prepare base, build base, generate) as `Timings` in `generation.json` and prints them in whole seconds on one line: `run <run ID>: stages analyze 1s, prepare base 2s, build base 3s, generate 4s`.
- `execute --run <run ID>` — runs the generated tests of a run on base and head. When the setting `Coverage` is `true` (the default), it also measures, for each test that passes on both, how many changed lines the test runs on head; `"Coverage": false` skips that step, so the run offers no promotion candidates. It records the milliseconds of each stage (prepare head, build head, type-check, run, coverage; coverage is 0 when not measured) as `Timings` in `execution.json` and prints them in whole seconds on one line: `run <run ID>: stages prepare head 1s, build head 2s, type-check 3s, run 4s, coverage 5s`.
- `assess --run <run ID>` — filters and judges the weak catches of a run and decides which to report.
- `label --catch <catch ID> --answer Bug|Intended|TestFault --user <login>` — records one human label; `label --run <run ID>` prints the label packet of a run.
- `corpus mine --since <YYYY-MM-DD> --until <YYYY-MM-DD> --out <file>` — mines bug-set and clean-set candidate PRs merged in the window.
- `clean --run <run ID>` or `clean --all-finished` — removes the worktrees, pnpm store, turbo cache and scratch folders of one run or of every finished run.
- `backtest --corpus <file> --slice Tuning|HeldOut --set Bug|Clean|Both --model <generator> --max-usd <n>` — runs every chosen corpus PR into one ledger; the required `--max-usd <n>` caps the ledger cost and the command exits 3 when the cap or the failure limit stops it, `--only <n,n>` picks PRs, `--retry-failed` re-runs failed entries. Backtests never measure coverage (they print `coverage off (backtest)` once at the start), because promotions are not a gate-1 input. The worst-case overshoot past the cap is about one PR (≈ 36 USD at the default limits plus the judges). A run cut off during Generate leaves no generation file, so a resume does not recover its spend and it does not count toward the cap.
- `backtest match --ledger <ledger ID> --corpus <file>` — applies each fix PR on top of its bug PR and re-runs the catching tests to see which catches match the known bug. It tries the fix on the bug head first, and the fix PR's merge commit when the fix does not apply on the bug head or the patched head does not prepare. A pair where the fix merge does not prepare is recorded as `PrepareFailed` and blocks the gate. Older ledgers can hold `ApplyFailed`, which also blocks the gate.
- `report --ledger <ledger ID>[,<ledger ID>…] --corpus <file> [--out <file.md>]` — writes the gate-1 report: rates with 95% intervals, costs, the median minutes of each stage over the model's assessed runs (`n/a` for a stage no assessed run recorded), session end reasons, analyzer fallbacks and judge calibration.

## Gate 1 procedure

Design: §14.1 of the design document. The pass values apply to the held-out slice.

1. Run `corpus mine` over the window, then curate the corpus file by hand: confirm each bug pair and put every PR in the `Tuning` or `HeldOut` slice. Every base must be a pnpm-era commit (after PR #3500, 2026-08-05); an older base has no `pnpm-lock.yaml` and the run fails after one analyzer call, before any generation.
2. Run `backtest --slice Tuning --set Both` cheapest model first, always with `--max-usd`: Haiku on the full slice; Sonnet unless Haiku passes; then Opus on a sample of 15 PRs (`--only`) if Sonnet passes, or on the full slice if it fails.
3. Run `backtest match` on each ledger.
4. Send each clean-set PR author the catches for their PRs (`label --run` prints the packet) and record each answer with `label --catch <catch ID> --answer Bug|Intended|TestFault --user <login>`.
5. Run `report` over the ledgers and choose a model, then run steps 2–4 once on the `HeldOut` slice with that model. Gate 1 passes when the held-out slice has at least 25% of bug PRs with a reported catch that matches the known bug (step 3) and at most 10% false alarms on clean PRs.

## Measured on three merged PRs (phase 1, 2026-11-09)

Local runs with `run --base <M^1> --head <M> --trigger Backtest` and the default settings (Opus 5.5 generator). Full results, catch assessments and phase 2 items: [`plans/catching-jittests-spike/PHASE1-E2E.md`](../../../plans/catching-jittests-spike/PHASE1-E2E.md).

| PR | Shape | Wall time | Sessions | Tests produced | Weak catches | Reported | Cost |
|---|---|---|---|---|---|---|---|
| #6368 | one package (SQLConverter) | 10 m 26 s | 4 | 11 | 1 | 0 | 1.23 USD |
| #6122 | two packages (MJCoreEntitiesServer, MetadataSync) | 18 m 31 s | 4 | 10 | 5 | 0 | 1.48 USD |
| #6357 | MJCore | 12 m 00 s | 4 | 9 | 5 | 0 | 1.92 USD |

A Haiku 5.5 generator on #6368 took 9 m 33 s and 0.18 USD for 10 tests. On the measuring machine, with a warm store, the sandbox install of one revision takes about 2.5 minutes for the whole workspace and about 1 minute when filtered to one package (measured with `@memberjunction/core`); each run keeps a 4 GB pnpm store and one turbo cache in its run folder. Base and head share the run's turbo cache, so the head build recompiles only packages whose inputs changed. The analyzer runs before base is prepared, and the sandbox install covers only the root project and the packages under test with their dependencies (`--filter . --filter <package>...`); it covers the whole workspace when none of those packages exists at the revision. A generated test can import only packages that its package depends on, which pnpm's strict layout already requires. The sandbox install is retried once without the frozen lockfile when the revision's lockfile is out of date with a package.json, still offline, so only workspace links and packages already fetched can resolve.
