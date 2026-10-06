/**
 * @fileoverview The placement decision — what the user answers before a panel is written.
 *
 * A generated panel arrives carrying a `formContribution` block. Its **identity** —
 * `presentation`, `title`, `icon` — describes what the component is. Its **placement** — slot
 * and claims — is a proposal: the dialog starts from every claim the open form can honour and
 * from a fixed default for the rest, and the user confirms or changes it.
 *
 * Everything here is pure. The component holds a {@link FormPlacementState} and renders it;
 * these functions decide what that state means. The sentences that describe a state are in
 * `form-placement-text.ts`, and the order of panels in one position is in
 * `form-placement-order.ts`.
 */

import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    FORM_CONTRIBUTION_SLOTS,
    GENERATED_FORM_CONTRIBUTION_SLOTS,
    StripJoinFieldBrackets,
    type FormContributionPresentation,
    type FormContributionSlot,
    type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';
import { DETAILS_SECTION_KEY, ReplacedSectionChromeGroup, SlotChromeGroup } from '../chrome/form-chrome';

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
 * Whether the form bundles its field sections into a Details tab.
 *
 * Only a rail layout does. An accordion shows every section in place, so there is no tab
 * to stand in for and the section list means exactly what it says.
 */
export function HasDetailsTab(context: FormPlacementContext): boolean {
    return context.Layout === 'left-nav' && context.Sections.length > 0;
}

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
 * Whether the form's targets are not known yet: no sections, and none read from the form.
 * A claim cannot be checked against such a context, so it is kept as it stands.
 */
export function TargetsUnread(context: FormPlacementContext): boolean {
    return context.Sections.length === 0 && !context.TargetsVerified;
}

/**
 * The sections the `section` mode stands in for, in the form's order and kept to sections the
 * form draws. The list when one is set, else the single key.
 */
export function ChosenSectionKeys(state: FormPlacementState, context: FormPlacementContext): string[] {
    const wanted = state.ReplaceSectionKeys.length > 0 ? state.ReplaceSectionKeys : [state.ReplaceSectionKey];
    const keys = wanted.map((key) => key.trim()).filter((key) => key.length > 0);
    if (TargetsUnread(context)) return keys;
    return context.Sections.map((s) => s.Key).filter((key) => keys.includes(key));
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
    if (TargetsUnread(context)) return [...state.ReplaceFieldNames];
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
    if (tabs.some((item) => item.Key === DETAILS_SECTION_KEY)) return DETAILS_SECTION_KEY;
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
    if (SlotChromeGroup(state.Slot) === 'details') {
        return context.Rail.find((item) => item.Key === DETAILS_SECTION_KEY) ?? null;
    }
    return null;
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
    /**
     * Keeps a panel that is off, off, rather than saving it as a draft. Only an edit of a panel
     * that is off offers it, and it is false whenever {@link ActivateNow} is true.
     */
    KeepOff: boolean;
}

/** The answers, in the shape the write path consumes. */
export interface FormPlacementDecision {
    /** Merged into `spec.formContribution` before the create action runs. */
    Contribution: FormContributionSpec;
    /** False leaves the row Pending — stored, rendering for nobody. */
    ActivateNow: boolean;
    /** True leaves a row that is off, off, rather than Pending. */
    KeepOff?: boolean;
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
 * The fixed default. A host that wants the dialog to start from a proposal's claims seeds it
 * with {@link PlacementStateFromContribution}.
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
        KeepOff: false,
    };
}

/**
 * The starting answers read from a contribution block: the user's own earlier choice when
 * editing a saved row, or a generated panel's proposal when applying one. A claim the form
 * cannot honour falls back to the default.
 *
 * While the form is unread ({@link TargetsUnread}), a section, tab, field or in-section claim
 * cannot be checked, so it is passed through as stated. A grid or panel claim is still checked
 * against the context's grids and panels. A field claim is matched against the sections' fields
 * whether or not those were read from the form, so it can name fields the dialog does not offer.
 *
 * @param activeNow Whether the panel is on now, so the edit keeps it on.
 * @param keepOff Whether the panel is off now, so the edit keeps it off rather than making it a draft.
 */
