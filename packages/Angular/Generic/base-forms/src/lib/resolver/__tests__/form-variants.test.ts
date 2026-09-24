import { describe, it, expect } from 'vitest';
import { FormVariantChoices } from '../form-variants';
import type { EntityFormOverrideRow } from '../form-resolver.service';

/**
 * The picker is the swap surface. Applying a second custom form sets the first aside
 * rather than merging into it, so a set-aside row that the picker dropped would be a form
 * the user can never get back to.
 */
function row(over: Partial<EntityFormOverrideRow> & { ID: string }): EntityFormOverrideRow {
    return {
        EntityID: 'e1', ComponentID: 'c1', Scope: 'User', UserID: 'u1', RoleID: null,
        Priority: 0, Status: 'Active', Name: 'A Form', ...over,
    };
}

describe('FormVariantChoices', () => {
    it('offers the live form and the ones set aside', () => {
        const choices = FormVariantChoices([
            row({ ID: '1', Name: 'Ops Form', Status: 'Active' }),
            row({ ID: '2', Name: 'Finance Form', Status: 'Inactive' }),
        ]);
        expect(choices.map((c) => [c.Label, c.Status])).toEqual([
            ['Ops Form', 'Active'],
            ['Finance Form', 'Inactive'],
        ]);
    });

    it('leaves out an unfinished draft', () => {
        const choices = FormVariantChoices([
            row({ ID: '1', Name: 'Ops Form', Status: 'Active' }),
            row({ ID: '2', Name: 'Half-built', Status: 'Pending' }),
        ]);
        expect(choices).toHaveLength(1);
    });

    it('offers one entry per form, not one per version', () => {
        // Newest first within a name, which is the order the resolver returns.
        const choices = FormVariantChoices([
            row({ ID: '3', Name: 'Ops Form', Status: 'Active' }),
            row({ ID: '2', Name: 'Ops Form', Status: 'Inactive' }),
            row({ ID: '1', Name: 'Ops Form', Status: 'Inactive' }),
        ]);
        expect(choices.map((c) => c.ID)).toEqual(['3']);
    });

    it('keeps the newest of a form whose versions are all set aside', () => {
        const choices = FormVariantChoices([
            row({ ID: '2', Name: 'Retired Form', Status: 'Inactive' }),
            row({ ID: '1', Name: 'Retired Form', Status: 'Inactive' }),
        ]);
        expect(choices.map((c) => c.ID)).toEqual(['2']);
    });

    it('names an unnamed override by its id rather than showing a blank row', () => {
        expect(FormVariantChoices([row({ ID: 'abcdef12-0000', Name: undefined })])[0].Label)
            .toBe('Override abcdef12');
    });
});
