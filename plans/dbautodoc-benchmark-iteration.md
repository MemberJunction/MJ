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
- 5 natural keys (CountryRegionCode, CurrencyCode, etc.)

**False positives by category:**
- ~15 rowguid columns flagged as PK candidates
- ~10 composite candidates that include rowguid
- ~20 wrong single-column picks (Weight, Size, ProductModelID, etc.)
- ~17 composite candidates with wrong columns vs ground truth

### Agreed Algorithm Changes

#### 1A. Column-Order + Confidence-Based Secondary UUID Elimination
**File:** PKDetector.ts
**Problem:** rowguid and other secondary UUID columns pass all statistical checks but are never PKs.
**Approach:** Use column ordinal position as a scoring factor. When a table already has a high-confidence PK candidate (non-null, non-blank, 100% unique, early in column order), demote other UUID/GUID columns that appear later. Earlier columns get a mild boost since PKs are conventionally first. Handles rowguid naturally AND catches other spurious unique columns without name-based blacklisting.
**Expected impact:** -25+ false positives.

#### 1B. Three-Tier FK-Pattern Penalty
**File:** PKDetector.ts
**Problem:** detectFKPattern() gives 0.9 FK-likelihood for any *ID column whose prefix doesnt match the table name, killing legitimate PK-as-FK candidates like BusinessEntityID in Employee.
**Approach:** Three-tier penalty:
1. Column name matches current table name -> 0 penalty (clearly the PK)
2. Column name matches another tables PK but not current table -> 0.3 penalty (identifying relationship)
3. Column looks FK-ish with no PK evidence elsewhere -> 0.7 penalty
**Expected impact:** Recovers ~10-14 BusinessEntityID-as-PK misses.

#### 1C. Keep Composite Key Limit at 4 (No Change)
Composites >4 columns are extremely rare. The 5+ column issue was caused by rowguid inflation, fixed by 1A.

#### 1D. Date Columns in Composite Key Detection
**File:** PKDetector.ts
**Problem:** Composite detection only matches columns ending in ID or KEY. History tables use date columns in composite PKs.
**Approach:** Include columns with pkEligible stats (non-null, non-blank) when they appear alongside existing ID-type candidates. Never hunts for date-only composites.
**Expected impact:** Recovers 4-6 composite PKs with date components.

#### 1E. Natural Key Recognition - DROPPED
Stats-based approach from 1A should catch natural keys without risky name patterns.

#### 1F. Table-Name Preference Tiebreaker
**File:** PKDetector.ts
**Problem:** Multiple single-column candidates pass all stats checks. Product.ProductID and Product.ProductModelID both score 100%.
**Approach:** Prefer the candidate whose name contains the table name (or vice versa). ProductID matches Product -> wins.
**Expected impact:** -20 to -30 false positives.

#### 1G. LLM Reasoning Phase for Weak Candidates (NEW)
**Problem:** Some borderline candidates cant be resolved by statistics alone.
**Approach:** After scoring, send candidates below 70-80% confidence to LLM with full table context. LLM can reject weak candidates but never add new ones or reject high-confidence ones. Provides reasoning for each rejection.
**Expected impact:** Catches remaining false positives that survive statistical filtering.

---

## Phase 2: FK Detection Improvements (Target: 90% F1)

### Problem Breakdown (1 missed, 70 false positives)

Recall is 98.9% (near-perfect). Precision is 56.2% with 70 false positives.

### Agreed Algorithm Changes

#### 2A. Allow PK Columns as FK Candidates
**File:** FKDetector.ts
**Problem:** PK columns are entirely skipped for FK analysis, missing PK-as-FK identifying relationships.
**Approach:** Remove hard skip. Analyze PK columns for FK relationships with higher containment bar (95% vs 90%).
**Expected impact:** Recovers 1 missed FK.

#### 2B. FK Target Ranking with Single-Column PK Bonus
**File:** FKDetector.ts
**Problem:** Multiple target tables match for common column names. All reported as FKs.
**Approach:** Rank targets:
- Single-column PK target matching our column -> +20% bonus (most common FK pattern)
- Composite PK target including our column -> neutral (composite PKs are leaf nodes, rarely referenced)
- Column exists in target but is not a PK -> -20% penalty
**Expected impact:** -40 to -50 false positives.

#### 2C. Deduplicate FK Candidates
**File:** FKDetector.ts
**Problem:** Same target found by multiple pattern passes, creating duplicates.
**Approach:** Deduplicate by (schema, table, column) before scoring.
**Expected impact:** -5 duplicates.

#### 2D. rowguid Exclusion from FK Analysis
**File:** FKDetector.ts
**Problem:** rowguid columns generate nonsensical FK matches.
**Approach:** Skip exact-match rowguid columns from FK candidate generation.
**Expected impact:** -3 to -5 false positives.

---

## Phase 3: Instrumentation Overhaul (Future)
- Per-iteration PK/FK count snapshots
- Description change deltas per iteration
- Token usage breakdown per phase/iteration
- Convergence trajectory data

## Phase 4: LLM Integration Improvements (Future)
- CleanAndParseJSON() in LLMSanityChecker
- LLM-assisted PK/FK disambiguation (1G implementation)

## Phase 5: Additional Benchmark Databases (Future)
Northwind, Chinook, WideWorldImporters, Spider/BIRD selections

---

## Implementation Order

1. 1A - Column order + confidence demotion (biggest FP reducer)
2. 1B - Three-tier FK penalty (recovers BusinessEntityID PKs)
3. 1F - Table-name tiebreaker (further FP reduction)
4. 1D - Date columns in composites (recovers history table PKs)
5. 2B - FK target ranking (biggest FK precision improvement)
6. 2A, 2C, 2D - FK cleanup (quick wins)
7. 1G - LLM reasoning phase (polish pass)
8. Re-run benchmark and score

## Run History

| Run | Branch State | PK F1 | FK F1 | Desc% | Tokens | Notes |
|-----|-------------|--------|--------|-------|--------|-------|
| 001 | Baseline (next) | 48.0% | 71.7% | 99% | 6.3M | First clean run with working Gemini key |
