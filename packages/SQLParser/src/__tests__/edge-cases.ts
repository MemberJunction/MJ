/**
 * Edge Case SQL Strings for MJ SQL Parser Testing
 *
 * Each export is a SQL string constant with a comment describing:
 * 1. What makes it an edge case
 * 2. Expected tokenization/parsing behavior
 *
 * Categories:
 * - EXPR_*   — Nunjucks expression edge cases
 * - COND_*   — Conditional block edge cases
 * - COMP_*   — Composition token edge cases
 * - SQL_*    — SQL structure edge cases
 * - MIXED_*  — Mixed/combined edge cases
 */

// ═══════════════════════════════════════════════════════════════
// Nunjucks Expression Edge Cases
// ═══════════════════════════════════════════════════════════════

/**
 * Expression INSIDE SQL single quotes — the {{ }} appears within a string literal
 * context from SQL's perspective. The lexer should still detect it as MJ_TEMPLATE_EXPR
 * because it scans character-by-character without SQL context awareness.
 * Expected: 3 tokens — SQL_TEXT ("WHERE Name = '"), MJ_TEMPLATE_EXPR, SQL_TEXT ("'")
 */
export const EXPR_INSIDE_QUOTES = `WHERE Name = '{{ Name }}'`;

/**
 * Expression with zero whitespace around variable and filter.
 * Expected: MJ_TEMPLATE_EXPR with variable "var" and filter "sqlNumber"
 */
export const EXPR_NO_SPACES = `WHERE x = {{var|sqlNumber}}`;

/**
 * Expression with excessive whitespace around variable, pipes, and filter.
 * Expected: MJ_TEMPLATE_EXPR with variable "var", filter "sqlString" (whitespace trimmed)
 */
export const EXPR_LOTS_OF_SPACES = `WHERE x = {{  var  |  sqlString  }}`;

/**
 * Multi-filter chain with a default that has a string argument, then sqlString.
 * Tests that pipe-splitting respects quoted strings inside parentheses.
 * Expected: variable "val", filters: [default('N/A'), sqlString]
 */
export const EXPR_MULTI_FILTER_CHAIN = `WHERE x = {{ val | default('N/A') | sqlString }}`;

/**
 * Variable with dot notation (e.g., object property access).
 * Expected: MJ_TEMPLATE_EXPR with variable "user.name" and filter "sqlString"
 */
export const EXPR_DOTTED_VARIABLE = `WHERE Name = {{ user.name | sqlString }}`;

/**
 * Two template expressions used in arithmetic, separated by a SQL minus operator.
 * Expected: 5 tokens — SQL_TEXT, MJ_TEMPLATE_EXPR(CurrentYear), SQL_TEXT(" - "),
 *           MJ_TEMPLATE_EXPR(LookbackYears), (optional trailing SQL_TEXT)
 */
export const EXPR_ARITHMETIC = `WHERE Year > {{ CurrentYear }} - {{ LookbackYears }}`;

/**
 * Expression inside a SQL line comment. The lexer has no SQL comment awareness,
 * so it will still detect the {{ }} as a template expression.
 * Expected: SQL_TEXT("-- "), MJ_TEMPLATE_EXPR(this_is_a_comment), SQL_TEXT(newline + rest)
 */
export const EXPR_IN_SQL_COMMENT = `SELECT 1
-- {{ this_is_a_comment }}
FROM t`;

/**
 * Expression inside a SQL string literal context (SELECT 'literal value').
 * The lexer does not track SQL string literal state, so it detects the expression.
 * Expected: SQL_TEXT("SELECT '"), MJ_TEMPLATE_EXPR(literal), SQL_TEXT("' AS Val")
 */
export const EXPR_IN_STRING_LITERAL = `SELECT '{{ literal }}' AS Val`;

/**
 * Expression with no variable, just a filter (unusual but syntactically valid Nunjucks).
 * Expected: MJ_TEMPLATE_EXPR with variable "" and filter "sqlString"
 * (after trimming, pipe-split produces empty first part)
 */
export const EXPR_EMPTY_VARIABLE_WITH_FILTER = `WHERE x = {{ | sqlString }}`;

