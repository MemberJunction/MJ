# mj-codegen-regression report

- **Verdict:** ✅ PASS — no regression candidates
- **MJ repo:** `/Users/p/Projects/MJ/MJ`
- **Baseline ref:** `origin/next`
- **PR ref:** `15b5e728ee`
- **Modes:** `correctness,scoped,perf`

## Per-phase correctness

| Phase | Diff files | Noise | Regression candidates | Verdict |
|---|---:|---:|---:|---|
| 01-clean-install | 5 | 5 | 0 | ✅ |
| 02-association-db | 13 | 13 | 0 | ✅ |
| 03-mutations | 13 | 13 | 0 | ✅ |
| 04-new-entities | 13 | 13 | 0 | ✅ |

## Scoped-regen verifier

Re-running PR codegen with `--force-advanced-gen` on the same DB and diffing against the scoped run.

- Total files with diff: **0**
- Noise (filtered): **0**
- Regression candidates: **0** ✅

## Performance

| Phase | next (s) | branch/PR (s) | Δ% (PR vs next) | flag |
|---|---:|---:|---:|---|
| 01-clean-install | 84.13 | 63.77 | -24.2% | within tolerance |
| 02-association-db | 97.27 | 82.55 | -15.1% | within tolerance |
| 03-mutations | 88.61 | 67.03 | -24.4% | within tolerance |
| 04-new-entities | 91.49 | 68.16 | -25.5% | within tolerance |
| scoped-verify | — | 101.82 | — | (incomplete) |

Threshold: 30% (configurable via --perf-threshold).

No perf regressions above threshold.

## Files in this run

- `REPORT.md` — this file
- `<phase>/SUMMARY.md` — per-phase classification
- `<phase>/classified.json` — machine-readable classification
- `<phase>/diff.unified.txt` — raw unified diff
- `<phase>/{next,branch}/codegen.log` — per-side codegen output
- `scoped-verify/` — scoped vs forced regen comparison
- `perf.tsv`, `perf.json`, `PERF.md` — phase wall-clock timings
