# DBAutoDoc Quality Improvement Plan

## Current Issues (Run-7)
- ❌ 63 false-positive PKs detected (qty, seq, lvl, exp_qty, act_qty, etc.)
- ❌ 0 FK relationships found despite obvious connections (prd_id→prd, whs_id→whs)
- ❌ LLM validation returned 0 tokens (silently failing)
- ❌ Descriptions missing FK markers
- ❌ Hit max iterations (50) without quality convergence

## Root Cause Analysis
1. **Pure statistical PK detection is too aggressive** - treating ANY unique column as PK
2. **FK confidence scoring too strict** - all candidates scored <60%
3. **LLM validation failing silently** - no error handling/logging
4. **Over-reliance on statistics, under-reliance on LLM intelligence**

## New Strategy: LLM-FIRST Approach

### Phase 1: Radically Simplify PK Detection
- Only detect PKs for columns ending in `_id` or named `id`
- Use LLM to validate/discover composite keys
- Reject quantity/sequence/level columns immediately

### Phase 2: LLM-Driven FK Discovery
- Give LLM full table structure context
- Let LLM identify relationships based on:
  - Column naming patterns
  - Data types
  - Cardinality observations
  - Business logic understanding
- Use statistics only to VALIDATE LLM suggestions

### Phase 3: Continuous LLM Refinement
- LLM reviews its own previous iterations
- Self-correction loop with clear feedback
- Focus on relationship COMPLETENESS not just confidence

### Phase 4: Quality Metrics
- Measure: # of PKs detected (expect ~20, not 63)
- Measure: # of FKs detected (expect ~40+)
- Measure: LLM token usage (should be >0 and substantial)
- Measure: Description quality with FK markers

## Implementation Plan

### Iteration 1: Fix PK Detection
- [x] Add stricter filtering in PKDetector
- [ ] Disable composite PK detection initially
- [ ] Add debug logging

### Iteration 2: Enable LLM Validation
- [ ] Fix silent LLM failures
- [ ] Add comprehensive error logging
- [ ] Ensure LLM is actually called

### Iteration 3: Rewrite FK Detection
- [ ] Lower confidence threshold OR
- [ ] Rewrite scoring algorithm OR
- [ ] Use LLM-first approach

### Iteration 4-10: Iterative Quality Improvements
- [ ] Test and measure
- [ ] Adjust prompts
- [ ] Refine algorithms
- [ ] Iterate until academic-quality results

## Success Criteria
- ✅ <25 PKs detected across 20 tables
- ✅ >30 FKs detected
- ✅ LLM tokens used >10,000
- ✅ All obvious FKs present in markdown
- ✅ Descriptions include FK markers
- ✅ Converges in <20 iterations
