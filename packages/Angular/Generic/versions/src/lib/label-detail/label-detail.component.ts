import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { RunView, Metadata, EntityInfo, CompositeKey, UserInfo, EntityRecordNameInput } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { VersionLabelEntityType, VersionLabelItemEntityType, VersionLabelRestoreEntityType, VersionLabelEntity } from '@memberjunction/core-entities';
import { MicroViewData, FieldChangeView } from '../types';
import { EntityLinkClickEvent } from '../record-micro-view/record-micro-view.component';

// =========================================================================
// Interfaces
// =========================================================================

type DetailTab = 'overview' | 'snapshots' | 'dependencies' | 'changes' | 'history';

interface SnapshotEntityGroup {
    EntityName: string;
    EntityID: string;
    EntityIcon: string;
    Items: SnapshotItemView[];
    IsExpanded: boolean;
    IsLoadingNames: boolean;
    NamesLoaded: boolean;
}

interface SnapshotItemView {
    RecordID: string;
    RecordChangeID: string;
    DisplayName: string;
    FieldPreview: string;
    FullRecordJSON: Record<string, unknown> | null;
}

interface ClientDiffResult {
    Summary: { Changed: number; Unchanged: number; EntitiesAffected: number };
    EntityGroups: ClientDiffEntityGroup[];
}

interface ClientDiffEntityGroup {
    EntityName: string;
    Records: ClientRecordDiff[];
    IsExpanded: boolean;
}

interface ClientRecordDiff {
    RecordID: string;
    ChangeType: 'Modified' | 'Unchanged';
    FieldChanges: FieldChangeView[];
}

interface DependencyEntityView {
    EntityName: string;
    RelationshipField: string;
    Children: DependencyEntityView[];
    Depth: number;
    IsExpanded: boolean;
}

interface RecordChangeRow {
    ID: string;
    EntityID: string;
    RecordID: string;
    FullRecordJSON: string;
    ChangedAt: string;
}

// =========================================================================
// Component
// =========================================================================

