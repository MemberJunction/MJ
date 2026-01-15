# Flyway Placeholder Escaping Solution

## Problem

Migration files contained JavaScript template literal patterns like `${type}` and `${"<svg>...</svg>"}` that Flyway was trying to resolve as placeholders, causing migration failures with "No value provided for placeholder" errors.

## Solution

Use SQL Server string concatenation to break up the `${` pattern, preventing Flyway from recognizing it as a placeholder while preserving the literal string in the database.

### Pattern Transformation

- **Flyway placeholders**: `${flyway:defaultSchema}` → Left unchanged (Flyway processes these)
- **Single dollar patterns**: `${type}` → `$'+'{type}'` (SQL concatenation breaks up single $)
- **Double dollar patterns**: `$${value}` → `$'+'$'+'{value}'` (SQL concatenation breaks up BOTH $ signs)

### How It Works

**Single Dollar Pattern:**
1. **In migration file**: `$'+'{type}'`
2. **SQL Server executes**: String concatenation `$` + `{type}` = `${type}`
3. **Result in database**: Literal string `${type}` (not processed by Flyway)

**Double Dollar Pattern:**
1. **In migration file**: `$'+'$'+'{value}'`
2. **SQL Server executes**: String concatenation `$` + `$` + `{value}` = `$${value}`
3. **Result in database**: Literal string `$${value}` (not processed by Flyway)

**Why both $ signs must be broken up:** If you use `'$$' + '{value}'`, Flyway still sees the `$${` pattern during its preprocessing phase and treats it as an escaped placeholder, converting `$${` to `${` in the output.

## Script Usage

### For Future Migrations

Use the script to escape non-Flyway placeholders before running migrations:

```bash
node scripts/escape-flyway-both-patterns.js migrations/v3/YourMigrationFile.sql
```

This script:
- Leaves `${flyway:...}` patterns unchanged
- Converts `${other}` to `$'+'{other}'` (single dollar)
- Converts `$${other}` to `$'+'$'+'{other}'` (double dollar, BOTH $ signs broken up)
- Creates a backup with `.both-patterns-backup` extension

### Examples

**Before transformation:**
```sql
INSERT INTO Component (Specification) VALUES (
    N'extraFilter={`AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType=''${type}'')`}'
);
```

**After transformation:**
```sql
INSERT INTO Component (Specification) VALUES (
    N'extraFilter={`AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType=''$'+'{type}'')`}'
);
INSERT INTO Component (Code) VALUES (
    N'const price = `Total: $'+'$'+'{amount}`;'
);
```

**Result in database:**
```
extraFilter={`AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType='${type}')`}
const price = `Total: $${amount}`;
```

## Implementation Details

### Based on SqlLogger Method

This approach is based on the `_escapeFlywaySyntaxInStrings` method in `/packages/SQLServerDataProvider/src/SqlLogger.ts` (line 357):

```typescript
private _escapeFlywaySyntaxInStrings(sql: string): string {
    return sql.replaceAll(/\$\{/g, "$'+'{");
}
```

### Script Logic

The script (`escape-flyway-both-patterns.js`):

1. Finds all `$${` patterns (double dollar)
2. If NOT followed by `flyway:`, replaces with `$'+'$'+'{` (breaks up BOTH $ signs)
3. Finds remaining `${` patterns (single dollar)
4. If NOT followed by `flyway:`, replaces with `$'+'{` (breaks up single $)
5. Leaves `${flyway:...}` patterns unchanged

## Verification Queries

To verify patterns are stored correctly in the database:

```sql
-- Check ${type} pattern
SELECT TOP 1
    SUBSTRING(Specification, CHARINDEX('AccountType=', Specification), 100)
FROM __mj.Component
WHERE Specification LIKE '%AccountType=%'
AND Specification LIKE '%${type}%';

-- Check ${"<svg>"} pattern
SELECT TOP 1
    SUBSTRING(TemplateText, CHARINDEX('WRONG - Using template', TemplateText), 200)
FROM __mj.TemplateContent
WHERE TemplateText LIKE '%WRONG - Using template%'
AND TemplateText LIKE '%<svg>%';
```

## Migration Success

✅ Migration completed successfully in ~19 seconds
✅ 605 non-Flyway placeholder patterns transformed
✅ 24,042 Flyway placeholders (`${flyway:defaultSchema}`) left unchanged
✅ All JavaScript template literal patterns preserved as literal strings in database

## Key Takeaways

1. **Never use Flyway's `$$` escaping for `$${` patterns** - Flyway still sees `$${` during preprocessing and treats it as an escaped placeholder
2. **Break up BOTH dollar signs for double dollar patterns** - Use `$'+'$'+'{value}'` not `'$$' + '{value}'`
3. **Use SQL concatenation for single dollar patterns** - Use `$'+'{value}'` to break up the `${` pattern
4. **Always preserve Flyway placeholders** - `${flyway:...}` must remain unchanged
5. **Test with verbose mode** - Use `npm run mj:migrate -v` to see detailed migration output
