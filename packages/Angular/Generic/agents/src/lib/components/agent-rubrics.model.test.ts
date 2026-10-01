import { describe, expect, it } from 'vitest';
import { DisableLink, MakeDefaultLink } from './agent-rubrics.model';

describe('agent rubric links', () => {
    it('leaves only the newly saved Evaluation link as the default', () => {
        const next = MakeDefaultLink([
            { ID: 'first', Purpose: 'Evaluation', Status: 'Active', IsDefault: true },
            { ID: 'second', Purpose: 'Evaluation', Status: 'Active', IsDefault: false },
            { ID: 'check', Purpose: 'SelfCheck', Status: 'Active', IsDefault: true },
        ], 'second');
        expect(next.find(row => row.ID === 'first')?.IsDefault).toBe(false);
        expect(next.find(row => row.ID === 'second')?.IsDefault).toBe(true);
        expect(next.find(row => row.ID === 'check')?.IsDefault).toBe(true);
    });

    it('turns a link off without deleting it, and it is no longer the default', () => {
        expect(DisableLink({ ID: 'first', Purpose: 'Evaluation', Status: 'Active', IsDefault: true })).toEqual({
            ID: 'first',
            Purpose: 'Evaluation',
            Status: 'Disabled',
            IsDefault: false,
        });
    });
});
