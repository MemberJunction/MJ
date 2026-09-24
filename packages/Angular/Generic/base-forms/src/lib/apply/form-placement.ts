/**
 * @fileoverview The placement decision — what the user answers before a panel is written.
 *
 * A generated panel arrives carrying a `formContribution` block. Historically every field
 * in it was applied as written, so the author of the component also chose where it went,
 * what it hid, and how it ranked against panels it could not see.
 *
 * The block now splits in two. **Identity** — `presentation`, `title`, `icon` — describes
 * what the component is, and only its author knows it, so it seeds the dialog. **Placement**
 * — slot, claims, ordering, key — is the user's, and is seeded from a fixed default rather
 * than from the block, so the same request produces the same starting point every time.
 *
 * Everything here is pure. The component holds a {@link FormPlacementState} and renders it;
 * these functions decide what that state means.
 */

import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    FORM_CONTRIBUTION_SLOTS,
    GENERATED_FORM_CONTRIBUTION_SLOTS,
    type FormContributionPresentation,
    type FormContributionSlot,
    type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';

/** One input inside a field section, which a panel may stand in for. */
export interface FormPlacementField {
    /** The entity field name, which is what reaches the database. */
    Name: string;
    /** What the form labels it, for the reader. */
    Label: string;
}

/** A field section on the form, which a panel may hide. */
export interface FormPlacementSection {
    Key: string;
    Title: string;
    /**
     * The inputs this section draws. Empty when the targets were derived rather than read
     * from a form, in which case replacing one field is not offered: naming a field the
     * form does not draw would hide nothing and report no error.
     */
    Fields?: readonly FormPlacementField[];
}

/** A related-record grid on the form, which a panel may take over. */
export interface FormPlacementRelated {
    Entity: string;
    JoinField: string;
    DisplayName: string;
}

/** A panel already registered on this entity. */
export interface FormPlacementExisting {
    Key: string;
    Slot: string;
    Title: string;
    /** Order among panels in the same position, higher first. Absent means 0. */
    SortKey?: number;
    /** The section it is placed in, replacing nothing. */
    InSectionKey?: string | null;
    /** Where inside its section it draws, for a placement in a section or a field claim. */
    SectionPosition?: 'start' | 'end' | null;
    /** Fields it stands in for; it draws inside the section holding them. */
    FieldNames?: readonly string[];
    /** Blocks it stands in for; it draws in the place of the first. */
    SectionKeys?: readonly string[];
    /** True when it stands in for a section, tab or grid, so it draws in that place, not at a position. */
    ReplacesPlace?: boolean;
}

/** One item in the form's side rail, and the panels it holds. */
export interface FormPlacementRailItem {
    Key: string;
    Title: string;
    Icon: string;
    /** Section keys of the panels filed under this item. */
    SectionKeys: readonly string[];
    IsMore: boolean;
}

/**
 * What the form actually contains, so the dialog offers real targets.
 *
 * `FullCustomForm` is the case with no good answer yet: a full custom form renders its own
 * body, so a panel applied to that entity is stored and never seen.
 */
export interface FormPlacementContext {
    EntityName: string;
    Sections: readonly FormPlacementSection[];
    Related: readonly FormPlacementRelated[];
    Existing: readonly FormPlacementExisting[];
    /**
     * Slots this form emits. A slot outside this list still accepts a panel, but the slot
     * coordinator sends it down the fallback chain to the container's `after-everything`
     * terminator — the bottom of the form. A generated form emits whichever slots CodeGen
     * knew about when it last ran, so the set differs from form to form.
     */
    SlotsPresent: readonly FormContributionSlot[];
    /**
     * Whether {@link SlotsPresent} was read from a form, rather than assumed from the shape
     * CodeGen produces. Separate from {@link TargetsVerified} because the two are learned
     * apart: a slot probe answers the slot question without answering the section question.
     */
    SlotsVerified: boolean;
    /**
     * How the form arranges itself. In `left-nav` the chrome folds every field section into
     * one "Details" tab, so the section names the user can choose from are a level below
     * anything the form shows them.
     */
    Layout: 'accordion' | 'left-nav';
    /**
     * The rail the form shows, in order. Empty when it could not be resolved, which the
     * preview treats as "no rail to draw" rather than as a form with no sections.
     */
    Rail: readonly FormPlacementRailItem[];
    FullCustomForm: boolean;
    /**
     * Whether these targets came from the form itself.
     *
     * True means the open form reported them, so a section key here is one the form
     * really renders. False means they were derived from entity metadata on the server,
     * which is a different thing: a generated form is frozen at the moment CodeGen last
     * ran, so a field recategorised since then moves in the metadata and not on the form.
     * A key that only exists in the metadata hides nothing and reports no error.
     */
    TargetsVerified: boolean;
}

