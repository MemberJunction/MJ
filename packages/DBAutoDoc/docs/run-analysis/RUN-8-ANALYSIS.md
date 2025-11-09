# Run-8 Analysis

## Changes Made
1. **PK Detection Blacklist** - Added comprehensive patterns to reject false-positive PKs
   - qty, seq, lvl, exp_*, act_*, var, rcv_*, rsv, min_*, max_*, rtg, cap, etc.
   - Stricter naming requirements (50% penalty if unique but poor naming)

2. **LLM Validation Error Handling** - Fixed crash when stats cache missing
   - Now returns gracefully with minimal context instead of throwing error

## Run-8 Results

### Improvements ✅
1. **PKs Reduced**: 43 PKs (down from 63 in run-7) - 32% reduction!
2. **Blacklist Working**: Console shows `[PKDetector] REJECT qty - matches blacklist pattern /^qty$/i`
3. **FK Insights Detected**: LLM descriptions mention FKs:
   - `prd_id`: "likely a foreign key to a product master table"
   - `whs_id`: "likely a foreign key to a warehouse table"
4. **High Confidence**: Table descriptions averaging 96% confidence

### Remaining Issues ❌

#### 1. Discovery Phase LLM Still Shows 0 Tokens
**Evidence:**
```
✔ Starting LLM validation: {"pkCandidates":43,"fkCandidates":0,"tokensRemaining":25000}
✔ Validating inv.adj: {"pks":2,"fks":0}
...
✔ LLM validation complete: {"tokensUsed":0,"validated":0,"rejected":0,...}
```

**Analysis:**
- LLM validator IS being called (20 tables validated)
- But returning tokensUsed: 0 for all tables
- Description phase uses 107K tokens successfully, so LLM works
- Likely issue: `chatResult.data.usage.totalTokens` field mismatch with Groq response

**Root Cause:**
Either:
1. Groq doesn't return usage stats in expected format
2. responseFormat: 'JSON' is causing silent failures
3. Early return path being hit (stats cache missing)

#### 2. FK Relationships Not Populated in Metadata
**Evidence:**
- Console: `[AnalysisEngine] FK insight from LLM: inv.adj.prd_id is FK to product, rejecting as PK`
- 16 FK insights detected during description phase
- But: "foreignKeysDiscovered": 0 in discovery output
- ERD diagram shows no FK arrows
- Table descriptions say "likely a foreign key" but no FK metadata

**Analysis:**
FK insights ARE being extracted from LLM descriptions, but they're only being used to:
1. ✅ Reject those columns as PKs (good!)
2. ❌ NOT populate foreignKeyReferences in column metadata
3. ❌ NOT populate state.schemas[].tables[].columns[].foreignKeyReferences

**Missing Code:**
Need to parse FK insights and populate:
```typescript
column.isForeignKey = true;
column.foreignKeyReferences = {
  schema: targetSchema,
  table: targetTable,
  column: targetColumn,
  referencedColumn: targetColumn
};
```

#### 3. FK Statistical Detection Too Strict
**Evidence:**
```
[FKDetector]     Candidate confidence: 40 (min: 60)
[FKDetector]     Candidate confidence: 57 (min: 60)
[FKDetector]     Candidate confidence: 51 (min: 60)
```

- Many FK candidates found but rejected (confidence 40-57%)
- Minimum threshold: 60%
- Result: 0 FKs discovered statistically

**Options:**
1. Lower threshold to 50%
2. Improve FK scoring algorithm
3. Rely more on LLM for FK detection (current approach is working via insights!)

#### 4. Still Hitting 50 Iteration Limit
- No convergence logic triggering early stop
- All 50 iterations run with no material changes after iteration 1
- Wasting 107K tokens on redundant LLM calls

## Recommendations

### Priority 1: Fix FK Metadata Population
The system IS detecting FKs via LLM insights, but not saving them to metadata.

**Action**: Update AnalysisEngine.ts where it processes FK insights to populate:
- `column.isForeignKey = true`
- `column.foreignKeyReferences = {...}`
- Update state file FK count

### Priority 2: Fix LLM Validation Token Reporting
Debug why discovery phase LLM shows 0 tokens when description phase shows 107K.

**Action**: Add logging to LLMDiscoveryValidator.ts:
```typescript
console.log('[LLMValidator] ChatResult:', chatResult.success);
console.log('[LLMValidator] Usage object:', JSON.stringify(chatResult.data?.usage));
```

### Priority 3: Improve Convergence Detection
Stop after iteration 2 if no material changes.

**Action**: Compare iteration N vs N-1:
- If PK count unchanged AND FK count unchanged → converged

### Priority 4: Lower FK Statistical Threshold (Optional)
Since LLM insights are working well, this is lower priority.

**Action**: Change config from 60% to 50% threshold

## Summary

Run-8 shows SIGNIFICANT progress:
- ✅ PKs reduced 32% (63 → 43)
- ✅ Blacklist working perfectly
- ✅ FK insights being detected by LLM
- ❌ FK metadata not being populated (critical bug)
- ❌ Discovery LLM showing 0 tokens (debug needed)
- ❌ Convergence not working (wasting tokens)

**Next Steps**: Fix FK metadata population, then run iteration 9 to test.
