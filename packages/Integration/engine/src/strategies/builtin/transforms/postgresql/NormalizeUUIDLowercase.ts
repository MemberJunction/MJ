import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Lowercases UUID strings destined for PostgreSQL UUID columns.
 * PostgreSQL normalizes UUIDs to lowercase, so pre-normalizing prevents
 * case-mismatch issues in lookups and comparisons.
 */
export class NormalizeUUIDLowercaseRule implements TransformRule {
    public readonly Name: string = 'NormalizeUUIDLowercase';
    public readonly Description: string = 'Lowercases UUID strings for PostgreSQL UUID columns';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = 'postgresql';

    /**
     * Standard UUID pattern: 8-4-4-4-12 hexadecimal digits.
     * Matches both upper and lower case hex characters.
     */
    private static readonly uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    public Apply(_fieldName: string, value: unknown, fieldType: string): unknown {
        if (
            fieldType.toLowerCase().includes('uuid') &&
            typeof value === 'string' &&
            NormalizeUUIDLowercaseRule.uuidPattern.test(value)
        ) {
            return value.toLowerCase();
        }
        return value;
    }
}
