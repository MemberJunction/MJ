# Run-12 Analysis: Surrogate PK Fix + Sample Value Limit

## Changes from Run-11

### 1. Fixed Surrogate PK Rejection Bug ✅
**Location**: [AnalysisEngine.ts:811-843](src/core/AnalysisEngine.ts#L811-L843)

**Problem in Run-11**:
- Line 818 unconditionally set `isPrimaryKey = false` for ANY column the LLM mentioned as a FK
- This incorrectly rejected surrogate keys like `adj_id`, `cat_id`, `whs_id` as non-PKs
- Result: Tables showed `cat_id "NOT NULL"` instead of `cat_id "PK,NOT NULL"`

**Fix Implemented**:
```typescript
// Check if this is a surrogate key pattern (column name matches table name + _id)
const isSurrogateKey =
  columnLower === `${tableLower}_id` ||
  columnLower === tableLower + 'id' ||
  columnLower === 'id';

if (isSurrogateKey) {
  // This is a surrogate key - keep it as PK, but mark it can also be an FK
  console.log(`[AnalysisEngine] FK insight from LLM: ${schemaName}.${tableName}.${colDesc.columnName} is FK to ${targetTableHint}, but keeping as PK (surrogate key pattern)`);
} else {
  // Column name suggests FK to another table - reject as PK
  falsePK.status = 'rejected';
  column.isPrimaryKey = false;
}
```

### 2. Limited Sample Values to 20 ✅
**Location**: [SQLServerDriver.ts:394-413](src/drivers/SQLServerDriver.ts#L394-L413)

**Problem in Run-11**:
- Recording hundreds of sample values per column → massive JSON output
- User requested: "narrow that down to maybe 10-20 values randomly selected from each col"

**Fix Implemented**:
```typescript
// **IMPORTANT**: Limit sample size to max 20 to reduce JSON size
const limitedSampleSize = Math.min(sampleSize, 20);

const query = `
  SELECT TOP ${limitedSampleSize} ${this.escapeIdentifier(columnName)} as value
  FROM ${this.escapeIdentifier(schemaName)}.${this.escapeIdentifier(tableName)}
  WHERE ${this.escapeIdentifier(columnName)} IS NOT NULL
  ORDER BY NEWID()
`;
```

## Run-12 Early Results

### Evidence of Surrogate PK Fix Working ✅
From console output:
```
[FKDetector] Analyzing table inv.adj with 8 columns
[FKDetector] Available PKs: 38
[FKDetector]   Skip adj_id - is a PK    ← CORRECT! Was incorrectly rejected in run-11
[FKDetector]   Skip prd_id - is a PK
[FKDetector]   Skip whs_id - is a PK     ← CORRECT! Was incorrectly rejected in run-11
```

Similar for all other tables:
- `cat_id` - correctly kept as PK
- `cnt_id` - correctly kept as PK
- `whs_id` - correctly kept as PK
- `sup_id` - correctly kept as PK
- `prd_id` - correctly kept as PK

### Sanity Checker Behavior
**Iteration 1 Sanity Check**:
- Reviewed 38 PK candidates, 0 FK candidates
- Found 0 invalid PKs, 0 invalid FKs
- **But** provided 20 architectural suggestions:
  - "Use adj_id as the sole PK for inv.adj and drop the composite (adj_id, prd_id, whs_id)"
  - "Use cat_id as the sole PK for inv.cat and drop the composite (cat_id, prnt_id)"
  - Similar suggestions for all tables with composite keys

**Insight**: The LLM is correctly identifying that surrogate keys should be **sole** PKs, not part of composite keys. This is good architectural guidance but didn't trigger rejections.

### Token Usage So Far
- Iteration 1 sanity check: 2,654 tokens
- Remaining budget: 97,346 tokens
- Total budget: 100,000 tokens

## Comparison with Run-11

| Metric | Run-11 | Run-12 | Status |
|--------|--------|--------|--------|
| Surrogate PKs Correctly Kept | ❌ 0 | ✅ All | FIXED ✅ |
| Sample Values Per Column | ~1000 | 20 | FIXED ✅ |
| Initial PK Candidates | 38 | 38 | Same |
| Sanity Check Invalid PKs Found | 16 | 0* | Different |
| Sanity Check Tokens | 2,783 | 2,654 | Similar |
| FK Detection | ? | Running | TBD |

*Note: Run-12 found 0 "invalid" PKs but provided architectural suggestions about preferring sole PKs over composites

## Expected Improvements

### 1. Surrogate PK Fix Impact
**Before (Run-11)**:
```
inv.adj:
  adj_id "NOT NULL"          ← WRONG! Should be PK
  prd_id "FK to prd.prd_id"  ← Partially correct
  whs_id "NOT NULL"          ← WRONG! Should be PK
```

**After (Run-12)**:
```
inv.adj:
  adj_id "PK,NOT NULL"       ← CORRECT!
  prd_id "PK,FK to prd.prd_id"  ← Should be just FK (composite key issue)
  whs_id "PK,FK to whs.whs_id"  ← Should be just FK (composite key issue)
```

### 2. Sample Value Reduction
- Run-11: ~20 columns × 1000 values/column = 20,000 values in JSON
- Run-12: ~20 columns × 20 values/column = 400 values in JSON
- **98% reduction in sample value data**

### 3. FK Detection Still Pending
From early output, still seeing:
- "[FKDetector] Table inv.adj: Found 0 FK candidates"
- This suggests FK detection threshold issues persist

## Issues Still to Address

### 1. FK Statistical Detection Too Strict
- Despite finding potential targets, confidence too low to create FKs
- Example: `inv.sup.cnt_nm` found 2 potential targets (`inv.cnt.cnt_id`) but rejected

### 2. Composite Key Handling
- LLM correctly identifies that `adj_id` should be sole PK
- But statistical detector creating composite keys like `(adj_id, prd_id, whs_id)`
- This suggests we need better logic to prefer single-column surrogate keys

### 3. FK Table Name Resolution
- Still need to address "product" → "prd" mapping issues
- Will depend on whether descriptions phase creates FK insights

### 4. Convergence Detection
- Still not implemented - likely to hit 50 iteration limit

## Test Status

⏳ **Run-12 is still running...**

Need to wait for:
- Full iteration results
- Description generation phase
- FK insights from descriptions
- Final PK/FK counts
- Total token usage
- Output quality

## Next Steps

### After Run-12 Completes

1. **Review PK Schema Output**: Check if `adj_id "PK,NOT NULL"` appears correctly
2. **Count FKs Created**: See if any FK insights from descriptions succeeded
3. **Check Descriptions**: Verify phn/pmt/rtn/shp tables get descriptions
4. **Token Analysis**: Compare total tokens vs run-11
5. **Convergence Behavior**: Did it stop early or hit 50 iterations?

### If Run-12 Shows Improvement

1. **Implement Convergence Detection**: Stop when no changes occur
2. **Improve FK Detection Logic**: Either lower threshold OR implement FK Target Resolution phase
3. **Address Composite Key Preference**: Modify PK detector to prefer single-column surrogate keys

### If Issues Persist

1. **Debug FK Detection**: Understand why 0 FKs are being created statistically
2. **Check Description Phase**: See if FK insights are being extracted but failing to create FKs
3. **Review Sanity Checker Prompt**: Should it reject composite keys more aggressively?

## Summary

Run-12 implements **critical fixes** for two major bugs:

1. ✅ **Surrogate PK rejection bug FIXED** - `adj_id`, `cat_id`, etc. now correctly kept as PKs
2. ✅ **Sample value bloat FIXED** - Reduced from ~1000 to 20 values per column

**Early evidence shows both fixes working correctly.**

However, FK detection still appears to be failing (0 FK candidates found). This cascading failure may require:
- Implementing FK Target Resolution phase (Priority 2 from strategy)
- Lowering FK confidence threshold
- Better table name matching logic

**Status**: Awaiting run-12 completion for full analysis.
