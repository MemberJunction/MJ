/**
 * @fileoverview What is registered on one entity's form, as something a person can read.
 *
 * The rows behind a form are spread across three places that look nothing alike: a
 * `MJ: Entity Form Contributions` row, a compiled `BaseFormPanel` registration, and a
 * relationship that the container fills in with a stock grid. A user who wants to take a
 * panel off their form should not have to know which of those they are looking at.
 *
 * Everything here is pure. The service loads and writes; this decides what the list says.
 */

/** Where an item came from, which decides what can be done to it. */
export type FormPanelOrigin = 'contribution' | 'compiled' | 'stock-grid';

/**
 * Who an item belongs to, from where the user sits. It decides what they may do: anything to
 * their own, hide what is shared with them, nothing to what a relationship draws.
 */
export type FormPanelAudience = 'yours' | 'shared' | 'builtin' | 'relationship';

/** What the item is doing right now. */
export type FormPanelState = 'active' | 'draft' | 'off' | 'held';

/** One line in the manager. */
export interface FormPanelInventoryItem {
    /** Row ID for a contribution; the registration or section key otherwise. */
    ID: string;
    Title: string;
    /** What kind of thing this is, and where it came from. */
    Subtitle: string;
    Origin: FormPanelOrigin;
    /** The slot it mounts at, as stored. Empty for a stock grid. */
    Slot: string;
    /** What it stands in for, in words. Empty when it adds rather than replaces. */
    Replaces: string;
    Presentation: string;
    /** Who it belongs to, from the user's side. */
    Audience: FormPanelAudience;
    /** Who sees it, in words: "Only you", "Sales role", "Everyone", "Built in". */
    AudienceLabel: string;
    State: FormPanelState;
    /** The state in a word, for the label beside the audience. */
    StateLabel: string;
    /** The key a hide is recorded against. Null when the item cannot be hidden. */
    HideKey: string | null;
    /** Whether this user has hidden it. */
    IsHidden: boolean;
    /** An icon for the row, by what the item is. */
    Icon: string;
    /** Only a contribution row can be switched, edited or deleted. */
    CanTurnOn: boolean;
    CanTurnOff: boolean;
    CanRemove: boolean;
    CanEdit: boolean;
    /** Hide it for this user — anything they did not add themselves. */
    CanHide: boolean;
    CanShow: boolean;
    /** Publish their own item to a role or to everyone. Holders of the grant only. */
    CanPublish: boolean;
    /** Re-aim or unpublish an item shared with them. Holders of the grant only. */
    CanChangeAudience: boolean;
}

/** A heading in the list, and the rows under it. */
export interface FormPanelInventoryGroup {
    Key: 'yours' | 'shared' | 'hidden' | 'fixed';
    Title: string;
    /** One line saying what this heading means, for the states that need it. */
    Note: string;
    Items: FormPanelInventoryItem[];
}

/** A `MJ: Entity Form Contributions` row, as much of it as the list needs. */
export interface FormPanelContributionRow {
    ID: string;
    Name: string;
    Title: string | null;
    Icon: string | null;
    Slot: string;
    Presentation: string;
    Status: string;
    Scope: string;
    /** Owner of a personal row; null for one shared with a role or everyone. */
    UserID: string | null;
    RoleID: string | null;
    /** The role's name, for the audience label. */
    Role: string | null;
    ReplacesSectionKey: string | null;
    ReplacesFieldNames: readonly string[];
    /** Sections the panel stands in for, when it names more than one. */
    ReplacesSectionKeys: readonly string[];
    /** A section the panel draws inside, replacing nothing. */
    InSectionKey: string | null;
    /** Where inside its section it draws. Null means the start. */
    SectionPosition: 'start' | 'end' | null;
    RelatedEntity: string | null;
    ChromeGroup: string | null;
    ContributionKey: string | null;
    /** The component the panel renders. */
    ComponentID: string;
    /** Order among panels in the same slot, higher first. */
    SortKey: number;
}

/** A full custom form registered on the entity, for the drawer's Form group. */
export interface FormOverrideRow {
    ID: string;
    Name: string;
    Status: string;
    Scope: string;
    UserID: string | null;
    RoleID: string | null;
    Role: string | null;
}

/** A compiled `BaseFormPanel`, which the list shows but cannot change. */
export interface FormPanelCompiledRow {
    Key: string;
    Title: string;
    Slot: string;
    /** The key a hide is recorded against. Null when the panel has no stable identity. */
    HideKey: string | null;
}

