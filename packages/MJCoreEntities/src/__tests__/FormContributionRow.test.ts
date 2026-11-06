import { describe, it, expect } from 'vitest';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import {
    ApplyContributionSpecToRow,
    ParseClaimedFieldNames,
    type ContributionRowOptions,
    type FormContributionSpecColumns,
} from '../custom/FormScope/FormContributionRow';

/**
 * Every write path builds a contribution row through this mapper, so it is tested column by
 * column: what a spec sets lands on the row, and what a spec does not set is cleared.
 */

const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
const NO_RELATED: ContributionRowOptions = { relatedEntityID: null, relatedEntityName: null, componentName: 'PersonLtvStrip' };
const TICKETS_RELATED: ContributionRowOptions = { relatedEntityID: 'ENT-TICKETS', relatedEntityName: TICKETS, componentName: 'TicketsPanel' };

function blankRow(): FormContributionSpecColumns {
    return {
        Slot: 'after-fields', SortKey: 0, Presentation: 'panel', Title: null, Icon: null, Configuration: null,
        Inclusion: null, ChromeGroup: null, RelatedEntityID: null, RelatedJoinField: null,
        ReplacesSectionKey: null, ReplacesSectionKeys: null, ReplacesFieldNames: null,
        InSectionKey: null, SectionPosition: null, ContributionKey: null,
    };
}

function spec(over: Partial<FormContributionSpec> = {}): FormContributionSpec {
    return { slot: 'before-fields', presentation: 'panel', title: 'Lifetime value', ...over };
}