/**
 * Two expressions adjacent with no space between closing and opening braces.
 * The lexer finds }} first, so {{A}} is one token, {{B}} is another.
 * Expected: 2 MJ_TEMPLATE_EXPR tokens
 */
export const EXPR_ADJACENT_NO_SPACE = `{{A}}{{B}}`;

/**
 * Filter with multiple arguments including a number and a string.
 * Tests parseFilterArgs splitting on comma.
 * Expected: filter "custom" with args ['fallback', 42]
 */
export const EXPR_FILTER_MULTI_ARGS = `{{ val | custom('fallback', 42) }}`;

/**
 * Expression where the variable name matches a SQL keyword.
 * Expected: MJ_TEMPLATE_EXPR with variable "SELECT", filter "sqlString"
 */
export const EXPR_SQL_KEYWORD_VARIABLE = `WHERE x = {{ SELECT | sqlString }}`;

/**
 * Expression with double-quoted string argument in the default filter.
 * Tests that parseFilterArgs handles double quotes.
 * Expected: filter "default" with args ["N/A"]
 */
export const EXPR_DOUBLE_QUOTED_ARG = `{{ val | default("N/A") | sqlString }}`;

/**
 * Expression at the very start and very end of the string, with SQL in between.
 * Tests boundary detection at both extremes.
 * Expected: MJ_TEMPLATE_EXPR, SQL_TEXT(" FROM "), MJ_TEMPLATE_EXPR
 */
export const EXPR_BOOKEND = `{{ TableName | sqlIdentifier }} FROM {{ Schema | sqlIdentifier }}`;

// ═══════════════════════════════════════════════════════════════
// Conditional Block Edge Cases
// ═══════════════════════════════════════════════════════════════

/**
 * Three-level deep nesting of conditionals.
 * Expected: 3 MJ_IF_OPEN tokens, 3 MJ_ENDIF tokens; extractConditionalBlocks returns 3 blocks
 */
export const COND_DEEPLY_NESTED = `SELECT *
FROM t
{% if A %}
  {% if B %}
    {% if C %}
      AND x = 1
    {% endif %}
  {% endif %}
{% endif %}`;

/**
 * Conditional that changes SQL structure keyword (WHERE vs AND).
 * Expected: MJ_IF_OPEN, SQL_TEXT("WHERE"), MJ_ELSE, SQL_TEXT("AND"), MJ_ENDIF
 */
export const COND_CHANGES_SQL_STRUCTURE = `{% if HasWhere %}WHERE{% else %}AND{% endif %} Status = 'Active'`;

/**
 * Conditional wrapping an entire SELECT column, changing which column is selected.
 * Expected: tokens correctly parsed; reconstructed SQL matches original
 */
export const COND_WRAPPING_COLUMN = `SELECT
  ID,
  {% if ShowEmail %}Email{% else %}Phone{% endif %} AS ContactInfo
FROM Users`;

/**
 * Conditional with complex multi-part expression including operators and string literals.
 * Expected: MJ_IF_OPEN with expression 'x != "" and y != ""'
 */
export const COND_COMPLEX_EXPRESSION = `{% if x != "" and y != "" %}AND x = {{ x | sqlString }}{% endif %}`;

/**
 * Conditional with completely empty body.
 * Expected: MJ_IF_OPEN, MJ_ENDIF with no SQL_TEXT tokens between them
 */
export const COND_EMPTY_BODY = `SELECT 1{% if A %}{% endif %} FROM t`;

/**
 * Conditional with only whitespace in the body.
 * Expected: MJ_IF_OPEN, SQL_TEXT("   "), MJ_ENDIF
 */
export const COND_WHITESPACE_BODY = `SELECT 1{% if A %}   {% endif %} FROM t`;

/**
 * Long elif chain with 4 branches plus else.
 * Expected: 1 MJ_IF_OPEN, 3 MJ_ELIF, 1 MJ_ELSE, 1 MJ_ENDIF
 */
export const COND_LONG_ELIF_CHAIN = `{% if Status == 'active' %}Active
{% elif Status == 'pending' %}Pending
{% elif Status == 'suspended' %}Suspended
{% elif Status == 'cancelled' %}Cancelled
{% else %}Unknown
{% endif %}`;

