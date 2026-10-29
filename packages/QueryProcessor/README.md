# @memberjunction/query-processor

Shared query template processing for MemberJunction data providers. Handles parameter validation, type conversion, and Nunjucks template rendering for parameterized queries.

## Why This Package Exists

MemberJunction's `RunQuery` system supports parameterized SQL queries using Nunjucks templates (e.g., `{{ status | sqlString }}`). This package provides the `QueryParameterProcessor` class that both the SQL Server and PostgreSQL data providers use to:

- Validate user-supplied parameters against query definitions
- Convert parameter values to the correct types (string, number, boolean, date, array)
- Apply platform-aware boolean handling (SQL Server BIT 1/0 vs PostgreSQL native true/false)
- Render Nunjucks templates with validated parameters and SQL-safe filters

## Platform-Aware Behavior

The processor reads the current platform from `RunQuerySQLFilterManager.Instance.Platform` and adjusts behavior accordingly:

| Feature | SQL Server | PostgreSQL |
|---------|-----------|------------|
| Boolean values | `1` / `0` (BIT) | `true` / `false` |
| `sqlBoolean` filter | Returns `1` or `0` | Returns `TRUE` or `FALSE` |
| `sqlIdentifier` filter | `[name]` | `"name"` |
| `sqlLikeContains` / `sqlLikeBegins` / `sqlLikeEnds` filters | Escapes `%` and `_` with `[%]` `[_]` | Escapes with `\%` `\_` |

The Nunjucks environment is automatically recreated when the platform changes, since filters are baked in at creation time.

## Usage

```typescript
import { QueryParameterProcessor } from '@memberjunction/query-processor';

// Validate parameters against definitions
const validation = QueryParameterProcessor.validateParameters(
  { status: 'Active', limit: '10' },
  query.Parameters
);

if (validation.success) {
  // Process a query template
  const result = QueryParameterProcessor.processQueryTemplate(
    queryInfo,
    userParams,
    platformSpecificSQL // optional override
  );

  if (result.success) {
    // result.processedSQL contains the rendered SQL
    await executeSQL(result.processedSQL);
  }
}
```

## Context Tokens & SQL Escaping (`| sqlString`)

Query templates have access to the server-populated `Context` object (`Context.UserID`, `Context.UserEmail`, `Context.UserName`, `Context.Now`, `Context.Today`, `Context.StartOfWeek`, `Context.StartOfMonth`, `Context.StartOfQuarter`, `Context.StartOfYear`).

> **Warning:** `Context.UserEmail` and `Context.UserName` resolve to raw, unescaped strings (for example, `O'Brien`) and templates render with `autoescape: false`. Always pipe user string tokens through `| sqlString` in SQL templates — never interpolate them bare:
>
> ```sql
> -- Correct (sqlString wraps in single quotes and doubles embedded apostrophes):
> WHERE Email = {{ Context.UserEmail | sqlString }}
>   AND DisplayName = {{ Context.UserName | sqlString }}
>
> -- WRONG (breaks on apostrophes like O'Brien and allows SQL injection):
> WHERE Email = '{{ Context.UserEmail }}'
> ```

## Dependencies

- `@memberjunction/core` - For `RunQuerySQLFilterManager`, `QueryInfo`, `QueryParameterInfo` types
- `@memberjunction/global` - For `MJGlobal` utilities
- `nunjucks` - Template rendering engine
