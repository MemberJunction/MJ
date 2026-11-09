/**
 * @fileoverview Unified SQL Expression and Query Validation
 *
 * Central utility for validating user-provided SQL expressions and full queries
 * against injection attacks. Used by RunView, aggregates, smart filters, ad-hoc
 * query execution, and any other feature accepting SQL input.
 *
 * Located in MJGlobal (lowest-level package) so all packages can use it.
 *
 * @module @memberjunction/global/SQLExpressionValidator
 */

import { BaseSingleton } from './BaseSingleton';
import {
  ScanSQLForScreening,
  SQL_SCREENING_DIALECTS,
  SQLScreeningDialect,
  SQLScreeningScan,
  SQLScreeningSpan,
} from './SQLScreeningScanner';

/**
 * Dangerous SQL keywords that are never allowed in user-provided expressions
 */
export const DANGEROUS_SQL_KEYWORDS = [
  // DDL (Data Definition Language)
  'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',

  // DML (Data Manipulation Language)
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',

  // DCL (Data Control Language)
  'GRANT', 'REVOKE', 'DENY',

  // Execution and procedures
  'EXEC', 'EXECUTE', 'CALL', 'PROCEDURE', 'FUNCTION',

  // Transaction control
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',

  // Database/schema operations
  'USE', 'DATABASE', 'SCHEMA',

  // Control flow (dangerous in expressions)
  'IF', 'WHILE', 'LOOP', 'FOR', 'GOTO',

  // Union/set operations (injection vectors)
  'UNION', 'INTERSECT', 'EXCEPT',

  // Subquery keywords (when used maliciously)
  'EXISTS', 'ANY', 'ALL', 'SOME',

  // File/external operations
  'BULK', 'OPENROWSET', 'OPENDATASOURCE', 'OPENQUERY',

  // Extended stored procedures
  'XP_', 'SP_',

  // Dynamic SQL
  'DYNAMIC', 'PREPARE', 'DEALLOCATE',

  // Time-based injection
  'WAITFOR', 'DELAY', 'SLEEP',

  // System operations
  'SHUTDOWN', 'RECONFIGURE'
] as const;

/**
 * Keywords from DANGEROUS_SQL_KEYWORDS that are legitimate in full SELECT queries.
 * These are only unblocked when context is 'full_query'.
 */
export const FULL_QUERY_ALLOWED_KEYWORDS = [
  // Subquery operators — valid in WHERE EXISTS(...), x > ANY(...)
  'EXISTS', 'ANY', 'ALL', 'SOME',

  // Set operations — valid for UNION/INTERSECT/EXCEPT queries
  'UNION', 'INTERSECT', 'EXCEPT',

  // IIF() uses IF internally, CASE WHEN patterns are common
  'IF',

  // FOR JSON / FOR XML — legitimate trailing clauses on a full SELECT. The
  // control-flow `FOR` loop this keyword guards against cannot appear in a
  // standalone SELECT statement, so allowing FOR in full-query context is safe.
  // (FOR UPDATE remains blocked via the independent UPDATE keyword.)
  'FOR',
] as const;

/**
 * System catalog / metadata objects that must never be referenced from a user-supplied
 * expression or ad-hoc query, in ANY context (including `full_query`). These sit outside
 * MemberJunction's entity-permission model, so allowing them turns a validated SELECT into
 * a schema-enumeration and credential-exfiltration primitive
 * (e.g. `SELECT name, password_hash FROM sys.sql_logins`,
 *  `SELECT * FROM INFORMATION_SCHEMA.COLUMNS`, `SELECT * FROM pg_catalog.pg_authid`).
 * The check reads {@link SQLScreeningScan.CodeWithIdentifiers}: string literals are removed, so a
 * literal value like `'sys.x'` is safe, and quoted names are unwrapped, so `[sys].[x]` is caught.
 */
export const BLOCKED_SYSTEM_OBJECT_PATTERNS: RegExp[] = [
  /\bSYS\s*\.\s*\w/i,                      // SQL Server system catalog schema: sys.sql_logins, sys.objects, sys.fn_*, ...
  /\bINFORMATION_SCHEMA\b/i,               // ANSI catalog views — schema/table/column enumeration
  /\bSYSLOGINS\b/i,                        // legacy SQL Server logins view
  /\bPG_CATALOG\s*\./i,                    // PostgreSQL system catalog schema
  /\bPG_(AUTHID|SHADOW|USER|ROLES)\b/i,    // PostgreSQL credential / role catalogs
];

