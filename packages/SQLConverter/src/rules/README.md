# SQL Conversion Rules — Developer Guide

## Quick Reference

| Rule | Priority | AppliesTo | Description |
|------|----------|-----------|-------------|
| `CreateTableRule` | 10 | `CREATE_TABLE` | Column types, defaults, constraints, IDENTITY |
| `ViewRule` | 20 | `CREATE_VIEW` | APPLY→LATERAL, expressions, OR REPLACE |
| `ProcedureToFunctionRule` | 30 | `CREATE_PROCEDURE` | SP→function, params, body conversion |
| `FunctionRule` | 35 | `CREATE_FUNCTION` | Scalar + TVF, hand-written replacements |
| `TriggerRule` | 40 | `CREATE_TRIGGER` | Trigger→function+trigger pair |
| `InsertRule` | 50 | `INSERT`, `UPDATE`, `DELETE` | DML with expression conversion |
| `ConditionalDDLRule` | 55 | `CONDITIONAL_DDL` | IF NOT EXISTS→DO $$ blocks |
| `AlterTableRule` | 60 | `FK_CONSTRAINT`, `PK_CONSTRAINT`, `CHECK_CONSTRAINT`, `UNIQUE_CONSTRAINT`, `ENABLE_CONSTRAINT`, `ALTER_TABLE` | Constraints, DEFERRABLE |
| `CreateIndexRule` | 70 | `CREATE_INDEX` | Remove CLUSTERED, WITH, INCLUDE |
| `GrantRule` | 80 | `GRANT`, `REVOKE` | EXECUTE→FUNCTION, skip invalid |
| `ExtendedPropertyRule` | 90 | `EXTENDED_PROPERTY` | sp_addextendedproperty→COMMENT ON |

All rules set `BypassSqlglot = true` and handle conversion entirely in `PostProcess`.

## Creating a New Rule

### Step 1: Create the Rule File

Create `src/rules/MyNewRule.ts`:

```typescript
import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers, removeNPrefix } from './ExpressionHelpers.js';

export class MyNewRule implements IConversionRule {
  Name = 'MyNewRule';
  AppliesTo: StatementType[] = ['SOME_TYPE'];
  Priority = 65;  // Choose a priority between existing rules
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    result = removeNPrefix(result);

    // Your conversion logic here
    // ...

    // Ensure proper formatting
    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
```

### Step 2: Register the Rule

Add to `src/rules/TSQLToPostgresRules.ts`:

```typescript
import { MyNewRule } from './MyNewRule.js';

export function getTSQLToPostgresRules(): IConversionRule[] {
  return [
    new CreateTableRule(),        // Priority 10
    new ViewRule(),               // Priority 20
    // ...
    new MyNewRule(),              // Priority 65 — insert at correct position
    new CreateIndexRule(),        // Priority 70
    // ...
  ];
}
```

### Step 3: Export the Rule

Add to `src/rules/index.ts`:

```typescript
export { MyNewRule } from './MyNewRule.js';
```

### Step 4: Add Statement Classification (if needed)

If your rule handles a new statement type, update `StatementClassifier.ts` to recognize it:

```typescript
// In classifyBatch():
if (/YOUR_PATTERN/i.test(stripped)) return 'YOUR_NEW_TYPE';
```

And add the new type to `types.ts`:

```typescript
export type StatementType =
  | 'YOUR_NEW_TYPE'
  // ... existing types
```

### Step 5: Update Output Routing (if needed)

If the new type needs a specific output group, update `BatchConverter.ts`:

```typescript
const MY_TYPES = new Set<StatementType>(['YOUR_NEW_TYPE']);

function routeToGroup(result, batchType, groups, originalBatch?) {
  // Add routing for new type
  if (MY_TYPES.has(batchType)) {
    groups.MyGroup.push(result);
  }
  // ...
}
```

### Step 6: Write Tests

Create `src/__tests__/MyNewRule.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MyNewRule } from '../rules/MyNewRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new MyNewRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('MyNewRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('MyNewRule');
      expect(rule.Priority).toBe(65);
      expect(rule.AppliesTo).toEqual(['SOME_TYPE']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('conversion', () => {
    it('should convert pattern X to pattern Y', () => {
      const result = convert('INPUT SQL');
      expect(result).toContain('EXPECTED');
      expect(result).not.toContain('UNWANTED');
    });
  });
});
```

## The IConversionRule Interface

