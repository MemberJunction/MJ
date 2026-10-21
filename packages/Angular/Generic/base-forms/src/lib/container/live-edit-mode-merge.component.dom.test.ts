import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { BaseEntity, EntityInfo, RunView } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MjRecordFormContainerComponent } from './record-form-container.component';
import { MjFormToolbarComponent } from '../toolbar/form-toolbar.component';
import { FormRecordRefreshCoordinator, type FormRemoteUpdateEvent } from '../form-record-refresh.coordinator';

@Component({ standalone: true, selector: 'mj-form-toolbar', template: '' })
class ToolbarStub {
    @Input() Record: unknown;
    @Input() EditMode = false;
    @Input() UserCanEdit = false;
    @Input() UserCanDelete = false;
    @Input() IsFavorite = false;
    @Input() FavoriteInitDone = false;
    @Input() IsDirty = false;
    @Input() DirtyFieldNames: unknown;
    @Input() ListCount = 0;
    @Input() TagCount = 0;
    @Input() LinksOpen = false;
    @Input() LinkCount = 0;
    @Input() ConflictCount = 0;
    @Input() AttachmentCount = 0;
    @Input() AttachmentsAvailable = false;
    @Input() IsAttachmentsPanelOpen = false;
    @Input() VersionCount = 0;
    @Input() EntityInfo: unknown;
    @Input() Config: unknown;
    @Input() IsSaving = false;
    @Input() IsRefreshing = false;
    @Input() VisibleSectionCount = 0;
    @Input() TotalSectionCount = 0;
    @Input() ExpandedSectionCount = 0;
    @Input() SearchFilter = '';
    @Input() ShowEmptyFields = false;
    @Input() WidthMode = '';
    @Input() HasCustomSectionOrder = false;
    @Input() Variants: unknown;
    @Input() CurrentVariantID: unknown;
    @Input() RegisteredItems: unknown;
    @Input() ItemOverrides: unknown;
    @Input() FormComponent: unknown;
    @Input() ChromeLayout = 'accordion';
}
@Component({ standalone: true, selector: 'mj-section-manager', template: '' })
class SectionManagerStub {
    @Input() Sections: unknown;
    @Input() SectionOrder: unknown;
    @Input() MoreSectionKeys: unknown;
    @Input() LockedMoreKeys: unknown;
    @Input() Visible = false;
}
@Component({ standalone: true, selector: 'mj-panel-manager', template: '' })
class PanelManagerStub {
    @Input() Visible = false;
    @Input() Entity: unknown;
    @Input() Compiled: unknown;
    @Input() StockGrids: unknown;
    @Input() FullCustomForm = false;
    @Input() TitleByKey: unknown;
    @Input() Related: unknown;
    @Input() Provider: unknown;
    @Input() Variants: unknown;
    @Input() CurrentFormID: unknown;
    @Input() RecordKey: unknown;
}
@Component({ standalone: true, selector: 'mj-form-panel-slot', template: '' })
class PanelSlotStub {
    @Input() Entity: unknown;
    @Input() Record: unknown;
    @Input() FormComponent: unknown;
}
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub {
    @Input() Message = '';
}
@Component({ standalone: true, selector: 'mj-isa-related-panel', template: '' })
class IsaPanelStub {
    @Input() Record: unknown;
    @Input() EditMode = false;
    @Input() Collapsed = false;
}
@Component({ standalone: true, selector: 'mj-record-changes', template: '' })
class RecordChangesStub {
    @Input() record: unknown;
    @Input() AllowRestore = false;
}
@Component({ standalone: true, selector: 'mj-record-tags', template: '' })
class RecordTagsStub {
    @Input() Record: unknown;
    @Input() WidthPx = 0;
}
@Component({ standalone: true, selector: 'mj-record-links', template: '' })
class RecordLinksStub {
    @Input() Provider: unknown;
    @Input() Record: unknown;
    @Input() Mode = 'drawer';
    @Input() IsOpen = false;
}
@Component({ standalone: true, selector: 'mj-record-attachments', template: '' })
class RecordAttachmentsStub {
    @Input() Record: unknown;
    @Input() Visible = false;
}
@Component({ standalone: true, selector: 'mj-list-management-dialog', template: '' })
class ListMgmtStub {
    @Input() visible = false;
    @Input() config: unknown;
}
@Component({ standalone: true, selector: 'mj-form-contributions', template: '' })
class FormContributionsStub {
    @Input() Record: unknown;
    @Input() FormComponent: unknown;
    @Input() FormContext: unknown;
    @Input() BakedSectionKeys: unknown;
    @Input() ShowRelatedEntities = true;
}

const CONTAINER_CHILD_STUBS = [
    ToolbarStub,
    SectionManagerStub,
    PanelManagerStub,
    PanelSlotStub,
    EmptyStateStub,
    IsaPanelStub,
    RecordChangesStub,
    RecordTagsStub,
    RecordLinksStub,
    RecordAttachmentsStub,
    ListMgmtStub,
    FormContributionsStub
];

class TestDealEntity extends BaseEntity {}

function makeDealEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000001-0000-0000-0000-000000000077',
        Name: 'Deals',
        Status: 'Active',
        BaseTable: 'Deal',
        BaseView: 'vwDeals',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
            { ID: 'F2', Name: 'DealName', DisplayName: 'Deal Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
            { ID: 'F3', Name: 'Stage', DisplayName: 'Stage', Type: 'nvarchar', Length: 100, AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'F4', Name: 'Amount', DisplayName: 'Amount', Type: 'decimal', AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'F5', Name: '__mj_UpdatedAt', Type: 'datetime', AllowsNull: false, AllowUpdateAPI: false }
        ]
    });
}

