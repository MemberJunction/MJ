import { describe, it, expect } from 'vitest';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import { ContributionClaimRefusal, type ContributionClaimColumns } from '../custom/FormScope/FormContributionClaims';
import { ContributionSpecColumns } from '../custom/FormScope/FormContributionRow';

/**
 * The claim rules the database enforces with CHECK constraints, checked before anything is
 * written, so a spec the database would refuse never leaves a component behind.
 */

function columns(over: Partial<ContributionClaimColumns> = {}): ContributionClaimColumns {
    return {
        Presentation: 'panel', Inclusion: null, ChromeGroup: null, RelatedEntityID: null, RelatedJoinField: null,
        ReplacesSectionKey: null, ReplacesSectionKeys: null, ReplacesFieldNames: null, InSectionKey: null,
        SectionPosition: null, ...over,
    };
}

describe('ContributionClaimRefusal', () => {
    it('allows a panel that claims nothing', () => {
        expect(ContributionClaimRefusal(columns())).toBeNull();
    });

    it('allows each claim on its own', () => {
        const single: Partial<ContributionClaimColumns>[] = [
            { RelatedEntityID: 'ENT-TICKETS', RelatedJoinField: 'PersonID' },
            { ReplacesSectionKey: 'contact' },
            { ReplacesSectionKeys: '["contact","address"]' },
            { ReplacesFieldNames: '["Email"]', SectionPosition: 'end' },
            { InSectionKey: 'contact', SectionPosition: 'start' },
        ];
        for (const claim of single) expect(ContributionClaimRefusal(columns(claim))).toBeNull();
    });

    it('refuses two claims and names both', () => {
        const refusal = ContributionClaimRefusal(columns({ RelatedEntityID: 'ENT-TICKETS', ReplacesFieldNames: '["Email"]' }));
        expect(refusal).toMatch(/one claim/i);
        expect(refusal).toContain('relatedEntity');
        expect(refusal).toContain('replacesFieldNames');
    });

    it('refuses rail metadata on a bare panel', () => {
        expect(ContributionClaimRefusal(columns({ Presentation: 'bare', Inclusion: 'Primary' }))).toMatch(/bare/);
        expect(ContributionClaimRefusal(columns({ Presentation: 'bare', ChromeGroup: 'details' }))).toMatch(/bare/);
        expect(ContributionClaimRefusal(columns({ Presentation: 'panel', Inclusion: 'Primary', ChromeGroup: 'details' }))).toBeNull();
    });

    it('refuses a join field without a related entity', () => {
        expect(ContributionClaimRefusal(columns({ RelatedJoinField: 'PersonID' }))).toContain('relatedJoinField');
    });

    it('refuses a section position for a panel not drawn inside a section', () => {
        expect(ContributionClaimRefusal(columns({ SectionPosition: 'end' }))).toContain('sectionPosition');
        expect(ContributionClaimRefusal(columns({ ReplacesSectionKey: 'contact', SectionPosition: 'end' }))).toContain('sectionPosition');
    });
});

describe('ContributionSpecColumns', () => {
    const opts = { relatedEntityID: 'ENT-TICKETS', relatedEntityName: 'MJ_BizApps_Orders: Event Order Lines', componentName: 'TicketsPanel' };
    const spec = (over: Partial<FormContributionSpec>): FormContributionSpec =>
        ({ slot: 'after-fields', presentation: 'panel', title: 'Tickets', ...over });

    it('builds the row a spec would write, so a two-claim spec is refused before any write', () => {
        const row = ContributionSpecColumns(spec({ relatedEntity: opts.relatedEntityName, replacesFieldNames: ['Email'] }), opts);
        expect(row).toMatchObject({ RelatedEntityID: 'ENT-TICKETS', ReplacesFieldNames: '["Email"]' });
        expect(ContributionClaimRefusal(row)).toMatch(/one claim/i);
    });

    it('builds a row that passes for a spec with one claim', () => {
        const row = ContributionSpecColumns(spec({ relatedEntity: opts.relatedEntityName, relatedJoinField: 'PersonID' }), opts);
        expect(row.ContributionKey).toBe('related:MJ_BizApps_Orders: Event Order Lines:PersonID');
        expect(ContributionClaimRefusal(row)).toBeNull();
    });
});