/** A relationship the container fills a grid in for. */
export interface FormPanelStockGridRow {
    SectionKey: string;
    DisplayName: string;
}

export interface FormPanelInventoryInput {
    Contributions: readonly FormPanelContributionRow[];
    Compiled: readonly FormPanelCompiledRow[];
    StockGrids: readonly FormPanelStockGridRow[];
    /**
     * Whether a full custom form is drawing this entity. It owns the whole body, so
     * everything else is stored and rendered for nobody — which the list has to say, or a
     * user turning a panel on and seeing nothing has no way to find out why.
     */
    FullCustomForm: boolean;
    /** Titles by rail key and section key, so "what it replaces" reads as a name. */
    TitleByKey?: ReadonlyMap<string, string>;
    /** The user looking at the list. Decides what is "yours". */
    CallerID: string;
    /** The user's roles. A role item is listed only when it is shared with one of them. */
    CallerRoleIDs: readonly string[];
    /** Whether the user holds the grant to publish to a role or to everyone. */
    CanPublish: boolean;
    /** Keys this user has hidden on this entity. */
    HiddenKeys: readonly string[];
}

/** The rail key the chrome layer builds from the field sections. */
const DETAILS_TAB_KEY = '__mj_form_details';
/** The rail key for the leftovers tab. */
const MORE_TAB_KEY = '__mj_form_more';

/**
 * What a contribution stands in for, named the way the user chose it.
 *
 * A key is not a name. `__mj_form_details` is the Details tab and `contactMethods` is
 * whatever that section is titled, and a list that printed the keys would be a list of
 * things the user never typed.
 */
export function DescribeReplacement(
    row: Pick<FormPanelContributionRow, 'ReplacesSectionKey' | 'ReplacesFieldNames' | 'RelatedEntity'>
        & Partial<Pick<FormPanelContributionRow, 'ReplacesSectionKeys'>>,
    titleByKey?: ReadonlyMap<string, string>,
): string {
    const related = (row.RelatedEntity ?? '').trim();
    if (related) return `the ${related} grid`;

    const sections = row.ReplacesSectionKeys ?? [];
    if (sections.length > 1) {
        const titles = sections.map((key) => titleByKey?.get(key) ?? key);
        return `the ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]} sections`;
    }

    const fields = row.ReplacesFieldNames ?? [];
    if (fields.length === 1) return `the ${titleByKey?.get(fields[0]) ?? fields[0]} field`;
    if (fields.length > 1) return `${fields.length} fields`;

    const key = (row.ReplacesSectionKey ?? '').trim();
    if (!key) return '';
    if (key === DETAILS_TAB_KEY) return 'the whole Details tab';
    if (key === MORE_TAB_KEY) return 'the whole More tab';
    const title = titleByKey?.get(key);
    return title ? `the ${title} section` : `the "${key}" section`;
}

/**
 * Who sees an item, in words.
 *
 * Names the role rather than saying "a role": someone reading their form wants to know which
 * group of people a panel was put in front of, and the role's name is the answer.
 */
export function DescribeAudience(scope: string, roleName?: string | null): string {
    if (scope === 'Role') return roleName ? `${roleName} role` : 'A role';
    if (scope === 'Global') return 'Everyone';
    return 'Only you';
}

/** A state in a word, for the label beside the audience. */
export function DescribeState(state: FormPanelState): string {
    if (state === 'active') return 'on';
    if (state === 'held') return 'held back';
    if (state === 'draft') return 'draft';
    return 'off';
}

/**
 * Whether the list shows this contribution to this user.
 *
 * The user's role can read every row, so the list has to decide what belongs in front of them:
 * their own, what is shared with one of their roles, and what is shared with everyone. Another
 * person's personal panel, or one aimed at a role they are not in, is not theirs to see here.
 */
