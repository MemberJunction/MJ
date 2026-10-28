/**
 * @fileoverview SQL Filter Implementations for RunQuery
 * 
 * This module provides the actual implementation functions for RunQuery SQL filters.
 * This is separate from the filter definitions to keep AI prompts token-efficient.
 * 
 * @module @memberjunction/core/runQuerySQLFilterImplementations
 */

import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import { RUN_QUERY_SQL_FILTERS, RunQuerySQLFilter } from './querySQLFilters';
import { DatabasePlatform } from './platformSQL';
import { GetDialect, GetQueryDialect } from '@memberjunction/sql-dialect';
import type { DialectKey, QueryDialect, SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Dangerous SQL keywords that should be blocked in expressions
 */
const DANGEROUS_SQL_KEYWORDS = [
    // DDL (Data Definition Language) - Structure modification
    'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',
    
    // DML (Data Manipulation Language) - Data modification  
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
    
    // DCL (Data Control Language) - Permissions
    'GRANT', 'REVOKE', 'DENY',
    
    // Execution and procedures
    'EXEC', 'EXECUTE', 'CALL', 'PROCEDURE', 'FUNCTION',
    
    // Transaction control
    'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    
    // Database/schema operations
    'USE', 'DATABASE', 'SCHEMA',
    
    // Conditional execution that could be dangerous
    'IF', 'WHILE', 'LOOP', 'FOR', 'GOTO',
    
    // System functions and variables
    'SYSTEM', 'ADMIN', 'USER', 'SESSION', 'GLOBAL',
    'SHOW', 'DESCRIBE', 'EXPLAIN',
    
    // Union and set operations (can be used for injection)
    'UNION', 'INTERSECT', 'EXCEPT',
    
    // Subquery keywords (when used maliciously)
    'EXISTS', 'ANY', 'ALL', 'SOME',
    
    // Comment indicators (used in injection)
    '--', '/*', '*/', 
    
    // String manipulation that could escape
    'CHAR', 'ASCII', 'UNICODE',
    
    // File operations
    'BULK', 'OPENROWSET', 'OPENDATASOURCE', 'OPENQUERY',
    
    // Dynamic SQL
    'DYNAMIC', 'PREPARE', 'DEALLOCATE',
    
    // Common injection patterns
    'WAITFOR', 'DELAY', 'SLEEP'
];

/**
 * Allowed keywords and functions for ORDER BY and similar expressions.
 *
 * WHY THIS IS A UNION RATHER THAN A PER-DIALECT TABLE
 * ---------------------------------------------------
 * This is a deny-by-default SAFETY list, not a grammar. Its job is to keep a
 * user-supplied expression from reaching the database with something that is
 * not a read-only scalar/aggregate call — it is not, and must not become, a
 * per-platform parser. So the list carries the union of every supported
 * dialect's read-only vocabulary.
 *
 * Keying it off `ResolvePlatformKey` is the alternative, and it costs more than
 * it buys: a PostgreSQL name reaching a SQL Server tenant is caught by the SQL
 * Server parser, which rejects `DATE_TRUNC(...)` on its own. The union cannot
 * widen the blast radius past what the target server will actually parse, while
 * a dialect switch here would add a second place for the dialect to be wrong.
 *
 * The names below are read-only by construction. Anything that writes, escalates,
 * or reaches outside the query stays on {@link DANGEROUS_SQL_KEYWORDS}, which is
 * checked FIRST and unconditionally — adding a name here can never unblock one
 * that is denied there.
 *
 * NOTE ON WHAT THIS LIST CURRENTLY GATES. `sqlNoKeywordsExpression`'s unknown-token
 * gate reads `isKnownKeyword && !isAllowed`, which reduces to
 * `isDangerous && !isAllowed` — and every dangerous keyword has already thrown in
 * the loop above it. So an UNRECOGNISED token falls straight through today, which
 * is why `DATE_TRUNC` was not actually being rejected here. This list is therefore
 * the DECLARED allowlist: it is what that gate will consult the moment it is
 * tightened to reject unknown tokens, and it has to carry the PostgreSQL names
 * BEFORE that happens, not after. Do not read the entries below as the set of
 * things that are currently reachable.
 */
const ALLOWED_SQL_KEYWORDS = [
    // Direction keywords
    'ASC', 'ASCENDING', 'DESC', 'DESCENDING',
    
    // Basic aggregate functions (read-only)
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    
    // Math functions
    'ABS', 'CEILING', 'FLOOR', 'ROUND', 'SQRT',
    
    // String functions (read-only)
    'LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM',
    
    // Date functions (read-only)
    'YEAR', 'MONTH', 'DAY', 'DATEPART', 'DATEDIFF',
    
    // Case expressions
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    
    // Basic logical
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE',
    
    // Comparison operators (as words)
    'BETWEEN', 'IN',

    // PostgreSQL read-only vocabulary. Accepted alongside the T-SQL set above
    // per the union rationale in this list's doc comment.
    'ILIKE', 'CEIL', 'RANDOM', 'TRUNC', 'MOD', 'GREATEST', 'LEAST',
    'POSITION', 'STRPOS', 'SPLIT_PART', 'INITCAP', 'LPAD', 'RPAD', 'REGEXP_REPLACE', 'TO_CHAR', 'TO_DATE',
    'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'AGE',
    'ARRAY_AGG', 'STRING_AGG', 'COALESCE', 'NULLIF',
    'NULLS', 'FIRST', 'LAST', 'FILTER'
];

/** The platform filters render for until {@link RunQuerySQLFilterManager.SetPlatform} is called. */
const DEFAULT_FILTER_PLATFORM: DatabasePlatform = 'sqlserver';

/** The dialect of {@link DEFAULT_FILTER_PLATFORM}, which the exported default implementations use. */
const DEFAULT_FILTER_DIALECT: SQLDialect = GetDialect(DEFAULT_FILTER_PLATFORM);

/**
 * SQL Filter implementation functions. The filters whose output depends on the database come
 * from {@link dialectFilterImplementations}.
 */
const FILTER_IMPLEMENTATIONS: Record<string, (value: any) => any> = {
    ...dialectFilterImplementations(DEFAULT_FILTER_DIALECT),
    sqlNumber: (value: any) => {
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
        return num;
    },
    
    sqlDate: (value: any) => {
        if (!value) return 'NULL';
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
        return `'${date.toISOString()}'`;
    },
    
    sqlNoKeywordsExpression: (value: any) => {
        if (!value) {
            throw new Error('SQL expression cannot be empty');
        }
        
        const expression = String(value).trim();
        if (!expression) {
            throw new Error('SQL expression cannot be empty');
        }
        
        // Convert to uppercase for keyword checking
        const upperExpression = expression.toUpperCase();
        
        // Check for dangerous keywords
        for (const keyword of DANGEROUS_SQL_KEYWORDS) {
            // Use word boundaries to avoid false positives (e.g., "Description" containing "DESC")
            const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(upperExpression)) {
                throw new Error(`Dangerous SQL keyword detected: ${keyword}`);
            }
        }
        
        // Extract all words/tokens from the expression
        const tokens = expression.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
        
        // Check that any SQL keywords used are in the allowed list
        for (const token of tokens) {
            const upperToken = token.toUpperCase();
            // If it's a SQL keyword (appears in either list), it must be in the allowed list
            const isKnownKeyword = DANGEROUS_SQL_KEYWORDS.includes(upperToken) || ALLOWED_SQL_KEYWORDS.includes(upperToken);
            const isAllowed = ALLOWED_SQL_KEYWORDS.includes(upperToken);
            
            // If it's a known SQL keyword and not allowed, block it
            if (isKnownKeyword && !isAllowed) {
                throw new Error(`SQL keyword '${token}' is not allowed in expressions`);
            }
        }
        
        // Additional safety checks
        if (upperExpression.includes('--') || upperExpression.includes('/*') || upperExpression.includes('*/')) {
            throw new Error('Comments are not allowed in SQL expressions');
        }
        
        if (upperExpression.includes(';')) {
            throw new Error('Semicolons are not allowed in SQL expressions');
        }
        
        // Check for suspicious patterns
        if (upperExpression.includes('()') && !upperExpression.match(/\b(COUNT|SUM|AVG|MIN|MAX|ABS|CEILING|FLOOR|ROUND|SQRT|LEN|LENGTH|UPPER|LOWER|TRIM|YEAR|MONTH|DAY)\s*\(/i)) {
            throw new Error('Function calls with empty parentheses are not allowed');
        }
        
        // Return the original expression (preserving case)
        return expression;
    }
};

/**
 * Complete SQL filters with implementations attached.
 * This is the array that should be used by the QueryParameterProcessor.
 */
export const RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS: RunQuerySQLFilter[] = 
    RUN_QUERY_SQL_FILTERS.map(filter => ({
        ...filter,
        implementation: FILTER_IMPLEMENTATIONS[filter.name]
    }));

/**
 * The filters whose output depends on the database, rendered for one dialect: string and IN-list
 * literals, booleans, identifiers and the three LIKE filters. Every difference comes from the
 * dialect's writer, so a new dialect needs no change here.
 */
function dialectFilterImplementations(dialect: Pick<QueryDialect, 'Writer'>): Record<string, (value: unknown) => unknown> {
    const writer = dialect.Writer;
    return {
        sqlString: (value: unknown) => (value === null || value === undefined ? 'NULL' : textLiteral(value, dialect)),
        sqlIn: (values: unknown) => {
            if (!Array.isArray(values) || values.length === 0) {
                return '(NULL)'; // matches nothing
            }
            const items = values.map(v => typeof v === 'number' ? String(v) : v === null || v === undefined ? 'NULL' : textLiteral(v, dialect));
            return `(${items.join(', ')})`;
        },
        sqlBoolean: (value: unknown) => writer.BooleanLiteral(Boolean(value)),
        sqlIdentifier: (value: unknown) => {
            if (!value) throw new Error('Identifier cannot be empty');
            const identifier = String(value);
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
                throw new Error(`Invalid SQL identifier: ${identifier}`);
            }
            return writer.QuoteIdentifier(identifier);
        },
        sqlLikeContains: (value: unknown) => likeLiteral(value, 'both', dialect),
        sqlLikeBegins: (value: unknown) => likeLiteral(value, 'trailing', dialect),
        sqlLikeEnds: (value: unknown) => likeLiteral(value, 'leading', dialect),
    };
}

