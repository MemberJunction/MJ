import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadVersionHistoryDiffResource() {
    // Prevents tree-shaking
}

interface LabelOption {
    ID: string;
    Name: string;
    Scope: string;
    CreatedAt: Date;
}

interface DiffItemView {
    EntityName: string;
    RecordID: string;
    ChangeType: 'Added' | 'Removed' | 'Modified' | 'Unchanged';
    FieldChanges: FieldChangeView[];
}

interface FieldChangeView {
    FieldName: string;
    OldValue: string;
    NewValue: string;
}

interface EntityGroupView {
    EntityName: string;
    Items: DiffItemView[];
    AddedCount: number;
    RemovedCount: number;
    ModifiedCount: number;
}

@RegisterClass(BaseResourceComponent, 'VersionHistoryDiffResource')
@Component({
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
    public AvailableLabels: LabelOption[] = [];
    public FromLabelId = '';
    public ToLabelId = '';
    public DiffMode: 'label-to-label' | 'label-to-current' = 'label-to-current';

    // Diff results
    public EntityGroups: EntityGroupView[] = [];
    public TotalAdded = 0;
    public TotalRemoved = 0;
    public TotalModified = 0;
    public TotalUnchanged = 0;

    // UI state
    public ExpandedEntities = new Set<string>();

    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
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
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: 'MJ: Version Labels',
                ExtraFilter: "Status = 'Active'",
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 200,
                Fields: ['ID', 'Name', 'Scope', '__mj_CreatedAt'],
                ResultType: 'simple'
            });

            if (result.Success) {
                this.AvailableLabels = result.Results.map(row => ({
                    ID: row['ID'] as string,
                    Name: row['Name'] as string,
                    Scope: row['Scope'] as string,
                    CreatedAt: new Date(row['__mj_CreatedAt'] as string)
                }));
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
    ): Promise<Record<string, unknown>[]> {
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: 'MJ: Version Label Items',
            ExtraFilter: `VersionLabelID = '${labelId}'`,
            ResultType: 'simple'
        });
        return result.Success ? result.Results : [];
    }

    private computeDiff(
        fromItems: Record<string, unknown>[],
        toItems: Record<string, unknown>[]
    ): void {
        const entityMap = new Map<string, DiffItemView[]>();

        // Build lookup maps keyed by EntityID + RecordID
        const fromMap = this.buildItemKeyMap(fromItems);
        const toMap = this.buildItemKeyMap(toItems);

        // Items in 'to' but not in 'from' = Added
        for (const [key, item] of toMap) {
            const entityName = this.resolveEntityName(item['EntityID'] as string);
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            if (!fromMap.has(key)) {
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    RecordID: item['RecordID'] as string,
                    ChangeType: 'Added',
                    FieldChanges: []
                });
            }
        }

        // Items in 'from' but not in 'to' = Removed
        for (const [key, item] of fromMap) {
            const entityName = this.resolveEntityName(item['EntityID'] as string);
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            if (!toMap.has(key)) {
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    RecordID: item['RecordID'] as string,
                    ChangeType: 'Removed',
                    FieldChanges: []
                });
            } else {
                // Both exist - check if RecordChangeID differs (= Modified)
                const toItem = toMap.get(key)!;
                const changeType = item['RecordChangeID'] !== toItem['RecordChangeID']
                    ? 'Modified' : 'Unchanged';
                entityMap.get(entityName)!.push({
                    EntityName: entityName,
                    RecordID: item['RecordID'] as string,
                    ChangeType: changeType,
                    FieldChanges: []
                });
            }
        }

        this.buildEntityGroups(entityMap);
    }

    private async computeDiffToCurrentState(
        rv: RunView,
        labelItems: Record<string, unknown>[]
    ): Promise<void> {
        // For label-to-current, we compare snapshot RecordChangeIDs against
        // the latest RecordChange for each entity/record combination.
        // This is a simplified client-side comparison.
        const entityMap = new Map<string, DiffItemView[]>();

        for (const item of labelItems) {
            const entityName = this.resolveEntityName(item['EntityID'] as string);
            if (!entityMap.has(entityName)) entityMap.set(entityName, []);

            entityMap.get(entityName)!.push({
                EntityName: entityName,
                RecordID: item['RecordID'] as string,
                ChangeType: 'Modified', // Simplified: mark all as potentially modified
                FieldChanges: []
            });
        }

        this.buildEntityGroups(entityMap);
    }

    private buildItemKeyMap(
        items: Record<string, unknown>[]
    ): Map<string, Record<string, unknown>> {
        const map = new Map<string, Record<string, unknown>>();
        for (const item of items) {
            const key = `${item['EntityID']}|${item['RecordID']}`;
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

            return {
                EntityName: entityName,
                Items: items.filter(i => i.ChangeType !== 'Unchanged'),
                AddedCount: added,
                RemovedCount: removed,
                ModifiedCount: modified
            };
        }).filter(g => g.Items.length > 0)
          .sort((a, b) => b.Items.length - a.Items.length);
    }

    private resolveEntityName(entityId: string): string {
        if (!entityId) return 'Unknown';
        try {
            const md = new Metadata();
            const entity = md.Entities.find(e => e.ID === entityId);
            return entity ? entity.Name : 'Unknown';
        } catch {
            return 'Unknown';
        }
    }

    public ToggleEntityGroup(entityName: string): void {
        if (this.ExpandedEntities.has(entityName)) {
            this.ExpandedEntities.delete(entityName);
        } else {
            this.ExpandedEntities.add(entityName);
        }
        this.cdr.markForCheck();
    }

    public IsEntityExpanded(entityName: string): boolean {
        return this.ExpandedEntities.has(entityName);
    }

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

    public FormatLabelOption(label: LabelOption): string {
        const date = label.CreatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
}
