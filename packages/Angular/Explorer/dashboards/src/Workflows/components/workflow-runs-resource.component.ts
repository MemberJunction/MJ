import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJTaskEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { ParseJSONOptions, ParseJSONRecursive, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, BaseResourceComponent } from '@memberjunction/ng-shared';
import { SortWorkflowRuns, type WorkflowRunSortColumn } from './workflow-run-sorting';
import { WorkflowRunLayout } from './workflow-run-layout';

/** Below this the detail pane cannot hold a canvas AND a JSON pane side by side. */
const STACK_INNER_BELOW_PX = 1100;

/**
 * How the JSON panes unpack nested JSON.
 *
 * A task's `Configuration` and payloads are JSON stored inside a string column, so without this the
 * viewer shows one very long escaped line — technically the truth, and unreadable. Matches what the
 * agent-run detail panel does, so the same record reads the same way in both places.
 */
const JSON_PARSE_OPTIONS: ParseJSONOptions = { extractInlineJson: true, maxDepth: 100, debug: false };

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

// The sort column type and the ordering itself live in `workflow-run-sorting`, which is pure and
// therefore testable without standing up the component. Re-exported so existing importers of this
// module keep resolving.
export type { WorkflowRunSortColumn } from './workflow-run-sorting';

/** What the detail panel is showing for the selected run. */
export type WorkflowRunDetailTab = 'graph' | 'json';

/**
 * One step of a run, for the detail panel's step list and JSON view.
 *
 * The whole entity is kept, not a projection: the JSON view exists precisely so someone can read
 * everything the row holds, and a projection would decide for them what is worth seeing.
 */
export type WorkflowRunStep = {
    ID: string;
    Name: string;
    Status: string;
    StepType: string | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    /** Every column of the row, for the JSON pane. */
    Record: Record<string, unknown>;
};

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
// Registered against BaseResourceComponent, NOT BaseDashboard — while still extending BaseDashboard
// for its lifecycle (initDashboard/loadData and the automatic NotifyLoadComplete).
//
// The registration key is what the shell looks the component up by, and a nav item with
// `ResourceType: "Custom"` is resolved through BaseResourceComponent. Registered under BaseDashboard
// this class was never found: the Runs tab rendered "No component is registered for driver class
// WorkflowRunsResource", which reads as a packaging problem and is really a one-word mismatch.
// Its sibling WorkflowsResourceComponent had it right, which is what made the difference visible.
@RegisterClass(BaseResourceComponent, 'WorkflowRunsResource')
export class WorkflowRunsResourceComponent extends BaseDashboard implements AfterViewInit {
    public IsLoading = false;
    public LoadError: string | null = null;

    public Runs: WorkflowRunRow[] = [];
    public StatusFilter: WorkflowRunStatusFilter = 'all';
    public SearchText = '';

    /** The run whose graph is showing in the detail panel, or null. */
    public SelectedRunID: string | null = null;

    public readonly StatusFilters = STATUS_FILTERS;

    /**
     * Ordering. Newest-first by default, because "what just happened" is the question a run list is
     * usually opened to answer.
     */
    public SortColumn: WorkflowRunSortColumn = 'StartedAt';
    public SortDescending = true;

    /** What the detail panel is showing. */
    public DetailTab: WorkflowRunDetailTab = 'graph';

    /** The selected run's steps, loaded when a run is opened. */
    public SelectedSteps: WorkflowRunStep[] = [];
    public StepsLoading = false;

    /** The step whose JSON is showing, or null when none is selected. */
    public SelectedStepID: string | null = null;

    /**
     * Pane sizes, panel visibility and the legend toggle — the rules live in `workflow-run-layout`,
     * which is pure and therefore testable without standing up Angular.
     *
     * Preferences go through `UserInfoEngine` (`MJ: User Settings`), never `localStorage`: a pane
     * width that vanishes when someone opens a different browser is exactly the kind of preference
     * people notice when it disappears. Reads are a synchronous cache hit; writes are debounced,
     * because dragging a splitter fires continuously.
     */
    public readonly Layout = new WorkflowRunLayout({
        Get: (key) => UserInfoEngine.Instance.GetSetting(key),
        Set: (key, value) => UserInfoEngine.Instance.SetSettingDebounced(key, value),
    });

