/**
 * Array of all available SQL filters for parameterized queries.
 * These filters ensure safe SQL generation and prevent SQL injection attacks.
 * Implementation functions are added separately to keep this definition token-efficient for AI prompts.
 */
export const RUN_QUERY_SQL_FILTERS: RunQuerySQLFilter[] = [
    {
        name: 'sqlString',
        description: 'Safely escapes a string value for SQL queries by doubling single quotes and wrapping in quotes',
        exampleSyntax: "WHERE Name = {{ userName | sqlString }}",
        exampleInput: "O'Brien",
        exampleOutput: "'O''Brien'",
        notes: 'Returns NULL for null/undefined values. Always use this filter for string parameters in WHERE clauses.'
    },
    {
        name: 'sqlNumber',
        description: 'Validates and formats a numeric value for SQL queries',
        exampleSyntax: "WHERE Age > {{ minAge | sqlNumber }}",
        exampleInput: "25",
        exampleOutput: "25",
        notes: 'Throws an error if the value cannot be converted to a valid number. Handles both integers and decimals.'
    },
    {
        name: 'sqlDate',
        description: 'Formats a date value for SQL queries in ISO 8601 format',
        exampleSyntax: "WHERE CreatedDate >= {{ startDate | sqlDate }}",
        exampleInput: new Date('2024-01-15'),
        exampleOutput: "'2024-01-15T00:00:00.000Z'",
        notes: 'Accepts Date objects or parseable date strings. Returns NULL for null/undefined values.'
    },
    {
        name: 'sqlBoolean',
        description: 'Converts a boolean value to SQL bit representation (1 or 0)',
        exampleSyntax: "WHERE IsActive = {{ isActive | sqlBoolean }}",
        exampleInput: true,
        exampleOutput: "1",
        notes: 'Truthy values become 1, falsy values become 0. Useful for SQL Server bit columns.'
    },
    {
        name: 'sqlIdentifier',
        description: 'Safely formats a SQL identifier (table/column name) by wrapping in square brackets',
        exampleSyntax: "SELECT * FROM {{ tableName | sqlIdentifier }}",
        exampleInput: "UserAccounts",
        exampleOutput: "[UserAccounts]",
        notes: 'Only allows alphanumeric characters and underscores. Throws error for invalid identifiers to prevent SQL injection.'
    },
    {
        name: 'sqlIn',
        description: 'Formats an array of values for use with SQL IN operator',
        exampleSyntax: "WHERE Status IN {{ statusList | sqlIn }}",
        exampleInput: ['Active', 'Pending', 'Review'],
        exampleOutput: "('Active', 'Pending', 'Review')",
        notes: 'Automatically escapes string values. Returns (NULL) for empty arrays which will match no records. Supports mixed types (strings, numbers, nulls).'
    },
    {
        name: 'sqlNoKeywordsExpression',
        description: 'Validates and formats a SQL expression by ensuring it contains no dangerous keywords',
        exampleSyntax: "ORDER BY {{ orderClause | sqlNoKeywordsExpression }}",
        exampleInput: "Revenue DESC, CreatedDate ASC",
        exampleOutput: "Revenue DESC, CreatedDate ASC",
        notes: 'Blocks dangerous SQL keywords like DROP, DELETE, INSERT, UPDATE, EXEC, etc. Allows field names, ASC/DESC, basic functions, and arithmetic operators. Throws error if dangerous keywords detected.'
    }
];

/**
 * Gets a SQL filter definition by name
 * @param filterName The name of the filter to retrieve
 * @returns The filter definition or undefined if not found
 */
export function getRunQuerySQLFilter(filterName: string): RunQuerySQLFilter | undefined {
    return RUN_QUERY_SQL_FILTERS.find(f => f.name === filterName);
}

/**
 * Gets an array of all SQL filter names
 * @returns Array of filter names
 */
export function getRunQuerySQLFilterNames(): string[] {
    return RUN_QUERY_SQL_FILTERS.map(f => f.name);
}

/**
 * Represents a custom SQL filter that can be used in Nunjucks templates
 * for safe SQL query construction in RunQuery operations
 */
export interface RunQuerySQLFilter {
    /**
     * The name of the filter as used in templates (e.g., "sqlString")
     */
    name: string;
    
    /**
     * Human-readable description of what the filter does
     */
    description: string;
    
    /**
     * Example usage showing the filter syntax in a Nunjucks template
     */
    exampleSyntax: string;
    
    /**
     * Example input value
     */
    exampleInput: any;
    
    /**
     * Example output after filtering
     */
    exampleOutput: string;
    
    /**
     * Additional notes or warnings about using this filter
     */
    notes?: string;
    
    /**
     * Optional implementation function for the filter.
     * When provided, this function will be called to apply the filter.
     * This is separate from the definition to keep AI prompts token-efficient.
     */
    implementation?: (value: any) => any;
}