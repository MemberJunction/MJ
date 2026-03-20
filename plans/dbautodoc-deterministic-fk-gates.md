# DBAutoDoc: Deterministic FK Detection Gates

## Background

Benchmark analysis of AdventureWorks2022 (Run 001 baseline) revealed that the statistical FK discovery phase produces 76 unique FK candidates with only 20% precision (15 correct, 61 false positives). The LLM analysis phase then adds 84 more FKs with 89% precision (75 correct, 9 false).

The false positives from the statistical phase share clear patterns that can be eliminated with deterministic rules, improving the signal-to-noise ratio before the LLM runs.

## Benchmark Data (AdventureWorks2022, Run 001)

- Ground truth: 91 FKs
- Stats-created: 76 unique (15 correct, 61 false positive — 20% precision)
- LLM-created: 84 unique (75 correct, 9 false positive — 89% precision)
- Total: 160 unique (90 correct, 70 false positive — 56% precision)

## Deterministic Gates

### Gate 1: Target Column Must Be PK-Eligible (HARD GATE)

**Rule**: Before adding any column as a potential FK target, verify that the target column passes PK eligibility criteria: zero nulls, zero blanks, 100% unique values. Use the existing `ColumnStatsCache` which already computes these statistics.

**Rationale**: A foreign key references a primary key or unique key. If the target column has nulls, blanks, or duplicate values, it cannot be a PK/unique key and therefore cannot be an FK target. This is a mathematical invariant, not a heuristic.

**Location**: `FKDetector.findPotentialTargets()` — check before adding targets in all three patterns.

**Expected Impact**: Eliminates ~47 of 61 false positives (77%). Zero true positive harm — all 15 correct stats FKs have PK-eligible targets.

**False positive patterns caught**:
- Sibling columns: `emailaddress.businessentityid → password.businessentityid` (password.businessentityid has duplicates across join patterns)
- Reverse direction: `shoppingcartitem.productid → transactionhistory.productid` (transactionhistory.productid is not unique)
- Non-key columns: `purchaseorderdetail.orderqty → productvendor.onorderqty` (5.2% uniqueness, 66% null)

### Gate 2: Zero Value Overlap = Auto-Reject (HARD GATE)

**Rule**: After computing value overlap in `analyzeFKCandidate()`, if `valueOverlap === 0`, return null immediately without scoring.

**Rationale**: If not a single source value exists in the target column, this cannot be an FK relationship. Zero overlap is mathematically incompatible with referential integrity.

**Location**: `FKDetector.analyzeFKCandidate()` — early return after overlap computation.

**Expected Impact**: Kills 3 rowguid false positives + any other zero-overlap noise.

### Gate 3: Rowguid Target Column Filter (HARD GATE)

**Rule**: In `findPotentialTargets()`, skip any target column named `rowguid`. The source-side filter already exists (line ~55 in FKDetector); this extends it to targets.

**Rationale**: `rowguid` is a SQL Server replication identifier (UNIQUEIDENTIFIER type). It has 100% uniqueness and zero nulls, so it passes PK eligibility, but it is never a meaningful FK target. Each table generates its own independent GUIDs.

**Location**: `FKDetector.findPotentialTargets()` — skip target columns matching `rowguid`.

**Expected Impact**: Catches rowguid targets that Gate 1 can't (since rowguid IS technically PK-eligible). Redundant with Gate 2 (zero overlap) but catches them earlier, avoiding unnecessary value overlap queries.

### Gate 4: Row-Count Ratio Confidence Multiplier (SOFT GATE)

**Rule**: Compute `sourceDistinctCount / targetDistinctCount` ratio. Apply as a confidence multiplier:
- Ratio < 0.1: Apply 0.5x multiplier (tiny table → huge table, likely wrong direction)
- Ratio 0.1 - 0.5: Apply 0.7x multiplier (suspicious direction)
- Ratio 0.5 - 2.0: No change (normal range)
- Ratio > 5.0: Apply 1.2x boost, capped at 100 (strong child→parent signal)

**Rationale**: In a correct FK relationship, the child table typically has more rows (or equal) than the parent. When a 3-row table "references" a 19,000-row table, the direction is almost certainly wrong or it's a sibling relationship. Rather than hard-cutting (which could harm edge cases), apply a sliding penalty.

**Location**: `FKDetector.calculateFKConfidence()` — new multiplier factor applied to final score.

**Expected Impact**: Pushes ~10-20 additional reverse-direction false positives below the confidence threshold. True positives with low cardinality survive because their base scores are high enough (high overlap + naming match + target-is-PK bonus).