/**
 * Conditional around ORDER BY clause. This is a common pattern for CTEs
 * where ORDER BY is optional.
 * Expected: standard conditional tokens wrapping ORDER BY SQL text
 */
export const COND_AROUND_ORDER_BY = `SELECT * FROM t
{% if SortColumn %}
ORDER BY {{ SortColumn | sqlIdentifier }} {{ SortDir | sqlIdentifier }}
{% endif %}`;

/**
 * Conditional around GROUP BY clause.
 * Expected: conditional tokens wrapping GROUP BY SQL text
 */
export const COND_AROUND_GROUP_BY = `SELECT Category, COUNT(*) AS Cnt
FROM Products
{% if GroupByCategory %}
GROUP BY Category
{% endif %}`;

/**
 * Conditional around entire JOIN clause.
 * Expected: conditional tokens wrapping the full LEFT JOIN SQL text + template
 */
export const COND_AROUND_JOIN = `SELECT o.ID, o.Total
FROM Orders o
{% if IncludeCustomer %}
LEFT JOIN Customers c ON c.ID = o.CustomerID
{% endif %}
WHERE o.Total > {{ MinTotal | sqlNumber }}`;

/**
 * Conditional where the if-condition checks for truthiness of a variable
 * and the body uses that same variable with a filter.
 * Tests that parameter extraction correctly marks this as optional.
 * Expected: Region is optional (only inside conditional)
 */
export const COND_GUARD_THEN_USE = `SELECT * FROM t
{% if Region %}
WHERE Region = {{ Region | sqlString }}
{% endif %}`;

// ═══════════════════════════════════════════════════════════════
// Composition Token Edge Cases
// ═══════════════════════════════════════════════════════════════

/**
 * Composition reference with no parameters.
 * Expected: MJ_COMPOSITION_REF with queryName "Query", categoryPath "Simple", params []
 */
export const COMP_NO_PARAMS = `SELECT * FROM {{query:"Simple/Query"}} q`;

/**
 * Composition reference where a parameter value is itself a Nunjucks expression.
 * The inner {{ }} is NOT a separate token because it's inside the outer {{ }}.
 * Expected: single MJ_COMPOSITION_REF token; parameter value contains "{{StartDate}}"
 */
export const COMP_NESTED_NUNJUCKS_PARAM = `SELECT * FROM {{query:"Path/Q(startDate={{StartDate}})"}} q`;

/**
 * Two composition references in the same query (a JOIN between two composed queries).
 * Expected: 2 MJ_COMPOSITION_REF tokens
 */
export const COMP_MULTIPLE_REFS = `SELECT a.ID, b.Name
FROM {{query:"Analytics/RevenueByMonth"}} a
INNER JOIN {{query:"Analytics/MemberCounts"}} b ON a.Month = b.Month`;

/**
 * Composition reference used as a subquery in a WHERE IN clause.
 * Expected: MJ_COMPOSITION_REF detected; placeholder creates valid subquery structure
 */
export const COMP_AS_SUBQUERY = `SELECT *
FROM Orders
WHERE CustomerID IN (SELECT ID FROM {{query:"Customers/Active"}})`;

/**
 * Composition reference with special characters in the path (hyphens, spaces, slashes).
 * Expected: categoryPath "Golden-Queries/Revenue Analysis", queryName "Top 10"
 */
export const COMP_SPECIAL_CHARS_PATH = `SELECT * FROM {{query:"Golden-Queries/Revenue Analysis/Top 10"}} t`;

/**
 * Composition reference with many parameters.
 * Expected: MJ_COMPOSITION_REF with 4 parameters, mix of pass-through and literal
 */
export const COMP_MANY_PARAMS = `SELECT * FROM {{query:"Reports/DetailedSummary(year=Year, region='West', limit=MaxRows, status='Active')"}} r`;

/**
 * Composition reference with empty quoted path (degenerate but parseable).
 * Expected: MJ_COMPOSITION_REF with categoryPath "" and queryName ""
 */