/** Whether the panel adds to the form or takes something's place. */
export type FormPlacementReplaceMode = 'none' | 'rail-tab' | 'section' | 'field' | 'related' | 'contribution';

/**
 * The key of the rail tab the chrome layer builds from the field sections.
 *
 * Byte-identical to `DETAILS_SECTION_KEY` in the chrome layer. It is named here only
 * because it is the tab a panel most often stands in for and the one the dialog defaults
 * to — a contribution may name any rail tab's key, and the chrome layer expands whichever
 * it is given. Nothing downstream treats this one specially.
 */
export const DETAILS_TAB_KEY = '__mj_form_details';

/** What the chrome layer titles that tab. Matches the literal in `resolve-form-chrome`. */
export const DETAILS_TAB_TITLE = 'Details';

/**
 * Whether the form bundles its field sections into a Details tab.
 *
 * Only a rail layout does. An accordion shows every section in place, so there is no tab
 * to stand in for and the section list means exactly what it says.
 */
export function HasDetailsTab(context: FormPlacementContext): boolean {
    return context.Layout === 'left-nav' && context.Sections.length > 0;
}

/** The rail key of the More tab, as the chrome layer names it. */
export const MORE_TAB_KEY = '__mj_form_more';

/**
 * Whether the form shows a side rail, so there are tabs a user can point at.
 *
 * The rail groups exist whatever the layout — an accordion form uses them to decide what
 * is visible, it just draws no rail. So a non-empty `Rail` does not mean the user sees
 * tabs, and offering to "replace a whole tab" on a form that shows none describes
 * something that is not on their screen.
 */
export function ShowsRail(context: FormPlacementContext): boolean {
    return context.Layout === 'left-nav' && context.Rail.length > 0;
}

/**
 * Whether a panel standing in for this tab has to be filed into it.
 *
 * Details and More are assembled from the panels filed under them, so a panel replacing
 * their contents has to join the tab or the tab is left empty. Every other rail tab is
 * named after the panels it holds, so replacing all of them dissolves the tab and the
 * panel becomes a tab in its own right.
 */
export function RailKeyChromeGroup(railKey: string): 'details' | 'more' | null {
    const key = (railKey ?? '').trim();
    if (key === DETAILS_TAB_KEY) return 'details';
    if (key === MORE_TAB_KEY) return 'more';
    return null;
}

/**
 * The blocks in the preview that this choice will take off the form.
 *
 * The replace choices differ only in how much they cover — a whole tab is every field
 * group in it, one field group is one of those — and saying that in a label has not been
 * enough. Marking the blocks themselves shows the difference instead of describing it.
 */
export function ReplacedPreviewKeys(
    state: FormPlacementState,
    context: FormPlacementContext,
): ReadonlySet<string> {
    if (state.ReplaceMode === 'rail-tab') {
        const tab = context.Rail.find((item) => item.Key === state.ReplaceRailKey);
        return new Set(tab?.SectionKeys ?? []);
    }
    if (state.ReplaceMode === 'section') return new Set(ChosenSectionKeys(state, context));
    return new Set<string>();
}

/**
 * The sections the `section` mode stands in for, in the form's order and kept to sections the
 * form draws. The list when one is set, else the single key.
 */
export function ChosenSectionKeys(state: FormPlacementState, context: FormPlacementContext): string[] {
    const wanted = state.ReplaceSectionKeys.length > 0 ? state.ReplaceSectionKeys : [state.ReplaceSectionKey];
    const keys = wanted.map((key) => key.trim()).filter((key) => key.length > 0);
    if (context.Sections.length === 0) return keys;
    return context.Sections.map((s) => s.Key).filter((key) => keys.includes(key));
}

/** One field on offer, named together with the section that draws it. */
export interface FormPlacementFieldChoice {
    Name: string;
    Label: string;
    SectionKey: string;
    SectionTitle: string;
}

/**
 * Every field a panel could stand in for, in form order.
 *
 * Only fields read off a real form are offered. A section list derived from entity
 * metadata says which fields the entity HAS, not which ones this form draws, and a claim
 * on a field the form does not draw hides nothing while still looking applied.
 */
export function ReplaceableFields(context: FormPlacementContext): FormPlacementFieldChoice[] {
    if (!context.TargetsVerified) return [];
    const out: FormPlacementFieldChoice[] = [];
    for (const section of context.Sections) {
        for (const field of section.Fields ?? []) {
            if (!field.Name) continue;
            out.push({
                Name: field.Name,
                Label: field.Label || field.Name,
                SectionKey: section.Key,
                SectionTitle: section.Title,
            });
        }
    }
    return out;
}

