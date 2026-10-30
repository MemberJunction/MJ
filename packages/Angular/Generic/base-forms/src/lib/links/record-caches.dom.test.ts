import { ChangeDetectorRef, EventEmitter } from '@angular/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    EntityFieldTSType,
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    KeyValuePair,
    RecordDependency,
    RunView,
    RunViewResult
} from '@memberjunction/core';
import { MjRecordLinksComponent } from './record-links.component';
import {
    BeforeRecordPreviewSaveEventArgs,
    MjRecordPreviewPopoverComponent,
    RecordPreviewUpdatedEvent
} from '../preview-popover/record-preview-popover.component';

function buildContactEntity(entityName = 'Contacts'): EntityInfo {
    return {
        Name: entityName,
        DisplayNameOrName: 'Contacts',
        Icon: 'fa-solid fa-user',
        CanRead: true,
        AllowUpdateAPI: true,
        UserPermissions: { CanUpdate: true },
        NameField: {
            Name: 'FullName',
            DisplayNameOrName: 'Full Name',
            IsPrimaryKey: false,
            ReadOnly: false,
            IsVirtual: false,
            AllowUpdateAPI: true,
            TSType: EntityFieldTSType.String
        },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true }],
        Fields: [
            { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, MaxLength: 36, TSType: EntityFieldTSType.String },
            {
                Name: 'FullName',
                DisplayNameOrName: 'Full Name',
                IsPrimaryKey: false,
                ReadOnly: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                DefaultInView: true,
                MaxLength: 100,
                TSType: EntityFieldTSType.String
            },
            {
                Name: 'Email',
                DisplayNameOrName: 'Email',
                IsPrimaryKey: false,
                ReadOnly: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                DefaultInView: true,
                MaxLength: 200,
                TSType: EntityFieldTSType.String
            }
        ]
    } as unknown as EntityInfo;
}

function buildOrderEntity(): EntityInfo {
    return {
        Name: 'Orders',
        DisplayNameOrName: 'Orders',
        Icon: 'fa-solid fa-receipt',
        CanRead: true,
        IncludeInAPI: true,
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID', DisplayNameOrName: 'ID' }]
    } as unknown as EntityInfo;
}

function buildSavedRecord(entityName: string, pkVal: string): BaseEntity {
    return {
        IsSaved: true,
        PrimaryKey: new CompositeKey([new KeyValuePair('ID', pkVal)]),
        EntityInfo: {
            Name: entityName,
            Fields: []
        },
        Get: () => null
    } as unknown as BaseEntity;
}

interface PreviewPopoverHarness {
    Provider: IMetadataProvider | null;
    cdr: Pick<ChangeDetectorRef, 'markForCheck'>;
    _destroyed: boolean;
    _visible: boolean;
    _entityName: string | null;
    _recordID: string | null;
    _primaryKey: CompositeKey | null;
    _displayName: string | null;
    _loadSeq: number;
    AllowQuickEdit: boolean;
    IsLoading: boolean;
    IsEditing: boolean;
    IsSavingEdit: boolean;
    EditErrorMessage: string | null;
    EditDrafts: Record<string, string | undefined>;
    BeforeQuickEditSave: EventEmitter<BeforeRecordPreviewSaveEventArgs>;
    AfterQuickEditSaved: EventEmitter<RecordPreviewUpdatedEvent>;
    RecordUpdated: EventEmitter<RecordPreviewUpdatedEvent>;
    loadSummary: (forceRefresh?: boolean) => Promise<void>;
}

function createPreviewPopoverInstance(provider: IMetadataProvider): {
    popover: MjRecordPreviewPopoverComponent;
    harness: PreviewPopoverHarness;
} {
    const popover = Object.create(MjRecordPreviewPopoverComponent.prototype) as MjRecordPreviewPopoverComponent;
    const harness = popover as unknown as PreviewPopoverHarness;
    harness.Provider = provider;
    harness.cdr = { markForCheck: vi.fn() };
    harness._destroyed = false;
    harness._visible = true;
    harness._entityName = null;
    harness._recordID = null;
    harness._primaryKey = null;
    harness._displayName = null;
    harness._loadSeq = 0;
    harness.AllowQuickEdit = true;
    harness.IsLoading = false;
    harness.IsEditing = false;
    harness.IsSavingEdit = false;
    harness.EditErrorMessage = null;
    harness.EditDrafts = {};
    harness.BeforeQuickEditSave = new EventEmitter<BeforeRecordPreviewSaveEventArgs>();
    harness.AfterQuickEditSaved = new EventEmitter<RecordPreviewUpdatedEvent>();
    harness.RecordUpdated = new EventEmitter<RecordPreviewUpdatedEvent>();
    return { popover, harness };
}