/**
 * The keywords a full query may open with. Without the `u` flag, the `i` flag matches ASCII letters
 * only, so no other letter is case-mapped to S, E, L, C, T, W, I or H.
 */
const FULL_QUERY_OPENING_KEYWORD = /^(?:SELECT|WITH)$/i;

/**
 * Replaces each SQL string literal with one space so that a keyword denylist can be applied to the
 * rest without tripping over keywords inside quoted data (e.g. `Comments LIKE '%--%'`). Quoted
 * identifiers and comments are left as written.
 *
 * 🚨 SECURITY — literals are found by {@link ScanSQLForScreening}, which reads the text the way the
 * database does: a quote inside a T-SQL `[…]` identifier, a comment or a PostgreSQL `$$…$$` string
 * opens no literal, and a backslash escapes a quote only inside a PostgreSQL `E'…'` string. A
 * stripper that removes a span the database does NOT treat as a literal hides everything inside it
 * from the denylist while the database still runs it. Screens should call
 * {@link ScanSQLForScreening} directly, which also reports comments and text it cannot classify.
 *
 * @param sql The clause, expression, or query to strip literals from
 * @param dialect The dialect that will run the SQL. Without one, the text must read the same way
 *                under every dialect the scanner knows.
 * @returns The input with each string literal replaced by a space. The input is returned unchanged
 *          when it cannot be classified (for example an unterminated literal) or when the dialects
 *          disagree on where its literals are, so a denylist still sees all of it.
 */
export function StripSQLStringLiterals(sql: string, dialect?: SQLScreeningDialect): string {
  const scans = (dialect ? [dialect] : SQL_SCREENING_DIALECTS).map(d => ScanSQLForScreening(sql, d));
  if (scans.some(scan => !scan.Classified)) return sql;
  const readings = scans.map(scan => replaceStringSpans(sql, scan.Spans));
  return readings.every(reading => reading === readings[0]) ? readings[0] : sql;
}

/** Writes `sql` with each string span replaced by one space. */
function replaceStringSpans(sql: string, spans: SQLScreeningSpan[]): string {
  let result = '';
  let from = 0;
  for (const span of spans) {
    if (span.Kind !== 'string') continue;
    result += sql.slice(from, span.Start) + ' ';
    from = span.End;
  }
  return result + sql.slice(from);
}

/**
 * Safe SQL functions allowed in expressions, organized by category.
 *
 * WHY THIS IS A UNION RATHER THAN A PER-DIALECT TABLE
 * ---------------------------------------------------
 * This is a deny-by-default SAFETY list, not a dialect grammar. Its job is to
 * stop a user-supplied expression from smuggling in something that is not a
 * read-only scalar/aggregate call — it is not, and must not become, a
 * per-platform parser. So it carries the union of every supported dialect's
 * read-only vocabulary, and `checkFunctionNames` consults the flattened union.
 *
 * Keying the buckets off `ResolvePlatformKey` is the alternative, and it costs
 * more than it buys: a PostgreSQL name that reaches a SQL Server tenant is
 * rejected by the SQL Server parser on its own — `DATE_TRUNC(...)` simply never
 * parses there. The union therefore cannot widen the blast radius past what the
 * target server will already accept, whereas a dialect switch here would add a
 * second independent place for the dialect to be resolved, and so a second place
 * for it to be wrong.
 *
 * Before this list held the PostgreSQL names, a perfectly ordinary PG filter
 * such as `DATE_TRUNC('month', CreatedAt)` was rejected outright with
 * "Function 'DATE_TRUNC' is not allowed" on every PostgreSQL tenant.
 *
 * Every name here is read-only by construction. Anything that writes, escalates,
 * or reaches outside the statement stays on {@link DANGEROUS_SQL_KEYWORDS}, which
 * is checked FIRST (step 2 of `validate`) — a name added here can never unblock
 * one that is denied there.
 */
