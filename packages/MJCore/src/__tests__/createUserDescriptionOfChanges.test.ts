import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase, FieldChange } from '../generic/databaseProviderBase';

describe('CreateUserDescriptionOfChanges', () => {
    it('treats 0, false and empty string as values; only null and undefined are absent', () => {
        // the method is pure: a provider object with no connection is enough
        const provider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
        const describeChange = (oldValue: unknown, newValue: unknown): string => {
            const change: FieldChange = { field: 'F', oldValue, newValue };
            return provider.CreateUserDescriptionOfChanges({ F: change });
        };
        const cases: [unknown, unknown, string][] = [
            [null, 0, 'F set to 0'],
            [undefined, false, 'F set to false'],
            [null, '', 'F set to '],
            [0, null, 'F cleared from 0'],
            [false, undefined, 'F cleared from false'],
            [5, 0, 'F changed from 5 to 0'],
            [true, false, 'F changed from true to false'],
            [null, undefined, ''],
        ];
        for (const [oldValue, newValue, expected] of cases) {
            expect({ oldValue, newValue, text: describeChange(oldValue, newValue) }).toEqual({ oldValue, newValue, text: expected });
        }
    });
});
