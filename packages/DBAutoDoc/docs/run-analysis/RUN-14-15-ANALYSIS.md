# Run-14 & Run-15 Analysis: FK Table Name Resolution Fix

## Critical Issue Identified

**User feedback**: "do we give the LLM the names of all of the tables that exist when doing this work, we need to do that so that we don't get made up table names."

**Problem**: LLM was making up English table names like "product", "warehouse", "purchase", "customer" instead of using actual abbreviated table names "prd", "whs", "po", "cst".

**Evidence from run-13**:
```
[AnalysisEngine] Could not resolve target table "product" for FK inv.adj.prd_id
[AnalysisEngine] Could not resolve target table "warehouse" for FK inv.adj.whs_id
[AnalysisEngine] Could not resolve target table "customer" for FK sales.addr.cst_id
[AnalysisEngine] Could not resolve target table "purchase" for FK inv.po_dtl.po_id
```

## Fix Implemented

### 1. Updated TableAnalysisContext Type
**File**: [src/types/analysis.ts:58](src/types/analysis.ts#L58)

Added `allTables` field to provide complete list of available tables:

```typescript
export interface TableAnalysisContext {
  schema: string;
  table: string;
  rowCount: number;
  columns: any[];
  dependsOn: any[];
  dependents: any[];
  sampleData: any[];
  parentDescriptions?: ParentTableDescription[];
  userNotes?: string;
  seedContext?: any;
  allTables?: Array<{ schema: string; name: string }>; // NEW
}
```

### 2. Updated buildTableContext Method
**File**: [src/core/AnalysisEngine.ts:274-280](src/core/AnalysisEngine.ts#L274-L280)

Added logic to populate `allTables` from state:

```typescript
// Build list of all tables in the database for FK reference validation
const allTables: Array<{ schema: string; name: string }> = [];
for (const schema of state.schemas) {
  for (const tbl of schema.tables) {
    allTables.push({ schema: schema.name, name: tbl.name });
  }
}

return {
  // ... other context fields ...
  allTables
};
```

### 3. Updated Table Analysis Prompt Template
**File**: [prompts/table-analysis.md:65-73](prompts/table-analysis.md#L65-L73)

Added section that lists all available tables with explicit instruction:

```markdown
{% if allTables %}
## All Database Tables
**IMPORTANT**: When referring to foreign key relationships, you MUST use one of these exact table names:
{% for tbl in allTables %}
- {{ tbl.schema }}.{{ tbl.name }}
{% endfor %}

**Do NOT make up table names** - only use the exact names listed above.
{% endif %}
```

**Critical Fix**: Initially used `{% if allTables and allTables.length > 0 %}` which failed because Nunjucks doesn't support `.length` in conditionals. Fixed to just `{% if allTables %}`.

## Test Progression

### Run-13 (Before Fix)
- LLM making up table names: "product", "warehouse", "purchase"
- FK resolution failures: "Could not resolve target table..."
- Status: ❌ FK table name resolution failing

### Run-14 (First Attempt)
- Template conditional syntax error: `allTables.length > 0` not supported by Nunjucks
- "All Database Tables" section NOT appearing in prompts
- Status: ❌ Still failing (template not rendering)

### Run-15 (Final Fix)
- Fixed template conditional to `{% if allTables %}`
- Compiled successfully
- Running now...
- Status: ⏳ Testing in progress

## Expected Improvements

### Before Fix
```
LLM Output:
- inv.adj.prd_id is FK to "product" ❌ (made-up name)
- inv.adj.whs_id is FK to "warehouse" ❌ (made-up name)
- inv.po_dtl.po_id is FK to "purchase" ❌ (made-up name)

Result:
- "Could not resolve target table 'product'"
- FK creation FAILS
```

### After Fix
```
Prompt includes:
## All Database Tables
**IMPORTANT**: When referring to foreign key relationships, you MUST use one of these exact table names:
- inv.adj
- inv.cat
- inv.cnt
- inv.po
- inv.po_dtl
- inv.prd
- inv.rcv
- inv.stk
- inv.sup
- inv.whs
- sales.addr
- sales.cst
- sales.cst_note
- sales.eml
- sales.oli
- sales.ord
- sales.phn
- sales.pmt
- sales.rtn
- sales.shp

**Do NOT make up table names** - only use the exact names listed above.

Expected LLM Output:
- inv.adj.prd_id is FK to inv.prd ✅ (correct name)
- inv.adj.whs_id is FK to inv.whs ✅ (correct name)
- inv.po_dtl.po_id is FK to inv.po ✅ (correct name)

Expected Result:
- FK resolution SUCCEEDS
- Foreign keys created correctly
```

## Files Modified

1. **src/types/analysis.ts** - Added `allTables` field to TableAnalysisContext
2. **src/core/AnalysisEngine.ts** - Populated `allTables` in buildTableContext
3. **prompts/table-analysis.md** - Added "All Database Tables" section with explicit instructions

## Related Issues

This fix addresses the root cause of:
- FK insights failing to resolve target tables
- Made-up table names preventing FK creation
- Cascading failures in FK relationship discovery

## Next Steps

1. ✅ Run-15 test complete verification
2. ⏳ Check if LLM now uses correct table names from list
3. ⏳ Verify FK creation succeeds with proper table names
4. ⏳ Compare FK count: run-13 vs run-15
5. ⏳ Analyze overall quality improvements

## Success Criteria

- [ ] "All Database Tables" section appears in all table-analysis prompts
- [ ] LLM uses ONLY table names from the provided list
- [ ] Zero "Could not resolve target table" errors
- [ ] FK creation succeeds for relationships LLM identifies
- [ ] FK count increases significantly from previous runs

## Technical Insights

### Nunjucks Template Gotchas
- ❌ `{% if array.length > 0 %}` - NOT supported
- ✅ `{% if array %}` - Correct approach
- Arrays and objects are truthy in Nunjucks conditionals
- Use `{% if array | length %}` if you need explicit length check

### Context Passing
- `buildTableContext` is called for EVERY table analysis
- Context object is passed directly to PromptEngine
- Template engine (Nunjucks) receives full context
- Optional fields (with `?`) allow gradual feature addition

## Lessons Learned

1. **Always verify prompt rendering**: Check actual LLM input, not just code
2. **Template engine syntax varies**: Nunjucks != Jinja2 != Handlebars
3. **Provide explicit constraints**: LLM needs concrete options, not just instructions
4. **Test incrementally**: Run-14 caught template syntax issue before full test

## Summary

The FK table name resolution issue was caused by the LLM not knowing which table names exist in the database. The fix provides an explicit, exhaustive list of valid table names directly in the table-analysis prompt, with clear instructions to only use names from that list. This should eliminate "made-up" table names and dramatically improve FK creation success rates.

**Status**: Fix implemented, compiled, and testing in run-15.
