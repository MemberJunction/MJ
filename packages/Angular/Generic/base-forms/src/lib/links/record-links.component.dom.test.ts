import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, KeyValuePair, Metadata, RecordDependency, RunView } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjRecordLinksComponent } from './record-links.component';
import { MjRecordLinksDrawerComponent } from './record-links-drawer.component';
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
            declarations: [MjRecordLinksComponent, MjRecordLinksDrawerComponent, MjRecordPreviewPopoverComponent],
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
            declarations: [MjRecordLinksComponent, MjRecordPreviewPopoverComponent],
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
            declarations: [MjRecordLinksComponent, MjRecordPreviewPopoverComponent],
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
            declarations: [MjRecordLinksComponent, MjRecordPreviewPopoverComponent],
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
            declarations: [MjRecordLinksComponent, MjRecordPreviewPopoverComponent],
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
});
