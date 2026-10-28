# MJ Query Language v1

MJ Query is the language of MemberJunction stored queries: SQL in one dialect, with template tags for parameters,
conditions, loops and composition. This document is the specification of **version 1**. It is written for
MemberJunction developers and for the AI agents that write queries (Skip's query writers).

## What MJ Query is

- **A defined, allow-listed subset of Nunjucks over SQL.** Every tag, expression form, filter and `Context` token
  the language accepts is listed here. Anything not listed is refused.
- **One dialect per query.** The SQL between the tags is read with the lexical rules of the query's dialect
  (SQL Server, PostgreSQL, MySQL, Oracle, Snowflake or Databricks).
- **MJ parses and checks; Nunjucks renders.** MJ reads the query, finds its parameters and checks every rule in this
  document when the query is saved. At run time Nunjucks renders the template with the caller's values and the
  MJ SQL filters.
- **Strictness.** A query that breaks a rule is refused when it is saved new or edited (a save that changes its SQL).
  Queries already saved keep running, unless they use a construct outside the language (see
  [Running a saved query](#running-a-saved-query)). A refresh of an existing query reports what breaks the rules, and
  three rules are only warnings there (see [Save-time checks reference](#12-save-time-checks-reference)).

The reference implementation is `@memberjunction/sql-parser`:

| API | What it does |
|---|---|
| `SqlTokens.Lex(text, dialect)` | The token stream: every SQL token and template tag, with positions. Never throws. |
| `QueryTemplate.Parse(text, dialect)` | The template tree, plus analyses: `Parameters()`, `ContextTokens()`, `CompositionReferences()`, `DocComments()`, `BranchVariants()`, `Validate(options)`. Never throws. |
| `MJQueryDiagnosticCodes` | Every diagnostic code below. Codes are stable and never reused. |

Every analysis returns `{ Value, Complete, Diagnostics }`. `Complete` is `false` when part of the text could not be
read (an unsupported tag, an unclosed block), so the value may be missing something.

---

## 1. Lexical layer

### Tag forms

| Form | Written | Purpose |
|---|---|---|
| Hole | `{{ … }}` | Writes one value into the SQL, or composes another query (`{{query:"…"}}`). |
| Block tag | `{% … %}` | `if` / `elif` / `else` / `endif`, `for` / `endfor`, `set`. |
| Template comment | `{# … #}` | Never rendered. Holds doc comments (`@param`, `@field`). |

**Whitespace control.** A `-` right after the opener or right before the closer (`{{-`, `-}}`, `{%-`, `-%}`,
`{#-`, `-#}`) trims whitespace on that side when Nunjucks renders. MJ's analysis ignores the dash.

### SQL comments first, then tags

SQL comments are found first, by the dialect's rules over the raw text, because the render pipeline removes SQL
comments **before** the template is evaluated. Everything inside a `--` or `/* */` comment is therefore **inert** for
the template layer: a `{{ x }}` or `{{query:"…"}}` mentioned in a comment is not a parameter use, not a composition
and not a block, and it is never rendered. `Validate` notes each such comment with `MJQ_EXPRESSION_IN_COMMENT`
(**Info**, never a refusal), so a header that documents its own parameters keeps validating:

```sql
/* PARAMETERS
     {{ agentRunID }} — the run at the top of the tree      -- inert: not a use of agentRunID
   Compose via {{query:"MJ/Tags/Tags For Entity Record"}}   -- inert: not a composition
*/
```

**`{#` always opens a template comment, in every dialect.** It takes precedence over a dialect's `#` line comment
(MySQL), so a `#` right after `{` never starts a SQL comment, and neither does the `#` of `#}`. On MySQL,
`{# @param x … #} SELECT …` keeps its `SELECT` and its doc comment. A `#` anywhere else still starts a MySQL comment.
`{{` and `{%` mean nothing to any dialect's SQL rules, so they are always template tags outside comments.

Write notes about the template itself in a `{# #}` template comment, which is the language's own comment form (and
where doc comments go). A SQL comment is still the right place for notes about the SQL.

Template tags are then found over the rest of the text, as Nunjucks finds them. SQL quoting does not hide a tag:
`'{{ x }}'` is still a tag. Inside `{{ }}` and `{% %}`, a closer inside a quoted template string does not end the tag
(`{{ x | default('}}') }}` is one tag). A `{# #}` ends at its first `#}`. Because comments are found first, a `{{`
mentioned in a comment never pairs with a `}}` after it.

The SQL around the tags is then read by the dialect's rules as if each tag were blank. Each tag records the **SQL
context** it sits in:

| SQL context | Meaning | Allowed? |
|---|---|---|
| `Code` | Ordinary SQL text | Yes |
| `StringLiteral` | Inside a SQL string literal | No: `MJQ_TAG_IN_STRING_LITERAL` |
| `QuotedIdentifier` | Inside a quoted identifier (`[…]`, `"…"` or `` `…` ``, as the dialect defines them) | No: `MJQ_TAG_IN_QUOTED_IDENTIFIER` |
| `Comment` | Inside a SQL comment | Inert (Info `MJQ_EXPRESSION_IN_COMMENT`). Normally such text is not a tag at all; this context appears only when a tag's own quotes change where a comment starts. |

### Whole-token placement

A tag stands in for **whole SQL tokens**. It never builds part of a string literal or part of a quoted identifier,
because there its value is not escaped. Use the filter that builds the whole token:

| Instead of | Write |
|---|---|
| `Name LIKE '%{{ Search }}%'` | `Name LIKE {{ Search \| sqlLikeContains }}` |
| `Name LIKE '{{ Prefix }}%'` | `Name LIKE {{ Prefix \| sqlLikeBegins }}` |
| `WHERE Code = '{{ Code }}'` | `WHERE Code = {{ Code \| sqlString }}` |
| `SELECT [{{ Column }}]` | `SELECT {{ Column \| sqlIdentifier }}` |

An opener with no closer (`{{`, `{%` or `{#` alone) is `MJQ_UNCLOSED_TAG`.

---

## 2. Expressions

Expressions appear in holes, `{% if %}` / `{% elif %}` conditions, `{% for %}` iterables, `{% set %}` values and
composition arguments.

### Grammar

```
expression := or ["if" or ["else" or]]          (inline if: body if condition else otherwise)
or         := and ("or" and)*
and        := not ("and" not)*
not        := "not" not | compare
compare    := additive (("==" | "!=" | "<" | ">" | "<=" | ">=") additive)*
additive   := term (("+" | "-") term)*
term       := unary (("*" | "/" | "%") unary)*
unary      := ("-" | "+") unary | postfix, then filters ("|" name ["(" args ")"])*
postfix    := primary ("." name | "(" args ")" | "[" expression "]")*
primary    := name | number | string | true | false | null | "(" expression ")"
```

Only three `postfix` forms are accepted: `Context.<Token>`, `loop.<member>` and `<name>.length`. Calls, subscripts and
any other attribute are parsed so they can be reported, then refused.

### `.length`

`<name>.length` is the length of the array or string a name (a parameter, loop variable or `{% set %}` variable)
holds. It is the only attribute a name has. As in Nunjucks, a name with no value, a `null` value, or a value with no
length (a number, a boolean) gives `undefined`, and every comparison with `undefined` but `!=` is false:

```sql
{% if Codes and Codes.length > 0 %} AND Code IN {{ Codes | sqlIn }} {% endif %}
```

An empty array is truthy on its own, so `{% if Codes %}` alone takes the branch for `[]`; `Codes.length > 0` does not.
`.length` takes no further postfix: `x.length.length`, `x.length()` and `x['length']` are refused, as is `.length` on
anything but a plain name (`Context.UserID.length`, `'abc'.length`). In a hole, `.length` is a number and takes
`sqlNumber`: `{{ Codes.length | sqlNumber }}`.

### Inline if

`body if condition else otherwise` is `body` when the condition is truthy, otherwise `otherwise`. Without `else`
(`body if condition`) a false condition gives the empty string. It is an expression, allowed wherever an expression
is: in a hole, a condition, a `{% set %}` value or a composition argument. Each part is read at the `or` level, so a
nested inline if needs parentheses: `a if b else (c if d else e)`.

```sql
SELECT TOP {{ MaxRows | sqlNumber if MaxRows else 12 }} …
```

### Precedence (tightest first)

| Level | Operators |
|---|---|
| 1 | Unary `-`, `+` |
| 2 | Filters: `x \| f`, `x \| f(arg)` |
| 3 | `*`, `/`, `%` |
| 4 | `+`, `-` |
| 5 | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| 6 | `not` |
| 7 | `and` |
| 8 | `or` |
| 9 | Inline `if` … `else` |

**Filters bind tighter than every binary operator**, as in Nunjucks. `Year - 1 | sqlNumber` means
`Year - (1 | sqlNumber)`. A unary sign binds tighter than a filter: `-x | f` means `(-x) | f`. **Every operator binds
tighter than the inline if**: `x | sqlNumber if x else 12` means `(x | sqlNumber) if x else 12`, so the filter applies
to the body only; `(x if x else 12) | sqlNumber` filters both branches.

### Literals and names

| Kind | Forms |
|---|---|
| String | `'text'` or `"text"`. A backslash escapes the next character; `\n`, `\t`, `\r` are a newline, tab and carriage return. |
| Number | Digits with an optional fraction: `10`, `2.5`. No exponent. A negative number is unary `-` on a number. |
| Boolean | `true`, `True`, `false`, `False` |
| Null | `null`, `none`, `None` |
| Name | A letter or `_`, then letters, digits or `_`. The words `and`, `or`, `not`, `if`, `else`, `in`, `is` are not names. |
| Context token | `Context.<Token>`: one of the nine tokens in [Context tokens](#6-context-tokens). |
| Loop member | `loop.<member>`, inside a `{% for %}` body only. |
| Length | `<name>.length`: see [`.length`](#length). |

### What is refused

| Construct | Example | Code |
|---|---|---|
| Function or method call | `upper(x)`, `x.upper()` | `MJQ_FUNCTION_CALL` (a method call is also `MJQ_MEMBER_ACCESS`) |
| Subscript | `x[0]`, `x['key']` | `MJQ_SUBSCRIPT` |
| Attribute access other than `Context.`, `loop.` and `<name>.length` | `x.Name`, `x.constructor`, `Context.UserID.length` | `MJQ_MEMBER_ACCESS` |
| `in`, `not in`, `is`, `~`, `**`, `//`, `===`, `!==` | `x in Items`, `x is defined` | `MJQ_UNSUPPORTED_OPERATOR` |
| List or object literal | `[1, 2]`, `{a: 1}` | `MJQ_UNSUPPORTED_OPERATOR` |
| Anything else that does not parse | `!x`, an empty tag, an unclosed string | `MJQ_SYNTAX` |

---

## 3. Holes

A hole `{{ }}` writes **one value** into the SQL:

```
{{ value [| default(literal)] [| sqlFilter] }}
```

`value` is a parameter, a `Context` token, a loop variable, a `{% set %}` variable, a loop member or `<name>.length`.
Filters follow.

A hole may also be an inline if, `{{ value if condition else value }}`. Each branch is checked as the value of a
hole, with its own filters and the filters written after the whole inline if:
`{{ MaxRows | sqlNumber if MaxRows else 12 }}` and `{{ (A if A else B) | sqlNumber }}` both filter every
parameter they write. A branch may be a literal (the author wrote it); the condition is not written into the SQL, so
it needs no filter.

- **No operators inside a hole** (`MJQ_ARITHMETIC_IN_HOLE`). Do the arithmetic in SQL around the hole, or in a
  `{% set %}`:

  ```sql
  WHERE FiscalYear = {{ Year | sqlNumber }} - 1          -- arithmetic in SQL
  {% set PriorYear = Year - 1 %}
  WHERE FiscalYear = {{ PriorYear }}                     -- arithmetic in a set
  ```

  Parentheses do not help: `{{ (Year - 1) | sqlNumber }}` is still refused.
- **A literal is not a value** (`MJQ_HOLE_NOT_A_VALUE`): write `'abc'` in the SQL, not `{{ 'abc' }}`. A branch of an
  inline if may be a literal.
- Arithmetic and comparisons **are** allowed in `{% if %}` conditions, `{% set %}` values and composition arguments.

---

## 4. Filters

Each MJ SQL filter turns a value into safe SQL text for one parameter type. The output shown is SQL Server's; each
dialect formats for itself.

| Filter | Formats type | Example | Renders (SQL Server) |
|---|---|---|---|
| `sqlString` | string | `Name = {{ Name \| sqlString }}` | `'O''Brien'` |
| `sqlNumber` | number | `Age > {{ MinAge \| sqlNumber }}` | `25` |
| `sqlDate` | date | `CreatedAt >= {{ Start \| sqlDate }}` | `'2024-01-15T00:00:00.000Z'` |
| `sqlBoolean` | boolean | `IsActive = {{ Active \| sqlBoolean }}` | `1` |
| `sqlIn` | array | `Status IN {{ Statuses \| sqlIn }}` | `('Active', 'Pending')` |
| `sqlIdentifier` | string | `ORDER BY {{ SortColumn \| sqlIdentifier }}` | `[Revenue]` |
| `sqlLikeContains` | string | `Name LIKE {{ Search \| sqlLikeContains }}` | `'%Gala%'` |
| `sqlLikeBegins` | string | `Name LIKE {{ Prefix \| sqlLikeBegins }}` | `'Gala%'` |
| `sqlLikeEnds` | string | `Name LIKE {{ Suffix \| sqlLikeEnds }}` | `'%Gala'` |
| `sqlNoKeywordsExpression` | string | `ORDER BY {{ OrderBy \| sqlNoKeywordsExpression }}` | `Revenue DESC` |

**`default(literal)`** supplies a value when the caller gives none. Its arguments must be literals: a string, number,
boolean or `null` (`MJQ_DEFAULT_NOT_LITERAL` otherwise). It formats nothing, so put it before the SQL filter:
`{{ Start | default('2020-01-01') | sqlDate }}`.

Any other filter name (`safe`, `upper`, `join`, …) is `MJQ_UNKNOWN_FILTER`, wherever it appears.

**The filter must fit the type.** When a parameter declares a type in its metadata (see
[Unfiltered values](#unfiltered-values) for which rows declare), the **last SQL filter** of each hole must be one that
formats that type (`MJQ_FILTER_TYPE_MISMATCH`). All five string filters fit a `string` parameter. `Context` tokens
have their own fixed list (see below).

---

## 5. Block tags

The allowed block tags are `if`, `elif` (also `elseif`), `else`, `endif`, `for`, `endfor` and `set`. Every other tag
(`macro`, `include`, `import`, `extends`, `block`, `call`, `filter`, `raw`, `endset`, …) is `MJQ_UNSUPPORTED_TAG`.

### if / elif / else / endif

```sql
{% if Search %}
  AND Name LIKE {{ Search | sqlLikeContains }}
{% elif MinTotal > 0 %}
  AND Total >= {{ MinTotal | sqlNumber }}
{% else %}
  AND IsFeatured = 1
{% endif %}
```

- A condition is any expression. Comparisons, arithmetic, `and`, `or`, `not` and filters are allowed.
- An `elif` or `else` after the `else`, or outside any `if`, is `MJQ_UNEXPECTED_TAG`. So is an `endif` with no open
  `if`.
- An `if` with no `endif` is `MJQ_UNCLOSED_BLOCK`. So is a block left open when an outer block closes.

### for / endfor

```sql
{% for Tag in Tags %}
  {% if not loop.first %}OR {% endif %}t.Tag = {{ Tag | sqlString }}
{% endfor %}
```

- Exactly one loop variable over **one array parameter**: `{% for Item in ArrayParameter %}`. Two loop variables
  (`for a, b in …`), a `Context` token, a loop variable, a set variable or any expression as the iterable is
  `MJQ_FOR_ITERABLE`. So is an iterable whose declared type is not `array`.
- No `for … else` (`MJQ_UNSUPPORTED_TAG`).
- Inside the body, `loop` has these members (any other is `MJQ_LOOP_OUTSIDE_FOR`):

  | Member | Value |
  |---|---|
  | `loop.index` / `loop.index0` | Position, counting from 1 / from 0 |
  | `loop.revindex` / `loop.revindex0` | Position from the end, counting to 1 / to 0 |
  | `loop.first` / `loop.last` | Whether this is the first / last item |
  | `loop.length` | The number of items |

  `loop` outside a `{% for %}` body is `MJQ_LOOP_OUTSIDE_FOR`.

### set

```sql
{% set PriorYear = Year - 1 %}
```

- One name, `=`, one expression. The name is a template variable, not a parameter.
- The block form (`{% set X %}…{% endset %}`) and any `set` without `=` are `MJQ_UNSUPPORTED_TAG`.

### Nesting limit

Blocks may nest up to **64** deep (`MAX_BLOCK_NESTING`). A deeper `if` or `for` is `MJQ_SYNTAX`.

---

## 6. Context tokens

`Context` is a reserved object the server fills from the context user and the clock. The caller never sets it. The
list is closed: any other `Context.<Name>`, or `Context` on its own, is `MJQ_UNKNOWN_CONTEXT_TOKEN`.

| Token | Holds | Filters that fit |
|---|---|---|
| `Context.UserID` | The context user's ID | `sqlString` |
| `Context.UserEmail` | The context user's email | `sqlString` |
| `Context.UserName` | The context user's name | `sqlString` |
| `Context.Now` | The current instant (ISO 8601) | `sqlDate`, `sqlString` |
| `Context.Today` | Today's date | `sqlDate`, `sqlString` |
| `Context.StartOfWeek` | The first day of this week | `sqlDate`, `sqlString` |
| `Context.StartOfMonth` | The first day of this month | `sqlDate`, `sqlString` |
| `Context.StartOfQuarter` | The first day of this quarter | `sqlDate`, `sqlString` |
| `Context.StartOfYear` | The first day of this year | `sqlDate`, `sqlString` |

A `Context` token in a hole always needs a filter (`MJQ_UNFILTERED_VALUE`), and the filter must be on its list
(`MJQ_FILTER_TYPE_MISMATCH`). `Context` tokens are not parameters.

```sql
WHERE o.OwnerUserID = {{ Context.UserID | sqlString }}
  AND o.CreatedAt >= {{ Context.StartOfMonth | sqlDate }}
```

---

## 7. Parameters

### What is a parameter

A parameter is a name the caller supplies. Every name the template reads is a parameter, **except**:

- a `{% for %}` loop variable, inside its loop;
- a name assigned by `{% set %}` anywhere in the template;
- `loop` and `Context`.

Uses are counted in holes (and their filter arguments), `{% if %}` / `{% elif %}` conditions, `{% for %}` iterables,
`{% set %}` values and composition arguments. Parameters are listed in order of first use. Names are case-sensitive.

### Required or optional

> A parameter is **required** when at least one of its uses sits outside every `{% if %}` block and every inline if,
> and has no `default(…)`. Otherwise it is **optional**.

- A use inside any branch of an `{% if %}` (including `elif` and `else`) is conditional.
- A use in an `{% if %}` or `{% elif %}` condition is conditional.
- `<name>.length` is a use of the name, like any other: `{% if X and X.length > 0 %}` leaves `X` optional.
- Any use in an inline if is conditional: its condition (a `Condition` use) and its branches. A parameter used in an
  inline if is required only when it is also used unconditionally elsewhere.
- A `{% for %}` body is **not** conditional. A loop at the top level makes its iterable required.
- `default(…)` makes only the hole it sits in optional. Only a hole has filters, so a use in a `{% set %}` value or a
  composition argument outside every `{% if %}` is required.

| Template | Region | Search |
|---|---|---|
| `WHERE r = {{ Region \| sqlString }}` | required | |
| `{% if Search %} AND n LIKE {{ Search \| sqlLikeContains }} {% endif %}` | | optional |
| `WHERE r = {{ Region \| default('WEST') \| sqlString }}` | optional | |
| `{% if Region %}…{% endif %} WHERE r = {{ Region \| sqlString }}` | required (the second use) | |
| `{% for R in Regions %}…{% endfor %}` at the top level | `Regions` required | |
| `{% if Search and Search.length > 2 %}…{% endif %}` | | optional |
| `TOP {{ Region \| sqlNumber if Region else 12 }}` | optional | |

### Inferred type

- A hole's type is the type of its **last SQL filter** (`default` does not count). `{{ x | sqlNumber }}` makes `x` a
  number.
- A `{% for %}` iterable is an `array`.
- A branch of an inline if in a hole is typed like a hole, by its last SQL filter (its own or one written after the
  inline if).
- `<name>.length` implies no type: arrays and strings both have a length. When another use types the parameter a
  `number` or `boolean`, which has no length, the `.length` use is `MJQ_PARAMETER_TYPE_CONFLICT` (a warning).
- The first use that implies a type sets it. A later use that implies a different type is
  `MJQ_PARAMETER_TYPE_CONFLICT` (a warning); the first type is kept.
- With no typed use the type is `unknown`.

`Parameters()` reports, for each parameter: `Name`, `Filters` (every filter name, in order of first appearance),
`InferredType`, `IsRequired`, `DefaultValue` (the literal of its first `default(…)`, or `null`) and `Uses` (each with
its role, position, filters, whether it is conditional, whether it reads `.length`, whether it has a default, and its
SQL context).

### Unfiltered values

A value written into the SQL without an MJ SQL filter is checked by its type. The type is the declared type when the
query's metadata declares the parameter, otherwise the inferred type. A parameter row declares when a person wrote it
(`DetectionMethod` `Manual`) or it is marked `IsServerSet`. When neither gives a type, a type recorded by a
parameter row that extraction detected (`AI` or `Parser`) is used. Such a row only types an unfiltered value: it never
decides whether a filter fits, so an edit may change that parameter's filter.

| Value | Without a filter |
|---|---|
| A parameter declared `IsServerSet` | Allowed: only the server sets it. |
| A `number` or `boolean` parameter | Allowed. |
| A `string`, `array` or `date` parameter | `MJQ_UNFILTERED_VALUE` (error) |
| A parameter of any other or unknown type | `MJQ_UNFILTERED_UNTYPED` (warning) |
| A `{% for %}` loop variable | `MJQ_UNFILTERED_VALUE` (error) |
| A `Context` token | `MJQ_UNFILTERED_VALUE` (error) |
| A `{% set %}` variable whose value is a constant (reads no parameter, `Context` token or loop value) | Allowed: the author wrote it. |
| A `{% set %}` variable whose value is a `-`, `*`, `/` or `%` expression | Allowed: the result is a number. |
| Any other `{% set %}` variable (for example `{% set Nm = Name %}`, or `Name + ''`) | `MJQ_UNFILTERED_VALUE` (error): it carries a caller's value. |
| A loop member (`loop.index`, …) | Allowed. |
| `<name>.length` | `MJQ_UNFILTERED_VALUE` (error): pipe it through `sqlNumber`. Any other SQL filter is `MJQ_FILTER_TYPE_MISMATCH`. |

---

## 8. Composition

A composition writes another stored query in as a table source:

```
{{query:"Category/Path/Name(Arg=Expr, …)"}}
```

```sql
SELECT c.CustomerID, c.Name, s.Total
FROM {{query:"Sales/Reports/Active Customers(Region=Region, Since=Context.StartOfYear)"}} c
JOIN {{query:"Sales/Reports/Customer Totals(Year=Year - 1)"}} s ON s.CustomerID = c.CustomerID
```

### Path

- The path is in **double quotes**, directly after `query:`. Nothing may follow the closing quote.
- It is the full category path and the query name, joined by `/`. There is no name-only fallback: a query in a
  category is always named with its category path. Segments are trimmed; an empty segment is
  `MJQ_COMPOSITION_MALFORMED`.
- **Partial paths.** A path that matches no query exactly still finds one when it is a whole-segment suffix of
  exactly one same-named query's category path: `"Demos/Active Users"` finds `MJ/Demos/Active Users`. Such a
  reference runs, with a warning (`MJQ_COMPOSITION_PARTIAL_PATH`, logged once per process at run time); saving it is
  an error whose fix hint names the full path. A path that is not such a suffix, or is the suffix of more than one
  query's path, finds nothing. `MatchCompositionPath` implements the rule for resolvers.
- **Parentheses in names.** The argument list is the parenthesized group that ends the path, when it is empty or
  starts with `Name=`. Otherwise the parentheses are part of the name: `"Finance/Year-End (2024) Summary"` names a
  query, and `"Finance/Year-End (2024) Summary(Region='WEST')"` passes `Region`.
- Because the path ends at the next `"`, string arguments use **single quotes**. A quote inside the string can be
  written two ways, and both are accepted: a backslash (`Owner='O\'Brien'`, the expression grammar's form,
  **recommended**) or a doubled quote (`Owner='O''Brien'`, the SQL form older compositions use). The doubled form
  works only in composition arguments, not in other expressions.

### Arguments

- Each argument is `Name=Expression`, separated by commas. The expression uses the full expression grammar: literals,
  outer parameters, `Context` tokens and arithmetic (`Year=Year - 1`). An argument list that does not parse is
  `MJQ_COMPOSITION_MALFORMED`; a refused construct inside a value keeps its own code (`Region=upper(R)` is
  `MJQ_FUNCTION_CALL`).
- An argument with no names, `Context` tokens or loop values is **static** (`Region='WEST'`). One that reads them is
  **pass-through** (`Region=Region`). `CompositionReferences()` reports `IsStatic` and `ReferencedNames` per argument.

### Rules

| Rule | Code |
|---|---|
| **Position.** A composition stands only where a table source goes: directly after `FROM`, `JOIN` or `APPLY`, or after a comma in a `FROM` list. Not in a select list, a `WHERE`, or after `(` or `IN`. | `MJQ_COMPOSITION_POSITION` |
| The target must exist at that full path. | `MJQ_COMPOSITION_NOT_FOUND` |
| The path must be the target's full path, not a suffix of it. Error on save, warning on refresh. | `MJQ_COMPOSITION_PARTIAL_PATH` |
| The target must be marked Reusable. | `MJQ_COMPOSITION_NOT_REUSABLE` |
| Every **required** parameter of the target must be passed. | `MJQ_COMPOSITION_MISSING_ARGUMENT` |
| An unpassed target parameter named like an outer parameter (case-insensitive) is refused. Error on save, warning on refresh. | `MJQ_COMPOSITION_IMPLICIT_ARGUMENT` |
| Every argument name must be a parameter of the target (case-insensitive). | `MJQ_COMPOSITION_UNKNOWN_ARGUMENT` |
| Each argument is passed once (case-insensitive). | `MJQ_COMPOSITION_DUPLICATE_ARGUMENT` |
| Compositions must not lead back to the query being saved, or to a query already on the path. | `MJQ_COMPOSITION_CYCLE` |

**Arguments are explicit, like a function call.** No value flows into the composed query by name. A target parameter
that is not passed has no value, even when the outer query has a parameter of the same name. That is why an unpassed
same-named parameter is refused: write `(Region=Region)`.

**Render-then-compose.** The composed query is rendered with its own arguments, and the result becomes a CTE of the
outer query.

---

## 9. Doc comments

Descriptions of parameters and output fields can live in the SQL, versioned with it.

### Header form (recommended)

```sql
{#
  Orders for one region.
  @param {string} Region The sales region code.
  @param {date} StartDate Only orders on or after this date.
         Leave empty for all dates.
  @field OrderID The order's ID.
  @field [Order Total] The total in the order's currency.
#}
```

- Tags are `@param Name description` and `@field Name description`. A line may start with `*`, JSDoc style.
- An optional `{type}` may follow the tag. It is recorded as `DeclaredType`.
- A name is a plain name (letters, digits, `_`, `@`, `#`, `$`), or quoted as `"Name"`, `[Name]` or `` `Name` `` for
  field names with spaces. An optional `- ` may separate the name from the description.
- Lines after a tag line, up to the next tag, continue its description. They are joined to it with a newline, each
  with its indentation (and any leading `*`) removed.
- Text before the first tag of the first doc comment that has tags is the query's **summary**.
- A `{# #}` comment with no tags is an ordinary comment.

### Trailing form (secondary)

```sql
SELECT o.OrderID,
       o.CustomerName,          --: The customer's display name.
       o.Total AS OrderTotal,   --: The order total.
       COUNT(*) AS LineCount    --: Lines on the order.
FROM …
```

A `--:` comment describes the select item that ends just before it **on the same line**. The name is found from the
alias (`expr AS Name`, `expr Name`, `Name = expr`) or, for a plain column, the column's name. Quotes are removed
(`[Total]` gives `Total`). A leading `DISTINCT`, `ALL` or `TOP n` is skipped.

These are reported as `MJQ_DOC_TRAILING_AMBIGUOUS` and ignored:

- a `--:` comment on its own line;
- one that does not follow a select-list item;
- one in a nested or later `SELECT` (only the outermost, first select list names the query's fields);
- one after an item with no alias or column name, such as `COUNT(*)`.

### Precedence and warnings

- **A header beats a trailing comment.** Header entries are read first; a second description of the same name
  (case-insensitive) is `MJQ_DOC_DUPLICATE` and ignored.
- **A comment description beats an LLM-written one.** An authored description is never overwritten; the LLM fills
  only what is still empty.
- An `@tag` other than `@param` / `@field` is `MJQ_DOC_UNKNOWN_TAG`. A tag with no name is `MJQ_DOC_MISSING_NAME`. An
  `@param` that names no parameter of the query is `MJQ_DOC_UNKNOWN_PARAMETER`.
- All doc-comment findings are warnings. `DocComments()` reports them.

---

## 10. Branch variants

A template with `{% if %}` blocks renders different SQL, and possibly different output columns, for different
values. `BranchVariants()` returns the parameter assignments to render so that every branch's SQL is seen:

- **Variant 0, the base**: takes the first branch of every `{% if %}` it can.
- **One variant per `{% if %}`**, in source order: makes that block take a different branch, with every block around
  it taking the branch that contains it.

So a template with *n* `{% if %}` blocks needs *n* + 1 renders. Each variant gives every parameter a value:

| Value | Meaning |
|---|---|
| `Sample` | A truthy value of the parameter's type. The caller picks the actual value. |
| `Absent` | No value: the parameter is left out, so it is falsy. Never used for a required parameter. |
| `Literal` | Exactly this value, to satisfy a comparison such as `Mode == 'big'` or `MinTotal > 0`. |

Each variant also carries `Toggle` (which block, from which branch to which), `Overrides` (the values that differ from
the base) and `Satisfiable`. `Satisfiable` is `false` when parameter values alone cannot move the block to another
branch, for example a condition on `loop.first` or a comparison of a `Context` token. Such a variant repeats the base
values.

Conditions are evaluated as Nunjucks would. `<name>.length` of a `Sample` is a whole number of at least 1, so
`X.length > 0` is true and `X.length == 0` false for it, while `X.length > 5` cannot be known; of an `Absent` value it
is `undefined`. An inline if in a condition takes the branch its own condition picks, and a comparison with an inline
if tries the literals compared against each of its branches. An inline if in a hole adds no variant: both branches
write a value at the same place.

**Why:** when MJ extracts a query's output fields, it describes each render with the database and takes the union of
the output columns. Describing one sample render would miss columns that only some branches produce.

---

## 11. Declared metadata rows

A query's metadata may declare its parameters and fields as `MJ: Query Parameters` and `MJ: Query Fields` rows (child
collections of `MJ: Queries`).

- Declared rows keep their IDs, matched to extracted rows by (QueryID, Name).
- **Facts** are always taken from the SQL and the database server, on every row, declared and `Manual` ones
  included: a field's name casing, order, types, nullability, source and computed flag; whether a parameter exists;
  the entities and dependencies.
- **Annotations** are never overwritten when authored (`DetectionMethod` `Manual`, or a non-empty value): descriptions,
  `ComputationDescription`, `IsSummary` / `SummaryDescription`, and a parameter's type, required flag, default,
  sample, validation filters and server-set flag. Doc comments (§9) count as authored.
- An **authored** parameter that is missing from the SQL is kept and flagged on the query (`ExtractionStatus`
  `Warning`); a value passed for it is accepted and ignored.
- An **auto-detected** parameter that is missing from the SQL is deleted.
- Saving a new or edited query applies §12 in `Save` mode: an error refuses the save, with the diagnostics in the
  save's result. So does an output that repeats a column name (compared without case).

---

## 12. Save-time checks reference

Severity is for `Mode: 'Save'` (a new query, or a save that changes its SQL) unless noted. Any other save that
re-extracts a query uses `Mode: 'Refresh'`. **Error** refuses the save. **Warning** is reported. **Info** is a note.

| Code | Severity | Triggered by | Fix |
|---|---|---|---|
| `MJQ_UNCLOSED_TAG` | Error | `{{`, `{%` or `{#` with no closer | Close the tag, or remove the opener. |
| `MJQ_TAG_IN_STRING_LITERAL` | Error | A tag inside a SQL string literal | Put the tag outside the quotes and use a filter (`sqlLikeContains` for `'%…%'`). |
| `MJQ_TAG_IN_QUOTED_IDENTIFIER` | Error | A tag inside `[…]`, `"…"` or `` `…` `` | Use `sqlIdentifier` outside any quotes, or write the identifier out. |
| `MJQ_EXPRESSION_IN_COMMENT` | Info | A template tag mentioned inside a SQL comment: inert, never rendered or analyzed | Write template notes in a `{# #}` comment. |
| `MJQ_UNCLOSED_BLOCK` | Error | An `if` or `for` with no `endif` / `endfor`, or left open when an outer block closes | Close the block. |
| `MJQ_UNEXPECTED_TAG` | Error | `elif`, `else`, `endif` or `endfor` with no block to belong to | Remove the tag, or add its block. |
| `MJQ_SYNTAX` | Error | A tag body that does not parse; blocks nested more than 64 deep | Fix the expression; flatten the conditions. |
| `MJQ_UNSUPPORTED_TAG` | Error | A block tag outside the allow-list; `for … else`; block `set` | Use only if / elif / else / endif, for / endfor, set. |
| `MJQ_FUNCTION_CALL` | Error | A function or method call | Compute in SQL, or pass a parameter. |
| `MJQ_SUBSCRIPT` | Error | `x[0]`, `x['k']` | Pass the value as its own parameter, or loop with `for`. |
| `MJQ_INLINE_IF` | — | No longer reported: the inline if is part of the language. The code is kept and never reused. | — |
| `MJQ_MEMBER_ACCESS` | Error | `x.y` other than `Context.<Token>`, `loop.<member>` and `<name>.length` | Pass the value as its own parameter. |
| `MJQ_UNSUPPORTED_OPERATOR` | Error | `in`, `is`, `~`, `**`, `//`, `===`, `!==`, list or object literals | Use `+ - * / %`, `== != < > <= >=`, `and`, `or`, `not`, parentheses. |
| `MJQ_ARITHMETIC_IN_HOLE` | Error | An operator inside a `{{ }}` hole | Do the arithmetic in SQL around the hole, or in a `{% set %}`. |
| `MJQ_HOLE_NOT_A_VALUE` | Error | A hole that starts from a literal | Write the literal into the SQL. |
| `MJQ_UNKNOWN_FILTER` | Error | A filter that is not an MJ SQL filter or `default` | Use an MJ SQL filter or `default`. |
| `MJQ_DEFAULT_NOT_LITERAL` | Error | `default(…)` with a non-literal or no argument | `default('value')`, `default(10)`, `default(true)`, `default(null)`. |
| `MJQ_LOOP_OUTSIDE_FOR` | Error | `loop` outside a `for` body, or an unknown loop member | Move it into the loop; use a listed member. |
| `MJQ_FOR_ITERABLE` | Error | A `for` that is not `for Item in ArrayParameter`, or whose iterable is declared non-array | Loop over one array parameter with one variable. |
| `MJQ_UNFILTERED_VALUE` | Error | A string, array or date parameter, a loop variable or a `Context` token in a hole with no SQL filter | Add the filter for its type. |
| `MJQ_UNFILTERED_UNTYPED` | Warning | A value with no filter whose type is not known | Add the SQL filter, or declare it number or boolean. |
| `MJQ_UNKNOWN_CONTEXT_TOKEN` | Error | `Context.<Name>` not in the list, or bare `Context` | Use one of the nine tokens. |
| `MJQ_FILTER_TYPE_MISMATCH` | Error; **Warning in Refresh** | The last SQL filter does not format the declared type, or is not on a `Context` token's list | Use the filter for the type. |
| `MJQ_PARAMETER_TYPE_CONFLICT` | Warning | Two uses of one parameter imply different types | Use one type and its filter at every use. |
| `MJQ_COMPOSITION_MALFORMED` | Error | A `{{query:…}}` whose path or arguments do not parse | `{{query:"Category/Path/Name(Arg=Value, …)"}}`, path in double quotes. |
| `MJQ_COMPOSITION_POSITION` | Error | A composition outside a table-source position | `FROM {{query:"…"}} alias` or `JOIN {{query:"…"}} alias ON …`. |
| `MJQ_COMPOSITION_NOT_FOUND` | Error | No query at that full path | Give the full category path and name. |
| `MJQ_COMPOSITION_PARTIAL_PATH` | Error; **Warning in Refresh** | The path is a whole-segment suffix of the target's full path (the resolver returned `FullPath`) | Write the full path the hint names. |
| `MJQ_COMPOSITION_NOT_REUSABLE` | Error | The target is not marked Reusable | Mark it Reusable, or copy its SQL in. |
| `MJQ_COMPOSITION_MISSING_ARGUMENT` | Error | A required target parameter is not passed | Pass it: `(Name=Name)` or `(Name='value')`. |
| `MJQ_COMPOSITION_IMPLICIT_ARGUMENT` | Error; **Warning in Refresh** | An unpassed target parameter named like an outer parameter | Pass it as `(Name=Name)`, or rename one. |
| `MJQ_COMPOSITION_UNKNOWN_ARGUMENT` | Error | An argument the target does not declare | Use one of the target's parameters. |
| `MJQ_COMPOSITION_DUPLICATE_ARGUMENT` | Error | The same argument twice | Pass each argument once. |
| `MJQ_COMPOSITION_CYCLE` | Error | Compositions lead back to a query already being composed | Remove one composition in the loop. |
| `MJQ_COMPOSITION_UNCHECKED` | Info | Compositions present, but no resolver was given | Validate with `ResolveComposition`. |
| `MJQ_DOC_UNKNOWN_TAG` | Warning | An `@tag` other than `@param` / `@field` | Use `@param` or `@field`. |
| `MJQ_DOC_MISSING_NAME` | Warning | `@param` / `@field` with no name | `@param Name description`. |
| `MJQ_DOC_DUPLICATE` | Warning | A second description of one name | Describe each once. |
| `MJQ_DOC_UNKNOWN_PARAMETER` | Warning | `@param` naming no parameter of the query | Fix the name, or remove it. |
| `MJQ_DOC_TRAILING_AMBIGUOUS` | Warning | A `--:` comment not attachable to exactly one outer select item | Put it at the end of an aliased item's line, or use `@field`. |

Where they come from: lexing, structure and expression-syntax codes (and `MJQ_COMPOSITION_MALFORMED`) are in
`QueryTemplate.Diagnostics`; `Validate()` returns those plus the value, type, parameter and composition codes;
`DocComments()` returns the `MJQ_DOC_*` codes.

### Running a saved query

Before a saved query is rendered, it is validated in `Refresh` mode (without a composition resolver). These errors
are authoring rules that a query saved before the language existed may rely on, so they never stop a run:
`MJQ_TAG_IN_STRING_LITERAL`, `MJQ_TAG_IN_QUOTED_IDENTIFIER`, `MJQ_UNFILTERED_VALUE`, `MJQ_UNFILTERED_UNTYPED`,
`MJQ_ARITHMETIC_IN_HOLE`, `MJQ_HOLE_NOT_A_VALUE`, `MJQ_DEFAULT_NOT_LITERAL`, `MJQ_FOR_ITERABLE`,
`MJQ_FILTER_TYPE_MISMATCH`, `MJQ_PARAMETER_TYPE_CONFLICT` and `MJQ_COMPOSITION_POSITION`. Every other error refuses
the run, so a construct outside the language (an unsupported tag, a function call, attribute access other than
`.length`, a subscript, an unknown filter, a malformed tag) never reaches Nunjucks.

### Error examples: bad, then good

```sql
-- MJQ_UNCLOSED_TAG
WHERE Region = {{ Region | sqlString
WHERE Region = {{ Region | sqlString }}

-- MJQ_TAG_IN_STRING_LITERAL
WHERE Name LIKE '%{{ Search }}%'
WHERE Name LIKE {{ Search | sqlLikeContains }}

-- MJQ_TAG_IN_QUOTED_IDENTIFIER
SELECT [{{ Column }}] FROM dbo.Orders
SELECT {{ Column | sqlIdentifier }} FROM dbo.Orders

-- MJQ_UNCLOSED_BLOCK
{% if Search %} AND Name LIKE {{ Search | sqlLikeContains }}
{% if Search %} AND Name LIKE {{ Search | sqlLikeContains }} {% endif %}

-- MJQ_UNEXPECTED_TAG
WHERE 1 = 1 {% endif %}
WHERE 1 = 1

-- MJQ_SYNTAX
{% if !Active %}…{% endif %}
{% if not Active %}…{% endif %}

-- MJQ_UNSUPPORTED_TAG
{% include "Common/Filters" %}
FROM {{query:"Common/Filters"}} f

-- MJQ_FUNCTION_CALL
{{ upper(Name) | sqlString }}
UPPER({{ Name | sqlString }})

-- MJQ_SUBSCRIPT
{{ Regions[0] | sqlString }}
{{ FirstRegion | sqlString }}

-- MJQ_MEMBER_ACCESS
{{ Filter.Region | sqlString }}
{{ Region | sqlString }}
{% if Regions.size > 0 %}…{% endif %}
{% if Regions and Regions.length > 0 %}…{% endif %}

-- MJQ_UNSUPPORTED_OPERATOR
{% if Status in ['Open', 'Held'] %}…{% endif %}
{% if Status == 'Open' or Status == 'Held' %}…{% endif %}

-- MJQ_ARITHMETIC_IN_HOLE
WHERE FiscalYear = {{ Year - 1 | sqlNumber }}
WHERE FiscalYear = {{ Year | sqlNumber }} - 1

-- MJQ_HOLE_NOT_A_VALUE
WHERE Status = {{ 'Open' | sqlString }}
WHERE Status = 'Open'

-- MJQ_UNKNOWN_FILTER
WHERE Name = {{ Name | safe }}
WHERE Name = {{ Name | sqlString }}

-- MJQ_DEFAULT_NOT_LITERAL
{{ Region | default(HomeRegion) | sqlString }}
{{ Region | default('WEST') | sqlString }}

-- MJQ_LOOP_OUTSIDE_FOR
WHERE Rank = {{ loop.index }}
{% for T in Tags %} … {{ loop.index }} … {% endfor %}

-- MJQ_FOR_ITERABLE
{% for Code, Label in Pairs %}…{% endfor %}
{% for Code in Codes %}…{% endfor %}

-- MJQ_UNFILTERED_VALUE  (Name declared string; with no known type it is the warning MJQ_UNFILTERED_UNTYPED)
WHERE Name = {{ Name }}
WHERE Name = {{ Name | sqlString }}

-- MJQ_UNKNOWN_CONTEXT_TOKEN
WHERE TenantID = {{ Context.TenantID | sqlString }}
WHERE TenantID = {{ TenantID | sqlString }}     -- a parameter, declared IsServerSet if the server sets it

-- MJQ_FILTER_TYPE_MISMATCH  (MinTotal declared number)
WHERE Total >= {{ MinTotal | sqlString }}
WHERE Total >= {{ MinTotal | sqlNumber }}

-- MJQ_COMPOSITION_MALFORMED
FROM {{query:Sales/Active Customers}} c
FROM {{query:"Sales/Active Customers"}} c

-- MJQ_COMPOSITION_POSITION
WHERE ID IN {{query:"Sales/Active Customer IDs"}}
WHERE ID IN (SELECT ID FROM {{query:"Sales/Active Customer IDs"}} a)

-- MJQ_COMPOSITION_NOT_FOUND
FROM {{query:"Active Customers"}} c
FROM {{query:"Sales/Reports/Active Customers"}} c

-- MJQ_COMPOSITION_NOT_REUSABLE
FROM {{query:"Sales/Scratch/Draft"}} d                  -- Draft is not Reusable
FROM {{query:"Sales/Reports/Approved"}} d               -- a Reusable query

-- MJQ_COMPOSITION_MISSING_ARGUMENT  (Region required by the target)
FROM {{query:"Sales/Active Customers"}} c
FROM {{query:"Sales/Active Customers(Region=Region)"}} c

-- MJQ_COMPOSITION_IMPLICIT_ARGUMENT  (both queries have an optional Since)
FROM {{query:"Sales/Active Customers(Region=Region)"}} c
FROM {{query:"Sales/Active Customers(Region=Region, Since=Since)"}} c

-- MJQ_COMPOSITION_UNKNOWN_ARGUMENT
FROM {{query:"Sales/Active Customers(Region=Region, Zone=3)"}} c
FROM {{query:"Sales/Active Customers(Region=Region)"}} c

-- MJQ_COMPOSITION_DUPLICATE_ARGUMENT
FROM {{query:"Sales/Active Customers(Region='W', region='E')"}} c
FROM {{query:"Sales/Active Customers(Region='W')"}} c

-- MJQ_COMPOSITION_CYCLE  (saving Sales/Me; Sales/A composes Sales/B, which composes Sales/Me)
FROM {{query:"Sales/A"}} a
FROM dbo.Orders a                                        -- break the loop
```

---

## 13. Validating from code

```ts
import { QueryTemplate, MJQueryDiagnosticCodes, MatchCompositionPath } from '@memberjunction/sql-parser';
import { GetQueryDialect } from '@memberjunction/sql-dialect';

const template = QueryTemplate.Parse(sqlText, GetQueryDialect('sqlserver'));

const check = template.Validate({
    Mode: 'Save',                                   // or 'Refresh' for a query already saved
    DeclaredParameters: [
        { Name: 'Region', Type: 'string' },
        { Name: 'TenantID', Type: 'string', IsServerSet: true },
    ],
    QueryPath: 'Sales/Reports/Regional Orders',     // this query's full path, for cycle detection
    ResolveComposition: fullPath => {
        const match = MatchCompositionPath(categoryPathOf(fullPath), nameOf(fullPath), allQueries);
        if (match.Kind !== 'Exact' && match.Kind !== 'PartialPath') return null;
        const query = match.Target;
        return {
            Exists: true,
            FullPath: match.Kind === 'PartialPath' ? match.FullPath : undefined, // reports a partial path
            Reusable: query.Reusable,
            Parameters: query.Parameters.map(p => ({ Name: p.Name, IsRequired: p.IsRequired })),
            Compositions: query.ComposedPaths,      // optional: full paths it composes, for cycles
        };
    },
});

if (!check.Value.IsValid) {
    for (const d of check.Diagnostics.filter(d => d.Severity === 'Error')) {
        console.log(`${d.Code} at ${d.Span.Start}: ${d.Message} ${d.FixHint ?? ''}`);
    }
}
```

| Option | Default | Effect |
|---|---|---|
| `Mode` | `'Save'` | `'Refresh'` makes `MJQ_FILTER_TYPE_MISMATCH`, `MJQ_COMPOSITION_IMPLICIT_ARGUMENT` and `MJQ_COMPOSITION_PARTIAL_PATH` warnings. |
| `DeclaredParameters` | none | `{ Name, Type, IsServerSet? }` from the query's metadata. `Type` drives the filter-fit and unfiltered rules and the `for` iterable check; `IsServerSet` lets a value go unfiltered. Their names also count as outer names for `MJQ_COMPOSITION_IMPLICIT_ARGUMENT`. |
| `KnownParameterTypes` | none | `{ Name, Type }` for parameters the metadata does not declare, such as detected parameter rows. Used only by the unfiltered-value rule, after `DeclaredParameters` and the inferred type; never by the filter-fit or `for` iterable rules. |
| `ContextTokens` | the nine tokens | The allowed `Context` tokens. |
| `ResolveComposition` | none | `(fullPath) => { Exists, Reusable, Parameters: [{ Name, IsRequired }], FullPath?, Compositions? } \| null`; `FullPath` is the target's own full path when it was found by a partial path. Without it, targets are not checked, `MJQ_COMPOSITION_UNCHECKED` is reported, and the result is not `Complete`. Position and duplicate-argument checks run either way. |
| `QueryPath` | none | The full path of the query being validated, so a composition that leads back to it is a cycle. |

The result is `{ Value: { IsValid, ErrorCount, WarningCount }, Complete, Diagnostics }`. Each diagnostic has `Code`,
`Severity`, `Span` (UTF-16 offsets into the text, end exclusive), `Message` and `FixHint`.

---

## 14. Worked example

```sql
{#
  Orders for one region and year, with optional filters.
  @param {string} Region The sales region code, such as 'WEST'.
  @param {number} Year The order year.
  @param {date} StartDate Only orders on or after this date.
  @param {array} Statuses Order statuses to include.
  @param {string} Search Text to find in the customer name.
  @param {number} MinTotal The smallest order total to include
         when no search text is given.
  @param {array} Tags Order tags; an order matches if it has any of them.
  @field OrderID The order's ID.
#}
{% set PriorYear = Year - 1 %}
SELECT o.OrderID,
       o.CustomerName,                --: The customer's display name.
       o.Total AS OrderTotal,         --: The order total in the order's currency.
       {{ PriorYear }} AS TargetYear,
       t.TargetAmount
FROM dbo.Orders o
JOIN {{query:"Sales/Targets/Regional Targets(Region=Region, Year=Year - 1)"}} t
  ON t.Region = o.Region
WHERE o.Region = {{ Region | sqlString }}
  AND YEAR(o.OrderDate) = {{ Year | sqlNumber }}
  AND o.OrderDate >= {{ StartDate | default('2020-01-01') | sqlDate }}
  AND o.OwnerUserID = {{ Context.UserID | sqlString }}
{%- if Statuses %}
  AND o.Status IN {{ Statuses | sqlIn }}
{%- endif %}
{%- if Search %}
  AND o.CustomerName LIKE {{ Search | sqlLikeContains }}
{%- elif MinTotal > 0 %}
  AND o.Total >= {{ MinTotal | sqlNumber }}
{%- endif %}
{%- if Tags %}
  AND o.OrderID IN (
    SELECT ot.OrderID FROM dbo.OrderTags ot WHERE
    {%- for Tag in Tags %}
      {% if not loop.first %}OR {% endif %}ot.Tag = {{ Tag | sqlString }}
    {%- endfor %}
  )
{%- endif %}
ORDER BY o.OrderDate DESC
```

What it uses: a doc-comment header with a summary and a continuation line, trailing `--:` descriptions, a numeric
`{% set %}` written unfiltered, a composition with a pass-through and an arithmetic argument, `default`, a `Context`
token, `if` / `elif`, a `for` loop with `loop.first`, and whitespace control.

`Parameters()` reports, in order of first use (`PriorYear`, `Tag`, `loop` and `Context.UserID` are not parameters):

| Name | InferredType | IsRequired | DefaultValue | Filters | Why |
|---|---|---|---|---|---|
| `Year` | number | true | null | `sqlNumber` | Used outside every `if` (the `set`, the composition argument, a hole). |
| `Region` | string | true | null | `sqlString` | Used outside every `if`. |
| `StartDate` | date | false | `'2020-01-01'` | `default`, `sqlDate` | Its only use has `default`. |
| `Statuses` | array | false | null | `sqlIn` | Used only in an `if` condition and body. |
| `Search` | string | false | null | `sqlLikeContains` | Only inside an `if`. |
| `MinTotal` | number | false | null | `sqlNumber` | Only in an `elif` condition and body. |
| `Tags` | array | false | null | (none) | The loop iterable, inside an `if`. |

`DocComments()` reports the summary "Orders for one region and year, with optional filters.", the seven `@param`
descriptions (with types), and three fields: `OrderID` (header), `CustomerName` and `OrderTotal` (trailing).

`BranchVariants()` returns five variants for the four `{% if %}` blocks:

| Variant | Toggles | Overrides from the base | Satisfiable |
|---|---|---|---|
| 0 (base) | | every parameter `Sample` | true |
| 1 | `if Statuses` to its else | `Statuses: Absent` | true |
| 2 | `if Search` to the `elif` | `Search: Absent`, `MinTotal: Literal 1` | true |
| 3 | `if Tags` to its else | `Tags: Absent` | true |
| 4 | `if not loop.first` | none | false (the condition reads a loop value) |

With a resolver that reports `Sales/Targets/Regional Targets` as Reusable with required `Region` and `Year`,
`Validate({ Mode: 'Save', ResolveComposition })` finds no errors. If that target also had an optional `Search`
parameter, the save would be refused with `MJQ_COMPOSITION_IMPLICIT_ARGUMENT` until the composition passes
`Search=Search` (or the parameter is renamed).
