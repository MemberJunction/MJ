import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJTaskEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';

/** A settled-or-running graph, projected for the list. */
export type WorkflowRunRow = {
    ID: string;
    Name: string;
    Status: string;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    /** Human-readable elapsed/duration — coarse on purpose, this is a scan column. */
    Duration: string;
    AgentRunID: string | null;
};

/** The statuses a run can be filtered to. `all` is not a status; it clears the filter. */
export type WorkflowRunStatusFilter = 'all' | 'Running' | 'Complete' | 'Failed' | 'Cancelled';

const STATUS_FILTERS: readonly WorkflowRunStatusFilter[] = ['all', 'Running', 'Complete', 'Failed', 'Cancelled'];

/**
 * The Workflows app's **Runs** surface — every task graph that has run, whoever started it.
 *
 * **This is why the app came back.** A workflow's definition already had a home (the AI Agents form,
 * which is the one editor); its *runs* did not. They were reachable only by opening the agent that
 * happened to submit them, which fails for the case that matters most — a graph outlives the run
 * that submitted it, so a scheduled or MCP-triggered workflow had no owning conversation to find it
 * from. This lists them by the thing a person actually remembers: what ran, when, and how it ended.
 *
 * Reads parent Task rows because a parent row **is** a graph — one row per run, no joining required
 * to count them, and the same unit the promotion picker offers.
 */
