# @memberjunction/sql-parser

Reads the SQL that MemberJunction stores and runs: saved queries written in the MJ Query language (SQL plus
template tags), the SQL a provider builds around them, and the fragments callers send in. The package lexes SQL by a
dialect's own rules, parses MJ Query templates, parses SQL into a lossless structural tree with analyses, edits that
SQL by exact text spans, and screens untrusted fragments with a strict, fail-closed parser.

Every reader in this package takes a dialect from `@memberjunction/sql-dialect` (`SQLServerDialect`,
`PostgreSQLDialect`, or a query-only dialect), so the same code reads `[bracket]` names on SQL Server and `$$dollar$$`
strings on PostgreSQL correctly.

## Layers

| Layer | Main exports | What it does |
|---|---|---|
| Token stream | `SqlTokens`, `SqlToken`, `IsSignificantToken` | Lexes SQL and MJ template tags together. Lossless, linear time, never throws. |
| MJ Query template | `QueryTemplate`, `TemplateExpressionParser`, template node types, `BranchVariantValues` | Parses the template layer: parameters, compositions, doc comments, branch variants, save-time validation. |
| SQL document | `SqlDocument` and its analyses | Tolerant structural parse of rendered SQL: table and column references, output columns, CTEs, ORDER BY, row caps, read-only check. |
| Edits | `EditSet`, `StripOrderBy`, `ReplaceSelectList`, `AppendTail`, `SetRowCap`, `HoistCTEs`, `RenameCTE`, `WrapAsDerivedTable`, `OutputOrderBy` | Changes SQL by replacing exact spans of the original text, so everything not edited stays as written. |
| Strict screen | `StrictFragmentValidator` | Reads untrusted caller SQL with node-sql-parser and refuses anything it cannot parse. |
| Diagnostics | `Diagnostic`, `Span`, `Analysis<T>`, `MJQueryDiagnosticCodes`, `SqlDocumentDiagnosticCodes` | One result and finding shape shared by every layer. |

The MJ Query language itself (tag forms, filters, parameters, composition, doc comments, every save-time rule and
diagnostic code) is specified in the [MJ Query Language guide](../../guides/MJ_QUERY_LANGUAGE.md). This README covers
the code API.

### Results and diagnostics

Analyses return an `Analysis<T>`: `{ Value, Complete, Diagnostics }`. `Complete` is `false` when part of the input
could not be read, so `Value` may be missing something. An analysis never answers "nothing found" when it means "could
not tell".

A `Diagnostic` has a stable `Code` (`MJQ_…` for the template layer, `SQL_…` for the SQL document), a `Severity`
(`Error`, `Warning` or `Info`), a `Span`, a `Message` and a `FixHint`. A `Span` is `{ Start, End }` in UTF-16 offsets
into the input, end exclusive. Codes are listed as constants in `MJQueryDiagnosticCodes` and
`SqlDocumentDiagnosticCodes`; a code is never renamed or reused.

## Lexing SQL

`SqlTokens.Lex(text, dialect)` splits the text into tokens. Joining the tokens' text gives the input back. SQL
comments are found first, so a template tag inside a `--` or `/* */` comment stays part of the comment and gets an
`Info` diagnostic (`MJQ_EXPRESSION_IN_COMMENT`).

```typescript
import { SqlTokens, IsSignificantToken } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

const dialect = new SQLServerDialect();
const tokens = SqlTokens.Lex(
    `SELECT [Name] -- {{ Ignored }}\nFROM dbo.Users WHERE ID = {{ UserID | sqlString }}`,
    dialect,
);

for (const token of tokens.Significant()) {
    // Word "SELECT", QuotedIdentifier "[Name]", Word "FROM", ..., TemplateExpression "{{ UserID | sqlString }}"
    console.log(token.Kind, token.Text, token.Span.Start, token.Depth);
}
tokens.HasTemplate;                                         // true
tokens.Tokens.filter(t => !IsSignificantToken(t)).length;   // whitespace and comment tokens
```

Each `SqlToken` carries its `Kind`, exact `Text`, `Span`, parenthesis `Depth`, and, for template tags, a `Template`
record that says which SQL context the tag sits in (code, string literal, quoted identifier or comment).

## MJ Query templates

