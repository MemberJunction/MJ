/**
 * @fileoverview The order of panels in one position on the form, and the order number that
 * moves the placed panel up or down among them.
 */

import {
    ChosenSectionKeys,
    SectionHoldingField,
    TargetsUnread,
    type FormPlacementContext,
    type FormPlacementExisting,
    type FormPlacementState,
} from './form-placement';

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
        const drawn = TargetsUnread(context)
            ? replaced
            : context.Sections.map((s) => s.Key).filter((key) => replaced.includes(key));
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
