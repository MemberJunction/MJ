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
import { GetDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

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
 * Allowed keywords and functions for ORDER BY and similar expressions
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
    'BETWEEN', 'IN'
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
 * literals, booleans, identifiers and the three LIKE filters. Every platform difference comes
 * from the dialect, so a new platform needs no change here.
 */
function dialectFilterImplementations(dialect: SQLDialect): Record<string, (value: any) => any> {
    return {
        sqlString: (value: unknown) => (value === null || value === undefined ? 'NULL' : textLiteral(value, dialect)),
        sqlIn: (values: unknown) => {
            if (!Array.isArray(values) || values.length === 0) {
                return '(NULL)'; // matches nothing
            }
            const items = values.map(v => typeof v === 'number' ? String(v) : v === null || v === undefined ? 'NULL' : textLiteral(v, dialect));
            return `(${items.join(', ')})`;
        },
        sqlBoolean: (value: unknown) => dialect.BooleanLiteral(Boolean(value)),
        sqlIdentifier: (value: unknown) => {
            if (!value) throw new Error('Identifier cannot be empty');
            const identifier = String(value);
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
                throw new Error(`Invalid SQL identifier: ${identifier}`);
            }
            return dialect.QuoteIdentifier(identifier);
        },
        sqlLikeContains: (value: any) => likeLiteral(value, 'both', dialect),
        sqlLikeBegins: (value: any) => likeLiteral(value, 'trailing', dialect),
        sqlLikeEnds: (value: any) => likeLiteral(value, 'leading', dialect),
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
function likeLiteral(value: unknown, wildcardSide: 'leading' | 'trailing' | 'both', dialect: SQLDialect): string {
    if (value === null || value === undefined) return 'NULL';
    const stripped = stripBoundaryWildcards(String(value), wildcardSide);
    const pattern = dialect.EscapeLikePattern(stripped.replace(/'/g, "''"));
    const before = wildcardSide === 'trailing' ? '' : '%';
    const after = wildcardSide === 'leading' ? '' : '%';
    return `${dialect.StringLiteralPrefix(stripped)}'${before}${pattern}${after}'`;
}

/** A string literal for `value` with the dialect's prefix, quotes escaped. */
function textLiteral(value: unknown, dialect: SQLDialect): string {
    const text = String(value);
    return `${dialect.StringLiteralPrefix(text)}'${EscapeSQLString(text)}'`;
}

/**
 * Singleton class for managing RunQuery SQL filters with implementations.
 * Supports platform-specific filter behavior via SetPlatform().
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 */
export class RunQuerySQLFilterManager extends BaseSingleton<RunQuerySQLFilterManager> {
    private _filters: Map<string, RunQuerySQLFilter> = new Map();
    private _platform: DatabasePlatform = DEFAULT_FILTER_PLATFORM;

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
     * Sets the database platform, updating platform-sensitive filters accordingly.
     * Call this during provider initialization to match the active database platform.
     */
    public SetPlatform(platform: DatabasePlatform): void {
        if (this._platform !== platform) {
            this._platform = platform;
            this.applyPlatformOverrides();
        }
    }

    /**
     * Gets a filter by name
     * @param name The filter name
     * @returns The filter with implementation or undefined if not found
     */
    public getFilter(name: string): RunQuerySQLFilter | undefined {
        return this._filters.get(name);
    }

    /**
     * Gets all available filter names
     * @returns Array of filter names
     */
    public getFilterNames(): string[] {
        return Array.from(this._filters.keys());
    }

    /**
     * Gets all filters with implementations
     * @returns Array of all filters
     */
    public getAllFilters(): RunQuerySQLFilter[] {
        return Array.from(this._filters.values());
    }

    /**
     * Executes a filter function by name
     * @param filterName The name of the filter to execute
     * @param value The value to filter
     * @returns The filtered result
     * @throws Error if filter is not found or execution fails
     */
    public executeFilter(filterName: string, value: unknown): unknown {
        const filter = this._filters.get(filterName);
        if (!filter || !filter.implementation) {
            throw new Error(`Filter '${filterName}' not found or has no implementation`);
        }
        return filter.implementation(value);
    }
}