`QueryTemplate.Parse(text, dialect)` builds the template tree (`Nodes`) and computes analyses on first call. Parsing
never throws. The tree's node kinds are `SqlText`, `Expression`, `If`, `For`, `Set`, `Composition`, `DocComment` and
`Unknown`; `AllNodes`, `ChildBodies` and `NodeExpressions` walk it. `TemplateExpressionParser.Parse(source, start,
end)` parses one expression of the template grammar on its own, with absolute offsets.

| Method | Returns |
|---|---|
| `Parameters()` | Each parameter: `Name`, `Filters`, `InferredType`, `IsRequired`, `DefaultValue`, and every use with its span. |
| `CompositionReferences()` | Each `{{query:"…"}}`: `FullPath`, `CategoryPath`, `Name`, `Arguments`, `InTablePosition`, `InsideConditional`. |
| `ContextTokens()` | Each `Context.<Token>` read, and whether it is a known token. |
| `DocComments()` | The `Summary`, `@param` entries and `@field` entries, from `{# #}` headers and trailing `--:` comments. |
| `BranchVariants()` | A base parameter assignment plus one variant per `{% if %}`, so rendering them all shows every branch's SQL. |
| `Validate(options)` | Every save-time rule; `Value` is `{ IsValid, ErrorCount, WarningCount }`. |

