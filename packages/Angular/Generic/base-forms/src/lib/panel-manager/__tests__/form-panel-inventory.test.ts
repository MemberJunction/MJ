import { describe, it, expect } from 'vitest';
import {
    BuildPanelInventory,
    GroupPanelInventory,
    ContributionState,
    DescribeReplacement,
    DescribeScope,
    SummarizeInventory,
    type FormPanelContributionRow,
    type FormPanelInventoryInput,
} from '../form-panel-inventory';

/**
 * The manager is the only place a user can take a panel off a form, so every line it
 * prints is something they will act on. A row that reports the wrong state, or offers a
 * button that cannot work, costs more than showing nothing.
 */
const CONTRIBUTION: FormPanelContributionRow = {
    ID: 'ROW-1',
    Name: 'Organization Member Overview',
    Title: 'Organization Member Overview',
    Icon: null,
    Slot: 'before-fields',
    Presentation: 'panel',
    Status: 'Active',
    Scope: 'User',
    ReplacesSectionKey: 'details',
    RelatedEntity: null,
    ChromeGroup: null,
    ContributionKey: 'panel:OrgMemberOverviewPanel',
};

const INPUT: FormPanelInventoryInput = {
    Contributions: [CONTRIBUTION],
    Compiled: [],
    StockGrids: [],
    FullCustomForm: false,
    TitleByKey: new Map([['details', 'Details']]),
};

describe('DescribeReplacement', () => {
    it('names a rail tab rather than printing its key', () => {
        expect(DescribeReplacement({ ReplacesSectionKey: '__mj_form_details', RelatedEntity: null }))
            .toBe('the whole Details tab');
        expect(DescribeReplacement({ ReplacesSectionKey: '__mj_form_more', RelatedEntity: null }))
            .toBe('the whole More tab');
    });

    it('names a section by its title when one is known', () => {
        expect(DescribeReplacement({ ReplacesSectionKey: 'details', RelatedEntity: null },
            new Map([['details', 'Details']]))).toBe('the Details section');
    });

    // Better a quoted key than a wrong name: the section may not be on the form any more.
    it('quotes the key when no title is known', () => {
        expect(DescribeReplacement({ ReplacesSectionKey: 'gone', RelatedEntity: null }))
            .toBe('the "gone" section');
    });

    it('names the grid when the claim is a relationship', () => {
        expect(DescribeReplacement({ ReplacesSectionKey: null, RelatedEntity: 'MoreCheese: Course Enrollments' }))
            .toBe('the MoreCheese: Course Enrollments grid');
    });

    it('says nothing when the panel replaces nothing', () => {
        expect(DescribeReplacement({ ReplacesSectionKey: null, RelatedEntity: null })).toBe('');
    });
});

describe('DescribeScope', () => {
    it('uses the same words the apply dialog used', () => {
        expect(DescribeScope('User')).toBe('Only me');
        expect(DescribeScope('Role')).toBe('My role');
        expect(DescribeScope('Global')).toBe('Everyone');
    });
});

/**
 * `held` exists because Active and rendering are not the same thing. A full custom form
 * owns the body, so an Active contribution behind one draws nothing, and a list that
 * called it Active would be describing the row instead of the form.
 */
describe('ContributionState', () => {
    it('separates a row that is on from a row that is on and rendering', () => {
        expect(ContributionState('Active', false)).toBe('active');
        expect(ContributionState('Active', true)).toBe('held');
    });

    it('reads Pending as a draft and anything else as off', () => {
        expect(ContributionState('Pending', false)).toBe('draft');
        expect(ContributionState('Inactive', false)).toBe('off');
    });
});

