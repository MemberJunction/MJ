import { describe, it, expect } from 'vitest';
import { SlotAnchorSectionKey } from './slot-order';
import { BaseFormPanel } from './base-form-panel';
import { SlotDisplayOrder } from './slot-order';

/**
 * Field sections and related grids share one flex column, sequenced by the form's section order,
 * and related grids take places in that order too. A slot between them therefore has no fixed
 * number that sorts right on every form: "after the fields" has to land after the last field
 * section and before the first grid, wherever those are. So a slot takes the order of the section
 * that follows it on the page — equal orders keep page order, which puts the panel first — or,
 * when nothing follows, of the one before it.
 */

function section(key: string): HTMLElement {
    const node = document.createElement('mj-collapsible-panel');
    node.setAttribute('data-section-key', key);
    return node;
}

function slot(name: string): HTMLElement {
    const node = document.createElement('mj-form-panel-slot');
    node.setAttribute('data-form-slot', name);
    return node;
}

function column(...children: HTMLElement[]): HTMLElement {
    const node = document.createElement('div');
    children.forEach((child) => node.appendChild(child));
    return node;
}

describe('SlotAnchorSectionKey', () => {
    it('anchors a slot to the section that follows it', () => {
        const after = slot('after-fields');
        column(section('details'), after, section('enrollments'));
        expect(SlotAnchorSectionKey(after)).toEqual({ Key: 'enrollments', Side: 'before' });
    });

    it('skips other slots on the way', () => {
        const before = slot('before-fields');
        column(slot('top-area'), before, slot('other'), section('details'));
        expect(SlotAnchorSectionKey(before)).toEqual({ Key: 'details', Side: 'before' });
    });

    it('anchors to the section before it when nothing follows', () => {
        const after = slot('after-related');
        column(section('details'), section('enrollments'), after, document.createElement('div'));
        expect(SlotAnchorSectionKey(after)).toEqual({ Key: 'enrollments', Side: 'after' });
    });

    it('has no anchor in a column with no sections', () => {
        const lone = slot('after-fields');
        column(lone);
        expect(SlotAnchorSectionKey(lone)).toBeNull();
    });
});

describe('BaseFormPanel.DisplayOrder on the page', () => {
    class TestPanel extends BaseFormPanel {}

    const ORDER: Record<string, number> = { details: 0, dates: 1, enrollments: 2 };
    const form = {
        getSectionOrderIndex: (key: string) => ORDER[key] ?? null,
        getSectionDisplayOrder: (key: string) => ORDER[key] ?? 3,
    };

    function mountedIn(slotName: string, metadata: Record<string, unknown> = {}): TestPanel {
        const host = slot(slotName);
        column(slot('before-fields'), section('details'), section('dates'), host, section('enrollments'));
        if (slotName === 'before-fields') {
            const first = host.parentElement!.firstElementChild as HTMLElement;
            host.parentElement!.replaceChild(host, first);
        }
        const p = new TestPanel();
        p.RegistrationMetadata = { entity: 'E', slot: slotName as never, ...metadata };
        p.FormComponent = form as never;
        p.SlotElement = host;
        return p;
    }

    it('draws after the fields and before the first grid, whatever number the grid has', () => {
        expect(mountedIn('after-fields').DisplayOrder).toBe(ORDER['enrollments']);
    });

    it('draws before the first field section', () => {
        expect(mountedIn('before-fields').DisplayOrder).toBe(ORDER['details']);
    });

    it('keeps the fixed band for the very top and the very bottom', () => {
        expect(mountedIn('after-everything').DisplayOrder).toBe(SlotDisplayOrder('after-everything'));
        expect(mountedIn('top-area').DisplayOrder).toBe(SlotDisplayOrder('top-area'));
    });

    it('still takes the place of a section it replaces', () => {
        expect(mountedIn('after-fields', { replacesSectionKey: 'dates' }).DisplayOrder).toBe(1);
    });
});
