import { describe, it, expect } from 'vitest';
import { FormVariantChoices, IsSelectableOverride } from '../form-variants';
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

/** A shared form set to Inactive was retracted by whoever manages it; only the user's own set-aside forms stay offered. */
describe('FormVariantChoices — shared forms set aside', () => {
    it('leaves out a role or everyone form that was set aside', () => {
        const choices = FormVariantChoices([
            row({ ID: '1', Name: 'Ops Form', Status: 'Active', Scope: 'Global', UserID: null }),
            row({ ID: '2', Name: 'Retired Global', Status: 'Inactive', Scope: 'Global', UserID: null }),
            row({ ID: '3', Name: 'Retired Role', Status: 'Inactive', Scope: 'Role', UserID: null, RoleID: 'r1' }),
            row({ ID: '4', Name: 'My Old Form', Status: 'Inactive' }),
        ]);
        expect(choices.map((c) => c.ID)).toEqual(['1', '4']);
    });
});

describe('IsSelectableOverride', () => {
    it('allows a live form of any audience and the user\'s own form set aside', () => {
        expect(IsSelectableOverride({ Status: 'Active', Scope: 'Global' })).toBe(true);
        expect(IsSelectableOverride({ Status: 'Active', Scope: 'Role' })).toBe(true);
        expect(IsSelectableOverride({ Status: 'Inactive', Scope: 'User' })).toBe(true);
    });

    it('refuses a shared form set aside and every draft', () => {
        expect(IsSelectableOverride({ Status: 'Inactive', Scope: 'Global' })).toBe(false);
        expect(IsSelectableOverride({ Status: 'Inactive', Scope: 'Role' })).toBe(false);
        expect(IsSelectableOverride({ Status: 'Pending', Scope: 'User' })).toBe(false);
    });
});