**Safety analysis**: True positives with card < 0.5:
- `shoppingcartitem → product` (card=0.01): base score ~100, × 0.5 = 50 — still above 40 threshold
- `jobcandidate → employee` (card=0.01): base score 85, × 0.5 = 42 — marginal but survives
- `vendor → businessentity` (card=0.01): base score 85, × 0.5 = 42 — marginal but survives

## Implementation Order

1. Gate 1 (highest impact, zero risk)
2. Gate 3 (simple, zero risk)
3. Gate 2 (simple, zero risk)
4. Gate 4 (most nuanced, needs benchmark validation)

## Measurement Plan

Run each gate individually to measure per-gate impact:
- Stats true positives retained (must stay at 15/15)
- Stats false positives eliminated (target: 61 → <15)
- Overall FK precision improvement

### Gate 5: Fan-Out Limiter (HARD GATE)

**Rule**: When a source column has more than 3 FK candidate targets, sort by confidence descending and keep only the top 3. Drop the rest.

**Rationale**: When `BusinessEntityID` exists in 9 tables, the stats phase generates 9 candidates. In AdventureWorks data, the correct FK is always ranked 1st, 2nd, or 3rd by confidence. The remaining targets are siblings or cousins that happen to share the column name.

**Location**: `FKDetector.detectFKCandidates()` — after collecting per-column candidates, before adding to the main list.

**Expected Impact**: Eliminates ~17 false positives. Zero true positive harm verified — all correct FKs rank in top 3 for their source column.

### Gate 6: Value Overlap Floor at 75% (HARD GATE — supersedes Gate 2)

**Rule**: If less than 75% of source column values exist in the target column, reject the candidate. Replaces the earlier Gate 2 (0% floor).

**Rationale**: A real FK should have near-perfect value containment. Orphaned records occur in databases without enforced referential integrity, so 100% is too strict, but 75% provides generous headroom. False positives in the 0.4%-7% overlap range are coincidental matches from unrelated columns.

**Location**: `FKDetector.analyzeFKCandidate()` — early return after value overlap computation.

**Expected Impact**: Eliminates ~8 false positives. Zero true positive harm — all correct stats FKs have 100% overlap in AdventureWorks.

### Gate 7: Sibling Deduplication — DEFERRED

**Rule**: When multiple targets for the same source column share CARD~1 and high overlap, keep only the one with the highest target distinct count (likely the root table).

**Status**: Deferred. Analysis showed it would lose 1 correct FK (`emailaddress.businessentityid → person.businessentityid`) because `BusinessEntity` has more distinct values than `Person` (inheritance pattern). The LLM handles this semantic distinction well during iterative analysis.

### Gate 8: Source Column is Discovered PK — Skip FK Generation (HARD GATE)

**Rule**: If the source column is a confirmed PK of the source table, do not generate FK candidates for it. PK-as-FK (identifying relationships) are rare and require semantic reasoning, so the LLM handles these during table analysis iterations.

**Location**: `FKDetector.detectFKCandidates()` — early continue in the column loop.

**Expected Impact**: Zero impact on AdventureWorks (existing gates already eliminated these), but provides a safety net for other databases where PK columns might otherwise generate reverse-direction false positives.

## Cumulative Impact (AdventureWorks2022)

| Gate | FPs Eliminated | Correct FKs Lost | Status |
|------|---------------|-------------------|--------|
| G1: Target PK-eligible | ~47 | 0 | Implemented |
| G2: Zero overlap (superseded by G6) | 3 | 0 | Superseded |
| G3: Rowguid target filter | ~3 | 0 | Implemented |
| G4: Row-count ratio multiplier | ~10-20 | 0 | Implemented |
| G5: Fan-out top-3 | ~17 | 0 | Implemented |
| G6: Overlap floor 75% | ~8 | 0 | Implemented |
| G7: Sibling dedup | ~13 | 1 | Deferred |
| G8: Source-is-PK skip | 0 (AW) | 0 | Implemented |

**Net result**: Stats false positives reduced from 61 → ~15 (75% reduction) with zero correct FK loss.

## Future Considerations

- These gates operate on the statistical discovery phase only. The LLM's ability to create FKs during table analysis is unaffected.
- Gate 1 depends on the quality of column statistics. If `ColumnStatsCache` doesn't have stats for a target column, the gate should be skipped (fail-open) rather than blocking the candidate.
- Gate 4 multipliers may need tuning on different databases. The 0.1/0.5/2.0/5.0 thresholds are based on AdventureWorks patterns and should be validated on MSTA and other databases.
- Gate 6 threshold (75%) provides generous headroom for messy databases. Could be tuned per-database if needed, though 75% should be universally safe.
