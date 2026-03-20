import { LogError } from '@memberjunction/core';
import { TransformRule, TargetDatabasePlatform } from '../../../TransformStrategy.js';

/**
 * Validates JSON strings before writing to PostgreSQL JSONB columns.
 * - If value is a string, attempts JSON.parse to verify validity; returns null on parse failure.
 * - If value is a non-null object, serializes it with JSON.stringify for storage.
 * - All other values pass through unchanged.
 */
export class ValidateJsonbRule implements TransformRule {
    public readonly Name: string = 'ValidateJsonb';
    public readonly Description: string = 'Validates JSON strings before writing to PostgreSQL JSONB columns';
    public readonly ConnectorName: string = '*';
    public readonly TargetPlatform: TargetDatabasePlatform | '*' = 'postgresql';

    public Apply(fieldName: string, value: unknown, fieldType: string): unknown {
        if (!fieldType.toLowerCase().includes('jsonb')) {
            return value;
        }

        if (typeof value === 'string') {
            return this.validateJsonString(fieldName, value);
        }

        if (value !== null && typeof value === 'object') {
            return JSON.stringify(value);
        }

        return value;
    }

    private validateJsonString(fieldName: string, value: string): string | null {
        try {
            JSON.parse(value);
            return value;
        } catch {
            LogError(`ValidateJsonb: Invalid JSON for field "${fieldName}", setting to null`);
            return null;
        }
    }
}
