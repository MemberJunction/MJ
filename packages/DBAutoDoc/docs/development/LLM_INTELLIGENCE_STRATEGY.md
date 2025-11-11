# LLM Intelligence Strategy for DBAutoDoc

## Philosophy: LLM-First, Statistics-Second

The core insight: **LLMs are dramatically better at understanding schema semantics than pure statistics**. We should use statistics to generate *candidates*, then use LLM heavily to *validate, refine, and discover*.

## Current State (Run-9 Analysis)

### What's Working ✅
- FK insights from descriptions working (`prd_id` → product table)
- Blacklist reducing false-positive PKs (qty, seq, lvl rejected)
- High-quality descriptions for ~50% of tables (96% confidence)
- FK markers showing in ERD diagrams

### Critical Problems ❌
1. **Way too many false-positive PKs**:
   - `sales.addr`: 3 PKs (addr_id, cst_id, ln2) - should be 1
   - `sales.cst`: 4 PKs (cst_id, rep_id, lst_ord) - should be 1
   - Date fields incorrectly marked as PK (dlv_dt, ship_dt, lst_ord)

2. **FK target resolution failures**:
   - `adj.adj_id` marked as FK but points to wrong table (adj.prd_id instead of separate table)
   - Need smarter target resolution

3. **Missing descriptions**:
   - 10 tables have no descriptions at all (sup, whs, addr, cst, cst_note, eml, oli, ord, phn, pmt, rtn, shp)
   - Bug in description generation phase

4. **No convergence detection**:
   - All 50 iterations run with no changes after iteration 1
   - Wasting 107K tokens on redundant LLM calls

## Strategic LLM Injection Points

### Phase 1: Discovery Intelligence

#### 1A. PK/FK Sanity Check (NEW - HIGHEST PRIORITY)
**When**: After statistical PK/FK detection, before LLM validation per table

**Prompt**:
```
You are a database schema expert. Review these detected primary keys and foreign keys for obvious errors.

DETECTED PRIMARY KEYS:
{list of all PKs with column names, data types, uniqueness stats}

DETECTED FOREIGN KEYS:
{list of all FKs with source→target mappings}

CRITICAL RULES:
1. Date fields are NEVER primary keys (they're not unique per row)
2. Quantity fields are NEVER primary keys
3. Every table should have exactly 1 PK (or composite PK with 2-3 columns)
4. Foreign keys should point to another table, not self-reference

TASK:
- Identify PKs that are definitely WRONG (with reasoning)
- Identify FKs that are definitely WRONG (with reasoning)
- Suggest corrections

OUTPUT FORMAT (JSON):
{
  "invalidPKs": [
    {"schema": "sales", "table": "addr", "column": "ln2", "reason": "VARCHAR field, not unique identifier"},
    {"schema": "sales", "table": "cst", "column": "lst_ord", "reason": "Date field, cannot be PK"}
  ],
  "invalidFKs": [
    {"schema": "inv", "table": "adj", "column": "adj_id", "reason": "Self-referencing FK, likely misidentified"}
  ],
  "suggestions": [
    "sales.addr should have only addr_id as PK",
    "sales.cst should have only cst_id as PK"
  ]
}
```

**Budget**: 5,000-10,000 tokens (one-time macro view)

**Impact**: Could eliminate 50%+ of false-positive PKs in one shot

---

#### 1B. FK Target Resolution (NEW - HIGH PRIORITY)
**When**: After FK candidates identified, before finalizing FK metadata

**Prompt**:
```
You are a database relationship expert. For each foreign key candidate, determine the CORRECT target table and column.

FULL SCHEMA CONTEXT:
{all tables with PKs marked}

FK CANDIDATES TO RESOLVE:
- inv.adj.prd_id (hint: "product")
- inv.adj.whs_id (hint: "warehouse")
- inv.po.sup_id (hint: "supplier")
- sales.oli.prd_id (hint: "product")
- sales.shp.whs_id (hint: "warehouse")

TASK:
For each FK candidate:
1. Identify the target schema.table.column
2. Verify the target column is a PK
3. Check for naming consistency
4. Consider cross-schema relationships

OUTPUT FORMAT (JSON):
{
  "resolutions": [
    {
      "sourceFK": "inv.adj.prd_id",
      "targetPK": "inv.prd.prd_id",
      "confidence": 0.95,
      "reasoning": "Naming match, prd_id is PK in prd table, same schema"
    },
    {
      "sourceFK": "sales.oli.prd_id",
      "targetPK": "inv.prd.prd_id",
      "confidence": 0.90,
      "reasoning": "Cross-schema relationship, product sold in orders"
    }
  ],
  "warnings": [
    "inv.adj.adj_id appears to self-reference - investigate if this is composite key scenario"
  ]
}
```

