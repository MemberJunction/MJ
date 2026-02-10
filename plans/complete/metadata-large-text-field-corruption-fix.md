# Investigation and Resolution Plan: Large Text Field Corruption in Migrations

## Problem Statement

Large text fields (NVARCHAR(MAX), VARCHAR(MAX)) are getting corrupted during the migration process when using `mj sync push`. The **Specification field in the Components Entity** is a known affected field. The corruption appears to be related to the string splitting logic recently added to [SqlLogger.ts](../packages/SQLServerDataProvider/src/SqlLogger.ts) to handle SQL Server's 4000/8000 character literal limits.

## Background

### SQL Server String Literal Limits
- **NVARCHAR literals**: 4000 characters maximum
- **VARCHAR literals**: 8000 characters maximum
- Even though NVARCHAR(MAX)/VARCHAR(MAX) fields can store 2GB, individual string literals in INSERT/UPDATE statements are truncated at these limits
- The SqlLogger implements splitting logic to work around this limitation

### Recent Changes
- String splitting logic was added to `SqlLogger._splitLargeStringsForSqlServer()` (lines 387-458)
- This logic splits large strings into concatenated chunks with CAST to prevent truncation
- Safe split point detection was added to avoid breaking:
  - Escaped quote pairs (`''`)
  - Flyway escape patterns (`$'+'{`)

### Affected Fields
Known:
1. **Components.Specification** (NVARCHAR(MAX)) - Complete JSON specification objects

Potentially affected (to be identified):
- Any NVARCHAR(MAX) or VARCHAR(MAX) field > 4000/8000 characters
- Common candidates: JSON blobs, large text descriptions, code fields, templates

## Investigation Tasks

### 1. Reproduce and Document the Issue
- [ ] **Get example of corrupted data from user**
  - Original source file content
  - Database content after migration
  - Specific differences/corruption patterns

- [ ] **Create minimal reproduction case**
  - Identify smallest spec file that reproduces corruption
  - Document exact corruption symptoms (truncation? character mangling? pattern breakage?)

- [ ] **Test with various data sizes**
  - Text exactly at boundary (3999, 7999 chars)
  - Text slightly over boundary (4001, 8001 chars)
  - Text significantly over boundary (10000, 20000+ chars)
  - Text with multiple split points required