export const COMP_EMPTY_PATH = `FROM {{query:""}} t`;

// ═══════════════════════════════════════════════════════════════
// SQL Structure Edge Cases
// ═══════════════════════════════════════════════════════════════

/**
 * UNION ALL where both branches have template expressions.
 * Expected: multiple SQL_TEXT + MJ_TEMPLATE_EXPR tokens; round-trip preserves original
 */
export const SQL_UNION_WITH_TEMPLATES = `SELECT Name, 'Member' AS Source
FROM Members
WHERE JoinYear = {{ Year | sqlNumber }}
UNION ALL
SELECT Name, 'Prospect' AS Source
FROM Prospects
WHERE ContactYear = {{ Year | sqlNumber }}`;

/**
 * Multiple CTEs where the second CTE contains a template expression.
 * Expected: tokens correctly span across CTE boundaries
 */
export const SQL_MULTIPLE_CTES_WITH_TEMPLATES = `WITH ActiveMembers AS (
    SELECT ID, Name FROM Members WHERE Status = 'Active'
),
FilteredMembers AS (
    SELECT ID, Name FROM ActiveMembers
    WHERE Name LIKE {{ NamePattern | sqlString }}
)
SELECT * FROM FilteredMembers`;

/**
 * DECLARE + SET with a template variable providing the value.
 * Tests that multi-statement SQL with MJ tokens works correctly.
 * Expected: MJ_TEMPLATE_EXPR tokens in both statements; placeholder substitution
 *           produces two clean SQL statements
 */
export const SQL_DECLARE_SET_TEMPLATE = `DECLARE @threshold INT;
SET @threshold = {{ Threshold | sqlNumber }};
SELECT * FROM Sales WHERE Amount > @threshold`;

/**
 * CROSS APPLY with a template expression inside the applied function.
 * Expected: template expression detected inside CROSS APPLY context
 */
export const SQL_CROSS_APPLY_TEMPLATE = `SELECT e.Name, ca.Value
FROM Employees e
CROSS APPLY (
    SELECT TOP {{ TopN | sqlNumber }} Value
    FROM EmployeeMetrics em
    WHERE em.EmployeeID = e.ID
    ORDER BY Value DESC
) ca`;

/**
 * Window function with a template expression in the PARTITION BY clause.
 * Expected: MJ_TEMPLATE_EXPR detected within window function syntax
 */
export const SQL_WINDOW_FUNCTION_TEMPLATE = `SELECT
    Name,
    ROW_NUMBER() OVER (PARTITION BY {{ GroupCol | sqlIdentifier }} ORDER BY Score DESC) AS RowNum
FROM Students`;

/**
 * Subquery in SELECT list containing a template expression.
 * Expected: template expression correctly tokenized within scalar subquery
 */
export const SQL_SUBQUERY_IN_SELECT = `SELECT
    m.Name,
    (SELECT COUNT(*) FROM Orders o WHERE o.MemberID = m.ID AND o.Year = {{ Year | sqlNumber }}) AS OrderCount
FROM Members m`;

/**
 * CASE WHEN with template expression in the condition.
 * Expected: MJ_TEMPLATE_EXPR detected inside CASE WHEN
 */
export const SQL_CASE_WHEN_TEMPLATE = `SELECT
    Name,
    CASE WHEN Status = {{ TargetStatus | sqlString }} THEN 'Match' ELSE 'No Match' END AS StatusCheck
FROM Users`;

/**
 * SQL with both line comments (--) and block comments near template tokens.
 * The lexer should detect MJ tokens regardless of SQL comment context.
 * Expected: MJ_TEMPLATE_EXPR on line after comment; block comment does not hide the expression
 */
export const SQL_COMMENTS_NEAR_TOKENS = `SELECT *
-- Filter by year below
FROM t
/* This is a block comment {{ not_a_real_var }} */
WHERE Year = {{ Year | sqlNumber }}`;

/**
 * Completely empty SQL string.
 * Expected: Tokenize returns [], Parse returns hasMJExtensions: false
 */
export const SQL_EMPTY = ``;

