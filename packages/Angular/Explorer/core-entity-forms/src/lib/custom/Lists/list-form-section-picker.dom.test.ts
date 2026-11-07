/**
 * The Lists form's phone nav: the rail becomes an `mj-section-picker`. These specs pin the adapter
 * (rail order, badge as count, disabled items left out) and the pick handler (a known key activates
 * the section, an unknown one is ignored).
 */
import { describe, it, expect } from 'vitest';
import { MJListFormComponentExtended } from './list-form.component';

function form() {
    const f = Object.create(MJListFormComponentExtended.prototype) as MJListFormComponentExtended;
    Object.assign(f, {
        cdr: { detectChanges: () => undefined, markForCheck: () => undefined },
        NavItems: [
            { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
            { id: 'items', icon: 'fa-solid fa-list', label: 'Items', badge: 12 },
            { id: 'sharing', icon: 'fa-solid fa-share-nodes', label: 'Sharing', badge: 0, disabled: true },
        ],
        ActiveSection: 'overview',
    });
    return f;
}

describe('MJListFormComponentExtended phone section picker', () => {
    it('exposes the enabled rail items in rail order with the badge as the count', () => {
        expect(form().SectionPickerItems).toEqual([
            { Key: 'overview', Title: 'Overview', Icon: 'fa-solid fa-house', Count: null },
            { Key: 'items', Title: 'Items', Icon: 'fa-solid fa-list', Count: 12 },
        ]);
    });

    it('activates the picked section when the key names a rail item', () => {
        const f = form();
        f.OnSectionPicked('items');
        expect(f.ActiveSection).toBe('items');
    });

    it('ignores a key that is not a rail item', () => {
        const f = form();
        f.OnSectionPicked('nope');
        expect(f.ActiveSection).toBe('overview');
    });
});
