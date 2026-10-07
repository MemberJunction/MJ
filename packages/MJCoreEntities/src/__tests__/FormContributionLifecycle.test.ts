import { describe, it, expect } from 'vitest';
import {
    ActiveContributionSiblings,
    FormLifecycleComponentStatus,
    SameFormAudience,
    type FormScopedRow,
} from '../custom/FormScope/FormContributionLifecycle';

/**
 * Turning a panel on retires the one live under the same key for the same audience, in the same
 * transaction. The server action and the form's Manage drawer both ask this rule which rows those
 * are, so a person and an agent cannot leave two live versions of one panel behind.
 */

const ME = 'user-me';

function row(over: Partial<FormScopedRow> & { ID: string }): FormScopedRow {
    return {
        EntityID: 'ent-1', Status: 'Active', Scope: 'User', UserID: ME, RoleID: null,
        ContributionKey: 'panel:Cohort', ...over,
    };
}

describe('FormLifecycleComponentStatus', () => {
    it('mirrors each lifecycle status onto the component', () => {
        expect(FormLifecycleComponentStatus('Active')).toBe('Published');
        expect(FormLifecycleComponentStatus('Pending')).toBe('Draft');
        expect(FormLifecycleComponentStatus('Inactive')).toBe('Deprecated');
    });
});

describe('SameFormAudience', () => {
    it('matches personal rows by owner', () => {
        expect(SameFormAudience(row({ ID: 'a' }), row({ ID: 'b', UserID: 'USER-ME' }))).toBe(true);
        expect(SameFormAudience(row({ ID: 'a' }), row({ ID: 'b', UserID: 'user-other' }))).toBe(false);
    });

    it('matches role rows by role, and every Global row with every other', () => {
        const sales = { Scope: 'Role', UserID: null, RoleID: 'role-sales' };
        expect(SameFormAudience(sales, { ...sales })).toBe(true);
        expect(SameFormAudience(sales, { ...sales, RoleID: 'role-ops' })).toBe(false);
        expect(SameFormAudience({ Scope: 'Global', UserID: null, RoleID: null }, { Scope: 'Global', UserID: 'x', RoleID: 'y' })).toBe(true);
    });

    it('never matches across scopes', () => {
        expect(SameFormAudience(row({ ID: 'a' }), row({ ID: 'b', Scope: 'Global', UserID: null }))).toBe(false);
    });
});

describe('ActiveContributionSiblings', () => {
    const target = row({ ID: 'new', Status: 'Pending' });

    it('names the live row with the same key for the same audience', () => {
        const live = row({ ID: 'old' });
        expect(ActiveContributionSiblings([target, live], target).map((r) => r.ID)).toEqual(['old']);
    });

    it('leaves rows for other audiences, other keys, other entities and rows already off', () => {
        const rows = [
            row({ ID: 'global', Scope: 'Global', UserID: null }),
            row({ ID: 'someone', UserID: 'user-other' }),
            row({ ID: 'other-key', ContributionKey: 'panel:Other' }),
            row({ ID: 'other-entity', EntityID: 'ent-2' }),
            row({ ID: 'off', Status: 'Inactive' }),
            row({ ID: 'draft', Status: 'Pending' }),
        ];
        expect(ActiveContributionSiblings(rows, target)).toEqual([]);
    });

    it('retires a live row whose key differs only by case or padding, as the unique index would see it', () => {
        const padded = row({ ID: 'padded', ContributionKey: ' panel:Cohort ' });
        const recased = row({ ID: 'recased', ContributionKey: 'PANEL:COHORT' });
        expect(ActiveContributionSiblings([padded, recased], target).map((r) => r.ID)).toEqual(['padded', 'recased']);
    });

    it('never names the target itself', () => {
        const live = row({ ID: 'NEW' });
        expect(ActiveContributionSiblings([live], target)).toEqual([]);
    });

    it('finds no sibling for a panel with no key', () => {
        const keyless = row({ ID: 'new', ContributionKey: '  ' });
        expect(ActiveContributionSiblings([row({ ID: 'old', ContributionKey: null })], keyless)).toEqual([]);
    });

    it('matches a role row only within its role', () => {
        const forSales = row({ ID: 'sales-new', Scope: 'Role', UserID: null, RoleID: 'role-sales', Status: 'Pending' });
        const rows = [
            row({ ID: 'sales-old', Scope: 'Role', UserID: null, RoleID: 'role-sales' }),
            row({ ID: 'ops-old', Scope: 'Role', UserID: null, RoleID: 'role-ops' }),
        ];
        expect(ActiveContributionSiblings(rows, forSales).map((r) => r.ID)).toEqual(['sales-old']);
    });
});