/** The section drawing this field, or null when no section on the form does. */
export function SectionHoldingField(
    context: FormPlacementContext,
    fieldName: string,
): FormPlacementSection | null {
    const name = (fieldName ?? '').trim();
    if (!name) return null;
    return context.Sections.find((s) => (s.Fields ?? []).some((f) => f.Name === name)) ?? null;
}

/** Sections that draw at least one field, so there is something to choose from. */
export function SectionsWithFields(context: FormPlacementContext): readonly FormPlacementSection[] {
    if (!context.TargetsVerified) return [];
    return context.Sections.filter((s) => (s.Fields ?? []).length > 0);
}

/** The fields of one section, by key. Empty for a section the form does not draw. */
export function FieldsInSection(
    context: FormPlacementContext,
    sectionKey: string,
): readonly FormPlacementField[] {
    const key = (sectionKey ?? '').trim();
    if (!key) return [];
    return context.Sections.find((s) => s.Key === key)?.Fields ?? [];
}

/**
 * The chosen field names, kept to the ones the chosen section really draws.
 *
 * The section and the names are held apart in the state, so switching section leaves a
 * stale set behind. Filtering here rather than on every change keeps the state simple and
 * means a section the form stopped drawing cannot smuggle a claim through.
 */
export function ChosenFieldNames(state: FormPlacementState, context: FormPlacementContext): string[] {
    const available = FieldsInSection(context, state.ReplaceFieldSectionKey);
    return state.ReplaceFieldNames.filter((name) => available.some((f) => f.Name === name));
}

/** The section a field claim starts on: the first one with fields to offer. */
export function DefaultFieldSectionKey(context: FormPlacementContext): string {
    return SectionsWithFields(context)[0]?.Key ?? '';
}

/** Tabs a panel may stand in for — every rail item, on a form that shows a rail. */
export function ReplaceableRailTabs(context: FormPlacementContext): readonly FormPlacementRailItem[] {
    return ShowsRail(context) ? context.Rail : [];
}

/** The tab the dialog starts on: Details when the form has one, else the first. */
export function DefaultRailKeyFor(context: FormPlacementContext): string {
    const tabs = ReplaceableRailTabs(context);
    if (tabs.some((item) => item.Key === DETAILS_TAB_KEY)) return DETAILS_TAB_KEY;
    return tabs[0]?.Key ?? '';
}

/**
 * Which rail item the panel will appear under, given the answers so far.
 *
 * Replacing something puts the panel where that thing was, so the answer is the item
 * holding it. Replacing nothing gives the panel a rail item of its own, and null says so:
 * the preview then draws a new item rather than highlighting an existing one.
 */
export function TargetRailItem(
    state: FormPlacementState,
    context: FormPlacementContext,
): FormPlacementRailItem | null {
    if (state.Presentation === 'bare' || !ShowsRail(context)) return null;
    const holding = (sectionKey: string): FormPlacementRailItem | null =>
        context.Rail.find((item) => item.SectionKeys.includes(sectionKey)) ?? null;

    if (state.ReplaceMode === 'rail-tab') {
        return context.Rail.find((item) => item.Key === state.ReplaceRailKey) ?? null;
    }
    if (state.ReplaceMode === 'section') return holding(ChosenSectionKeys(state, context)[0] ?? '');
    if (state.ReplaceMode === 'field') {
        return state.ReplaceFieldSectionKey ? holding(state.ReplaceFieldSectionKey) : null;
    }
    if (state.ReplaceMode === 'related') {
        const target = context.Related[state.ReplaceRelatedIndex];
        if (!target) return null;
        return context.Rail.find((item) => item.Title === target.DisplayName) ?? null;
    }
    if (state.ReplaceMode === 'contribution') {
        const target = context.Existing[state.ReplaceContributionIndex];
        return target ? holding(target.Key) : null;
    }
    // Claiming nothing, the slot decides: a position among the field sections puts the
    // panel in the tab those sections make up.
    if (SlotJoinsDetailsTab(state.Slot)) {
        return context.Rail.find((item) => item.Key === DETAILS_TAB_KEY) ?? null;
    }
    return null;
}

/**
 * Whether a panel at this slot joins the Details tab rather than taking one of its own.
 *
 * Byte-identical to `SlotChromeGroup` in the chrome layer, which is what actually files
 * the panel. Duplicated rather than imported so the pure placement model stays free of
 * the chrome layer; the two must agree or the dialog promises a tab the form will not use.
 */
