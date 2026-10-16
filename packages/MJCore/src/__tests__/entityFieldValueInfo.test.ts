import { describe, it, expect } from 'vitest';
import { EntityFieldValueInfo } from '../generic/entityInfo';

describe('EntityFieldValueInfo', () => {
    describe('toJSON', () => {
        it('includes Description when present', () => {
            const info = new EntityFieldValueInfo({
                Value: 'Gold',
                Code: 'GLD',
                Description: 'Top tier customer',
            });

            const json = info.toJSON();
            expect(json).toEqual({
                Value: 'Gold',
                Code: 'GLD',
                Description: 'Top tier customer',
            });
            expect(JSON.parse(JSON.stringify(info))).toEqual({
                Value: 'Gold',
                Code: 'GLD',
                Description: 'Top tier customer',
            });
        });

        it('omits Description when null or undefined', () => {
            const info = new EntityFieldValueInfo({
                Value: 'Silver',
                Code: 'SLV',
            });

            const json = info.toJSON();
            expect(json.Value).toBe('Silver');
            expect(json.Code).toBe('SLV');
            expect(json.Description).toBeUndefined();
            expect(JSON.parse(JSON.stringify(info))).toEqual({
                Value: 'Silver',
                Code: 'SLV',
            });
        });
    });
});