    /** Stacked rather than side-by-side when the detail pane is too narrow for both. */
    public InnerSplitDirection: 'horizontal' | 'vertical' = 'horizontal';

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflow Runs';
    }

    initDashboard(): void {
        this.Layout.Restore();
        this.applyViewportRules();
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
    }

    /** Re-evaluates the stacking rule; the detail pane's width follows the window's. */
    @HostListener('window:resize')
    public onViewportResized(): void {
        const before = this.InnerSplitDirection;
        this.applyViewportRules();
        if (before !== this.InnerSplitDirection) this.cdr.markForCheck();
    }

    private applyViewportRules(): void {
        // Three columns on a laptop gives each about 400px and the canvas stops being usable, so the
        // inner pair stacks instead. Mirrors the outer split's existing breakpoint rather than
        // inventing a second responsive scheme.
        this.InnerSplitDirection = window.innerWidth < STACK_INNER_BELOW_PX ? 'vertical' : 'horizontal';
    }

    public OnSplitDragEnd(sizes: readonly (number | '*')[]): void {
        this.Layout.OnSplitDragEnd(sizes);
    }

    public OnStepSplitDragEnd(sizes: readonly (number | '*')[]): void {
        this.Layout.OnStepSplitDragEnd(sizes);
    }

    public ToggleStepPanel(): void {
        this.Layout.ToggleStepPanel();
        this.cdr.markForCheck();
    }

    public ToggleLegend(): void {
        this.Layout.ToggleLegend();
        this.cdr.markForCheck();
    }

    /** The rows after the active filter and search, in the chosen order — what the template renders. */
    public get VisibleRuns(): WorkflowRunRow[] {
        const wanted = this.SearchText.trim().toLowerCase();
        const filtered = this.Runs.filter((r) => {
            if (this.StatusFilter !== 'all' && r.Status !== this.StatusFilter) return false;
            return !wanted || r.Name.toLowerCase().includes(wanted);
        });
        return this.sortRuns(filtered);
    }

    /** Ordering — see `workflow-run-sorting` for the rules and why unset always sorts last. */
    private sortRuns(rows: WorkflowRunRow[]): WorkflowRunRow[] {
        return SortWorkflowRuns(rows, this.SortColumn, this.SortDescending);
    }

    /**
     * Sorts by a column, flipping direction when it is already the active one.
     *
     * Time columns start descending (newest first) and text columns ascending (A→Z), because that is
     * what each is normally wanted in — a first click that produced the least useful order would
     * just mean everyone clicks twice.
     */
    public OnSort(column: WorkflowRunSortColumn): void {
        if (this.SortColumn === column) {
            this.SortDescending = !this.SortDescending;
        } else {
            this.SortColumn = column;
            this.SortDescending = column === 'StartedAt' || column === 'CompletedAt' || column === 'Duration';
        }
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** The sort indicator for a column header: none, ascending, or descending. */
    public SortIcon(column: WorkflowRunSortColumn): string {
        if (this.SortColumn !== column) return 'fa-solid fa-sort';
        return this.SortDescending ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up';
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
        const closing = UUIDsEqual(this.SelectedRunID ?? '', run.ID);
        this.SelectedRunID = closing ? null : run.ID;
        this.SelectedStepID = null;
        this.SelectedSteps = [];
        this.publishAgentContext();
        this.cdr.markForCheck();
        if (!closing) void this.loadSteps(run.ID);
    }

    /**
     * Loads the selected run's steps.
     *
     * On selection rather than with the list, because a run list of 200 would otherwise pull every
     * step of every run to show the one a person opened. `BypassCache` because the dispatcher
     * advances tasks through direct SQL, which fires no cache invalidation — a cached read here can
     * hand back the state the graph was in when it started.
     */
    private async loadSteps(parentTaskID: string): Promise<void> {
        this.StepsLoading = true;
        this.cdr.markForCheck();
        try {
            const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskEntity>({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID='${parentTaskID}'`,
                // The same ordering rule the run tree uses: what ran, in the order it ran, with work
                // that never started at the end. `__mj_CreatedAt` alone is the COMPILER's walk
                // order, which has nothing to do with execution.
                OrderBy: 'CASE WHEN StartedAt IS NULL THEN 1 ELSE 0 END, StartedAt, __mj_CreatedAt',
                ResultType: 'entity_object',
                BypassCache: true,
            });
            if (!UUIDsEqual(this.SelectedRunID ?? '', parentTaskID)) return; // selection moved on
            this.SelectedSteps = (result.Success ? (result.Results ?? []) : []).map((t) => ({
                ID: t.ID,
                Name: t.Name ?? '(unnamed step)',
                Status: t.Status,
                StepType: t.StepType,
                StartedAt: t.StartedAt,
                CompletedAt: t.CompletedAt,
                Record: t.GetAll(),
            }));
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.SelectedSteps = [];
        } finally {
            this.StepsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** A node was clicked on the canvas — show that step's JSON. */
    public OnGraphNodeSelected(event: { TaskID: string }): void {
        this.SelectedStepID = event.TaskID;
        // Asking to see a step is asking for the panel. Leaving it closed would make the click look
        // like it did nothing.
        if (!this.Layout.StepPanelOpen) this.ToggleStepPanel();
        this.cdr.markForCheck();
    }

    public OnSelectStep(step: WorkflowRunStep): void {
        this.SelectedStepID = UUIDsEqual(this.SelectedStepID ?? '', step.ID) ? null : step.ID;
        this.cdr.markForCheck();
    }

    public OnDetailTab(tab: WorkflowRunDetailTab): void {
        this.DetailTab = tab;
        this.cdr.markForCheck();
    }

    public get SelectedStep(): WorkflowRunStep | null {
        return this.SelectedSteps.find((s) => UUIDsEqual(s.ID, this.SelectedStepID ?? '')) ?? null;
    }

    /** The selected step, as formatted JSON for the viewer. */
    public get SelectedStepJson(): string {
        const step = this.SelectedStep;
        return step ? JSON.stringify(ParseJSONRecursive(step.Record, JSON_PARSE_OPTIONS), null, 2) : '{}';
    }

    /**
     * The whole run as JSON — the graph row and every step under it.
     *
     * Nested JSON is parsed rather than left as escaped strings, so `Configuration` and the payloads
     * read as structure instead of a single unbroken line. That is the difference between a JSON tab
     * someone can use and one they copy elsewhere to make readable.
     */
    public get SelectedRunJson(): string {
        const run = this.SelectedRun;
        if (!run) return '{}';
        return JSON.stringify(
            ParseJSONRecursive(
                {
                    Run: {
                        ID: run.ID,
                        Name: run.Name,
                        Status: run.Status,
                        StartedAt: run.StartedAt,
                        CompletedAt: run.CompletedAt,
                        Duration: run.Duration,
                        AgentRunID: run.AgentRunID,
                    },
                    Steps: this.SelectedSteps.map((s) => s.Record),
                },
                JSON_PARSE_OPTIONS,
            ),
            null,
            2,
        );
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