```typescript
interface IConversionRule {
  /** Human-readable name for logging/debugging */
  Name: string;

  /** Statement types this rule applies to */
  AppliesTo: StatementType[];

  /** Priority — lower numbers run first (10, 20, 30...) */
  Priority: number;

  /**
   * Transform SQL BEFORE sqlglot transpilation.
   * Only used when BypassSqlglot is false.
   */
  PreProcess?(sql: string, context: ConversionContext): string;

  /**
   * Transform SQL AFTER sqlglot transpilation (or instead of it).
   * @param sql - The transpiled SQL (or original if BypassSqlglot)
   * @param originalSQL - The original T-SQL statement
   * @param context - Shared conversion context
   */
  PostProcess?(sql: string, originalSQL: string, context: ConversionContext): string;

  /**
   * If true, skip sqlglot entirely — PostProcess receives original SQL
   * as both parameters. All current rules use BypassSqlglot = true.
   */
  BypassSqlglot?: boolean;
}
```

**How rules are matched and executed** (from `BatchConverter.convertBatch()`):

1. Statement is classified by `StatementClassifier`
2. Rules where `AppliesTo.includes(statementType)` are selected
3. Selected rules are sorted by `Priority` (ascending)
4. `PreProcess` runs on all matching rules in order
5. The first rule with `BypassSqlglot = true` handles the conversion
6. If no bypass rule, sqlglot transpiles, then `PostProcess` runs

## ConversionContext Fields

| Field | Type | Written By | Read By | Purpose |
|-------|------|-----------|---------|---------|
| `SourceDialect` | `string` | Pipeline | All rules | Source SQL dialect (always 'tsql') |
| `TargetDialect` | `string` | Pipeline | All rules | Target SQL dialect (always 'postgres') |
| `Schema` | `string` | Pipeline | Rules | Target schema (default '__mj') |
| `TableColumns` | `Map<string, Map<string, string>>` | `CreateTableRule` | `InsertRule` | Maps table→column→PG type for boolean casting |
| `HandWrittenFunctions` | `Map<string, string>` | User config | `FunctionRule` | Custom function replacements by name |
| `CreatedFunctions` | `Set<string>` | `BatchConverter` | `GrantRule` | Track successfully created functions |
| `CreatedViews` | `Set<string>` | `BatchConverter` | `GrantRule` | Track successfully created views |

### TableColumns Example

When `CreateTableRule` processes:
```sql
CREATE TABLE [__mj].[Users] ([IsActive] [bit] NOT NULL)
```

It adds to context: `TableColumns.get('users').get('isactive') → 'BOOLEAN'`

Then when `InsertRule` processes:
```sql
INSERT INTO [__mj].[Users] ([IsActive]) VALUES (1)
```

It knows `IsActive` is BOOLEAN and can cast `1` → `TRUE`.

### CreatedFunctions / CreatedViews

The `BatchConverter` tracks which functions and views were successfully converted. The `GrantRule` then checks these sets to skip GRANT statements for objects that weren't created (e.g., procedures that reference sys.* tables and were skipped).

## Testing Conventions

### File Naming
- One test file per rule: `{RuleName}.test.ts`
- Located in `src/__tests__/`

### Test Structure
```typescript
describe('RuleName', () => {
  describe('metadata', () => { /* Name, Priority, AppliesTo, BypassSqlglot */ });
  describe('feature area 1', () => { /* Related conversions */ });
  describe('feature area 2', () => { /* More conversions */ });
  describe('edge cases', () => { /* Boundary conditions */ });
  describe('output formatting', () => { /* Semicolons, newlines */ });
});
```

### Common Assertions
```typescript
// Content checking
expect(result).toContain('EXPECTED');
expect(result).not.toContain('OLD_SYNTAX');
expect(result).toMatch(/regex_pattern/i);

// Formatting
expect(result).toMatch(/;\n$/);  // Ends with semicolon + newline

// Context state
const columns = context.TableColumns.get('tablename');
expect(columns).toBeDefined();
```

### Helper Functions
Every test file defines a `convert()` helper:
```typescript
const rule = new MyRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}
```

## Available ExpressionHelpers

When writing rules, use these shared helpers from `ExpressionHelpers.ts`:

| Helper | Purpose |
|--------|---------|
| `convertIdentifiers(sql)` | `[schema].[name]` → `schema."name"` |
| `convertDateFunctions(sql)` | DATEADD, DATEDIFF, DATEPART |
| `convertCharIndex(sql)` | CHARINDEX → POSITION |
| `convertStuff(sql)` | STUFF → OVERLAY |
| `convertStringConcat(sql)` | `+` → `\|\|` for strings |
| `convertIIF(sql)` | IIF → CASE WHEN |
| `convertTopToLimit(sql)` | SELECT TOP N → LIMIT N |
| `convertCastTypes(sql)` | CAST AS type mappings |
| `convertConvertFunction(sql)` | CONVERT() → CAST() |
| `removeNPrefix(sql)` | N'text' → 'text' |
| `removeCollate(sql)` | Remove COLLATE clauses |
| `convertCommonFunctions(sql)` | ISNULL, GETUTCDATE, NEWID, LEN |
| `quotePascalCaseIdentifiers(sql)` | Quote PascalCase (preserves strings) |