/**
 * SQL with ONLY MJ tokens and no actual SQL keywords.
 * Expected: all tokens are MJ types, no SQL_TEXT (or only whitespace SQL_TEXT)
 */
export const SQL_ONLY_MJ_TOKENS = `{{ A | sqlNumber }}{% if B %}{{ C | sqlString }}{% endif %}`;

/**
 * PIVOT with template expression providing the pivot column list.
 * Expected: MJ_TEMPLATE_EXPR inside PIVOT syntax; placeholder substitution
 */
export const SQL_PIVOT_TEMPLATE = `SELECT *
FROM (
    SELECT Year, Category, Amount
    FROM Sales
) src
PIVOT (
    SUM(Amount)
    FOR Category IN ({{ CategoryList | sqlNoKeywordsExpression }})
) pvt`;

/**
 * Very long SQL with many template expressions spread throughout.
 * Tests that the lexer handles large input without issues.
 * Expected: 10 MJ_TEMPLATE_EXPR tokens; round-trip preserves original
 */
export const SQL_LONG_MANY_TEMPLATES = `WITH
CTE1 AS (
    SELECT ID, Name FROM Table1 WHERE Col1 = {{ P1 | sqlString }}
),
CTE2 AS (
    SELECT ID, Value FROM Table2 WHERE Col2 = {{ P2 | sqlNumber }}
),
CTE3 AS (
    SELECT ID, Score FROM Table3 WHERE Col3 > {{ P3 | sqlNumber }}
)
SELECT
    c1.Name,
    c2.Value,
    c3.Score,
    (SELECT MAX(Amount) FROM Totals WHERE Year = {{ P4 | sqlNumber }}) AS MaxAmount
FROM CTE1 c1
INNER JOIN CTE2 c2 ON c2.ID = c1.ID
LEFT JOIN CTE3 c3 ON c3.ID = c1.ID
WHERE c1.Name LIKE {{ P5 | sqlString }}
  AND c2.Value BETWEEN {{ P6 | sqlNumber }} AND {{ P7 | sqlNumber }}
  AND c3.Score IS NOT NULL
ORDER BY {{ P8 | sqlIdentifier }}
OFFSET {{ P9 | sqlNumber }} ROWS
FETCH NEXT {{ P10 | sqlNumber }} ROWS ONLY`;

// ═══════════════════════════════════════════════════════════════
// Mixed / Combined Edge Cases
// ═══════════════════════════════════════════════════════════════

/**
 * Composition reference inside a conditional block.
 * If the condition is false at render time, the entire composition is skipped.
 * Expected: MJ_IF_OPEN, MJ_COMPOSITION_REF inside the branch, MJ_ENDIF
 */
export const MIXED_COMP_IN_CONDITIONAL = `SELECT o.ID
FROM Orders o
{% if IncludeRevenue %}
INNER JOIN {{query:"Finance/MonthlyRevenue(year=Year)"}} r ON r.OrderID = o.ID
{% endif %}`;

/**
 * Template comment {# #} immediately adjacent to a template expression {{ }}.
 * Tests that the lexer correctly separates the two tokens.
 * Expected: MJ_COMMENT, MJ_TEMPLATE_EXPR as separate tokens
 */
export const MIXED_COMMENT_ADJACENT_EXPR = `SELECT * FROM t WHERE x = {# filter hint #}{{ x | sqlString }}`;

/**
 * Set block followed by an expression that uses the set variable.
 * Expected: MJ_SET token, then MJ_TEMPLATE_EXPR referencing the set variable name
 */
export const MIXED_SET_THEN_USE = `{% set currentYear = 2024 %}
SELECT * FROM t WHERE Year = {{ currentYear | sqlNumber }}`;

/**
 * For loop generating UNION ALL SQL fragments.
 * Expected: MJ_FOR_OPEN, SQL_TEXT + MJ_TEMPLATE_EXPR per iteration template, MJ_ENDFOR
 */
export const MIXED_FOR_LOOP_UNION = `{% for table in tables %}
SELECT * FROM {{ table | sqlIdentifier }}
{% if not loop.last %}UNION ALL{% endif %}
{% endfor %}`;