@Component({
  standalone: false,
    selector: 'mj-label-detail-panel',
    templateUrl: './label-detail.component.html',
    styleUrls: ['./label-detail.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjLabelDetailComponent implements OnInit, OnDestroy {
    @Input() Label!: VersionLabelEntityType;
    @Input() AllLabels: VersionLabelEntityType[] = [];
    @Input() ItemCountMap = new Map<string, number>();
    @Output() Close = new EventEmitter<void>();
    @Output() LabelUpdated = new EventEmitter<void>();
    @Output() EntityLinkClick = new EventEmitter<EntityLinkClickEvent>();

    // Tab state
    public ActiveTab: DetailTab = 'overview';

    // Animation
    public IsVisible = false;

    // Data
    public LabelItems: VersionLabelItemEntityType[] = [];
    public ChildLabels: VersionLabelEntityType[] = [];
    public IsLoadingItems = true;
    public IsArchiving = false;

    // Overview stats
    public UniqueEntityCount = 0;
    public CreatorName = '';

    /** Record display name resolved via IsNameField (shown on overview when Scope=Record) */
    public OverviewRecordName = '';
    /** Entity icon for the overview tab */
    public OverviewEntityIcon = 'fa-solid fa-table';

    // Snapshot tab
    public SnapshotGroups: SnapshotEntityGroup[] = [];
    public SnapshotViewMode: 'card' | 'list' = 'list';
    public SnapshotSearch = '';
    public SnapshotSortBy: 'name' | 'count' = 'count';
    public SnapshotSortDir: 'asc' | 'desc' = 'desc';
    public FilteredSnapshotGroups: SnapshotEntityGroup[] = [];

    // Changes tab (lazy)
    public DiffResult: ClientDiffResult | null = null;
    public IsLoadingDiff = false;
    private diffLoaded = false;

    // Dependencies tab (lazy)
    public DependencyTree: DependencyEntityView[] = [];
    public IsLoadingDependencies = false;
    private dependenciesLoaded = false;

    // History tab (lazy)
    public Restores: VersionLabelRestoreEntityType[] = [];
    public RelatedLabels: VersionLabelEntityType[] = [];
    public IsLoadingHistory = false;
    private historyLoaded = false;

    // Micro view (inline)
    public MicroViewRecord: MicroViewData | null = null;
    public ShowMicroView = false;
    public BreadcrumbLabel = '';

    // Resize
    public PanelWidthPx = 0;
    private isResizing = false;
    private resizeMinWidth = 400;
    private resizeMaxWidthRatio = 0.92;
    private static readonly PREFS_KEY = 'VersionHistory.DetailPanel.UserPreferences';

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();

    // Bound handlers for resize (need references for removeEventListener)
    private boundOnResizeMove = this.onResizeMove.bind(this);
    private boundOnResizeEnd = this.onResizeEnd.bind(this);

    constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone, private elRef: ElementRef) {}

    // =========================================================================
    // Lifecycle
    // =========================================================================

    ngOnInit(): void {
        this.loadPanelPreferences();
        // Animate in on next microtask
        Promise.resolve().then(() => {
            this.IsVisible = true;
            this.cdr.markForCheck();
        });
        this.computeChildLabels();
        this.loadLabelItems();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        // Clean up any in-progress resize
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        if (this.ShowMicroView) {
            this.OnBackFromMicroView();
        } else {
            this.OnClose();
        }
    }

    // =========================================================================
    // Panel actions
    // =========================================================================

    public OnClose(): void {
        this.IsVisible = false;
        this.cdr.markForCheck();
        // Wait for CSS transition to complete
        setTimeout(() => this.Close.emit(), 300);
    }

    public OnBackdropClick(): void {
        if (!this.ShowMicroView) {
            this.OnClose();
        }
    }

    public OnTabChange(tab: DetailTab): void {
        this.ActiveTab = tab;
        this.loadTabData(tab);
        this.cdr.markForCheck();
    }

    // =========================================================================
    // Label actions
    // =========================================================================

    public async OnArchive(): Promise<void> {
        if (this.IsArchiving || this.Label.Status === 'Archived') return;

        this.IsArchiving = true;
        this.cdr.markForCheck();

        try {
            const md = new Metadata();
            const label = await md.GetEntityObject<VersionLabelEntity>('MJ: Version Labels');
            await label.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.Label.ID }]));
            label.Status = 'Archived';
            const saved = await label.Save();
            if (saved) {
                this.Label.Status = 'Archived';
                this.LabelUpdated.emit();
            }
        } catch (e) {
            console.error('Error archiving label:', e);
        } finally {
            this.ngZone.run(() => {
                this.IsArchiving = false;
                this.cdr.markForCheck();
            });
        }
    }

    // =========================================================================
    // Data loading
    // =========================================================================

    private computeChildLabels(): void {
        this.ChildLabels = this.AllLabels.filter(l => l.ParentID === this.Label.ID);
    }

    private async loadLabelItems(): Promise<void> {
        this.IsLoadingItems = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<VersionLabelItemEntityType>({
                EntityName: 'MJ: Version Label Items',
                ExtraFilter: `VersionLabelID = '${this.Label.ID}'`,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.LabelItems = result.Results;
                this.computeOverviewStats();
                this.buildSnapshotGroups();
            }
        } catch (e) {
            console.error('Error loading label items:', e);
        } finally {
            this.ngZone.run(() => {
                this.IsLoadingItems = false;
                this.cdr.markForCheck();
            });
        }
    }

    private computeOverviewStats(): void {
        const entityIds = new Set(this.LabelItems.map(i => i.EntityID ?? '').filter(Boolean));
        this.UniqueEntityCount = entityIds.size;
        this.CreatorName = this.Label.CreatedByUser ?? '';

        // Resolve entity icon for overview
        if (this.Label.EntityID) {
            this.OverviewEntityIcon = this.resolveEntityIcon(this.Label.EntityID);
        }

        // Resolve record display name for Record-scoped labels
        if (this.Label.Scope === 'Record' && this.Label.RecordID && this.Label.EntityID) {
            this.loadOverviewRecordName();
        }
    }

    /**
     * For Record-scoped labels, load the record's display name via GetEntityRecordNames.
     */
    private async loadOverviewRecordName(): Promise<void> {
        const entityName = this.resolveEntityName(this.Label.EntityID ?? '');
        if (!entityName || entityName === 'Unknown') return;

        const rawId = this.extractRawRecordId(this.Label.RecordID ?? '');
        if (!rawId) return;

        try {
            const input = new EntityRecordNameInput();
            input.EntityName = entityName;
            input.CompositeKey = new CompositeKey([{ FieldName: 'ID', Value: rawId }]);

            const results = await this.metadata.GetEntityRecordNames([input]);
            const recordName = results.length > 0 && results[0].Success ? results[0].RecordName : undefined;
            if (recordName) {
                this.ngZone.run(() => {
                    this.OverviewRecordName = recordName;
                    this.cdr.markForCheck();
                });
            }
        } catch (e) {
            console.error('Error loading overview record name:', e);
        }
    }

    private buildSnapshotGroups(): void {
        const groupMap = new Map<string, { entityId: string; items: SnapshotItemView[] }>();

        for (const item of this.LabelItems) {
            const entityId = item.EntityID ?? '';
            const entityName = this.resolveEntityName(entityId);
            const key = entityName || entityId;

            if (!groupMap.has(key)) {
                groupMap.set(key, { entityId, items: [] });
            }

            const displayName = this.buildInitialDisplayName(item);
            groupMap.get(key)!.items.push({
                RecordID: item.RecordID ?? '',
                RecordChangeID: item.RecordChangeID ?? '',
                DisplayName: displayName,
                FieldPreview: '',
                FullRecordJSON: null
            });
        }

        this.SnapshotGroups = Array.from(groupMap.entries())
            .map(([name, group]) => ({
                EntityName: name,
                EntityID: group.entityId,
                EntityIcon: this.resolveEntityIcon(group.entityId),
                Items: group.items,
                IsExpanded: false,
                IsLoadingNames: false,
                NamesLoaded: false
            }));

        this.applySortAndFilter();
    }

    /**
     * Initial display name before lazy-loading (just the shortened raw ID).
     * Real names are loaded via loadGroupRecordNames() when the group is expanded.
     */
    private buildInitialDisplayName(item: VersionLabelItemEntityType): string {
        const rawId = this.extractRawRecordId(item.RecordID ?? '');
        return rawId.length > 20 ? rawId.substring(0, 20) + '...' : rawId;
    }

    /** Extract the raw ID value from a potentially formatted "ID|<uuid>" string. */
    private extractRawRecordId(recordId: string): string {
        if (!recordId) return '';
        const parts = recordId.split('||');
        if (parts.length === 1) {
            const singleParts = recordId.split('|');
            if (singleParts.length === 2) {
                return singleParts[1];
            }
        }
        return recordId;
    }

    /** Apply current sort + search filter to snapshot groups. */
    private applySortAndFilter(): void {
        const sorted = [...this.SnapshotGroups].sort((a, b) => {
            if (this.SnapshotSortBy === 'name') {
                const cmp = a.EntityName.localeCompare(b.EntityName);
                return this.SnapshotSortDir === 'asc' ? cmp : -cmp;
            }
            // sort by count
            const cmp = a.Items.length - b.Items.length;
            return this.SnapshotSortDir === 'asc' ? cmp : -cmp;
        });

        if (!this.SnapshotSearch) {
            this.FilteredSnapshotGroups = sorted;
            return;
        }

        const search = this.SnapshotSearch.toLowerCase();
        this.FilteredSnapshotGroups = sorted
            .filter(g => g.EntityName.toLowerCase().includes(search) ||
                g.Items.some(i => i.RecordID.toLowerCase().includes(search) || i.DisplayName.toLowerCase().includes(search)))
            .map(g => ({
                ...g,
                Items: g.Items.filter(i =>
                    i.RecordID.toLowerCase().includes(search) ||
                    i.DisplayName.toLowerCase().includes(search) ||
                    g.EntityName.toLowerCase().includes(search)
                )
            }));
    }

    private loadTabData(tab: DetailTab): void {
        switch (tab) {
            case 'changes':
                if (!this.diffLoaded) {
                    this.loadDiffData();
                }
                break;
            case 'dependencies':
                if (!this.dependenciesLoaded) {
                    this.loadDependencyData();
                }
                break;
            case 'history':
                if (!this.historyLoaded) {
                    this.loadHistoryData();
                }
                break;
        }
    }

    // =========================================================================
    // Changes tab
    // =========================================================================

    private async loadDiffData(): Promise<void> {
        this.IsLoadingDiff = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const entityGroups: ClientDiffEntityGroup[] = [];
            let totalChanged = 0;
            let totalUnchanged = 0;

            // Group label items by entity
            const entityItemMap = new Map<string, VersionLabelItemEntityType[]>();
            for (const item of this.LabelItems) {
                const entityId = item.EntityID ?? '';
                if (!entityItemMap.has(entityId)) {
                    entityItemMap.set(entityId, []);
                }
                entityItemMap.get(entityId)!.push(item);
            }

            // For each entity group, load latest RecordChanges and compare
            for (const [entityId, items] of entityItemMap) {
                const entityName = this.resolveEntityName(entityId);
                const records: ClientRecordDiff[] = [];

                for (const item of items) {
                    const latestChange = await this.loadLatestRecordChange(rv, entityId, item.RecordID ?? '');
                    const isModified = latestChange != null && latestChange !== item.RecordChangeID;

                    if (isModified) {
                        totalChanged++;
                        records.push({
                            RecordID: item.RecordID ?? '',
                            ChangeType: 'Modified',
                            FieldChanges: await this.computeFieldChanges(rv, item.RecordChangeID ?? '', latestChange)
                        });
                    } else {
                        totalUnchanged++;
                        records.push({
                            RecordID: item.RecordID ?? '',
                            ChangeType: 'Unchanged',
                            FieldChanges: []
                        });
                    }
                }

                if (records.some(r => r.ChangeType === 'Modified')) {
                    entityGroups.push({
                        EntityName: entityName,
                        Records: records.filter(r => r.ChangeType === 'Modified'),
                        IsExpanded: false
                    });
                }
            }

            this.DiffResult = {
                Summary: {
                    Changed: totalChanged,
                    Unchanged: totalUnchanged,
                    EntitiesAffected: entityGroups.length
                },
                EntityGroups: entityGroups
            };

            this.diffLoaded = true;
        } catch (e) {
            console.error('Error loading diff data:', e);
        } finally {
            this.ngZone.run(() => {
                this.IsLoadingDiff = false;
                this.cdr.markForCheck();
            });
        }
    }

    private async loadLatestRecordChange(rv: RunView, entityId: string, recordId: string): Promise<string | null> {
        if (!entityId || !recordId) return null;

        const result = await rv.RunView<RecordChangeRow>({
            EntityName: 'Record Changes',
            ExtraFilter: `EntityID = '${entityId}' AND RecordID = '${recordId}'`,
            OrderBy: 'ChangedAt DESC',
            MaxRows: 1,
            Fields: ['ID'],
            ResultType: 'simple'
        });

        if (result.Success && result.Results.length > 0) {
            return result.Results[0].ID;
        }
        return null;
    }

    private async computeFieldChanges(rv: RunView, oldChangeId: string, newChangeId: string): Promise<FieldChangeView[]> {
        if (!oldChangeId || !newChangeId) return [];

        try {
            const [oldResult, newResult] = await rv.RunViews([
                {
                    EntityName: 'Record Changes',
                    ExtraFilter: `ID = '${oldChangeId}'`,
                    Fields: ['FullRecordJSON'],
                    ResultType: 'simple'
                },
                {
                    EntityName: 'Record Changes',
                    ExtraFilter: `ID = '${newChangeId}'`,
                    Fields: ['FullRecordJSON'],
                    ResultType: 'simple'
                }
            ]);

            if (!oldResult.Success || !newResult.Success) return [];
            if (oldResult.Results.length === 0 || newResult.Results.length === 0) return [];

            const oldRow = oldResult.Results[0] as RecordChangeRow;
            const newRow = newResult.Results[0] as RecordChangeRow;

            return this.diffRecordJson(oldRow.FullRecordJSON, newRow.FullRecordJSON);
        } catch {
            return [];
        }
    }

    private diffRecordJson(oldJson: string, newJson: string): FieldChangeView[] {
        const changes: FieldChangeView[] = [];

        try {
            const oldData = JSON.parse(oldJson || '{}') as Record<string, unknown>;
            const newData = JSON.parse(newJson || '{}') as Record<string, unknown>;
            const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

            for (const key of allKeys) {
                // Skip MJ system fields
                if (key.startsWith('__mj_')) continue;

                const oldVal = oldData[key];
                const newVal = newData[key];

                if (oldVal === undefined && newVal !== undefined) {
                    changes.push({ FieldName: key, OldValue: '', NewValue: this.formatFieldValue(newVal), ChangeType: 'Added' });
                } else if (oldVal !== undefined && newVal === undefined) {
                    changes.push({ FieldName: key, OldValue: this.formatFieldValue(oldVal), NewValue: '', ChangeType: 'Removed' });
                } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                    changes.push({ FieldName: key, OldValue: this.formatFieldValue(oldVal), NewValue: this.formatFieldValue(newVal), ChangeType: 'Modified' });
                }
            }
        } catch {
            // Invalid JSON - skip
        }

        return changes;
    }

    // =========================================================================
    // Dependencies tab
    // =========================================================================

    private loadDependencyData(): void {
        this.IsLoadingDependencies = true;
        this.cdr.markForCheck();

        try {
            const entityId = this.Label.EntityID;
            if (!entityId) {
                this.DependencyTree = [];
                this.dependenciesLoaded = true;
                return;
            }

            const entityInfo = this.metadata.Entities.find(e => e.ID === entityId);
            if (!entityInfo) {
                this.DependencyTree = [];
                this.dependenciesLoaded = true;
                return;
            }

            // Build set of entity names that are actually in the snapshot
            const snapshotEntityNames = this.buildSnapshotEntityNameSet();

            this.DependencyTree = this.buildDependencyTree(entityInfo, 0, new Set<string>(), snapshotEntityNames);
            this.dependenciesLoaded = true;
        } catch (e) {
            console.error('Error loading dependency data:', e);
        } finally {
            this.IsLoadingDependencies = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Build a set of entity names that have at least one item in the snapshot.
     * Used to filter the dependency tree to only show entities with captured records.
     */
    private buildSnapshotEntityNameSet(): Set<string> {
        const names = new Set<string>();
        for (const item of this.LabelItems) {
            const entityName = this.resolveEntityName(item.EntityID ?? '');
            if (entityName && entityName !== 'Unknown') {
                names.add(entityName);
            }
        }
        return names;
    }

    /**
     * Build the dependency tree, but only include entities that are in the
     * actual snapshot (snapshotEntities). This prevents showing relationship
     * paths that weren't captured (e.g., Conversation Details when there are
     * no conversation records in the snapshot).
     */
    private buildDependencyTree(
        entity: EntityInfo,
        depth: number,
        visited: Set<string>,
        snapshotEntities: Set<string>
    ): DependencyEntityView[] {
        if (depth > 3 || visited.has(entity.Name)) return [];
        visited.add(entity.Name);

        const deps: DependencyEntityView[] = [];

        // Get One-To-Many relationships (entities that depend on this one)
        const dependents = entity.RelatedEntities.filter(r =>
            r.Type.trim().toUpperCase() === 'ONE TO MANY' &&
            r.RelatedEntity !== entity.Name
        );

        for (const rel of dependents) {
            // Only include entities that are actually in the snapshot
            if (!snapshotEntities.has(rel.RelatedEntity)) continue;

            const childEntity = this.metadata.Entities.find(e => e.Name === rel.RelatedEntity);
            const children = childEntity
                ? this.buildDependencyTree(childEntity, depth + 1, new Set(visited), snapshotEntities)
                : [];

            deps.push({
                EntityName: rel.RelatedEntity,
                RelationshipField: rel.RelatedEntityJoinField,
                Children: children,
                Depth: depth + 1,
                IsExpanded: depth < 1
            });
        }

        return deps.sort((a, b) => a.EntityName.localeCompare(b.EntityName));
    }

    // =========================================================================
    // History tab
    // =========================================================================

    private async loadHistoryData(): Promise<void> {
        this.IsLoadingHistory = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<VersionLabelRestoreEntityType>({
                EntityName: 'MJ: Version Label Restores',
                ExtraFilter: `VersionLabelID = '${this.Label.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.Restores = result.Results;
            }

            // Find related labels (same entity + record)
            this.RelatedLabels = this.AllLabels.filter(l =>
                l.ID !== this.Label.ID &&
                l.EntityID === this.Label.EntityID &&
                l.RecordID === this.Label.RecordID &&
                l.RecordID != null
            );

            this.historyLoaded = true;
        } catch (e) {
            console.error('Error loading history data:', e);
        } finally {
            this.ngZone.run(() => {
                this.IsLoadingHistory = false;
                this.cdr.markForCheck();
            });
        }
    }

    // =========================================================================
    // Snapshot interactions
    // =========================================================================

    public ToggleSnapshotGroup(group: SnapshotEntityGroup): void {
        group.IsExpanded = !group.IsExpanded;
        if (group.IsExpanded && !group.NamesLoaded) {
            this.loadGroupRecordNames(group);
        }
        this.cdr.markForCheck();
    }

    /**
     * Lazy-load record display names for a group using Metadata.GetEntityRecordNames.
     * Only called when a group is first expanded.
     */
    private async loadGroupRecordNames(group: SnapshotEntityGroup): Promise<void> {
        group.IsLoadingNames = true;
        this.cdr.markForCheck();

        try {
            const inputs: EntityRecordNameInput[] = group.Items.map(item => {
                const rawId = this.extractRawRecordId(item.RecordID);
                const input = new EntityRecordNameInput();
                input.EntityName = group.EntityName;
                input.CompositeKey = new CompositeKey([{ FieldName: 'ID', Value: rawId }]);
                return input;
            });

            const results = await this.metadata.GetEntityRecordNames(inputs);

            for (const result of results) {
                if (result.Success && result.RecordName) {
                    // Match result back to the item by composite key value
                    const resultId = result.CompositeKey?.KeyValuePairs?.[0]?.Value;
                    if (resultId) {
                        const item = group.Items.find(i =>
                            this.extractRawRecordId(i.RecordID) === String(resultId)
                        );
                        if (item) {
                            item.DisplayName = result.RecordName;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error loading record names for group:', group.EntityName, e);
        } finally {
            this.ngZone.run(() => {
                group.IsLoadingNames = false;
                group.NamesLoaded = true;
                this.cdr.markForCheck();
            });
        }
    }

    public OnSnapshotSearchChange(text: string): void {
        this.SnapshotSearch = text;
        this.applySortAndFilter();
        this.cdr.markForCheck();
    }

    public OnSnapshotSortChange(sortBy: 'name' | 'count'): void {
        if (this.SnapshotSortBy === sortBy) {
            // Toggle direction if clicking same sort
            this.SnapshotSortDir = this.SnapshotSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.SnapshotSortBy = sortBy;
            this.SnapshotSortDir = sortBy === 'name' ? 'asc' : 'desc';
        }
        this.applySortAndFilter();
        this.cdr.markForCheck();
    }

    public ToggleSnapshotViewMode(): void {
        this.SnapshotViewMode = this.SnapshotViewMode === 'card' ? 'list' : 'card';
        this.cdr.markForCheck();
    }

    // =========================================================================
    // Diff interactions
    // =========================================================================

    public ToggleDiffGroup(group: ClientDiffEntityGroup): void {
        group.IsExpanded = !group.IsExpanded;
        this.cdr.markForCheck();
    }

    public ExpandAllDiffGroups(): void {
        if (!this.DiffResult) return;
        for (const group of this.DiffResult.EntityGroups) {
            group.IsExpanded = true;
        }
        this.cdr.markForCheck();
    }

    public CollapseAllDiffGroups(): void {
        if (!this.DiffResult) return;
        for (const group of this.DiffResult.EntityGroups) {
            group.IsExpanded = false;
        }
        this.cdr.markForCheck();
    }

    // =========================================================================
    // Dependency interactions
    // =========================================================================

    public ToggleDependencyNode(node: DependencyEntityView): void {
        node.IsExpanded = !node.IsExpanded;
        this.cdr.markForCheck();
    }

    // =========================================================================
    // Micro view (inline navigation)
    // =========================================================================

    public OpenMicroView(entityName: string, recordId: string, recordChangeId: string, displayName?: string): void {
        const label = displayName || this.extractRawRecordId(recordId).substring(0, 12) + '...';
        this.BreadcrumbLabel = `${entityName} / ${label}`;
        this.MicroViewRecord = {
            EntityName: entityName,
            EntityID: '',
            RecordID: recordId,
            RecordChangeID: recordChangeId,
            FullRecordJSON: null,
            FieldDiffs: null
        };
        this.ShowMicroView = true;
        this.cdr.markForCheck();
    }

    public OnBackFromMicroView(): void {
        this.ShowMicroView = false;
        this.MicroViewRecord = null;
        this.cdr.markForCheck();
    }

    public OnEntityLinkClick(event: EntityLinkClickEvent): void {
        this.EntityLinkClick.emit(event);
    }

    public OnOpenRecordClick(event: EntityLinkClickEvent): void {
        this.EntityLinkClick.emit(event);
    }

    /** Open the record referenced by a Record-scoped label via navigation. */
    public OnOpenOverviewRecord(): void {
        if (!this.Label.EntityID || !this.Label.RecordID) return;
        const entityName = this.resolveEntityName(this.Label.EntityID);
        const rawId = this.extractRawRecordId(this.Label.RecordID);
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: rawId }]);
        this.EntityLinkClick.emit({
            EntityName: entityName,
            RecordID: rawId,
            CompositeKey: pkey
        });
    }

    // =========================================================================
    // Resize handling
    // =========================================================================

    public OnResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Run outside Angular zone for performance during drag
        this.ngZone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.boundOnResizeMove);
            document.addEventListener('mouseup', this.boundOnResizeEnd);
        });
    }

    private onResizeMove(event: MouseEvent): void {
        if (!this.isResizing) return;

        const viewportWidth = window.innerWidth;
        const maxWidth = viewportWidth * this.resizeMaxWidthRatio;
        const newWidth = Math.max(this.resizeMinWidth, Math.min(maxWidth, viewportWidth - event.clientX));

        this.PanelWidthPx = newWidth;
        this.ngZone.run(() => this.cdr.markForCheck());
    }

    private onResizeEnd(): void {
        if (!this.isResizing) return;
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
        this.savePanelPreferences();
    }

    // =========================================================================
    // Panel preferences
    // =========================================================================

    private loadPanelPreferences(): void {
        // Default to 65% of viewport
        this.PanelWidthPx = Math.max(this.resizeMinWidth, Math.min(window.innerWidth * 0.65, 1000));

        try {
            const raw = UserInfoEngine.Instance.GetSetting(MjLabelDetailComponent.PREFS_KEY);
            if (raw) {
                const prefs = JSON.parse(raw) as { PanelWidthPx?: number };
                if (prefs.PanelWidthPx && prefs.PanelWidthPx >= this.resizeMinWidth) {
                    this.PanelWidthPx = Math.min(prefs.PanelWidthPx, window.innerWidth * this.resizeMaxWidthRatio);
                }
            }
        } catch {
            // Use defaults
        }
    }

    private savePanelPreferences(): void {
        try {
            const prefs = JSON.stringify({ PanelWidthPx: Math.round(this.PanelWidthPx) });
            UserInfoEngine.Instance.SetSettingDebounced(MjLabelDetailComponent.PREFS_KEY, prefs);
        } catch {
            // Ignore save errors
        }
    }

    // =========================================================================
    // Display helpers
    // =========================================================================

    public resolveEntityName(entityId: string | null | undefined): string {
        if (!entityId) return 'Unknown';
        const entity = this.metadata.Entities.find(e => e.ID === entityId);
        return entity ? entity.Name : 'Unknown';
    }

    /** Resolve icon CSS class for an entity by ID, falling back to generic table icon. */
    public resolveEntityIcon(entityId: string): string {
        if (!entityId) return 'fa-solid fa-table';
        const entity = this.metadata.Entities.find(e => e.ID === entityId);
        return entity?.Icon || 'fa-solid fa-table';
    }

    /** Resolve icon CSS class for an entity by name, falling back to generic table icon. */
    public resolveEntityIconByName(entityName: string): string {
        if (!entityName) return 'fa-solid fa-table';
        const entity = this.metadata.Entities.find(e => e.Name === entityName);
        return entity?.Icon || 'fa-solid fa-table';
    }

    /** Format a record ID for display — strips 'ID|' prefix for single-value PKs. */
    public FormatRecordID(recordId: string | undefined): string {
        return this.extractRawRecordId(recordId ?? '');
    }

    public GetScopeIcon(scope: string | undefined): string {
        const icons: Record<string, string> = {
            'System': 'fa-solid fa-globe',
            'Entity': 'fa-solid fa-table',
            'Record': 'fa-solid fa-file'
        };
        return icons[scope ?? ''] ?? 'fa-solid fa-tag';
    }

    public GetStatusClass(status: string | undefined): string {
        const classes: Record<string, string> = {
            'Active': 'status-active',
            'Archived': 'status-archived',
            'Restored': 'status-restored'
        };
        return classes[status ?? ''] ?? '';
    }

    public GetChangeTypeClass(changeType: string): string {
        const classes: Record<string, string> = {
            'Added': 'change-added',
            'Modified': 'change-modified',
            'Removed': 'change-removed'
        };
        return classes[changeType] ?? '';
    }

    public GetChangeTypeIcon(changeType: string): string {
        const icons: Record<string, string> = {
            'Added': 'fa-solid fa-plus-circle',
            'Modified': 'fa-solid fa-pen-to-square',
            'Removed': 'fa-solid fa-minus-circle'
        };
        return icons[changeType] ?? 'fa-solid fa-circle';
    }

    public FormatDate(date: Date | string | undefined): string {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    public FormatRelativeDate(date: Date | string | undefined): string {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    public FormatDuration(ms: number | undefined): string {
        if (!ms) return '';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    public GetItemCount(labelId: string | undefined): number {
        return this.ItemCountMap.get(labelId ?? '') ?? 0;
    }

    private formatFieldValue(value: unknown): string {
        if (value == null) return 'null';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }
}
