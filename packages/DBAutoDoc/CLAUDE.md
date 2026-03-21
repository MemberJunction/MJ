# DBAutoDoc Development Guide

## Key Documentation
- **[Benchmark Progress Report](docs/BENCHMARK_PROGRESS_REPORT.md)** — Full evolution from 79.3% (B) → 96.7% (A+), all algorithm decisions and lessons learned
- **[Run 015 Results](docs/benchmark-results/adventureworks2022-run015-report.txt)** — Reference benchmark: PK F1 95.0%, FK F1 94.2%
- **[Deterministic Gates Plan](../../plans/dbautodoc-deterministic-fk-gates.md)** — Specification for all deterministic gates + performance optimization roadmap

## Architecture (4-Phase Pipeline)
1. **Phase 0 — Statistical Discovery**: PK/FK candidates via uniqueness, value overlap, cardinality. Six deterministic FK gates + four PK position heuristics filter false positives.
2. **Phase 1 — LLM Iterative Analysis** (Flash): Generates descriptions AND creates new FKs/PKs. The LLM contributes ~75 correct FKs with 89% precision. Cross-table stats provided in prompt.
3. **Phase 2 — Ground Truth Locking**: PKs/FKs with confidence ≥ 90 become immutable.
4. **Phase 3 — Two-Pass Pruning** (Pro): Per-table proposals → holistic review. Locked candidates protected.

## Critical Design Decisions
- **Never block the LLM from creating FKs** — it's the primary source of correct FKs (89% precision vs stats' 20%)
- **Deterministic gates > LLM filtering** for cleaning statistical candidates — mathematical invariants are 100% reliable
- **PK position matters** — 100% of correct PKs start at column position 0
- **Fan-out penalty** — multi-target FK candidates get confidence reduction so pruner can evaluate
- **Multi-model support** via `ai.modelOverrides` config — Flash for bulk work, Pro for pruning
- **Sanity checks disabled** — zero accuracy impact, 40% token savings. Future feature pending 10M+ token context windows.

## CLI Commands
```bash
# Full analysis
db-auto-doc analyze --config ./config.json

# Resume from existing state
db-auto-doc analyze --resume ./output/run-1/state.json

# Pruning only (on existing state)
db-auto-doc analyze --resume ./output/run-1/state.json --pruning-only

# Standalone pruning with interactive confirmation
db-auto-doc prune --state ./output/run-1/state.json --config ./config.json

# Limit iterations
db-auto-doc analyze --config ./config.json --max-iterations 2
```

## Benchmark Commands (Docker Workbench)
```bash
# Start workbench
docker compose -f docker/workbench/docker-compose.yml up -d

# Run benchmark
docker exec claude-dev bash -c 'cd /workspace/benchmark && node /workspace/MJ/packages/DBAutoDoc/bin/run.js analyze --config autodoc-config.json'

# Compare results (v5 — status-aware, filters rejected PKs/FKs)
docker exec claude-dev bash -c 'cd /workspace/benchmark && python3 compare-v5.py autodoc-output/run-NNN/run-1/state.json'
```

## Current Branch
- Benchmark work: `claude/dbautodoc-benchmark-v2`
- Baseline/production: `next`
