# @memberjunction/jit-catching

Catching JiTTests for MJ. Design: [`plans/catching-jittests-design.md`](../../../plans/catching-jittests-design.md).

Private, repo-local. `jit-catch run --pr <n>` runs the whole pipeline locally; `generate`, `execute` and `assess` are the three CI jobs.

Requirements: Docker, `git`, `gh` (logged in), `ANTHROPIC_API_KEY`; for judges also `OPENAI_API_KEY` and `GEMINI_API_KEY`.
Settings: `jit-catch.settings.json` in this folder.
Runs write to `<repo>/.jit-catch/runs/<RunID>/`.

## Measured on three merged PRs (phase 1, 2026-11-09)

Local runs with `run --base <M^1> --head <M> --trigger Backtest` and the default settings (Opus 5.5 generator). Full results, catch assessments and phase 2 items: [`plans/catching-jittests-spike/PHASE1-E2E.md`](../../../plans/catching-jittests-spike/PHASE1-E2E.md).

| PR | Shape | Wall time | Sessions | Tests produced | Weak catches | Reported | Cost |
|---|---|---|---|---|---|---|---|
| #6368 | one package (SQLConverter) | 10 m 26 s | 4 | 11 | 1 | 0 | 1.23 USD |
| #6122 | two packages (MJCoreEntitiesServer, MetadataSync) | 18 m 31 s | 4 | 10 | 5 | 0 | 1.48 USD |
| #6357 | MJCore | 12 m 00 s | 4 | 9 | 5 | 0 | 1.92 USD |

A Haiku 5.5 generator on #6368 took 9 m 33 s and 0.18 USD for 10 tests. Preparing one revision (host fetch, sandbox install, build) takes 3.5–6.5 minutes; each run keeps a 4 GB pnpm store in its run folder.
