/**
 * @fileoverview SQL Filter Implementations for RunQuery
 * 
 * This module provides the actual implementation functions for RunQuery SQL filters.
 * This is separate from the filter definitions to keep AI prompts token-efficient.
 * 
 * @module @memberjunction/core/runQuerySQLFilterImplementations
 */

import { BaseSingleton } from '@memberjunction/global';
import { RUN_QUERY_SQL_FILTERS, RunQuerySQLFilter } from './querySQLFilters';

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

/**
 * SQL Filter implementation functions
 */
const FILTER_IMPLEMENTATIONS: Record<string, (value: any) => any> = {
    sqlString: (value: any) => {
        if (value === null || value === undefined) return 'NULL';
        return `'${String(value).replace(/'/g, "''")}'`;
    },
    
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
    
    sqlBoolean: (value: any) => {
        return value ? '1' : '0';
    },
    
    sqlIdentifier: (value: any) => {
        if (!value) throw new Error('Identifier cannot be empty');
        const identifier = String(value);
        // Basic SQL injection prevention for identifiers
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
            throw new Error(`Invalid SQL identifier: ${identifier}`);
        }
        return `[${identifier}]`;
    },
    
    sqlIn: (values: any[]) => {
        if (!Array.isArray(values) || values.length === 0) {
            return '(NULL)'; // This will match nothing
        }
        const escaped = values.map(v => {
            if (typeof v === 'string') {
                return `'${v.replace(/'/g, "''")}'`;
            } else if (typeof v === 'number') {
                return v;
            } else if (v === null || v === undefined) {
                return 'NULL';
            }
            return `'${String(v).replace(/'/g, "''")}'`;
        });
        return `(${escaped.join(', ')})`;
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
 * Singleton class for managing RunQuery SQL filters with implementations.
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 */
export class RunQuerySQLFilterManager extends BaseSingleton<RunQuerySQLFilterManager> {
    private _filters: Map<string, RunQuerySQLFilter> = new Map();

    /**
     * Use RunQuerySQLFilterManager.Instance to get the singleton instance.
     */
    public constructor() {
        super();
        // Initialize with all filters that have implementations
        RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS.forEach(filter => {
            if (filter.implementation) {
                this._filters.set(filter.name, filter);
            }
        });
    }

    /**
     * Gets the singleton instance
     */
    public static get Instance(): RunQuerySQLFilterManager {
        return RunQuerySQLFilterManager.getInstance<RunQuerySQLFilterManager>();
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
    public executeFilter(filterName: string, value: any): any {
        const filter = this._filters.get(filterName);
        if (!filter || !filter.implementation) {
            throw new Error(`Filter '${filterName}' not found or has no implementation`);
        }
        return filter.implementation(value);
    }
}