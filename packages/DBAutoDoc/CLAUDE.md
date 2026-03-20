# DBAutoDoc Development Guide

## Key Documentation
- **[Benchmark Progress Report](docs/BENCHMARK_PROGRESS_REPORT.md)** — Full evolution of FK/PK detection algorithms, benchmark results (FK F1: 71.7% → 83.8%), architecture decisions, and lessons learned
- **[Relationship Discovery Algorithm](docs/RELATIONSHIP_DISCOVERY_ALGORITHM.md)** — Technical reference for the PK/FK detection pipeline (if exists)
- **[Deterministic FK Gates Plan](../../plans/dbautodoc-deterministic-fk-gates.md)** — Specification for all 8 deterministic gates + performance optimization opportunities

## Architecture Overview
1. **Phase 0 — Statistical Discovery**: PK/FK candidates via uniqueness, value overlap, cardinality. Six deterministic gates filter false positives (75% reduction, zero correct FK loss).
2. **Phase 1 — LLM Iterative Analysis** (Flash): Generates descriptions AND creates new FKs freely. The LLM contributes ~75 of 90 correct FKs with 89-96% precision. Cross-table FK stats are provided in the prompt context.
3. **Phase 2 — Interim Ground Truth Lock**: FKs with confidence ≥ 90 become immutable. Protects ~97% of correct FKs.
4. **Phase 3 — Two-Pass FK Pruning** (Pro): Per-table proposals → holistic review. Locked FKs cannot be removed.

## Critical Design Decisions
- **Never block the LLM from creating FKs** — it's the primary source of correct FKs (89% precision vs stats' 20%)
- **Deterministic gates > LLM filtering** for cleaning statistical candidates — mathematical invariants are 100% reliable
- **Multi-model support** via `ai.modelOverrides` config — Flash for bulk work, Pro for precision-critical pruning
- **Value overlap ≥ 75%** is the strongest single gate — real FKs have near-perfect containment

## Benchmark Commands (Docker Workbench)
```bash
# Start workbench
docker compose -f docker/workbench/docker-compose.yml up -d

# Run benchmark
docker exec claude-dev bash -c 'cd /workspace/benchmark && node /workspace/MJ/packages/DBAutoDoc/bin/run.js analyze --config autodoc-config.json'

# Compare results
docker exec claude-dev bash -c 'cd /workspace/benchmark && python3 compare-v4.py autodoc-output/run-NNN/run-1/state.json'
```

## Current Branch
- Benchmark work: `claude/dbautodoc-benchmark-v2`
- Baseline/production: `next`