@Component({
    standalone: false,
    selector: 'mj-workflow-runs',
    templateUrl: './workflow-runs-resource.component.html',
    styleUrls: ['./workflow-runs-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'WorkflowRunsResource')
export class WorkflowRunsResourceComponent extends BaseDashboard implements AfterViewInit {
    public IsLoading = false;
    public LoadError: string | null = null;

    public Runs: WorkflowRunRow[] = [];
    public StatusFilter: WorkflowRunStatusFilter = 'all';
    public SearchText = '';

    /** The run whose graph is showing in the detail panel, or null. */
    public SelectedRunID: string | null = null;

    public readonly StatusFilters = STATUS_FILTERS;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflow Runs';
    }

    initDashboard(): void {
        // Nothing to set up — loadData does the work and the filters default to "everything".
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
    }

    /** The rows after the active filter and search — what the template renders. */
    public get VisibleRuns(): WorkflowRunRow[] {
        const wanted = this.SearchText.trim().toLowerCase();
        return this.Runs.filter((r) => {
            if (this.StatusFilter !== 'all' && r.Status !== this.StatusFilter) return false;
            return !wanted || r.Name.toLowerCase().includes(wanted);
        });
    }

    public get SelectedRun(): WorkflowRunRow | null {
        return this.Runs.find((r) => UUIDsEqual(r.ID, this.SelectedRunID ?? '')) ?? null;
    }

    async loadData(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskEntity>({
                EntityName: 'MJ: Tasks',
                // Parent rows only: one row per graph. Without this the list would show every step
                // of every run interleaved, which is a step list, not a run list.
                ExtraFilter: `ParentID IS NULL`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 200,
                ResultType: 'entity_object',
            });

            if (!result.Success) {
                this.LoadError = result.ErrorMessage ?? 'Runs could not be loaded.';
                this.Runs = [];
                return;
            }
            this.Runs = (result.Results ?? []).map((t) => this.toRow(t));
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Runs = [];
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private toRow(task: MJTaskEntity): WorkflowRunRow {
        return {
            ID: task.ID,
            Name: task.Name ?? '(unnamed run)',
            Status: task.Status,
            StartedAt: task.StartedAt,
            CompletedAt: task.CompletedAt,
            Duration: this.describeDuration(task.StartedAt, task.CompletedAt),
            AgentRunID: task.AgentRunID,
        };
    }

    /**
     * Elapsed time, or how long it has been running.
     *
     * A run with no start has not begun — that is different from a zero-length run, so it says so
     * rather than printing "0s" and implying something happened instantly.
     */
    private describeDuration(startedAt: Date | null, completedAt: Date | null): string {
        if (!startedAt) return '—';
        const end = completedAt ?? new Date();
        const seconds = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000));
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    public OnSelectRun(run: WorkflowRunRow): void {
        this.SelectedRunID = UUIDsEqual(this.SelectedRunID ?? '', run.ID) ? null : run.ID;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnFilterByStatus(status: WorkflowRunStatusFilter): void {
        this.StatusFilter = status;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnSearch(text: string): void {
        this.SearchText = text;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** Opens the agent run that submitted this graph, when there was one. */
    public OnOpenAgentRun(run: WorkflowRunRow): void {
        if (!run.AgentRunID) return;
        this.navigationService.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(run.AgentRunID));
    }

    /**
     * Reports surface state and registers what an agent may drive here.
     *
     * 🔒 SAFETY BOUNDARY: read-only. Nothing here re-runs, cancels, retries or deletes a run — those
     * change what a workflow did, and a run is a historical record. The agent filters, searches,
     * selects and navigates; a person commits any real action from the UI.
     */
    private publishAgentContext(): void {
        const visible = this.VisibleRuns;
        this.navigationService.SetAgentContext(this, {
            Surface: 'WorkflowRuns',
            RunCount: this.Runs.length,
            VisibleRunCount: visible.length,
            StatusFilter: this.StatusFilter,
            SearchText: this.SearchText,
            RunningCount: this.Runs.filter((r) => r.Status === 'Running').length,
            FailedCount: this.Runs.filter((r) => r.Status === 'Failed').length,
            SelectedRunID: this.SelectedRunID,
            SelectedRunName: this.SelectedRun?.Name ?? null,
            VisibleRunNames: visible.slice(0, 25).map((r) => r.Name),
            VisibleRunNamesTruncated: visible.length > 25,
        });

        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'FilterWorkflowRunsByStatus',
                Description: `Filter the run list. One of: ${STATUS_FILTERS.join(', ')}.`,
                ParameterSchema: {
                    type: 'object',
                    properties: { status: { type: 'string', enum: [...STATUS_FILTERS] } },
                    required: ['status'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const wanted = String(params['status'] ?? '').trim();
                    const match = STATUS_FILTERS.find((s) => s.toLowerCase() === wanted.toLowerCase());
                    if (!match) {
                        return { Success: false, Message: `Unknown status. Use one of: ${STATUS_FILTERS.join(', ')}.` };
                    }
                    this.OnFilterByStatus(match);
                    return { Success: true };
                },
            },
            {
                Name: 'SearchWorkflowRuns',
                Description: 'Filter the run list by name.',
                ParameterSchema: {
                    type: 'object',
                    properties: { text: { type: 'string' } },
                    required: ['text'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    this.OnSearch(String(params['text'] ?? ''));
                    return { Success: true, Data: { VisibleRunCount: this.VisibleRuns.length } };
                },
            },
            {
                Name: 'SelectWorkflowRun',
                Description: 'Open a run by name or ID and show its graph.',
                ParameterSchema: {
                    type: 'object',
                    properties: { run: { type: 'string' } },
                    required: ['run'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const wanted = String(params['run'] ?? '').trim().toLowerCase();
                    const match =
                        this.Runs.find((r) => UUIDsEqual(r.ID, wanted)) ??
                        this.Runs.find((r) => r.Name.trim().toLowerCase() === wanted) ??
                        this.Runs.find((r) => r.Name.toLowerCase().includes(wanted));
                    if (!match) {
                        const available = this.Runs.slice(0, 25).map((r) => r.Name).join(', ');
                        return { Success: false, Message: `No run matched "${params['run']}". Available: ${available}` };
                    }
                    this.SelectedRunID = match.ID;
                    this.publishAgentContext();
                    this.cdr.markForCheck();
                    return { Success: true, Data: { RunID: match.ID, Name: match.Name, Status: match.Status } };
                },
            },
            {
                Name: 'RefreshWorkflowRuns',
                Description: 'Reload the run list.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.loadData();
                    return { Success: true, Data: { RunCount: this.Runs.length } };
                },
            },
        ]);
    }
}
