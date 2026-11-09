import { describe, it, expect } from 'vitest';
import { SlotDisplayOrder } from '../slot-order';
import { BaseFormPanel, type FormPanelRegistrationMetadata } from '../base-form-panel';

/**
 * A form lays its panels out in one flex column and sequences them with CSS `order` drawn
 * from the form's section order. A contribution's key is never in that list, so the lookup
 * answers with the section count — the highest order on the form — and the panel rendered
 * last however early its slot sat. These orders are what restore the slot's meaning, so the
 * only thing that matters is that they sort the way the document does.
 */
describe('SlotDisplayOrder', () => {
    it('sorts the slots in document order', () => {
        const orders = [
            SlotDisplayOrder('top-area'),
            SlotDisplayOrder('before-fields'),
            SlotDisplayOrder('after-fields'),
            SlotDisplayOrder('after-related'),
            SlotDisplayOrder('after-everything'),
        ];
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });

    it('puts the slots above the fields before a field section, and the rest after', () => {
        // Field sections take 0..n from the form's own section order.
        expect(SlotDisplayOrder('top-area')).toBeLessThan(0);
        expect(SlotDisplayOrder('before-fields')).toBeLessThan(0);
        expect(SlotDisplayOrder('after-fields')).toBeGreaterThan(1000);
        expect(SlotDisplayOrder('after-everything')).toBeGreaterThan(SlotDisplayOrder('after-related'));
    });

    it('renders a higher sortKey earlier within one slot, matching how the slot host sorts', () => {
        expect(SlotDisplayOrder('after-fields', 100)).toBeLessThan(SlotDisplayOrder('after-fields', 10));
        expect(SlotDisplayOrder('after-fields', 0)).toBeLessThan(SlotDisplayOrder('after-fields', -5));
    });

    it('keeps a sortKey inside its own band, so ordering never crosses slots', () => {
        expect(SlotDisplayOrder('before-fields', 9999)).toBeLessThan(SlotDisplayOrder('after-fields', -9999));
    });

    it('treats an unrecognised slot as the terminator rather than the top of the form', () => {
        const unknown = SlotDisplayOrder('not-a-slot' as never);
        expect(unknown).toBe(SlotDisplayOrder('after-everything'));
    });
});

/**
 * A compiled panel builds its own `mj-collapsible-panel` and has to pass `[Order]`, or the
 * form falls back to the section count for a key it does not know and draws every panel at
 * the bottom whatever slot it asked for.
 */
describe('BaseFormPanel.DisplayOrder', () => {
    class TestPanel extends BaseFormPanel {}

    function panel(metadata: FormPanelRegistrationMetadata, form?: unknown): TestPanel {
        const p = new TestPanel();
        p.RegistrationMetadata = metadata;
        if (form) p.FormComponent = form as TestPanel['FormComponent'];
        return p;
    }

    it('reads its slot band from the registration it was mounted from', () => {
        expect(panel({ entity: 'E', slot: 'before-fields' }).DisplayOrder)
            .toBe(SlotDisplayOrder('before-fields'));
        expect(panel({ entity: 'E', slot: 'after-related', sortKey: 10 }).DisplayOrder)
            .toBe(SlotDisplayOrder('after-related', 10));
    });

    it('takes the place of the section it stands in for, rather than its slot band', () => {
        const form = { getSectionOrderIndex: (key: string) => (key === 'configuration' ? 3 : null) };
        expect(panel({ entity: 'E', slot: 'after-fields', replacesSectionKey: 'configuration' }, form).DisplayOrder)
            .toBe(3);
    });

    it('takes the place of the first of several sections it stands in for', () => {
        const order: Record<string, number> = { profile: 4, identity: 2 };
        const form = { getSectionOrderIndex: (key: string) => order[key] ?? null };
        expect(panel({ entity: 'E', slot: 'after-fields', replacesSectionKeys: ['profile', 'identity'] }, form).DisplayOrder)
            .toBe(2);
    });

    it('falls back to its slot when the section it claimed is not in the order', () => {
        const form = { getSectionOrderIndex: () => null };
        expect(panel({ entity: 'E', slot: 'after-fields', replacesSectionKey: 'gone' }, form).DisplayOrder)
            .toBe(SlotDisplayOrder('after-fields'));
    });

    it('sinks to the bottom when it was created outside a slot host', () => {
        expect(new TestPanel().DisplayOrder).toBe(SlotDisplayOrder('after-everything'));
    });
});
