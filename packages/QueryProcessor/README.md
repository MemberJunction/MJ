# @memberjunction/query-processor

Shared query template processing for MemberJunction data providers. Handles parameter validation, type conversion, and Nunjucks template rendering for parameterized queries.

## Why This Package Exists

MemberJunction's `RunQuery` system supports parameterized SQL queries written in the MJ Query language, a defined subset of Nunjucks over SQL (e.g., `{{ status | sqlString }}`). This package provides the `QueryParameterProcessor` class that the database providers use to:

- Validate user-supplied parameters against query definitions
- Convert parameter values to the correct types (string, number, boolean, date, array)
- Apply each parameter's declared validation filters (`required`, `email`, `min`, `max`, `trim`, `upper`, `lower`, `number`, `date`, `sqlsafe`, `sqljoin`)
- Keep server-set values (server-set parameters and the `Context` object) out of the caller's reach
- Bind boolean values the way the dialect expects (SQL Server BIT 1/0 vs PostgreSQL native true/false)
- Render Nunjucks templates with validated parameters and SQL-safe filters

## What This Package Does Not Do

**It does not check the template's syntax.** Which tags, expressions, filters and `Context` tokens a query may use is defined by the [MJ Query language](../../guides/MJ_QUERY_LANGUAGE.md). Those rules are checked when a query is saved (the reference implementation is `QueryTemplate` in `@memberjunction/sql-parser`), and the RunQuery pipeline in `@memberjunction/generic-database-provider` checks a template again before it renders. This processor renders whatever template it is given.

**It does not decide whether SQL is a template.** `ProcessQueryTemplate` renders when the query's `UsesTemplate` is true or when the caller passes `forceTemplateProcessing`; otherwise it returns the SQL unchanged. The RunQuery pipeline decides from the SQL itself: a query whose SQL holds template syntax outside SQL comments is rendered even when its stored `UsesTemplate` flag is false, because unrendered `{{ }}` text is never valid SQL.

## Dialect-Aware Behavior

Each render names the dialect its SQL is written in, through `QueryRenderOptions.DialectKey`. The key is any key `@memberjunction/sql-dialect` resolves: `'sqlserver'`, `'postgresql'`, or the dialect of an External Data Source such as `'mysql'` or `'snowflake'`. The RunQuery pipeline passes the dialect of the request: the provider's own platform, or the External Data Source's dialect for a query that runs on one. Two providers on different platforms in one process therefore each render with their own filters.

The dialect decides:

| Feature | SQL Server | PostgreSQL | Comes from |
|---------|-----------|------------|------------|
| Boolean parameter values | `1` / `0` (BIT) | `true` / `false` | The dialect's `Binding.BooleanParameterValue` |
| `sqlBoolean` filter | `1` / `0` | `true` / `false` | `Writer.BooleanLiteral` |
| `sqlString` / `sqlIn` filters | `N'…'` for text outside ASCII, otherwise `'…'` | `'…'` | `Writer.StringLiteralPrefix`, `Writer.QuoteStringLiteral` |
| `sqlIdentifier` filter | `[name]` | `"name"` | `Writer.QuoteIdentifier` |
| `sqlLikeContains` / `sqlLikeBegins` / `sqlLikeEnds` filters | Escapes `%`, `_` and `[` as `[%]`, `[_]`, `[[]` | Escapes `%`, `_` and `\` with a backslash | `Writer.EscapeLikePattern` |

A dialect with no `Binding` facet (the query-only dialects) keeps a boolean parameter as a JavaScript boolean. An unknown dialect key is an error: `ValidateParameters` throws, and `ProcessQueryTemplate` returns a failed result.

The processor keeps one Nunjucks environment per dialect key, built the first time that key is rendered, since filters are baked in when an environment is created. The `random` built-in filter is replaced with one that refuses to render, because a query must render the same SQL every time.

**When no `DialectKey` is given**, the processor falls back to the process-wide default platform, `RunQuerySQLFilterManager.Instance.Platform` in `@memberjunction/core`. That is only right for a process that talks to one kind of database. `RunQuerySQLFilterManager.SetPlatform` still sets that default but is **deprecated**: pass the dialect on each render instead.

## Parameter Values

- **`null` and `undefined` count as no value.** A parameter the caller passes as `null` or `undefined` is treated exactly like one the caller left out: it is left out of the validated values, a required parameter reports it as missing, and a template's `default(...)` filter applies to it. An empty string also fails a required check.
- **Defaults live in the template.** A parameter definition's `DefaultValue` is informational only and is never injected. Write the default in the SQL, with `{{ name | default(...) }}` or an `{% if %}` / `{% else %}` block. The environment is created with `throwOnUndefined`, so a template that reads a missing value without a default fails to render.
- **Server-set values win.** A caller value for a parameter marked `IsServerSet`, for a name in `QueryServerValues.ProtectedNames`, or for the reserved name `Context` is refused and logged. Server-set parameters take their values from `QueryServerValues.ServerParameters` only, and those values are left out of `appliedParameters`.
- **Unknown parameters are refused**, unless `forceTemplateProcessing` is passed (the outer query of a composition need not define its dependencies' parameters).

## Usage

```typescript
import { QueryParameterProcessor } from '@memberjunction/query-processor';
import type { QueryRenderOptions, QueryTemplateInput } from '@memberjunction/query-processor';

