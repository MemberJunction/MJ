import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata, CompositeKey, EntityRecordNameInput } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJVersionLabelEntityType, MJVersionLabelItemEntityType } from '@memberjunction/core-entities';

interface VersionDiffPreferences {
    DiffMode: 'label-to-label' | 'label-to-current';
}
interface DiffItemView {
    EntityName: string;
    EntityID: string;
    RecordID: string;
    DisplayName: string;
    ChangeType: 'Added' | 'Removed' | 'Modified' | 'Unchanged';
    FieldChanges: FieldChangeView[];
    IsExpanded: boolean;
    IsLoadingFields: boolean;
    FieldsLoaded: boolean;
    /** RecordChangeID from the "from" label (for loading FullRecordJSON). */
    FromRecordChangeID: string;
    /** RecordChangeID from the "to" label (for loading FullRecordJSON). */
    ToRecordChangeID: string;
}

interface FieldChangeView {
    FieldName: string;
    OldValue: string;
    NewValue: string;
    ChangeType: 'Added' | 'Modified' | 'Removed';
}

interface RecordChangeRow {
    ID: string;
    FullRecordJSON: string;
}

interface EntityGroupView {
    EntityName: string;
    EntityIcon: string;
    Items: DiffItemView[];
    AddedCount: number;
    RemovedCount: number;
    ModifiedCount: number;
    IsExpanded: boolean;
    NamesLoaded: boolean;
    IsLoadingNames: boolean;
}

