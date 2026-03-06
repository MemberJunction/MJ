import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
    NgZone
} from '@angular/core';
import { RunView, Metadata, EntityInfo } from '@memberjunction/core';
import {
    GraphQLDataProvider,
    GraphQLVersionHistoryClient,
    CreateVersionLabelProgress
} from '@memberjunction/graphql-dataprovider';

export interface RecordOption {
    ID: string;
    DisplayName: string;
    Selected: boolean;
}

@Component({
  standalone: false,
    selector: 'mj-label-create',
    templateUrl: './label-create.component.html',
    styleUrls: ['./label-create.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjLabelCreateComponent implements OnInit {
    /**
     * When set, skips the entity picker step and pre-selects this entity.
     */
    @Input() PreselectedEntity: EntityInfo | null = null;

    /**
     * When set along with PreselectedEntity, auto-selects these record IDs
     * and skips directly to the details step.
     */
    @Input() PreselectedRecordIds: string[] = [];

    /** Emitted when labels are successfully created. */
    @Output() Created = new EventEmitter<{ LabelCount: number; ItemCount: number }>();

    /** Emitted when the user cancels. */
    @Output() Cancel = new EventEmitter<void>();

    // Wizard state
    public CreateStep: 'entity' | 'records' | 'details' | 'creating' | 'done' = 'entity';

    // Step 1: Entity selection
    public EntitySearchText = '';
    public FilteredEntities: EntityInfo[] = [];
    public SelectedEntity: EntityInfo | null = null;

    // Step 2: Record selection
    public RecordSearchText = '';
    public AvailableRecords: RecordOption[] = [];
    public FilteredRecords: RecordOption[] = [];
    public IsLoadingRecords = false;

    // Step 3: Details
    public LabelName = '';
    public LabelDescription = '';

    // Creating / done state
    public IsCreatingLabel = false;
    public CreateError = '';
    public CreatedLabelCount = 0;
    public CreatedItemCount = 0;
    public CreateProgress: CreateVersionLabelProgress | null = null;

    private metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

    ngOnInit(): void {
        this.resetCreateDialog();

        if (this.PreselectedEntity) {
            this.SelectedEntity = this.PreselectedEntity;

            if (this.PreselectedRecordIds.length > 0) {
                this.skipToDetailsWithPreselection();
            } else {
                this.CreateStep = 'records';
                this.loadEntityRecords(this.PreselectedEntity);
            }
        } else {
            this.FilteredEntities = this.getTrackableEntities();
        }
    }

    // =======================================================================
    // Pre-selection helpers
    // =======================================================================

    private async skipToDetailsWithPreselection(): Promise<void> {
        await this.loadEntityRecords(this.SelectedEntity!);
        this.ngZone.run(() => {
            this.preselectRecordsByIds(this.PreselectedRecordIds);
            this.CreateStep = 'details';
            this.LabelName = this.suggestLabelName();
            this.cdr.markForCheck();
        });
    }

    private preselectRecordsByIds(ids: string[]): void {
        const idSet = new Set(ids);
        for (const record of this.AvailableRecords) {
            record.Selected = idSet.has(record.ID);
        }
    }

    // =======================================================================
    // Step 1: Entity picker
    // =======================================================================

    public OnEntitySearchChange(text: string): void {
        this.EntitySearchText = text;
        const search = text.toLowerCase();
        const all = this.getTrackableEntities();
        this.FilteredEntities = search
            ? all.filter(e => e.Name.toLowerCase().includes(search))
            : all;
        this.cdr.markForCheck();
    }

    public SelectEntity(entity: EntityInfo): void {
        this.SelectedEntity = entity;
        this.CreateStep = 'records';
        this.loadEntityRecords(entity);
    }

    // =======================================================================
    // Step 2: Record selection
    // =======================================================================

    public OnRecordSearchChange(text: string): void {
        this.RecordSearchText = text;
        const search = text.toLowerCase();
        this.FilteredRecords = search
            ? this.AvailableRecords.filter(r => r.DisplayName.toLowerCase().includes(search))
            : [...this.AvailableRecords];
        this.cdr.markForCheck();
    }

    public ToggleRecordSelection(record: RecordOption): void {
        record.Selected = !record.Selected;
        this.cdr.markForCheck();
    }

    public SelectAllRecords(): void {
        for (const r of this.FilteredRecords) {
            r.Selected = true;
        }
        this.cdr.markForCheck();
    }

    public DeselectAllRecords(): void {
        for (const r of this.AvailableRecords) {
            r.Selected = false;
        }
        this.cdr.markForCheck();
    }

    public get SelectedRecordCount(): number {
        return this.AvailableRecords.filter(r => r.Selected).length;
    }

    // =======================================================================
    // Step navigation
    // =======================================================================

    public GoToDetailsStep(): void {
        if (this.SelectedRecordCount === 0) return;
        this.CreateStep = 'details';
        this.LabelName = this.suggestLabelName();
        this.cdr.markForCheck();
    }

    public GoBackToRecords(): void {
        this.CreateStep = 'records';
        this.cdr.markForCheck();
    }

    public GoBackToEntity(): void {
        this.CreateStep = 'entity';
        this.SelectedEntity = null;
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.cdr.markForCheck();
    }

    // =======================================================================
    // Step 3: Create labels
    // =======================================================================

    public async CreateLabels(): Promise<void> {
        if (!this.SelectedEntity || !this.LabelName.trim()) return;

        this.IsCreatingLabel = true;
        this.CreateStep = 'creating';
        this.CreateError = '';
        this.CreatedLabelCount = 0;
        this.CreatedItemCount = 0;
        this.cdr.markForCheck();

        try {
            const selected = this.AvailableRecords.filter(r => r.Selected);

            if (selected.length === 1) {
                await this.createSingleLabel(selected[0]);
            } else {
                await this.createGroupedLabels(selected);
            }

            this.CreateStep = 'done';
        } catch (e: unknown) {
            this.ngZone.run(() => {
                this.CreateError = e instanceof Error ? e.message : String(e);
                this.CreateStep = 'done';
            });
        } finally {
            this.ngZone.run(() => {
                this.IsCreatingLabel = false;
                this.cdr.markForCheck();
            });
        }
    }

    public FinishCreate(): void {
        this.Created.emit({
            LabelCount: this.CreatedLabelCount,
            ItemCount: this.CreatedItemCount
        });
    }

    public OnCancel(): void {
        this.Cancel.emit();
    }

    // =======================================================================
    // Create helpers
    // =======================================================================

    private async createSingleLabel(record: RecordOption): Promise<void> {
        const vhClient = new GraphQLVersionHistoryClient(GraphQLDataProvider.Instance);
        const result = await vhClient.CreateLabel({
            Name: this.LabelName.trim(),
            Description: this.LabelDescription.trim() || undefined,
            Scope: 'Record',
            EntityName: this.SelectedEntity!.Name,
            RecordKeys: [{ Key: 'ID', Value: record.ID }],
            IncludeDependencies: true,
            OnProgress: (progress) => {
                this.ngZone.run(() => {
                    this.CreateProgress = progress;
                    this.cdr.markForCheck();
                });
            },
        });

        if (!result.Success) {
            throw new Error(result.Error ?? 'Failed to create version label');
        }

        this.ngZone.run(() => {
            this.CreatedLabelCount = 1;
            this.CreatedItemCount = result.ItemsCaptured ?? 0;
        });
    }

    private async createGroupedLabels(records: RecordOption[]): Promise<void> {
        const vhClient = new GraphQLVersionHistoryClient(GraphQLDataProvider.Instance);

        // Create parent container label (no RecordKey -> acts as a grouping label)
        const parentResult = await vhClient.CreateLabel({
            Name: this.LabelName.trim(),
            Description: this.LabelDescription.trim() || undefined,
            Scope: 'Entity',
            EntityName: this.SelectedEntity!.Name,
        });

        if (!parentResult.Success) {
            throw new Error(parentResult.Error ?? 'Failed to create parent version label');
        }

        this.ngZone.run(() => {
            this.CreatedLabelCount = 1;
            this.CreatedItemCount = parentResult.ItemsCaptured ?? 0;
            this.cdr.markForCheck();
        });

        // Create child labels for each selected record
        for (const record of records) {
            const childResult = await vhClient.CreateLabel({
                Name: `${this.LabelName.trim()} \u2014 ${record.DisplayName}`,
                Description: this.LabelDescription.trim() || undefined,
                Scope: 'Record',
                EntityName: this.SelectedEntity!.Name,
                RecordKeys: [{ Key: 'ID', Value: record.ID }],
                ParentID: parentResult.LabelID,
                IncludeDependencies: true,
                OnProgress: (progress) => {
                    this.ngZone.run(() => {
                        this.CreateProgress = progress;
                        this.cdr.markForCheck();
                    });
                },
            });

            if (!childResult.Success) {
                console.error(`Failed to create child label for record ${record.ID}: ${childResult.Error}`);
                continue;
            }

            this.ngZone.run(() => {
                this.CreatedLabelCount++;
                this.CreatedItemCount += childResult.ItemsCaptured ?? 0;
                this.cdr.markForCheck();
            });
        }
    }

    // =======================================================================
    // Data loading
    // =======================================================================

    private async loadEntityRecords(entity: EntityInfo): Promise<void> {
        this.IsLoadingRecords = true;
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.RecordSearchText = '';
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const nameField = this.findNameField(entity);
            const fields = nameField ? ['ID', nameField] : ['ID'];

            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                Fields: fields,
                OrderBy: nameField ?? 'ID',
                MaxRows: 500,
                ResultType: 'simple'
            });

            if (result.Success) {
                this.AvailableRecords = result.Results.map(r => ({
                    ID: String(r['ID'] ?? ''),
                    DisplayName: nameField
                        ? String(r[nameField] ?? r['ID'] ?? '')
                        : String(r['ID'] ?? ''),
                    Selected: false
                }));
                this.FilteredRecords = [...this.AvailableRecords];
            }
        } catch (error) {
            console.error('Error loading entity records:', error);
        } finally {
            this.ngZone.run(() => {
                this.IsLoadingRecords = false;
                this.cdr.markForCheck();
            });
        }
    }

    // =======================================================================
    // Utility helpers
    // =======================================================================

    private findNameField(entity: EntityInfo): string | null {
        const candidates = ['Name', 'Title', 'DisplayName', 'Label', 'Subject', 'Description'];
        for (const name of candidates) {
            const field = entity.Fields.find(f =>
                f.Name.toLowerCase() === name.toLowerCase() && f.TSType === 'string'
            );
            if (field) return field.Name;
        }
        return null;
    }

    private getTrackableEntities(): EntityInfo[] {
        return this.metadata.Entities
            .filter(e => e.TrackRecordChanges)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    private suggestLabelName(): string {
        const entityName = this.SelectedEntity?.Name ?? '';
        const selected = this.AvailableRecords.filter(r => r.Selected);
        if (selected.length === 1) {
            return `${selected[0].DisplayName} v1.0`;
        }
        const date = new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        return `${entityName} \u2014 ${date}`;
    }

    private resetCreateDialog(): void {
        this.CreateStep = 'entity';
        this.EntitySearchText = '';
        this.SelectedEntity = null;
        this.RecordSearchText = '';
        this.AvailableRecords = [];
        this.FilteredRecords = [];
        this.IsLoadingRecords = false;
        this.LabelName = '';
        this.LabelDescription = '';
        this.IsCreatingLabel = false;
        this.CreateError = '';
        this.CreatedLabelCount = 0;
        this.CreatedItemCount = 0;
        this.CreateProgress = null;
    }
}
