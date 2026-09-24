import { describe, it, expect } from 'vitest';
import {
    AudienceColumns,
    LiveContributionAt,
    LiveOverrideAt,
    type ScopedRow,
} from '../form-audience';

/**
 * Publishing changes who a form or panel is for. Under the one-row decision the item's own
 * audience changes — and whatever was live for that audience before has to be retired in the same
 * transaction, or the audience sees two, or the unique index refuses the write.
 */

const ME = 'user-me';
const SALES = 'role-sales';

function row(over: Partial<ScopedRow> & { ID: string }): ScopedRow {
    return {
        EntityID: 'ent-1', Status: 'Active', Scope: 'Global', RoleID: null, UserID: null,
        ContributionKey: 'panel:Cohort', ...over,
    };
}

describe('AudienceColumns', () => {
    it('makes a personal item the caller\'s own', () => {
        expect(AudienceColumns({ Scope: 'User', RoleID: null }, ME)).toEqual({ Scope: 'User', RoleID: null, UserID: ME });
    });

    it('aims a role item at the role, owned by no one', () => {
        expect(AudienceColumns({ Scope: 'Role', RoleID: SALES }, ME)).toEqual({ Scope: 'Role', RoleID: SALES, UserID: null });
    });

    it('aims an everyone item at nobody in particular', () => {
        expect(AudienceColumns({ Scope: 'Global', RoleID: SALES }, ME)).toEqual({ Scope: 'Global', RoleID: null, UserID: null });
    });
});

describe('LiveContributionAt', () => {
    const target = row({ ID: 'mine', Scope: 'User', UserID: ME });

    it('finds the panel live for that audience under the same key', () => {
        const live = row({ ID: 'old-global' });
        expect(LiveContributionAt([target, live], target, { Scope: 'Global', RoleID: null }, ME)?.ID).toBe('old-global');
    });

    it('ignores a live panel under another key — that one is a different panel', () => {
        const other = row({ ID: 'other', ContributionKey: 'panel:Other' });
        expect(LiveContributionAt([target, other], target, { Scope: 'Global', RoleID: null }, ME)).toBeNull();
    });

    it('ignores one live for a different audience', () => {
        const forSales = row({ ID: 'sales', Scope: 'Role', RoleID: SALES });
        expect(LiveContributionAt([target, forSales], target, { Scope: 'Global', RoleID: null }, ME)).toBeNull();
    });

    it('ignores one that is already switched off', () => {
        const off = row({ ID: 'off', Status: 'Inactive' });
        expect(LiveContributionAt([target, off], target, { Scope: 'Global', RoleID: null }, ME)).toBeNull();
    });

    it('never names the item being published', () => {
        const alreadyGlobal = row({ ID: 'mine' });
        expect(LiveContributionAt([alreadyGlobal], alreadyGlobal, { Scope: 'Global', RoleID: null }, ME)).toBeNull();
    });

    it('matches the role exactly for a role audience', () => {
        const forSales = row({ ID: 'sales', Scope: 'Role', RoleID: SALES });
        const forOps = row({ ID: 'ops', Scope: 'Role', RoleID: 'role-ops' });
        const found = LiveContributionAt([target, forSales, forOps], target, { Scope: 'Role', RoleID: SALES }, ME);
        expect(found?.ID).toBe('sales');
    });

    it('compares keys and ids case-insensitively', () => {
        const live = row({ ID: 'old', ContributionKey: 'PANEL:COHORT', EntityID: 'ENT-1' });
        expect(LiveContributionAt([target, live], target, { Scope: 'Global', RoleID: null }, ME)?.ID).toBe('old');
    });
});

/** A full custom form has no key: one form is live per entity and audience, whichever it is. */
describe('LiveOverrideAt', () => {
    const target = row({ ID: 'mine', Scope: 'User', UserID: ME, ContributionKey: null });

    it('finds whichever form is live for that audience on the same entity', () => {
        const live = row({ ID: 'other-form', ContributionKey: null });
        expect(LiveOverrideAt([target, live], target, { Scope: 'Global', RoleID: null }, ME)?.ID).toBe('other-form');
    });

    it('ignores a form on another entity', () => {
        const elsewhere = row({ ID: 'elsewhere', EntityID: 'ent-2', ContributionKey: null });
        expect(LiveOverrideAt([target, elsewhere], target, { Scope: 'Global', RoleID: null }, ME)).toBeNull();
    });

    it('finds the caller\'s own live form when unpublishing back to them', () => {
        const published = row({ ID: 'published', ContributionKey: null });
        const myLive = row({ ID: 'my-live', Scope: 'User', UserID: ME, ContributionKey: null });
        expect(LiveOverrideAt([published, myLive], published, { Scope: 'User', RoleID: null }, ME)?.ID).toBe('my-live');
    });
});
