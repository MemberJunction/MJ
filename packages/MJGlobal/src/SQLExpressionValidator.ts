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
] as const;

/**
 * Safe SQL functions allowed in expressions, organized by category
 */
export const ALLOWED_SQL_FUNCTIONS = {
  // Aggregate functions
  aggregates: ['COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STDEV', 'STDEVP', 'VAR', 'VARP', 'STRING_AGG', 'CHECKSUM_AGG'],

  // Math functions
  math: ['ABS', 'CEILING', 'FLOOR', 'ROUND', 'POWER', 'SQRT', 'LOG', 'LOG10', 'EXP', 'SIGN', 'RAND'],

  // String functions (read-only)
  string: ['LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM', 'LEFT', 'RIGHT', 'SUBSTRING', 'CHARINDEX', 'REPLACE', 'CONCAT', 'STUFF'],

  // Date functions
  date: ['DATEPART', 'DATEDIFF', 'DATEADD', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'EOMONTH'],

  // Type conversion (safe subset)
  conversion: ['CAST', 'CONVERT', 'TRY_CAST', 'TRY_CONVERT', 'FORMAT'],

  // Null handling
  nullHandling: ['ISNULL', 'COALESCE', 'NULLIF', 'IIF'],

  // Case expressions
  conditional: ['CASE', 'WHEN', 'THEN', 'ELSE', 'END'],

  // Logical operators (as keywords)
  logical: ['AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'IN'],

  // Sort/order and windowing
  ordering: ['ASC', 'ASCENDING', 'DESC', 'DESCENDING', 'OVER', 'PARTITION', 'BY', 'ORDER', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW']
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
export class SQLExpressionValidator {
  private static _instance: SQLExpressionValidator;

  private constructor() {}

  /**
   * Gets the singleton instance of the validator
   */
  public static get Instance(): SQLExpressionValidator {
    if (!this._instance) {
      this._instance = new SQLExpressionValidator();
    }
    return this._instance;
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

    // Step 1: Remove string literals to avoid false positives
    const withoutStrings = this.removeStringLiterals(trimmed);

    // Step 2: Check for dangerous patterns
    const dangerCheck = this.checkDangerousPatterns(withoutStrings, options);
    if (!dangerCheck.valid) return dangerCheck;

    // Step 3: Validate function names are in allowlist (skip for full queries —
    // the function allowlist is designed for expression fragments, not full SQL statements)
    if (options.context !== 'full_query') {
      const functionCheck = this.checkFunctionNames(withoutStrings, options);
      if (!functionCheck.valid) return functionCheck;
    }

    // Step 4: Context-specific validation
    const contextCheck = this.checkContextRules(withoutStrings, options);
    if (!contextCheck.valid) return contextCheck;

    // Step 5: Optional field reference validation (lenient - just logs warnings)
    if (options.entityFields?.length) {
      this.checkFieldReferences(withoutStrings, options.entityFields);
    }

    return { valid: true };
  }

  /**
   * Remove string literals to avoid false positives in keyword detection.
   * Handles both single and double quoted strings with escaped quotes.
   */
  private removeStringLiterals(expression: string): string {
    // Match both single and double quoted strings, handling escaped quotes
    const stringPattern = /(['"])(?:(?=(\\?))\2[\s\S])*?\1/g;
    return expression.replace(stringPattern, '');
  }

  /**
   * Check for dangerous SQL patterns that indicate injection attempts
   */
  private checkDangerousPatterns(expression: string, options: SQLValidationOptions): SQLValidationResult {
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

    // For full_query, strip comments before keyword checking (agent SQL has header comment blocks).
    // For expressions, comments are still rejected outright as injection vectors.
    let textToCheck: string;
    if (isFullQuery) {
      textToCheck = this.stripSQLComments(expression).toUpperCase();
    } else {
      const upper = expression.toUpperCase();
      if (upper.includes('--') || upper.includes('/*') || upper.includes('*/')) {
        return {
          valid: false,
          error: 'Comments are not allowed in SQL expressions',
          trigger: 'comment'
        };
      }
      textToCheck = upper;
    }

    for (const keyword of blocked) {
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

    // Check statement terminator (prevents multi-statement injection)
    if (expression.includes(';')) {
      return {
        valid: false,
        error: 'Semicolons are not allowed in SQL expressions',
        trigger: ';'
      };
    }

    return { valid: true };
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
  private checkContextRules(expression: string, options: SQLValidationOptions): SQLValidationResult {
    // For aggregate context, require at least one aggregate function (unless explicitly disabled)
    if (options.context === 'aggregate' && options.requireAggregate !== false) {
      const hasAggregate = ALLOWED_SQL_FUNCTIONS.aggregates.some(fn => {
        const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'i');
        return pattern.test(expression);
      });

      if (!hasAggregate) {
        return {
          valid: false,
          error: 'Aggregate expression must contain at least one aggregate function',
          suggestion: `Use one of: ${ALLOWED_SQL_FUNCTIONS.aggregates.join(', ')}`
        };
      }
    }

    // For full_query context, the query must start with SELECT or WITH (CTE)
    if (options.context === 'full_query') {
      const stripped = this.stripSQLComments(expression).trim();
      const upper = stripped.toUpperCase();
      if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
        return {
          valid: false,
          error: 'Ad-hoc query must start with SELECT or WITH',
          suggestion: 'Only SELECT statements and CTEs (WITH ... AS) are allowed'
        };
      }
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
   * Strip SQL comments (single-line -- and multi-line block comments) from a query.
   * Used by full_query context to allow agent-generated header comments
   * without triggering the comment injection check.
   */
  private stripSQLComments(sql: string): string {
    return sql
      .replace(/--[^\n]*/g, '')          // Single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Block comments
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validate a full SQL query (SELECT or WITH/CTE statement).
   * Blocks mutations, dangerous operations, and multi-statement injection.
   * Allows SELECT, subqueries, set operations, and SQL comments.
   */
  public validateFullQuery(sql: string): SQLValidationResult {
    return this.validate(sql, { context: 'full_query' });
  }
}
