/**
 * @fileoverview Duplicate Detection Kanban Board Resource Component
 *
 * Dashboard resource for reviewing duplicate detection results in a Kanban-style
 * board with three columns: Pending Review, Approved, and Rejected.
 * Supports triggering new detection runs with real-time progress via
 * GraphQL subscriptions.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, Input, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import {
    ResourceData,
    MJDuplicateRunEntity,
    MJDuplicateRunDetailEntity,
    MJDuplicateRunDetailMatchEntity
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * Represents a group of duplicate matches for a single source record,
 * aggregated from detail and match entities for display on the Kanban board.
 */
interface DuplicateGroup {
    DetailId: string;
    RunId: string;
    RecordId: string;
    EntityName: string;
    ApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
    MatchCount: number;
    HighestScore: number;
    Matches: MJDuplicateRunDetailMatchEntity[];
    MatchedAt: Date;
}

interface DuplicateFilter {
    EntityName: string;
    MinScore: number;
    MaxScore: number;
    DateFrom: string;
    DateTo: string;
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
    styleUrls: ['./duplicate-detection-resource.component.css']
})
export class DuplicateDetectionResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();
    private filterSubject = new Subject<void>();

    // Loading state
    public IsLoading = false;
    public IsSaving = false;

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
    public DetectionCurrentItem = '';

    // Entity document picker
    public EntityDocuments: EntityDocumentOption[] = [];
    public SelectedEntityDocumentID = '';

    /** Whether this component is embedded inside the Knowledge Hub shell */
    @Input() EmbeddedMode = false;

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
        return this.EntityDocuments.find(d => d.ID === this.SelectedEntityDocumentID) ?? null;
    }

    async ngAfterViewInit(): Promise<void> {
        this.setupFilterDebounce();
        await this.LoadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
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
     */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const [runsResult, detailsResult, matchesResult, entityDocsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Duplicate Runs',
                    ExtraFilter: "ProcessingStatus = 'Complete'",
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
                },
                {
                    EntityName: 'MJ: Entity Documents',
                    ExtraFilter: "Status = 'Active'",
                    OrderBy: 'Name',
                    ResultType: 'simple'
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
            if (entityDocsResult.Success) {
                this.buildEntityDocumentOptions(entityDocsResult.Results);
            }

            this.extractEntityNames();
            this.buildGroups();
            this.applyFilters();
        } catch (error) {
            console.error('Error loading duplicate detection data:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Trigger a new duplicate detection run by creating a DuplicateRun entity.
     * The server hook auto-triggers detection when a run is saved with EndedAt === null.
     */
    public async RunDetection(): Promise<void> {
        if (this.IsDetecting || !this.SelectedEntityDocumentID) return;

        const selectedDoc = this.EntityDocuments.find(d => d.ID === this.SelectedEntityDocumentID);
        if (!selectedDoc) return;

        this.IsDetecting = true;
        this.DetectionProgress = 0;
        this.DetectionStage = 'Initializing...';
        this.DetectionCurrentItem = '';
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const dupeRun = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs');
            dupeRun.NewRecord();

            // Look up the EntityID from the entity document's entity name
            const entityInfo = md.Entities.find(e => e.Name === selectedDoc.EntityName);
            if (entityInfo) {
                dupeRun.EntityID = entityInfo.ID;
            }

            dupeRun.StartedAt = new Date();
            dupeRun.ProcessingStatus = 'In Progress';
            dupeRun.ApprovalStatus = 'Pending';

            const saved = await dupeRun.Save();
            if (!saved) {
                console.error('Failed to create duplicate run');
                this.IsDetecting = false;
                this.DetectionStage = '';
                this.cdr.detectChanges();
                return;
            }

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

    /** Handle filter changes with debounce */
    public OnFilterChange(): void {
        this.filterSubject.next();
    }

    /** Clear all filters */
    public ClearFilters(): void {
        this.Filters = {
            EntityName: '',
            MinScore: 0,
            MaxScore: 1,
            DateFrom: '',
            DateTo: ''
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
    public FormatDate(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** Whether any filters are active */
    public get HasActiveFilters(): boolean {
        return this.Filters.EntityName !== '' ||
            this.Filters.MinScore > 0 ||
            this.Filters.MaxScore < 1 ||
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

    /** Build entity document options from simple results */
    private buildEntityDocumentOptions(records: Record<string, unknown>[]): void {
        this.EntityDocuments = records.map(r => ({
            ID: String(r['ID'] ?? ''),
            Name: String(r['Name'] ?? 'Unnamed'),
            EntityName: String(r['Entity'] ?? r['EntityID'] ?? ''),
            PotentialMatchThreshold: (r['PotentialMatchThreshold'] as number) ?? 0.75,
            AbsoluteMatchThreshold: (r['AbsoluteMatchThreshold'] as number) ?? 0.95
        }));

        // Auto-select the first entity document if available
        if (this.EntityDocuments.length > 0 && !this.SelectedEntityDocumentID) {
            this.SelectedEntityDocumentID = this.EntityDocuments[0].ID;
        }
    }

    /** Subscribe to PipelineProgress for a specific detection run */
    private subscribeToPipelineProgress(pipelineRunID: string): void {
        const provider = Metadata.Provider as GraphQLDataProvider;
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

        const sub = provider.subscribe(subscriptionQuery, { pipelineRunID });
        const rxSub = sub.pipe(takeUntil(this.destroy$)).subscribe({
            next: (data: Record<string, unknown>) => {
                const progress = (data as Record<string, Record<string, unknown>>)['PipelineProgress'];
                if (!progress) return;

                const stage = progress['Stage'] as string;
                const pct = progress['PercentComplete'] as number;
                const currentItem = progress['CurrentItem'] as string | undefined;

                this.DetectionProgress = pct;
                this.DetectionStage = this.formatDetectionStage(stage);
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
        for (const run of this.Runs) {
            if (run.Entity) {
                nameSet.add(run.Entity);
            }
        }
        this.EntityNames = Array.from(nameSet).sort();
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
            const entityName = run?.Entity ?? 'Unknown';
            const highestScore = this.computeHighestScore(detailMatches);
            const dominantStatus = this.computeDominantApprovalStatus(detailMatches);
            const latestMatchDate = this.computeLatestMatchDate(detailMatches);

            this.AllGroups.push({
                DetailId: detail.ID,
                RunId: detail.DuplicateRunID,
                RecordId: detail.RecordID,
                EntityName: entityName,
                ApprovalStatus: dominantStatus,
                MatchCount: detailMatches.length,
                HighestScore: highestScore,
                Matches: detailMatches,
                MatchedAt: latestMatchDate
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

        if (this.Filters.MaxScore < 1) {
            filtered = filtered.filter(g => g.HighestScore <= this.Filters.MaxScore);
        }

        if (this.Filters.DateFrom) {
            const from = new Date(this.Filters.DateFrom);
            filtered = filtered.filter(g => new Date(g.MatchedAt) >= from);
        }

        if (this.Filters.DateTo) {
            const to = new Date(this.Filters.DateTo);
            filtered = filtered.filter(g => new Date(g.MatchedAt) <= to);
        }

        this.PendingGroups = filtered.filter(g => g.ApprovalStatus === 'Pending');
        this.ApprovedGroups = filtered.filter(g => g.ApprovalStatus === 'Approved');
        this.RejectedGroups = filtered.filter(g => g.ApprovalStatus === 'Rejected');
        this.cdr.detectChanges();
    }

    /** Update the ApprovalStatus of all matches within a group and re-sort. */
    private async updateGroupApprovalStatus(
        group: DuplicateGroup,
        status: 'Approved' | 'Rejected'
    ): Promise<void> {
        this.IsSaving = true;
        this.cdr.detectChanges();

        try {
            for (const match of group.Matches) {
                match.ApprovalStatus = status;
                await match.Save();
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