function makeDealRecord(): BaseEntity {
    const entity = new TestDealEntity(makeDealEntityInfo());
    entity.SetMany(
        {
            ID: '99999999-2222-3333-4444-555555555555',
            DealName: 'Enterprise Expansion',
            Stage: 'Discovery',
            Amount: 50000,
            __mj_UpdatedAt: '2026-04-01T00:00:00.000Z'
        },
        true,
        true
    );
    return entity;
}

describe('performLiveEditModeMerge & Toolbar Conflict/Links Integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('auto-merges clean fields, converges matching dirty fields, and raises conflicts for diverging dirty fields', async () => {
        const record = makeDealRecord();
        const entityInfo = record.EntityInfo;

        const fixture = renderComponentFixture(MjRecordFormContainerComponent, {
            imports: CONTAINER_CHILD_STUBS,
            declarations: [MjRecordFormContainerComponent],
            inputs: {
                Record: record,
                EntityInfo: entityInfo,
                EditMode: true
            }
        });

        const container = fixture.componentInstance;
        const coordinator = fixture.debugElement.injector.get(FormRecordRefreshCoordinator);
        const remoteUpdates: FormRemoteUpdateEvent[] = [];
        coordinator.RemoteUpdated$.subscribe((evt) => remoteUpdates.push(evt));

        // 1. User leaves DealName clean ('Enterprise Expansion') -> remote changes it to 'Enterprise Global Expansion' (should auto-merge cleanly)
        // 2. User edits Stage to 'Negotiation' -> remote also changes Stage to 'Negotiation' (should converge cleanly, Dirty becomes false, no conflict)
        // 3. User edits Amount to 75000 -> remote changes Amount to 60000 (should raise conflict, keep user value 75000, update OldValue to 60000)
        record.Set('Stage', 'Negotiation');
        record.Set('Amount', 75000);

        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: '99999999-2222-3333-4444-555555555555',
                    DealName: 'Enterprise Global Expansion',
                    Stage: 'Negotiation',
                    Amount: 60000,
                    __mj_UpdatedAt: '2026-04-20T10:30:00.000Z'
                }
            ],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 5,
            ErrorMessage: ''
        });

        await container.performLiveEditModeMerge(record);

        // Verify Clean Field (DealName) auto-merged and stayed clean
        const dealNameField = record.Fields.find(f => f.Name === 'DealName')!;
        expect(dealNameField.Value).toBe('Enterprise Global Expansion');
        expect(dealNameField.OldValue).toBe('Enterprise Global Expansion');
        expect(dealNameField.Dirty).toBe(false);

        // Verify Converged Dirty Field (Stage) reset baseline and cleared Dirty without conflict
        const stageField = record.Fields.find(f => f.Name === 'Stage')!;
        expect(stageField.Value).toBe('Negotiation');
        expect(stageField.OldValue).toBe('Negotiation');
        expect(stageField.Dirty).toBe(false);

        // Verify Diverging Dirty Field (Amount) preserved user edit, updated OldValue baseline, and raised conflict
        const amountField = record.Fields.find(f => f.Name === 'Amount')!;
        expect(amountField.Value).toBe(75000);
        expect(amountField.OldValue).toBe(60000);
        expect(amountField.Dirty).toBe(true);

        // Verify system timestamp updated
        const updatedAtField = record.Fields.find(f => f.Name === '__mj_UpdatedAt')!;
        expect(updatedAtField.Value).toBe('2026-04-20T10:30:00.000Z');
        expect(updatedAtField.Dirty).toBe(false);

        // Verify coordinator event and active conflict state
        expect(remoteUpdates).toHaveLength(1);
        expect(remoteUpdates[0].autoMergedPreviousValues?.get('dealname')).toBe('Enterprise Expansion');
        expect(coordinator.ActiveConflicts.size).toBe(1);
        expect(coordinator.ActiveConflicts.get('amount')).toEqual({
            fieldName: 'Amount',
            previousServerValue: 50000,
            incomingServerValue: 60000,
            localEditedValue: 75000
        });
        expect(container.ConflictCount).toBe(1);
    });

    it('surfaces ConflictCount in <mj-form-toolbar> edit banner and emits LinksRequest when Links is clicked', () => {
        const record = makeDealRecord();
        const coordinator = new FormRecordRefreshCoordinator();

        const fixture = renderComponentFixture(MjFormToolbarComponent, {
            declarations: [MjFormToolbarComponent],
            providers: [{ provide: FormRecordRefreshCoordinator, useValue: coordinator }],
            inputs: {
                Record: record,
                EntityInfo: record.EntityInfo,
                EditMode: true,
                UserCanEdit: true,
                ConflictCount: 2
            }
        });

        const bannerConflict = query(fixture, '.mj-forms-edit-banner-conflicts');
        expect(bannerConflict).not.toBeNull();
        expect(bannerConflict?.textContent).toContain('2 conflicts need review');

        // Switch to read mode and test Links action
        fixture.componentRef.setInput('EditMode', false);
        fixture.componentRef.setInput('LinkCount', 4);
        fixture.componentRef.setInput('LinksOpen', true);
        fixture.detectChanges();

        let linksRequested = false;
        fixture.componentInstance.LinksRequest.subscribe(() => {
            linksRequested = true;
        });

        fixture.componentInstance.OnLinks();
        expect(linksRequested).toBe(true);

        const linksItem = fixture.componentInstance.ResolvedToolbarItems.find(i => i.Key === 'links');
        expect(linksItem).toBeDefined();
        expect(linksItem?.Badge).toBe(4);
        expect(linksItem?.CssClass).toContain('mj-forms-toolbar__btn--active');
    });
});
