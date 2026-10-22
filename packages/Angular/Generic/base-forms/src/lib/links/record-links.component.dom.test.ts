import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, CompositeKey, EntityFieldTSType, EntityInfo, IMetadataProvider, KeyValuePair, Metadata, RecordDependency, RunView } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjRecordLinksComponent } from './record-links.component';
import { MjRecordLinksDrawerComponent } from './record-links-drawer.component';
import { MjRecordLinkDirective } from './record-link.directive';
import { MjRecordPreviewPopoverComponent } from '../preview-popover/record-preview-popover.component';
import { FormNavigationEvent } from '../types/navigation-events';

const CONTACT_PK = new CompositeKey([new KeyValuePair('ID', 'contact-1')]);

const MOCK_ENTITIES = [
    {
        Name: 'Orders',
        DisplayNameOrName: 'Orders',
        Icon: 'fa-solid fa-receipt',
        CanRead: true,
        NameField: { Name: 'OrderNumber' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', DisplayNameOrName: 'ID' },
            { Name: 'OrderNumber', DisplayNameOrName: 'Order Number' },
            { Name: 'CustomerID', DisplayNameOrName: 'Customer' },
            { Name: 'Status', DisplayNameOrName: 'Status' },
            { Name: '__mj_UpdatedAt', DisplayNameOrName: 'Updated At' }
        ]
    },
    {
        Name: 'Tasks',
        DisplayNameOrName: 'Workspace Tasks',
        Icon: 'fa-solid fa-list-check',
        CanRead: true,
        NameField: { Name: 'Title' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', DisplayNameOrName: 'ID' },
            { Name: 'Title', DisplayNameOrName: 'Title' },
            { Name: 'RecordID', DisplayNameOrName: 'Record ID' },
            { Name: 'Status', DisplayNameOrName: 'Status' },
            { Name: '__mj_UpdatedAt', DisplayNameOrName: 'Updated At' }
        ]
    },
    {
        Name: 'RestrictedEntity',
        DisplayNameOrName: 'Restricted Entity',
        Icon: 'fa-solid fa-lock',
        CanRead: false,
        Fields: []
    }
] as unknown as EntityInfo[];

const MOCK_RECORD = {
    IsSaved: true,
    PrimaryKey: CONTACT_PK,
    EntityInfo: {
        Name: 'Contacts',
        DisplayNameOrName: 'Contacts'
    }
} as unknown as BaseEntity;