export function SlotJoinsDetailsTab(slot: FormContributionSlot): boolean {
    return slot === 'before-fields' || slot === 'after-fields';
}

/**
 * How one section reads in the list, told apart from the tab that contains it.
 *
 * CodeGen names a generated field section "Details" whenever the entity has fields it
 * files nowhere else, and the rail then folds that section — with every other field
 * section — into a tab it also calls "Details". Two different targets under one name,
 * one of them a part of the other, so the section is qualified.
 */
export function SectionOptionLabel(section: FormPlacementSection, context: FormPlacementContext): string {
    const title = section.Title.trim() || section.Key;
    if (HasDetailsTab(context) && title.toLowerCase() === DETAILS_TAB_TITLE.toLowerCase()) {
        return `${title} (the field group, not the tab)`;
    }
    return title;
}

/** The editable answers. One field per control in the dialog. */
export interface FormPlacementState {
    Slot: FormContributionSlot;
    Presentation: FormContributionPresentation;
    Title: string;
    Icon: string;
    ReplaceMode: FormPlacementReplaceMode;
    /** Key of the rail tab to stand in for, when the mode is `rail-tab`. */
    ReplaceRailKey: string;
    ReplaceSectionKey: string;
    /**
     * Sections to stand in for, when the `section` mode names more than one. Empty means the
     * one in {@link ReplaceSectionKey}.
     */
    ReplaceSectionKeys: string[];
    /** Section to draw inside, replacing nothing. Empty means the panel goes at {@link Slot}. */
    InSectionKey: string;
    /** Where inside its section the panel draws: for {@link InSectionKey} and for a field claim. */
    SectionPosition: 'start' | 'end';
    /** Section whose fields the `field` mode chooses from. */
    ReplaceFieldSectionKey: string;
    /** Entity field names to stand in for, all inside {@link ReplaceFieldSectionKey}. */
    ReplaceFieldNames: string[];
    ReplaceRelatedIndex: number;
    ReplaceContributionIndex: number;
    /**
     * Order among the panels in the same position, higher first. Null leaves it unset: a new
     * panel saves 0, and an edited one keeps the order it has.
     */
    SortKey: number | null;
    ActivateNow: boolean;
}

/** The answers, in the shape the write path consumes. */
export interface FormPlacementDecision {
    /** Merged into `spec.formContribution` before the create action runs. */
    Contribution: FormContributionSpec;
    /** False leaves the row Pending — stored, rendering for nobody. */
    ActivateNow: boolean;
}

/** One position a panel can take, named twice: for the reader and for the record. */
export interface FormPlacementSlotChoice {
    Slot: FormContributionSlot;
    /** Where it is on the form, in plain words. What the dialog leads with. */
    Name: string;
    /** The slot's own name, which is what reaches the database. Shown beside it. */
    Label: string;
}

/**
 * Where each slot sits, said plainly.
 *
 * A slot is a position between the things already on the form, not a thing on the form,
 * and its stored name does not say that on its own — `before-fields` next to
 * `Contact Information` reads like a second piece of content. Both names are shown: the
 * plain one so the choice is legible, the stored one so a user who reads it here
 * recognises it in a row later.
 */
const SLOT_NAMES: Record<FormContributionSlot, string> = {
    'top-area': 'Above everything',
    'before-fields': 'Before the fields',
    'after-fields': 'After the fields',
    'after-related': 'After the related grids',
    'after-everything': 'At the very bottom',
};

/** The slots, top to bottom. */
export const FORM_PLACEMENT_SLOTS: readonly FormPlacementSlotChoice[] =
    FORM_CONTRIBUTION_SLOTS.map((slot) => ({ Slot: slot, Name: SLOT_NAMES[slot] ?? slot, Label: slot }));

/**
 * Whether the form emits this slot.
 *
 * An empty {@link FormPlacementContext.SlotsPresent} means nobody has told us, not that the
 * form has no slots, so the generated shape stands in. That shape excludes `top-area`, which
 * no form emits — offering it would send the panel to the bottom of the form under a label
 * that says the opposite.
 */
export function SlotIsOnForm(context: FormPlacementContext, slot: FormContributionSlot): boolean {
    const present = context.SlotsPresent.length > 0
        ? context.SlotsPresent
        : GENERATED_FORM_CONTRIBUTION_SLOTS;
    return present.includes(slot);
}

