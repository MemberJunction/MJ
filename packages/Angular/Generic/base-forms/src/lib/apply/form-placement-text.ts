/**
 * @fileoverview The sentences that describe a placement: the line under "Where it goes", the
 * summary beside Apply, and the labels and lists they are built from.
 *
 * Both sentences read what the answers point at through one lookup ({@link placementTarget}),
 * so they always name the same sections, fields, grid, panel or tab.
 */

import { DETAILS_SECTION_TITLE, SlotChromeGroup } from '../chrome/form-chrome';
import {
    ChosenFieldNames,
    ChosenSectionKeys,
    FORM_PLACEMENT_SLOTS,
    HasDetailsTab,
    ShowsRail,
    SlotIsOnForm,
    type FormPlacementContext,
    type FormPlacementSection,
    type FormPlacementState,
} from './form-placement';

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
    if (HasDetailsTab(context) && title.toLowerCase() === DETAILS_SECTION_TITLE.toLowerCase()) {
        return `${title} (the field group, not the tab)`;
    }
    return title;
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
 * Who sees a panel, as the end of "visible to …": the caller alone, a named role, or everyone.
 * A panel added from a conversation is always the caller's own; one edited from the Manage
 * drawer keeps the audience it has.
 */
export function DescribeVisibleTo(scope: string | null | undefined, roleName?: string | null): string {
    if (scope === 'Global') return 'everyone';
    if (scope === 'Role') return roleName ? `the ${roleName} role` : 'a role';
    return 'you only';
}

/** The fields a field claim stands in for, as {@link DescribeFieldList} words them. */
export function DescribeChosenFields(state: FormPlacementState, context: FormPlacementContext): string {
    return DescribeFieldList(chosenFieldLabels(state, context));
}

/**
 * Where the panel goes and what it replaces, in one short line: "In place of the Details and
 * Dates sections", "At the top of Details, in place of the Name field", "After the fields".
 */
export function DescribePlacementLine(state: FormPlacementState, context: FormPlacementContext): string {
    const target = placementTarget(state, context);
    const end = state.SectionPosition === 'end' ? 'bottom' : 'top';
    switch (target.Mode) {
        case 'section':
            return target.Titles.length > 1
                ? `In place of the ${DescribeSectionList(target.Titles)} sections`
                : `In place of the ${target.Titles[0] ?? 'chosen'} section`;
        case 'field': {
            const fields = target.FieldLabels.length > 0 ? DescribeFieldList(target.FieldLabels) : 'the fields you pick';
            return `At the ${end} of ${target.Section?.Title ?? 'the section'}, in place of ${fields}`;
        }
        case 'related':
            return `In place of the ${target.Title ?? 'related'} grid`;
        case 'contribution':
            return `In place of the ${target.Title ?? 'existing'} panel`;
        case 'rail-tab':
            return `In place of the whole ${target.Title ?? state.ReplaceRailKey} tab`;
        default:
            if (target.Section) return `At the ${end} of the ${target.Section.Title} section`;
            return FORM_PLACEMENT_SLOTS.find((s) => s.Slot === state.Slot)?.Name ?? state.Slot;
    }
}

/**
 * One sentence saying what pressing Apply does, in the same terms the user just chose.
 *
 * It is the only place the separate answers are stated together, so a contradiction the
 * form allows — a panel that is active but invisible behind a full form — reads plainly.
 *
 * @param visibleTo Who sees the panel, from {@link DescribeVisibleTo}.
 */
export function SummarizePlacement(
    state: FormPlacementState,
    context: FormPlacementContext,
    visibleTo = DescribeVisibleTo('User'),
): string {
    const target = placementTarget(state, context);
    const inSection = target.Mode === 'none' ? target.Section : null;
    const what = state.Presentation === 'bare' ? 'a bare strip' : 'a panel';
    const where = target.Mode === 'field' ? ''
        : inSection ? ` ${state.SectionPosition === 'end' ? 'at the bottom' : 'at the top'} of the ${inSection.Title} section`
        : ` at ${state.Slot}`;
    const parts = [`Adds ${what}${where} on every ${context.EntityName} record`];

    const replacement = describeReplacement(target, state, context);
    if (replacement) parts.push(replacement);

    if (target.Mode === 'none' && !inSection && state.Presentation === 'panel' && ShowsRail(context)) {
        parts.push(SlotChromeGroup(state.Slot) === 'details'
            ? 'inside the Details tab'
            : 'as a tab of its own');
    }

    parts.push(`visible to ${visibleTo}`);
    parts.push(state.ActivateNow ? 'starting now' : state.KeepOff ? 'kept off' : 'saved as a draft');

    return `${parts.join(', ')}.${summaryCaveats(state, context, inSection)}`;
}