export const ALLOWED_SQL_FUNCTIONS = {
  // Aggregate functions. PG: ARRAY_AGG / JSONB_AGG / JSON_AGG / BOOL_AND / BOOL_OR /
  // EVERY / PERCENTILE_* / MODE.
  aggregates: ['COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STDEV', 'STDEVP', 'VAR', 'VARP', 'STRING_AGG', 'CHECKSUM_AGG',
    'ARRAY_AGG', 'JSONB_AGG', 'JSON_AGG', 'BOOL_AND', 'BOOL_OR', 'EVERY', 'PERCENTILE_CONT', 'PERCENTILE_DISC', 'MODE'],

  // Math functions. PG: CEIL (vs CEILING), RANDOM (vs RAND), TRUNC, MOD, DIV,
  // GREATEST, LEAST, WIDTH_BUCKET.
  math: ['ABS', 'CEILING', 'FLOOR', 'ROUND', 'POWER', 'SQRT', 'LOG', 'LOG10', 'EXP', 'SIGN', 'RAND',
    'CEIL', 'RANDOM', 'TRUNC', 'MOD', 'DIV', 'GREATEST', 'LEAST', 'WIDTH_BUCKET'],

  // String functions (read-only). PG: POSITION / STRPOS (vs CHARINDEX), SPLIT_PART,
  // INITCAP, LPAD, RPAD, REPEAT, REVERSE, TRANSLATE, REGEXP_*, TO_CHAR, MD5, ASCII, CHR.
  string: ['LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM', 'LEFT', 'RIGHT', 'SUBSTRING', 'CHARINDEX', 'REPLACE', 'CONCAT', 'STUFF',
    'POSITION', 'STRPOS', 'SPLIT_PART', 'INITCAP', 'LPAD', 'RPAD', 'REPEAT', 'REVERSE', 'TRANSLATE',
    'REGEXP_REPLACE', 'REGEXP_MATCHES', 'REGEXP_SUBSTR', 'TO_CHAR', 'MD5', 'ASCII', 'CHR'],

  // Date functions. PG: NOW / CURRENT_* / LOCALTIMESTAMP (vs GETDATE), DATE_TRUNC,
  // DATE_PART / EXTRACT (vs DATEPART), AGE, TO_DATE, TO_TIMESTAMP, MAKE_*, JUSTIFY_DAYS.
  date: ['DATEPART', 'DATEDIFF', 'DATEADD', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'EOMONTH',
    'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'LOCALTIMESTAMP', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'AGE',
    'TO_DATE', 'TO_TIMESTAMP', 'MAKE_DATE', 'MAKE_TIMESTAMP', 'JUSTIFY_DAYS'],

  // Type conversion (safe subset). PG: TO_CHAR / TO_DATE / TO_NUMBER / TO_TIMESTAMP
  // (vs CAST/CONVERT/FORMAT).
  conversion: ['CAST', 'CONVERT', 'TRY_CAST', 'TRY_CONVERT', 'FORMAT', 'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP'],

  // Null handling. PG has no ISNULL/IIF; GREATEST/LEAST are its null-tolerant pickers.
  nullHandling: ['ISNULL', 'COALESCE', 'NULLIF', 'IIF', 'GREATEST', 'LEAST'],

  // Case expressions
  conditional: ['CASE', 'WHEN', 'THEN', 'ELSE', 'END'],

  // Logical operators (as keywords). PG: ILIKE, SIMILAR TO. ANY/ALL/SOME/EXISTS are
  // listed so that the full-query context, which unblocks them from
  // DANGEROUS_SQL_KEYWORDS via FULL_QUERY_ALLOWED_KEYWORDS, does not then trip over
  // them here as unknown function-shaped tokens.
  logical: ['AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'IN', 'ILIKE', 'SIMILAR', 'ANY', 'ALL', 'SOME', 'EXISTS'],

  // Sort/order and windowing. PG: NULLS FIRST/LAST, aggregate FILTER (WHERE …),
  // WITHIN GROUP, GROUPING.
  ordering: ['ASC', 'ASCENDING', 'DESC', 'DESCENDING', 'OVER', 'PARTITION', 'BY', 'ORDER', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
    'NULLS', 'FIRST', 'LAST', 'FILTER', 'WITHIN', 'GROUPING']
} as const;

/**
 * Validation context - affects what's allowed
 */
export type SQLValidationContext =
  | 'where_clause'      // WHERE expressions (most permissive)
  | 'order_by'          // ORDER BY expressions
  | 'aggregate'         // Aggregate expressions (must include aggregate function)
  | 'field_reference'   // Simple field references only
  | 'full_query';       // Full SELECT/WITH statements — allows SELECT, subqueries, set operations, comments

/**
 * Validation result with detailed error information
 */
export interface SQLValidationResult {
  /** Whether the expression passed validation */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Specific keyword or pattern that triggered the error */
  trigger?: string;
  /** Suggested fix if available */
  suggestion?: string;
}

/**
 * Options for SQL expression validation
 */
export interface SQLValidationOptions {
  /** Validation context affects what's allowed */
  context: SQLValidationContext;

  /** Entity field names for validation (optional - enables field checking) */
  entityFields?: string[];

  /** Whether to require at least one aggregate function (for 'aggregate' context). Default: true for aggregate context */
  requireAggregate?: boolean;

  /** Whether to allow SELECT keyword (normally blocked for subquery prevention) */
  allowSubqueries?: boolean;

  /** Custom allowed keywords/functions to add */
  additionalAllowed?: string[];

  /** Custom blocked keywords to add */
  additionalBlocked?: string[];

  /**
   * The dialect that will run the SQL, which decides how quotes, identifiers and comments are read.
   * Without one, the SQL must pass under every dialect {@link ScanSQLForScreening} knows.
   */
  Dialect?: SQLScreeningDialect;
}

/**
 * Central SQL expression validator for preventing SQL injection.
 *
 * Provides context-aware validation for different types of SQL expressions
 * (WHERE clauses, ORDER BY, aggregates, etc.) with detailed error reporting.
 *
 * @example
 * ```typescript
 * const validator = SQLExpressionValidator.Instance;
 *
 * // Validate an aggregate expression
 * const result = validator.validate('SUM(OrderTotal)', {
 *   context: 'aggregate',
 *   entityFields: ['OrderTotal', 'Quantity', 'Price']
 * });
 *
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export class SQLExpressionValidator extends BaseSingleton<SQLExpressionValidator> {
  /**
   * Use SQLExpressionValidator.Instance to get the singleton instance.
   */
  public constructor() {
    super();
  }

  /**
   * Gets the singleton instance of the validator
   */
  public static get Instance(): SQLExpressionValidator {
    return SQLExpressionValidator.getInstance<SQLExpressionValidator>();
  }

  /**
   * Validate a SQL expression for injection and allowed patterns.
   *
   * @param expression The SQL expression to validate
   * @param options Validation options including context and entity fields
   * @returns Validation result with error details if invalid
   */
  public validate(expression: string, options: SQLValidationOptions): SQLValidationResult {
    if (!expression || typeof expression !== 'string') {
      return { valid: false, error: 'Expression cannot be empty' };
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      return { valid: false, error: 'Expression cannot be empty' };
    }

    // Read the text the way the database will. When the dialect is unknown, every reading must pass.
    const dialects = options.Dialect ? [options.Dialect] : SQL_SCREENING_DIALECTS;
    for (const dialect of dialects) {
      const result = this.validateReading(ScanSQLForScreening(trimmed, dialect), options);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  /**
   * Runs every check against one dialect's reading of the expression.
   *
   * 🚨 SECURITY: the checks read the scanner's projections, never the raw text. Do not add a regex
   * that finds literals, identifiers or comments here; see {@link ScanSQLForScreening}.
   */
  private validateReading(scan: SQLScreeningScan, options: SQLValidationOptions): SQLValidationResult {
    if (!scan.Classified) {
      return {
        valid: false,
        error: `SQL could not be read safely as ${scan.Dialect}: ${scan.Error}`,
        trigger: 'unclassified'
      };
    }

    const dangerCheck = this.checkDangerousPatterns(scan, options);
    if (!dangerCheck.valid) return dangerCheck;

    // The function allowlist is designed for expression fragments, not full SQL statements.
    // Quoted names are unwrapped, so a quoted function call is checked too.
    if (options.context !== 'full_query') {
      const functionCheck = this.checkFunctionNames(scan.CodeWithIdentifiers, options);
      if (!functionCheck.valid) return functionCheck;
    }

    const contextCheck = this.checkContextRules(scan, options);
    if (!contextCheck.valid) return contextCheck;

    // Optional field reference validation (lenient - just logs warnings)
    if (options.entityFields?.length) {
      this.checkFieldReferences(scan.Code, options.entityFields);
    }

    return { valid: true };
  }

  /**
   * Check for dangerous SQL patterns that indicate injection attempts
   */
  private checkDangerousPatterns(scan: SQLScreeningScan, options: SQLValidationOptions): SQLValidationResult {
    const isFullQuery = options.context === 'full_query';
    const textToCheck = scan.Code.toUpperCase();

    // Full queries may carry comments (agent SQL has header comment blocks); the scan has already
    // blanked them. In expressions, comments are rejected outright as injection vectors, and so is
    // a stray `*/`, which is code.
    if (!isFullQuery && (scan.CommentCount > 0 || textToCheck.includes('*/'))) {
      return {
        valid: false,
        error: 'Comments are not allowed in SQL expressions',
        trigger: 'comment'
      };
    }

    for (const keyword of this.blockedKeywords(options)) {
      // Use word boundaries to avoid false positives (e.g., "DESCRIPTION" containing "EXEC")
      const pattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      if (pattern.test(textToCheck)) {
        return {
          valid: false,
          error: `Dangerous SQL keyword detected: ${keyword}`,
          trigger: keyword,
          suggestion: keyword === 'SELECT' ? 'Subqueries are not allowed. Use a direct expression instead.' : undefined
        };
      }
    }

    // Block references to database system catalogs / metadata objects in ALL contexts
    // (including full_query). These live outside MemberJunction's entity-permission model, so
    // permitting them turns a validated SELECT into a schema-enumeration / credential-exfiltration
    // primitive. Literals are blanked and quoted names unwrapped, so `[sys].[x]` is caught too.
    const namesToCheck = scan.CodeWithIdentifiers.toUpperCase();
    for (const sysPattern of BLOCKED_SYSTEM_OBJECT_PATTERNS) {
      if (sysPattern.test(namesToCheck)) {
        return {
          valid: false,
          error: 'Access to database system catalogs / metadata objects is not allowed',
          trigger: 'system-object'
        };
      }
    }

    // Check statement terminator (prevents multi-statement injection). Comments are already
    // blanked, so a full query may end with one semicolon even when a comment follows it
    // (`ORDER BY x DESC; -- highest first`). A semicolon anywhere else indicates injection.
    const textForSemicolonCheck = isFullQuery ? textToCheck.replace(/;\s*$/, '') : textToCheck;
    if (textForSemicolonCheck.includes(';')) {
      return {
        valid: false,
        error: 'Semicolons are not allowed in SQL expressions',
        trigger: ';'
      };
    }

    return { valid: true };
  }

  /**
   * The keywords {@link checkDangerousPatterns} rejects in this context.
   */
  private blockedKeywords(options: SQLValidationOptions): string[] {
    const isFullQuery = options.context === 'full_query';

    // Build blocked list - explicitly typed as string[] for mutability
    let blocked: string[] = [...DANGEROUS_SQL_KEYWORDS];
    if (options.additionalBlocked) {
      blocked.push(...options.additionalBlocked);
    }

    // For full_query context, remove keywords that are legitimate in SELECT statements
    if (isFullQuery) {
      const allowedSet = new Set(FULL_QUERY_ALLOWED_KEYWORDS.map(k => k.toUpperCase()));
      blocked = blocked.filter(kw => !allowedSet.has(kw.toUpperCase()));
    }

    // Add SELECT to blocked unless context allows it (prevents subqueries in expressions)
    if (!isFullQuery && !options.allowSubqueries && !blocked.includes('SELECT')) {
      blocked.push('SELECT');
    }
    return blocked;
  }

  /**
   * Check that function names are in the allowlist
   */
  private checkFunctionNames(expression: string, options: SQLValidationOptions): SQLValidationResult {
    // Extract function calls (word followed by opening paren)
    const functionPattern = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
    let match;

    // Build allowed functions list from all categories
    const allowed = new Set<string>();
    Object.values(ALLOWED_SQL_FUNCTIONS).flat().forEach(fn => allowed.add(fn.toUpperCase()));
    if (options.additionalAllowed) {
      options.additionalAllowed.forEach(fn => allowed.add(fn.toUpperCase()));
    }

    while ((match = functionPattern.exec(expression)) !== null) {
      const fnName = match[1].toUpperCase();
      if (!allowed.has(fnName)) {
        return {
          valid: false,
          error: `Function '${fnName}' is not allowed`,
          trigger: fnName,
          suggestion: `Allowed functions include: ${ALLOWED_SQL_FUNCTIONS.aggregates.join(', ')}, ${ALLOWED_SQL_FUNCTIONS.math.slice(0, 5).join(', ')}...`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Context-specific validation rules
   */
  private checkContextRules(scan: SQLScreeningScan, options: SQLValidationOptions): SQLValidationResult {
    // For aggregate context, require at least one aggregate function (unless explicitly disabled)
    if (options.context === 'aggregate' && options.requireAggregate !== false) {
      const hasAggregate = ALLOWED_SQL_FUNCTIONS.aggregates.some(fn => {
        const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'i');
        return pattern.test(scan.Code);
      });

      if (!hasAggregate) {
        return {
          valid: false,
          error: 'Aggregate expression must contain at least one aggregate function',
          suggestion: `Use one of: ${ALLOWED_SQL_FUNCTIONS.aggregates.join(', ')}`
        };
      }
    }

    // For full_query context, the first token (after comments) must be the unquoted keyword SELECT or
    // WITH, compared in ASCII. SQL Server runs a batch that opens with any other name, quoted or not,
    // as a procedure call.
    if (options.context === 'full_query' && !FULL_QUERY_OPENING_KEYWORD.test(scan.LeadingWord ?? '')) {
      return {
        valid: false,
        error: 'Ad-hoc query must start with SELECT or WITH',
        suggestion: 'Only SELECT statements and CTEs (WITH ... AS) are allowed'
      };
    }

    return { valid: true };
  }

  /**
   * Validate field references exist in entity (lenient mode - just for logging)
   */
  private checkFieldReferences(expression: string, entityFields: string[]): void {
    // Extract potential field names (words not followed by parentheses)
    const fieldPattern = /\b([A-Z_][A-Z0-9_]*)\b(?!\s*\()/gi;
    const fieldSet = new Set(entityFields.map(f => f.toUpperCase()));

    // Build set of all allowed keywords (not just functions)
    const allAllowed = new Set<string>();
    Object.values(ALLOWED_SQL_FUNCTIONS).flat().forEach(k => allAllowed.add(k.toUpperCase()));

    let match;
    const unknownFields: string[] = [];

    while ((match = fieldPattern.exec(expression)) !== null) {
      const word = match[1].toUpperCase();
      // Skip if it's an allowed keyword or a known field
      if (!allAllowed.has(word) && !fieldSet.has(word)) {
        unknownFields.push(match[1]);
      }
    }

    // Lenient mode: just log warnings, don't fail validation
    // This allows computed columns and virtual fields not in the fields array
    if (unknownFields.length > 0) {
      // Could emit a warning here if we had a logging mechanism
      // For now, we allow it to pass
    }
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Normalize literal escape sequences in SQL strings.
   * Agent-generated SQL sometimes arrives with literal \n, \r, \t sequences
   * (backslash + letter) instead of actual whitespace characters. This happens
   * when JSON is double-escaped or the SQL passes through a transport layer
   * that doesn't interpret escape sequences. Without normalization, comment
   * stripping fails because the regex expects real newlines.
   */
  private normalizeSQLWhitespace(sql: string): string {
    return sql
      .replace(/\\r\\n/g, '\n')  // Literal \r\n → newline
      .replace(/\\n/g, '\n')     // Literal \n → newline
      .replace(/\\r/g, '\r')     // Literal \r → carriage return
      .replace(/\\t/g, '\t');    // Literal \t → tab
  }

  /**
   * Validate a full SQL query (SELECT or WITH/CTE statement).
   * Blocks mutations, dangerous operations, and multi-statement injection.
   * Allows SELECT, subqueries, set operations, and SQL comments.
   *
   * @param sql The query to validate
   * @param dialect The dialect that will run the query. Without one, the query must pass under
   *                every dialect {@link ScanSQLForScreening} knows.
   */
  public ValidateFullQuery(sql: string, dialect?: SQLScreeningDialect): SQLValidationResult {
    // Normalize literal escape sequences before validation — agent-generated
    // SQL may arrive with literal \n instead of real newlines, which breaks
    // comment stripping and the "must start with SELECT" check.
    const normalized = this.normalizeSQLWhitespace(sql);
    return this.validate(normalized, { context: 'full_query', Dialect: dialect });
  }

  /** @deprecated Use {@link ValidateFullQuery}. */
  public validateFullQuery(sql: string): SQLValidationResult {
    return this.ValidateFullQuery(sql);
  }
}
