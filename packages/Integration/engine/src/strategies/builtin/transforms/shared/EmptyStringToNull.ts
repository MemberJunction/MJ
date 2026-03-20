import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Converts empty strings to null. Applies to all connectors and all platforms.
 * This prevents empty-string values from being written to the database where
 * NULL is the more appropriate representation of "no data."
 */
export class EmptyStringToNullRule implements TransformRule {
    public readonly Name: string = 'EmptyStringToNull';
    public readonly Description: string = 'Converts empty strings to null';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = '*';

    public Apply(_fieldName: string, value: unknown, _fieldType: string): unknown {
        if (value === '') {
            return null;
        }
        return value;
    }
}
