import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Coerces string and numeric boolean representations to actual booleans
 * for PostgreSQL BOOLEAN columns.
 *
 * String mappings (case-insensitive):
 *   'true', '1', 'yes' -> true
 *   'false', '0', 'no' -> false
 *
 * Numeric mappings:
 *   0 -> false
 *   non-zero -> true
 */
export class CoerceBooleanStringsRule implements TransformRule {
    public readonly Name: string = 'CoerceBooleanStrings';
    public readonly Description: string = 'Converts string and numeric booleans to actual booleans for PostgreSQL BOOLEAN columns';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = 'postgresql';

    private static readonly truthyStrings: ReadonlySet<string> = new Set(['true', '1', 'yes']);
    private static readonly falsyStrings: ReadonlySet<string> = new Set(['false', '0', 'no']);

    public Apply(_fieldName: string, value: unknown, fieldType: string): unknown {
        if (!fieldType.toLowerCase().includes('boolean')) {
            return value;
        }

        if (typeof value === 'string') {
            return this.coerceString(value);
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        return value;
    }

    private coerceString(value: string): boolean | string {
        const normalized = value.toLowerCase();
        if (CoerceBooleanStringsRule.truthyStrings.has(normalized)) {
            return true;
        }
        if (CoerceBooleanStringsRule.falsyStrings.has(normalized)) {
            return false;
        }
        // Unrecognized string; return as-is and let the database handle it
        return value;
    }
}
