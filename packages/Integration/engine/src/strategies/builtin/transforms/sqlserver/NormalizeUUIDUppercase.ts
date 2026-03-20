import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Uppercases UUID strings destined for SQL Server UNIQUEIDENTIFIER columns.
 * SQL Server normalizes UUIDs to uppercase, so pre-normalizing prevents
 * case-mismatch issues in lookups and comparisons.
 */
export class NormalizeUUIDUppercaseRule implements TransformRule {
    public readonly Name: string = 'NormalizeUUIDUppercase';
    public readonly Description: string = 'Uppercases UUID strings for SQL Server UNIQUEIDENTIFIER columns';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = 'sqlserver';

    /**
     * Standard UUID pattern: 8-4-4-4-12 hexadecimal digits.
     * Matches both upper and lower case hex characters.
     */
    private static readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    public Apply(_fieldName: string, value: unknown, fieldType: string): unknown {
        if (
            fieldType.toLowerCase().includes('uniqueidentifier') &&
            typeof value === 'string' &&
            NormalizeUUIDUppercaseRule.uuidPattern.test(value)
        ) {
            return value.toUpperCase();
        }
        return value;
    }
}