**Budget**: 3,000-5,000 tokens per batch of 20 FKs

**Impact**: Accurate FK→PK mappings, catch cross-schema relationships

---

#### 1C. Cross-Schema Relationship Discovery (NEW - MEDIUM PRIORITY)
**When**: After per-schema discovery completes

**Prompt**:
```
You are analyzing a multi-schema database. Identify cross-schema foreign key relationships.

SCHEMA SUMMARY:
- inv schema: Products, Warehouses, Suppliers, Inventory, Adjustments, Purchase Orders
- sales schema: Customers, Orders, Order Lines, Shipments, Payments, Returns

HINT: The inv schema likely manages inventory/products, and sales schema likely references those products.

TASK:
Identify columns in sales schema that reference tables in inv schema (and vice versa).

OUTPUT FORMAT (JSON):
{
  "crossSchemaFKs": [
    {
      "sourceFK": "sales.oli.prd_id",
      "targetPK": "inv.prd.prd_id",
      "confidence": 0.95,
      "reasoning": "Order line items reference product catalog"
    },
    {
      "sourceFK": "sales.shp.whs_id",
      "targetPK": "inv.whs.whs_id",
      "confidence": 0.90,
      "reasoning": "Shipments originate from warehouse locations"
    }
  ]
}
```

**Budget**: 2,000-3,000 tokens (one-time macro view)

**Impact**: Discover relationships statistics can't find

---

### Phase 2: Description Intelligence

#### 2A. Missing Description Recovery (BUG FIX - IMMEDIATE)
**When**: After description generation, check for tables with no description

**Current Bug**: 10 tables have no descriptions in run-9
**Root Cause**: Need to investigate AnalysisEngine.ts description generation logic

**Action**: Debug why these tables skipped, ensure every table gets described

---

#### 2B. FK Insight Extraction Enhancement (EXISTING - NEEDS IMPROVEMENT)
**Current**: Extracting FK insights from descriptions ✅
**Problem**: Not always accurate (adj_id → adj.prd_id instead of separate table)

**Improvement**: When extracting FK insights, validate against known PKs:
```typescript
// After extracting FK insight "prd_id → product"
const resolvedTarget = this.resolveTargetTable(state, "product", schemaName);

// ENHANCEMENT: Verify target column is actually a PK
if (resolvedTarget) {
  const targetTable = this.findTableInState(state, resolvedTarget.schema, resolvedTarget.table);
  const targetColumn = targetTable.columns.find(c => c.name === resolvedTarget.column);

  if (!targetColumn.isPrimaryKey) {
    console.warn(`[AnalysisEngine] FK insight target ${resolvedTarget.table}.${resolvedTarget.column} is not a PK - rejecting`);
    return; // Don't create FK
  }
}
```

---

### Phase 3: Convergence Intelligence

#### 3A. Iteration Convergence Check (NEW - HIGH PRIORITY)
**When**: After each description iteration completes

**Prompt**:
```
You are analyzing database documentation quality across iterations.

ITERATION N-1:
- 5 tables with descriptions
- 43 PKs detected
- 12 FKs detected
- Average confidence: 94%

ITERATION N:
- 5 tables with descriptions (same)
- 43 PKs detected (same)
- 12 FKs detected (same)
- Average confidence: 94% (same)

TASK:
Determine if we have converged (no material improvements possible).

OUTPUT FORMAT (JSON):
{
  "converged": true,
  "reasoning": "No changes in PK/FK counts, descriptions unchanged, confidence stable",
  "recommendation": "Stop iterating, current quality is optimal"
}
```

