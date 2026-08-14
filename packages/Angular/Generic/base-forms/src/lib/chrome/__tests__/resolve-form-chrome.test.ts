import { describe, it, expect } from 'vitest';
import { EntityInfo, type FormRole } from '@memberjunction/core';
import { DETAILS_SECTION_KEY, MORE_SECTION_KEY, HumanizeEntityTitle, IsAlwaysMoreSection } from '../form-chrome';
import { BuildDefaultChromeSpec, MoveChromeGroupInSectionOrder, OrderChromeGroups } from '../resolve-form-chrome';
import { FormChromeCoordinator } from '../form-chrome-coordinator.service';

describe('HumanizeEntityTitle', () => {
    it('strips a schema entity-name prefix', () => {
        expect(HumanizeEntityTitle('MJ_BizApps_Common: Contact Methods')).toBe('Contact Methods');
        expect(HumanizeEntityTitle('MJ_BizApps_Orders: Order Headers')).toBe('Order Headers');
    });

    it('leaves ordinary section names alone', () => {
        expect(HumanizeEntityTitle('Personal Identity')).toBe('Personal Identity');
        expect(HumanizeEntityTitle('Order Headers (Bill To Person)')).toBe('Order Headers (Bill To Person)');
    });
});

describe('BuildDefaultChromeSpec', () => {
    it('keeps field panels first-class and parks Detail related in More', () => {
        const roles = new Map<string, FormRole>([
            ['contactMethods', 'Primary'],
            ['orderHeadersBillToPersonID', 'Detail'],
            ['tasks', 'Detail'],
        ]);
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'contactMethods', SectionName: 'Contact Methods', Variant: 'related-entity' },
                { SectionKey: 'orderHeadersBillToPersonID', SectionName: 'Orders', Variant: 'related-entity' },
                { SectionKey: 'tasks', SectionName: 'Tasks', Variant: 'related-entity' },
            ],
            roles,
            { AutoLeftNavAt: 8 },
        );
        expect(spec.MoreSectionKeys).toEqual(['orderHeadersBillToPersonID', 'tasks']);
        expect(spec.Groups.some((g) => g.Key === MORE_SECTION_KEY && g.IsMore)).toBe(true);
        expect(spec.Groups.find((g) => g.Key === 'contactMethods')).toBeTruthy();
        expect(spec.Groups.find((g) => g.Key === DETAILS_SECTION_KEY)?.SectionKeys).toEqual(['details']);
        expect(spec.Layout).toBe('accordion');
    });

    it('collapses every field panel into one Details rail item', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'identity', SectionName: 'Personal Identity', Variant: 'default' },
                { SectionKey: 'addresses', SectionName: 'Addresses', Variant: 'default' },
                { SectionKey: 'notes', SectionName: 'Notes', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Primary']]),
            { Layout: 'left-nav' },
        );
        expect(spec.Groups.find((g) => g.Key === DETAILS_SECTION_KEY)?.SectionKeys).toEqual([
            'identity',
            'addresses',
            'notes',
        ]);
        expect(spec.Groups.find((g) => g.Key === 'orders')).toBeTruthy();
        expect(spec.Groups).toHaveLength(2);
    });

    it('merges related groups that share a humanized title', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'relFrom', SectionName: 'Relationships', Variant: 'related-entity' },
                { SectionKey: 'relTo', SectionName: 'Relationships', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['relFrom', 'Primary'], ['relTo', 'Primary']]),
            { Layout: 'left-nav' },
        );
        const relationships = spec.Groups.filter((g) => g.Title === 'Relationships');
        expect(relationships).toHaveLength(1);
        expect(relationships[0].SectionKeys).toEqual(['relFrom', 'relTo']);
    });

    it('switches to left-nav when first-class groups reach the threshold', () => {
        const panels = Array.from({ length: 8 }, (_, i) => ({
            SectionKey: `s${i}`,
            SectionName: `Section ${i}`,
            Variant: 'related-entity',
        }));
        const spec = BuildDefaultChromeSpec(panels, new Map(), { Layout: 'auto', AutoLeftNavAt: 8 });
        expect(spec.Layout).toBe('left-nav');
        expect(spec.Groups).toHaveLength(8);
    });

    it('parks System Metadata in More', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'accountAndStatus', SectionName: 'Account and Status', Variant: 'default' },
                { SectionKey: 'systemMetadata', SectionName: 'System Metadata', Variant: 'default' },
            ],
            new Map(),
            { Layout: 'left-nav' },
        );
        expect(spec.MoreSectionKeys).toEqual(['systemMetadata']);
        expect(spec.Groups.find((g) => g.Key === DETAILS_SECTION_KEY)?.SectionKeys).toEqual(['accountAndStatus']);
    });

    it('uses the panel icon on related rail items', () => {
        const spec = BuildDefaultChromeSpec(
            [{
                SectionKey: 'tasks',
                SectionName: 'Tasks',
                Variant: 'related-entity',
                Icon: 'fa-solid fa-list-check',
            }],
            new Map<string, FormRole>([['tasks', 'Primary']]),
            { Layout: 'left-nav' },
        );
        expect(spec.Groups.find((g) => g.Key === 'tasks')?.Icon).toBe('fa-solid fa-list-check');
    });

    it('omits More when nothing is Detail', () => {
        const spec = BuildDefaultChromeSpec(
            [{ SectionKey: 'details', SectionName: 'Details', Variant: 'default' }],
            new Map(),
            null,
        );
        expect(spec.MoreSectionKeys).toEqual([]);
        expect(spec.Groups.some((g) => g.IsMore)).toBe(false);
    });
});

