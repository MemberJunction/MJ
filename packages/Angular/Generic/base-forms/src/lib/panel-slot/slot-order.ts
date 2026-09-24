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

/** Slots that sit between the form's own blocks, so their place is read off the page. */
export const ANCHORED_SLOTS: ReadonlySet<FormPanelSlot> = new Set<FormPanelSlot>(['before-fields', 'after-fields', 'after-related']);

/**
 * The section a slot sits next to on the page: the first section after it, else the last
 * section before it. Null when the slot's column holds no section.
 *
 * Related grids take places in the form's section order just as field sections do, so no fixed
 * band lands between the last field and the first grid on every form. Taking the order of the
 * neighbouring section does: equal orders keep page order, so a panel anchored `before` a
 * section draws just above it, and one anchored `after` draws just below.
 */
export function SlotAnchorSectionKey(slotElement: Element): { Key: string; Side: 'before' | 'after' } | null {
    const after = neighbourSection(slotElement, 'next');
    if (after) return { Key: after, Side: 'before' };
    const before = neighbourSection(slotElement, 'previous');
    return before ? { Key: before, Side: 'after' } : null;
}

function neighbourSection(from: Element, direction: 'next' | 'previous'): string | null {
    let node = direction === 'next' ? from.nextElementSibling : from.previousElementSibling;
    while (node) {
        const key = node.matches('mj-collapsible-panel') ? node.getAttribute('data-section-key')?.trim() : '';
        if (key) return key;
        node = direction === 'next' ? node.nextElementSibling : node.previousElementSibling;
    }
    return null;
}
