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

## Future Considerations

- These gates operate on the statistical discovery phase only. The LLM's ability to create FKs during table analysis is unaffected.
- Gate 1 depends on the quality of column statistics. If `ColumnStatsCache` doesn't have stats for a target column, the gate should be skipped (fail-open) rather than blocking the candidate.
- Gate 4 multipliers may need tuning on different databases. The 0.1/0.5/2.0/5.0 thresholds are based on AdventureWorks patterns and should be validated on MSTA and other databases.
