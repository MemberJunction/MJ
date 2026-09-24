import { describe, it, expect } from 'vitest';
import {
    BuildFormItems,
    BuildPanelInventory,
    GroupPanelInventory,
    ContributionState,
    DescribeAudience,
    DescribeReplacement,
    IsListedFor,
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
    UserID: 'user-me',
    RoleID: null,
    Role: null,
    ReplacesSectionKey: 'details',
    ReplacesFieldNames: [],
    RelatedEntity: null,
    ChromeGroup: null,
    ContributionKey: 'panel:OrgMemberOverviewPanel',
    ComponentID: 'COMP-1',
    SortKey: 0,
    ReplacesSectionKeys: [],
    InSectionKey: null,
    SectionPosition: null,
};

const INPUT: FormPanelInventoryInput = {
    Contributions: [CONTRIBUTION],
    Compiled: [],
    StockGrids: [],
    FullCustomForm: false,
    TitleByKey: new Map([['details', 'Details']]),
    CallerID: 'user-me',
    CallerRoleIDs: ['role-sales'],
    CanPublish: false,
    HiddenKeys: [],
};

/** A panel published to everyone. */
const GLOBAL: FormPanelContributionRow = {
    ...CONTRIBUTION, ID: 'ROW-G', Scope: 'Global', UserID: null, ContributionKey: 'panel:Health', Title: 'Course Health',
};

/** A compiled panel, hideable by its registration key. */
const COMPILED = { Key: 'model-predictions', Title: 'Model Predictions', Slot: 'after-fields', HideKey: 'class:model-predictions' };

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