describe('FormChromeCoordinator', () => {
    it('hides Detail related until More is expanded in accordion', () => {
        const coordinator = new FormChromeCoordinator();
        coordinator.Apply(BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Detail']]),
            { Layout: 'accordion' },
        ));
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(false);
        coordinator.ToggleMore(true);
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(true);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(true);
    });

    it('shows only the active left-nav group', () => {
        const coordinator = new FormChromeCoordinator();
        coordinator.Apply(BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'contacts', SectionName: 'Contacts', Variant: 'related-entity' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['contacts', 'Primary'], ['orders', 'Detail']]),
            { Layout: 'left-nav' },
        ));
        coordinator.SetActiveGroup(DETAILS_SECTION_KEY);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(true);
        expect(coordinator.IsFirstClassSectionVisible('contacts')).toBe(false);
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(false);
        coordinator.SetActiveGroup(MORE_SECTION_KEY);
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(false);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(false);
        coordinator.SetActiveGroup('orders');
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(true);
        expect(coordinator.MoreExpanded).toBe(true);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(false);
    });

    it('toggles the More folder without dumping leftover panels', () => {
        const coordinator = new FormChromeCoordinator();
        coordinator.Apply(BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Detail']]),
            { Layout: 'left-nav' },
        ));
        coordinator.SetActiveGroup(DETAILS_SECTION_KEY);
        coordinator.ToggleMoreFolder();
        expect(coordinator.MoreExpanded).toBe(true);
        expect(coordinator.IsRelatedSectionVisible('orders')).toBe(false);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(true);
    });

    it('hides ungrouped sections in left-nav', () => {
        const coordinator = new FormChromeCoordinator();
        coordinator.Apply(BuildDefaultChromeSpec(
            [{ SectionKey: 'details', SectionName: 'Details', Variant: 'default' }],
            new Map(),
            { Layout: 'left-nav' },
        ));
        expect(coordinator.IsFirstClassSectionVisible('addresses')).toBe(false);
        expect(coordinator.IsFirstClassSectionVisible('details')).toBe(true);
    });
});

describe('IsAlwaysMoreSection', () => {
    it('matches the system-metadata section key and title', () => {
        expect(IsAlwaysMoreSection('systemMetadata')).toBe(true);
        expect(IsAlwaysMoreSection('other', 'System Metadata')).toBe(true);
        expect(IsAlwaysMoreSection('accountAndStatus', 'Account and Status')).toBe(false);
    });
});

describe('OrderChromeGroups / MoveChromeGroupInSectionOrder', () => {
    it('sorts first-class groups by the user section order and keeps More last', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
                { SectionKey: 'tasks', SectionName: 'Tasks', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Primary'], ['tasks', 'Detail']]),
            { Layout: 'left-nav' },
        );
        const ordered = OrderChromeGroups(spec.Groups, ['orders', 'details']);
        expect(ordered.map((g) => g.Key)).toEqual(['orders', DETAILS_SECTION_KEY, MORE_SECTION_KEY]);
    });

    it('moves a rail group as a block in the section order', () => {
        const orders = { Key: 'orders', Title: 'Orders', Icon: '', SectionKeys: ['orders'], IsMore: false };
        const details = {
            Key: DETAILS_SECTION_KEY,
            Title: 'Details',
            Icon: '',
            SectionKeys: ['addresses', 'profile'],
            IsMore: false,
        };
        const next = MoveChromeGroupInSectionOrder(
            ['addresses', 'profile', 'orders'],
            orders,
            details,
        );
        expect(next).toEqual(['orders', 'addresses', 'profile']);
    });
});

describe('EntityInfo ConfigurationObject', () => {
    it('parses the Configuration column', () => {
        const entity = new EntityInfo({
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            Configuration: JSON.stringify({
                UI: { Form: { RelatedRolePolicy: 'smart', PrimaryRelatedBudget: 4 } },
            }),
        });
        expect(entity.ConfigurationObject?.UI?.Form?.PrimaryRelatedBudget).toBe(4);
    });
});