describe('ApplyContributionSpecToRow', () => {
    it('writes every spec-derived column', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({
            sortKey: 5, icon: 'fa-solid fa-coins', configuration: { metric: 'ltv' },
            inclusion: 'Primary', chromeGroup: 'details', contributionKey: 'skip:person-ltv',
        }), NO_RELATED);
        expect(row).toEqual({
            ...blankRow(),
            Slot: 'before-fields', SortKey: 5, Presentation: 'panel', Title: 'Lifetime value',
            Icon: 'fa-solid fa-coins', Configuration: JSON.stringify({ metric: 'ltv' }),
            Inclusion: 'Primary', ChromeGroup: 'details', ContributionKey: 'skip:person-ltv',
        });
    });

    it('fills the default slot and sort key, and stores no configuration for an empty one', () => {
        const row = blankRow();
        row.SortKey = 9;
        ApplyContributionSpecToRow(row, spec({ slot: undefined, configuration: {} }), NO_RELATED);
        expect(row).toMatchObject({ Slot: 'after-fields', SortKey: 0, Configuration: null });
    });

    it('derives the key the way every write path does: related claim, else component name', () => {
        const related = blankRow();
        ApplyContributionSpecToRow(related, spec({ relatedJoinField: '[PersonID]' }), TICKETS_RELATED);
        expect(related.ContributionKey).toBe(`related:${TICKETS}:PersonID`);

        const panel = blankRow();
        ApplyContributionSpecToRow(panel, spec(), NO_RELATED);
        expect(panel.ContributionKey).toBe('panel:PersonLtvStrip');
    });

    it('writes the related claim with its join field', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({ relatedJoinField: 'PersonID' }), TICKETS_RELATED);
        expect(row).toMatchObject({ RelatedEntityID: 'ENT-TICKETS', RelatedJoinField: 'PersonID' });
    });

    it('drops a join field when there is no related entity to qualify', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({ relatedJoinField: 'PersonID' }), NO_RELATED);
        expect(row).toMatchObject({ RelatedEntityID: null, RelatedJoinField: null });
    });

    it('clears a previous related claim when the new spec claims fields', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({ relatedJoinField: 'PersonID' }), TICKETS_RELATED);
        ApplyContributionSpecToRow(row, spec({ replacesFieldNames: ['Email', ' Phone ', 'Email'] }), NO_RELATED);
        expect(row).toMatchObject({
            RelatedEntityID: null, RelatedJoinField: null,
            ReplacesFieldNames: '["Email","Phone"]', ContributionKey: 'panel:PersonLtvStrip',
        });
    });

    it('clears a previous field claim when the new spec claims a related grid', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({ replacesFieldNames: ['Email'], sectionPosition: 'end' }), NO_RELATED);
        ApplyContributionSpecToRow(row, spec({ relatedJoinField: 'PersonID' }), TICKETS_RELATED);
        expect(row).toMatchObject({
            ReplacesFieldNames: null, SectionPosition: null,
            RelatedEntityID: 'ENT-TICKETS', ContributionKey: `related:${TICKETS}:PersonID`,
        });
    });

    it('stores no field claim for a list with no usable names', () => {
        const row = blankRow();
        ApplyContributionSpecToRow(row, spec({ replacesFieldNames: [' ', ''] }), NO_RELATED);
        expect(row.ReplacesFieldNames).toBeNull();
    });

    it('clears Inclusion and ChromeGroup for a bare presentation', () => {
        const row = blankRow();
        row.Inclusion = 'More';
        row.ChromeGroup = 'more';
        ApplyContributionSpecToRow(row, spec({ presentation: 'bare', inclusion: 'Primary', chromeGroup: 'details' }), NO_RELATED);
        expect(row).toMatchObject({ Presentation: 'bare', Inclusion: null, ChromeGroup: null });
    });

    // One section always goes in the single-key column, whichever spec field named it, and a
    // position is kept only for a panel drawn inside a section.
    describe('section claims', () => {
        const sectionColumns = (row: FormContributionSpecColumns) => ({
            ReplacesSectionKey: row.ReplacesSectionKey, ReplacesSectionKeys: row.ReplacesSectionKeys,
            InSectionKey: row.InSectionKey, SectionPosition: row.SectionPosition,
        });

        it('stores several replaced sections as a JSON array', () => {
            const row = blankRow();
            ApplyContributionSpecToRow(row, spec({ replacesSectionKeys: ['identity', 'profile'] }), NO_RELATED);
            expect(sectionColumns(row)).toEqual({
                ReplacesSectionKey: null, ReplacesSectionKeys: '["identity","profile"]', InSectionKey: null, SectionPosition: null,
            });
        });

        it('stores one replaced section in the single-key column, from either field', () => {
            const a = blankRow();
            ApplyContributionSpecToRow(a, spec({ replacesSectionKeys: ['identity'] }), NO_RELATED);
            const b = blankRow();
            ApplyContributionSpecToRow(b, spec({ replacesSectionKey: 'identity' }), NO_RELATED);
            expect(sectionColumns(a)).toEqual(sectionColumns(b));
            expect(a.ReplacesSectionKey).toBe('identity');
            expect(a.ReplacesSectionKeys).toBeNull();
        });

        it('places a panel in a section at the position asked for', () => {
            const row = blankRow();
            ApplyContributionSpecToRow(row, spec({ inSectionKey: 'identity', sectionPosition: 'end' }), NO_RELATED);
            expect(sectionColumns(row)).toMatchObject({ InSectionKey: 'identity', SectionPosition: 'end', ReplacesSectionKey: null });
        });

        it('keeps a position for a field claim, and drops it for anything not drawn inside a section', () => {
            const fields = blankRow();
            ApplyContributionSpecToRow(fields, spec({ replacesFieldNames: ['Name'], sectionPosition: 'end' }), NO_RELATED);
            expect(fields.SectionPosition).toBe('end');
            const slot = blankRow();
            ApplyContributionSpecToRow(slot, spec({ sectionPosition: 'end' }), NO_RELATED);
            expect(slot.SectionPosition).toBeNull();
        });

        it('clears section claims a row had when the spec no longer makes them', () => {
            const row = { ...blankRow(), ReplacesSectionKey: 'old', ReplacesSectionKeys: '["a","b"]', InSectionKey: 'x', SectionPosition: 'end' as const };
            ApplyContributionSpecToRow(row, spec(), NO_RELATED);
            expect(sectionColumns(row)).toEqual({ ReplacesSectionKey: null, ReplacesSectionKeys: null, InSectionKey: null, SectionPosition: null });
        });
    });
});

describe('ParseClaimedFieldNames', () => {
    it('reads the names in a JSON array cell, trimmed and without repeats', () => {
        expect(ParseClaimedFieldNames('["Email"," Phone ","Email",""]')).toEqual(['Email', 'Phone']);
    });

    it('reads nothing from an empty, malformed or non-array cell', () => {
        expect(ParseClaimedFieldNames(null)).toEqual([]);
        expect(ParseClaimedFieldNames('  ')).toEqual([]);
        expect(ParseClaimedFieldNames('not json')).toEqual([]);
        expect(ParseClaimedFieldNames('{"a":1}')).toEqual([]);
    });
});