/** The preferred slot, unless this form does not emit it — then the first one it does. */
export function DefaultSlotFor(context: FormPlacementContext): FormContributionSlot {
    if (SlotIsOnForm(context, DEFAULT_FORM_CONTRIBUTION_SLOT)) return DEFAULT_FORM_CONTRIBUTION_SLOT;
    return context.SlotsPresent[0] ?? GENERATED_FORM_CONTRIBUTION_SLOTS[0] ?? DEFAULT_FORM_CONTRIBUTION_SLOT;
}

/**
 * The starting answers.
 *
 * Placement is NOT read from the proposal. The dialog's default is fixed, so a user who
 * asks for the same panel twice starts from the same place both times, and a proposal that
 * omits placement entirely behaves identically to one that does not.
 *
 * The one thing that moves the default is the form: starting on a slot the form does not
 * emit would put the panel at the bottom no matter what the dialog showed.
 */
export function InitialPlacementState(
    proposal: FormContributionSpec | null,
    context: FormPlacementContext,
): FormPlacementState {
    return {
        Slot: DefaultSlotFor(context),
        Presentation: proposal?.presentation === 'bare' ? 'bare' : 'panel',
        Title: (proposal?.title ?? '').trim(),
        Icon: (proposal?.icon ?? '').trim(),
        ReplaceMode: 'none',
        ReplaceRailKey: DefaultRailKeyFor(context),
        ReplaceSectionKey: context.Sections[0]?.Key ?? '',
        ReplaceSectionKeys: [],
        InSectionKey: '',
        SectionPosition: 'start',
        ReplaceFieldSectionKey: DefaultFieldSectionKey(context),
        ReplaceFieldNames: [],
        ReplaceRelatedIndex: 0,
        ReplaceContributionIndex: 0,
        SortKey: null,
        ActivateNow: !context.FullCustomForm,
    };
}

/**
 * The starting answers when editing a contribution that is already on the form.
 *
 * The opposite of {@link InitialPlacementState}, and deliberately so. That one ignores
 * the proposal's placement because the placement is the user's to choose and a component
 * author should not preselect it. Here the placement being read back IS the user's own
 * earlier choice, so discarding it would make every edit start from scratch.
 */