const query: QueryTemplateInput = {
  SQL: 'SELECT ID, Name FROM Customers WHERE Status = {{ status | sqlString }} AND Active = {{ active | default(true) | sqlBoolean }}',
  UsesTemplate: true,
  Parameters: [
    { Name: 'status', Type: 'string', IsRequired: true, IsServerSet: false, ValidationFilters: null },
    { Name: 'active', Type: 'boolean', IsRequired: false, IsServerSet: false, ValidationFilters: null },
  ],
};
const options: QueryRenderOptions = { DialectKey: 'postgresql' };

// Validate parameters on their own
const validation = QueryParameterProcessor.ValidateParameters({ status: 'Active' }, query.Parameters, false, undefined, options);

// Or validate and render in one step
const result = QueryParameterProcessor.ProcessQueryTemplate(
  query,
  { status: 'Active', active: null },  // null counts as no value, so default(true) applies
  undefined,                           // sqlOverride: SQL to render instead of query.SQL
  false,                               // forceTemplateProcessing
  undefined,                           // serverValues: ServerParameters, ProtectedNames, Context
  options
);

if (result.success) {
  // result.processedSQL:
  // SELECT ID, Name FROM Customers WHERE Status = 'Active' AND Active = true
}
```

`ProcessQueryTemplate` accepts a full `QueryInfo` (saved queries) or any object of the `QueryTemplateInput` shape (transient specs). The lower-case `validateParameters` and `processQueryTemplate` are deprecated aliases with the same parameters.

`QueryRenderOptions.Scope` adds names to one render only, such as a callback the template calls. They win over parameter values, `Context` wins over them, and nothing is kept between renders.

## Context Tokens & SQL Escaping (`| sqlString`)

Query templates have access to the server-populated `Context` object (`Context.UserID`, `Context.UserEmail`, `Context.UserName`, `Context.Now`, `Context.Today`, `Context.StartOfWeek`, `Context.StartOfMonth`, `Context.StartOfQuarter`, `Context.StartOfYear`), passed as `QueryServerValues.Context`. The `Context` members a template read come back in `QueryProcessingResult.contextValues`, since a cached result depends on exactly those.

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

- `@memberjunction/core` - For `RunQuerySQLFilterManager` (the per-dialect SQL filters and dialect lookup), `QUERY_CONTEXT_NAME`, `QueryTemplateContext` and `LogError`
- `@memberjunction/core-entities` - For the `MJQueryParameterEntity` fields a parameter definition reads
- `@memberjunction/global` - MJ's shared global utilities (declared; the processor's own source does not import it)
- `nunjucks` - Template rendering engine
