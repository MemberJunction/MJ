import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Ensures datetime strings are valid ISO 8601 for PostgreSQL TIMESTAMPTZ columns.
 * - If value is a string, parses it with `new Date()` and returns the ISO string.
 * - If the parsed date is invalid (NaN), returns null.
 * - Non-string values pass through unchanged.
 */
export class CoerceTimestamptzRule implements TransformRule {
    public readonly Name: string = 'CoerceTimestamptz';
    public readonly Description: string = 'Ensures datetime strings are ISO 8601 for PostgreSQL TIMESTAMPTZ columns';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = 'postgresql';

    public Apply(_fieldName: string, value: unknown, fieldType: string): unknown {
        if (!fieldType.toLowerCase().includes('timestamptz')) {
            return value;
        }

        if (typeof value === 'string') {
            return this.coerceDateString(value);
        }

        return value;
    }

    private coerceDateString(value: string): string | null {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            return null;
        }
        return date.toISOString();
    }
}
