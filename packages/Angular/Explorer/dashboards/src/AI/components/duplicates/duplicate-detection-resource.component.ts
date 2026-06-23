/**
 * @fileoverview Duplicate Detection Kanban Board Resource Component
 *
 * Dashboard resource for reviewing duplicate detection results in a Kanban-style
 * board with three columns: Pending Review, Approved, and Rejected.
 * Supports triggering new detection runs with real-time progress via
 * GraphQL subscriptions.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, Input, inject, ViewEncapsulation, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CompositeKey, LogStatus, Metadata, RecordDependency, RecordMergeRequest, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
    ResourceData,
    MJDuplicateRunEntity,
    MJDuplicateRunDetailEntity,
    MJDuplicateRunDetailMatchEntity,
    MJEntityDocumentEntity,
    KnowledgeHubMetadataEngine
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService, ActivityService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * Represents a group of duplicate matches for a single source record,
 * aggregated from detail and match entities for display on the Kanban board.
 */
interface RecordMetadataInfo {
    Name?: string;
    Entity?: string;
    EntityIcon?: string;
    Description?: string;
    Status?: string;
    Type?: string;
    [key: string]: string | undefined;
}

interface DuplicateGroup {
    DetailId: string;
    RunId: string;
    RecordId: string;
    EntityName: string;
    EntityIcon: string;
    RecordName: string;
    ApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
    MatchCount: number;
    HighestScore: number;
    Matches: MJDuplicateRunDetailMatchEntity[];
    MatchedAt: Date;
    /** Parsed source record metadata from vector DB */
    Metadata: RecordMetadataInfo;
    /** Top matches with parsed metadata for display */
    TopMatchSummaries: Array<{ Name: string; Score: number }>;
}

interface DuplicateFilter {
    EntityName: string;
    MinScore: number;
    MaxScore: number;
    DateFrom: string;
    DateTo: string;
}

/** A row in the comparison grid representing one entity field across all records */
interface ComparisonFieldRow {
    FieldName: string;
    DisplayName: string;
    Category: string | null;
    SourceValue: string | undefined;
    MatchValues: (string | undefined)[];
    HasDifference: boolean;
    /** Index of the column whose value is selected for merge (0 = source, 1+ = match index) */
    SelectedColumnIndex: number;
}

/** LLM reasoning recommendation surfaced alongside a match (null when reasoning never ran) */
type LLMRecommendation = 'Merge' | 'NotDuplicate' | 'Uncertain';

/** Parsed match info for the comparison panel columns */
interface ComparisonMatchInfo {
    Match: MJDuplicateRunDetailMatchEntity;
    Name: string;
    Score: number;
    Metadata: RecordMetadataInfo;
    DiffCount: number;
    /** LLM recommendation for this match (null if reasoning did not run) */
    LLMRecommendation: LLMRecommendation | null;
    /** LLM confidence 0-1 (distinct from the vector Score / MatchProbability) */
    LLMConfidence: number | null;
    /** LLM free-text rationale (may be long; shown in an expandable region) */
    LLMReasoning: string | null;
    /** True when the LLM verdict contradicts the vector score — the prime human-review trigger */
    HasDisagreement: boolean;
}

/** Lightweight entity document info for the picker dropdown */
interface EntityDocumentOption {
    ID: string;
    Name: string;
    EntityName: string;
    PotentialMatchThreshold: number;
    AbsoluteMatchThreshold: number;
}

