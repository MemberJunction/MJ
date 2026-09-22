import type { FormPanelSlot } from './base-form-panel';

/**
 * Flex order for a panel mounted in a slot.
 *
 * A form lays its panels out in one flex column and sequences them with CSS `order`, taken
 * from the form's section order. A contribution's key is not in that list, so
 * `getSectionDisplayOrder` falls back to the section count — the highest order on the form —
 * and the panel renders last however early its slot sits in the document.
 *
 * These bands restore the document meaning of a slot. Field sections occupy 0..n, so the
 * slots above them are negative and the slots below start far past any realistic section
 * count. `sortKey` orders panels sharing one slot, higher first, matching how the slot host
 * sorts them.
 */
const SLOT_BANDS: Record<FormPanelSlot, number> = {
    'top-area': -2_000_000,
    'before-fields': -1_000_000,
    'after-fields': 1_000_000,
    'after-related': 2_000_000,
    'after-everything': 3_000_000,
};

/** The band for `slot`, offset within it by `sortKey` so higher sort keys render earlier. */
export function SlotDisplayOrder(slot: FormPanelSlot, sortKey = 0): number {
    return (SLOT_BANDS[slot] ?? SLOT_BANDS['after-everything']) - sortKey;
}
