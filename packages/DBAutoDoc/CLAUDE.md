# DBAutoDoc Development Guide

## Documentation Structure
- **[docs/](docs/)** — User-facing documentation (USER_GUIDE, ARCHITECTURE, API_USAGE, GUARDRAILS)
- **[research/v1/](research/v1/)** — Research paper, benchmark results, comparison scripts
- **[plans/active/](plans/active/)** — Future work (driver refactoring, multi-DB evaluation)
- **[plans/completed/](plans/completed/)** — Completed work (deterministic gates, benchmark iteration, etc.)

## Key Files
- **[research/v1/paper.md](research/v1/paper.md)** — Research paper: "DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas"
- **[research/v1/README.md](research/v1/README.md)** — Results summary with cross-database and cross-model comparison tables

## Architecture (4-Phase Pipeline)
1. **Phase 0 — Statistical Discovery**: PK/FK candidates via uniqueness, value overlap, cardinality. Six deterministic FK gates + four PK position heuristics.
2. **Phase 1 — LLM Iterative Analysis** (Flash): Descriptions + new FK/PK proposals. Cross-table stats in prompt.
3. **Phase 2 — Ground Truth Locking**: PKs/FKs with confidence >= 90 become immutable.
4. **Phase 3 — Two-Pass Pruning** (Pro): Per-table proposals → holistic review.

## Critical Design Decisions
- **Never block the LLM from creating FKs** — 89% precision vs stats 20%
- **Deterministic gates > LLM filtering** for statistical cleanup
- **PK position matters** — 100% of correct PKs start at column position 0
- **Multi-model support** via `ai.modelOverrides` config

## CLI Commands
```bash
db-auto-doc analyze --config ./config.json
db-auto-doc analyze --resume ./output/run-1/state.json
db-auto-doc analyze --resume ./output/run-1/state.json --pruning-only
db-auto-doc prune --state ./output/run-1/state.json --config ./config.json
db-auto-doc export --state-file ./output/run-1/state.json --html --markdown --mermaid
```

## Benchmark Results (AdventureWorks2022)
| Model | PK F1 | FK F1 | Weighted |
|-------|-------|-------|----------|
| Gemini Flash / Pro | 95.0% | 94.2% | 96.1% (A+) |
| Sonnet 4.6 / Opus 4.6 | 95.0% | 93.0% | 96.1% (A+) |
| GPT-5.4-mini / 5.4 | 89.4% | 77.9% | 87.9% (B+) |

## Current Branch
- Benchmark work: `claude/dbautodoc-benchmark-v2`