/**
 * Strips leading and/or trailing SQL LIKE wildcard characters (%) from a value.
 * The sqlLike* filters add their own wildcards, so any user-supplied wildcards at
 * the boundaries are redundant and cause double-wrapping bugs (e.g. '%[%]value[%]%').
 *
 * @param value  The raw parameter value
 * @param side   Which boundary to strip: 'leading', 'trailing', or 'both'
 */
function stripBoundaryWildcards(value: string, side: 'leading' | 'trailing' | 'both'): string {
    switch (side) {
        case 'leading':
            return value.replace(/^%+/, '');
        case 'trailing':
            return value.replace(/%+$/, '');
        case 'both':
            return value.replace(/^%+/, '').replace(/%+$/, '');
    }
}

/**
 * A LIKE pattern literal that matches `value` literally, with `%` added on the open side(s):
 * `both` for contains, `trailing` for begins-with, `leading` for ends-with. User-supplied `%` on
 * those sides is dropped first, and every other character LIKE treats specially is escaped by
 * the dialect.
 */
function likeLiteral(value: unknown, wildcardSide: 'leading' | 'trailing' | 'both', dialect: Pick<QueryDialect, 'Writer'>): string {
    if (value === null || value === undefined) return 'NULL';
    const stripped = stripBoundaryWildcards(String(value), wildcardSide);
    const pattern = dialect.Writer.EscapeLikePattern(stripped.replace(/'/g, "''"));
    const before = wildcardSide === 'trailing' ? '' : '%';
    const after = wildcardSide === 'leading' ? '' : '%';
    return `${dialect.Writer.StringLiteralPrefix(stripped)}'${before}${pattern}${after}'`;
}

/** A string literal for `value` with the dialect's prefix, quotes escaped. */
function textLiteral(value: unknown, dialect: Pick<QueryDialect, 'Writer'>): string {
    const text = String(value);
    return `${dialect.Writer.StringLiteralPrefix(text)}'${EscapeSQLString(text)}'`;
}

/**
 * Singleton class for managing RunQuery SQL filters with implementations.
 *
 * Filters whose output depends on the database are rendered for a dialect. A caller that knows
 * the dialect of the request it renders for asks for that dialect's filters
 * ({@link GetFiltersForDialect}), so two providers on different platforms in one process each
 * render with their own. The process-wide platform ({@link SetPlatform}) is only the default for
 * callers that do not name a dialect.
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 */
export class RunQuerySQLFilterManager extends BaseSingleton<RunQuerySQLFilterManager> {
    private _filters: Map<string, RunQuerySQLFilter> = new Map();
    private _platform: DatabasePlatform = DEFAULT_FILTER_PLATFORM;
    private readonly _dialectFilters: Map<string, ReadonlyMap<string, RunQuerySQLFilter>> = new Map();

    /**
     * Use RunQuerySQLFilterManager.Instance to get the singleton instance.
     */
    public constructor() {
        super();
        this.initializeFilters();
    }

    /**
     * Initializes or reinitializes all filters with the current platform setting.
     */
    private initializeFilters(): void {
        this._filters.clear();
        RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS.forEach(filter => {
            if (filter.implementation) {
                this._filters.set(filter.name, { ...filter });
            }
        });
        // Override platform-sensitive filters with platform-aware versions
        this.applyPlatformOverrides();
    }

    /**
     * Installs the dialect-sensitive filters for the current platform's dialect.
     */
    private applyPlatformOverrides(): void {
        for (const [name, implementation] of Object.entries(dialectFilterImplementations(GetDialect(this._platform)))) {
            const filter = this._filters.get(name);
            if (filter) {
                filter.implementation = implementation;
            }
        }
    }

    /**
     * Gets the singleton instance
     */
    public static get Instance(): RunQuerySQLFilterManager {
        return RunQuerySQLFilterManager.getInstance<RunQuerySQLFilterManager>();
    }

    /**
     * Gets the current database platform for this filter manager.
     */
    public get Platform(): DatabasePlatform {
        return this._platform;
    }

    /**
     * The SQL dialect of the current platform, for callers that render values the way these
     * filters do (for example the value bound for a boolean parameter).
     */
    public get Dialect(): SQLDialect {
        return GetDialect(this._platform);
    }

    /**
     * The dialect filters render for: the one under `dialectKey`, or the process-wide default
     * platform's when omitted. Callers that render values the way the filters do (the value bound
     * for a boolean parameter) read it here, so they follow the same dialect.
     * @throws Error when no dialect is registered under the key.
     */
    public DialectFor(dialectKey?: DialectKey): QueryDialect {
        return dialectKey === undefined ? this.Dialect : GetQueryDialect(dialectKey);
    }

    /**
     * Sets the process-wide default platform, updating platform-sensitive filters accordingly.
     *
     * @deprecated The default applies only to callers that render without naming a dialect. A
     * render for a known provider passes its dialect key ({@link GetFiltersForDialect}), so two
     * providers on different platforms in one process each get their own filters.
     */
    public SetPlatform(platform: DatabasePlatform): void {
        if (this._platform !== platform) {
            this._platform = platform;
            this.applyPlatformOverrides();
        }
    }

    /**
     * The filters rendered for one dialect, every filter with its implementation. Built once per
     * dialect key and kept; the process-wide platform plays no part.
     * @param dialectKey The dialect the SQL is written in, such as `'sqlserver'` or `'postgresql'`.
     * @throws Error when no dialect is registered under the key.
     */
    public GetFiltersForDialect(dialectKey: DialectKey): RunQuerySQLFilter[] {
        return Array.from(this.dialectFilterMap(dialectKey).values());
    }

    /** The filters for `dialectKey`, built on first use. */
    private dialectFilterMap(dialectKey: DialectKey): ReadonlyMap<string, RunQuerySQLFilter> {
        let filters = this._dialectFilters.get(dialectKey);
        if (!filters) {
            const overrides = dialectFilterImplementations(GetQueryDialect(dialectKey));
            filters = new Map(RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS
                .filter(filter => filter.implementation)
                .map((filter): [string, RunQuerySQLFilter] => [filter.name, { ...filter, implementation: overrides[filter.name] ?? filter.implementation }]));
            this._dialectFilters.set(dialectKey, filters);
        }
        return filters;
    }

    /**
     * Gets a filter by name
     * @param name The filter name
     * @param dialectKey The dialect to render for; the process-wide default platform when omitted.
     * @returns The filter with implementation or undefined if not found
     */
    public GetFilter(name: string, dialectKey?: DialectKey): RunQuerySQLFilter | undefined {
        return dialectKey === undefined ? this._filters.get(name) : this.dialectFilterMap(dialectKey).get(name);
    }

    /** @deprecated Use {@link GetFilter}. */
    public getFilter(name: string): RunQuerySQLFilter | undefined {
        return this.GetFilter(name);
    }

    /**
     * Gets all available filter names
     * @returns Array of filter names
     */
    public GetFilterNames(): string[] {
        return Array.from(this._filters.keys());
    }

    /** @deprecated Use {@link GetFilterNames}. */
    public getFilterNames(): string[] {
        return this.GetFilterNames();
    }

    /**
     * Gets all filters with implementations
     * @returns Array of all filters
     */
    public GetAllFilters(): RunQuerySQLFilter[] {
        return Array.from(this._filters.values());
    }

    /** @deprecated Use {@link GetAllFilters}. */
    public getAllFilters(): RunQuerySQLFilter[] {
        return this.GetAllFilters();
    }

    /**
     * Executes a filter function by name
     * @param filterName The name of the filter to execute
     * @param value The value to filter
     * @param dialectKey The dialect to render for; the process-wide default platform when omitted.
     * @returns The filtered result
     * @throws Error if filter is not found or execution fails
     */
    public ExecuteFilter(filterName: string, value: unknown, dialectKey?: DialectKey): unknown {
        const filter = this.GetFilter(filterName, dialectKey);
        if (!filter || !filter.implementation) {
            throw new Error(`Filter '${filterName}' not found or has no implementation`);
        }
        return filter.implementation(value);
    }

    /** @deprecated Use {@link ExecuteFilter}. */
    public executeFilter(filterName: string, value: unknown): unknown {
        return this.ExecuteFilter(filterName, value);
    }
}