@RegisterClass(BaseResourceComponent, 'VersionHistoryDiffResource')
@Component({
  standalone: false,
    selector: 'mj-version-history-diff-resource',
    templateUrl: './diff-resource.component.html',
    styleUrls: ['./diff-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionHistoryDiffResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public IsLoading = true;
    public IsDiffLoading = false;
    public HasDiffResult = false;

    // Label selection
    public AvailableLabels: MJVersionLabelEntityType[] = [];
    public FromLabelId = '';
    public ToLabelId = '';
    public DiffMode: 'label-to-label' | 'label-to-current' = 'label-to-current';

    // Diff results
    public EntityGroups: EntityGroupView[] = [];
    public FilteredEntityGroups: EntityGroupView[] = [];
    public TotalAdded = 0;
    public TotalRemoved = 0;
    public TotalModified = 0;
    public TotalUnchanged = 0;

    // Diff result filtering/sorting
    public DiffSortBy: 'name' | 'count' = 'count';
    public DiffSortDir: 'asc' | 'desc' = 'desc';
    public DiffFilterType: 'all' | 'added' | 'removed' | 'modified' = 'all';
    public DiffSearch = '';

    // UI state
    public ExpandedEntities = new Set<string>();

    private static readonly PREFS_KEY = 'VersionHistory.Diff.UserPreferences';
    private preferencesLoaded = false;
    private destroy$ = new Subject<void>();
    private metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef, private navigationService: NavigationService) {
        super();
    }

    ngOnInit(): void {
        this.loadUserPreferences();
        this.LoadLabels();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Diff Viewer';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-code-compare';
    }

    public async LoadLabels(): Promise<void> {
        try {
            this.IsLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();
            const result = await rv.RunView<MJVersionLabelEntityType>({
                EntityName: 'MJ: Version Labels',
                ExtraFilter: "Status = 'Active'",
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 200,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.AvailableLabels = result.Results;
            }
        } catch (error) {
            console.error('Error loading labels for diff:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    public OnDiffModeChange(mode: 'label-to-label' | 'label-to-current'): void {
        this.DiffMode = mode;
        this.HasDiffResult = false;
        this.EntityGroups = [];
        this.cdr.markForCheck();
        this.persistPreferences();
    }

    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(VersionHistoryDiffResourceComponent.PREFS_KEY);
            if (raw) {
                const prefs: VersionDiffPreferences = JSON.parse(raw);
                if (prefs.DiffMode === 'label-to-label' || prefs.DiffMode === 'label-to-current') {
                    this.DiffMode = prefs.DiffMode;
                }
            }
        } catch (error) {
            console.error('Error loading diff preferences:', error);
            this.DiffMode = 'label-to-current';
        }
        this.preferencesLoaded = true;
    }

    private persistPreferences(): void {
        if (!this.preferencesLoaded) return;
        const prefs: VersionDiffPreferences = {
            DiffMode: this.DiffMode
        };
        UserInfoEngine.Instance.SetSettingDebounced(VersionHistoryDiffResourceComponent.PREFS_KEY, JSON.stringify(prefs));
    }

    public async RunDiff(): Promise<void> {
        if (!this.FromLabelId) return;
        if (this.DiffMode === 'label-to-label' && !this.ToLabelId) return;

        try {
            this.IsDiffLoading = true;
            this.HasDiffResult = false;
            this.cdr.markForCheck();

            // Load label items for comparison
            const rv = new RunView();
            const fromItems = await this.loadLabelItems(rv, this.FromLabelId);

            if (this.DiffMode === 'label-to-label') {
                const toItems = await this.loadLabelItems(rv, this.ToLabelId);
                this.computeDiff(fromItems, toItems);
            } else {
                // Label-to-current: compare label state against live data
                await this.computeDiffToCurrentState(rv, fromItems);
            }

            this.HasDiffResult = true;
        } catch (error) {
            console.error('Error running diff:', error);
        } finally {
            this.IsDiffLoading = false;
            this.cdr.markForCheck();
        }
    }

    private async loadLabelItems(
        rv: RunView,
        labelId: string
    ): Promise<MJVersionLabelItemEntityType[]> {
        const result = await rv.RunView<MJVersionLabelItemEntityType>({
            EntityName: 'MJ: Version Label Items',
            ExtraFilter: `VersionLabelID = '${labelId}'`,
            ResultType: 'simple'
        });
        return result.Success ? result.Results : [];
    }

    private computeDiff(
        fromItems: MJVersionLabelItemEntityType[],
        toItems: MJVersionLabelItemEntityType[]
    ): void {
        const entityMap = new Map<string, DiffItemView[]>();

        // Build lookup maps keyed by EntityID + RecordID
        const fromMap = this.buildItemKeyMap(fromItems);
        const toMap = this.buildItemKeyMap(toItems);

        // Items in 'to' but not in 'from' = Added
        for (const [key, item] of toMap) {
            const entityName = this.resolveEntityName(item.EntityID ?? '');
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            if (!fromMap.has(key)) {
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    EntityID: item.EntityID ?? '',
                    RecordID: item.RecordID ?? '',
                    DisplayName: '',
                    ChangeType: 'Added',
                    FieldChanges: [],
                    IsExpanded: false,
                    IsLoadingFields: false,
                    FieldsLoaded: false,
                    FromRecordChangeID: '',
                    ToRecordChangeID: item.RecordChangeID ?? ''
                });
            }
        }

        // Items in 'from' but not in 'to' = Removed
        for (const [key, item] of fromMap) {
            const entityName = this.resolveEntityName(item.EntityID ?? '');
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            if (!toMap.has(key)) {
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    EntityID: item.EntityID ?? '',
                    RecordID: item.RecordID ?? '',
                    DisplayName: '',
                    ChangeType: 'Removed',
                    FieldChanges: [],
                    IsExpanded: false,
                    IsLoadingFields: false,
                    FieldsLoaded: false,
                    FromRecordChangeID: item.RecordChangeID ?? '',
                    ToRecordChangeID: ''
                });
            } else {
                // Both exist - check if RecordChangeID differs (= Modified)
                const toItem = toMap.get(key)!;
                const changeType = !UUIDsEqual(item.RecordChangeID, toItem.RecordChangeID)
                    ? 'Modified' : 'Unchanged';
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    EntityID: item.EntityID ?? '',
                    RecordID: item.RecordID ?? '',
                    DisplayName: '',
                    ChangeType: changeType,
                    FieldChanges: [],
                    IsExpanded: false,
                    IsLoadingFields: false,
                    FieldsLoaded: false,
                    FromRecordChangeID: item.RecordChangeID ?? '',
                    ToRecordChangeID: toItem.RecordChangeID ?? ''
                });
            }
        }

        this.buildEntityGroups(entityMap);
    }

    private async computeDiffToCurrentState(
        rv: RunView,
        labelItems: MJVersionLabelItemEntityType[]
    ): Promise<void> {
        // For label-to-current, compare snapshot RecordChangeIDs against
        // the latest RecordChange for each entity/record combination.
        const entityMap = new Map<string, DiffItemView[]>();

        for (const item of labelItems) {
            const entityId = item.EntityID ?? '';
            const entityName = this.resolveEntityName(entityId);
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            // Load the latest RecordChange for this record
            const latestChangeId = await this.loadLatestRecordChange(rv, entityId, item.RecordID ?? '');
            const isModified = latestChangeId != null && latestChangeId !== item.RecordChangeID;

            entityMap.get(entityName)!.push({
                EntityName: entityName,
                EntityID: entityId,
                RecordID: item.RecordID ?? '',
                DisplayName: '',
                ChangeType: isModified ? 'Modified' : 'Unchanged',
                FieldChanges: [],
                IsExpanded: false,
                IsLoadingFields: false,
                FieldsLoaded: false,
                FromRecordChangeID: item.RecordChangeID ?? '',
                ToRecordChangeID: latestChangeId ?? ''
            });
        }

        this.buildEntityGroups(entityMap);
    }

    private buildItemKeyMap(
        items: MJVersionLabelItemEntityType[]
    ): Map<string, MJVersionLabelItemEntityType> {
        const map = new Map<string, MJVersionLabelItemEntityType>();
        for (const item of items) {
            const key = `${item.EntityID ?? ''}|${item.RecordID ?? ''}`;
            map.set(key, item);
        }
        return map;
    }

    private buildEntityGroups(entityMap: Map<string, DiffItemView[]>): void {
        this.TotalAdded = 0;
        this.TotalRemoved = 0;
        this.TotalModified = 0;
        this.TotalUnchanged = 0;

        this.EntityGroups = Array.from(entityMap.entries()).map(([entityName, items]) => {
            const added = items.filter(i => i.ChangeType === 'Added').length;
            const removed = items.filter(i => i.ChangeType === 'Removed').length;
            const modified = items.filter(i => i.ChangeType === 'Modified').length;

            this.TotalAdded += added;
            this.TotalRemoved += removed;
            this.TotalModified += modified;
            this.TotalUnchanged += items.filter(i => i.ChangeType === 'Unchanged').length;

            // Resolve entity icon from first item's EntityID
            const firstItem = items[0];
            const entityIcon = this.resolveEntityIcon(firstItem?.EntityID ?? '');

            return {
                EntityName: entityName,
                EntityIcon: entityIcon,
                Items: items.filter(i => i.ChangeType !== 'Unchanged'),
                AddedCount: added,
                RemovedCount: removed,
                ModifiedCount: modified,
                IsExpanded: false,
                NamesLoaded: false,
                IsLoadingNames: false
            };
        }).filter(g => g.Items.length > 0)
          .sort((a, b) => b.Items.length - a.Items.length);

        this.ExpandedEntities.clear();
        this.applySortAndFilterDiff();
    }

    private resolveEntityName(entityId: string): string {
        if (!entityId) return 'Unknown';
        const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityId));
        return entity ? entity.Name : 'Unknown';
    }

    private resolveEntityIcon(entityId: string): string {
        if (!entityId) return 'fa-solid fa-table';
        const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityId));
        return entity?.Icon || 'fa-solid fa-table';
    }

    // =========================================================================
    // Expand / Collapse
    // =========================================================================

    public ToggleEntityGroup(group: EntityGroupView): void {
        group.IsExpanded = !group.IsExpanded;
        if (group.IsExpanded) {
            this.ExpandedEntities.add(group.EntityName);
            // Auto-expand all Modified items so field details show immediately
            for (const item of group.Items) {
                if (item.ChangeType === 'Modified') {
                    item.IsExpanded = true;
                }
            }
            // Auto-load field changes for modified items when group opens
            this.loadFieldChangesForGroup(group);
            // Load record display names
            if (!group.NamesLoaded && !group.IsLoadingNames) {
                this.loadGroupRecordNames(group);
            }
        } else {
            this.ExpandedEntities.delete(group.EntityName);
        }
        this.cdr.markForCheck();
    }

    public ToggleItem(item: DiffItemView): void {
        if (item.ChangeType !== 'Modified') return;
        item.IsExpanded = !item.IsExpanded;
        if (item.IsExpanded && !item.FieldsLoaded) {
            this.loadFieldChangesForItem(item);
        }
        this.cdr.markForCheck();
    }

    public ExpandAllGroups(): void {
        for (const group of this.FilteredEntityGroups) {
            group.IsExpanded = true;
            this.ExpandedEntities.add(group.EntityName);
            this.loadFieldChangesForGroup(group);
            for (const item of group.Items) {
                if (item.ChangeType === 'Modified') {
                    item.IsExpanded = true;
                }
            }
            if (!group.NamesLoaded && !group.IsLoadingNames) {
                this.loadGroupRecordNames(group);
            }
        }
        this.cdr.markForCheck();
    }

    public CollapseAllGroups(): void {
        for (const group of this.FilteredEntityGroups) {
            group.IsExpanded = false;
            this.ExpandedEntities.delete(group.EntityName);
            for (const item of group.Items) {
                item.IsExpanded = false;
            }
        }
        this.cdr.markForCheck();
    }

    public IsEntityExpanded(entityName: string): boolean {
        return this.ExpandedEntities.has(entityName);
    }

    /** Open a record in the explorer via NavigationService. */
    public OnOpenRecord(item: DiffItemView): void {
        const rawId = this.extractRawRecordId(item.RecordID);
        const pkey = new CompositeKey([{ FieldName: 'ID', Value: rawId }]);
        this.navigationService.OpenEntityRecord(item.EntityName, pkey);
    }

    // =========================================================================
    // Record name resolution
    // =========================================================================

    /** Lazy-load record display names for a group using Metadata.GetEntityRecordNames. */
    private async loadGroupRecordNames(group: EntityGroupView): Promise<void> {
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
            group.IsLoadingNames = false;
            group.NamesLoaded = true;
            this.cdr.markForCheck();
        }
    }

    /** Extract the raw UUID from a RecordID that may be in "ID|<uuid>" format. */
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

    // =========================================================================
    // Field-level diff loading
    // =========================================================================

    /** Auto-load field changes for all modified items in a group (when first expanded). */
    private loadFieldChangesForGroup(group: EntityGroupView): void {
        for (const item of group.Items) {
            if (item.ChangeType === 'Modified' && !item.FieldsLoaded && !item.IsLoadingFields) {
                this.loadFieldChangesForItem(item);
            }
        }
    }

    /** Lazy-load field-level changes for a single modified item. */
    private async loadFieldChangesForItem(item: DiffItemView): Promise<void> {
        if (!item.FromRecordChangeID || !item.ToRecordChangeID) {
            item.FieldsLoaded = true;
            return;
        }

        item.IsLoadingFields = true;
        this.cdr.markForCheck();

        try {
            item.FieldChanges = await this.computeFieldChanges(item.FromRecordChangeID, item.ToRecordChangeID);
        } catch (e) {
            console.error('Error loading field changes:', e);
        } finally {
            item.IsLoadingFields = false;
            item.FieldsLoaded = true;
            this.cdr.markForCheck();
        }
    }

    private async loadLatestRecordChange(rv: RunView, entityId: string, recordId: string): Promise<string | null> {
        if (!entityId || !recordId) return null;

        const result = await rv.RunView<RecordChangeRow>({
            EntityName: 'MJ: Record Changes',
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

    private async computeFieldChanges(oldChangeId: string, newChangeId: string): Promise<FieldChangeView[]> {
        if (!oldChangeId || !newChangeId) return [];

        try {
            const rv = new RunView();
            const [oldResult, newResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Record Changes',
                    ExtraFilter: `ID = '${oldChangeId}'`,
                    Fields: ['FullRecordJSON'],
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Record Changes',
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

    private formatFieldValue(value: unknown): string {
        if (value == null) return 'null';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    // =========================================================================
    // Display helpers
    // =========================================================================

    public GetChangeTypeClass(changeType: string): string {
        const classes: Record<string, string> = {
            'Added': 'change-added',
            'Removed': 'change-removed',
            'Modified': 'change-modified',
            'Unchanged': 'change-unchanged'
        };
        return classes[changeType] ?? '';
    }

    public GetChangeTypeIcon(changeType: string): string {
        const icons: Record<string, string> = {
            'Added': 'fa-solid fa-plus',
            'Removed': 'fa-solid fa-minus',
            'Modified': 'fa-solid fa-pen',
            'Unchanged': 'fa-solid fa-equals'
        };
        return icons[changeType] ?? 'fa-solid fa-circle';
    }

    public FormatRecordID(recordId: string): string {
        return this.extractRawRecordId(recordId);
    }

    public FormatLabelOption(label: MJVersionLabelEntityType): string {
        const dateVal = label.__mj_CreatedAt;
        const date = dateVal instanceof Date
            ? dateVal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : new Date(dateVal as unknown as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${label.Name} (${label.Scope}, ${date})`;
    }

    public Refresh(): void {
        this.LoadLabels();
    }

    public get CanRunDiff(): boolean {
        if (!this.FromLabelId) return false;
        if (this.DiffMode === 'label-to-label' && !this.ToLabelId) return false;
        return true;
    }

    public get TotalChanges(): number {
        return this.TotalAdded + this.TotalRemoved + this.TotalModified;
    }

    // =========================================================================
    // Label selection helpers
    // =========================================================================

    /** From dropdown excludes the currently selected To label. */
    public get FilteredFromLabels(): MJVersionLabelEntityType[] {
        if (!this.ToLabelId) return this.AvailableLabels;
        return this.AvailableLabels.filter(l => !UUIDsEqual(l.ID, this.ToLabelId));
    }

    /** To dropdown excludes the currently selected From label. */
    public get FilteredToLabels(): MJVersionLabelEntityType[] {
        if (!this.FromLabelId) return this.AvailableLabels;
        return this.AvailableLabels.filter(l => !UUIDsEqual(l.ID, this.FromLabelId));
    }

    /** Swap From and To label selections. */
    public SwapLabels(): void {
        const temp = this.FromLabelId;
        this.FromLabelId = this.ToLabelId;
        this.ToLabelId = temp;
        this.cdr.markForCheck();
    }

    // =========================================================================
    // Diff result sorting & filtering
    // =========================================================================

    public OnDiffSortChange(sortBy: 'name' | 'count'): void {
        if (this.DiffSortBy === sortBy) {
            this.DiffSortDir = this.DiffSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.DiffSortBy = sortBy;
            this.DiffSortDir = sortBy === 'name' ? 'asc' : 'desc';
        }
        this.applySortAndFilterDiff();
        this.cdr.markForCheck();
    }

    public OnDiffFilterChange(filterType: 'all' | 'added' | 'removed' | 'modified'): void {
        this.DiffFilterType = filterType;
        this.applySortAndFilterDiff();
        this.cdr.markForCheck();
    }

    public OnDiffSearchChange(text: string): void {
        this.DiffSearch = text;
        this.applySortAndFilterDiff();
        this.cdr.markForCheck();
    }

    private applySortAndFilterDiff(): void {
        let groups = [...this.EntityGroups];

        // Filter by change type
        if (this.DiffFilterType !== 'all') {
            groups = groups.map(g => ({
                ...g,
                Items: g.Items.filter(i => i.ChangeType.toLowerCase() === this.DiffFilterType)
            })).filter(g => g.Items.length > 0);
        }

        // Filter by search text
        if (this.DiffSearch) {
            const search = this.DiffSearch.toLowerCase();
            groups = groups
                .filter(g => g.EntityName.toLowerCase().includes(search) ||
                    g.Items.some(i => i.RecordID.toLowerCase().includes(search) || i.DisplayName.toLowerCase().includes(search)))
                .map(g => ({
                    ...g,
                    Items: g.Items.filter(i =>
                        i.RecordID.toLowerCase().includes(search) ||
                        i.DisplayName.toLowerCase().includes(search) ||
                        g.EntityName.toLowerCase().includes(search)
                    )
                }))
                .filter(g => g.Items.length > 0);
        }

        // Sort
        groups.sort((a, b) => {
            if (this.DiffSortBy === 'name') {
                const cmp = a.EntityName.localeCompare(b.EntityName);
                return this.DiffSortDir === 'asc' ? cmp : -cmp;
            }
            const cmp = a.Items.length - b.Items.length;
            return this.DiffSortDir === 'asc' ? cmp : -cmp;
        });

        this.FilteredEntityGroups = groups;
    }
}