describe('DescribeAudience', () => {
    it('says who sees it, naming the role', () => {
        expect(DescribeAudience('User')).toBe('Only you');
        expect(DescribeAudience('Role', 'Sales')).toBe('Sales role');
        expect(DescribeAudience('Global')).toBe('Everyone');
    });

    it('falls back when the role has no name', () => {
        expect(DescribeAudience('Role', null)).toBe('A role');
    });
});

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
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area', HideKey: 'class:skip:health' }],
            StockGrids: [{ SectionKey: 'memberProfiles', DisplayName: 'Member Profiles' }],
        });
        const compiled = items.find((i) => i.Origin === 'compiled')!;
        const grid = items.find((i) => i.Origin === 'stock-grid')!;
        for (const item of [compiled, grid]) {
            expect(item.CanRemove).toBe(false);
            expect(item.CanTurnOn).toBe(false);
            expect(item.CanTurnOff).toBe(false);
        }
        // Code-shipped panels can still be hidden for oneself; a relationship grid cannot.
        expect(compiled.CanHide).toBe(true);
        expect(grid.CanHide).toBe(false);
        expect(compiled.Subtitle).toContain('built into this app');
        expect(grid.Subtitle).toContain('from the relationship');
    });

    it('puts the rows the user can act on first', () => {
        const items = BuildPanelInventory({
            ...INPUT,
            Compiled: [{ Key: 'skip:health', Title: 'Course Health Strip', Slot: 'top-area', HideKey: 'class:skip:health' }],
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
 * Grouped by who an item belongs to, because that decides what the user may do with it: anything
 * to their own, hide what is shared with them, nothing to what a relationship draws.
 */
describe('GroupPanelInventory', () => {
    const inventory = (over: Partial<FormPanelInventoryInput> = {}) =>
        GroupPanelInventory(BuildPanelInventory({ ...INPUT, ...over }));

    it('heads the user\'s own panels as theirs', () => {
        expect(inventory().map((g) => g.Key)).toEqual(['yours']);
    });

    it('puts published and code-shipped panels under Shared with you', () => {
        const groups = inventory({ Contributions: [CONTRIBUTION, GLOBAL], Compiled: [COMPILED] });
        const shared = groups.find((g) => g.Key === 'shared')!;
        expect(shared.Items.map((i) => i.Title)).toEqual(['Course Health', 'Model Predictions']);
    });

    it('moves a hidden panel to Hidden by you, so the hide can be undone', () => {
        const groups = inventory({ Contributions: [GLOBAL], HiddenKeys: ['panel:Health'] });
        expect(groups.map((g) => g.Key)).toEqual(['hidden']);
        expect(groups[0].Items[0].CanShow).toBe(true);
    });

    it('keeps relationship grids in their own group, last', () => {
        const groups = inventory({ StockGrids: [{ SectionKey: 'memberProfiles', DisplayName: 'Member Profiles' }] });
        expect(groups[groups.length - 1].Key).toBe('fixed');
    });

    it('shows state as a label rather than as a heading', () => {
        const groups = inventory({ Contributions: [CONTRIBUTION, { ...CONTRIBUTION, ID: 'ROW-2', Status: 'Pending' }] });
        expect(groups).toHaveLength(1);
        expect(groups[0].Items.map((i) => i.StateLabel)).toEqual(['on', 'draft']);
    });
});

/**
 * The user's role can read every contribution row, so the list decides what belongs in front of
 * them. Listing another person's personal panel, or one aimed at a role they are not in, would
 * show them things that are none of their business.
 */
describe('IsListedFor', () => {
    it('lists the user\'s own personal panel', () => {
        expect(IsListedFor({ Scope: 'User', UserID: 'user-me', RoleID: null }, 'user-me', [])).toBe(true);
    });

    it('does not list someone else\'s personal panel', () => {
        expect(IsListedFor({ Scope: 'User', UserID: 'user-other', RoleID: null }, 'user-me', [])).toBe(false);
    });

    it('lists a panel for one of the user\'s roles, and not for another role', () => {
        expect(IsListedFor({ Scope: 'Role', UserID: null, RoleID: 'role-sales' }, 'user-me', ['role-sales'])).toBe(true);
        expect(IsListedFor({ Scope: 'Role', UserID: null, RoleID: 'role-ops' }, 'user-me', ['role-sales'])).toBe(false);
    });

    it('lists a panel for everyone', () => {
        expect(IsListedFor({ Scope: 'Global', UserID: null, RoleID: null }, 'user-me', [])).toBe(true);
    });

    it('drops the unlisted rows from the inventory', () => {
        const theirs = { ...CONTRIBUTION, ID: 'THEIRS', UserID: 'user-other' };
        expect(BuildPanelInventory({ ...INPUT, Contributions: [CONTRIBUTION, theirs] }).map((i) => i.ID)).toEqual(['ROW-1']);
    });
});

/** What each kind of user may do to each kind of item. */
describe('BuildPanelInventory — who may do what', () => {
    const item = (row: FormPanelContributionRow, over: Partial<FormPanelInventoryInput> = {}) =>
        BuildPanelInventory({ ...INPUT, Contributions: [row], ...over })[0];

    it('lets anyone manage their own panel, and hide nothing of it', () => {
        const mine = item(CONTRIBUTION);
        expect(mine).toMatchObject({ CanRemove: true, CanEdit: true, CanHide: false, CanPublish: false });
    });

    it('lets a holder publish their own panel', () => {
        expect(item(CONTRIBUTION, { CanPublish: true }).CanPublish).toBe(true);
    });

    it('lets anyone hide a shared panel, but not remove, edit or switch it', () => {
        const shared = item(GLOBAL);
        expect(shared).toMatchObject({
            CanHide: true, CanRemove: false, CanEdit: false, CanTurnOff: false, CanChangeAudience: false,
        });
    });

    it('lets a holder re-aim, remove and switch a shared panel', () => {
        const shared = item(GLOBAL, { CanPublish: true });
        expect(shared).toMatchObject({ CanChangeAudience: true, CanRemove: true, CanTurnOff: true });
    });

    it('labels the audience by name', () => {
        const forSales = { ...GLOBAL, Scope: 'Role', RoleID: 'role-sales', Role: 'Sales' };
        expect(item(forSales).AudienceLabel).toBe('Sales role');
    });
});

/** The forms the toolbar picker offers, and the generated form, as the drawer lists them. */
describe('BuildFormItems', () => {
    const overrides = [
        { ID: 'ops', Name: 'Ops Form', Status: 'Active', Scope: 'Role', UserID: null, RoleID: 'role-sales', Role: 'Sales' },
        { ID: 'finance', Name: 'Finance Form', Status: 'Inactive', Scope: 'User', UserID: 'user-me', RoleID: null, Role: null },
    ];
    const variants = [{ ID: 'ops', Label: 'Ops Form' }, { ID: 'finance', Label: 'Finance Form' }];

    it('lists the picker\'s forms and the generated form, marking the current one', () => {
        const items = BuildFormItems({ Variants: variants, Overrides: overrides, CurrentFormID: 'ops', CanPublish: false });
        expect(items.map((i) => `${i.Title}${i.IsCurrent ? '*' : ''}`)).toEqual(['Ops Form*', 'Finance Form', 'Generated form']);
    });

    it('marks the generated form current when no custom form is chosen', () => {
        const items = BuildFormItems({ Variants: variants, Overrides: overrides, CurrentFormID: null, CanPublish: false });
        expect(items.find((i) => i.ID === null)?.IsCurrent).toBe(true);
    });

    it('labels each form by who it is for', () => {
        const items = BuildFormItems({ Variants: variants, Overrides: overrides, CurrentFormID: null, CanPublish: false });
        expect(items.map((i) => i.AudienceLabel)).toEqual(['Sales role', 'Only you', 'Built in']);
    });

    it('offers publishing only a holder\'s own form, and re-aiming only a shared one', () => {
        const items = BuildFormItems({ Variants: variants, Overrides: overrides, CurrentFormID: null, CanPublish: true });
        expect(items.find((i) => i.ID === 'finance')).toMatchObject({ CanPublish: true, CanChangeAudience: false });
        expect(items.find((i) => i.ID === 'ops')).toMatchObject({ CanPublish: false, CanChangeAudience: true });
        expect(items.find((i) => i.ID === null)).toMatchObject({ CanPublish: false, CanChangeAudience: false });
    });
});
