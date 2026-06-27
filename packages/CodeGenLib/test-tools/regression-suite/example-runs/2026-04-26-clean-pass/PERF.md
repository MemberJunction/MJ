# Codegen perf

| Phase | next (s) | branch/PR (s) | Δ% (PR vs next) | flag |
|---|---:|---:|---:|---|
| 01-clean-install | 84.13 | 63.77 | -24.2% | within tolerance |
| 02-association-db | 97.27 | 82.55 | -15.1% | within tolerance |
| 03-mutations | 88.61 | 67.03 | -24.4% | within tolerance |
| 04-new-entities | 91.49 | 68.16 | -25.5% | within tolerance |
| scoped-verify | — | 101.82 | — | (incomplete) |

Threshold: 30% (configurable via --perf-threshold).

No perf regressions above threshold.