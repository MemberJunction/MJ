# DBAutoDoc Benchmark Iteration Plan

## Current Baseline (Run 001 - AdventureWorks2022)

| Metric | Precision | Recall | F1 | Target |
|--------|-----------|--------|-----|--------|
| PK Detection | 40.4% | 59.2% | 48.0% | **95%** |
| FK Detection | 56.2% | 98.9% | 71.7% | **90%** |
| Table Descriptions | - | 99% | - | 100% |
| Column Descriptions | - | 99% | - | 100% |

**Grade: B (79.3%) - descriptions solved, keys need work**

---

## Phase 1: PK Detection Improvements (Target: 95% F1)

### Problem Breakdown (29 missed, 62 false positives)

**Missed PKs by category:**
- 14 BusinessEntityID-as-PK (identifying relationship pattern)
- 17 composite PKs missed
- 5 natural keys (CountryRegionCode, CurrencyCode, UnitMeasureCode, DocumentNode, SystemInformationID)

**False positives by category:**
- ~15 rowguid columns flagged as PK candidates
- ~10 composite candidates that include rowguid (e.g., BusinessEntityID,LoginID,rowguid)
- ~20 wrong single-column picks (Weight, Size, ProductModelID, PersonID in wrong table)
- ~17 composite candidates missing columns or with extra columns vs ground truth

### Proposed Algorithm Changes

#### 1A. Add rowguid/row_version to blacklist (PKDetector.ts line ~436)
**Problem:** rowguid columns pass all statistical checks (unique, non-null, GUID type) but are never PKs - they are replication identifiers.
**Fix:** Add patterns /^rowguid$/i, /^row_?guid$/i, /^row_?version$/i to the blacklist array.
**Expected impact:** Eliminates ~15 single-column FPs and ~10 composite FPs that include rowguid. Net: -25 false positives.

#### 1B. Reduce FK-pattern penalty for BusinessEntityID (PKDetector.ts line ~525)
**Problem:** detectFKPattern() returns 0.9 for any *ID column whose prefix does not match the table name. BusinessEntityID in Employee table gets 0.9 FK score -> 54% penalty -> drops below threshold. But BusinessEntityID IS the PK in 14 tables (identifying relationship).
**Fix:** Reduce the prefix-does-not-match-table return from 0.9 to 0.5. This still penalizes FK-like names but not enough to kill legitimate PK-as-FK candidates. The LLM sanity check can then validate.
**Expected impact:** Recovers ~10-14 of the BusinessEntityID misses. Net: +10-14 recall.

#### 1C. Expand composite key detection to 6 columns (PKDetector.ts line ~573)
**Problem:** Composite key limit is 4 columns. AdventureWorks has a 4-column composite PK (EmployeeDepartmentHistory: BusinessEntityID, StartDate, DepartmentID, ShiftID) that gets rejected when rowguid is also in the candidate set, making it 5 columns.
**Fix:** Change idColumns.length <= 4 to idColumns.length <= 6.
**Caveat:** More columns = more combinatorial noise. May need to pair with 1A (removing rowguid from candidates first).
**Expected impact:** Recovers 2-3 composite PKs. Minor.

#### 1D. Composite key detection: include date columns (PKDetector.ts line ~569)
**Problem:** Composite key detection only looks for columns ending in ID or KEY. But 6 AdventureWorks composite PKs include date columns (StartDate, RateChangeDate, QuotaDate) that do not match these patterns.
**Fix:** Also include columns whose stats show them as PK-eligible (non-null, non-blank) AND that appear alongside ID columns. Instead of filtering by name pattern, use the pkEligible flag from stats cache.
**Expected impact:** Recovers 4-6 composite PKs with date components.

#### 1E. Natural key recognition (PKDetector.ts)
**Problem:** Columns like CountryRegionCode, CurrencyCode, UnitMeasureCode are natural PKs - short string codes that are unique. They get poor naming scores (0.0) and then a 50% penalty for unique but poor naming.
**Fix:** Add a natural key pattern detector: if a column name ends in Code or Key (not ID), has varchar type, short avg length (<10 chars), and 100% unique, boost its score instead of penalizing.
**Expected impact:** Recovers 3-5 natural key PKs.

#### 1F. Reduce false positives from non-PK unique columns
**Problem:** Columns like Weight, Size, ProductModelID in Product table are unique but clearly not PKs. ProductModelID is flagged at confidence 100 because it passes all statistical checks and matches the *ID naming pattern.
**Fix:** When multiple single-column PK candidates exist for a table, pick only the best one (highest confidence) and demote others. A table with both ProductID (conf 100) and ProductModelID (conf 100) should resolve to ProductID by preferring the one that matches the table name.
**Expected impact:** Major FP reduction. Estimated -20 to -30 false positives.