```typescript
import { QueryTemplate, BranchVariantValues } from '@memberjunction/sql-parser';

const sql = `{#
  Orders for one region.
  @param {string} Region The sales region code.
#}
SELECT o.OrderID, o.Total --: The order total.
FROM dbo.Orders o
JOIN {{query:"Sales/Targets/Regional Targets(Region=Region)"}} t ON t.Region = o.Region
WHERE o.Region = {{ Region | sqlString }}
{% if MinTotal %}  AND o.Total >= {{ MinTotal | sqlNumber }}{% endif %}`;

const template = QueryTemplate.Parse(sql, dialect);

for (const p of template.Parameters().Value) {
    console.log(p.Name, p.InferredType, p.IsRequired); // Region string true; MinTotal number false
}
for (const ref of template.CompositionReferences().Value) {
    console.log(ref.FullPath, ref.Arguments.map(a => a.Name)); // Sales/Targets/Regional Targets ['Region']
}
const docs = template.DocComments().Value;
docs.Summary;                      // 'Orders for one region.'
docs.Fields.map(f => f.Name);      // ['Total'] (from the trailing --: comment)

const variants = template.BranchVariants().Value;
for (const variant of variants.Variants) {
    const values = BranchVariantValues(variants, variant); // the base values with this variant's overrides
}
```

### Validating a template

`Validate` applies the language's save-time rules. `Mode: 'Save'` (the default) is for a new or edited query, where
every rule is an error. `Mode: 'Refresh'` re-checks a query already saved, and turns the few rules existing queries
may rely on into warnings. Without `ResolveComposition`, composition targets are not checked and the result is not
`Complete`. The options are described in full in the guide's "Validating from code" section.

```typescript
const check = template.Validate({
    Mode: 'Save',
    DeclaredParameters: [
        { Name: 'Region', Type: 'string' },
        { Name: 'MinTotal', Type: 'number' },
    ],
    QueryPath: 'Sales/Reports/Regional Orders',
    ResolveComposition: fullPath => fullPath === 'Sales/Targets/Regional Targets'
        ? { Exists: true, Reusable: true, Parameters: [{ Name: 'Region', IsRequired: true }] }
        : null,
});

if (!check.Value.IsValid) {
    for (const d of check.Diagnostics.filter(d => d.Severity === 'Error')) {
        console.log(`${d.Code} at ${d.Span.Start}: ${d.Message} ${d.FixHint ?? ''}`);
    }
}
```

## SqlDocument: reading SQL

`SqlDocument.Parse(text, dialect)` parses SQL with MJ's own structural parser. It is:

- **Lossless.** `Print()` returns the input byte for byte, and `Text(node)` returns the exact slice a node covers.
- **Tolerant.** It never throws. Syntax it does not know becomes an `Unknown` node plus a diagnostic, and the rest of
  the statement is still read. `IsComplete` says whether everything was read.
- **For SQL, not templates.** Render the template first. A tag left in the text is read as an opaque value and reported
  (`SQL_TEMPLATE_TOKEN`).

| Method | Returns |
|---|---|
| `TableReferences()` | Every table, CTE and table-valued function read anywhere, with `Kind` (`Table`, `CTE`, `Function`) and `Schema` (`null` when the name is unqualified). |
| `ColumnReferences()` | Every identifier path that can be a column, with its clause and the source it binds to when that can be resolved. |
| `OutputItems()` | The first statement's output columns (`Name`, `Alias`, `IsStar`, …); for a set operation, every branch's too. |
| `CTEs()` | Every CTE declared, leading or nested. |
| `TopLevelOrderBy()` | The first statement's top-level ORDER BY with its exact span, or `null`. |
| `RowCaps()` | The TOP, LIMIT, OFFSET and FETCH clauses the top-level query carries. |
| `IsReadOnly()` | Whether the document is exactly one read statement, with the reason when it is not. Fails closed. |
| `StatementKinds()`, `HasStackedStatements()` | The kind of each statement, and whether there is more than one. |
| `WholeRowConstructs()` | Stars, `FOR JSON` / `FOR XML`, `NATURAL JOIN`, set operations and other constructs that read whole rows. |
| `DuplicateOutputNames(options)` | Output names used more than once. Incomplete when the output has a star. |
| `Scope()`, `TopLevelQuery()`, `Statements` | Name resolution and the tree itself, for callers that need more than the analyses. |

```typescript
import { SqlDocument } from '@memberjunction/sql-parser';

const doc = SqlDocument.Parse(`WITH Recent AS (SELECT * FROM dbo.Orders WHERE OrderDate > '2024-01-01')
SELECT TOP 10 c.Name, r.Total AS OrderTotal
FROM Recent r JOIN Customers c ON c.ID = r.CustomerID
ORDER BY r.Total DESC`, dialect);

for (const ref of doc.TableReferences().Value) {
    console.log(ref.Kind, ref.Schema, ref.Name.Parts.map(p => p.Value).join('.'));
    // Table dbo dbo.Orders / CTE null Recent / Table null Customers
}
doc.OutputItems().Value.Items.map(i => i.Name);   // ['Name', 'OrderTotal']
doc.RowCaps().Value.map(c => [c.Form, c.Rows]);    // [['Top', 10]]
const orderBy = doc.TopLevelOrderBy().Value;
if (orderBy) doc.Text(orderBy.Span);               // 'ORDER BY r.Total DESC'
doc.IsReadOnly().Value;                            // { IsReadOnly: true, Reason: null }
```

## Editing SQL

An `EditSet` is a set of edits to one text, kept as a value: each method returns a new set. Edits target a node (any
object with a `Span`) or a span of the original text, and overlapping edits throw an `EditConflictError`. `Apply()`
returns the new text and a `SpanMap` from old offsets to new ones. `Merge` combines two sets over the same text.

```typescript
const users = SqlDocument.Parse('SELECT Name FROM Users WHERE Active = 1', dialect);
const table = users.TableReferences().Value[0];

const applied = users.Edit()
    .Replace(table.Name, 'dbo.ActiveUsers')
    .InsertAfter(table.Name, ' u')
    .Apply();
applied.Text;                         // 'SELECT Name FROM dbo.ActiveUsers u WHERE Active = 1'
applied.SpanMap.MapSpan(table.Span);  // where the table name sits in the new text
```

The transforms build on edit sets and return a `SqlTransformResult`: `{ Text, Applied, Edits, Diagnostics }`. When a
transform does not fit the statement it returns the original text with `Applied: false`, and says why in
`Diagnostics` when there is something to report (`SQL_TRANSFORM_NOT_APPLICABLE`).

| Transform | Does |
|---|---|
| `StripOrderBy(doc, target?)` | Removes exactly the top-level ORDER BY. Later clauses (`OFFSET`, `FETCH`, `FOR`, `OPTION`) stay. |
| `ReplaceSelectList(doc, text)` | Replaces a plain select list, such as with `1` for a count. Not for set operations or `DISTINCT`. |
| `AppendTail(doc, dialect, options)` | Adds `OFFSET` / `FETCH` / `LIMIT` and query hints, with the ORDER BY the dialect needs for paging. |
| `SetRowCap(doc, dialect, rows)` | Tightens an existing numeric cap, or adds one in the dialect's form. |
| `HoistCTEs(doc)` | Splits the leading WITH clause from the query it feeds, as written. Returns `HoistedCTEs` or `null`. |
| `RenameCTE(doc, dialect, oldName, newName, cte?)` | Renames a CTE and every reference that binds to it. Strings, aliases and same-named columns are untouched. |
| `WrapAsDerivedTable(doc, dialect, alias, options?)` | `SELECT * FROM (query) AS alias`, with leading CTEs hoisted out and the ORDER BY moved, kept or dropped. |
| `OutputOrderBy(doc, orderBy)` | An ORDER BY's text with column qualifiers dropped, to order a query that wraps the original. |

```typescript
import { StripOrderBy, SetRowCap, WrapAsDerivedTable } from '@memberjunction/sql-parser';

StripOrderBy(doc).Text;              // the same SQL without 'ORDER BY r.Total DESC'
SetRowCap(doc, dialect, 5).Text;     // TOP 10 becomes TOP 5
const wrapped = WrapAsDerivedTable(doc, dialect, 'q');
if (wrapped.Applied) {
    // WITH Recent AS (...) SELECT * FROM ( SELECT TOP 10 ... ORDER BY r.Total DESC ) AS [q] ORDER BY Total DESC
}
```

## StrictFragmentValidator: untrusted caller SQL

`StrictFragmentValidator` is the screen for SQL that a caller supplies: a WHERE or ORDER BY fragment, an aggregate
expression, or a whole read statement. It parses with node-sql-parser in the dialect's grammar and **refuses text it
cannot parse** rather than guessing. Use it where refusing unparseable input is the correct answer, and never to
rewrite SQL that MJ owns.

| Method | Checks |
|---|---|
| `ValidateFilter(filter, dialect, options?)` | A WHERE fragment, read as `SELECT 1 FROM … WHERE (fragment)`. |
| `ValidateOrderBy(orderBy, dialect, options?)` | An ORDER BY list. |
| `ValidateReadOnlyStatement(sql, dialect, options?)` | A whole statement: valid only as one plain read-only SELECT. |
| `ValidateAggregateExpression(expression, dialect, columns)` | One aggregate call over known columns; returns rebuilt `SQL` to run in place of the caller's text. |

A `StrictValidationResult` has `IsValid`, a `Refusal` (`NoGrammar`, `Unparseable`, `WriteStatement`,
`NotPlainSelect`, `NestedWrite`) with a `Reason` sentence, the statement facts the decision used, and, when asked for
with `CollectReads` / `CollectColumnReferences`, the relations read and the WHERE column references.

```typescript
import { StrictFragmentValidator } from '@memberjunction/sql-parser';

const filter = StrictFragmentValidator.ValidateFilter(`Status = 'Active' AND Total > 100`, dialect, {
    CollectColumnReferences: true,
});
filter.IsValid;            // true
filter.ColumnReferences;   // ['Status', 'Total']

StrictFragmentValidator.ValidateFilter(`1=1; DROP TABLE Users`, dialect).Refusal;   // 'Unparseable'

const statement = StrictFragmentValidator.ValidateReadOnlyStatement(
    'SELECT u.ID FROM dbo.Users u JOIN dbo.Roles r ON r.ID = u.RoleID', dialect, { CollectReads: true });
statement.Reads?.Relations.map(r => `${r.SchemaName}.${r.TableName}`);   // ['dbo.Users', 'dbo.Roles']

const aggregate = StrictFragmentValidator.ValidateAggregateExpression('SUM(Total)', dialect, ['Total', 'Status']);
aggregate.SQL;             // 'SUM([Total])'
```

## Which read-only check to use when

Three checks answer "is this SQL a single read?". They differ in what they do with SQL they cannot fully read.

| Check | How it reads | Unreadable SQL | Use it for |
|---|---|---|---|
| `IsReadOnlyQuery(sql, dialect)` | Tokens only (the lexer) | Judged by its tokens; a construct the parsers do not know never makes a read fail | MJ's write gate on every query path: saved queries, composed queries and paged queries. It is the supported check and is **not** deprecated. |
| `SqlDocument.Parse(sql, dialect).IsReadOnly()` | The structural parser | **Refused** ("part of it could not be read") | Code that already has a `SqlDocument` and wants the stricter answer, including writes nested in CTEs and subqueries and row-locking clauses. |
| `StrictFragmentValidator.ValidateReadOnlyStatement` (and `ValidateFilter`, `ValidateOrderBy`) | node-sql-parser | **Refused** (`Unparseable`) | SQL from an untrusted caller, where refusing anything the grammar cannot read is correct. |

All three refuse stacked statements, `SELECT … INTO`, and statements that are not queries. For example:

| SQL | `IsReadOnlyQuery` | `SqlDocument.IsReadOnly()` | `ValidateReadOnlyStatement` |
|---|---|---|---|
| `SELECT TRY_CAST(x AS INT) FROM T` | read | read | refused: node-sql-parser cannot parse `TRY_CAST` |
| `SELECT a FROM t WHERE (b = 1` | read | refused: could not be read | refused |
| `UPDATE T SET A = 1` | refused | refused | refused |

None of these is a sandbox. A read query can still call a function with side effects; running caller SQL under a
read-only connection and a statement timeout is what contains that.

**Do not use `SQLParser.HasWriteStatement` to decide whether SQL is safe.** It returns `false` whenever node-sql-parser
cannot parse the SQL, so a write it cannot read passes. Use one of the three checks above instead.

## Frozen and deprecated APIs

Earlier versions of this package were built around the `SQLParser` class and node-sql-parser. Those members are kept
and keep working until 7.0, but are marked `@deprecated`; new code uses the layers above.

**Kept unchanged, node-sql-parser AST included,** for callers that walk that tree: `SQLParser.Astify`, `Sqlify`,
`ParseSQL`, `SqlifyAST`, `ExprToSQL`, `WalkAST`, `IsIdentifierAliasName`, and the instance `AST` and
`IdentifierAliases`. `Analyze` and `Substitute` are kept unchanged because they pair with `Astify`. `Tokenize` is kept
unchanged for callers that splice by its offsets; unlike the new template layer, it still reports tags inside SQL
comments. The exported `SQLAst` type is node-sql-parser's `AST`.

**Reimplemented on the new parser, same shapes:** `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`,
`ExtractCTEs`, `Parse` and `ParseWithTemplatePreprocessing` (static and instance forms), and the template helpers
`ExtractTemplateExpressions`, `ExtractCompositionRefs`, `ExtractConditionalBlocks` and `ExtractParameterInfo`.

| Deprecated | Replacement |
|---|---|
| `new SQLParser(sql, dialect)` | `SqlDocument.Parse(sql, dialect)` to read; `StrictFragmentValidator` to screen untrusted SQL |
| `IsValid` | `SqlDocument.IsComplete`, or `StrictFragmentValidator` |
| `Dialect`, `SQL` | `SqlDocument.Dialect`, `SqlDocument.Text()` |
| `StatementKind` | `SqlDocument.StatementKinds()` |
| `HasWriteStatement` | `SqlDocument.IsReadOnly()` or `StrictFragmentValidator.ValidateReadOnlyStatement` |
| `OuterCap` | `SqlDocument.RowCaps()` |
| `SetOuterCap`, `ClearOuterCap` | `SetRowCap` / `ReplaceSelectList` transforms |
| `ClearOrderBy` | `StripOrderBy` transform |
| `ToSQL` | `EditSet.Apply()` on the original text |
| `HasUnwrappableTrailingClause` | The top-level query's `For` and `Option` clauses in `SqlDocument` |
| `SQLParser.HasStackedStatements` | `SqlDocument.HasStackedStatements()` |
| `StripComments` | `SqlTokens.Lex(sql, dialect)`, keeping the tokens that are not comments |
| `Parse`, `ParseWithTemplatePreprocessing` | `SqlDocument` (`TableReferences()`, `ColumnReferences()`), with `QueryTemplate` for templated SQL |
| `ExtractTableRefs` | `SqlDocument.TableReferences()` |
| `ExtractColumnRefs` | `SqlDocument.ColumnReferences()` |
| `ExtractSelectColumns` | `SqlDocument.OutputItems()` |
| `ExtractCTEs`, `SplitLeadingCTEs` | `SqlDocument.CTEs()`, or the `HoistCTEs` transform |
| `Tokenize` | `QueryTemplate.Parse(sql, dialect)` (`Nodes` and `Tokens`) |
| `Analyze` | `SqlTokens.Lex(sql, dialect).HasTemplate` and `QueryTemplate` |
| `Substitute` | `QueryTemplate` |
| `ExtractTemplateExpressions`, `ExtractConditionalBlocks` | `QueryTemplate.Nodes` |
| `ExtractCompositionRefs` | `QueryTemplate.CompositionReferences()` |
| `ExtractParameterInfo` | `QueryTemplate.Parameters()` |
| `RenameTemplateVariable`, `SubstituteTemplateVariable` | `QueryTemplate.Parameters()` (every use's span) and an `EditSet` |
| `LexSQL`, `SignificantTokens`, `IsKeyword` | `SqlTokens.Lex(...)`, `.Significant()`, and comparing a `Word` token's `Text` |
| `AnalyzeTopLevelOrderBy`, `HasTopLevelOrderBy`, `ExtractOrderBy` | `SqlDocument.TopLevelOrderBy()` and the `StripOrderBy` transform |
| `FindOrderByStatement`, `IsOrderByLegalInCTE` (and lower-case aliases) | `SqlDocument.TopLevelOrderBy()` / `RowCaps()`, with the dialect grammar's `AllowsOrderByInCTE` |
| `AnalyzePagingShape` | `SqlDocument` (`RowCaps()`, `TopLevelOrderBy()`, `CTEs()`) and `SetRowCap` / `AppendTail` / `WrapAsDerivedTable` |
| `ParseToIR`, `RenderIR` | `QueryTemplate` and `SqlDocument`; `EditSet` to change query text |
| `CheckAggregateExpression` | `StrictFragmentValidator.ValidateAggregateExpression` |

`IsReadOnlyQuery`, `IsBalancedSQLFragment`, `SplitTopLevelAndTerms` and `FindForbiddenFunctionCalls` are not
deprecated.

### Knowing whether a legacy extraction was complete

`ExtractSelectColumns` and `ExtractColumnRefs` return `[]` both when there is nothing to find and when the SQL could
not be read. `SQLParser.ExtractSelectColumnsChecked(sql, dialect)` and `SQLParser.ExtractColumnRefsChecked(sql,
dialect)` return the same columns as `CheckedSelectColumns` / `CheckedColumnReferences`, which add `Complete` and
`Diagnostics`, so a caller can tell the two apart.

```typescript
import { SQLParser } from '@memberjunction/sql-parser';

const checked = SQLParser.ExtractSelectColumnsChecked('SELECT TRY_CAST(a AS INT) AS A FROM T', dialect);
checked.Complete;                        // true
checked.Columns.map(c => c.OutputName);  // ['A']
```

### Behaviour notes for legacy extractor callers

The extractors keep their result shapes, but their answers are now correct in cases the old regex fallback got wrong:

- **CTE names are not returned as tables.** `WITH x AS (SELECT * FROM Orders) SELECT * FROM x` returns only `Orders`.
- **No invented `dbo` on PostgreSQL.** For an unqualified name, `SQLTableReference.SchemaName` is the dialect's default
  schema: `dbo` on SQL Server, `public` on PostgreSQL. `SqlDocument.TableReferences()` returns `Schema: null` instead,
  so new code can tell "unqualified" from "written as `dbo`".
- **Nothing is read from comments or string literals.** `/* FROM Phantom */` and `'from Fake'` produce no table.
  Neither do `EXTRACT(… FROM …)`, `TRIM(… FROM …)` or `IS DISTINCT FROM`, and template placeholders are never
  reported as tables or columns.
- **Real results where node-sql-parser failed.** SQL with `TRY_CAST`, `WITHIN GROUP`, `COLLATE` or a `FOR JSON`
  subquery now returns its columns and references instead of `[]`.
- **Table references are also read from non-query statements** such as `CREATE VIEW` and DML, in source order, and a
  three-part name reports its schema part correctly.
- **Template tags inside SQL comments are no longer reported** by `ExtractTemplateExpressions`,
  `ExtractCompositionRefs` or `ExtractParameterInfo`: comments are removed before a template renders, so such a tag is
  never live. A tag inside a string literal is still a tag (SQL quoting does not hide it) and is still reported; saving
  a query with one is refused.
- **`ExtractCTEs` returns the author's exact text** for each definition and for the main statement, rather than SQL
  regenerated from a parse tree.

## Installation

```bash
npm install @memberjunction/sql-parser
```

Or, in a MemberJunction workspace, add the dependency to your package's `package.json` and run `pnpm install` from the
repo root.

## Dependencies

- [`@memberjunction/sql-dialect`](../SQLDialect/README.md): the dialects every reader takes.
- [`node-sql-parser`](https://www.npmjs.com/package/node-sql-parser): used by `StrictFragmentValidator` and the
  frozen AST members only.

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
