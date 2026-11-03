/**
 * The Entities form's phone nav: the icon rail becomes an `mj-section-picker`. These specs pin the
 * adapter between the rail's NavItems and the picker (same order, badge as Count), the pick handler
 * (a known key activates the section, an unknown one is ignored) and the phone defaults applied at
 * init (Relations opens as the list, since the ERD is a desktop experience).
 */
import { describe, it, expect } from 'vitest';
import { MJEntityFormComponentExtended } from './entity-form.component';

function form() {
    const f = Object.create(MJEntityFormComponentExtended.prototype) as MJEntityFormComponentExtended;
    const bag = f as unknown as { cdr: { markForCheck(): void }; NavItems: unknown; ActiveSection: string; RelationshipViewMode: string; DetailPanelOpen: boolean };
    bag.cdr = { markForCheck: () => undefined };
    bag.NavItems = [
        { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
        { id: 'fields', icon: 'fa-solid fa-table-cells', label: 'Fields', badge: 81 },
        { id: 'permissions', icon: 'fa-solid fa-lock', label: 'Security', badge: 3 },
    ];
    bag.ActiveSection = 'overview';
    bag.RelationshipViewMode = 'diagram';
    bag.DetailPanelOpen = false;
    return f;
}

describe('MJEntityFormComponentExtended phone section picker', () => {
    it('exposes the rail items as picker items in rail order with the badge as the count', () => {
        expect(form().SectionPickerItems).toEqual([
            { Key: 'overview', Title: 'Overview', Icon: 'fa-solid fa-house', Count: null },
            { Key: 'fields', Title: 'Fields', Icon: 'fa-solid fa-table-cells', Count: 81 },
            { Key: 'permissions', Title: 'Security', Icon: 'fa-solid fa-lock', Count: 3 },
        ]);
    });

    it('activates the picked section when the key names a rail item', () => {
        const f = form();
        f.OnSectionPicked('fields');
        expect(f.ActiveSection).toBe('fields');
    });

    it('ignores a key that is not a rail item', () => {
        const f = form();
        f.OnSectionPicked('nope');
        expect(f.ActiveSection).toBe('overview');
    });

    it('opens Relations as the list on a phone and leaves the diagram default elsewhere', () => {
        const phone = form();
        phone.ApplyPhoneDefaults(true);
        expect(phone.RelationshipViewMode).toBe('list');
        const desktop = form();
        desktop.ApplyPhoneDefaults(false);
        expect(desktop.RelationshipViewMode).toBe('diagram');
    });
});