export function PlacementStateFromContribution(
    spec: FormContributionSpec,
    context: FormPlacementContext,
    activeNow: boolean,
): FormPlacementState {
    const railKey = (spec.replacesSectionKey ?? '').trim();
    const listed = (spec.replacesSectionKeys ?? []).map((k) => k.trim()).filter((k) => k.length > 0);
    const sectionKey = context.Sections.some((s) => s.Key === railKey) ? railKey : (listed[0] ?? '');
    const isRailTab = !!railKey && !sectionKey
        && ReplaceableRailTabs(context).some((tab) => tab.Key === railKey);

    // A claim is read back against the section holding the first field the form still
    // draws. A claim whose fields have all gone is dropped rather than shown against a
    // section it no longer touches.
    const claimedFields = (spec.replacesFieldNames ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
    const fieldSection = claimedFields
        .map((name) => SectionHoldingField(context, name))
        .find((section): section is FormPlacementSection => section != null) ?? null;
    const keptFields = fieldSection
        ? claimedFields.filter((name) => (fieldSection.Fields ?? []).some((f) => f.Name === name))
        : [];

    const relatedIndex = spec.relatedEntity
        ? context.Related.findIndex((r) => r.Entity === spec.relatedEntity)
        : -1;
    const contributionIndex = spec.contributionKey
        ? context.Existing.findIndex((e) => e.Key === spec.contributionKey)
        : -1;

    let mode: FormPlacementReplaceMode = 'none';
    if (isRailTab) mode = 'rail-tab';
    else if (sectionKey) mode = 'section';
    else if (keptFields.length > 0) mode = 'field';
    else if (relatedIndex >= 0) mode = 'related';
    else if (contributionIndex >= 0) mode = 'contribution';

    return {
        Slot: spec.slot && SlotIsOnForm(context, spec.slot) ? spec.slot : DefaultSlotFor(context),
        Presentation: spec.presentation === 'bare' ? 'bare' : 'panel',
        Title: (spec.title ?? '').trim(),
        Icon: (spec.icon ?? '').trim(),
        ReplaceMode: mode,
        ReplaceRailKey: isRailTab ? railKey : DefaultRailKeyFor(context),
        ReplaceSectionKey: sectionKey || context.Sections[0]?.Key || '',
        ReplaceSectionKeys: listed.length > 1 ? listed : [],
        InSectionKey: mode === 'none' ? (spec.inSectionKey ?? '').trim() : '',
        SectionPosition: spec.sectionPosition === 'end' ? 'end' : 'start',
        ReplaceFieldSectionKey: fieldSection?.Key || DefaultFieldSectionKey(context),
        ReplaceFieldNames: keptFields,
        ReplaceRelatedIndex: relatedIndex >= 0 ? relatedIndex : 0,
        ReplaceContributionIndex: contributionIndex >= 0 ? contributionIndex : 0,
        SortKey: spec.sortKey ?? null,
        ActivateNow: activeNow,
    };
}

/**
 * The state as a contribution block.
 *
 * `sortKey` is written only once the user has placed the panel among others in its position,
 * and `contributionKey` is set only when the user chose to
 * take over a named panel. A key is what makes one contribution replace another, so it is
 * written when a replacement is meant and left for the write path to derive otherwise — the
 * duplicate check compares those strings literally, and two algorithms would not agree.
 */
export function ResolvePlacementDecision(
    state: FormPlacementState,
    context: FormPlacementContext,
    proposal: FormContributionSpec | null,
): FormPlacementDecision {
    const contribution: FormContributionSpec = {
        slot: state.Slot,
        presentation: state.Presentation,
        title: state.Title.trim() || (proposal?.title ?? 'Panel'),
    };

    const icon = state.Icon.trim();
    if (icon) contribution.icon = icon;
    if (state.SortKey != null) contribution.sortKey = state.SortKey;

    const configuration = proposal?.configuration;
    if (configuration && Object.keys(configuration).length > 0) {
        contribution.configuration = { ...configuration };
    }

    if (state.ReplaceMode === 'rail-tab') {
        const key = state.ReplaceRailKey.trim();
        if (key) {
            contribution.replacesSectionKey = key;
            // Details and More are assembled from their members, so a panel standing in
            // for one has to join it or the emptied tab is left behind. Every other tab
            // IS its members, so emptying it leaves the panel to become the tab itself.
            const group = RailKeyChromeGroup(key);
            if (group) contribution.chromeGroup = group;
        }
    } else if (state.ReplaceMode === 'section') {
        const keys = ChosenSectionKeys(state, context);
        if (keys.length === 1) contribution.replacesSectionKey = keys[0];
        else if (keys.length > 1) contribution.replacesSectionKeys = keys;
        // Panels drawing in one place break ties by page order, so they share one slot and the
        // slot sorts them by `sortKey`, as the order list does.
        if (keys.length > 0 && SlotIsOnForm(context, 'before-fields')) contribution.slot = 'before-fields';
    } else if (state.ReplaceMode === 'field') {
        const names = ChosenFieldNames(state, context);
        if (names.length > 0) contribution.replacesFieldNames = names;
        if (names.length > 0 && state.SectionPosition === 'end') contribution.sectionPosition = 'end';
    } else if (state.ReplaceMode === 'related') {
        const target = context.Related[state.ReplaceRelatedIndex];
        if (target) {
            contribution.relatedEntity = target.Entity;
            if (target.JoinField) contribution.relatedJoinField = target.JoinField;
        }
    } else if (state.ReplaceMode === 'contribution') {
        const target = context.Existing[state.ReplaceContributionIndex];
        if (target?.Key) contribution.contributionKey = target.Key;
    } else if (state.InSectionKey.trim()) {
        contribution.inSectionKey = state.InSectionKey.trim();
        contribution.sectionPosition = state.SectionPosition;
    }

    return { Contribution: contribution, ActivateNow: state.ActivateNow };
}

/** Section titles joined for a sentence: "A and B", "A, B and C". */
export function DescribeSectionList(titles: readonly string[]): string {
    if (titles.length <= 1) return titles[0] ?? '';
    return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

/**
 * A readable list of field labels: one name, two joined by "and", the rest counted.
 *
 * Counted past three because the sentence is one line beside the buttons, and a panel
 * standing in for eight fields would push the rest of it off the end.
 */
export function DescribeFieldList(labels: readonly string[]): string {
    if (labels.length === 0) return 'nothing';
    if (labels.length === 1) return `the ${labels[0]} field`;
    if (labels.length === 2) return `the ${labels[0]} and ${labels[1]} fields`;
    if (labels.length === 3) return `the ${labels[0]}, ${labels[1]} and ${labels[2]} fields`;
    return `${labels.length} fields, starting with ${labels[0]}`;
}

/**
 * One sentence saying what pressing Apply does, in the same terms the user just chose.
 *
 * It is the only place the separate answers are stated together, so a contradiction the
 * form allows — a panel that is active but invisible behind a full form — reads plainly.
 */
export function SummarizePlacement(state: FormPlacementState, context: FormPlacementContext): string {
    const what = state.Presentation === 'bare' ? 'a bare strip' : 'a panel';
    const inSection = state.ReplaceMode === 'none'
        ? context.Sections.find((s) => s.Key === state.InSectionKey.trim()) ?? null
        : null;
    const where = state.ReplaceMode === 'field' ? ''
        : inSection ? ` ${state.SectionPosition === 'end' ? 'at the bottom' : 'at the top'} of the ${inSection.Title} section`
        : ` at ${state.Slot}`;
    const parts = [`Adds ${what}${where} on every ${context.EntityName} record`];

    if (state.ReplaceMode === 'rail-tab') {
        const tab = context.Rail.find((item) => item.Key === state.ReplaceRailKey);
        parts.push(tab
            ? `taking the place of the whole ${tab.Title} tab, leaving the other tabs alone`
            : 'taking the place of a whole tab, leaving the other tabs alone');
    } else if (state.ReplaceMode === 'section' && ChosenSectionKeys(state, context).length > 1) {
        const titles = ChosenSectionKeys(state, context)
            .map((key) => context.Sections.find((s) => s.Key === key)?.Title ?? key);
        parts.push(`standing in for the ${DescribeSectionList(titles)} sections, in the place of the first`);
    } else if (state.ReplaceMode === 'section') {
        const section = context.Sections.find((s) => s.Key === ChosenSectionKeys(state, context)[0]);
        if (section && HasDetailsTab(context)) {
            parts.push(`standing in for the ${section.Title} section, one of ${context.Sections.length} inside the Details tab`);
        } else if (section) {
            parts.push(`standing in for the ${section.Title} section`);
        }
    } else if (state.ReplaceMode === 'field') {
        const names = ChosenFieldNames(state, context);
        const section = context.Sections.find((s) => s.Key === state.ReplaceFieldSectionKey);
        const labels = names
            .map((name) => (section?.Fields ?? []).find((f) => f.Name === name)?.Label || name);
        parts.push(labels.length > 0 && section
            ? `standing in for ${DescribeFieldList(labels)} at the ${state.SectionPosition === 'end' ? 'bottom' : 'top'} of the ${section.Title} section`
            : 'standing in for no field yet — pick at least one');
    } else if (state.ReplaceMode === 'related') {
        const related = context.Related[state.ReplaceRelatedIndex];
        if (related) parts.push(`taking over the ${related.DisplayName} grid`);
    } else if (state.ReplaceMode === 'contribution') {
        const existing = context.Existing[state.ReplaceContributionIndex];
        if (existing) parts.push(`replacing the ${existing.Title} panel`);
    }

    if (state.ReplaceMode === 'none' && !inSection && state.Presentation === 'panel' && ShowsRail(context)) {
        parts.push(SlotJoinsDetailsTab(state.Slot)
            ? 'inside the Details tab'
            : 'as a tab of its own');
    }

    parts.push('visible to you only');
    parts.push(state.ActivateNow ? 'starting now' : 'saved as a draft');

    let sentence = `${parts.join(', ')}.`;
    if (state.ReplaceMode === 'field') {
        sentence += ' The chosen position does not apply: a panel standing in for a field renders inside that field\'s section.';
    }
    if (state.ReplaceMode !== 'field' && !inSection && context.SlotsVerified && !SlotIsOnForm(context, state.Slot)) {
        sentence += ` This form does not emit ${state.Slot}, so the panel renders at the bottom instead.`;
    }
    if (state.ReplaceMode === 'section' && !context.TargetsVerified) {
        sentence += ' The section list comes from entity metadata, not from the form itself, so a section may not match.';
    }
    if (context.FullCustomForm && state.ActivateNow) {
        sentence += ' A full custom form is rendering this entity, so it will not appear until that form is turned off.';
    }
    return sentence;
}

/**
 * The proposal merged onto the spec the write path sends.
 *
 * The spec is what the component runs from, so it is copied rather than edited: the caller
 * may still be showing the original in a preview.
 */
export function ApplyDecisionToSpec<T extends { formContribution?: FormContributionSpec }>(
    spec: T,
    decision: FormPlacementDecision,
): T {
    return { ...spec, formContribution: decision.Contribution };
}

/** One panel in the order list of a position. */
export interface PlacementOrderItem {
    Key: string;
    Title: string;
    SortKey: number;
    /** The panel being placed. */
    IsThis: boolean;
}

/** The key the placed panel is listed under in its own order list. */
export const PLACEMENT_ORDER_THIS_KEY = '__this__';

/** How far apart a panel is put from its neighbour when it moves to either end of the list. */
export const PLACEMENT_ORDER_STEP = 10;

/**
 * The panels in the chosen position, top to bottom, the one being placed among them.
 *
 * Higher `SortKey` draws first, as the slot and section hosts sort. The placed panel is listed
 * after any panel it ties with: a new row loads after the rows already there, and moving the
 * panel gives it a number of its own. A position is a slot, the top or bottom of a section —
 * where field claims draw too — or the place of a block that panels stand in for. Empty when the
 * panel stands in for a tab, grid or panel, since it then draws alone in that thing's place.
 */
export function PanelsInPosition(
    state: FormPlacementState,
    context: FormPlacementContext,
    title: string,
): PlacementOrderItem[] {
    const here = placedPosition(state, context);
    if (!here) return [];
    const others: PlacementOrderItem[] = context.Existing
        .filter((e) => existingPosition(e, context) === here)
        .map((e) => ({ Key: e.Key, Title: e.Title, SortKey: e.SortKey ?? 0, IsThis: false }));
    const self: PlacementOrderItem = { Key: PLACEMENT_ORDER_THIS_KEY, Title: title, SortKey: state.SortKey ?? 0, IsThis: true };
    const items = [...others, self];
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => b.item.SortKey - a.item.SortKey
            || (a.item.IsThis ? 1 : b.item.IsThis ? -1 : a.index - b.index))
        .map((entry) => entry.item);
}

/**
 * Where the placed panel draws, as a key shared by every panel drawing in the same place: a slot
 * name, `in:<section>:<start|end>` for the top or bottom of a section, or `at:<section>` for the
 * place of a block that panels stand in for. Null when it stands in for a tab, grid or panel.
 */
function placedPosition(state: FormPlacementState, context: FormPlacementContext): string | null {
    if (state.ReplaceMode === 'field') {
        return state.ReplaceFieldSectionKey ? `in:${state.ReplaceFieldSectionKey}:${state.SectionPosition}` : null;
    }
    if (state.ReplaceMode === 'section') return blockPosition(ChosenSectionKeys(state, context), context);
    if (state.ReplaceMode !== 'none') return null;
    const inSection = state.InSectionKey.trim();
    return inSection ? `in:${inSection}:${state.SectionPosition}` : state.Slot;
}

/** The same key for a panel already on the form. */
function existingPosition(existing: FormPlacementExisting, context: FormPlacementContext): string | null {
    const replaced = (existing.SectionKeys ?? []).map((key) => key.trim()).filter((key) => key.length > 0);
    if (replaced.length > 0) {
        const drawn = context.Sections.length > 0
            ? context.Sections.map((s) => s.Key).filter((key) => replaced.includes(key))
            : replaced;
        return blockPosition(drawn, context);
    }
    if (existing.ReplacesPlace) return null;
    const position = existing.SectionPosition === 'end' ? 'end' : 'start';
    const inSection = existing.InSectionKey?.trim();
    if (inSection) return `in:${inSection}:${position}`;
    const firstField = (existing.FieldNames ?? []).find((name) => name.trim().length > 0);
    if (firstField) {
        const section = SectionHoldingField(context, firstField);
        return section ? `in:${section.Key}:${position}` : null;
    }
    return existing.Slot;
}

/**
 * The key for panels standing in for `keys`, in form order: the place of the first. The first
 * block on the form is also where the before-fields slot draws, so the two share one key.
 */
function blockPosition(keys: readonly string[], context: FormPlacementContext): string | null {
    const first = keys[0];
    if (!first) return null;
    return first === context.Sections[0]?.Key ? 'before-fields' : `at:${first}`;
}

/**
 * The order number that puts the placed panel one step up or down, or null when it cannot move.
 *
 * The number has to fall strictly between its new neighbours, since equal numbers do not say
 * which draws first. At either end of the list it goes a step past the last one. Between two
 * panels whose numbers are adjacent or equal there is no number to give, so the move is refused
 * rather than landing somewhere the list does not show.
 */
export function MovedSortKey(items: readonly PlacementOrderItem[], direction: 'up' | 'down'): number | null {
    const at = items.findIndex((item) => item.IsThis);
    if (at < 0) return null;
    const target = direction === 'up' ? at - 1 : at + 1;
    if (target < 0 || target >= items.length) return null;
    // Its neighbours after the move, read from the list without it: it lands at `target`.
    const rest = items.filter((item) => !item.IsThis);
    const above = rest[target - 1] ?? null;
    const below = rest[target] ?? null;
    if (!above && below) return below.SortKey + PLACEMENT_ORDER_STEP;
    if (above && !below) return above.SortKey - PLACEMENT_ORDER_STEP;
    if (!above || !below) return null;
    if (above.SortKey - below.SortKey < 2) return null;
    return Math.floor((above.SortKey + below.SortKey) / 2);
}