export function IsListedFor(
    row: Pick<FormPanelContributionRow, 'Scope' | 'UserID' | 'RoleID'>,
    callerID: string,
    callerRoleIDs: readonly string[],
): boolean {
    const same = (a: string | null | undefined, b: string): boolean =>
        (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
    if (row.Scope === 'User') return same(row.UserID, callerID);
    if (row.Scope === 'Role') return callerRoleIDs.some((roleID) => same(row.RoleID, roleID));
    return row.Scope === 'Global';
}

/**
 * What state a contribution is in.
 *
 * `held` is the case worth separating: the row is Active and correct, and still renders
 * nothing, because a full custom form owns the body. Reporting that as Active would be
 * true of the row and false of the form.
 */
export function ContributionState(status: string, fullCustomForm: boolean): FormPanelState {
    if (status === 'Pending') return 'draft';
    if (status !== 'Active') return 'off';
    return fullCustomForm ? 'held' : 'active';
}

/**
 * Everything on this form that concerns this user, contributions first.
 *
 * Their own contributions lead because they can do anything to them. What is shared with them
 * follows — published panels and panels shipped in code — which they can hide. Grids drawn from
 * a relationship come last; they are listed so the form's contents are accounted for, and offer
 * no button that would not work.
 */
export function BuildPanelInventory(input: FormPanelInventoryInput): FormPanelInventoryItem[] {
    const hidden = new Set(input.HiddenKeys);
    const out: FormPanelInventoryItem[] = [];
    for (const row of input.Contributions) {
        if (!IsListedFor(row, input.CallerID, input.CallerRoleIDs)) continue;
        out.push(contributionItem(row, input, hidden));
    }
    for (const row of input.Compiled) out.push(compiledItem(row, input, hidden));
    for (const row of input.StockGrids) out.push(stockGridItem(row, input));
    return out;
}

function contributionItem(
    row: FormPanelContributionRow,
    input: FormPanelInventoryInput,
    hidden: ReadonlySet<string>,
): FormPanelInventoryItem {
    const state = ContributionState(row.Status, input.FullCustomForm);
    const yours = row.Scope === 'User';
    const hideKey = yours ? null : (row.ContributionKey ?? '').trim() || null;
    const isHidden = !!hideKey && hidden.has(hideKey);
    return {
        ID: row.ID,
        Title: (row.Title ?? '').trim() || row.Name,
        Subtitle: `${row.Presentation === 'bare' ? 'bare strip' : 'panel'} · ${yours ? 'added by you' : 'shared with you'}`,
        Origin: 'contribution',
        Slot: row.Slot,
        Replaces: DescribeReplacement(row, input.TitleByKey),
        Presentation: row.Presentation === 'bare' ? 'Bare' : 'Panel',
        Audience: yours ? 'yours' : 'shared',
        AudienceLabel: DescribeAudience(row.Scope, row.Role),
        State: state,
        StateLabel: DescribeState(state),
        HideKey: hideKey,
        IsHidden: isHidden,
        Icon: row.Presentation === 'bare' ? 'fa-solid fa-minus' : 'fa-solid fa-puzzle-piece',
        // Turning on and off changes the row for everyone it reaches, so on a shared item it is
        // a holder's act; hiding is the per-user switch instead.
        CanTurnOn: (yours || input.CanPublish) && (state === 'draft' || state === 'off'),
        CanTurnOff: (yours || input.CanPublish) && (state === 'active' || state === 'held'),
        CanRemove: yours || input.CanPublish,
        CanEdit: yours || input.CanPublish,
        CanHide: !!hideKey && !isHidden,
        CanShow: isHidden,
        CanPublish: yours && input.CanPublish,
        CanChangeAudience: !yours && input.CanPublish,
    };
}

function compiledItem(
    row: FormPanelCompiledRow,
    input: FormPanelInventoryInput,
    hidden: ReadonlySet<string>,
): FormPanelInventoryItem {
    const state: FormPanelState = input.FullCustomForm ? 'held' : 'active';
    const isHidden = !!row.HideKey && hidden.has(row.HideKey);
    return {
        ID: row.Key,
        Title: row.Title || row.Key,
        Subtitle: 'panel · built into this app',
        Origin: 'compiled',
        Slot: row.Slot,
        Replaces: '',
        Presentation: 'Panel',
        Audience: 'builtin',
        AudienceLabel: 'Built in',
        State: state,
        StateLabel: DescribeState(state),
        HideKey: row.HideKey,
        IsHidden: isHidden,
        Icon: 'fa-solid fa-code',
        CanTurnOn: false,
        CanTurnOff: false,
        CanRemove: false,
        CanEdit: false,
        CanHide: !!row.HideKey && !isHidden,
        CanShow: isHidden,
        CanPublish: false,
        CanChangeAudience: false,
    };
}

function stockGridItem(row: FormPanelStockGridRow, input: FormPanelInventoryInput): FormPanelInventoryItem {
    const state: FormPanelState = input.FullCustomForm ? 'held' : 'active';
    return {
        ID: row.SectionKey,
        Title: row.DisplayName,
        Subtitle: 'automatic grid · from the relationship',
        Origin: 'stock-grid',
        Slot: '',
        Replaces: '',
        Presentation: 'Panel',
        Audience: 'relationship',
        AudienceLabel: 'From a relationship',
        State: state,
        StateLabel: DescribeState(state),
        HideKey: null,
        IsHidden: false,
        Icon: 'fa-solid fa-table',
        CanTurnOn: false,
        CanTurnOff: false,
        CanRemove: false,
        CanEdit: false,
        CanHide: false,
        CanShow: false,
        CanPublish: false,
        CanChangeAudience: false,
    };
}

/** The count line under the list: how much is registered, and how much of it renders. */
export function SummarizeInventory(items: readonly FormPanelInventoryItem[]): string {
    const total = items.length;
    const showing = items.filter((item) => item.State === 'active').length;
    const noun = total === 1 ? 'thing' : 'things';
    return `${total} ${noun} registered on this form · ${showing} rendering`;
}


/**
 * The list broken into headed groups, by who each item belongs to.
 *
 * Grouped by audience rather than by state because audience now decides what a user may do: they
 * can remove their own, but only hide something shared with them. State becomes a label on each
 * row. Hidden items get their own group so a hide can always be undone. Empty groups are dropped.
 */
export function GroupPanelInventory(
    items: readonly FormPanelInventoryItem[],
): FormPanelInventoryGroup[] {
    const groups: FormPanelInventoryGroup[] = [
        {
            Key: 'yours', Title: 'Yours', Note: '',
            Items: items.filter((i) => i.Audience === 'yours'),
        },
        {
            Key: 'shared', Title: 'Shared with you',
            Note: 'Put on this form for your role, for everyone, or by the app. Hide any of them for yourself.',
            Items: items.filter((i) => (i.Audience === 'shared' || i.Audience === 'builtin') && !i.IsHidden),
        },
        {
            Key: 'hidden', Title: 'Hidden by you', Note: 'Still there for everyone else. Show one to put it back.',
            Items: items.filter((i) => i.IsHidden),
        },
        {
            Key: 'fixed', Title: 'Part of the form itself',
            Note: 'Drawn from a relationship. Not yours to change here.',
            Items: items.filter((i) => i.Audience === 'relationship'),
        },
    ];
    return groups.filter((group) => group.Items.length > 0);
}

/** One full custom form in the drawer's Form group, or the generated form. */
export interface FormPanelFormItem {
    /** The override's ID; null for the generated form. */
    ID: string | null;
    Title: string;
    AudienceLabel: string;
    /** The form this user sees now. */
    IsCurrent: boolean;
    /** Whether it belongs to this user alone. */
    IsYours: boolean;
    /** Publish this user's own form. Holders of the grant only. */
    CanPublish: boolean;
    /** Re-aim or unpublish a form shared with this user. Holders of the grant only. */
    CanChangeAudience: boolean;
}

export interface FormPanelFormInput {
    /** The forms the toolbar picker offers, in its order. */
    Variants: ReadonlyArray<{ ID: string; Label: string }>;
    /** Every form registered on the entity, for each one's audience. */
    Overrides: readonly FormOverrideRow[];
    /** The form this user sees now; null when it is the generated form. */
    CurrentFormID: string | null;
    CanPublish: boolean;
}

/**
 * The full custom forms available to this user, and the generated form.
 *
 * Built from the toolbar picker's own list so the two cannot disagree about which forms exist.
 * The generated form is listed too: stepping back to it is a choice like any other, and the only
 * way to see a panel on an entity whose custom form draws its whole body.
 */
export function BuildFormItems(input: FormPanelFormInput): FormPanelFormItem[] {
    const same = (a: string | null, b: string | null): boolean =>
        (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
    const items: FormPanelFormItem[] = input.Variants.map((variant) => {
        const row = input.Overrides.find((o) => same(o.ID, variant.ID));
        const yours = (row?.Scope ?? 'User') === 'User';
        return {
            ID: variant.ID,
            Title: variant.Label,
            AudienceLabel: DescribeAudience(row?.Scope ?? 'User', row?.Role),
            IsCurrent: same(variant.ID, input.CurrentFormID),
            IsYours: yours,
            CanPublish: yours && input.CanPublish,
            CanChangeAudience: !yours && input.CanPublish,
        };
    });
    items.push({
        ID: null,
        Title: 'Generated form',
        AudienceLabel: 'Built in',
        IsCurrent: !input.CurrentFormID,
        IsYours: false,
        CanPublish: false,
        CanChangeAudience: false,
    });
    return items;
}
