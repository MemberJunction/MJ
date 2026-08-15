import { describe, it, expect } from 'vitest';
import { EntityInfo, type FormRole } from '@memberjunction/core';
import { DETAILS_SECTION_KEY, MORE_SECTION_KEY, HumanizeEntityTitle, IsAlwaysMoreSection } from '../form-chrome';
import { ApplyUserChromeMembership, BuildDefaultChromeSpec, MoveChromeGroupInSectionOrder, OrderChromeGroups, OrderMoreSectionKeys, ResolveFormChrome, TakeDecoratedChrome } from '../resolve-form-chrome';
import type { FormChromeSpec } from '../form-chrome';
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

    it('lifts a registered contribution widget out of Details', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'accountAndStatus', SectionName: 'Account and Status', Variant: 'default' },
                { SectionKey: 'addresses', SectionName: 'Addresses', Variant: 'default' },
            ],
            new Map(),
            { Layout: 'left-nav' },
            ['addresses'],
        );
        expect(spec.Groups.find((g) => g.Key === DETAILS_SECTION_KEY)?.SectionKeys).toEqual(['accountAndStatus']);
        expect(spec.Groups.find((g) => g.Key === 'addresses')?.Title).toBe('Addresses');
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

    it('does not merge a contribution-hidden baked grid into the custom widget', () => {
        const relatedId = '22222222-2222-2222-2222-222222222222';
        const entity = new EntityInfo({
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [{
                ID: '11111111-1111-1111-1111-111111111111',
                RelatedEntity: 'MJ_BizApps_Common: Contact Methods',
                RelatedEntityID: relatedId,
                RelatedEntityJoinField: 'PersonID',
                DisplayInForm: true,
                DisplayName: 'Contact Methods',
                Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
            }],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [{
                SectionKey: 'contactMethods',
                SectionName: 'Contact Methods',
                Variant: 'related-entity',
            }],
            RelatedSchemaByEntityId: new Map([[relatedId, 'MJ_BizApps_Common']]),
            HiddenSectionKeys: ['mJBizAppsCommonContactMethods'],
        });
        const group = result.Spec.Groups.find((g) => g.Title === 'Contact Methods');
        expect(group?.SectionKeys).toEqual(['contactMethods']);
        expect(result.Spec.MoreSectionKeys).not.toContain('mJBizAppsCommonContactMethods');
    });

    it('prefers EntityRelationship.DisplayName on a single-key related group', () => {
        const relatedId = '33333333-3333-3333-3333-333333333333';
        const entity = new EntityInfo({
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [{
                ID: '44444444-4444-4444-4444-444444444444',
                RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
                RelatedEntityID: relatedId,
                RelatedEntityJoinField: 'BillToPersonID',
                DisplayInForm: true,
                DisplayName: 'Orders',
                Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
            }],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [{
                SectionKey: 'mJBizAppsOrdersOrderHeaders',
                SectionName: 'Order Headers (Bill To Person)',
                Variant: 'related-entity',
            }],
            RelatedSchemaByEntityId: new Map([[relatedId, 'MJ_BizApps_Orders']]),
        });
        const group = result.Spec.Groups.find((g) => g.SectionKeys.includes('mJBizAppsOrdersOrderHeaders'));
        expect(group?.Title).toBe('Orders');
    });

    it('merges two join-field Order Header groups into one Orders rail item', () => {
        const relatedId = '55555555-5555-5555-5555-555555555555';
        const entity = new EntityInfo({
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [
                {
                    ID: '66666666-6666-6666-6666-666666666666',
                    RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
                    RelatedEntityID: relatedId,
                    RelatedEntityJoinField: 'BillToPersonID',
                    DisplayInForm: true,
                    DisplayName: 'Orders',
                    Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
                },
                {
                    ID: '77777777-7777-7777-7777-777777777777',
                    RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
                    RelatedEntityID: relatedId,
                    RelatedEntityJoinField: 'ShipToPersonID',
                    DisplayInForm: true,
                    Configuration: JSON.stringify({ UI: { FormRole: 'Primary' } }),
                },
            ],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [
                {
                    SectionKey: 'mJBizAppsOrdersOrderHeadersBillToPersonID',
                    SectionName: 'Orders',
                    Variant: 'related-entity',
                },
                {
                    SectionKey: 'mJBizAppsOrdersOrderHeadersShipToPersonID',
                    SectionName: 'Order Headers (Ship To Person)',
                    Variant: 'related-entity',
                },
            ],
            RelatedSchemaByEntityId: new Map([[relatedId, 'MJ_BizApps_Orders']]),
        });
        const orders = result.Spec.Groups.filter((g) => !g.IsMore && g.Key !== DETAILS_SECTION_KEY);
        expect(orders).toHaveLength(1);
        expect(orders[0].Title).toBe('Orders');
        expect(orders[0].SectionKeys).toEqual(expect.arrayContaining([
            'mJBizAppsOrdersOrderHeadersBillToPersonID',
            'mJBizAppsOrdersOrderHeadersShipToPersonID',
        ]));
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

    it('hides System Metadata in accordion until More is expanded', () => {
        const coordinator = new FormChromeCoordinator();
        coordinator.Apply(BuildDefaultChromeSpec(
            [
                { SectionKey: 'accountAndStatus', SectionName: 'Account and Status', Variant: 'default' },
                { SectionKey: 'systemMetadata', SectionName: 'System Metadata', Variant: 'default' },
            ],
            new Map(),
            { Layout: 'accordion' },
        ));
        expect(coordinator.IsAccordionSectionVisible('systemMetadata')).toBe(false);
        expect(coordinator.IsFirstClassSectionVisible('systemMetadata')).toBe(false);
        expect(coordinator.IsAccordionSectionVisible('accountAndStatus')).toBe(true);
        coordinator.ToggleMore(true);
        expect(coordinator.IsAccordionSectionVisible('systemMetadata')).toBe(true);
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

describe('ApplyUserChromeMembership', () => {
    it('moves a first-class related group into More and back out', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
                { SectionKey: 'tasks', SectionName: 'Tasks', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Primary'], ['tasks', 'Detail']]),
            { Layout: 'accordion' },
        );
        ApplyUserChromeMembership(spec, { moreSectionKeys: ['orders'] }, [
            { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
            { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            { SectionKey: 'tasks', SectionName: 'Tasks', Variant: 'related-entity' },
        ]);
        expect(spec.MoreSectionKeys).toEqual(expect.arrayContaining(['orders', 'tasks']));
        expect(spec.Groups.find((g) => g.Key === 'orders')).toBeUndefined();

        ApplyUserChromeMembership(spec, { firstClassSectionKeys: ['orders'] }, [
            { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
        ]);
        expect(spec.MoreSectionKeys).not.toContain('orders');
        expect(spec.Groups.find((g) => g.Key === 'orders')?.Title).toBe('Orders');
    });

    it('refuses to pull System Metadata out of More', () => {
        const spec = BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'systemMetadata', SectionName: 'System Metadata', Variant: 'default' },
            ],
            new Map(),
            { Layout: 'accordion' },
        );
        ApplyUserChromeMembership(spec, { firstClassSectionKeys: ['systemMetadata'] }, [
            { SectionKey: 'systemMetadata', SectionName: 'System Metadata', Variant: 'default' },
        ]);
        expect(spec.MoreSectionKeys).toContain('systemMetadata');
    });
});

describe('OrderMoreSectionKeys', () => {
    it('orders More children from the persisted section order', () => {
        expect(OrderMoreSectionKeys(['b', 'a', 'c'], ['a', 'c', 'b'])).toEqual(['a', 'c', 'b']);
    });
});

describe('ResolveFormChrome inclusion None', () => {
    it('hides a relationship with inclusion None', () => {
        const relatedId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const entity = new EntityInfo({
            ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [{
                ID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                RelatedEntity: 'MJ_BizApps_Tasks: Task Comments',
                RelatedEntityID: relatedId,
                RelatedEntityJoinField: 'PersonID',
                DisplayInForm: true,
                DisplayName: 'Task Comments',
                Configuration: JSON.stringify({ UI: { inclusion: 'None' } }),
            }],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [{
                SectionKey: 'mJBizAppsTasksTaskComments',
                SectionName: 'Task Comments',
                Variant: 'related-entity',
            }],
            RelatedSchemaByEntityId: new Map([[relatedId, 'MJ_BizApps_Tasks']]),
        });
        expect(result.Spec.Groups.some((g) => g.SectionKeys.includes('mJBizAppsTasksTaskComments'))).toBe(false);
        expect(result.Spec.MoreSectionKeys).not.toContain('mJBizAppsTasksTaskComments');
        expect(result.RelatedRoles.Assignments[0]?.Inclusion).toBe('None');
    });

    it('applies an install overlay None after the ranker', () => {
        const relatedId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
        const parentId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
        const entity = new EntityInfo({
            ID: parentId,
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [{
                ID: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
                RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
                RelatedEntityID: relatedId,
                RelatedEntityJoinField: 'BillToPersonID',
                DisplayInForm: true,
                DisplayName: 'Orders',
                Configuration: JSON.stringify({ UI: { inclusion: 'Primary' } }),
            }],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [{
                SectionKey: 'mJBizAppsOrdersOrderHeaders',
                SectionName: 'Orders',
                Variant: 'related-entity',
            }],
            RelatedSchemaByEntityId: new Map([[relatedId, 'MJ_BizApps_Orders']]),
            ChromeRules: [{
                EntityID: parentId,
                TargetKind: 'Relationship',
                RelatedEntityID: relatedId,
                Inclusion: 'None',
            }],
        });
        expect(result.Spec.Groups.some((g) => g.SectionKeys.includes('mJBizAppsOrdersOrderHeaders'))).toBe(false);
        expect(result.RelatedRoles.Assignments[0]?.Reason).toBe('install-none');
    });

    it('suppresses a contribution by key', () => {
        const entity = new EntityInfo({
            ID: '11111111-1111-1111-1111-111111111111',
            Name: 'MJ_BizApps_Common: People',
            SchemaName: 'MJ_BizApps_Common',
            RelatedEntities: [],
        });
        const result = ResolveFormChrome({
            Entity: entity,
            Panels: [{
                SectionKey: 'addresses',
                SectionName: 'Addresses',
                Variant: 'default',
            }],
            RelatedSchemaByEntityId: new Map(),
            ContributionSectionKeys: ['addresses'],
            ChromeRules: [{
                EntityID: '11111111-1111-1111-1111-111111111111',
                TargetKind: 'Contribution',
                ContributionKey: 'addresses',
                Inclusion: 'None',
            }],
        });
        expect(result.Spec.Groups.some((g) => g.SectionKeys.includes('addresses'))).toBe(false);
    });
});

describe('TakeDecoratedChrome', () => {
    it('keeps cosmetic title changes', () => {
        const base = BuildDefaultChromeSpec(
            [{ SectionKey: 'details', SectionName: 'Details', Variant: 'default' }],
            new Map(),
            null,
        );
        const decorated: FormChromeSpec = {
            ...base,
            Groups: base.Groups.map((g) => ({ ...g, Title: g.Key === DETAILS_SECTION_KEY ? 'Profile' : g.Title })),
        };
        const taken = TakeDecoratedChrome(base, decorated);
        expect(taken.Groups.find((g) => g.Key === DETAILS_SECTION_KEY)?.Title).toBe('Profile');
    });

    it('rejects a decorate that removes a section', () => {
        const base = BuildDefaultChromeSpec(
            [
                { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
                { SectionKey: 'orders', SectionName: 'Orders', Variant: 'related-entity' },
            ],
            new Map<string, FormRole>([['orders', 'Primary']]),
            null,
        );
        const decorated: FormChromeSpec = {
            ...base,
            Groups: base.Groups.filter((g) => g.Key !== 'orders'),
        };
        expect(TakeDecoratedChrome(base, decorated)).toBe(base);
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