const MOCK_DEPENDENCIES: RecordDependency[] = [
    {
        EntityName: 'Contacts',
        RelatedEntityName: 'Orders',
        FieldName: 'CustomerID',
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'order-101')]),
        IsSoftLink: false
    },
    {
        EntityName: 'Contacts',
        RelatedEntityName: 'Orders',
        FieldName: 'CustomerID',
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'order-102')]),
        IsSoftLink: false
    },
    {
        EntityName: 'Contacts',
        RelatedEntityName: 'Tasks',
        FieldName: 'RecordID',
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'task-501')]),
        IsSoftLink: true,
        EntityIDFieldName: 'EntityID'
    },
    // System telemetry entity — must be filtered out client-side
    {
        EntityName: 'Contacts',
        RelatedEntityName: 'MJ: Record Changes',
        FieldName: 'RecordID',
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'rc-1')]),
        IsSoftLink: true
    },
    // Unreadable entity — must be filtered out via entityInfo.CanRead === false
    {
        EntityName: 'Contacts',
        RelatedEntityName: 'RestrictedEntity',
        FieldName: 'ContactID',
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'sec-1')]),
        IsSoftLink: false
    }
];

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('MjRecordLinksComponent', () => {
    afterEach(() => {
        MjRecordPreviewPopoverComponent.ClearCache();
        vi.restoreAllMocks();
    });

    function setupMocks() {
        const mockProvider = {
            Entities: MOCK_ENTITIES,
            GetRecordDependencies: vi.fn().mockResolvedValue(MOCK_DEPENDENCIES)
        } as unknown as IMetadataProvider;
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(mockProvider);
        vi.spyOn(Metadata.prototype, 'GetRecordDependencies').mockResolvedValue(MOCK_DEPENDENCIES);
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(MOCK_ENTITIES);
        vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([
            {
                Success: true,
                Results: [
                    { ID: 'order-101', OrderNumber: 'ORD-1001', Status: 'Shipped', __mj_UpdatedAt: '2026-04-10T12:00:00Z' },
                    { ID: 'order-102', OrderNumber: 'ORD-1002', Status: 'Processing', __mj_UpdatedAt: '2026-04-12T12:00:00Z' }
                ],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 5,
                ErrorMessage: ''
            },
            {
                Success: true,
                Results: [
                    { ID: 'task-501', Title: 'Follow up on renewal', Status: 'Open', __mj_UpdatedAt: '2026-04-15T12:00:00Z' }
                ],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 4,
                ErrorMessage: ''
            }
        ]);
    }

    it('loads dependencies, filters out telemetry & unreadable entities, and groups linked records by entity', async () => {
        setupMocks();
        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinksDrawerComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: MOCK_RECORD, Mode: 'inline' }
        });

        await flushPromises();
        fixture.detectChanges();

        const comp = fixture.componentInstance;
        expect(comp.TotalLinkCount).toBe(3);
        expect(comp.CrossAppLinkCount).toBe(1);
        expect(comp.DirectRelationshipCount).toBe(2);

        const groups = comp.FilteredGroups;
        expect(groups).toHaveLength(2);
        expect(groups[0].EntityDisplayName).toBe('Orders');
        expect(groups[0].Items.map(i => i.DisplayName)).toEqual(['ORD-1001', 'ORD-1002']);
        expect(groups[1].EntityDisplayName).toBe('Workspace Tasks');
        expect(groups[1].Items[0].DisplayName).toBe('Follow up on renewal');
        expect(groups[1].Items[0].RelationshipLabel).toBe('Linked Record');

        // Verify zero programmer speak in rendered text
        const renderedText = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(renderedText).not.toContain('Polymorphic');
        expect(renderedText).not.toContain('EntityIDFieldName');
        expect(renderedText).toContain('Cross-App Link');
        expect(renderedText).toContain('Direct Relationship');
    });

    it('filters by Link Type (both, soft Cross-App Links, hard Direct Relationships)', async () => {
        setupMocks();
        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: MOCK_RECORD, Mode: 'inline' }
        });

        await flushPromises();
        fixture.detectChanges();

        const comp = fixture.componentInstance;
        comp.ToggleFilterPanel();
        fixture.detectChanges();
        expect(query(fixture, '.mj-links-filter-panel')).not.toBeNull();

        comp.SetLinkFilter('soft');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(1);
        expect(comp.FilteredGroups[0].EntityName).toBe('Tasks');

        comp.SetLinkFilter('hard');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(2);
        expect(comp.FilteredGroups[0].EntityName).toBe('Orders');

        comp.SetLinkFilter('both');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(3);
    });

    it('filters by category chips and search query', async () => {
        setupMocks();
        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: MOCK_RECORD, Mode: 'inline' }
        });

        await flushPromises();
        fixture.detectChanges();

        const comp = fixture.componentInstance;
        expect(comp.CategoryChips.map(c => `${c.Label} (${c.Count})`)).toEqual([
            'All (3)',
            'Orders (2)',
            'Workspace Tasks (1)'
        ]);

        // Filter by category chip
        comp.SelectCategoryChip('Tasks');
        fixture.detectChanges();
        expect(comp.FilteredGroups).toHaveLength(1);
        expect(comp.FilteredGroups[0].EntityName).toBe('Tasks');

        // Reset category chip and filter by search text
        comp.SelectCategoryChip(null);
        comp.OnSearchChange('ORD-1002');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(1);
        expect(comp.FilteredGroups[0].Items[0].DisplayName).toBe('ORD-1002');
    });

    it('emits Navigate event with target entity and primary key when a card is clicked', async () => {
        setupMocks();
        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: MOCK_RECORD, Mode: 'inline' }
        });

        await flushPromises();
        fixture.detectChanges();

        const navEvents = capture<FormNavigationEvent>(fixture.componentInstance.Navigate);
        const cards = queryAll(fixture, '.mj-links-card');
        expect(cards).toHaveLength(3);

        (cards[2] as HTMLButtonElement).click();
        expect(navEvents).toHaveLength(1);
        expect(navEvents[0]).toEqual({
            Kind: 'record',
            EntityName: 'Tasks',
            PrimaryKey: MOCK_DEPENDENCIES[2].PrimaryKey
        });
    });

    it('discovers outgoing FK links ("On This Record"), filters by direction, and prewarms link counts', async () => {
        setupMocks();
        const recordWithOutgoingFK = {
            IsSaved: true,
            PrimaryKey: CONTACT_PK,
            Get: (fieldName: string) => (fieldName === 'PrimaryOrderID' ? 'order-101' : null),
            EntityInfo: {
                Name: 'Contacts',
                DisplayNameOrName: 'Contacts',
                Fields: [
                    {
                        Name: 'PrimaryOrderID',
                        DisplayNameOrName: 'Primary Order',
                        IsPrimaryKey: false,
                        RelatedEntity: 'Orders',
                        RelatedEntityFieldName: 'ID',
                        EntityIDFieldName: ''
                    }
                ]
            }
        } as unknown as BaseEntity;

        const prewarmed = await MjRecordLinksComponent.PrewarmRecordLinkCount(recordWithOutgoingFK, Metadata.Provider);
        expect(prewarmed.OutgoingCount).toBe(1);
        expect(prewarmed.IncomingCount).toBe(3);
        expect(prewarmed.TotalCount).toBe(4);

        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: recordWithOutgoingFK, Mode: 'inline' }
        });

        await flushPromises();
        fixture.detectChanges();

        const comp = fixture.componentInstance;
        expect(comp.OutgoingLinkCount).toBe(1);
        expect(comp.IncomingLinkCount).toBe(3);
        expect(comp.TotalLinkCount).toBe(4);

        comp.SetDirectionFilter('outgoing');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(1);
        expect(comp.FilteredGroups[0].Items[0].Direction).toBe('outgoing');

        comp.SetDirectionFilter('incoming');
        fixture.detectChanges();
        expect(comp.FilteredLinkCount).toBe(3);
        expect(comp.FilteredGroups.every(g => g.Items.every(i => i.Direction === 'incoming'))).toBe(true);
    });

    it('supports quick-unlinking an outgoing nullable FK link and emits RecordLinkModified', async () => {
        setupMocks();
        const setCalls: Array<{ field: string; value: unknown }> = [];
        let saveCalled = false;
        const recordWithNullableOutgoingFK = {
            IsSaved: true,
            PrimaryKey: CONTACT_PK,
            Get: (fieldName: string) => (fieldName === 'PrimaryOrderID' ? 'order-101' : null),
            Set: (fieldName: string, value: unknown) => {
                setCalls.push({ field: fieldName, value });
            },
            Save: async () => {
                saveCalled = true;
                return true;
            },
            EntityInfo: {
                Name: 'Contacts',
                DisplayNameOrName: 'Contacts',
                AllowUpdateAPI: true,
                Fields: [
                    {
                        Name: 'PrimaryOrderID',
                        DisplayNameOrName: 'Primary Order',
                        IsPrimaryKey: false,
                        AllowsNull: true,
                        AllowUpdateAPI: true,
                        RelatedEntity: 'Orders',
                        RelatedEntityFieldName: 'ID',
                        EntityIDFieldName: ''
                    }
                ]
            }
        } as unknown as BaseEntity;

        const fixture = renderComponentFixture(MjRecordLinksComponent, {
            declarations: [MjRecordLinksComponent, MjRecordLinkDirective, MjRecordPreviewPopoverComponent],
            inputs: { Record: recordWithNullableOutgoingFK, Mode: 'inline', AllowQuickUnlink: true }
        });

        await flushPromises();
        fixture.detectChanges();

        const comp = fixture.componentInstance;
        const modifiedEvents = capture(comp.RecordLinkModified);
        const outgoingGroup = comp.FilteredGroups.find(g => g.EntityName === 'Orders' && g.Items.some(i => i.Direction === 'outgoing'));
        expect(outgoingGroup).toBeDefined();
        const outgoingItem = outgoingGroup!.Items.find(i => i.Direction === 'outgoing')!;
        expect(outgoingItem.CanUnlink).toBe(true);

        const fakeMouseEvent = new MouseEvent('click');
        await comp.OnUnlinkItem(outgoingItem, fakeMouseEvent);
        fixture.detectChanges();

        expect(setCalls).toEqual([{ field: 'PrimaryOrderID', value: null }]);
        expect(saveCalled).toBe(true);
        expect(comp.OutgoingLinkCount).toBe(0);
        expect(modifiedEvents).toHaveLength(1);
        expect(modifiedEvents[0].Action).toBe('unlinked');
    });

    it('supports inline quick-editing scalar fields inside MjRecordPreviewPopoverComponent and emits RecordUpdated', async () => {
        const editableOrderEntityInfo = {
            Name: 'Orders',
            DisplayNameOrName: 'Orders',
            Icon: 'fa-solid fa-receipt',
            CanRead: true,
            AllowUpdateAPI: true,
            NameField: { Name: 'OrderNumber' },
            FirstPrimaryKey: { Name: 'ID' },
            PrimaryKeys: [{ Name: 'ID' }],
            Fields: [
                { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, ReadOnly: true, AllowUpdateAPI: false, TSType: EntityFieldTSType.String, MaxLength: 36 },
                { Name: 'OrderNumber', DisplayNameOrName: 'Order Number', IsPrimaryKey: false, ReadOnly: false, AllowUpdateAPI: true, TSType: EntityFieldTSType.String, MaxLength: 100 },
                { Name: 'Status', DisplayNameOrName: 'Status', IsPrimaryKey: false, ReadOnly: false, AllowUpdateAPI: true, TSType: EntityFieldTSType.String, MaxLength: 50, ValueListType: 'List', EntityFieldValues: [{ Value: 'Active' }, { Value: 'Shipped' }] }
            ]
        } as unknown as EntityInfo;

        const savedSetCalls: Array<{ field: string; value: unknown }> = [];
        const fakeOrderEntity = {
            InnerLoad: vi.fn().mockResolvedValue(true),
            Get: (fieldName: string) => (fieldName === 'Status' ? 'Active' : 'ORD-1001'),
            Set: (fieldName: string, value: unknown) => {
                savedSetCalls.push({ field: fieldName, value });
            },
            Save: vi.fn().mockResolvedValue(true),
            LatestResult: null
        } as unknown as BaseEntity;

        const mockProvider = {
            Entities: [editableOrderEntityInfo],
            EntityByName: (name: string) => (name === 'Orders' ? editableOrderEntityInfo : undefined),
            GetEntityObject: vi.fn().mockResolvedValue(fakeOrderEntity),
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'order-101', OrderNumber: 'ORD-1001', Status: 'Active' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            })
        } as unknown as IMetadataProvider;

        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(mockProvider);
        vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue([editableOrderEntityInfo]);
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [{ ID: 'order-101', OrderNumber: 'ORD-1001', Status: 'Active' }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: ''
        });

        const fixture = renderComponentFixture(MjRecordPreviewPopoverComponent, {
            declarations: [MjRecordPreviewPopoverComponent],
            inputs: {
                EntityName: 'Orders',
                RecordID: 'order-101',
                Provider: mockProvider,
                AllowQuickEdit: true
            }
        });

        const pop = fixture.componentInstance;
        const updatedEvents = capture(pop.RecordUpdated);

        // Open card directly via internal summary load
        await (pop as unknown as { loadSummary: () => Promise<void> }).loadSummary();
        fixture.detectChanges();

        expect(pop.Summary).not.toBeNull();
        expect(pop.Summary!.CanEditRecord).toBe(true);

        pop.OnStartEdit(new MouseEvent('click'));
        expect(pop.IsEditing).toBe(true);
        expect(pop.EditDrafts['Status']).toBe('Active');

        pop.OnEditDraftInput('Status', 'Shipped');
        await pop.OnSaveEdit(new MouseEvent('click'));
        fixture.detectChanges();

        expect(savedSetCalls).toEqual([{ field: 'Status', value: 'Shipped' }]);
        expect(pop.IsEditing).toBe(false);
        expect(updatedEvents).toHaveLength(1);
        expect(updatedEvents[0].EntityName).toBe('Orders');
        expect(updatedEvents[0].UpdatedFields).toEqual({ Status: 'Shipped' });
    });
});
