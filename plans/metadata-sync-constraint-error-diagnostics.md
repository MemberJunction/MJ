# MetadataSync: Improved Constraint Violation Error Diagnostics

## Problem Statement

When a database constraint violation occurs during `mj sync push` (e.g., unique key violations), the current error output is difficult to diagnose:

### Current Issues

1. **No source file path with line number** - We see `AI Prompts[14]/MJ: AI Prompt Models[0]` but not the actual `.json` file path or line number where the record is defined

2. **GUIDs not resolved to human-readable names** - The constraint message shows raw GUIDs:
   ```
   The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe, b7267218-302b-4c09-9875-8df06aaa1695, e4a5ccec-6a37-ef11-86d4-000d3a4e707e, 5300eb7f-cfb2-4789-ac39-b2168c5d1ca6)
   ```
   Instead of showing: `Prompt: "Skip: Unified Code Fixer", Model: "Gemini 3 Flash", Vendor: "Google"`

3. **No identification of conflicting record** - We don't show which existing record already has the same unique key combination

4. **Duplicate error output** - The error message is printed multiple times with the same information

5. **Massive SQL dump** - The full SQL query is shown but the key diagnostic info is buried in noise

### Example of Current Output

```
Error: Error executing SQL
    Error: Violation of UNIQUE KEY constraint 'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID'. Cannot insert duplicate key in object '__mj.AIPromptModel'. The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe, b7267218-302b-4c09-9875-8df06aaa1695, e4a5ccec-6a37-ef11-86d4-000d3a4e707e, 5300eb7f-cfb2-4789-ac39-b2168c5d1ca6).
    Query: DECLARE @PromptID_bc9a0297 UNIQUEIDENTIFIER,
        @ModelID_bc9a0297 UNIQUEIDENTIFIER,
        ... [50+ lines of SQL]

❌ SAVE RETURNED FALSE for MJ: AI Prompt Models
   Record ID: CC3CCD0B-3BB2-47BA-B058-D479DB8DB0F5
   ... [repeated multiple times]
```

---

## Proposed Solution

### 1. Add Source File + Line Number Tracking

**Approach**: Track the actual JSON file path in `FlattenedRecord` and optionally use a JSON parser that preserves line positions.

**Changes to `FlattenedRecord` interface** (`record-dependency-analyzer.ts`):
```typescript
export interface FlattenedRecord {
  record: RecordData;
  entityName: string;
  // ... existing fields ...

  // NEW: Source file tracking
  sourceFile: string;           // Absolute path to the JSON file
  sourceLine?: number;          // Line number in the file (if available)
}
```

**Implementation options for line numbers**:
- **Option A (Simple)**: Store file path only, no line numbers. Users can search the file manually.
- **Option B (Enhanced)**: Use a JSON parser like `jsonc-parser` that provides position information during parsing. This would require changes to how we read JSON files.

**Recommendation**: Start with Option A (file path only) - it solves 80% of the problem with minimal complexity.

### 2. Create Constraint Error Parser/Formatter

**New utility**: `ConstraintErrorFormatter` class in `lib/constraint-error-formatter.ts`

```typescript
export interface ParsedConstraintError {
  constraintType: 'UNIQUE' | 'FOREIGN_KEY' | 'CHECK' | 'OTHER';
  constraintName: string;
  tableName: string;
  schemaName: string;
  fieldNames: string[];           // Parsed from constraint name or looked up
  duplicateValues: string[];      // The raw GUID values
  resolvedValues?: Record<string, string>;  // Field name -> human-readable value
}

export class ConstraintErrorFormatter {
  /**
   * Parse a SQL Server constraint error message
   */
  parseConstraintError(errorMessage: string): ParsedConstraintError | null;

  /**
   * Look up human-readable names for GUID values based on field types
   */
  async resolveFieldValues(
    entityName: string,
    fieldValues: Record<string, string>,
    contextUser: UserInfo
  ): Promise<Record<string, string>>;

  /**
   * Format a clean, actionable error message
   */
  formatError(
    parsed: ParsedConstraintError,
    sourceFile: string,
    recordPath: string
  ): string;
}
```

**Constraint name parsing**: Many MJ constraints follow naming conventions like `UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID` which can be parsed to extract field names.