describe('MjRecordLinksComponent & MjRecordPreviewPopoverComponent bounded caches', () => {
    afterEach(() => {
        MjRecordLinksComponent.ClearDependencyCache();
        MjRecordPreviewPopoverComponent.ClearCache();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('MjRecordLinksComponent dependency cache', () => {
        it('deduplicates case-variant entity/PK lookups and isolates distinct IMetadataProvider instances', async () => {
            const depsA: RecordDependency[] = [
                {
                    EntityName: 'Contacts',
                    RelatedEntityName: 'Orders',
                    FieldName: 'CustomerID',
                    PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'ord-a')])
                }
            ];
            const depsB: RecordDependency[] = [
                {
                    EntityName: 'Contacts',
                    RelatedEntityName: 'Orders',
                    FieldName: 'CustomerID',
                    PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'ord-b-1')]),
                },
                {
                    EntityName: 'Contacts',
                    RelatedEntityName: 'Orders',
                    FieldName: 'CustomerID',
                    PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'ord-b-2')]),
                }
            ];

            const getDepsA = vi.fn().mockResolvedValue(depsA);
            const getDepsB = vi.fn().mockResolvedValue(depsB);
            const providerA = {
                Entities: [buildContactEntity(), buildOrderEntity()],
                GetRecordDependencies: getDepsA
            } as unknown as IMetadataProvider;
            const providerB = {
                Entities: [buildContactEntity(), buildOrderEntity()],
                GetRecordDependencies: getDepsB
            } as unknown as IMetadataProvider;

            const summaryA1 = await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('Contacts', 'ABC-123'),
                providerA
            );
            // Case-variant entity and PK on the SAME provider hits the cache without a network call.
            const summaryA2 = await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('contacts', 'abc-123'),
                providerA
            );
            expect(summaryA1.IncomingCount).toBe(1);
            expect(summaryA2.IncomingCount).toBe(1);
            expect(getDepsA).toHaveBeenCalledTimes(1);

            // Distinct provider with identical entity + PK does NOT read providerA's cached entry.
            const summaryB = await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('Contacts', 'ABC-123'),
                providerB
            );
            expect(summaryB.IncomingCount).toBe(2);
            expect(getDepsB).toHaveBeenCalledTimes(1);
        });

        it('caps cached dependency entries at 200 (LRU) and expires entries after 30s TTL', async () => {
            vi.useFakeTimers();
            const getDeps = vi.fn().mockResolvedValue([]);
            const provider = {
                Entities: [buildContactEntity(), buildOrderEntity()],
                GetRecordDependencies: getDeps
            } as unknown as IMetadataProvider;

            // Populate 205 distinct records — cap is 200, so rec-0..rec-4 are evicted.
            for (let i = 0; i < 205; i++) {
                await MjRecordLinksComponent.PrewarmRecordLinkCount(
                    buildSavedRecord('Contacts', `rec-${i}`),
                    provider
                );
            }
            expect(getDeps).toHaveBeenCalledTimes(205);

            // rec-204 (most recent) is still cached:
            await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('Contacts', 'rec-204'),
                provider
            );
            expect(getDeps).toHaveBeenCalledTimes(205);

            // rec-0 (oldest, evicted) triggers a fresh fetch:
            await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('Contacts', 'rec-0'),
                provider
            );
            expect(getDeps).toHaveBeenCalledTimes(206);

            // Advance past the 30,000 ms TTL — rec-204 now expires and refetches:
            vi.advanceTimersByTime(30_001);
            await MjRecordLinksComponent.PrewarmRecordLinkCount(
                buildSavedRecord('Contacts', 'rec-204'),
                provider
            );
            expect(getDeps).toHaveBeenCalledTimes(207);
        });
    });

    describe('MjRecordPreviewPopoverComponent summary cache', () => {
        function createMockPreviewProvider(titlePrefix: string): {
            provider: IMetadataProvider;
            runViewSpy: ReturnType<typeof vi.fn>;
        } {
            const contactEntity = buildContactEntity();
            const runViewSpy = vi.fn().mockImplementation(async (params: { ExtraFilter?: string }): Promise<RunViewResult<Record<string, unknown>>> => ({
                Success: true,
                Results: [
                    {
                        ID: params.ExtraFilter ?? 'id',
                        FullName: `${titlePrefix} (${params.ExtraFilter ?? ''})`,
                        Email: 'ada@example.com'
                    }
                ],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 1,
                ErrorMessage: ''
            }));
            const provider = {
                Entities: [contactEntity],
                EntityByName: (name: string) =>
                    name.trim().toLowerCase() === 'contacts' ? contactEntity : undefined,
                RunView: runViewSpy
            } as unknown as IMetadataProvider & IRunViewProvider;
            return { provider, runViewSpy };
        }

        it('isolates summary cache entries across providers, deduplicates case variants, and invalidates on OnSaveEdit', async () => {
            const { provider: providerA, runViewSpy: spyA } = createMockPreviewProvider('TenantA');
            const { provider: providerB, runViewSpy: spyB } = createMockPreviewProvider('TenantB');
            vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => ({
                RunView: (p as unknown as { RunView: typeof spyA }).RunView
            } as unknown as RunView));

            const instA1 = createPreviewPopoverInstance(providerA);
            instA1.harness._entityName = 'Contacts';
            instA1.harness._recordID = 'REC-99';
            await instA1.harness.loadSummary();
            expect(instA1.popover.Summary?.Title).toContain('TenantA');
            expect(spyA).toHaveBeenCalledTimes(1);

            // Case-variant entity + record ID on providerA hits cache:
            const instA2 = createPreviewPopoverInstance(providerA);
            instA2.harness._entityName = 'contacts';
            instA2.harness._recordID = 'rec-99';
            await instA2.harness.loadSummary();
            expect(instA2.popover.Summary?.Title).toContain('TenantA');
            expect(spyA).toHaveBeenCalledTimes(1);

            // Distinct providerB does NOT see TenantA's cached summary:
            const instB = createPreviewPopoverInstance(providerB);
            instB.harness._entityName = 'Contacts';
            instB.harness._recordID = 'REC-99';
            await instB.harness.loadSummary();
            expect(instB.popover.Summary?.Title).toContain('TenantB');
            expect(spyB).toHaveBeenCalledTimes(1);

            // OnSaveEdit invalidates providerA's entry and reloads fresh summary without touching providerB:
            (providerA as unknown as { CurrentUser: unknown; GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject =
                vi.fn().mockResolvedValue({
                    InnerLoad: vi.fn().mockResolvedValue(true),
                    Get: vi.fn().mockReturnValue('Old'),
                    Set: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true)
                });
            instA1.harness.IsEditing = true;
            instA1.harness.EditDrafts = { Email: 'updated@example.com' };
            await instA1.popover.OnSaveEdit();
            expect(spyA).toHaveBeenCalledTimes(2);
            expect(spyB).toHaveBeenCalledTimes(1);
        });

        it('caps cached summaries at 500 (LRU) and expires entries after 60s TTL', async () => {
            vi.useFakeTimers();
            const { provider, runViewSpy } = createMockPreviewProvider('Preview');
            vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation(() => ({
                RunView: runViewSpy
            } as unknown as RunView));

            const { harness } = createPreviewPopoverInstance(provider);
            harness._entityName = 'Contacts';

            for (let i = 0; i < 505; i++) {
                harness._recordID = `item-${i}`;
                await harness.loadSummary();
            }
            expect(runViewSpy).toHaveBeenCalledTimes(505);

            // item-504 (most recent) is still cached:
            harness._recordID = 'item-504';
            await harness.loadSummary();
            expect(runViewSpy).toHaveBeenCalledTimes(505);

            // item-0 (oldest, evicted beyond 500) refetches:
            harness._recordID = 'item-0';
            await harness.loadSummary();
            expect(runViewSpy).toHaveBeenCalledTimes(506);

            // Advance past 60,000 ms TTL — item-504 expires and refetches:
            vi.advanceTimersByTime(60_001);
            harness._recordID = 'item-504';
            await harness.loadSummary();
            expect(runViewSpy).toHaveBeenCalledTimes(507);
        });
    });
});