---

## Phase 2: FK Detection Improvements (Target: 90% F1)

### Problem Breakdown (1 missed, 70 false positives)

**Recall is 98.9% - nearly perfect.** The only missed FK is PersonCreditCard.BusinessEntityID -> Person.BusinessEntityID (PK-as-FK, skipped because BusinessEntityID is detected as PK in PersonCreditCard).

**Precision is 56.2%** - 70 false positives, mostly:
- BusinessEntityID matching many tables (correct target + 5-10 wrong targets)
- TerritoryID matching SalesOrderHeader, SalesPerson, SalesTerritoryHistory when only SalesTerritory is correct
- rowguid cross-matches between tables

### Proposed Algorithm Changes

#### 2A. Allow PK columns as FK candidates (FKDetector.ts line ~59-69)
**Problem:** If a column is detected as PK, it is skipped entirely for FK analysis. Misses PK-as-FK patterns.
**Fix:** Remove the continue on line 68. Still note that it is a PK (for logging) but proceed with FK analysis.
**Expected impact:** Recovers the 1 missed FK. Minimal.

#### 2B. Prefer correct FK target when multiple match - target-is-PK priority
**Problem:** BusinessEntityID appears in ~20 tables. When analyzing EmailAddress.BusinessEntityID, the detector finds 6+ targets (Person, BusinessEntity, Password, PersonPhone, etc.) and reports ALL of them. Only one is the true FK.
**Fix:** When multiple targets match, apply a ranking heuristic:
1. Target where column is the single-column PK -> highest priority
2. Target table name is a prefix/suffix of the source column name -> high priority
3. Target has fewest columns (lookup table) -> medium priority
4. Discard targets where column is NOT a PK in the target table
**Expected impact:** Major FP reduction. Could cut 40-50 false positives.

#### 2C. Deduplicate FK targets across schemas (FKDetector.ts line ~224)
**Problem:** Same table appears in multiple schemas, generating duplicate FK candidates.
**Fix:** Add deduplication by (schemaName, tableName, columnName) before returning targets.
**Expected impact:** Minor - eliminates ~5 duplicates.

#### 2D. Add rowguid exclusion to FK detection
**Problem:** rowguid columns generate FK candidates like ProductSubcategory.rowguid -> SalesPerson.rowguid - nonsensical.
**Fix:** Skip columns named rowguid in FK analysis (they are replication GUIDs, never real FKs).
**Expected impact:** Eliminates 3-5 rowguid cross-match FPs.

---

## Phase 3: Instrumentation Overhaul

### Problems with Current Instrumentation
- Processing log only captures iteration 0, not subsequent iterations
- No per-iteration PK/FK count snapshots
- No change deltas between iterations (what actually changed?)
- Column descriptions all show same depth regardless of actual refinement
- Token usage not broken down per phase/iteration
- state.json is 39MB for 71 tables - could be more efficient

### Proposed Changes
- Add per-iteration snapshot of PK/FK counts and confidence distributions
- Track description change deltas (new, updated, unchanged per iteration)
- Add token usage breakdown per phase and per iteration
- Add convergence trajectory data (confidence over time)
- Consider splitting large fields (sample values, processing log) into separate files
- Fix processing log to record all iterations, not just the first

---

## Phase 4: LLM Integration Improvements

- Use CleanAndParseJSON() from @memberjunction/global in LLMSanityChecker (currently raw JSON.parse fails on markdown-wrapped responses)
- Consider LLM-assisted PK disambiguation when multiple candidates tie
- Improve FK target selection with LLM validation (ask LLM which of N candidate targets is most likely)

---

## Phase 5: Additional Benchmark Databases

| Database | Tables | Why |
|----------|--------|-----|
| Northwind | 13 | Simple baseline, easy to validate |
| Chinook | 11 | Cross-platform, music domain |
| WideWorldImporters | 30+ | Modern MS sample, temporal tables |
| Spider/BIRD selections | varies | Academic benchmarks with ground truth |

---

## Execution Order

1. **Phase 1 (PK)** - most impactful, foundational for everything else
2. **Phase 2 (FK)** - quick wins since recall is already 99%
3. **Re-run benchmark** - validate improvements
4. **Phase 3 (Instrumentation)** - better data for further iteration
5. **Phase 4 (LLM)** - polish
6. **Phase 5 (More databases)** - generalization testing
