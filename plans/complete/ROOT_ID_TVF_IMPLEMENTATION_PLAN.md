# Root ID Calculation: Migration from CTEs to Inline Table Value Functions

## Executive Summary
Replace the current CTE-based recursive root ID calculation in Base Views with inline Table Value Functions (TVFs) joined via OUTER APPLY. This approach provides better performance by allowing SQL Server to optimize the function execution and enables early termination when the recursive FK field is NULL.

## Current Implementation

### How It Works Now
1. **generateRecursiveCTEs()** - Creates WITH clause containing recursive CTEs for each self-referential FK
2. **generateRootFieldSelects()** - Adds CTE columns to SELECT clause (e.g., `CTE_RootParentID.[RootParentID]`)
3. **generateRecursiveCTEJoins()** - Generates LEFT OUTER JOINs to CTEs on primary key
4. **generateBaseView()** - Assembles all parts into the view definition

### Example Current Output
```sql
-- For ActionCategory with ParentID recursive FK
WITH
    CTE_RootParentID AS (
        -- Anchor: rows with no parent (root nodes)
        SELECT [ID], [ID] AS [RootParentID]
        FROM [schema].[ActionCategory]
        WHERE [ParentID] IS NULL

        UNION ALL

        -- Recursive: traverse up hierarchy
        SELECT child.[ID], parent.[RootParentID]
        FROM [schema].[ActionCategory] child
        INNER JOIN CTE_RootParentID parent ON child.[ParentID] = parent.[ID]
    )
SELECT
    a.*,
    CTE_RootParentID.[RootParentID]
FROM [schema].[ActionCategory] AS a
LEFT OUTER JOIN CTE_RootParentID ON a.[ID] = CTE_RootParentID.[ID]
```

## New Implementation Requirements

### Function Specification
- **Naming Convention**: `fn[TableName][RecursiveFKField]_GetRootID`
  - Example: `fnActionCategoryParentID_GetRootID`
- **Schema**: Same as the base table
- **Type**: Inline Table Value Function (iTVF)
- **Parameters**:
  1. `@RecordID` - The ID of the current record
  2. `@ParentID` - The value of the recursive FK field (for optimization)
- **Return**: Single column table with `RootID` column
- **Optimization**: If `@ParentID IS NULL`, immediately return `@RecordID` without recursion

### Example Target Output
```sql
-- Function definition
CREATE FUNCTION [schema].[fnActionCategoryParentID_GetRootID]
(
    @RecordID UNIQUEIDENTIFIER,
    @ParentID UNIQUEIDENTIFIER
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [schema].[ActionCategory]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [schema].[ActionCategory] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

-- View definition
CREATE VIEW [schema].[vwActionCategories]
AS
SELECT
    a.*,
    ActionCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM [schema].[ActionCategory] AS a
LEFT OUTER JOIN
    [schema].[ActionCategory] AS ActionCategory_ParentID
  ON
    a.[ParentID] = ActionCategory_ParentID.[ID]
OUTER APPLY
    [schema].[fnActionCategoryParentID_GetRootID](a.[ID], a.[ParentID]) AS root_ParentID
GO
```

## Implementation Plan

### Phase 1: Create TVF Generation Infrastructure

#### Step 1.1: Add new method `generateRootIDFunction()`
**Location**: `sql_codegen.ts` class (after `generateRecursiveCTEs()`)

**Purpose**: Generate a single inline TVF for one recursive FK field

**Signature**:
```typescript
protected generateRootIDFunction(
    entity: EntityInfo,
    field: EntityFieldInfo
): string
```

**Implementation Details**:
- Extract entity metadata (schema, table, primary key)
- Build function name: `fn${entity.BaseTable}${field.Name}_GetRootID`
- Generate DROP IF EXISTS statement
- Create iTVF with two parameters (@RecordID, @ParentID)
- Implement early-exit optimization for NULL parent
- Generate recursive CTE for hierarchy traversal
- Return single RootID column

**Output Format**:
```sql
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Table].[RecursiveFKField]
------------------------------------------------------------
IF OBJECT_ID('[schema].[fnTableNameFieldName_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [schema].[fnTableNameFieldName_GetRootID];
GO

CREATE FUNCTION [schema].[fnTableNameFieldName_GetRootID]
(...)
RETURNS TABLE
AS
RETURN (...)
GO
```

#### Step 1.2: Add new method `generateAllRootIDFunctions()`
**Location**: `sql_codegen.ts` class (after `generateRootIDFunction()`)

**Purpose**: Generate all TVFs for an entity with multiple recursive FKs

**Signature**:
```typescript
protected generateAllRootIDFunctions(
    entity: EntityInfo,
    recursiveFKs: EntityFieldInfo[]
): string
```

**Implementation**:
- Map over `recursiveFKs` array
- Call `generateRootIDFunction()` for each field
- Join results with `\n\n` separator
- Return combined function definitions or empty string if no recursive FKs

### Phase 2: Update OUTER APPLY Join Generation