/**
 * Conditional around entire WITH clause — if no CTE is needed, skip it entirely.
 * Expected: conditional tokens wrapping the WITH/CTE SQL text
 */
export const MIXED_CONDITIONAL_WITH_CLAUSE = `{% if NeedsCTE %}
WITH Filtered AS (
    SELECT * FROM Source WHERE Status = {{ Status | sqlString }}
)
{% endif %}
SELECT * FROM {% if NeedsCTE %}Filtered{% else %}Source{% endif %}`;

/**
 * Template expression where the variable contains underscores and numbers.
 * Expected: MJ_TEMPLATE_EXPR with variable "field_2_name"
 */
export const MIXED_UNDERSCORE_VAR = `WHERE col = {{ field_2_name | sqlString }}`;

/**
 * Multiple set blocks followed by a query using all set variables.
 * Expected: 3 MJ_SET tokens, then SQL with MJ_TEMPLATE_EXPR tokens
 */
export const MIXED_MULTIPLE_SETS = `{% set startYear = 2020 %}
{% set endYear = 2024 %}
{% set region = 'West' %}
SELECT * FROM Sales
WHERE Year BETWEEN {{ startYear | sqlNumber }} AND {{ endYear | sqlNumber }}
  AND Region = {{ region | sqlString }}`;

/**
 * For loop with conditional inside it.
 * Tests that the lexer handles interleaved for and if blocks.
 * Expected: MJ_FOR_OPEN, MJ_IF_OPEN, ..., MJ_ENDIF, MJ_ENDFOR
 */
export const MIXED_FOR_WITH_CONDITIONAL = `{% for col in columns %}
  {% if not loop.first %}, {% endif %}
  {{ col | sqlIdentifier }}
{% endfor %}`;

/**
 * Triple braces {{{ }}} — the lexer sees {{ first, then finds }} inside, producing
 * a template expression with content starting with the extra {. Edge case for
 * delimiter scanning.
 * Expected: MJ_TEMPLATE_EXPR with raw "{{{ x }}}" and some remaining "}" as SQL_TEXT
 */
export const MIXED_TRIPLE_BRACES = `SELECT {{{ x }}} FROM t`;

/**
 * Nunjucks expression immediately followed by SQL semicolon and another statement.
 * Tests that multi-statement SQL with expressions at statement boundaries works.
 * Expected: MJ_TEMPLATE_EXPR followed by SQL_TEXT containing ";\nSELECT..."
 */
export const MIXED_EXPR_AT_STATEMENT_BOUNDARY = `SELECT * FROM t1 WHERE x = {{ Val | sqlNumber }};
SELECT * FROM t2 WHERE y = {{ Val | sqlNumber }}`;

/**
 * Block comment delimiters {# #} with nested braces inside the comment text.
 * Tests that the lexer correctly finds the #} end delimiter.
 * Expected: single MJ_COMMENT token with text containing braces
 */
export const MIXED_COMMENT_WITH_BRACES = `SELECT 1 {# This comment has {{ braces }} and {% tags %} inside #} FROM t`;

/**
 * Expression with pipe character inside a quoted filter argument.
 * Tests that splitPipes respects quoted strings.
 * Expected: variable "x", filters: [default('a|b'), sqlString]
 */
export const MIXED_PIPE_IN_QUOTED_ARG = `{{ x | default('a|b') | sqlString }}`;

/**
 * Conditional with negation operator.
 * Expected: MJ_IF_OPEN with expression 'not HideResults'
 */
export const COND_NEGATION = `{% if not HideResults %}
SELECT * FROM Results
{% endif %}`;

/**
 * Template expression used as a table alias (unusual but valid MJ pattern).
 * Expected: MJ_TEMPLATE_EXPR for the alias; placeholder substitution creates identifier
 */
export const EXPR_AS_TABLE_ALIAS = `SELECT * FROM LongTableName {{ Alias | sqlIdentifier }}`;

/**
 * Composition reference with single-segment path (no category, just query name).
 * Expected: categoryPath "", queryName "SimpleQuery"
 */
export const COMP_SINGLE_SEGMENT_PATH = `SELECT * FROM {{query:"SimpleQuery"}} q`;