describe('BuildPanelInventory', () => {
    it('offers turning off, but not turning on, for a row that is already on', () => {
        const [item] = BuildPanelInventory(INPUT);
        expect(item.State).toBe('active');
        expect(item.CanTurnOff).toBe(true);
        expect(item.CanTurnOn).toBe(false);
        expect(item.CanRemove).toBe(true);
    });

    it('offers turning on for a draft', () => {
        const [item] = BuildPanelInventory({
            ...INPUT, Contributions: [{ ...CONTRIBUTION, Status: 'Pending' }],
        });
        expect(item.State).toBe('draft');
        expect(item.CanTurnOn).toBe(true);
        expect(item.CanTurnOff).toBe(false);
    });

    it('still offers turning off a held row, so the user is not stuck behind a full form', () => {
        const [item] = BuildPanelInventory({ ...INPUT, FullCustomForm: true });
        expect(item.State).toBe('held');
        expect(item.CanTurnOff).toBe(true);
        expect(item.CanRemove).toBe(true);
    });

    it('names what the row stands in for', () => {
        expect(BuildPanelInventory(INPUT)[0].Replaces).toBe('the Details section');
    });

    it('falls back to the row Name when it carries no title', () => {
        const [item] = BuildPanelInventory({
            ...INPUT, Contributions: [{ ...CONTRIBUTION, Title: '  ' }],
        });
        expect(item.Title).toBe('Organization Member Overview');
    });

    // A compiled panel is code and a stock grid is a relationship. Listing them accounts
    // for the form's contents; offering a button on them would not work.
    it('lists what it cannot change, without offering to change it', () => {
        const items = BuildPanelInventory({
            ...INPUT,
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
            StockGrids: [{ SectionKey: 'memberProfiles', DisplayName: 'Member Profiles' }],
        });
        const compiled = items.find((i) => i.Origin === 'compiled')!;
        const grid = items.find((i) => i.Origin === 'stock-grid')!;
        for (const item of [compiled, grid]) {
            expect(item.CanRemove).toBe(false);
            expect(item.CanTurnOn).toBe(false);
            expect(item.CanTurnOff).toBe(false);
        }
        expect(compiled.Subtitle).toContain('built into this app');
        expect(grid.Subtitle).toContain('from the relationship');
    });

    it('puts the rows the user can act on first', () => {
        const items = BuildPanelInventory({
            ...INPUT,
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
        });
        expect(items[0].Origin).toBe('contribution');
    });
});

describe('SummarizeInventory', () => {
    it('counts what is registered apart from what is rendering', () => {
        const items = BuildPanelInventory({
            ...INPUT,
            Contributions: [CONTRIBUTION, { ...CONTRIBUTION, ID: 'ROW-2', Status: 'Pending' }],
        });
        expect(SummarizeInventory(items)).toBe('2 things registered on this form · 1 rendering');
    });

    it('says thing, not things, for one', () => {
        expect(SummarizeInventory(BuildPanelInventory(INPUT)))
            .toBe('1 thing registered on this form · 1 rendering');
    });
});


/**
 * A flat list mixes what the user chose with what the app and the schema put there, and
 * mixes what is rendering with what is stored and idle. The headings separate the rows
 * that carry buttons from the rows that cannot.
 */
describe('GroupPanelInventory', () => {
    const inventory = (over: Partial<FormPanelInventoryInput> = {}) =>
        GroupPanelInventory(BuildPanelInventory({ ...INPUT, ...over }));

    it('heads the rows the user can act on by what they are doing', () => {
        const groups = inventory({
            Contributions: [
                CONTRIBUTION,
                { ...CONTRIBUTION, ID: 'ROW-2', Status: 'Pending' },
                { ...CONTRIBUTION, ID: 'ROW-3', Status: 'Inactive' },
            ],
        });
        expect(groups.map((g) => g.Title)).toEqual(['On this form', 'Drafts', 'Turned off']);
    });

    it('drops a heading with nothing under it', () => {
        expect(inventory().map((g) => g.Key)).toEqual(['active']);
    });

    it('separates what the user cannot change into its own group', () => {
        const groups = inventory({
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
            StockGrids: [{ SectionKey: 'memberProfiles', DisplayName: 'Member Profiles' }],
        });
        const fixed = groups.find((g) => g.Key === 'fixed')!;
        expect(fixed.Title).toBe('Part of the form itself');
        expect(fixed.Items).toHaveLength(2);
        expect(fixed.Items.every((i) => !i.CanEdit && !i.CanRemove)).toBe(true);
    });

    it('puts the user’s own rows before the form’s own', () => {
        const groups = inventory({
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
        });
        expect(groups[groups.length - 1].Key).toBe('fixed');
    });

    // Active and rendering are not the same thing behind a full custom form.
    it('heads held-back rows apart from the ones that render', () => {
        const groups = inventory({ FullCustomForm: true });
        expect(groups.map((g) => g.Key)).toEqual(['held']);
        expect(groups[0].Note).toContain('render for nobody');
    });

    it('marks only a contribution as editable', () => {
        const items = BuildPanelInventory({
            ...INPUT,
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area' }],
        });
        expect(items.find((i) => i.Origin === 'contribution')!.CanEdit).toBe(true);
        expect(items.find((i) => i.Origin === 'compiled')!.CanEdit).toBe(false);
    });
});
