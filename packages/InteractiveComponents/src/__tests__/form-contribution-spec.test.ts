import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '../component-spec';
import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    getDeclaredFormContribution,
    isFormPanelRole,
} from '../forms/form-contribution-spec';

function spec(over: Partial<ComponentSpec>): ComponentSpec {
    return over as unknown as ComponentSpec;
}

describe('isFormPanelRole', () => {
    it('is true only for componentRole form-panel', () => {
        expect(isFormPanelRole(spec({ componentRole: 'form-panel' }))).toBe(true);
        expect(isFormPanelRole(spec({ componentRole: 'form' }))).toBe(false);
        expect(isFormPanelRole(spec({}))).toBe(false);
    });
});

describe('getDeclaredFormContribution', () => {
    it('returns null when the spec is not a form panel', () => {
        expect(getDeclaredFormContribution(spec({ componentRole: 'form', formContribution: { title: 'x', slot: 'after-fields', presentation: 'panel' } }))).toBeNull();
    });

    it('fills slot and presentation defaults and trims the title', () => {
        const c = getDeclaredFormContribution(spec({
            componentRole: 'form-panel',
            title: 'Lifetime value',
            formContribution: { title: '  LTV strip  ' } as never,
        }));
        expect(c).toEqual({
            slot: DEFAULT_FORM_CONTRIBUTION_SLOT,
            presentation: 'panel',
            title: 'LTV strip',
            configuration: {},
        });
    });

    it('falls back to spec.title when the block has no title, and rejects unknown slots', () => {
        const noTitle = getDeclaredFormContribution(spec({ componentRole: 'form-panel', title: 'Renewals' }));
        expect(noTitle?.title).toBe('Renewals');
        expect(noTitle?.slot).toBe('after-fields');
        const badSlot = getDeclaredFormContribution(spec({
            componentRole: 'form-panel', title: 'x',
            formContribution: { title: 'x', slot: 'sidebar' } as never,
        }));
        expect(badSlot?.slot).toBe('after-fields');
    });

    it('passes through claims, inclusion, chrome group, icon, sortKey and configuration', () => {
        const c = getDeclaredFormContribution(spec({
            componentRole: 'form-panel',
            formContribution: {
                title: 'Tickets', slot: 'after-related', presentation: 'panel', sortKey: 80,
                contributionKey: 'related:tickets', relatedEntity: 'MJ_BizApps_Orders: Event Order Lines',
                relatedJoinField: 'PersonID', replacesSectionKey: undefined, inclusion: 'Primary',
                chromeGroup: 'more', icon: 'fa-solid fa-ticket', configuration: { pageSize: 25 },
            },
        }));
        expect(c).toMatchObject({
            slot: 'after-related', sortKey: 80, contributionKey: 'related:tickets',
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID',
            inclusion: 'Primary', chromeGroup: 'more', icon: 'fa-solid fa-ticket',
            configuration: { pageSize: 25 },
        });
    });
});