/** What the answers point at on the form, looked up once for every sentence that names it. */
type PlacementTarget =
    | { Mode: 'none'; Section: FormPlacementSection | null }
    | { Mode: 'rail-tab'; Title: string | null }
    | { Mode: 'section'; Titles: string[]; First: FormPlacementSection | null }
    | { Mode: 'field'; Section: FormPlacementSection | null; FieldLabels: string[] }
    | { Mode: 'related'; Title: string | null }
    | { Mode: 'contribution'; Title: string | null };

/**
 * The sections, fields, tab, grid or panel the answers point at. For a placement that replaces
 * nothing, the section the panel draws inside, if any.
 */
function placementTarget(state: FormPlacementState, context: FormPlacementContext): PlacementTarget {
    switch (state.ReplaceMode) {
        case 'rail-tab':
            return { Mode: 'rail-tab', Title: context.Rail.find((item) => item.Key === state.ReplaceRailKey)?.Title ?? null };
        case 'section': {
            const keys = ChosenSectionKeys(state, context);
            return {
                Mode: 'section',
                Titles: keys.map((key) => context.Sections.find((s) => s.Key === key)?.Title ?? key),
                First: context.Sections.find((s) => s.Key === keys[0]) ?? null,
            };
        }
        case 'field':
            return { Mode: 'field', Section: fieldClaimSection(state, context), FieldLabels: chosenFieldLabels(state, context) };
        case 'related':
            return { Mode: 'related', Title: context.Related[state.ReplaceRelatedIndex]?.DisplayName ?? null };
        case 'contribution':
            return { Mode: 'contribution', Title: context.Existing[state.ReplaceContributionIndex]?.Title ?? null };
        default:
            return { Mode: 'none', Section: context.Sections.find((s) => s.Key === state.InSectionKey.trim()) ?? null };
    }
}

/** The section a field claim chooses its fields from, or null when the form does not draw it. */
function fieldClaimSection(state: FormPlacementState, context: FormPlacementContext): FormPlacementSection | null {
    return context.Sections.find((s) => s.Key === state.ReplaceFieldSectionKey) ?? null;
}

/** The labels of the fields a field claim stands in for, falling back to each field's name. */
function chosenFieldLabels(state: FormPlacementState, context: FormPlacementContext): string[] {
    const section = fieldClaimSection(state, context);
    return ChosenFieldNames(state, context)
        .map((name) => (section?.Fields ?? []).find((f) => f.Name === name)?.Label || name);
}

/** The summary's clause about what the panel replaces, or null when it replaces nothing nameable. */
function describeReplacement(target: PlacementTarget, state: FormPlacementState, context: FormPlacementContext): string | null {
    const end = state.SectionPosition === 'end' ? 'bottom' : 'top';
    switch (target.Mode) {
        case 'rail-tab':
            return target.Title
                ? `taking the place of the whole ${target.Title} tab, leaving the other tabs alone`
                : 'taking the place of a whole tab, leaving the other tabs alone';
        case 'section':
            if (target.Titles.length > 1) {
                return `standing in for the ${DescribeSectionList(target.Titles)} sections, in the place of the first`;
            }
            if (target.First && HasDetailsTab(context)) {
                return `standing in for the ${target.First.Title} section, one of ${context.Sections.length} inside the Details tab`;
            }
            return target.First ? `standing in for the ${target.First.Title} section` : null;
        case 'field':
            return target.FieldLabels.length > 0 && target.Section
                ? `standing in for ${DescribeFieldList(target.FieldLabels)} at the ${end} of the ${target.Section.Title} section`
                : 'standing in for no field yet — pick at least one';
        case 'related':
            return target.Title ? `taking over the ${target.Title} grid` : null;
        case 'contribution':
            return target.Title ? `replacing the ${target.Title} panel` : null;
        default:
            return null;
    }
}

/** The sentences that follow the summary when an answer will not land the way it reads. */
function summaryCaveats(
    state: FormPlacementState,
    context: FormPlacementContext,
    inSection: FormPlacementSection | null,
): string {
    let caveats = '';
    if (state.ReplaceMode === 'field') {
        caveats += ' The chosen position does not apply: a panel standing in for a field renders inside that field\'s section.';
    }
    if (state.ReplaceMode !== 'field' && !inSection && context.SlotsVerified && !SlotIsOnForm(context, state.Slot)) {
        caveats += ` This form does not emit ${state.Slot}, so the panel renders at the bottom instead.`;
    }
    if (state.ReplaceMode === 'section' && !context.TargetsVerified) {
        caveats += ' The section list comes from entity metadata, not from the form itself, so a section may not match.';
    }
    if (context.FullCustomForm && state.ActivateNow) {
        caveats += ' A full custom form is rendering this entity, so it will not appear until that form is turned off.';
    }
    return caveats;
}
