/**
 * @fileoverview Duplicate Detection Kanban Board Resource Component
 *
 * Dashboard resource for reviewing duplicate detection results in a Kanban-style
 * board with three columns: Pending Review, Approved, and Rejected.
 * Loads data from MJ: Duplicate Runs, MJ: Duplicate Run Details, and
 * MJ: Duplicate Run Detail Matches entities.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import {
    ResourceData,
    MJDuplicateRunEntity,
    MJDuplicateRunDetailEntity,
    MJDuplicateRunDetailMatchEntity
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

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
            const [runsResult, detailsResult, matchesResult] = await rv.RunViews([
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

    /** Update the ApprovalStatus of all matches within a group and re-sort.
     *  Since this.Matches already contains entity_object instances, we update and save them directly
     *  instead of loading each one individually from the database.
     */
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