**Budget**: 500-1,000 tokens per iteration check

**Impact**: Save 90%+ of wasted token usage, stop at iteration 2-3 instead of 50

---

#### 3B. Quality Assessment & Next Steps (NEW - MEDIUM PRIORITY)
**When**: After run completes

**Prompt**:
```
You are a database documentation quality expert. Assess this output and recommend improvements.

FINAL STATE:
- 20 tables documented
- 43 PKs detected
- 12 FKs detected
- 10 tables with missing descriptions
- 15 date/quantity fields incorrectly marked as PK

TASK:
1. Rate overall quality (0-100)
2. Identify top 3 issues
3. Recommend specific code changes

OUTPUT FORMAT (JSON):
{
  "qualityScore": 65,
  "topIssues": [
    "Too many false-positive PKs - date fields incorrectly marked",
    "Missing descriptions for 50% of tables",
    "FK target resolution errors"
  ],
  "recommendations": [
    "Add date/quantity field blacklist to PK detector",
    "Fix description generation bug for small tables",
    "Implement FK target validation against known PKs"
  ]
}
```

**Budget**: 2,000-3,000 tokens (one-time final assessment)

**Impact**: Automated quality feedback loop, identify bugs

---

## Implementation Roadmap

### Sprint 1: Fix Critical Bugs (Immediate)
1. ✅ PK blacklist (done in run-8)
2. ✅ FK metadata population (done in run-9)
3. 🔴 **Fix missing descriptions bug** (10 tables with no description)
4. 🔴 **Add PK sanity check** - reject date/qty fields as PKs
5. 🔴 **Add FK target validation** - verify target is a PK

### Sprint 2: Add Intelligence Layers (Next)
6. 🟡 **Implement Phase 1A: PK/FK Sanity Check** (one-time macro LLM call)
7. 🟡 **Implement Phase 1B: FK Target Resolution** (batch LLM call)
8. 🟡 **Implement Phase 3A: Convergence Check** (per-iteration LLM call)

### Sprint 3: Advanced Features (Future)
9. 🟢 **Implement Phase 1C: Cross-Schema Discovery** (macro LLM call)
10. 🟢 **Implement Phase 3B: Quality Assessment** (final LLM call)

## Budget & Cost Analysis

### Current Token Usage (Run-9):
- 50 iterations × ~2,140 tokens/iteration = 107K tokens
- Cost: ~$0 (Groq free tier)

### Proposed Token Usage with Intelligence:
- **PK/FK Sanity Check**: 10K tokens (one-time)
- **FK Target Resolution**: 5K tokens/batch × 1 batch = 5K tokens
- **Convergence Check**: 1K tokens/iteration × 3 iterations = 3K tokens
- **Description Generation**: 2K tokens/table × 20 tables = 40K tokens
- **Cross-Schema Discovery**: 3K tokens (one-time)
- **Quality Assessment**: 3K tokens (one-time)

**Total**: ~64K tokens (40% reduction from run-9!)
**Estimated Quality**: 90%+ (vs current 65%)

## Success Metrics

### Target State (Academic Quality):
- ✅ <25 PKs detected (1 per table + composite keys)
- ✅ >30 FKs detected (all major relationships)
- ✅ 100% table description coverage
- ✅ 0 date/quantity fields as PKs
- ✅ 95%+ FK target accuracy
- ✅ Converges in <5 iterations
- ✅ Cross-schema relationships discovered

### Current State (Run-9):
- ❌ 43+ PKs detected (way too many)
- ❌ ~12 FKs detected (missing many)
- ❌ 50% table description coverage
- ❌ Multiple date/quantity fields as PKs
- ❌ FK target errors (adj_id → adj.prd_id)
- ❌ 50 iterations (no convergence)
- ❌ No cross-schema relationships

## Conclusion

**The key insight**: We need MORE LLM intelligence at strategic checkpoints, NOT more iterations.

Current approach wastes tokens on redundant iterations. New approach uses tokens for intelligent validation and discovery.

**Expected improvement**:
- Token usage: ↓ 40%
- Quality: ↑ 40%
- Runtime: ↓ 80% (5 iterations vs 50)
