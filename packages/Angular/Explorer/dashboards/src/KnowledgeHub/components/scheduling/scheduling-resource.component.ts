/**
 * @fileoverview Knowledge Hub Scheduled Pipelines Dashboard Tab
 *
 * Full-page resource component for managing scheduled pipelines within the
 * Knowledge Hub application. Displays job cards in a compact grid, recent
 * activity table, and provides create/edit via the reusable
 * ScheduledJobDialogComponent from @memberjunction/ng-scheduling.
 *
 * Registered as BaseResourceComponent for the Knowledge Hub application.
 */

import { Component, Input, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { ResourceData, MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ScheduledJobService, ScheduledJobDialogResult } from '@memberjunction/ng-scheduling';
import {
    buildSchedulingAgentContext,
    resolveScheduledJob,
    buildScheduleNotFoundError,
    VALID_SCHEDULE_STATUSES,
} from './scheduling-agent-context';
import { validateStringParam } from '../../../shared/agent-tool-validation';

/** Simple cron-to-English mapping for common patterns */
interface CronParts {
    Second: string;
    Minute: string;
    Hour: string;
    DayOfMonth: string;
    Month: string;
    DayOfWeek: string;
}

@RegisterClass(BaseResourceComponent, 'SchedulingResource')
@Component({
    standalone: false,
    selector: 'app-scheduling-resource',
    templateUrl: './scheduling-resource.component.html',
    styleUrls: ['./scheduling-resource.component.css'],
})
export class SchedulingResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    /**
     * When true, renders only the body content (no <mj-page-layout> + <mj-page-header>
     * chrome). Used when embedded inside another resource page (e.g. KH Configuration's
     * Scheduling section) so we don't get nested page-layouts that trap click events.
     *
     * Named `HideToolbar` for cross-section consistency with Scheduling/Testing inner
     * components — see plans/explorer-chrome-conventions.md Section 5. The name is
     * narrower than its actual behavior (suppresses entire chrome, not just the toolbar)
     * but matches the documented convention.
     */
    @Input() HideToolbar = false;

    private cdr = inject(ChangeDetectorRef);
    protected override navigationService = inject(NavigationService);
    private scheduledJobService = inject(ScheduledJobService);
    protected override destroy$ = new Subject<void>();

    // ================================================================
    // Resource overrides
    // ================================================================

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Schedules';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-clock';
    }

    // ================================================================
    // State
    // ================================================================

    public IsLoading = true;
    public AllJobs: MJScheduledJobEntity[] = [];
    public FilteredJobs: MJScheduledJobEntity[] = [];
    public RecentRuns: MJScheduledJobRunEntity[] = [];
    public StatusFilter = '';
    public SearchQuery = '';

    /** Map of jobID -> last 7 run statuses for sparkline display */
    private sparklineCache = new Map<string, string[]>();

    // Edit dialog
    public ShowEditDialog = false;
    public EditingJobID: string | null = null;

    // ================================================================
    // Computed
    // ================================================================

    public get ActiveCount(): number {
        return this.AllJobs.filter(j => j.Status === 'Active').length;
    }

    public get PausedCount(): number {
        return this.AllJobs.filter(j => j.Status === 'Paused').length;
    }

    public get DisabledCount(): number {
        return this.AllJobs.filter(j => j.Status === 'Disabled').length;
    }

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngAfterViewInit(): Promise<void> {
        await this.loadData();
        // When embedded in KH Configuration's Scheduling section, that host owns
        // agent reporting; skip here to avoid double-registration.
        if (!this.HideToolbar) {
            this.emitAgentContext();
            this.registerAgentTools();
        }
        this.NotifyLoadComplete();
    }

    // ================================================================
    // Agent context + client tools
    // ================================================================

    /**
     * 🔒 SAFETY BOUNDARY (Knowledge Hub Scheduling surface)
     * -----------------------------------------------------
     * EXPOSED to the agent: idempotent refresh, read-only filter (by status) +
     * search, selection, opening a job's record for VIEWING, and navigation to
     * the full Scheduling application. All resolve job references tolerantly
     * (id → name → contains) and never throw.
     *
     * NEVER EXPOSED (operational mutations — deliberate UI actions only):
     * create a job (OnNewSchedule), edit/save a job (OnEditJob via the dialog),
     * trigger a run (OnRunNow), pause/resume, or delete. The agent may *navigate
     * to* and *open* these, never commit them.
     *
     * No-op when embedded (HideToolbar) — the host surface owns agent reporting.
     */

    /**
     * Publish the scheduling surface state to the AI agent. Re-emitted whenever
     * jobs reload or the filter/search changes, so the streamed context tracks
     * the visible job set. Deep context is shaped by the pure
     * {@link buildSchedulingAgentContext}. No-op when embedded.
     */
    private emitAgentContext(): void {
        if (this.HideToolbar) {
            return;
        }
        this.navigationService.SetAgentContext(this, buildSchedulingAgentContext({
            AllJobs: this.AllJobs.map(j => ({
                ID: j.ID,
                Name: j.Name,
                Description: j.Description,
                Status: j.Status,
                CronExpression: j.CronExpression,
                NextRunAt: j.NextRunAt,
                LastRunAt: j.LastRunAt,
                RunCount: j.RunCount,
                SuccessCount: j.SuccessCount,
            })),
            FilteredJobs: this.FilteredJobs.map(j => ({
                ID: j.ID,
                Name: j.Name,
                Description: j.Description,
                Status: j.Status,
                CronExpression: j.CronExpression,
                NextRunAt: j.NextRunAt,
                LastRunAt: j.LastRunAt,
                RunCount: j.RunCount,
                SuccessCount: j.SuccessCount,
            })),
            StatusFilter: this.StatusFilter,
            SearchQuery: this.SearchQuery,
            RecentRunCount: this.RecentRuns.length,
            IsLoading: this.IsLoading,
        }));
    }

    /**
     * Register the SAFE, agent-actionable operations for the scheduling surface:
     * refresh, filter by status, search, select/open a job (view only), and open
     * the full Scheduling application. All wire to existing methods, resolve job
     * references tolerantly, and never throw. See the SAFETY BOUNDARY above.
     */
    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshSchedules',
                Description: 'Reload the scheduled jobs and recent run history from the server. Idempotent.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.loadData();
                    this.emitAgentContext();
                    return { Success: true, Data: { TotalJobs: this.AllJobs.length } };
                },
            },
            {
                Name: 'FilterSchedulesByStatus',
                Description: 'Filter the scheduled jobs by status. Pass an empty string to clear. Valid statuses: Active, Paused, Disabled. Read-only.',
                ParameterSchema: {
                    type: 'object',
                    properties: { status: { type: 'string', enum: ['', ...VALID_SCHEDULE_STATUSES] } },
                    required: ['status'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const status = String(params['status'] ?? '');
                    if (status && !(VALID_SCHEDULE_STATUSES as readonly string[]).includes(status)) {
                        return { Success: false, ErrorMessage: `Unknown status "${status}". Expected one of: ${VALID_SCHEDULE_STATUSES.join(', ')}.` };
                    }
                    this.StatusFilter = status;
                    this.OnFilterChanged();
                    return { Success: true, Data: { VisibleJobs: this.FilteredJobs.length } };
                },
            },
            {
                Name: 'SearchSchedules',
                Description: 'Filter the scheduled jobs by a search term (name / description). Pass empty to clear. Read-only.',
                ParameterSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const v = validateStringParam(params['query'], 'query');
                    if (!v.ok) return v.result;
                    this.SearchQuery = v.value;
                    this.OnSearchChanged();
                    return { Success: true, Data: { VisibleJobs: this.FilteredJobs.length } };
                },
            },
            {
                Name: 'OpenScheduleRecord',
                Description: 'Open a scheduled job\'s record by id or name in a new tab for VIEWING (does NOT edit, run, pause, or delete).',
                ParameterSchema: {
                    type: 'object',
                    properties: { job: { type: 'string', description: 'Scheduled job id or name' } },
                    required: ['job'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const v = validateStringParam(params['job'], 'job');
                    if (!v.ok) return v.result;
                    const match = resolveScheduledJob(v.value, this.AllJobs);
                    if (!match) {
                        return {
                            Success: false,
                            ErrorMessage: buildScheduleNotFoundError(v.value, this.AllJobs.map(j => j.Name)),
                        };
                    }
                    const pkey = new CompositeKey([{ FieldName: 'ID', Value: match.ID }]);
                    this.navigationService.OpenEntityRecord('MJ: Scheduled Jobs', pkey);
                    return { Success: true, Data: { Job: match.Name } };
                },
            },
            {
                Name: 'OpenSchedulingApp',
                Description: 'Navigate to the full Scheduling application to manage all scheduled jobs.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.GoToSchedulingApp();
                    return { Success: true };
                },
            },
        ]);
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ================================================================
    // Public Methods — Toolbar
    // ================================================================

    public OnNewSchedule(): void {
        this.EditingJobID = null;
        this.ShowEditDialog = true;
        this.cdr.detectChanges();
    }

    public OnFilterChanged(): void {
        this.applyFilters();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    public OnSearchChanged(): void {
        this.applyFilters();
        this.emitAgentContext();
        this.cdr.detectChanges();
    }

    // ================================================================
    // Public Methods — Card Actions
    // ================================================================

    public OnEditJob(job: MJScheduledJobEntity): void {
        this.EditingJobID = job.ID;
        this.ShowEditDialog = true;
        this.cdr.detectChanges();
    }

    public async OnRunNow(job: MJScheduledJobEntity): Promise<void> {
        MJNotificationService.Instance.CreateSimpleNotification(
            `Triggering "${job.Name}" — this feature requires server-side support.`,
            'info', 4000
        );
    }

    // ================================================================
    // Public Methods — Dialog
    // ================================================================

    public async OnDialogClosed(result: ScheduledJobDialogResult): Promise<void> {
        this.ShowEditDialog = false;
        this.EditingJobID = null;

        if (result.Saved || result.Deleted) {
            await this.loadData();
            this.emitAgentContext();
        }

        this.cdr.detectChanges();
    }

    /** Navigate to the full Scheduling application */
    public GoToSchedulingApp(): void {
        const md = this.ProviderToUse;
        const schedulingApp = md.Applications.find(a => a.Name === 'Scheduling');
        if (schedulingApp) {
            this.navigationService.SwitchToApp(schedulingApp.ID);
        } else {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Scheduling app not found. Check application configuration.',
                'warning', 3000
            );
        }
    }

    // ================================================================
    // Public Methods — Card Display Helpers
    // ================================================================

    public GetStatusDotClass(job: MJScheduledJobEntity): string {
        return (job.Status ?? 'pending').toLowerCase();
    }

    public GetCronDescription(cron: string): string {
        if (!cron) return 'No schedule';
        const parts = this.parseCron(cron);
        if (!parts) return cron;
        return this.cronToHuman(parts);
    }

    public GetSparkline(jobID: string): string[] {
        return this.sparklineCache.get(jobID) ?? [];
    }

    public GetTimeAgo(date: Date | null): string {
        if (!date) return 'Never';
        const now = new Date();
        const d = new Date(date);
        const diffMs = now.getTime() - d.getTime();
        return this.formatDuration(diffMs);
    }

    public GetTimeUntil(date: Date | null): string {
        if (!date) return '--';
        const now = new Date();
        const d = new Date(date);
        const diffMs = d.getTime() - now.getTime();
        if (diffMs <= 0) return 'Due';
        return this.formatDuration(diffMs);
    }

    public GetSuccessRate(job: MJScheduledJobEntity): string {
        if (job.RunCount === 0) return 'N/A';
        return Math.round((job.SuccessCount / job.RunCount) * 100) + '%';
    }

    public GetSuccessRateClass(job: MJScheduledJobEntity): string {
        if (job.RunCount === 0) return '';
        const rate = job.SuccessCount / job.RunCount;
        if (rate >= 0.95) return 'high';
        if (rate >= 0.80) return 'mid';
        return '';
    }

    public GetDuration(run: MJScheduledJobRunEntity): string {
        if (!run.StartedAt || !run.CompletedAt) return '--';
        const start = new Date(run.StartedAt).getTime();
        const end = new Date(run.CompletedAt).getTime();
        const diffMs = end - start;
        return this.formatDurationShort(diffMs);
    }

    public GetItemsProcessed(run: MJScheduledJobRunEntity): string {
        if (!run.Details) return '--';
        try {
            const details = JSON.parse(run.Details) as Record<string, unknown>;
            if (details['ItemsProcessed'] != null) {
                const total = details['TotalItems'] as number | undefined;
                const processed = details['ItemsProcessed'] as number;
                if (run.Status === 'Failed' && total != null) {
                    return `${this.formatNumber(processed)} / ${this.formatNumber(total)}`;
                }
                return this.formatNumber(processed);
            }
        } catch {
            // details not parseable
        }
        return '--';
    }

    // ================================================================
    // Private Methods
    // ================================================================

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [jobsResult, runsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Scheduled Jobs',
                    ExtraFilter: `Name LIKE '%Autotag%' OR Name LIKE '%Vector%' OR Name LIKE '%Content%' OR Name LIKE '%Knowledge%' OR Name LIKE '%Tag%'`,
                    OrderBy: 'Name',
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Scheduled Job Runs',
                    ExtraFilter: '',
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 100,
                    ResultType: 'entity_object',
                },
            ]);

            if (jobsResult.Success) {
                this.AllJobs = jobsResult.Results as MJScheduledJobEntity[];
            } else {
                this.AllJobs = [];
            }

            const allRuns = runsResult.Success
                ? (runsResult.Results as MJScheduledJobRunEntity[])
                : [];

            this.RecentRuns = allRuns.slice(0, 10);
            this.buildSparklineCache(allRuns);
            this.applyFilters();
        } catch (error) {
            console.error('[SchedulingResource] Error loading data:', error);
            this.AllJobs = [];
            this.FilteredJobs = [];
            this.RecentRuns = [];
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private applyFilters(): void {
        let jobs = this.AllJobs;

        if (this.StatusFilter) {
            jobs = jobs.filter(j => j.Status === this.StatusFilter);
        }

        if (this.SearchQuery.trim()) {
            const query = this.SearchQuery.trim().toLowerCase();
            jobs = jobs.filter(j =>
                j.Name.toLowerCase().includes(query) ||
                (j.Description ?? '').toLowerCase().includes(query)
            );
        }

        this.FilteredJobs = jobs;
    }

    /**
     * Build sparkline data for each job from the last 7 runs.
     * Each dot is 'ok', 'fail', or 'skip'.
     */
    private buildSparklineCache(allRuns: MJScheduledJobRunEntity[]): void {
        this.sparklineCache.clear();

        // Group runs by job ID
        const runsByJob = new Map<string, MJScheduledJobRunEntity[]>();
        for (const run of allRuns) {
            const jobID = run.ScheduledJobID;
            if (!runsByJob.has(jobID)) {
                runsByJob.set(jobID, []);
            }
            runsByJob.get(jobID)!.push(run);
        }

        // Build sparkline for each job (up to 7 most recent runs)
        for (const job of this.AllJobs) {
            const runs = runsByJob.get(job.ID) ?? [];
            const last7 = runs.slice(0, 7);
            const dots: string[] = last7.map(r => this.runStatusToDot(r));

            // Pad to 7 with 'skip' dots if fewer runs
            while (dots.length < 7) {
                dots.push('skip');
            }

            this.sparklineCache.set(job.ID, dots);
        }
    }

    private runStatusToDot(run: MJScheduledJobRunEntity): string {
        if (run.Status === 'Completed' && run.Success) return 'ok';
        if (run.Status === 'Failed' || (run.Status === 'Completed' && !run.Success)) return 'fail';
        if (run.Status === 'Running') return 'ok'; // treat in-progress as OK
        return 'skip';
    }

    // ================================================================
    // Cron Parsing
    // ================================================================

    private parseCron(cron: string): CronParts | null {
        const parts = cron.trim().split(/\s+/);
        // Support 5-part (no seconds) and 6-part (with seconds) cron
        if (parts.length === 5) {
            return {
                Second: '0',
                Minute: parts[0],
                Hour: parts[1],
                DayOfMonth: parts[2],
                Month: parts[3],
                DayOfWeek: parts[4],
            };
        }
        if (parts.length === 6) {
            return {
                Second: parts[0],
                Minute: parts[1],
                Hour: parts[2],
                DayOfMonth: parts[3],
                Month: parts[4],
                DayOfWeek: parts[5],
            };
        }
        return null;
    }

    private cronToHuman(p: CronParts): string {
        // Every N minutes: */N * * * *
        if (p.Minute.startsWith('*/') && p.Hour === '*' && p.DayOfMonth === '*' && p.Month === '*' && p.DayOfWeek === '*') {
            const interval = parseInt(p.Minute.slice(2), 10);
            if (interval === 1) return 'Every minute';
            return `Every ${interval} minutes`;
        }

        // Every N hours: 0 */N * * *
        if (p.Minute !== '*' && !p.Minute.includes('/') && p.Hour.startsWith('*/') && p.DayOfMonth === '*') {
            const interval = parseInt(p.Hour.slice(2), 10);
            if (interval === 1) return 'Every hour';
            return `Every ${interval} hours`;
        }

        // Specific hour with specific or wildcard day fields
        if (!p.Minute.includes('*') && !p.Minute.includes('/') &&
            !p.Hour.includes('*') && !p.Hour.includes('/') &&
            p.Month === '*') {

            const hour = parseInt(p.Hour, 10);
            const minute = parseInt(p.Minute, 10);
            const timeStr = this.formatTime(hour, minute);

            // Weekly: specific day of week
            if (p.DayOfWeek !== '*' && p.DayOfMonth === '*') {
                const dayName = this.dayOfWeekName(p.DayOfWeek);
                return `Weekly on ${dayName} at ${timeStr}`;
            }

            // Monthly: specific day of month
            if (p.DayOfMonth !== '*' && p.DayOfWeek === '*') {
                return `Monthly on day ${p.DayOfMonth} at ${timeStr}`;
            }

            // Daily
            if (p.DayOfMonth === '*' && p.DayOfWeek === '*') {
                return `Daily at ${timeStr}`;
            }
        }

        // Fallback: return the raw cron expression
        return `${p.Minute} ${p.Hour} ${p.DayOfMonth} ${p.Month} ${p.DayOfWeek}`;
    }

    private formatTime(hour: number, minute: number): string {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const m = minute.toString().padStart(2, '0');
        return `${h}:${m} ${ampm}`;
    }

    private dayOfWeekName(dow: string): string {
        const names: Record<string, string> = {
            '0': 'Sunday', '1': 'Monday', '2': 'Tuesday',
            '3': 'Wednesday', '4': 'Thursday', '5': 'Friday',
            '6': 'Saturday', '7': 'Sunday',
            'SUN': 'Sunday', 'MON': 'Monday', 'TUE': 'Tuesday',
            'WED': 'Wednesday', 'THU': 'Thursday', 'FRI': 'Friday',
            'SAT': 'Saturday',
        };
        return names[dow.toUpperCase()] ?? dow;
    }

    // ================================================================
    // Formatting Helpers
    // ================================================================

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    private formatDurationShort(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainMinutes = minutes % 60;
            return `${hours}h ${remainMinutes}m`;
        }
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    }

    private formatNumber(n: number): string {
        return n.toLocaleString();
    }
}

/** Tree-shaking prevention */
export function LoadSchedulingResource(): void {
    // Prevents tree-shaking of the component
}