export function PlacementStateFromContribution(
    spec: FormContributionSpec,
    context: FormPlacementContext,
    activeNow: boolean,
    keepOff = false,
): FormPlacementState {
    // A claim that cannot be checked is kept as stored: Details and More are tabs, any other key a section.
    const unread = TargetsUnread(context);
    const railKey = (spec.replacesSectionKey ?? '').trim();
    const listed = (spec.replacesSectionKeys ?? [])
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && (unread || context.Sections.some((s) => s.Key === k)));
    const unreadTab = unread && railKeyChromeGroup(railKey) !== null;
    const sectionKey = context.Sections.some((s) => s.Key === railKey)
        ? railKey
        : listed[0] ?? (unread && !unreadTab ? railKey : '');
    const isRailTab = !!railKey && !sectionKey
        && (unreadTab || ReplaceableRailTabs(context).some((tab) => tab.Key === railKey));

    // A claim is read back against the section holding the first field the form still
    // draws. A claim whose fields have all gone is dropped rather than shown against a
    // section it no longer touches.
    const claimedFields = (spec.replacesFieldNames ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
    const fieldSection = claimedFields
        .map((name) => SectionHoldingField(context, name))
        .find((section): section is FormPlacementSection => section != null) ?? null;
    const keptFields = fieldSection
        ? claimedFields.filter((name) => (fieldSection.Fields ?? []).some((f) => f.Name === name))
        : unread ? claimedFields : [];

    const relatedIndex = relatedTargetIndex(context, spec);
    const contributionIndex = spec.contributionKey
        ? context.Existing.findIndex((e) => e.Key === spec.contributionKey)
        : -1;

    // A section to draw inside must be one the form draws, unless the form was never read.
    const inSectionKey = (spec.inSectionKey ?? '').trim();
    const keptInSectionKey = inSectionKey && (unread || context.Sections.some((s) => s.Key === inSectionKey))
        ? inSectionKey
        : '';

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
        InSectionKey: mode === 'none' ? keptInSectionKey : '',
        SectionPosition: spec.sectionPosition === 'end' ? 'end' : 'start',
        ReplaceFieldSectionKey: fieldSection?.Key || DefaultFieldSectionKey(context),
        ReplaceFieldNames: keptFields,
        ReplaceRelatedIndex: relatedIndex >= 0 ? relatedIndex : 0,
        ReplaceContributionIndex: contributionIndex >= 0 ? contributionIndex : 0,
        SortKey: spec.sortKey ?? null,
        ActivateNow: activeNow,
        KeepOff: !activeNow && keepOff,
    };
}

/**
 * Whether a panel standing in for this tab has to be filed into it: `details` or `more` for the
 * two tabs the chrome layer assembles from their members, null for any other tab, which is named
 * after the panels it holds and dissolves when they are all replaced.
 */
function railKeyChromeGroup(railKey: string): 'details' | 'more' | null {
    return ReplacedSectionChromeGroup(railKey, null);
}

/**
 * The grid a stored related claim names. Matched on the join field too when the claim has one,
 * because two grids can show the same entity. -1 when the form shows no such grid.
 */
function relatedTargetIndex(context: FormPlacementContext, spec: FormContributionSpec): number {
    if (!spec.relatedEntity) return -1;
    const join = StripJoinFieldBrackets(spec.relatedJoinField);
    return context.Related.findIndex((r) => r.Entity === spec.relatedEntity
        && (!join || StripJoinFieldBrackets(r.JoinField) === join));
}

/**
 * The block an edited row is written back with.
 *
 * {@link ResolvePlacementDecision} writes a key only when the user chose to replace a panel, and
 * the write path derives one otherwise. For a row already saved, that would change its identity
 * on every edit. So a decision with no key and no grid claim keeps the row's own key, unless that
 * key was the claim the user just dropped: the key of a panel the dialog listed, or a grid key.
 *
 * @param existing The other panels the dialog offered to replace.
 */
export function KeepEditedRowKey(
    contribution: FormContributionSpec,
    row: { ContributionKey: string | null },
    existing: readonly FormPlacementExisting[],
): FormContributionSpec {
    const key = row.ContributionKey?.trim();
    if (!key || contribution.contributionKey || contribution.relatedEntity) return contribution;
    if (existing.some((e) => e.Key === key)) return contribution;
    // Any grid key, whatever casing or join field it was written with.
    if (key.startsWith('related:')) return contribution;
    return { ...contribution, contributionKey: key };
}

/**
 * The state as a contribution block.
 *
 * `sortKey` is written only once the user has placed the panel among others in its position,
 * and `contributionKey` is set only when the user chose to
 * take over a named panel. A key is what makes one contribution replace another, so it is
 * written when a replacement is meant and left for the write path to derive otherwise — the
 * duplicate check compares those strings literally, and two algorithms would not agree.
 * The proposal's `configuration` is carried through; a field claim also writes the chosen
 * fields into `configuration.fields`.
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
            // A bare strip is never a rail item, so it joins nothing.
            const group = railKeyChromeGroup(key);
            if (group && state.Presentation !== 'bare') contribution.chromeGroup = group;
        }
    } else if (state.ReplaceMode === 'section') {
        const keys = ChosenSectionKeys(state, context);
        if (keys.length === 1) contribution.replacesSectionKey = keys[0];
        else if (keys.length > 1) contribution.replacesSectionKeys = keys;
        // Panels drawing in one place break ties by page order, so they share one slot and the
        // slot sorts them by `sortKey`, as the order list does.
        if (keys.length > 0 && SlotIsOnForm(context, 'before-fields')) contribution.slot = 'before-fields';
    } else if (state.ReplaceMode === 'field') {
        writeFieldClaim(contribution, ChosenFieldNames(state, context), state.SectionPosition);
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

    return { Contribution: contribution, ActivateNow: state.ActivateNow, KeepOff: !state.ActivateNow && state.KeepOff };
}

/**
 * A claim on the chosen fields: `replacesFieldNames`, the same names in `configuration.fields`
 * (the list a field panel draws, while the host applies edits only for claimed fields), and
 * the position when it is the end. With no names it writes nothing.
 */
function writeFieldClaim(contribution: FormContributionSpec, names: string[], position: FormPlacementState['SectionPosition']): void {
    if (names.length === 0) return;
    contribution.replacesFieldNames = names;
    contribution.configuration = { ...(contribution.configuration ?? {}), fields: [...names] };
    if (position === 'end') contribution.sectionPosition = 'end';
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