#### Step 2.1: Rename method `generateRecursiveCTEJoins()` → `generateRootIDJoins()`
**Purpose**: Better reflects new purpose (OUTER APPLY instead of CTE joins)

**Signature** (unchanged):
```typescript
protected generateRootIDJoins(
    recursiveFKs: EntityFieldInfo[],
    classNameFirstChar: string,
    entity: EntityInfo
): string
```

**Implementation Changes**:
- Remove CTE join logic
- Generate OUTER APPLY for each recursive FK
- Pass both `ID` and recursive FK field to function
- Use alias pattern: `root_[FieldName]` (e.g., `root_ParentID`)

**Output Format**:
```typescript
return recursiveFKs.map(field => {
    const functionName = `fn${entity.BaseTable}${field.Name}_GetRootID`;
    const alias = `root_${field.Name}`;
    return `OUTER APPLY
    [${entity.SchemaName}].[${functionName}]([${classNameFirstChar}].[${entity.FirstPrimaryKey.Name}], [${classNameFirstChar}].[${field.Name}]) AS ${alias}`;
}).join('\n');
```

#### Step 2.2: Update `generateRootFieldSelects()`
**Purpose**: Reference TVF aliases instead of CTE aliases

**Implementation Changes**:
- Change alias pattern from `CTE_Root[Field].[Root[Field]]`
- To: `root_[Field].RootID AS [Root[Field]]`

**New Output**:
```typescript
return recursiveFKs.map(field => {
    const alias = `root_${field.Name}`;
    const columnName = `Root${field.Name}`;
    return `,\n    ${alias}.RootID AS [${columnName}]`;
}).join('');
```

### Phase 3: Update Base View Generation

#### Step 3.1: Remove CTE generation from `generateBaseView()`
**Changes**:
- Remove call to `generateRecursiveCTEs()`
- Remove `cteClause` variable and usage
- Update `generateRootIDJoins()` call (method was renamed)
- Keep `rootFields` generation (modified in Phase 2.2)

**Before**:
```typescript
const cteClause = recursiveFKs.length > 0 ? this.generateRecursiveCTEs(entity, recursiveFKs) : '';
const rootFields = recursiveFKs.length > 0 ? this.generateRootFieldSelects(recursiveFKs, classNameFirstChar) : '';
```

**After**:
```typescript
const rootFields = recursiveFKs.length > 0 ? this.generateRootFieldSelects(recursiveFKs, classNameFirstChar) : '';
const rootJoins = recursiveFKs.length > 0 ? this.generateRootIDJoins(recursiveFKs, classNameFirstChar, entity) : '';
```

#### Step 3.2: Update view template in `generateBaseView()`
**Changes**:
- Remove `${cteClause}` from template
- Update join section to use `rootJoins` variable
- Ensure proper spacing and formatting

**Template Structure**:
```typescript
return `
------------------------------------------------------------
----- BASE VIEW FOR ENTITY: ${entity.Name}
------------------------------------------------------------
IF OBJECT_ID('[${entity.SchemaName}].[${viewName}]', 'V') IS NOT NULL
    DROP VIEW [${entity.SchemaName}].[${viewName}];
GO

CREATE VIEW [${entity.SchemaName}].[${viewName}]
AS
SELECT
    ${classNameFirstChar}.*${relatedFieldsString.length > 0 ? ',' : ''}${relatedFieldsString}${rootFields}
FROM
    [${entity.SchemaName}].[${entity.BaseTable}] AS ${classNameFirstChar}${relatedFieldsJoinString ? '\n' + relatedFieldsJoinString : ''}${rootJoins}
${whereClause}GO${permissions}
`;
```

### Phase 4: Integrate Function Generation into Entity Output

#### Step 4.1: Update `generateSingleEntitySQLFile()`
**Purpose**: Include TVF definitions before view definition

**Location**: Find the method that generates the complete SQL file for an entity

**Changes**:
- Call `generateAllRootIDFunctions()` after detecting recursive FKs
- Insert function SQL before base view SQL
- Add separator between functions and view

**Pattern**:
```typescript
async generateSingleEntitySQLFile(options: GenerateSQLOptions): Promise<string> {
    const recursiveFKs = this.detectRecursiveForeignKeys(options.entity);
    const functionSQL = recursiveFKs.length > 0
        ? this.generateAllRootIDFunctions(options.entity, recursiveFKs) + '\n\n'
        : '';

    const viewSQL = await this.generateBaseView(options.pool, options.entity);

    return this.generateSingleEntitySQLFileHeader(options.entity, options.entity.BaseView)
        + functionSQL
        + viewSQL;
}
```

### Phase 5: Deprecate Old Methods (Optional)

#### Step 5.1: Remove `generateRecursiveCTEs()` method
- This method is no longer needed
- Can be removed after confirming all tests pass
- Update any documentation or comments referencing this method

