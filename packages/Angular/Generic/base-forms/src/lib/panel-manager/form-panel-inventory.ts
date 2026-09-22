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
    /** Who sees it. */
    Scope: string;
    State: FormPanelState;
    /** An icon for the row, by what the item is. */
    Icon: string;
    /** Only a contribution row can be switched, edited or deleted. */
    CanTurnOn: boolean;
    CanTurnOff: boolean;
    CanRemove: boolean;
    CanEdit: boolean;
}

/** A heading in the list, and the rows under it. */
export interface FormPanelInventoryGroup {
    Key: FormPanelState | 'fixed';
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
    ReplacesSectionKey: string | null;
    ReplacesFieldName: string | null;
    RelatedEntity: string | null;
    ChromeGroup: string | null;
    ContributionKey: string | null;
}

/** A compiled `BaseFormPanel`, which the list shows but cannot change. */
export interface FormPanelCompiledRow {
    Key: string;
    Title: string;
    Slot: string;
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
    row: Pick<FormPanelContributionRow, 'ReplacesSectionKey' | 'ReplacesFieldName' | 'RelatedEntity'>,
    titleByKey?: ReadonlyMap<string, string>,
): string {
    const related = (row.RelatedEntity ?? '').trim();
    if (related) return `the ${related} grid`;

    const field = (row.ReplacesFieldName ?? '').trim();
    if (field) return `the ${titleByKey?.get(field) ?? field} field`;

    const key = (row.ReplacesSectionKey ?? '').trim();
    if (!key) return '';
    if (key === DETAILS_TAB_KEY) return 'the whole Details tab';
    if (key === MORE_TAB_KEY) return 'the whole More tab';
    const title = titleByKey?.get(key);
    return title ? `the ${title} section` : `the "${key}" section`;
}

/** Who sees it, in the words the apply dialog used. */
export function DescribeScope(scope: string): string {
    if (scope === 'User') return 'Only me';
    if (scope === 'Role') return 'My role';
    if (scope === 'Global') return 'Everyone';
    return scope || 'Only me';
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
 * Everything registered on this form, contributions first.
 *
 * Contributions lead because they are the only rows a user can act on. A compiled panel
 * is code and a stock grid is a relationship; both are listed so the form's contents are
 * accounted for, and neither offers a button that would not work.
 */
export function BuildPanelInventory(input: FormPanelInventoryInput): FormPanelInventoryItem[] {
    const out: FormPanelInventoryItem[] = [];

    for (const row of input.Contributions) {
        const state = ContributionState(row.Status, input.FullCustomForm);
        out.push({
            ID: row.ID,
            Title: (row.Title ?? '').trim() || row.Name,
            Subtitle: `${row.Presentation === 'bare' ? 'bare strip' : 'panel'} · added by you`,
            Origin: 'contribution',
            Slot: row.Slot,
            Replaces: DescribeReplacement(row, input.TitleByKey),
            Presentation: row.Presentation === 'bare' ? 'Bare' : 'Panel',
            Scope: DescribeScope(row.Scope),
            State: state,
            Icon: row.Presentation === 'bare' ? 'fa-solid fa-minus' : 'fa-solid fa-puzzle-piece',
            CanTurnOn: state === 'draft' || state === 'off',
            CanTurnOff: state === 'active' || state === 'held',
            CanRemove: true,
            CanEdit: true,
        });
    }

    for (const row of input.Compiled) {
        out.push({
            ID: row.Key,
            Title: row.Title || row.Key,
            Subtitle: 'panel · built into this app',
            Origin: 'compiled',
            Slot: row.Slot,
            Replaces: '',
            Presentation: 'Panel',
            Scope: 'Everyone',
            State: input.FullCustomForm ? 'held' : 'active',
            Icon: 'fa-solid fa-code',
            CanTurnOn: false,
            CanTurnOff: false,
            CanRemove: false,
            CanEdit: false,
        });
    }

    for (const row of input.StockGrids) {
        out.push({
            ID: row.SectionKey,
            Title: row.DisplayName,
            Subtitle: 'automatic grid · from the relationship',
            Origin: 'stock-grid',
            Slot: '',
            Replaces: '',
            Presentation: 'Panel',
            Scope: 'Everyone',
            State: input.FullCustomForm ? 'held' : 'active',
            Icon: 'fa-solid fa-table',
            CanTurnOn: false,
            CanTurnOff: false,
            CanRemove: false,
            CanEdit: false,
        });
    }

    return out;
}

/** The count line under the list: how much is registered, and how much of it renders. */
export function SummarizeInventory(items: readonly FormPanelInventoryItem[]): string {
    const total = items.length;
    const showing = items.filter((item) => item.State === 'active').length;
    const noun = total === 1 ? 'thing' : 'things';
    return `${total} ${noun} registered on this form · ${showing} rendering`;
}


/**
 * The list broken into headed groups.
 *
 * A flat list mixes things the user chose with things the app and the schema put there,
 * and mixes what is rendering with what is stored and idle. The headings say which is
 * which, so the rows that carry buttons are not hunted for among the rows that do not.
 * Empty groups are dropped.
 */
export function GroupPanelInventory(
    items: readonly FormPanelInventoryItem[],
): FormPanelInventoryGroup[] {
    const fixed = items.filter((item) => item.Origin !== 'contribution');
    const mine = items.filter((item) => item.Origin === 'contribution');

    const groups: FormPanelInventoryGroup[] = [
        {
            Key: 'active', Title: 'On this form', Note: '',
            Items: mine.filter((i) => i.State === 'active'),
        },
        {
            Key: 'held', Title: 'Held back', Note: 'A full custom form is drawing this entity, so these render for nobody.',
            Items: mine.filter((i) => i.State === 'held'),
        },
        {
            Key: 'draft', Title: 'Drafts', Note: 'Stored, but rendering for nobody until you turn them on.',
            Items: mine.filter((i) => i.State === 'draft'),
        },
        {
            Key: 'off', Title: 'Turned off', Note: 'Kept, so you can put them back.',
            Items: mine.filter((i) => i.State === 'off'),
        },
        {
            Key: 'fixed', Title: 'Part of the form itself',
            Note: 'Built into the app or drawn from a relationship. Not yours to change here.',
            Items: fixed,
        },
    ];
    return groups.filter((group) => group.Items.length > 0);
}
