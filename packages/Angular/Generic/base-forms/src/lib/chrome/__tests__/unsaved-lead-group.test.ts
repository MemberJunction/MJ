import { describe, expect, it } from 'vitest';
import { UnsavedLeadGroupKey } from '../form-chrome-rail-pref';

/**
 * Where a NEW record opens.
 *
 * `ShouldPersistChromeActiveGroup` already says an unsaved record must not restore a stored rail
 * position. It did not say where the record should go instead, so it fell through to the lead group —
 * and a lead group is usually a summary. A summary of a record with no data is a page of blanks the
 * user has to look past to find where typing starts, which is what
 * `bc-aidp-next-golive#188` reported against the Deal form.
 *
 * This answers the other half: a contribution may declare `leadsWhenUnsaved` and be opened instead.
 *
 * OPT-IN IS THE WHOLE DESIGN. Every form that declares nothing must behave exactly as it did, so the
 * null cases below matter more than the positive one — a change to the default would alter where every
 * new record in every MJ app opens, which is not a thing to do on one report about one form.
 */

type Meta = { entity?: string; leadsWhenUnsaved?: boolean; contributionKey?: string };
const railKey = (m: Meta) => m.contributionKey ?? null;
const reg = (entity: string, key: string, leads?: boolean, priority = 0) => ({
    Priority: priority,
    Metadata: { entity, contributionKey: key, ...(leads === undefined ? {} : { leadsWhenUnsaved: leads }) },
});

describe('a contribution can claim the lead for an unsaved record', () => {
    it('returns the key of the contribution that declared it', () => {
        const regs = [reg('Deals', 'overview'), reg('Deals', 'pipeline', true)];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBe('pipeline');
    });

    it('ignores contributions belonging to another entity', () => {
        const regs = [reg('Contacts', 'contact-detail', true), reg('Deals', 'pipeline', true)];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBe('pipeline');
    });

    /**
     * Same rule as every other conflict between registrations: highest ClassFactory Priority wins.
     * Anything else would make the outcome depend on import order.
     */
    it('takes the highest priority when two contributions claim it', () => {
        const regs = [reg('Deals', 'low', true, 1), reg('Deals', 'high', true, 9)];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBe('high');
    });

    it('skips a claimant whose rail key cannot be derived', () => {
        const regs = [
            { Priority: 9, Metadata: { entity: 'Deals', leadsWhenUnsaved: true } as Meta },
            reg('Deals', 'pipeline', true, 1),
        ];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBe('pipeline');
    });
});

describe('and otherwise changes nothing', () => {
    it('returns null when no contribution declares it', () => {
        const regs = [reg('Deals', 'overview'), reg('Deals', 'pipeline')];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBeNull();
    });

    /**
     * `leadsWhenUnsaved: false` is a form saying no. It must read the same as saying nothing, or the
     * flag becomes impossible to turn off once set.
     */
    it('treats an explicit false as no claim', () => {
        const regs = [reg('Deals', 'pipeline', false)];
        expect(UnsavedLeadGroupKey('Deals', regs, railKey)).toBeNull();
    });

    it('returns null without an entity name', () => {
        const regs = [reg('Deals', 'pipeline', true)];
        expect(UnsavedLeadGroupKey(null, regs, railKey)).toBeNull();
        expect(UnsavedLeadGroupKey(undefined, regs, railKey)).toBeNull();
    });

    it('returns null when there are no registrations at all', () => {
        expect(UnsavedLeadGroupKey('Deals', [], railKey)).toBeNull();
    });

    it('survives a registration with no metadata', () => {
        expect(UnsavedLeadGroupKey('Deals', [{ Priority: 1 }], railKey)).toBeNull();
    });

    /**
     * The caller passes its own registrations array; sorting must not reorder it, because the same
     * array drives the rail elsewhere and a reordered rail is a visible defect.
     */
    it('does not mutate the caller’s array', () => {
        const regs = [reg('Deals', 'a', true, 1), reg('Deals', 'b', true, 9)];
        const order = regs.map((r) => r.Metadata.contributionKey);
        UnsavedLeadGroupKey('Deals', regs, railKey);
        expect(regs.map((r) => r.Metadata.contributionKey)).toEqual(order);
    });
});