### 3. Find Conflicting Record

When a unique constraint violation occurs, query the database to find the existing record:

```typescript
async findConflictingRecord(
  entityName: string,
  uniqueFields: Record<string, string>,
  contextUser: UserInfo
): Promise<{ id: string; source?: string } | null> {
  // Build filter from unique field values
  // Query using RunView
  // Return the conflicting record's ID and source (if trackable)
}
```

### 4. Clean Error Output Format

**Proposed format**:
```
❌ UNIQUE KEY VIOLATION in MJ: AI Prompt Models

   Source: metadata/prompts/.ai-prompts.json
   Record: AI Prompts[14] → MJ: AI Prompt Models[0]

   Duplicate key values:
     Prompt:        "Skip: Unified Code Fixer"
     Model:         "Gemini 3 Flash"
     Vendor:        "Google"
     Configuration: "Gemini 3 Flash + OSS"

   Conflicts with existing record:
     ID: 8C255E4A-1331-4D93-9135-1807A8FDE972

   💡 Tip: This combination of Prompt + Model + Vendor + Configuration already exists.
          Either update the existing record or change one of these field values.
```

### 5. Deduplicate Error Output

**Problem**: Errors are currently logged in multiple places:
- `processFlattenedRecord` logs the error
- The catch block in the batch processing logs again
- The fatal error handler logs again

**Solution**:
- Create a structured error object that carries all context
- Log once at the appropriate level with full details
- Only log summary at higher levels

---

## Implementation Plan

### Phase 1: Source File Tracking (Low effort, high impact)
1. Add `sourceFile` to `FlattenedRecord` interface
2. Populate it during `RecordDependencyAnalyzer.analyzeFileRecords()`
3. Pass the file path through to error messages
4. Update error output to show the source file

### Phase 2: Constraint Error Parsing (Medium effort)
1. Create `ConstraintErrorFormatter` class
2. Implement constraint message parsing (regex-based)
3. Extract field names from constraint naming conventions
4. Format cleaner error messages

### Phase 3: Value Resolution (Medium effort)
1. Add lookup logic to resolve GUIDs to names
2. Use entity metadata to identify foreign key relationships
3. Query related entities to get display names
4. Cache lookups within a push operation for performance

### Phase 4: Conflicting Record Lookup (Low effort)
1. When unique constraint fails, build a query from the constraint fields
2. Find the existing record with those values
3. Include in error output

### Phase 5: Error Deduplication (Low effort)
1. Create structured error type for constraint violations
2. Centralize error formatting
3. Remove duplicate logging calls

---

## Files to Modify

| File | Changes |
|------|---------|
| `lib/record-dependency-analyzer.ts` | Add `sourceFile` to `FlattenedRecord`, populate during analysis |
| `lib/constraint-error-formatter.ts` | **NEW** - Constraint parsing and formatting utility |
| `services/PushService.ts` | Use formatter for constraint errors, pass source file through |
| `lib/sync-engine.ts` | Minor updates to pass file context |

---

## Estimated Effort

| Phase | Effort | Impact |
|-------|--------|--------|
| Phase 1: Source File Tracking | 2-3 hours | High - Users can find the problem file |
| Phase 2: Constraint Parsing | 3-4 hours | High - Clean, readable errors |
| Phase 3: Value Resolution | 4-6 hours | Medium - Nice to have names vs GUIDs |
| Phase 4: Conflict Lookup | 1-2 hours | Medium - Helps understand the conflict |
| Phase 5: Deduplication | 1-2 hours | Low - Cleanup |

**Total**: ~12-17 hours

**Recommendation**: Implement Phases 1, 2, and 5 first for the highest impact with lowest effort. Phases 3 and 4 can be done later as enhancements.

---

## Success Criteria

1. Users can immediately identify which JSON file contains the problematic record
2. Constraint violation errors show human-readable field names and values
3. Error output is concise and actionable (not walls of SQL)
4. Each error is logged exactly once

---

## Open Questions

1. **Line number tracking**: Is it worth the complexity of using a position-aware JSON parser, or is file path sufficient?
2. **Performance**: Should we cache entity metadata lookups during a push operation, or is the current approach sufficient?
3. **Foreign key errors**: Should this same approach be extended to foreign key constraint violations?
