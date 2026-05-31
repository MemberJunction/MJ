# SQL Logger Space Padding Bug - Fix Implementation Plan

## Executive Summary

**Bug**: The `_getIndentForPosition()` method in SqlLogger creates massive space padding (hundreds of thousands of spaces) when splitting large text fields, causing data corruption in database migrations.

**Impact**: NVARCHAR(MAX) and VARCHAR(MAX) fields exceeding 4000/8000 characters become corrupted with enormous amounts of trailing whitespace appended after valid data.

**Fix**: Replace dynamic indentation calculation with fixed 4-space indent.

**Status**: Root cause identified, fix ready to implement.

---

## Bug Analysis

### Discovered Corruption Pattern

**Example**: SimpleDrilldownChart component specification
- **Source file**: 12,648 bytes (valid JSON)
- **Corrupted in database**: 1,427,555 bytes (113x larger!)
- **Corruption**: 1.38 million characters of whitespace appended after valid JSON
  - Line 1: UUID + "Generic/UI/Chart" + **663,806 SPACES**
  - Line 2: UUID + "Testing/Chart" + **658,229 SPACES**

### Root Cause

**File**: [packages/SQLServerDataProvider/src/SqlLogger.ts:544-559](../packages/SQLServerDataProvider/src/SqlLogger.ts#L544-L559)

**Method**: `_getIndentForPosition(sql: string, position: number)`

**The Bug**:
```typescript
private _getIndentForPosition(sql: string, position: number): string {
  // Find the start of the current line
  let lineStart = position;
  while (lineStart > 0 && sql[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Count leading whitespace on current line
  let indent = '';
  for (let i = lineStart; i < position && /\s/.test(sql[i]); i++) {  // ⚠️ BUG HERE
    indent += sql[i];  // Accumulates ALL whitespace from lineStart to position!
  }

  // Add extra indentation for continuation (4 spaces)
  return indent + '    ';
}
```

**What Happens**:
1. `_splitLargeStringsForSqlServer()` processes large SQL statements (e.g., INSERT with large NVARCHAR(MAX) values)
2. When it finds a string literal at position `matchStart`, it calls `_getIndentForPosition(sql, matchStart)`
3. **If the SQL statement is huge** (e.g., 500KB), and `matchStart` points far into the file, the loop collects all whitespace characters from the line start up to `matchStart`
4. In large SQL files with formatted statements, this can collect **hundreds of thousands of spaces**
5. This massive "indent" string is prepended to every continuation chunk (line 430: `const prefix = index === 0 ? '' : indent;`)
6. Result: Each chunk after the first gets prefixed with 600K+ spaces

**Why This Happens**:
The intent was to preserve indentation for pretty-printed SQL. However, the logic incorrectly treats "position in file" as "leading whitespace". If a string literal starts at character 663,806 in a SQL file, and the line has been padded with spaces for some reason, the loop collects all those spaces.

### Affected Fields

Any NVARCHAR(MAX) or VARCHAR(MAX) field that:
1. Contains more than 4000 (NVARCHAR) or 8000 (VARCHAR) characters
2. Gets processed by `_splitLargeStringsForSqlServer()`
3. Appears in a SQL statement at a large character position

**Known affected**:
- `Components.Specification` - Complete JSON specification objects

**Potentially affected** (any MAX field with large content):
- Template fields
- Large text descriptions
- Code/script fields
- JSON configuration blobs

---

## Fix Implementation

### Approach: Fixed Indentation (Option 1)

**Replace dynamic indentation with a simple fixed indent.**

**Why this approach**:
1. **Simplest**: Minimal code change, no complex logic
2. **Safest**: Cannot introduce new bugs related to whitespace calculation
3. **Sufficient**: Migration SQL doesn't need perfect indentation, just correctness
4. **Proven**: Standard practice in code generators to use fixed indent

**Trade-off**: Generated SQL won't perfectly match existing indentation, but it will be correct and readable.

### Code Change

**File**: `packages/SQLServerDataProvider/src/SqlLogger.ts`

**Line 544-559** - Replace entire method:

```typescript
/**
 * Returns fixed indentation for SQL continuation lines.
 * Uses a simple 4-space indent instead of dynamic calculation to avoid
 * accumulating massive whitespace in large SQL statements.
 *
 * @param _sql - The SQL string (unused, kept for signature compatibility)
 * @param _position - Position to check (unused, kept for signature compatibility)
 * @returns Fixed indentation string (4 spaces)
 */
private _getIndentForPosition(_sql: string, _position: number): string {
  // Fixed 4-space indent for continuation lines
  // Previous dynamic calculation could accumulate hundreds of thousands of spaces
  // in large SQL files, causing data corruption. Fixed indent is simpler and safer.
  return '    ';
}
```

**Alternative (if we want to remove unused parameters)**:
```typescript
/**
 * Returns fixed indentation for SQL continuation lines.
 *
 * @returns Fixed indentation string (4 spaces)
 */
private _getFixedIndent(): string {
  return '    ';
}
```
Then update line 427:
```typescript
// OLD: const indent = this._getIndentForPosition(sql, matchStart);
// NEW:
const indent = this._getFixedIndent();
```

**Recommendation**: Keep the first approach to maintain method signature compatibility in case other code references it.

---

## Implementation Steps

### Phase 1: Code Fix
- [ ] Update `_getIndentForPosition()` method in SqlLogger.ts
- [ ] Add JSDoc comment explaining why we use fixed indent
- [ ] Build the SQLServerDataProvider package to verify no compilation errors

### Phase 2: Testing

#### Unit Tests
Create test file: `packages/SQLServerDataProvider/src/tests/SqlLogger.test.ts`

Test cases needed:
1. **Test string splitting with fixed indent**
   - Input: String with 5000 characters
   - Verify: Output has CAST and continuation with 4 spaces, NO massive padding

2. **Test large position doesn't cause padding**
   - Input: String at position 500,000 in large SQL
   - Verify: Indent is exactly 4 spaces, not 500,000 spaces

3. **Test multiple chunks**
   - Input: String with 12,000 characters (requires 3 chunks)
   - Verify: Each continuation has exactly 4 spaces, no accumulation

4. **Test with SimpleDrilldownChart spec**
   - Input: Actual spec file content (functionalRequirements: 7519 chars)
   - Verify: Generated SQL is valid, no massive padding

Example test:
```typescript
import { SqlLoggingSessionImpl } from '../SqlLogger';

describe('SqlLogger String Splitting', () => {
  it('should use fixed 4-space indent for continuations', async () => {
    const session = new SqlLoggingSessionImpl(
      'test',
      '/tmp/test.sql',
      { formatAsMigration: true, defaultSchemaName: 'dbo' }
    );

    await session.initialize();

    // Create a string that requires splitting (5000 chars)
    const largeValue = 'A'.repeat(5000);
    const sql = `INSERT INTO Table (Field) VALUES (N'${largeValue}')`;

    await session.logSqlStatement(sql, {}, 'Test large string', true);
    await session.dispose();

    // Read the generated SQL
    const output = fs.readFileSync('/tmp/test.sql', 'utf8');

    // Verify no massive space padding
    const spaceRuns = output.match(/ {100,}/g); // Find runs of 100+ spaces
    expect(spaceRuns).toBeNull(); // Should have no long space runs

    // Verify continuation lines have reasonable indent
    const lines = output.split('\n');
    const continuationLines = lines.filter(l => l.includes('+ N\''));
    continuationLines.forEach(line => {
      const leadingSpaces = line.match(/^ */)[0].length;
      expect(leadingSpaces).toBeLessThan(50); // Should be small indent, not thousands
    });
  });
});
```

#### Integration Test
1. Create test component spec with large fields (>10KB)
2. Run mj-sync push with the fixed code
3. Query database for the Component record
4. Verify Specification field matches source (no padding)
5. Verify total byte count is reasonable

### Phase 3: Validation with Production Data

#### Test with SimpleDrilldownChart
1. Re-sync the SimpleDrilldownChart component spec
2. Query database: `SELECT LEN(Specification) FROM [MJ: Components] WHERE Name = 'SimpleDrilldownChart'`
3. Expected: ~40,000 characters (not 1.4 million)
4. Export Specification field and verify valid JSON
5. Compare with source files to ensure content integrity

#### Identify all corrupted records
```sql
-- Find Components with suspiciously large Specification fields
SELECT
  ID,
  Name,
  Namespace,
  LEN(Specification) AS SpecLength,
  LEN(LTRIM(RTRIM(Specification))) AS TrimmedLength,
  (LEN(Specification) - LEN(LTRIM(RTRIM(Specification)))) AS WhitespacePadding
FROM [MJ: Components]
WHERE LEN(Specification) > 100000  -- Anything over 100KB is suspicious
ORDER BY SpecLength DESC;
```

#### Re-sync all affected records
1. Identify all Components with corrupted Specification
2. Re-run mj-sync push to repair them
3. Verify all records are now correct size
4. Spot-check several records for content integrity

---

## Testing Checklist

### Pre-Fix Validation
- [x] Confirmed corruption pattern (663K spaces)
- [x] Identified root cause in `_getIndentForPosition()`
- [x] Located example corrupted record (SimpleDrilldownChart)

### Post-Fix Validation
- [ ] Unit tests pass
- [ ] Build succeeds with no TypeScript errors
- [ ] Integration test passes
- [ ] SimpleDrilldownChart re-syncs to correct size
- [ ] All corrupted Components identified
- [ ] All corrupted Components repaired
- [ ] No new corruption in test syncs

---

## Success Criteria

### Must Have
1. ✅ `_getIndentForPosition()` returns fixed 4-space indent
2. ✅ No space padding exceeding 100 characters in generated SQL
3. ✅ All unit tests pass
4. ✅ SimpleDrilldownChart Specification is ~40KB (not 1.4MB)
5. ✅ Re-synced data exactly matches source files
6. ✅ No TypeScript compilation errors

### Should Have
1. ✅ Unit test coverage for string splitting edge cases
2. ✅ Documentation in code explaining the fix
3. ✅ All corrupted database records identified and repaired
4. ✅ Validation query confirms no records with excessive padding

### Nice to Have
1. Add logging/warning if SQL statement exceeds certain size
2. Performance benchmarks (fixed indent should be faster)
3. Regression test suite for future changes to splitting logic

---

## Rollback Plan

If the fix causes issues:

1. **Revert code**: Git revert the commit
2. **Rebuild**: `npm run build` in SQLServerDataProvider
3. **Alternative**: Implement Option 2 (limited indent collection) or Option 3 (stop at non-whitespace)

---

## Timeline

**Estimated time**: 2-3 hours total

- **Implementation**: 30 minutes (code change + build)
- **Unit tests**: 1 hour (write tests + verify)
- **Integration test**: 30 minutes (test with real data)
- **Database repair**: 30 minutes (identify + re-sync corrupted records)
- **Validation**: 30 minutes (verify all fixes working)

---

## Related Files

### Code Files
- [SqlLogger.ts:544-559](../packages/SQLServerDataProvider/src/SqlLogger.ts#L544-L559) - Bug location
- [SqlLogger.ts:387-458](../packages/SQLServerDataProvider/src/SqlLogger.ts#L387-L458) - String splitting logic
- [SqlLogger.ts:427](../packages/SQLServerDataProvider/src/SqlLogger.ts#L427) - Method invocation

### Test Data
- Source: `metadata/components/spec/generic/simple-drilldown-chart.spec.json`
- Corrupted: `plans/LargeTextFieldCorruption_Examples/SimpleChart_Corrupted.json`

### Database
- Table: `[MJ: Components]`
- Field: `Specification` (NVARCHAR(MAX))

---

## Open Questions

1. **Are there other entities with corrupted MAX fields?**
   - Need to scan all entities for fields with excessive padding
   - Query: Check all NVARCHAR(MAX)/VARCHAR(MAX) fields for records > 100KB

2. **When did this bug get introduced?**
   - The splitting logic was recently added
   - Check git history to identify the commit

3. **How many production databases are affected?**
   - This affects any system that ran migrations with the buggy code
   - May need to provide repair script for customer databases

---

## Notes

- The fixed indent approach is standard practice in most SQL generators
- Perfect indentation is not critical for migration SQL - correctness is paramount
- This bug only affects metadata sync operations, not runtime queries
- The 4-space indent is consistent with the rest of the SqlLogger formatting

---

**Plan Status**: Ready for Implementation
**Priority**: High (data corruption bug)
**Complexity**: Low (simple code change)
**Risk**: Low (fix is straightforward)
**Last Updated**: 2026-01-27
**Author**: Claude Code
