import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Trims leading and trailing whitespace from string values.
 * Applies to all connectors and all platforms.
 */
export class TrimWhitespaceRule implements TransformRule {
    public readonly Name: string = 'TrimWhitespace';
    public readonly Description: string = 'Trims leading and trailing whitespace from string values';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = '*';

    public Apply(_fieldName: string, value: unknown, _fieldType: string): unknown {
        if (typeof value === 'string') {
            return value.trim();
        }
        return value;
    }
}