### 2. Analyze String Splitting Logic
Review [`SqlLogger._splitLargeStringsForSqlServer()`](../packages/SQLServerDataProvider/src/SqlLogger.ts#L387-L458):

- [ ] **Verify regex pattern correctness**
  - Line 400: `/(N)?'((?:[^']|'')*)'/g` - Does this correctly match all string literals?
  - Does it handle edge cases: empty strings, strings with only escaped quotes, unicode strings?

- [ ] **Analyze chunk splitting logic**
  - [`_splitStringContent()`](../packages/SQLServerDataProvider/src/SqlLogger.ts#L469-L490) - Correct chunking?
  - [`_findSafeSplitPoint()`](../packages/SQLServerDataProvider/src/SqlLogger.ts#L502-L535) - Edge cases?
  - Are there additional patterns that need protection beyond `''` and `$'+'{`?

- [ ] **Check concatenation format**
  - Lines 428-441: Concatenation with `+` and CAST
  - Verify newline handling and indentation
  - Ensure proper quote escaping in chunks

- [ ] **Review interaction with Flyway escaping**
  - Line 168: `_escapeFlywaySyntaxInStrings()` runs BEFORE splitting
  - Could escaped patterns interfere with split point detection?
  - Order of operations: escape → split → schema replacement

### 3. Identify All Affected Fields
- [ ] **Query database schema for large text fields**
  ```sql
  SELECT
    e.Name AS EntityName,
    ef.Name AS FieldName,
    ef.Type,
    ef.Length
  FROM EntityField ef
  INNER JOIN Entity e ON ef.EntityID = e.ID
  WHERE ef.Type IN ('nvarchar', 'varchar')
    AND (ef.Length = -1 OR ef.Length > 4000)
  ORDER BY e.Name, ef.Name
  ```

- [ ] **Prioritize fields by risk**
  - Fields with JSON content (parsing can detect corruption)
  - Fields with structured data (XML, code)
  - Fields with free-form text (harder to detect corruption)

- [ ] **Check metadata sync files**
  - Scan `/metadata` directory for large field values
  - Identify files with inline JSON vs `@file:` references
  - Calculate max field sizes in metadata files

### 4. Create Test Suite
- [ ] **Unit tests for string splitting**
  - Test cases for `_splitStringContent()`
  - Test cases for `_findSafeSplitPoint()`
  - Edge cases:
    - String with escaped quotes at split boundaries
    - String with Flyway patterns at split boundaries
    - String with JSON (nested quotes, special chars)
    - String with multiple sequential escaped quotes
    - Empty string, single character, string of all quotes

- [ ] **Integration tests for SQL generation**
  - Generate SQL for Component with large Specification
  - Verify SQL is valid (parse check)
  - Verify SQL produces correct database value when executed
  - Test roundtrip: file → SQL → database → verify

- [ ] **Regression tests**
  - Test with actual production metadata files
  - Verify no corruption on known large fields
  - Automated comparison of source vs database content

## Root Cause Hypotheses

### Hypothesis 1: Incorrect Split Point Detection
**Problem**: `_findSafeSplitPoint()` may split in unsafe locations
- Could break multi-byte UTF-8 sequences
- Could break JSON escape sequences (`\n`, `\t`, `\"`, `\\`)
- Could break after backslash in middle of escape sequence

**Test**: Add JSON with various escape sequences near split boundaries

### Hypothesis 2: Regex Doesn't Match All String Patterns
**Problem**: String literal regex may miss edge cases
- Strings with embedded newlines
- Strings with long runs of escaped quotes
- Unicode strings with N prefix but internal quotes

**Test**: Create strings with these patterns and verify regex matching

### Hypothesis 3: Chunk Concatenation Issue
**Problem**: Generated SQL may have syntax errors
- Missing spaces between chunks
- Incorrect quote handling at chunk boundaries
- CAST placement issues causing type coercion problems

**Test**: Manually review generated SQL for large field values

### Hypothesis 4: Flyway Escaping Interferes with Splitting
**Problem**: `$'+'{` patterns inserted by escape logic confuse split detection
- Escape patterns added at split boundary
- Split logic tries to preserve pattern but creates invalid SQL
- Multiple layers of escaping cause quote accumulation

**Test**: String with `${` patterns near split boundaries

### Hypothesis 5: Indentation Calculation Error
**Problem**: `_getIndentForPosition()` may produce incorrect indentation
- Wrong indent for continuation lines
- Indent includes non-whitespace characters
- Very deep nesting causes excessive indentation

**Test**: SQL statements with various indentation levels

## Resolution Approach

### Phase 1: Diagnosis (Current)
1. Gather corruption examples from user
2. Create reproduction test case
3. Identify root cause through testing

### Phase 2: Fix Implementation
Once root cause is identified, implement appropriate fix:

**If Hypothesis 1 (Split Points)**:
- Enhance `_findSafeSplitPoint()` to check for JSON escape sequences
- Add lookback for backslash before split point
- Ensure UTF-8 character boundaries are respected

**If Hypothesis 2 (Regex)**:
- Update regex to handle all string literal patterns
- Add tests for edge case string patterns
- Consider using proper SQL parser if regex becomes too complex

**If Hypothesis 3 (Concatenation)**:
- Fix spacing and quote handling in chunk assembly
- Ensure CAST syntax is always valid
- Add SQL syntax validation to tests

**If Hypothesis 4 (Flyway Escaping)**:
- Reorder operations (split first, then escape?)
- Update escape pattern detection to account for inserted patterns
- Consider alternative escaping approach

**If Hypothesis 5 (Indentation)**:
- Simplify indentation to fixed string (e.g., 4 spaces)
- Remove dynamic indentation calculation
- Ensure generated SQL is always valid regardless of formatting

### Phase 3: Validation
- [ ] **Run fix against test suite**
  - All unit tests pass
  - All integration tests pass
  - All regression tests pass

- [ ] **Test with production data**
  - Re-run mj sync push with all metadata
  - Verify Components.Specification matches source files
  - Check all other large text fields

- [ ] **Performance testing**
  - Ensure splitting logic doesn't significantly slow down migrations
  - Test with very large fields (50k+ characters)

### Phase 4: Remediation
- [ ] **Fix corrupted data in database**
  - Identify all corrupted records
  - Re-push correct data using fixed tool
  - Verify data integrity

- [ ] **Update documentation**
  - Document the issue and fix in changelog
  - Update CLAUDE.md with any new best practices
  - Add comments to SqlLogger explaining the complexity

## Code Locations

### Primary Investigation Areas
1. **String splitting**: [SqlLogger.ts:387-458](../packages/SQLServerDataProvider/src/SqlLogger.ts#L387-L458)
2. **Safe split detection**: [SqlLogger.ts:502-535](../packages/SQLServerDataProvider/src/SqlLogger.ts#L502-L535)
3. **Flyway escaping**: [SqlLogger.ts:361-368](../packages/SQLServerDataProvider/src/SqlLogger.ts#L361-L368)
4. **SQL logging entry point**: [SqlLogger.ts:79](../packages/SQLServerDataProvider/src/SqlLogger.ts#L79)

### Supporting Code
- Metadata sync validation: `/packages/MetadataSync/src/validation/`
- Components entity: [entity_subclasses.ts:54625](../packages/MJCoreEntities/src/generated/entity_subclasses.ts#L54625)
- Metadata files: `/metadata/components/spec/*.json`

## Test Data Requirements

### Sample Data Needed
1. **Small spec** (~1000 chars) - Should work without splitting
2. **Boundary spec** (~4000 chars) - Tests split at exact boundary
3. **Medium spec** (~10000 chars) - Tests multi-chunk splitting
4. **Large spec** (~50000 chars) - Stress test
5. **Pathological spec** - JSON with many escape sequences near boundaries

### Special Characters to Test
- Single quotes: `'`
- Escaped quotes: `''`
- Backslashes: `\`
- JSON escapes: `\n`, `\t`, `\"`, `\\`, `\uXXXX`
- Flyway patterns: `${...}`
- Unicode characters: Emoji, CJK, RTL text
- Newlines within string literals

## Success Criteria

### Must Have
- [ ] No data corruption for any NVARCHAR(MAX)/VARCHAR(MAX) field
- [ ] All existing unit tests continue to pass
- [ ] New tests cover identified edge cases
- [ ] Components.Specification field content matches source files exactly
- [ ] Generated SQL is valid and executable

### Should Have
- [ ] Performance impact < 10% for large field migrations
- [ ] Clear error messages if splitting fails
- [ ] Logging shows when splitting occurs (debug mode)
- [ ] Documentation updated with explanation

### Nice to Have
- [ ] Automated detection of corrupted fields in database
- [ ] Tool to repair corrupted data from source files
- [ ] Performance optimization for very large fields
- [ ] Option to disable splitting if database supports larger literals

## Next Steps

1. **Immediate**: User to provide corruption examples
2. **Next session**: Analyze examples and create reproduction case
3. **Following session**: Implement and test fix
4. **Final session**: Validate fix and remediate corrupted data

## Notes and Observations

- The splitting logic is complex due to multiple interacting concerns (Flyway escaping, SQL syntax, safe boundaries)
- JSON data is particularly sensitive because corruption may not be immediately obvious
- Consider if there's a simpler approach than string splitting (e.g., parameterized queries, bulk insert)
- The 4000/8000 limit is a SQL Server limitation that may not apply to other databases

## CRITICAL FINDINGS (2026-01-27)

### Corruption Analysis - SimpleChart Example

**Source File**: `/metadata/components/spec/generic/simple-drilldown-chart.spec.json` (12,648 bytes)
**Corrupted File**: `SimpleChart_Corrupted.json` (1,427,555 bytes) - **113x larger!**

### Corruption Pattern Discovered

1. **The JSON itself is CORRECT** (~40K chars after expanding `@file:` references)
2. **1.38 MILLION characters of garbage appended AFTER the JSON**
3. **Garbage consists of**:
   - Line 1: UUID + "Generic/UI/Chart" + **663,806 SPACES** = 710,717 chars
   - Line 2: UUID + "Testing/Chart" + **658,229 SPACES** = 676,803 chars

### Root Cause Hypothesis: **MASSIVE SPACE PADDING BUG**

The SqlLogger string splitting logic is generating **hundreds of thousands of spaces** after UUIDs and short strings. This suggests:

**Most Likely**: Indentation calculation bug in `_getIndentForPosition()` or concatenation logic
- Indentation may be calculating a huge value (e.g., position 663,806 instead of indent level 4)
- Each concatenated chunk may be getting padded with spaces to match "position"
- The `indent + '    '` logic (line 558) may be using position instead of actual indent

**Possible Issue**:
```typescript
// SqlLogger.ts line 558
return indent + '    ';  // Add extra indentation for continuation
```

If `indent` already contains massive whitespace due to incorrect calculation in `_getIndentForPosition()`, this would explain the huge padding.

### How to Reproduce

1. Any NVARCHAR(MAX) field > 4000 chars that gets split
2. Field must contain content that triggers indentation calculation
3. String splitting produces multiple chunks with concatenation
4. Each chunk gets indented based on calculated position
5. Bug causes position to be calculated as hundreds of thousands instead of actual indent

### Immediate Action Items

1. **Review `_getIndentForPosition()` logic** (SqlLogger.ts:544-559)
   - Is it calculating position in file instead of indentation level?
   - Should it return fixed indent (e.g., 4 spaces) instead of dynamic?

2. **Review concatenation logic** (SqlLogger.ts:428-441)
   - Line 430: `const prefix = index === 0 ? '' : indent;`
   - Is `indent` variable containing the entire position offset instead of just whitespace?

3. **Add logging** to see what indent values are being calculated

4. **Test with minimal case**:
   - String exactly 4001 characters (triggers one split)
   - Check generated SQL for space padding
   - Verify indent calculation

---

**Plan Status**: Root Cause Identified - Space Padding Bug in Indentation Logic
**Last Updated**: 2026-01-27
**Owner**: Claude Code
