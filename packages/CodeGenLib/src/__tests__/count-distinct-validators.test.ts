import { describe, it, expect } from 'vitest';
import { CountDistinctValidators } from '../runCodeGen';

describe('CountDistinctValidators', () => {
    it('returns 0 for an empty list', () => {
        expect(CountDistinctValidators([])).toBe(0);
    });

    it('counts a validator loaded twice once, ignoring entity name case', () => {
        expect(
            CountDistinctValidators([
                { entityName: 'MJ: Users', functionName: 'ValidateA' },
                { entityName: 'mj: users', functionName: 'ValidateA' },
                { entityName: 'MJ: Users', functionName: 'ValidateB' },
                { entityName: 'MJ: Roles', functionName: 'ValidateA' },
            ])
        ).toBe(3);
    });

    it('treats function names as case-sensitive', () => {
        expect(
            CountDistinctValidators([
                { entityName: 'E', functionName: 'validateA' },
                { entityName: 'E', functionName: 'ValidateA' },
            ])
        ).toBe(2);
    });
});
