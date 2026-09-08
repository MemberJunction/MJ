import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJTaskDependencyEntity, MJTaskEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { ComputeTasksToBlock, type TaskGraphNode, type TaskGraphEdge } from '@memberjunction/ai-core-plus';
import { ParseJSONOptions, ParseJSONRecursive, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, BaseResourceComponent } from '@memberjunction/ng-shared';
import { TaskGraphDebuggerComponent, type TaskGraphRunFrame } from '@memberjunction/ng-task-graph-editor';
import { SortWorkflowRuns, type WorkflowRunSortColumn } from './workflow-run-sorting';
import { WorkflowRunLayout } from './workflow-run-layout';
import {
    EmptyDebugState,
    ParseWorkflowRunParentBag,
    TryParseJsonObject,
    type WorkflowRunDebugState,
    type WorkflowRunInvocation,
    type WorkflowStall,
} from './workflow-run-debug-state';

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
export class WorkflowRunsResourceComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
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

    /**
     * The legend was toggled on the canvas toolbar — remember it.
     *
     * Driven from the toolbar rather than a button of our own: the canvas already has a legend
     * control in the place people look for one, and adding a second in the header would be two
     * controls for one setting, free to disagree.
     */
    public OnLegendToggled(show: boolean): void {
        this.Layout.SetLegendVisible(show);
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
        this.SelectedDeps = [];
        this.SelectedEdgeID = null;
        this.InspectorMode = 'step';
        this.resetEditors();
        this.detachFrames();
        this.ReplayPercent = null;
        this.GraphSettled = false;
        this.DebugState = EmptyDebugState();
        this.Invocation = {};
        // Frames are owned by <mj-task-graph-debugger>; it re-emits them for stall/engine chrome.
        this.publishAgentContext();
        this.cdr.markForCheck();
        if (!closing) {
            void this.loadSteps(run.ID);
            void this.loadDebugState(run.ID);
        }
    }

    // ─── live console: frames ────────────────────────────────────────────────
    //
    // <mj-task-graph-debugger> owns the frame subscription and re-emits each one. This host only
    // listens for stall / engine-tick chrome. Frames are ADVISORY; the widget's row reads remain
    // the truth, reconciled on settlement.

    /** The newest frame, bound straight into the run view for sub-second canvas updates. */
    @ViewChild(TaskGraphDebuggerComponent) public GraphDebug: TaskGraphDebuggerComponent | undefined;

    public LatestFrame: TaskGraphRunFrame | null = null;
    /** The engine's recent heartbeat ticks (`PassCompleted`), newest last. Bounded. */
    public EngineTicks: TaskGraphRunFrame[] = [];
    /** Everything seen this session for the selected run, newest first. Bounded. */
    public FrameLog: TaskGraphRunFrame[] = [];
    /** Whether the selected run is paused (from `GraphPaused`/`GraphResumed` frames + verbs). */
    public DebugPaused = false;
    /** Children are all terminal — the durable bag can still say paused after the last continue. */
    public GraphSettled = false;
    /** A one-line diagnosis when the engine reports trouble — a lost worker, a held path. */
    public StallNotice: string | null = null;
    /** Structured stall so a held edge can be answered, not just named. */
    public Stall: WorkflowStall | null = null;
    /** Durable debug state from the parent row — frames are advisory, this is the truth. */
    public DebugState: WorkflowRunDebugState = EmptyDebugState();
    /** Invocation `data`/`context` roots from the same parent bag (R3-3). */
    public Invocation: WorkflowRunInvocation = {};
    /** Selected path, when the person clicked an edge rather than a step. */
    public SelectedEdgeID: string | null = null;
    public InspectorMode: 'step' | 'edge' = 'step';
    /** Force-complete confirmation + output editor. */
    public ForceCompleteOpen = false;
    public ForceCompleteJson = '{}';
    public ForceCompleteName = '';
    public ForceCompleteError: string | null = null;
    /** Edit-input editor (Pending → UpdateTaskInput, Failed → RetryTask). */
    public EditInputOpen = false;
    public EditInputJson = '';
    public EditInputError: string | null = null;
    /** True while a control verb round-trips, so the toolbar cannot double-fire. */
    public get ControlBusy(): boolean {
        return this.GraphDebug?.Busy === true;
    }
    /** Replay position for a settled run: 0–100 along its wall-clock span, or null for "now". */
    public ReplayPercent: number | null = null;

    /** Dependencies of the selected run's steps, for the what-if preview. */
    public SelectedDeps: MJTaskDependencyEntity[] = [];

    private static readonly FRAME_LOG_LIMIT = 250;
    private static readonly ENGINE_TICK_LIMIT = 10;

    public override ngOnDestroy(): void {
        this.detachFrames();
        super.ngOnDestroy();
    }

    private isLiveStatus(status: string): boolean {
        return status === 'In Progress' || status === 'Running' || status === 'Pending';
    }

    private detachFrames(): void {
        this.LatestFrame = null;
        this.DebugPaused = false;
        this.StallNotice = null;
        this.Stall = null;
    }

    public OnFrame(frame: TaskGraphRunFrame): void {
        this.LatestFrame = frame;
        this.FrameLog = [frame, ...this.FrameLog].slice(0, WorkflowRunsResourceComponent.FRAME_LOG_LIMIT);

        switch (frame.kind) {
            case 'PassCompleted':
                this.EngineTicks = [...this.EngineTicks, frame].slice(-WorkflowRunsResourceComponent.ENGINE_TICK_LIMIT);
                break;
            case 'GraphPaused':
            case 'BreakpointHit':
                if (this.GraphSettled) break; // bag can still say paused after the last step
                this.DebugPaused = true;
                if (this.SelectedRunID) void this.loadDebugState(this.SelectedRunID);
                break;
            case 'GraphResumed':
                this.DebugPaused = false;
                if (this.SelectedRunID) void this.loadDebugState(this.SelectedRunID);
                break;
            case 'ClaimChanged':
                if (frame.claimEvent === 'heartbeat-lost') {
                    this.setStall({
                        kind: 'worker-lost',
                        message: `"${frame.taskName ?? 'A step'}" lost its worker — the engine will requeue it.`,
                        taskName: frame.taskName,
                        taskID: frame.taskId,
                    });
                } else if (frame.claimEvent === 'reclaimed') {
                    this.clearStall();
                }
                break;
            case 'GateDecision':
                if (frame.verdict === 'held') {
                    this.setStall({
                        kind: 'held',
                        message: `"${frame.taskName ?? 'A step'}" is waiting on a path that can't be answered.`,
                        taskName: frame.taskName,
                        taskID: frame.taskId,
                        edgeID: frame.edgeId,
                        conditionText: frame.conditionText,
                        reason: frame.reason,
                    });
                }
                break;
            case 'StepRefused':
                this.setStall({
                    kind: 'step-refused',
                    message: frame.reason ?? 'The step could not start yet; it stays queued.',
                    reason: frame.reason,
                });
                break;
            case 'GraphSettled':
                this.markGraphSettled();
                this.clearStall();
                void this.loadData(); // the list row's status/duration just changed
                if (this.SelectedRunID) {
                    void this.loadSteps(this.SelectedRunID);
                    void this.loadDebugState(this.SelectedRunID);
                }
                break;
            case 'TaskCompleted':
            case 'TaskFailed':
            case 'TaskSkipped':
            case 'TaskBlocked':
                // Keep the step list in agreement with the canvas the frame just updated.
                if (this.SelectedRunID) void this.loadSteps(this.SelectedRunID);
                break;
        }
        this.cdr.markForCheck();
    }

    // ─── live console: control verbs ────────────────────────────────────────
    //
    // The drop-in debugger owns RouteOperation. These handlers just call its verbs.

    public async OnPauseRun(): Promise<void> {
        await this.GraphDebug?.Pause();
        this.DebugPaused = true;
        this.cdr.markForCheck();
    }

    public async OnResumeRun(): Promise<void> {
        await this.GraphDebug?.Resume();
        this.DebugPaused = false;
        this.cdr.markForCheck();
    }

    public async OnStepRun(target: 'one' | 'wave'): Promise<void> {
        await this.GraphDebug?.Step(target);
    }

    public async OnCancelRun(): Promise<void> {
        await this.GraphDebug?.Cancel();
        await this.loadData();
    }

    public async OnSkipStep(step: WorkflowRunStep): Promise<void> {
        await this.GraphDebug?.SkipTask(step.ID);
        if (this.SelectedRunID) void this.loadSteps(this.SelectedRunID);
    }

    public async OnRetryStep(step: WorkflowRunStep): Promise<void> {
        await this.GraphDebug?.RetryTask(step.ID);
        if (this.SelectedRunID) void this.loadSteps(this.SelectedRunID);
    }

    public async OnBreakpointToggled(event: { TaskID: string; Enabled: boolean }): Promise<void> {
        await this.GraphDebug?.ToggleBreakpoint(event.TaskID, event.Enabled);
    }

    public async OnRemoveBreakpoint(taskID: string): Promise<void> {
        await this.OnBreakpointToggled({ TaskID: taskID, Enabled: false });
    }

    public OnSelectBreakpoint(taskID: string): void {
        const step = this.SelectedSteps.find((s) => UUIDsEqual(s.ID, taskID));
        if (step) this.OnSelectStep(step);
        else {
            this.SelectedStepID = taskID;
            this.InspectorMode = 'step';
            if (!this.Layout.StepPanelOpen) this.ToggleStepPanel();
            this.cdr.markForCheck();
        }
    }

    public async OnOverrideEdge(edgeID: string, verdict: 'true' | 'false' | null): Promise<void> {
        await this.GraphDebug?.OverrideEdge(edgeID, verdict);
        if (verdict != null) this.clearStall();
    }

    public OnGraphConnectionSelected(event: { EdgeID: string | null; FromTaskID: string; ToTaskID: string }): void {
        if (!event.EdgeID) return;
        this.SelectedEdgeID = event.EdgeID;
        this.InspectorMode = 'edge';
        if (!this.Layout.StepPanelOpen) this.ToggleStepPanel();
        this.cdr.markForCheck();
    }

    public get SelectedEdge(): MJTaskDependencyEntity | null {
        if (!this.SelectedEdgeID) return null;
        return this.SelectedDeps.find((d) => UUIDsEqual(d.ID, this.SelectedEdgeID!)) ?? null;
    }

    public get SelectedEdgeIsConditional(): boolean {
        return !!this.SelectedEdge?.Condition?.trim();
    }

    public get SelectedEdgeOverride(): 'true' | 'false' | null {
        if (!this.SelectedEdgeID) return null;
        return this.GraphDebug?.GetEdgeOverride(this.SelectedEdgeID) ?? null;
    }

    public get SelectedEdgeFromName(): string {
        const edge = this.SelectedEdge;
        if (!edge) return '';
        return this.SelectedSteps.find((s) => UUIDsEqual(s.ID, edge.DependsOnTaskID))?.Name ?? 'upstream';
    }

    public get SelectedEdgeToName(): string {
        const edge = this.SelectedEdge;
        if (!edge) return '';
        return this.SelectedSteps.find((s) => UUIDsEqual(s.ID, edge.TaskID))?.Name ?? 'downstream';
    }

    public StepName(taskID: string): string {
        return this.SelectedSteps.find((s) => UUIDsEqual(s.ID, taskID))?.Name ?? 'a step';
    }

    public HasBreakpoint(taskID: string): boolean {
        return this.GraphDebug?.HasBreakpoint(taskID) ?? false;
    }

    /** Live or paused — the VS Code bar is how you drive it, including a start-paused debug. */
    public CanDriveRun(run: { Status: string }): boolean {
        if (this.IsRunSettled(run)) return false;
        return run.Status === 'In Progress' || run.Status === 'Running' || run.Status === 'Pending' || this.DebugPaused;
    }

    public IsRunSettled(run: { Status: string }): boolean {
        return this.GraphSettled
            || run.Status === 'Complete'
            || run.Status === 'Failed'
            || run.Status === 'Cancelled';
    }

    public OnCanvasSettled(): void {
        this.markGraphSettled();
        this.cdr.markForCheck();
    }

    private markGraphSettled(): void {
        this.GraphSettled = true;
        this.DebugPaused = false;
        this.DebugState = { ...this.DebugState, paused: false, pausedAtTaskID: null };
    }

    public StepPayload(step: WorkflowRunStep, field: 'InputPayload' | 'OutputPayload'): string | null {
        const value = step.Record[field];
        if (typeof value === 'string') return value;
        if (value == null) return null;
        return JSON.stringify(value);
    }

    public OnBreakpointCheckbox(step: WorkflowRunStep, event: Event): void {
        const target = event.target;
        const enabled = target instanceof HTMLInputElement && target.checked;
        void this.OnBreakpointToggled({ TaskID: step.ID, Enabled: enabled });
    }

    public CanForceComplete(step: WorkflowRunStep): boolean {
        if (this.isHumanStep(step)) return false;
        return step.Status === 'Pending' || step.Status === 'Failed' || step.Status === 'Blocked';
    }

    public CanEditInput(step: WorkflowRunStep): boolean {
        return step.Status === 'Pending' || step.Status === 'Failed';
    }

    public OpenForceComplete(step: WorkflowRunStep): void {
        this.ForceCompleteOpen = true;
        this.ForceCompleteJson = this.prettyJson(step.Record['OutputPayload']) || '{}';
        this.ForceCompleteName = '';
        this.ForceCompleteError = null;
        this.EditInputOpen = false;
        this.cdr.markForCheck();
    }

    public OpenEditInput(step: WorkflowRunStep): void {
        this.EditInputOpen = true;
        this.EditInputJson = this.prettyJson(step.Record['InputPayload']) || '{}';
        this.EditInputError = null;
        this.ForceCompleteOpen = false;
        this.cdr.markForCheck();
    }

    public async SubmitForceComplete(step: WorkflowRunStep): Promise<void> {
        if (this.ForceCompleteName.trim() !== step.Name) {
            this.ForceCompleteError = 'Type the step name exactly to confirm.';
            this.cdr.markForCheck();
            return;
        }
        const parsed = TryParseJsonObject(this.ForceCompleteJson);
        if (!parsed.ok) {
            this.ForceCompleteError = parsed.error;
            this.cdr.markForCheck();
            return;
        }
        this.ForceCompleteError = null;
        const ok = await this.GraphDebug?.ForceCompleteTask(step.ID, parsed.value);
        if (ok) {
            this.ForceCompleteOpen = false;
            if (this.SelectedRunID) void this.loadSteps(this.SelectedRunID);
        }
    }

    public async SubmitEditInput(step: WorkflowRunStep): Promise<void> {
        const parsed = TryParseJsonObject(this.EditInputJson);
        if (!parsed.ok) {
            this.EditInputError = parsed.error;
            this.cdr.markForCheck();
            return;
        }
        this.EditInputError = null;
        const ok = step.Status === 'Failed'
            ? await this.GraphDebug?.RetryTask(step.ID, parsed.value)
            : await this.GraphDebug?.UpdateTaskInput(step.ID, parsed.value);
        if (ok) {
            this.EditInputOpen = false;
            if (this.SelectedRunID) void this.loadSteps(this.SelectedRunID);
        }
    }

    public get InvocationJson(): string {
        return JSON.stringify(
            ParseJSONRecursive(
                { data: this.Invocation.data ?? null, context: this.Invocation.context ?? null },
                JSON_PARSE_OPTIONS,
            ),
            null,
            2,
        );
    }

    public get HasInvocation(): boolean {
        return this.Invocation.data != null || this.Invocation.context != null;
    }

    // ─── live console: inspector data ───────────────────────────────────────

    /** The newest claim event seen for the selected step, if any. */
    public get SelectedStepClaim(): TaskGraphRunFrame | null {
        if (!this.SelectedStepID) return null;
        return this.FrameLog.find((f) => f.kind === 'ClaimChanged' && UUIDsEqual(f.taskId ?? '', this.SelectedStepID!)) ?? null;
    }

    /** Latest verdict per path into/out of the selected step — "why did this branch run". */
    public get SelectedStepVerdicts(): TaskGraphRunFrame[] {
        if (!this.SelectedStepID) return [];
        const byEdge = new Map<string, TaskGraphRunFrame>();
        // FrameLog is newest-first, so the first sighting per edge is the latest verdict.
        for (const f of this.FrameLog) {
            if (f.kind !== 'GateDecision' || !f.edgeId) continue;
            const touches = UUIDsEqual(f.taskId ?? '', this.SelectedStepID) || UUIDsEqual(f.dependsOnTaskId ?? '', this.SelectedStepID);
            if (touches && !byEdge.has(f.edgeId)) byEdge.set(f.edgeId, f);
        }
        return [...byEdge.values()];
    }

    /** What the selected step's runner last said it was doing. */
    public get SelectedStepProgress(): TaskGraphRunFrame | null {
        if (!this.SelectedStepID) return null;
        return this.FrameLog.find((f) => f.kind === 'NodeProgress' && UUIDsEqual(f.taskId ?? '', this.SelectedStepID!)) ?? null;
    }

    /**
     * What-if: how many steps would be cut off if the selected step failed — computed with the
     * engine's OWN blocking algorithm over the loaded rows, so the preview cannot disagree with
     * what the dispatcher would actually do.
     */
    public get SelectedStepWhatIf(): { BlockedCount: number } | null {
        const step = this.SelectedStep;
        if (!step || this.SelectedSteps.length === 0) return null;
        const nodes: TaskGraphNode[] = this.SelectedSteps.map((s) => ({
            id: s.ID,
            status: (UUIDsEqual(s.ID, step.ID) ? 'Failed' : s.Status) as TaskGraphNode['status'],
        }));
        const edges: TaskGraphEdge[] = this.SelectedDeps.map((d) => ({
            taskId: d.TaskID,
            dependsOnTaskId: d.DependsOnTaskID,
            dependencyType: d.DependencyType as TaskGraphEdge['dependencyType'],
        }));
        const blocked = ComputeTasksToBlock(nodes, edges, new Set());
        return { BlockedCount: [...blocked].filter((id) => !UUIDsEqual(id, step.ID)).length };
    }

    // ─── live console: replay ───────────────────────────────────────────────

    /** Whether the selected run can be scrubbed — it has settled and has a wall-clock span. */
    public get CanReplay(): boolean {
        const run = this.SelectedRun;
        return !!run && !this.isLiveStatus(run.Status) && !!run.StartedAt && !!run.CompletedAt;
    }

    /** The scrub position as a timestamp inside the run's span, or null when showing the present. */
    public get ReplayAt(): Date | null {
        const run = this.SelectedRun;
        if (this.ReplayPercent == null || !run?.StartedAt || !run?.CompletedAt) return null;
        const start = run.StartedAt.getTime();
        const end = run.CompletedAt.getTime();
        return new Date(start + (end - start) * (this.ReplayPercent / 100));
    }

    public OnReplayScrub(value: string | number): void {
        const pct = Math.max(0, Math.min(100, Number(value)));
        this.ReplayPercent = Number.isFinite(pct) ? pct : null;
        this.cdr.markForCheck();
    }

    public OnReplayReset(): void {
        this.ReplayPercent = null;
        this.cdr.markForCheck();
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
            // The edges too, for the what-if preview — same rows the run view reads for the canvas.
            const deps = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskDependencyEntity>({
                EntityName: 'MJ: Task Dependencies',
                ExtraFilter: `TaskID IN (SELECT ID FROM __mj.Task WHERE ParentID='${parentTaskID}')`,
                ResultType: 'entity_object',
                BypassCache: true,
            });
            if (!UUIDsEqual(this.SelectedRunID ?? '', parentTaskID)) return; // selection moved on
            this.SelectedDeps = (deps.Success ? (deps.Results ?? []) : []);
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
        this.InspectorMode = 'step';
        // Asking to see a step is asking for the panel. Leaving it closed would make the click look
        // like it did nothing.
        if (!this.Layout.StepPanelOpen) this.ToggleStepPanel();
        this.cdr.markForCheck();
    }

    public OnSelectStep(step: WorkflowRunStep): void {
        this.SelectedStepID = UUIDsEqual(this.SelectedStepID ?? '', step.ID) ? null : step.ID;
        this.InspectorMode = 'step';
        this.resetEditors();
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

    private async loadDebugState(parentTaskID: string): Promise<void> {
        try {
            const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskEntity>({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ID='${parentTaskID}'`,
                ResultType: 'entity_object',
                BypassCache: true,
            });
            if (!UUIDsEqual(this.SelectedRunID ?? '', parentTaskID)) return;
            const parent = result.Success ? result.Results?.[0] : undefined;
            const bag = ParseWorkflowRunParentBag(parent?.InputPayload);
            this.Invocation = bag.invocation;
            // Settled trumps the durable bag: $.debug.paused can still be true after the last
            // continue, and painting that as "paused here" hides that the run is over.
            if (this.GraphSettled) {
                this.DebugState = { ...bag.debug, paused: false, pausedAtTaskID: null };
                this.DebugPaused = false;
            } else {
                this.DebugState = bag.debug;
                this.DebugPaused = bag.debug.paused;
            }
        } catch {
            // A failed parent read leaves the last known debug state; frames remain the safety net.
        }
        this.cdr.markForCheck();
    }

    private setStall(stall: WorkflowStall): void {
        this.Stall = stall;
        this.StallNotice = stall.message;
    }

    private clearStall(): void {
        this.Stall = null;
        this.StallNotice = null;
    }

    public OnDismissStall(): void {
        this.clearStall();
        this.cdr.markForCheck();
    }

    private resetEditors(): void {
        this.ForceCompleteOpen = false;
        this.ForceCompleteError = null;
        this.EditInputOpen = false;
        this.EditInputError = null;
    }

    private isHumanStep(step: WorkflowRunStep): boolean {
        const userID = step.Record['UserID'];
        return typeof userID === 'string' && userID.trim().length > 0;
    }

    private prettyJson(value: unknown): string {
        if (value == null || value === '') return '';
        if (typeof value === 'string') {
            try {
                return JSON.stringify(JSON.parse(value), null, 2);
            } catch {
                return value;
            }
        }
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return '';
        }
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