#### Step 5.2: Update JSDoc comments
- Update method documentation to reflect new TVF approach
- Add performance notes about early-exit optimization
- Document the two-parameter optimization strategy

### Phase 6: Testing Strategy

#### Step 6.1: Unit Test Scenarios
1. **Single recursive FK**: Entity with one ParentID field
2. **Multiple recursive FKs**: Entity with multiple self-referential fields
3. **No recursive FKs**: Verify no functions/joins generated
4. **NULL parent optimization**: Verify function returns immediately for root nodes
5. **Deep hierarchy**: Test with 5+ levels of nesting
6. **Naming edge cases**: Long table names, special characters in field names

#### Step 6.2: Integration Tests
1. Build and run CodeGen against test database
2. Verify generated SQL compiles without errors
3. Query views and verify RootID values are correct
4. Compare performance: CTE approach vs TVF approach
5. Test with ActionCategory and Action entities (known recursive structures)

#### Step 6.3: Performance Validation
1. Create test hierarchy with 1000+ nodes
2. Measure query execution time with CTEs
3. Measure query execution time with TVFs
4. Verify execution plans show proper optimization
5. Confirm early-exit for NULL parents doesn't perform recursion

## File Changes Summary

### Modified Files
1. **`packages/CodeGenLib/src/Database/sql_codegen.ts`**
   - Add: `generateRootIDFunction()`
   - Add: `generateAllRootIDFunctions()`
   - Rename: `generateRecursiveCTEJoins()` → `generateRootIDJoins()`
   - Modify: `generateRootFieldSelects()` - change output format
   - Modify: `generateBaseView()` - remove CTE, add TVF
   - Remove: `generateRecursiveCTEs()` (after testing)
   - Modify: `generateSingleEntitySQLFile()` or similar - add function generation

### Generated Files (Validation)
1. **`migrations/v2/CodeGen_Run_*.sql`**
   - Should contain function definitions before view definitions
   - Should use OUTER APPLY instead of CTE joins
   - Should reference TVF aliases in SELECT clause

## Risk Analysis

### Low Risk
- **Isolated change**: Only affects recursive FK handling
- **Backward compatible**: Views maintain same column names and structure
- **Well-defined scope**: Clear separation between old and new approach

### Medium Risk
- **Performance**: Need to validate TVF approach is actually faster
- **SQL Server version**: Inline TVFs require SQL Server 2005+ (already our baseline)
- **Complex hierarchies**: Need to test with deep/wide hierarchies

### Mitigation Strategies
1. Keep existing CTE code until TVF approach is fully validated
2. Add comprehensive unit tests before deployment
3. Test on copy of production database with real data volumes
4. Monitor query performance after deployment
5. Have rollback plan (revert to CTE approach if needed)

## Success Criteria

### Functional Requirements
- ✅ Functions are created in correct schema
- ✅ Functions follow naming convention exactly
- ✅ Views use OUTER APPLY with correct parameters
- ✅ Root ID values match previous CTE implementation
- ✅ NULL optimization works (no recursion for root nodes)

### Performance Requirements
- ✅ Query execution time ≤ CTE approach
- ✅ Execution plans show proper optimization
- ✅ No performance regression on existing queries

### Code Quality Requirements
- ✅ All TypeScript compilation succeeds
- ✅ ESLint passes with no warnings
- ✅ Unit tests achieve >90% coverage
- ✅ Code follows functional decomposition guidelines
- ✅ JSDoc comments updated

## Timeline Estimate

1. **Phase 1**: 2-3 hours (TVF generation methods)
2. **Phase 2**: 1-2 hours (Join generation updates)
3. **Phase 3**: 1 hour (Base view updates)
4. **Phase 4**: 1 hour (Integration)
5. **Phase 5**: 30 minutes (Cleanup)
6. **Phase 6**: 2-3 hours (Testing)

**Total Estimate**: 8-10 hours of development + testing

## Open Questions

1. **Function permissions**: Should TVFs have explicit GRANT statements like views? No, they will only be accessed from within the SQL View.
2. **Schema qualification**: Should function calls use schema prefix in all cases? Yes
3. **Error handling - Circular references**: The CTE pattern naturally handles circular references (A→B→C→A):
   - SQL Server's default MAXRECURSION limit of 100 iterations prevents infinite loops
   - The recursive join condition `c.[ID] = p.[ParentID]` won't match when cycling back to a previously visited node
   - The function returns NULL if no row with `ParentID IS NULL` is found after exhausting the graph
   - **Decision**: Accept SQL Server's default protection; circular references will return NULL and should be detected/corrected via data validation
4. **Migration path**: Should we generate migration to drop old CTEs and create TVFs?
5. **Documentation**: Where should we document the TVF approach for other developers?

## Next Steps

1. Review this plan with team
2. Address open questions
3. Use the current branch, RootID_TVF_Codegen_Updates, for the changes
4. Implement Phase 1
5. Write unit tests for Phase 1
6. Iterate through remaining phases
7. Integration testing
8. Code review
9. Merge to main branch