@RegisterClass(BaseResourceComponent, 'DuplicateDetectionResource')
@Component({
    standalone: false,
    selector: 'app-duplicate-detection-resource',
    templateUrl: './duplicate-detection-resource.component.html',
    styleUrls: ['./duplicate-detection-resource.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class DuplicateDetectionResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {

    /** Close comparison panel on Escape key */
    @HostListener('document:keydown.escape')
    OnEscapeKey(): void {
        if (this.ComparisonGroup) {
            this.CloseComparison();
        }
    }
    private cdr = inject(ChangeDetectorRef);
    private activityService = inject(ActivityService);
    /** Activity-tracker id for the currently running detection (P3). */
    private detectionActivityID: string | null = null;
    protected override navigationService = inject(NavigationService);
    protected override destroy$ = new Subject<void>();
    private filterSubject = new Subject<void>();

    // Loading state
    public IsLoading = false;
    /** Whether the results area (runs/details/matches) is still loading */
    public IsLoadingResults = false;
    public IsSaving = false;
    // ── Comparison Panel State ──
    /** The group being compared (null = panel closed) */
    public ComparisonGroup: DuplicateGroup | null = null;
    /** Whether the comparison panel is loading entity records */
    public ComparisonLoading = false;
    /** Whether to show all fields or only differences */
    public ComparisonShowAllFields = true;
    /** Precomputed field rows for the comparison grid */
    public ComparisonFields: ComparisonFieldRow[] = [];
    /** Parsed match info for comparison columns */
    public ComparisonMatches: ComparisonMatchInfo[] = [];
    /** Index of the surviving record column (0 = source, 1+ = match index) */
    public SurvivorColumnIndex = 0;
    /** Whether the panel is animating closed */
    public ComparisonClosing = false;
    /** Loaded entity records keyed by record ID (populated on panel open via RunView) */
    private comparisonRecords = new Map<string, Record<string, unknown>>();
    /** Match column indices whose LLM reasoning text is currently expanded */
    public LLMReasoningExpandedColumns = new Set<number>();
    /** True once the LLM proposed survivor/field-map has been applied to the selection state */
    public LLMProposalsApplied = false;

    // ── Dependencies State ──
    /** Dependencies per record, keyed by composite key string */
    public ComparisonDependencies = new Map<string, RecordDependency[]>();
    /** Which column indices have expanded dependency details */
    public DepsExpandedColumns = new Set<number>();
    /** Tracks which entity groups within deps are expanded (key: "columnIndex::entityName") */
    private depsEntityGroupExpanded = new Set<string>();

    // ── Merge Confirmation State ──
    /** Whether the merge confirmation panel is visible */
    public ShowMergeConfirm = false;
    /** Whether the merge is currently executing */
    public IsMerging = false;
    /** Whether the current entity allows record merging (controls merge button availability) */
    public MergeEnabled = true;
    /** Whether merge-not-available inline banner should be shown in the results area */
    public ShowMergeWarningBanner = false;

    // Raw data
    public Runs: MJDuplicateRunEntity[] = [];
    public Details: MJDuplicateRunDetailEntity[] = [];
    public Matches: MJDuplicateRunDetailMatchEntity[] = [];

    // Aggregated groups for display
    public AllGroups: DuplicateGroup[] = [];
    public PendingGroups: DuplicateGroup[] = [];
    public ApprovedGroups: DuplicateGroup[] = [];
    public RejectedGroups: DuplicateGroup[] = [];

    // Filter state
    public Filters: DuplicateFilter = {
        EntityName: '',
        MinScore: 0,
        MaxScore: 1,
        DateFrom: '',
        DateTo: ''
    };

    // Available entity names from loaded runs
    public EntityNames: string[] = [];

    // Detection run state
    public IsDetecting = false;
    public DetectionProgress = 0;
    public DetectionStage = '';
    /** Raw stage key from the last progress event — used to detect phase transitions */
    private detectionRawStage = '';

    /** Runtime threshold overrides — initialized from entity doc, adjustable via sliders */
    public RunPotentialThreshold = 0.70;
    public RunAbsoluteThreshold = 0.95;
    public DetectionCurrentItem = '';

    // Entity document picker
    public EntityDocuments: EntityDocumentOption[] = [];
    private _selectedEntityDocumentID = '';
    public get SelectedEntityDocumentID(): string { return this._selectedEntityDocumentID; }
    public set SelectedEntityDocumentID(value: string) {
        this._selectedEntityDocumentID = value;
        // Sync threshold sliders from selected entity document
        const doc = this.EntityDocuments.find(d => UUIDsEqual(d.ID, value));
        if (doc) {
            this.RunPotentialThreshold = doc.PotentialMatchThreshold;
            this.RunAbsoluteThreshold = doc.AbsoluteMatchThreshold;
        }
    }

    /**
     * When true, renders only the body content (no chrome). Set by parent shells
     * that embed this resource. See plans/explorer-chrome-conventions.md Section 5.
     */
    @Input() HideToolbar = false;

    /** View mode: 'kanban' (card board) or 'table' (paged grid) */
    public DisplayMode: 'kanban' | 'table' = 'kanban';

    /** Page size for table view */
    public PageSize = 50;

    /** Current page (0-based) */
    public CurrentPage = 0;

    /** Selected entity filter */
    public SelectedEntityFilter = '';

    /** Currently selected group for merge panel */
    public SelectedMergeGroup: DuplicateGroup | null = null;

    /** Whether the merge panel is visible */
    public ShowMergePanel = false;

    /** Auto-switch to table mode when groups exceed threshold */
    private readonly kanbanThreshold = 50;

    /** Toggle display mode */
    public ToggleDisplayMode(): void {
        this.DisplayMode = this.DisplayMode === 'kanban' ? 'table' : 'kanban';
        this.CurrentPage = 0;
        this.cdr.detectChanges();
    }

    /** Filter by entity name */
    public FilterByEntity(entityName: string): void {
        this.SelectedEntityFilter = entityName;
        this.Filters.EntityName = entityName;
        this.autoSelectDisplayMode();
        this.cdr.detectChanges();
    }

    /** Get paged groups for table view */
    public GetPagedGroups(): DuplicateGroup[] {
        const start = this.CurrentPage * this.PageSize;
        return this.AllGroups.slice(start, start + this.PageSize);
    }

    /** Get total page count */
    public get TotalPages(): number {
        return Math.ceil(this.AllGroups.length / this.PageSize);
    }

    /** Navigate to next page */
    public NextPage(): void {
        if (this.CurrentPage < this.TotalPages - 1) {
            this.CurrentPage++;
            this.cdr.detectChanges();
        }
    }

    /** Navigate to previous page */
    public PrevPage(): void {
        if (this.CurrentPage > 0) {
            this.CurrentPage--;
            this.cdr.detectChanges();
        }
    }

    /** Open the merge panel for a duplicate group */
    public OpenMergePanel(group: DuplicateGroup): void {
        this.SelectedMergeGroup = group;
        this.ShowMergePanel = true;
        this.cdr.detectChanges();
    }

    /** Close the merge panel */
    public CloseMergePanel(): void {
        this.SelectedMergeGroup = null;
        this.ShowMergePanel = false;
        this.cdr.detectChanges();
    }

    /** Auto-select display mode based on group count */
    private autoSelectDisplayMode(): void {
        this.DisplayMode = this.AllGroups.length > this.kanbanThreshold ? 'table' : 'kanban';
    }

    // KPI values
    public get TotalGroupCount(): number {
        return this.AllGroups.length;
    }
    public get PendingCount(): number {
        return this.PendingGroups.length;
    }
    public get ApprovedCount(): number {
        return this.ApprovedGroups.length;
    }
    public get RejectedCount(): number {
        return this.RejectedGroups.length;
    }

    /** Get selected entity document threshold info */
    public get SelectedDocumentThresholds(): EntityDocumentOption | null {
        if (!this.SelectedEntityDocumentID) return null;
        return this.EntityDocuments.find(d => UUIDsEqual(d.ID, this.SelectedEntityDocumentID)) ?? null;
    }

    async ngAfterViewInit(): Promise<void> {
        this.setupFilterDebounce();
        await this.LoadData();
        this.navigationService.SetAgentContext(this, {
            DetectionStatus: this.IsDetecting ? 'running' : 'idle',
            PendingCount: this.PendingGroups.length,
            ApprovedCount: this.ApprovedGroups.length,
            RejectedCount: this.RejectedGroups.length,
            SelectedEntityDoc: this.SelectedEntityDocumentID || null,
        });
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Duplicate Detection';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-clone';
    }

    /**
     * Loads all duplicate run data and builds the Kanban groups.
     * Split into two phases so that controls become interactive immediately:
     *   Phase 1 - entity docs from KH engine cache (instant)
     *   Phase 2 - runs/details/matches via RunViews (heavy)
     */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            // Phase 1: Populate entity document picker from cache (instant)
            await this.loadEntityDocuments();

            // Controls are now interactive - only the results area is loading
            this.IsLoading = false;
            this.IsLoadingResults = true;
            this.cdr.detectChanges();

            // Phase 2: Load heavy run/detail/match data
            await this.loadRunData();
        } catch (error) {
            console.error('Error loading duplicate detection data:', error);
        } finally {
            this.IsLoading = false;
            this.IsLoadingResults = false;
            this.cdr.detectChanges();
        }
    }

    /** Phase 1: Load entity documents from KH engine cache (instant). */
    private async loadEntityDocuments(): Promise<void> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false);
        this.buildEntityDocumentOptionsFromEngine(engine.GetActiveEntityDocuments());
    }

    /** Phase 2: Load runs, details, and matches via RunViews batch. */
    private async loadRunData(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const [runsResult, detailsResult, matchesResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Duplicate Runs',
                ExtraFilter: "ProcessingStatus IN ('Complete', 'Failed', 'In Progress')",
                OrderBy: 'StartedAt DESC',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Duplicate Run Details',
                ExtraFilter: "MatchStatus = 'Complete'",
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'entity_object'
            },
            {
                EntityName: 'MJ: Duplicate Run Detail Matches',
                OrderBy: 'MatchProbability DESC',
                ResultType: 'entity_object'
            }
        ]);

        if (runsResult.Success) {
            this.Runs = runsResult.Results as MJDuplicateRunEntity[];
        }
        if (detailsResult.Success) {
            this.Details = detailsResult.Results as MJDuplicateRunDetailEntity[];
        }
        if (matchesResult.Success) {
            this.Matches = matchesResult.Results as MJDuplicateRunDetailMatchEntity[];
        }

        this.buildGroups();
        this.extractEntityNames();
        this.computeDataRanges();
        this.applyFilters();

        // Reconnect to any in-progress detection run
        this.reconnectToActiveRun();
    }

    /**
     * Check if there's an in-progress detection run and reconnect to its
     * progress subscription. This handles the case where the user navigated
     * away and came back while a run was active.
     */
    private reconnectToActiveRun(): void {
        if (this.IsDetecting) return; // Already tracking a run

        const activeRun = this.Runs.find(r => r.ProcessingStatus === 'In Progress');
        if (!activeRun) return;

        LogStatus(`[DuplicateDetection] Reconnecting to in-progress run ${activeRun.ID}`);
        this.IsDetecting = true;
        this.DetectionProgress = 0;
        this.DetectionStage = 'Reconnecting...';
        this.cdr.detectChanges();
        this.subscribeToPipelineProgress(activeRun.ID);
    }

    /**
     * Trigger a new duplicate detection run by creating a DuplicateRun entity.
     * The server hook auto-triggers detection when a run is saved with EndedAt === null.
     */
    public async RunDetection(): Promise<void> {
        if (this.IsDetecting || !this.SelectedEntityDocumentID) return;

        const selectedDoc = this.EntityDocuments.find(d => UUIDsEqual(d.ID, this.SelectedEntityDocumentID));
        if (!selectedDoc) return;

        this.IsDetecting = true;
        this.DetectionProgress = 0;
        this.DetectionStage = 'Initializing...';
        this.DetectionCurrentItem = '';
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const dupeRun = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs');
            dupeRun.NewRecord();

            // Look up the EntityID from the entity document's entity name
            const entityInfo = md.Entities.find(e => e.Name === selectedDoc.EntityName);
            if (!entityInfo) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Entity "${selectedDoc.EntityName}" not found in metadata`, 'error', 5000
                );
                this.IsDetecting = false;
                this.DetectionStage = '';
                this.cdr.detectChanges();
                return;
            }

            // DD-1: Track whether merging is available for the selected entity
            this.MergeEnabled = entityInfo.AllowRecordMerge;
            this.ShowMergeWarningBanner = !entityInfo.AllowRecordMerge;

            dupeRun.EntityID = entityInfo.ID;

            dupeRun.StartedByUserID = this.ProviderToUse.CurrentUser.ID;
            dupeRun.StartedAt = new Date();
            dupeRun.ProcessingStatus = 'In Progress';
            dupeRun.ApprovalStatus = 'Pending';

            const saved = await dupeRun.Save();
            if (!saved) {
                console.error('Failed to create duplicate run:', dupeRun.LatestResult?.Message || 'unknown error');
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to start detection: ${dupeRun.LatestResult?.Message || 'unknown error'}`,
                    'error', 5000
                );
                this.IsDetecting = false;
                this.DetectionStage = '';
                this.cdr.detectChanges();
                return;
            }

            this.detectionActivityID = this.activityService.Start('Duplicate detection', {
                icon: 'fa-solid fa-clone',
                detail: selectedDoc.EntityName,
                progress: 0,
            });
            // Subscribe to progress using the run ID as PipelineRunID
            this.subscribeToPipelineProgress(dupeRun.ID);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[DuplicateDetection] Error starting detection:', msg);
            this.IsDetecting = false;
            this.DetectionStage = '';
            this.cdr.detectChanges();
        }
    }

    /**
     * Approves all matches within a duplicate group by updating each match's ApprovalStatus.
     */
    public async ApproveMatch(group: DuplicateGroup): Promise<void> {
        await this.updateGroupApprovalStatus(group, 'Approved');
    }

    /**
     * Rejects all matches within a duplicate group by updating each match's ApprovalStatus.
     */
    public async RejectMatch(group: DuplicateGroup): Promise<void> {
        await this.updateGroupApprovalStatus(group, 'Rejected');
    }

    // ════════════════════════════════════════════
    // Drag and Drop
    // ════════════════════════════════════════════

    /** The group currently being dragged */
    public DraggedGroup: DuplicateGroup | null = null;
    /** Which column is being dragged over (for highlight) */
    public DragOverColumn: 'Pending' | 'Approved' | 'Rejected' | null = null;

    public OnDragStart(event: DragEvent, group: DuplicateGroup): void {
        this.DraggedGroup = group;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', group.DetailId);
        }
        // Add a slight delay so the drag ghost renders before we add the dragging class
        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    public OnDragEnd(): void {
        this.DraggedGroup = null;
        this.DragOverColumn = null;
        this.cdr.detectChanges();
    }

    public OnDragOver(event: DragEvent, column: 'Pending' | 'Approved' | 'Rejected'): void {
        event.preventDefault(); // Required to allow drop
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        if (this.DragOverColumn !== column) {
            this.DragOverColumn = column;
            this.cdr.detectChanges();
        }
    }

    public OnDragLeave(event: DragEvent, column: 'Pending' | 'Approved' | 'Rejected'): void {
        // Only clear if leaving the column (not entering a child element)
        const related = event.relatedTarget as HTMLElement;
        const columnEl = (event.currentTarget as HTMLElement);
        if (!columnEl.contains(related)) {
            if (this.DragOverColumn === column) {
                this.DragOverColumn = null;
                this.cdr.detectChanges();
            }
        }
    }

    public async OnDrop(event: DragEvent, targetStatus: 'Pending' | 'Approved' | 'Rejected'): Promise<void> {
        event.preventDefault();
        this.DragOverColumn = null;

        if (!this.DraggedGroup) return;
        if (this.DraggedGroup.ApprovalStatus === targetStatus) {
            this.DraggedGroup = null;
            this.cdr.detectChanges();
            return; // Already in this column
        }

        const group = this.DraggedGroup;
        this.DraggedGroup = null;
        await this.updateGroupApprovalStatus(group, targetStatus);
    }

    /** Whether a card is currently being dragged */
    public get IsDragging(): boolean {
        return this.DraggedGroup !== null;
    }

    /** Handle filter changes with debounce */
    public OnFilterChange(): void {
        this.filterSubject.next();
    }

    /** Computed range bounds from actual data — used as min/max/placeholder for filter inputs */
    public DataMinScore = 0;
    public DataMaxScore = 1;
    public DataMinDate = '';
    public DataMaxDate = '';

    /** Compute the actual data ranges from AllGroups */
    private computeDataRanges(): void {
        if (this.AllGroups.length === 0) {
            this.DataMinScore = 0;
            this.DataMaxScore = 1;
            this.DataMinDate = '';
            this.DataMaxDate = '';
            return;
        }

        let minScore = 1, maxScore = 0;
        let minDate: Date | null = null, maxDate: Date | null = null;

        for (const group of this.AllGroups) {
            if (group.HighestScore < minScore) minScore = group.HighestScore;
            if (group.HighestScore > maxScore) maxScore = group.HighestScore;
            const d = new Date(group.MatchedAt);
            if (!isNaN(d.getTime())) {
                if (!minDate || d < minDate) minDate = d;
                if (!maxDate || d > maxDate) maxDate = d;
            }
        }

        this.DataMinScore = Math.floor(minScore * 100) / 100;
        this.DataMaxScore = Math.ceil(maxScore * 100) / 100;
        this.DataMinDate = minDate ? this.toInputDate(minDate) : '';
        this.DataMaxDate = maxDate ? this.toInputDate(maxDate) : '';

        // Leave filters empty by default — no filtering until user explicitly sets values
        this.Filters.MinScore = 0;
        this.Filters.MaxScore = 1;
        this.Filters.DateFrom = '';
        this.Filters.DateTo = '';
    }

    /** Format a Date to YYYY-MM-DD for input[type=date] using local time */
    private toInputDate(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /** Clear all filters */
    public ClearFilters(): void {
        this.Filters = {
            EntityName: this.EntityNames.length === 1 ? this.EntityNames[0] : '',
            MinScore: 0,
            MaxScore: 1,
            DateFrom: '',
            DateTo: '',
        };
        this.applyFilters();
    }

    /** Returns the CSS class for a match score indicator */
    public GetScoreClass(score: number): string {
        if (score > 0.9) return 'score-high';
        if (score >= 0.7) return 'score-medium';
        return 'score-low';
    }

    /** Returns a human-readable label for a match score */
    public GetScoreLabel(score: number): string {
        if (score > 0.9) return 'High';
        if (score >= 0.7) return 'Medium';
        return 'Low';
    }

    /** Format a date for display */
    /**
     * Format a composite key string (e.g., "ID|5A07433E-F36B-1410-8AA5-00F1597429B5")
     * into a readable format. For single-key entities, shows just the value truncated.
     * For composite keys, shows key: value pairs.
     */
    /** Whether there are any non-skipped matches available for merging */
    public get HasMergeableMatches(): boolean {
        return this.ComparisonMatches.some(m => m.Match.ApprovalStatus !== 'Rejected');
    }

    public FormatRecordID(recordID: string): string {
        if (!recordID) return '';
        const pairs = recordID.split('||');
        if (pairs.length === 1) {
            // Single key — extract just the value
            const parts = pairs[0].split('|');
            if (parts.length === 2) {
                const val = parts[1];
                // Truncate long UUIDs
                return val.length > 12 ? val.substring(0, 8) + '...' : val;
            }
            return recordID.length > 12 ? recordID.substring(0, 8) + '...' : recordID;
        }
        // Composite key — show key: truncated value pairs
        return pairs.map(p => {
            const parts = p.split('|');
            if (parts.length === 2) {
                const val = parts[1].length > 8 ? parts[1].substring(0, 8) + '...' : parts[1];
                return `${parts[0]}: ${val}`;
            }
            return p;
        }).join(', ');
    }

    public FormatDate(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** Whether any filters are active */
    public get HasActiveFilters(): boolean {
        return (this.EntityNames.length > 1 && this.Filters.EntityName !== '') ||
            this.Filters.MinScore > 0 ||
            (this.Filters.MaxScore > 0 && this.Filters.MaxScore < 1) ||
            this.Filters.DateFrom !== '' ||
            this.Filters.DateTo !== '';
    }

    // ---- Private Methods ----

    private setupFilterDebounce(): void {
        this.filterSubject.pipe(
            debounceTime(300),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.applyFilters();
        });
    }

    /** Build entity document options from KnowledgeHubMetadataEngine cached entities */
    private buildEntityDocumentOptionsFromEngine(docs: MJEntityDocumentEntity[]): void {
        this.EntityDocuments = docs.map(d => ({
            ID: d.ID,
            Name: d.Name ?? 'Unnamed',
            EntityName: d.Entity ?? '',
            PotentialMatchThreshold: this.normalizeDupeThreshold(d.PotentialMatchThreshold, 0.70),
            AbsoluteMatchThreshold: this.normalizeDupeThreshold(d.AbsoluteMatchThreshold, 0.95)
        }));

        // Auto-select the first entity document if available
        if (this.EntityDocuments.length > 0 && !this.SelectedEntityDocumentID) {
            this.SelectedEntityDocumentID = this.EntityDocuments[0].ID;
        }
    }

    /** Subscribe to PipelineProgress for a specific detection run */
    /**
     * Normalizes a duplicate threshold value — treats null, undefined, 0, and 1.0
     * as "not configured" and falls back to a sensible default.
     * Thresholds of exactly 1.0 mean "100% match only" which is effectively useless
     * for real-world duplicate detection.
     */
    private normalizeDupeThreshold(value: number | null | undefined, fallback: number): number {
        if (value == null || value <= 0 || value >= 1.0) {
            return fallback;
        }
        return value;
    }

    /** Handle potential threshold slider change */
    public OnPotentialThresholdChanged(value: number): void {
        this.RunPotentialThreshold = value;
    }

    /** Handle absolute threshold slider change */
    public OnAbsoluteThresholdChanged(value: number): void {
        this.RunAbsoluteThreshold = value;
    }

    private subscribeToPipelineProgress(pipelineRunID: string): void {
        const provider = this.ProviderToUse as GraphQLDataProvider;
        const subscriptionQuery = `
            subscription PipelineProgress($pipelineRunID: String!) {
                PipelineProgress(pipelineRunID: $pipelineRunID) {
                    PipelineRunID
                    Stage
                    TotalItems
                    ProcessedItems
                    CurrentItem
                    PercentComplete
                    ElapsedMs
                }
            }
        `;

        let idleTimer: ReturnType<typeof setTimeout> | null = null;

        const finishDetection = (success: boolean) => {
            if (idleTimer) clearTimeout(idleTimer);
            rxSub?.unsubscribe();

            Promise.resolve().then(async () => {
                this.IsDetecting = false;
                this.DetectionStage = success ? 'Complete' : 'Error';
                this.DetectionProgress = success ? 100 : 0;
                if (this.detectionActivityID) {
                    this.activityService.Complete(this.detectionActivityID, success ? 'success' : 'error');
                    this.detectionActivityID = null;
                }

                if (success) {
                    await this.LoadData();
                }
                this.cdr.detectChanges();
            });
        };

        const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (this.IsDetecting) {
                    finishDetection(true);
                }
            }, 60000); // 60s timeout for duplicate detection (can be very long)
        };

        resetIdleTimer();

        // Reset phase tracking for this new subscription
        this.detectionRawStage = '';

        const sub = provider.subscribe(subscriptionQuery, { pipelineRunID });
        const rxSub = sub.pipe(takeUntil(this.destroy$)).subscribe({
            next: (data: Record<string, unknown>) => {
                const progress = (data as Record<string, Record<string, unknown>>)['PipelineProgress'];
                if (!progress) return;

                const stage = progress['Stage'] as string;
                const pct = Math.max(0, Math.min(100, progress['PercentComplete'] as number));
                const currentItem = progress['CurrentItem'] as string | undefined;

                // Detect phase transitions vs. within-phase updates
                const isNewPhase = stage !== this.detectionRawStage;
                if (isNewPhase) {
                    // New phase: reset progress and update display
                    this.detectionRawStage = stage;
                    this.DetectionProgress = pct;
                    this.DetectionStage = this.formatDetectionStage(stage);
                } else {
                    // Same phase: only move forward (never backward)
                    if (pct >= this.DetectionProgress) {
                        this.DetectionProgress = pct;
                    }
                }

                this.DetectionCurrentItem = currentItem ?? '';
                this.cdr.detectChanges();

                if (stage === 'complete') {
                    finishDetection(true);
                } else if (stage === 'error') {
                    finishDetection(false);
                } else {
                    resetIdleTimer();
                }
            },
            error: (err: unknown) => {
                console.error('[DuplicateDetection] Pipeline subscription error:', err);
                finishDetection(false);
            }
        });
    }

    /** Format detection stage names for display */
    private formatDetectionStage(stage: string): string {
        const stageMap: Record<string, string> = {
            'vectorize': 'Vectorizing records',
            'autotag': 'Analyzing matches',
            'extract': 'Querying vector database',
            'complete': 'Complete',
            'error': 'Error'
        };
        return stageMap[stage] ?? stage;
    }

    /** Extract unique entity names from loaded runs */
    private extractEntityNames(): void {
        const nameSet = new Set<string>();
        // Extract from runs first
        for (const run of this.Runs) {
            if (run.Entity) {
                nameSet.add(run.Entity);
            }
        }
        // Also extract from groups (covers cases where runs failed but details/matches exist)
        for (const group of this.AllGroups) {
            if (group.EntityName && group.EntityName !== 'Unknown') {
                nameSet.add(group.EntityName);
            }
        }
        this.EntityNames = Array.from(nameSet).sort();

        // Auto-select if only one entity — no point showing "All Entities" for a single option
        if (this.EntityNames.length === 1) {
            this.Filters.EntityName = this.EntityNames[0];
        }
    }

    /**
     * Build DuplicateGroup objects by joining details to their matches,
     * and resolving the entity name from the parent run.
     */
    private buildGroups(): void {
        const runMap = new Map<string, MJDuplicateRunEntity>();
        for (const run of this.Runs) {
            runMap.set(run.ID, run);
        }

        const matchesByDetail = new Map<string, MJDuplicateRunDetailMatchEntity[]>();
        for (const match of this.Matches) {
            const key = match.DuplicateRunDetailID;
            const existing = matchesByDetail.get(key);
            if (existing) {
                existing.push(match);
            } else {
                matchesByDetail.set(key, [match]);
            }
        }

        this.AllGroups = [];
        for (const detail of this.Details) {
            const detailMatches = matchesByDetail.get(detail.ID);
            if (!detailMatches || detailMatches.length === 0) {
                continue; // Skip details with no matches
            }

            const run = runMap.get(detail.DuplicateRunID);
            const highestScore = this.computeHighestScore(detailMatches);
            const dominantStatus = this.computeDominantApprovalStatus(detailMatches);
            const latestMatchDate = this.computeLatestMatchDate(detailMatches);

            // Parse source record metadata (stored as JSON by the detector)
            const metadata = this.parseRecordMetadata(detail.RecordMetadata);
            const entityName = metadata.Entity || run?.Entity || 'Unknown';
            const entityIcon = metadata.EntityIcon || 'fa-solid fa-database';
            const recordName = this.resolveRecordName(metadata, entityName, detail.RecordID);

            // Build top match summaries from match metadata
            const topMatchSummaries = this.buildTopMatchSummaries(detailMatches, 3);

            this.AllGroups.push({
                DetailId: detail.ID,
                RunId: detail.DuplicateRunID,
                RecordId: detail.RecordID,
                EntityName: entityName,
                EntityIcon: entityIcon,
                RecordName: recordName,
                ApprovalStatus: dominantStatus,
                MatchCount: detailMatches.length,
                HighestScore: highestScore,
                Matches: detailMatches,
                MatchedAt: latestMatchDate,
                Metadata: metadata,
                TopMatchSummaries: topMatchSummaries,
            });
        }
    }

    /** Find the highest match probability across a set of matches */
    private computeHighestScore(matches: MJDuplicateRunDetailMatchEntity[]): number {
        let max = 0;
        for (const m of matches) {
            if (m.MatchProbability > max) {
                max = m.MatchProbability;
            }
        }
        return max;
    }

    // ════════════════════════════════════════════
    // Comparison Panel
    // ════════════════════════════════════════════

    /** Open the comparison slide-in panel for a group — loads real entity records */
    public async OpenComparison(group: DuplicateGroup): Promise<void> {
        this.ComparisonGroup = group;
        this.ComparisonShowAllFields = true;
        this.SurvivorColumnIndex = 0;
        this.ComparisonClosing = false;
        this.ComparisonLoading = true;
        this.ComparisonFields = [];
        this.ComparisonMatches = [];
        this.comparisonRecords.clear();
        this.ComparisonDependencies.clear();
        this.DepsExpandedColumns.clear();
        this.depsEntityGroupExpanded.clear();
        this.ShowMergeConfirm = false;
        this.LLMReasoningExpandedColumns.clear();
        this.LLMProposalsApplied = false;
        this.cdr.detectChanges();

        // Load actual entity records and dependencies in parallel
        await Promise.all([
            this.loadComparisonRecords(group),
            this.loadComparisonDependencies(group)
        ]);
        this.buildComparisonData();
        // Preload the LLM-proposed survivor + per-field choices into the existing selection state
        this.applyLLMProposals();
        this.ComparisonLoading = false;
        this.cdr.detectChanges();
    }

    /** Close the comparison panel with slide-out animation */
    public CloseComparison(): void {
        this.ShowMergeConfirm = false;
        this.ComparisonClosing = true;
        this.cdr.detectChanges();
        setTimeout(() => {
            this.ComparisonGroup = null;
            this.ComparisonClosing = false;
            this.ComparisonFields = [];
            this.ComparisonMatches = [];
            this.ComparisonDependencies.clear();
            this.DepsExpandedColumns.clear();
        this.depsEntityGroupExpanded.clear();
            this.LLMReasoningExpandedColumns.clear();
            this.LLMProposalsApplied = false;
            this.cdr.detectChanges();
        }, 250);
    }

    /** Get visible fields based on the toggle state */
    public GetVisibleFields(): ComparisonFieldRow[] {
        return this.ComparisonShowAllFields
            ? this.ComparisonFields
            : this.ComparisonFields.filter(f => f.HasDifference);
    }

    /** Case-insensitive, trimmed comparison of two field values */
    public AreValuesEqual(a: string | undefined, b: string | undefined): boolean {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    }

    /** Set the surviving record column index */
    public SetSurvivor(columnIndex: number): void {
        this.SurvivorColumnIndex = columnIndex;
        // When switching survivor, reset all field selections to the new survivor
        for (const field of this.ComparisonFields) {
            field.SelectedColumnIndex = columnIndex;
        }
        this.cdr.detectChanges();
    }

    /** Select all field values from a specific column */
    public UseAllFieldsFrom(columnIndex: number): void {
        for (const field of this.ComparisonFields) {
            // Only select if the column has a value for this field
            const val = columnIndex === 0 ? field.SourceValue : field.MatchValues[columnIndex - 1];
            if (val != null) {
                field.SelectedColumnIndex = columnIndex;
            }
        }
        this.cdr.detectChanges();
    }

    /** Select a specific field value from a column */
    public SelectFieldValue(field: ComparisonFieldRow, columnIndex: number): void {
        field.SelectedColumnIndex = columnIndex;
        this.cdr.detectChanges();
    }

    /** Check if all fields are selected from a given column */
    public AllFieldsSelectedFrom(columnIndex: number): boolean {
        return this.ComparisonFields.every(f => f.SelectedColumnIndex === columnIndex);
    }

    /** Count how many fields are cherry-picked from non-survivor columns */
    public CherryPickedCount(): number {
        return this.ComparisonFields.filter(f => f.SelectedColumnIndex !== this.SurvivorColumnIndex).length;
    }

    /** Get the name of the surviving record */
    public SurvivorName(): string {
        if (!this.ComparisonGroup) return '';
        if (this.SurvivorColumnIndex === 0) return this.ComparisonGroup.RecordName;
        const match = this.ComparisonMatches[this.SurvivorColumnIndex - 1];
        return match?.Name || 'Unknown';
    }

    /** Get the primary key display string for the surviving record */
    public SurvivorKeyDisplay(): string {
        if (!this.ComparisonGroup) return '';
        const keyStr = this.getCompositeKeyStringForColumn(this.SurvivorColumnIndex);
        if (!keyStr) return '';
        const ck = new CompositeKey();
        ck.LoadFromConcatenatedString(keyStr);
        return ck.KeyValuePairs.map(kv => `${kv.FieldName}: ${kv.Value}`).join(', ');
    }

    // ════════════════════════════════════════════
    // Dependencies
    // ════════════════════════════════════════════

    /** Get dependencies for a column (0 = source, 1+ = match index) */
    public GetDepsForColumn(columnIndex: number): RecordDependency[] {
        const keyStr = this.getCompositeKeyStringForColumn(columnIndex);
        return keyStr ? (this.ComparisonDependencies.get(keyStr) ?? []) : [];
    }

    /** Get deps grouped by related entity for a column */
    public GetGroupedDeps(columnIndex: number): Array<{ Entity: string; Count: number }> {
        const deps = this.GetDepsForColumn(columnIndex);
        const grouped = new Map<string, number>();
        for (const dep of deps) {
            const name = dep.RelatedEntityName;
            grouped.set(name, (grouped.get(name) ?? 0) + 1);
        }
        return Array.from(grouped.entries())
            .map(([Entity, Count]) => ({ Entity, Count }))
            .sort((a, b) => b.Count - a.Count);
    }

    /** Cached dependent records loaded on demand, keyed by "columnIndex::entityName" */
    private depRecordsCache = new Map<string, Array<{ Name: string; PrimaryKey: CompositeKey; EntityName: string }>>();
    /** Tracks which entity groups are currently loading */
    private depRecordsLoading = new Set<string>();

    /** Get cached dependent records for an entity group (empty until expanded and loaded) */
    public GetDepRecords(columnIndex: number, entityName: string): Array<{ Name: string; PrimaryKey: CompositeKey; EntityName: string }> {
        return this.depRecordsCache.get(`${columnIndex}::${entityName}`) ?? [];
    }

    /** Check if dep records are loading for an entity group */
    public IsDepRecordsLoading(columnIndex: number, entityName: string): boolean {
        return this.depRecordsLoading.has(`${columnIndex}::${entityName}`);
    }

    /** Navigate to a dependent record */
    public OpenDepRecord(record: { EntityName: string; PrimaryKey: CompositeKey }): void {
        if (record.PrimaryKey) {
            this.navigationService.OpenEntityRecord(record.EntityName, record.PrimaryKey);
        }
    }

    /** Toggle expanded state for a specific entity group — lazy-loads records on first expand */
    public async ToggleDepEntityGroup(columnIndex: number, entityName: string): Promise<void> {
        const key = `${columnIndex}::${entityName}`;
        if (this.depsEntityGroupExpanded.has(key)) {
            this.depsEntityGroupExpanded.delete(key);
            this.cdr.detectChanges();
            return;
        }

        this.depsEntityGroupExpanded.add(key);
        this.cdr.detectChanges();

        // Lazy-load actual dependent records on first expand
        if (!this.depRecordsCache.has(key)) {
            await this.loadDepRecordsForGroup(columnIndex, entityName);
        }
    }

    /** Load dependent records for an entity group via RunView */
    private async loadDepRecordsForGroup(columnIndex: number, relatedEntityName: string): Promise<void> {
        const key = `${columnIndex}::${relatedEntityName}`;
        this.depRecordsLoading.add(key);
        this.cdr.detectChanges();

        try {
            // Get the FK field name from the dependency info
            const deps = this.GetDepsForColumn(columnIndex)
                .filter(d => d.RelatedEntityName === relatedEntityName);
            if (deps.length === 0) return;

            const dep = deps[0];
            const fkFieldName = dep.FieldName;

            // Get the parent record's primary key value from the column's composite key string
            const keyStr = this.getCompositeKeyStringForColumn(columnIndex);
            if (!keyStr) return;
            const parentCK = new CompositeKey();
            parentCK.LoadFromConcatenatedString(keyStr);
            const parentKeyValue = parentCK.KeyValuePairs[0]?.Value;
            if (!parentKeyValue) return;

            // Query the related entity for records pointing at this parent via the FK field
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const md = this.ProviderToUse;
            const relatedEntityInfo = md.Entities.find(e => e.Name === relatedEntityName);
            const nameField = relatedEntityInfo?.NameField;
            const pkFieldName = relatedEntityInfo?.FirstPrimaryKey?.Name || 'ID';

            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: relatedEntityName,
                ExtraFilter: `${fkFieldName}='${parentKeyValue}'`,
                Fields: nameField ? [pkFieldName, nameField.Name] : [pkFieldName],
                MaxRows: 50,
                ResultType: 'simple',
            });

            const records: Array<{ Name: string; PrimaryKey: CompositeKey; EntityName: string }> = [];
            if (result.Success && result.Results) {
                for (const row of result.Results) {
                    const pk = new CompositeKey([{ FieldName: pkFieldName, Value: String(row[pkFieldName] || '') }]);
                    const name = nameField ? String(row[nameField.Name] || '') : String(row[pkFieldName] || '');
                    records.push({ Name: name || pk.Values(), PrimaryKey: pk, EntityName: relatedEntityName });
                }
            }
            this.depRecordsCache.set(key, records);
        } catch (error) {
            console.warn('[DuplicateDetection] Error loading dep records:', error);
            this.depRecordsCache.set(key, []);
        } finally {
            this.depRecordsLoading.delete(key);
            this.cdr.detectChanges();
        }
    }

    /** Check if a specific entity group is expanded */
    public IsDepEntityGroupExpanded(columnIndex: number, entityName: string): boolean {
        return this.depsEntityGroupExpanded.has(`${columnIndex}::${entityName}`);
    }

    /** Get total dependency count for a column */
    public GetTotalDeps(columnIndex: number): number {
        return this.GetDepsForColumn(columnIndex).length;
    }

    /** Toggle expanded state for dependency details in a column */
    public ToggleDepsExpanded(columnIndex: number): void {
        if (this.DepsExpandedColumns.has(columnIndex)) {
            this.DepsExpandedColumns.delete(columnIndex);
        } else {
            this.DepsExpandedColumns.add(columnIndex);
        }
        this.cdr.detectChanges();
    }

    /** Check if dependency details are expanded for a column */
    public IsDepsExpanded(columnIndex: number): boolean {
        return this.DepsExpandedColumns.has(columnIndex);
    }

    /** Get the column index with the most dependencies */
    public GetMaxDepsColumnIndex(): number {
        let maxDeps = -1;
        let maxIndex = 0;
        const totalColumns = 1 + this.ComparisonMatches.length;
        for (let i = 0; i < totalColumns; i++) {
            const count = this.GetTotalDeps(i);
            if (count > maxDeps) {
                maxDeps = count;
                maxIndex = i;
            }
        }
        return maxIndex;
    }

    /** Get the composite key string for a column index */
    private getCompositeKeyStringForColumn(columnIndex: number): string | null {
        if (!this.ComparisonGroup) return null;
        if (columnIndex === 0) return this.ComparisonGroup.RecordId;
        const match = this.ComparisonMatches[columnIndex - 1];
        return match?.Match.MatchRecordID ?? null;
    }

    /** Get the name for a column index */
    public GetColumnName(columnIndex: number): string {
        if (!this.ComparisonGroup) return '';
        if (columnIndex === 0) return this.ComparisonGroup.RecordName;
        const match = this.ComparisonMatches[columnIndex - 1];
        return match?.Name ?? 'Unknown';
    }

    // ════════════════════════════════════════════
    // LLM Reasoning Display (additive — vector-only path unaffected when no LLM data)
    // ════════════════════════════════════════════

    /**
     * Decide whether the LLM verdict contradicts the vector score for a match.
     * The classic disagreement is a strong vector match the LLM flags as NotDuplicate,
     * or a weak vector pair the LLM nonetheless wants to Merge. Returns false when
     * reasoning never ran (recommendation null) so existing groups never light up.
     */
    private computeDisagreement(recommendation: LLMRecommendation | null, vectorScore: number): boolean {
        if (recommendation == null) return false;
        if (recommendation === 'NotDuplicate' && vectorScore >= 0.7) return true;
        if (recommendation === 'Merge' && vectorScore < 0.7) return true;
        return false;
    }

    /** True when ANY match in the current comparison carries LLM reasoning data */
    public get HasAnyLLMData(): boolean {
        return this.ComparisonMatches.some(m => m.LLMRecommendation != null);
    }

    /** CSS class for an LLM recommendation badge */
    public GetLLMRecommendationClass(recommendation: LLMRecommendation | null): string {
        switch (recommendation) {
            case 'Merge': return 'llm-rec-merge';
            case 'NotDuplicate': return 'llm-rec-notduplicate';
            case 'Uncertain': return 'llm-rec-uncertain';
            default: return '';
        }
    }

    /** Font Awesome icon class for an LLM recommendation */
    public GetLLMRecommendationIcon(recommendation: LLMRecommendation | null): string {
        switch (recommendation) {
            case 'Merge': return 'fa-code-merge';
            case 'NotDuplicate': return 'fa-not-equal';
            case 'Uncertain': return 'fa-circle-question';
            default: return 'fa-robot';
        }
    }

    /** Human-readable label for an LLM recommendation */
    public GetLLMRecommendationLabel(recommendation: LLMRecommendation | null): string {
        switch (recommendation) {
            case 'Merge': return 'AI: Merge';
            case 'NotDuplicate': return 'AI: Not a duplicate';
            case 'Uncertain': return 'AI: Uncertain';
            default: return '';
        }
    }

    /** Toggle the expanded state of a match column's LLM reasoning text */
    public ToggleLLMReasoning(columnIndex: number): void {
        if (this.LLMReasoningExpandedColumns.has(columnIndex)) {
            this.LLMReasoningExpandedColumns.delete(columnIndex);
        } else {
            this.LLMReasoningExpandedColumns.add(columnIndex);
        }
        this.cdr.detectChanges();
    }

    /** Whether a match column's LLM reasoning is currently expanded */
    public IsLLMReasoningExpanded(columnIndex: number): boolean {
        return this.LLMReasoningExpandedColumns.has(columnIndex);
    }

    // ════════════════════════════════════════════
    // LLM Proposal Preload (proposed survivor + per-field choices)
    // ════════════════════════════════════════════

    /**
     * Preload the LLM-proposed survivor record and per-field choices into the
     * existing selection state. Fully additive: no-op when no match carries a
     * proposal, so the user's manual selection is the default in vector-only runs.
     */
    private applyLLMProposals(): void {
        if (!this.ComparisonGroup) return;
        const proposingMatch = this.ComparisonGroup.Matches.find(m => m.LLMProposedSurvivorRecordID);
        if (!proposingMatch) return;

        // 1. Resolve the proposed survivor record ID to a column index and set it.
        const survivorColumn = this.resolveColumnForRecordId(proposingMatch.LLMProposedSurvivorRecordID);
        if (survivorColumn != null) {
            this.SetSurvivor(survivorColumn);
        }

        // 2. Overlay per-field choices from the proposed field map (overrides the survivor default per field).
        this.applyProposedFieldMap(proposingMatch.LLMProposedFieldMap);

        this.LLMProposalsApplied = true;
    }

    /** Parse the proposed field map JSON and set each field's SelectedColumnIndex to the proposed source column */
    private applyProposedFieldMap(fieldMapJson: string | null): void {
        const choices = this.parseProposedFieldMap(fieldMapJson);
        for (const choice of choices) {
            const column = this.resolveColumnForRecordId(choice.SourceRecordID);
            if (column == null) continue;
            const row = this.ComparisonFields.find(f => f.FieldName === choice.FieldName);
            if (row) {
                row.SelectedColumnIndex = column;
            }
        }
    }

    /** Parse LLMProposedFieldMap into typed {FieldName, SourceRecordID} entries (lenient about null/garbage) */
    private parseProposedFieldMap(json: string | null): Array<{ FieldName: string; SourceRecordID: string }> {
        if (!json) return [];
        try {
            const parsed: unknown = JSON.parse(json);
            if (!Array.isArray(parsed)) return [];
            const result: Array<{ FieldName: string; SourceRecordID: string }> = [];
            for (const entry of parsed) {
                if (entry && typeof entry === 'object') {
                    const rec = entry as Record<string, unknown>;
                    const fieldName = rec['FieldName'];
                    const sourceRecordId = rec['SourceRecordID'];
                    if (typeof fieldName === 'string' && typeof sourceRecordId === 'string') {
                        result.push({ FieldName: fieldName, SourceRecordID: sourceRecordId });
                    }
                }
            }
            return result;
        } catch {
            return [];
        }
    }

    /**
     * Map a record ID (URL-segment composite key, may equal the source) to a column index.
     * Column 0 is the source; columns 1..N are matches. Uses case-insensitive comparison
     * because UUIDs differ in case across SQL Server (upper) and PostgreSQL (lower).
     */
    private resolveColumnForRecordId(recordId: string | null): number | null {
        if (!recordId) return null;
        const target = recordId.toLowerCase();
        const totalColumns = 1 + this.ComparisonMatches.length;
        for (let i = 0; i < totalColumns; i++) {
            const keyStr = this.getCompositeKeyStringForColumn(i);
            if (keyStr && keyStr.toLowerCase() === target) {
                return i;
            }
        }
        return null;
    }

    // ════════════════════════════════════════════
    // ════════════════════════════════════════════
    // Merge Confirmation
    // ════════════════════════════════════════════

    /** Open the merge confirmation panel */
    public OpenMergeConfirm(): void {
        this.ShowMergeConfirm = true;
        this.cdr.detectChanges();
    }

    /** Close the merge confirmation panel */
    public CloseMergeConfirm(): void {
        this.ShowMergeConfirm = false;
        this.cdr.detectChanges();
    }

    /** Get the list of cherry-picked field overrides (fields picked from non-survivor columns) */
    public GetCherryPickedFields(): Array<{ FieldName: string; DisplayName: string; Value: string; SourceName: string }> {
        return this.ComparisonFields
            .filter(f => f.SelectedColumnIndex !== this.SurvivorColumnIndex)
            .map(f => {
                const value = f.SelectedColumnIndex === 0
                    ? f.SourceValue
                    : f.MatchValues[f.SelectedColumnIndex - 1];
                return {
                    FieldName: f.FieldName,
                    DisplayName: f.DisplayName,
                    Value: value ?? '(empty)',
                    SourceName: this.GetColumnName(f.SelectedColumnIndex)
                };
            });
    }

    /** Get non-surviving columns with their dependency counts */
    /** Get non-surviving columns excluding skipped (Rejected) matches for merge confirmation display */
    public GetNonSurvivorColumns(): Array<{ ColumnIndex: number; Name: string; DepCount: number }> {
        const result: Array<{ ColumnIndex: number; Name: string; DepCount: number }> = [];
        const totalColumns = 1 + this.ComparisonMatches.length;
        for (let i = 0; i < totalColumns; i++) {
            if (i === this.SurvivorColumnIndex) continue;
            // Skip records marked as Rejected/Skipped
            if (i > 0) {
                const matchInfo = this.ComparisonMatches[i - 1];
                if (matchInfo?.Match?.ApprovalStatus === 'Rejected') continue;
            }
            result.push({
                ColumnIndex: i,
                Name: this.GetColumnName(i),
                DepCount: this.GetTotalDeps(i)
            });
        }
        return result;
    }

    /** Execute the merge operation */
    public async ExecuteMerge(): Promise<void> {
        if (!this.ComparisonGroup || this.IsMerging) return;

        this.IsMerging = true;
        this.cdr.detectChanges();

        try {
            const request = new RecordMergeRequest();
            request.EntityName = this.ComparisonGroup.EntityName;

            // Build surviving record composite key
            const survivorKeyStr = this.getCompositeKeyStringForColumn(this.SurvivorColumnIndex);
            if (!survivorKeyStr) return;
            const survivorKey = new CompositeKey();
            survivorKey.SimpleLoadFromURLSegment(survivorKeyStr);
            request.SurvivingRecordCompositeKey = survivorKey;

            // Build records to merge (non-survivors)
            request.RecordsToMerge = this.buildNonSurvivorKeys();

            // Build field map for cherry-picked fields
            const cherryPicked = this.GetCherryPickedFields();
            if (cherryPicked.length > 0) {
                request.FieldMap = cherryPicked.map(f => ({
                    FieldName: f.FieldName,
                    Value: f.Value
                }));
            }

            const result = await this.ProviderToUse.MergeRecords(request);

            if (result.Success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Successfully merged ${request.RecordsToMerge.length + 1} records into one.`,
                    'success', 5000
                );
                // Close both panels and reload
                this.ShowMergeConfirm = false;
                this.ComparisonGroup = null;
                this.ComparisonFields = [];
                this.ComparisonMatches = [];
                this.ComparisonDependencies.clear();
                this.DepsExpandedColumns.clear();
        this.depsEntityGroupExpanded.clear();
                await this.LoadData();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Merge failed: ${result.OverallStatus}`,
                    'error', 5000
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[DuplicateDetection] Merge error:', msg);
            MJNotificationService.Instance.CreateSimpleNotification(
                `Merge error: ${msg}`,
                'error', 5000
            );
        } finally {
            this.IsMerging = false;
            this.cdr.detectChanges();
        }
    }

    /** Build CompositeKey array for non-surviving records */
    private buildNonSurvivorKeys(): CompositeKey[] {
        const keys: CompositeKey[] = [];
        const totalColumns = 1 + this.ComparisonMatches.length;
        for (let i = 0; i < totalColumns; i++) {
            if (i === this.SurvivorColumnIndex) continue;
            // Skip records that the user has marked as "Skipped" (Rejected)
            if (i > 0) {
                const matchInfo = this.ComparisonMatches[i - 1];
                if (matchInfo?.Match?.ApprovalStatus === 'Rejected') continue;
            }
            const keyStr = this.getCompositeKeyStringForColumn(i);
            if (keyStr) {
                const ck = new CompositeKey();
                ck.SimpleLoadFromURLSegment(keyStr);
                keys.push(ck);
            }
        }
        return keys;
    }

    /** Approve an individual match */
    public async ApproveIndividualMatch(matchInfo: ComparisonMatchInfo): Promise<void> {
        this.IsSaving = true;
        matchInfo.Match.ApprovalStatus = 'Approved';
        await matchInfo.Match.Save();
        this.IsSaving = false;
        this.cdr.detectChanges();
    }

    /** Reject an individual match (skip it from merge) */
    public async RejectIndividualMatch(matchInfo: ComparisonMatchInfo): Promise<void> {
        this.IsSaving = true;
        matchInfo.Match.ApprovalStatus = 'Rejected';
        await matchInfo.Match.Save();
        this.IsSaving = false;
        this.cdr.detectChanges();
    }

    /** Undo a rejected individual match (restore to Pending) */
    public async UndoRejectIndividualMatch(matchInfo: ComparisonMatchInfo): Promise<void> {
        this.IsSaving = true;
        matchInfo.Match.ApprovalStatus = 'Pending';
        await matchInfo.Match.Save();
        this.IsSaving = false;
        this.cdr.detectChanges();
    }

    /**
     * Load the actual entity records for the source + all matches in one RunView call.
     * Record IDs are stored as composite key strings (e.g., "ID|uuid") — we parse each
     * into a CompositeKey, generate WHERE clauses, and OR them together for one query.
     * Results stored in comparisonRecords map keyed by the composite key string.
     */
    private async loadComparisonRecords(group: DuplicateGroup): Promise<void> {
        this.comparisonRecords.clear();

        // Collect all composite key strings (source + matches)
        const keyStrings: string[] = [group.RecordId];
        for (const m of group.Matches) {
            if (m.MatchRecordID) {
                keyStrings.push(m.MatchRecordID);
            }
        }

        // Parse each into a CompositeKey and build WHERE clauses
        const whereClauses: string[] = [];
        for (const keyStr of keyStrings) {
            const ck = new CompositeKey();
            ck.SimpleLoadFromURLSegment(keyStr);
            if (ck.KeyValuePairs.length > 0) {
                whereClauses.push(`(${ck.ToWhereClause()})`);
            }
        }

        if (whereClauses.length === 0) return;

        // Single RunView with all records OR'd together
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: group.EntityName,
            ExtraFilter: whereClauses.join(' OR '),
            ResultType: 'simple',
        });

        if (result.Success && result.Results) {
            // Get entity info to know primary key field name
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === group.EntityName);
            const pkFieldName = entityInfo?.FirstPrimaryKey?.Name || 'ID';

            for (const record of result.Results) {
                const pkValue = String(record[pkFieldName] || '');
                // Store keyed by both raw PK value and the composite key string format
                this.comparisonRecords.set(pkValue, record);
                this.comparisonRecords.set(`${pkFieldName}|${pkValue}`, record);
            }
        }
    }

    /**
     * Load dependencies for all records (source + matches) in parallel.
     * Each record's deps are stored in ComparisonDependencies keyed by composite key string.
     */
    private async loadComparisonDependencies(group: DuplicateGroup): Promise<void> {
        const provider = this.ProviderToUse;
        const keyStrings: string[] = [group.RecordId];
        for (const m of group.Matches) {
            if (m.MatchRecordID) {
                keyStrings.push(m.MatchRecordID);
            }
        }

        const promises = keyStrings.map(async (keyStr) => {
            const ck = new CompositeKey();
            ck.SimpleLoadFromURLSegment(keyStr);
            if (ck.KeyValuePairs.length === 0) return;
            try {
                const deps = await provider.GetRecordDependencies(group.EntityName, ck);
                this.ComparisonDependencies.set(keyStr, deps);
            } catch (error) {
                console.warn(`[DuplicateDetection] Failed to load deps for ${keyStr}:`, error);
                this.ComparisonDependencies.set(keyStr, []);
            }
        });

        await Promise.all(promises);
    }

    /** Get the field value for a record from the loaded entity records map */
    private getRecordFieldValue(recordId: string, fieldName: string): string | undefined {
        // Try the composite key string directly (e.g., "ID|uuid")
        let record = this.comparisonRecords.get(recordId);
        if (!record) {
            // Try extracting just the value from "FieldName|Value" format
            const parts = recordId.split('|');
            const id = parts.length >= 2 ? parts[1] : parts[0];
            record = this.comparisonRecords.get(id);
        }
        if (!record) {
            // Case-insensitive search as a fallback (UUIDs may differ in case)
            const lower = recordId.toLowerCase();
            for (const [key, val] of this.comparisonRecords.entries()) {
                if (key.toLowerCase() === lower || key.toLowerCase().endsWith(lower)) {
                    record = val;
                    break;
                }
            }
        }
        if (!record) return undefined;
        const val = record[fieldName];
        return val != null ? String(val) : undefined;
    }

    /** Build comparison data from loaded entity records */
    private buildComparisonData(): void {
        if (!this.ComparisonGroup) return;

        // Build match infos (use loaded record data for names)
        this.ComparisonMatches = this.ComparisonGroup.Matches
            .sort((a, b) => b.MatchProbability - a.MatchProbability)
            .map(m => {
                const meta = this.parseRecordMetadata(m.RecordMetadata);
                // Resolve display name using IsNameField fields from entity metadata
                const entityName = this.ComparisonGroup!.EntityName;
                const resolvedName = this.resolveMatchName(entityName, m.MatchRecordID, meta);
                return {
                    Match: m,
                    Name: resolvedName,
                    Score: m.MatchProbability,
                    Metadata: meta,
                    DiffCount: 0,
                    LLMRecommendation: m.LLMRecommendation,
                    LLMConfidence: m.LLMConfidence,
                    LLMReasoning: m.LLMReasoning,
                    HasDisagreement: this.computeDisagreement(m.LLMRecommendation, m.MatchProbability),
                };
            });

        // Get entity field info for display names and ordering
        const md = this.ProviderToUse;
        const entityInfo = md.Entities.find(e => e.Name === this.ComparisonGroup!.EntityName);
        const entityFields = entityInfo?.Fields ?? [];

        const skip = new Set(['ID', '__mj_CreatedAt', '__mj_UpdatedAt']);
        const rows: ComparisonFieldRow[] = [];

        // Use entity fields in sequence order — values come from loaded entity records
        const sourceId = this.ComparisonGroup.RecordId;
        const matchRecordIds = this.ComparisonGroup.Matches
            .sort((a, b) => b.MatchProbability - a.MatchProbability)
            .map(m => m.MatchRecordID);

        // Sort fields: IsNameField first, then DefaultInView, then by Sequence
        const sortedFields = [...entityFields].sort((a, b) => {
            if (a.IsNameField !== b.IsNameField) return a.IsNameField ? -1 : 1;
            if (a.DefaultInView !== b.DefaultInView) return a.DefaultInView ? -1 : 1;
            return (a.Sequence ?? 9999) - (b.Sequence ?? 9999);
        });
        for (const field of sortedFields) {
            if (skip.has(field.Name) || field.IsPrimaryKey) continue;

            const sourceVal = this.getRecordFieldValue(sourceId, field.Name);
            const matchVals = matchRecordIds.map(rid => this.getRecordFieldValue(rid, field.Name));
            const hasDiff = matchVals.some(mv => !this.AreValuesEqual(sourceVal, mv));
            const hasData = sourceVal != null || matchVals.some(v => v != null);
            if (!hasData) continue;

            rows.push({
                FieldName: field.Name,
                DisplayName: field.DisplayName || field.Name,
                Category: field.Category || null,
                SourceValue: sourceVal,
                MatchValues: matchVals,
                HasDifference: hasDiff,
                SelectedColumnIndex: 0,
            });
        }

        this.ComparisonFields = rows;

        // Compute diff counts per match
        for (let mi = 0; mi < this.ComparisonMatches.length; mi++) {
            this.ComparisonMatches[mi].DiffCount = rows.filter(r =>
                !this.AreValuesEqual(r.SourceValue, r.MatchValues[mi])
            ).length;
        }
    }

    /** Parse RecordMetadata JSON from a detail or match entity */
    private parseRecordMetadata(json: string | null | undefined): RecordMetadataInfo {
        if (!json) return {};
        try {
            return JSON.parse(json) as RecordMetadataInfo;
        } catch {
            return {};
        }
    }

    /** Build top N match summaries with parsed names and scores */
    private buildTopMatchSummaries(
        matches: MJDuplicateRunDetailMatchEntity[],
        limit: number
    ): Array<{ Name: string; Score: number }> {
        return [...matches]
            .sort((a, b) => b.MatchProbability - a.MatchProbability)
            .slice(0, limit)
            .map(m => {
                const meta = this.parseRecordMetadata(m.RecordMetadata);
                return {
                    Name: this.resolveRecordName(meta, this.SelectedEntityFilter || 'Unknown', m.MatchRecordID ?? ''),
                    Score: m.MatchProbability,
                };
            });
    }

    /**
     * Resolve match record name from loaded entity records using IsNameField fields.
     * Falls back to metadata, then truncated record ID.
     */
    private resolveMatchName(entityName: string, matchRecordID: string, meta: RecordMetadataInfo): string {
        try {
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (entityInfo) {
                const nameFields = entityInfo.Fields
                    .filter(f => f.IsNameField)
                    .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
                if (nameFields.length > 0) {
                    // Try loaded entity record data first
                    const parts = nameFields
                        .map(f => this.getRecordFieldValue(matchRecordID, f.Name))
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (parts.length > 0) return parts.join(' ');

                    // Fall back to vector metadata
                    const metaParts = nameFields
                        .map(f => meta[f.Name])
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (metaParts.length > 0) return metaParts.join(' ');
                }
            }
        } catch { /* fall through */ }

        return (meta.Name as string) || this.FormatRecordID(matchRecordID ?? '');
    }

    /**
     * Resolve record display name from metadata using entity IsNameField fields.
     * Combines multiple name fields (e.g., FirstName + LastName → "Sarah Chen").
     * Falls back to metadata.Name, then recordID.
     */
    private resolveRecordName(metadata: RecordMetadataInfo, entityName: string, recordID: string): string {
        try {
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (entityInfo) {
                const nameFields = entityInfo.Fields
                    .filter(f => f.IsNameField)
                    .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
                if (nameFields.length > 0) {
                    // 1. Try individual name fields from metadata (new rich metadata)
                    const metaParts = nameFields
                        .map(f => metadata[f.Name])
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (metaParts.length > 0) return metaParts.join(' ');

                    // 2. Try loaded entity records (available in comparison panel)
                    const recordParts = nameFields
                        .map(f => this.getRecordFieldValue(recordID, f.Name))
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (recordParts.length > 0) return recordParts.join(' ');
                }
                // 3. Single NameField fallback
                if (entityInfo.NameField && metadata[entityInfo.NameField.Name]) {
                    return String(metadata[entityInfo.NameField.Name]);
                }
            }
        } catch { /* fall through */ }

        // 4. Heuristic — skip single-char or initial-only names from old sparse metadata
        const metaName = metadata.Name as string;
        if (metaName && metaName.length > 2) return metaName;
        return (metadata.Title as string) || this.FormatRecordID(recordID);
    }

    /**
     * Determine the dominant approval status for a group of matches.
     * If any match is Pending, the group is Pending.
     * Otherwise, if all are Approved, the group is Approved.
     * If all are Rejected, the group is Rejected.
     * Mixed Approved/Rejected defaults to Pending.
     */
    private computeDominantApprovalStatus(matches: MJDuplicateRunDetailMatchEntity[]): 'Pending' | 'Approved' | 'Rejected' {
        let hasApproved = false;
        let hasRejected = false;
        for (const m of matches) {
            if (m.ApprovalStatus === 'Pending') return 'Pending';
            if (m.ApprovalStatus === 'Approved') hasApproved = true;
            if (m.ApprovalStatus === 'Rejected') hasRejected = true;
        }
        if (hasApproved && !hasRejected) return 'Approved';
        if (hasRejected && !hasApproved) return 'Rejected';
        return 'Pending'; // mixed
    }

    /** Find the latest MatchedAt date across a set of matches */
    private computeLatestMatchDate(matches: MJDuplicateRunDetailMatchEntity[]): Date {
        let latest = new Date(0);
        for (const m of matches) {
            const d = new Date(m.MatchedAt);
            if (d > latest) {
                latest = d;
            }
        }
        return latest;
    }

    /** Apply filters and distribute groups into Kanban columns */
    private applyFilters(): void {
        let filtered = [...this.AllGroups];

        if (this.Filters.EntityName) {
            filtered = filtered.filter(g => g.EntityName === this.Filters.EntityName);
        }

        if (this.Filters.MinScore > 0) {
            filtered = filtered.filter(g => g.HighestScore >= this.Filters.MinScore);
        }

        if (this.Filters.MaxScore > 0 && this.Filters.MaxScore < 1) {
            filtered = filtered.filter(g => g.HighestScore <= this.Filters.MaxScore);
        }

        if (this.Filters.DateFrom) {
            const parts = this.Filters.DateFrom.split('-');
            const from = new Date(+parts[0], +parts[1] - 1, +parts[2], 0, 0, 0, 0);
            filtered = filtered.filter(g => new Date(g.MatchedAt) >= from);
        }

        if (this.Filters.DateTo) {
            const parts = this.Filters.DateTo.split('-');
            const to = new Date(+parts[0], +parts[1] - 1, +parts[2], 23, 59, 59, 999);
            filtered = filtered.filter(g => new Date(g.MatchedAt) <= to);
        }

        // Highest-confidence matches first; break ties by record name for stable ordering.
        filtered.sort((a, b) =>
            (b.HighestScore - a.HighestScore) || a.RecordName.localeCompare(b.RecordName)
        );

        this.PendingGroups = filtered.filter(g => g.ApprovalStatus === 'Pending');
        this.ApprovedGroups = filtered.filter(g => g.ApprovalStatus === 'Approved');
        this.RejectedGroups = filtered.filter(g => g.ApprovalStatus === 'Rejected');
        this.cdr.detectChanges();
    }

    /** Update the ApprovalStatus of all matches within a group and re-sort. */
    private async updateGroupApprovalStatus(
        group: DuplicateGroup,
        status: 'Approved' | 'Rejected' | 'Pending'
    ): Promise<void> {
        this.IsSaving = true;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const tg = await md.CreateTransactionGroup();
            for (const match of group.Matches) {
                match.ApprovalStatus = status;
                match.TransactionGroup = tg;
                await match.Save();
            }
            const success = await tg.Submit();
            if (!success) {
                console.error(`Failed to update match approval statuses to ${status}`);
                return;
            }

            // Update the local group state
            group.ApprovalStatus = status;
            this.applyFilters();
        } catch (error) {
            console.error(`Error updating match approval status to ${status}:`, error);
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }
}

export function LoadDuplicateDetectionResource(): void {
    // Prevents tree-shaking
}
