/**
 * @fileoverview Watching a graph that is running, on the canvas its author drew on.
 *
 * **Why this is a component and not three.** A run needs rendering in at least three places — inside
 * an Agent Run, inside the test harness, and on a standalone workflow-runs screen — and every one of
 * them wants the identical thing: the graph, with live status, laid out legibly, with a node you can
 * click. Three implementations would be three chances to render the same run differently, and the
 * one that matters most (is that branch grey because it was *not taken*, or because it *broke*?) is
 * exactly the distinction a second implementation gets wrong.
 *
 * **What it owns and what it doesn't.** It owns data acquisition — reading `MJ: Tasks` and
 * `MJ: Task Dependencies` through the host's provider — and geometry. It does not navigate: a
 * widgets-layer component cannot know whether it sits inside Explorer, so selecting a node emits an
 * event and the host decides what "open the agent run" means. That boundary is the whole reason
 * this can live beside the editor rather than in Explorer.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnDestroy,
    Output,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { LogError, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJTaskEntity, MJTaskDependencyEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ToPaneSizePair } from './pane-split';
import { TaskGraphRunPrefsStore, type TaskGraphRunPrefs } from './task-graph-run-prefs';
import {
    GraphLayoutBounds,
    LayoutGraphNodes,
    ProjectTaskRowsToSpec,
    type GraphLayoutEdge,
    type GraphNodePosition,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { BuildRuntimeStatus, IsRuntimeSettled, NormalizeRuntimeState } from './task-graph-runtime-source';
import type { TaskGraphDebugOverlay, TaskGraphRuntimeStatus } from './task-graph-canvas-adapter';
import type { TaskGraphSelectionChangedEventArgs } from './task-graph-editor-events';
import { StepIDOfTask } from './remembered-breakpoints';
import type {
    FlowAfterContextMenuActionEventArgs,
    FlowBeforeContextMenuEventArgs,
    FlowConnection,
    FlowLayoutDirection,
    FlowNode,
    FlowToolbarAlign,
    FlowToolbarVisibility,
} from '@memberjunction/ng-flow-editor';
import {
    BuildTaskGraphDiagnostic,
    ExtractGraphTelemetry,
    type ExtractedGraphTelemetry,
    type TaskGraphDiagnosticNotice,
} from './task-graph-diagnostics';

/** Adaptive layout density for embedding `<mj-task-graph-run-view>` / `<mj-task-graph-debugger>` across hosts. */
export type TaskGraphDensity = 'auto' | 'console' | 'embedded';

/** What the host learns when someone clicks a step. */
export type TaskGraphRunNodeSelectedEvent = {
    /** The `MJ: Tasks` row id. */
    TaskID: string;
    Task: MJTaskEntity | null;
};

/** What the host learns when someone clicks a path. */
export type TaskGraphRunConnectionSelectedEvent = {
    /** The `MJ: Task Dependencies` row id, when the projection carried one. */
    EdgeID: string | null;
    FromTaskID: string;
    ToTaskID: string;
    Condition?: string;
};

/**
 * One live dispatcher frame, as the HOST hands it in.
 *
 * Structural on purpose: the widget must not import the transport (`GraphQLDataProvider`'s
 * `TaskGraphFrameEvent` satisfies this shape as-is), and the host owns the subscription — this
 * component only renders what it is handed, which is the widgets-layer rule that keeps it embeddable
 * anywhere. Fields beyond these are ignored, so a newer server cannot break an older widget.
 */
export type TaskGraphRunFrame = {
    kind: string;
    taskId?: string;
    taskName?: string;
    status?: string;
    progressMessage?: string;
    progressPercent?: number;
    reason?: string;
    edgeId?: string;
    dependsOnTaskId?: string;
    conditionText?: string;
    claimEvent?: string;
    claimedBy?: string;
    verdict?: string;
    passNumber?: number;
    eligibleCount?: number;
    heldCount?: number;
    claimedCount?: number;
};

/** Statuses at which a graph has stopped moving, so polling can stop with it. */
const SETTLED = new Set<MJTaskEntity['Status']>(['Complete', 'Failed', 'Cancelled', 'Skipped']);

@Component({
    standalone: false,
    selector: 'mj-task-graph-run-view',
    templateUrl: './task-graph-run-view.component.html',
    styleUrls: ['./task-graph-run-view.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskGraphRunViewComponent extends BaseAngularComponent implements OnDestroy {
    /**
     * The graph to watch — the parent `MJ: Tasks` row that represents it.
     *
     * Setter-based rather than `ngOnChanges`, matching the editor beside it: the reaction is
     * explicit and costs nothing on unrelated change-detection passes.
     */
    @Input()
    public set ParentTaskID(value: string | null) {
        if (value === this.parentTaskID) return;
        this.parentTaskID = value;
        this.settledEmitted = false;
        this.SelectedTaskID = null;
        this.LiveActivity.clear();
        void this.load();
    }
    public get ParentTaskID(): string | null {
        return this.parentTaskID;
    }

    /** Name shown on the compiled graph. Purely cosmetic; the rows carry the truth. */
    @Input() public WorkflowName: string = 'Workflow';

    /**
     * Keep re-reading while the graph is still moving.
     *
     * Off by default: most hosts show a finished run, and a component that polls by default would
     * have every historical run quietly issuing queries forever.
     */
    @Input() public LiveUpdates: boolean = false;

    /** How often to re-read while live. Seconds, not milliseconds — this is a human-scale view. */
    @Input() public PollIntervalSeconds: number = 3;

    /** Height of the canvas. Hosts embed this in very different amounts of space. */
    @Input() public Height: string = '320px';

    /**
     * Whether the canvas legend shows. **Off by default here**, unlike the editor.
     *
     * The legend explains the authoring vocabulary — what a conditional edge means, what a duplicate
     * default looks like. That is what someone drawing a graph needs. A run view answers a different
     * question, "what happened", which the legend helps with not at all while covering a corner of
     * the canvas the graph is usually occupying.
     */
    @Input() public ShowLegend: boolean = false;

    /**
     * Whether the canvas toolbar rides above the graph.
     *
     * Debug and other run hosts leave this on and set `ToolbarVisibility` to `minimized` so the
     * graph is the picture, not a floating tool strip. The chip in the corner restores the bar.
     */
    @Input() public ShowToolbar: boolean = true;
    @Input() public ToolbarVisibility: FlowToolbarVisibility = 'minimized';
    @Input() public ToolbarAlign: FlowToolbarAlign = 'left';

    /**
     * The latest live dispatcher frame, handed in by the host.
     *
     * The host owns the subscription (`GraphQLDataProvider.TaskGraphFrames` or anything shaped like
     * it) and binds each arrival here; the widget folds it into the overlay. Frames are advisory —
     * a task frame patches the node's status in place for sub-second feedback, and the frames that
     * imply CASCADES (a skip, a block, settlement) trigger a debounced row reload, because the
     * dispatcher's propagation writes rows this component cannot infer from one frame. Rows remain
     * the truth; the existing poll (if enabled) remains the safety net.
     */
    @Input()
    public set LiveFrame(frame: TaskGraphRunFrame | null) {
        if (!frame) return;
        this.foldFrame(frame);
    }

    /**
     * Replay: render the run as it stood at this moment, reconstructed from each step's
     * `StartedAt`/`CompletedAt`. Null (the default) renders the present. A step that had not
     * started reads Pending; one mid-flight reads In Progress; one already finished reads its
     * final status — the same three answers the rows would have given a viewer at that time.
     */
    @Input()
    public set ReplayAt(value: Date | null) {
        if (value?.getTime() === this.replayAt?.getTime()) return;
        this.replayAt = value;
        this.applyReplay();
    }
    public get ReplayAt(): Date | null {
        return this.replayAt;
    }

    /**
     * Armed breakpoint task IDs, from the parent row's `$.debug.breakpoints`. Empty by default so
     * embeds (agent-run timeline, test harness) never grow debugger chrome they did not ask for.
     */
    @Input()
    public set Breakpoints(value: readonly string[]) {
        this.breakpoints = value ?? [];
        this.rebuildOverlay();
    }
    public get Breakpoints(): readonly string[] {
        return this.breakpoints;
    }
    /** The step a breakpoint actually stopped on. */
    @Input()
    public set PausedAtTaskID(value: string | null) {
        this.pausedAtTaskID = value;
        if (value) this.SelectedTaskID = value;
        this.rebuildOverlay();
    }
    public get PausedAtTaskID(): string | null {
        return this.pausedAtTaskID;
    }
    /**
     * The graph is claim-gated. Combined with `PausedAtTaskID` so start-paused (no specific
     * step yet) can still light the entry node as waiting.
     */
    @Input()
    public set GraphPaused(value: boolean) {
        this.graphPaused = value;
        this.rebuildOverlay();
    }
    public get GraphPaused(): boolean {
        return this.graphPaused;
    }
    /** Operator-forced edge verdicts, keyed by `MJ: Task Dependencies` row ID. */
    @Input()
    public set EdgeOverrides(value: Readonly<Record<string, 'true' | 'false'>>) {
        this.edgeOverrides = value ?? {};
        this.rebuildOverlay();
    }
    public get EdgeOverrides(): Readonly<Record<string, 'true' | 'false'>> {
        return this.edgeOverrides;
    }
    /**
     * Whether this host may arm/disarm breakpoints from the selected-step control.
     * Off by default — the run view also renders where those controls would be wrong.
     */
    @Input() public AllowBreakpointEditing: boolean = false;
    /** Compact debug key under the summary line. Off unless the host is a debugger. */
    @Input() public ShowDebugLegend: boolean = false;
    /** Step Inputs & Outputs (VARIABLES) inspector pane to the left of the canvas. Enabled by default across all task graph views. */
    @Input() public ShowVariables: boolean = true;
    /** The parent bag's `data` / `context` roots, for the Invocation scope. */
    @Input() public Invocation: { data?: unknown; context?: unknown } | null = null;
    /** Expand inline X-Ray telemetry panels on step nodes. */
    @Input()
    public set XRayEnabled(value: boolean) {
        if (this.xrayEnabled === value) return;
        this.xrayEnabled = value;
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }
    public get XRayEnabled(): boolean {
        return this.xrayEnabled;
    }
    /** Downstream step IDs highlighted in crimson as part of What-If failure blast-radius preview. */
    @Input()
    public set BlastRadiusTaskIDs(value: readonly string[]) {
        this.blastRadiusTaskIDs = value ?? [];
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }
    public get BlastRadiusTaskIDs(): readonly string[] {
        return this.blastRadiusTaskIDs;
    }
    /** Preserve untaken/skipped paths as muted ghosted dashed lines (default true). */
    @Input()
    public set ShowUntakenPaths(value: boolean) {
        if (this.showUntakenPaths === value) return;
        this.showUntakenPaths = value;
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }
    public get ShowUntakenPaths(): boolean {
        return this.showUntakenPaths;
    }
    /** Active layout orientation (`horizontal` matches LR run layout so ports sit left/right). */
    @Input()
    public set LayoutDirection(value: FlowLayoutDirection) {
        if (this.layoutDirection === value) return;
        this.layoutDirection = value;
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }
    public get LayoutDirection(): FlowLayoutDirection {
        return this.layoutDirection;
    }
    /** Adaptive embed density: `'console'` (full canvas), `'embedded'` (compact 360px vertical stack), or `'auto'`. */
    @Input() public Density: TaskGraphDensity = 'auto';
    /** Optional explicit diagnostic notice supplied by the host; auto-derived from live frames/rows when omitted. */
    @Input() public DiagnosticNotice: TaskGraphDiagnosticNotice | null = null;
    /** Show plain-English Diagnostic Co-Pilot banner when an actionable pause/hold/failure occurs. */
    @Input() public ShowDiagnosticBanner: boolean = true;
    /** Show docked interactive Replay Scrubber for settled runs with timestamps. */
    @Input() public ShowReplayScrubber: boolean = false;
    /** Allow targeted single-step execution (`Step(taskID)`) button inside X-Ray cards & Co-Pilot. */
    @Input()
    public set CanStepSingle(value: boolean) {
        if (this.canStepSingle === value) return;
        this.canStepSingle = value;
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }
    public get CanStepSingle(): boolean {
        return this.canStepSingle;
    }

    @Output() public NodeSelected = new EventEmitter<TaskGraphRunNodeSelectedEvent>();
    /** The legend was toggled from the toolbar, so a host can remember the choice. */
    @Output() public LegendToggled = new EventEmitter<boolean>();
    /** Emitted once, when every step has reached a terminal status. */
    @Output() public Settled = new EventEmitter<void>();
    /** A connection was clicked. `EdgeID` is the dependency row id when the projection carried one. */
    @Output() public ConnectionSelected = new EventEmitter<TaskGraphRunConnectionSelectedEvent>();
    /** Intent only — the host owns `SetBreakpoints`. */
    @Output() public BreakpointToggled = new EventEmitter<{ TaskID: string; Enabled: boolean }>();
    /**
     * Step IDs the person keeps as breakpoints for future runs of this workflow (#3798). Shown in the step's
     * context menu; empty (and the menu item hidden) unless a host remembers breakpoints.
     */
    @Input()
    public set RememberedStepIDs(value: readonly string[]) {
        this.rememberedStepIDs = value ?? [];
        this.rebuildOverlay();
    }
    public get RememberedStepIDs(): readonly string[] {
        return this.rememberedStepIDs;
    }
    /** Whether the host offers "remember for future runs" at all. */
    @Input() public AllowRememberBreakpoints: boolean = false;
    /** Intent only — the host stores the remembered set. */
    @Output() public RememberBreakpointToggled = new EventEmitter<{ TaskID: string; StepID: string; Remember: boolean }>();
    /** Intent only — the host owns `OverrideEdge`. */
    @Output() public EdgeOverrideRequested = new EventEmitter<{
        EdgeID: string;
        Verdict: 'true' | 'false' | null;
    }>();
    /** Intent only — operator asked to run one specific pending step (`Step(taskID)`). */
    @Output() public RunStepRequested = new EventEmitter<string>();
    /** Intent only — operator asked to retry a failed step from the Co-Pilot banner. */
    @Output() public RetryStepRequested = new EventEmitter<string>();
    /** Intent only — operator asked to toggle failure blast-radius preview from the Co-Pilot banner. */
    @Output() public BlastRadiusRequested = new EventEmitter<string>();
    /** Intent only — operator asked to expand an embedded 360px run view into full screen. */
    @Output() public ExpandRequested = new EventEmitter<void>();

    /** What each running step says it is doing, from `NodeProgress` frames. Keyed by task row id. */
    public LiveActivity = new Map<string, { Message: string; Percent?: number }>();

    /** The last step the person selected, so the breakpoint control has a target. */
    public SelectedTaskID: string | null = null;
    /** Stable overlay object — rebuilt only when debug inputs change, so the editor does not re-project every CD cycle. */
    public Overlay: TaskGraphDebugOverlay = { showConditions: true };

    private breakpoints: readonly string[] = [];
    private rememberedStepIDs: readonly string[] = [];
    private pausedAtTaskID: string | null = null;
    private graphPaused = false;
    private edgeOverrides: Readonly<Record<string, 'true' | 'false'>> = {};
    private xrayEnabled = false;
    private blastRadiusTaskIDs: readonly string[] = [];
    private showUntakenPaths = true;
    private layoutDirection: FlowLayoutDirection = 'horizontal';
    private canStepSingle = false;
    private latestFrame: TaskGraphRunFrame | null = null;
    private telemetry: ExtractedGraphTelemetry = {
        XRayItems: {},
        DecisionConfidence: {},
        TaintedTaskIDs: [],
        VerifiedTaskIDs: [],
        SagaCompensationLabels: {},
    };
    private diagnosticDismissed = false;
    /** Interactive replay scrubber state (0–100, null = live/present). */
    public ReplayPercent: number | null = null;
    public ReplayPlaying = false;
    private replayPlayTimer: ReturnType<typeof setInterval> | null = null;
    /** `Settled` is once-per-parent — a finished poll must not re-fire the host. */
    private settledEmitted = false;

    /** Left data pane + split sizes. One JSON bag in `MJ: User Settings`. */
    public get Prefs(): TaskGraphRunPrefs {
        return this.prefsStore.Value;
    }
    private prefsStore = new TaskGraphRunPrefsStore({
        Get: () => undefined,
        Set: () => { /* unit tests / pre-bootstrap */ },
    });

    public Spec: TaskGraphSpec | null = null;
    public RuntimeStatus: TaskGraphRuntimeStatus | null = null;
    public Positions: Map<string, GraphNodePosition> = new Map();
    public IsLoading = false;
    public ErrorMessage: string | null = null;

    /** Rows by id, so a selection event can hand the host the whole task rather than an id. */
    private taskByID = new Map<string, MJTaskEntity>();
    private parentTaskID: string | null = null;
    private replayAt: Date | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private frameReloadTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(private cdr: ChangeDetectorRef) {
        super();
        try {
            this.prefsStore = new TaskGraphRunPrefsStore({
                Get: (key) => UserInfoEngine.Instance.GetSetting(key),
                Set: (key, value) => UserInfoEngine.Instance.SetSettingDebounced(key, value),
            });
            this.prefsStore.Restore();
        } catch {
            // Engine not configured yet (unit tests, pre-bootstrap) — keep the default.
        }
    }

    public get InvocationPaneOpen(): boolean {
        return this.ShowVariables && this.Prefs.InvocationOpen;
    }

    public get InvocationPaneSize(): number {
        return this.InvocationPaneOpen ? this.Prefs.InvocationSplit[0] : 0;
    }

    public get CanvasPaneSize(): number {
        return this.InvocationPaneOpen ? this.Prefs.InvocationSplit[1] : 100;
    }

    public OnToggleInvocation(): void {
        this.prefsStore.SetInvocationOpen(!this.Prefs.InvocationOpen);
        this.cdr.markForCheck();
    }

    public OnInvocationSplitDragEnd(sizes: readonly (number | '*')[]): void {
        const pair = ToPaneSizePair(sizes);
        if (!pair) return;
        this.prefsStore.SetInvocationSplit(pair);
        this.cdr.markForCheck();
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
        this.stopPolling();
        this.stopReplayTimer();
        if (this.frameReloadTimer) {
            clearTimeout(this.frameReloadTimer);
            this.frameReloadTimer = null;
        }
    }

    /** Effective density mode ('embedded' renders a compact vertical card stack for 320–420px hosts). */
    public get IsEmbeddedMode(): boolean {
        return this.Density === 'embedded';
    }

    /** Active plain-English Co-Pilot notice, either explicit from host or auto-derived from live state. */
    public get ActiveDiagnostic(): TaskGraphDiagnosticNotice | null {
        if (!this.ShowDiagnosticBanner || this.diagnosticDismissed) return null;
        if (this.DiagnosticNotice) return this.DiagnosticNotice;
        return BuildTaskGraphDiagnostic({
            LatestFrame: this.latestFrame,
            PausedAtTaskID: this.pausedAtTaskID,
            GraphPaused: this.graphPaused,
            IsSettled: this.IsSettled,
            Tasks: this.Tasks,
        });
    }

    public OnDismissDiagnostic(): void {
        this.diagnosticDismissed = true;
        this.cdr.markForCheck();
    }

    /** Earliest and latest timestamps across loaded tasks for interactive Replay scrubbing. */
    public get ReplayBounds(): { StartMs: number; EndMs: number } | null {
        let minStart = Number.POSITIVE_INFINITY;
        let maxEnd = 0;
        for (const t of this.taskByID.values()) {
            const s = t.StartedAt ? new Date(t.StartedAt).getTime() : null;
            const e = t.CompletedAt ? new Date(t.CompletedAt).getTime() : null;
            if (s != null && Number.isFinite(s)) minStart = Math.min(minStart, s);
            if (e != null && Number.isFinite(e)) maxEnd = Math.max(maxEnd, e);
        }
        if (!Number.isFinite(minStart) || maxEnd <= minStart) return null;
        return { StartMs: minStart, EndMs: maxEnd };
    }

    public get CanShowReplayScrubber(): boolean {
        return this.ShowReplayScrubber && this.IsSettled && this.ReplayBounds != null;
    }

    public get ReplayTimeReadout(): string {
        const bounds = this.ReplayBounds;
        if (!bounds) return '';
        const spanSec = Math.max(0.1, (bounds.EndMs - bounds.StartMs) / 1000);
        const pct = this.ReplayPercent ?? 100;
        const currSec = (spanSec * (pct / 100)).toFixed(1);
        return `${currSec}s / ${spanSec.toFixed(1)}s`;
    }

    public OnReplaySliderInput(event: Event): void {
        const target = event.target;
        const raw = target instanceof HTMLInputElement ? Number(target.value) : 100;
        this.SetReplayPercent(raw);
    }

    public SetReplayPercent(percent: number | null): void {
        const bounds = this.ReplayBounds;
        if (percent == null || !bounds) {
            this.ReplayPercent = null;
            this.replayAt = null;
        } else {
            const clamped = Math.max(0, Math.min(100, percent));
            this.ReplayPercent = clamped;
            this.replayAt = clamped >= 100
                ? null
                : new Date(bounds.StartMs + (bounds.EndMs - bounds.StartMs) * (clamped / 100));
        }
        this.applyReplay();
    }

    public OnToggleReplayPlayback(): void {
        if (this.ReplayPlaying) {
            this.stopReplayTimer();
            this.cdr.markForCheck();
            return;
        }
        if ((this.ReplayPercent ?? 100) >= 100) {
            this.SetReplayPercent(0);
        }
        this.ReplayPlaying = true;
        this.replayPlayTimer = setInterval(() => {
            const next = Math.min(100, (this.ReplayPercent ?? 0) + 5);
            this.SetReplayPercent(next);
            if (next >= 100) {
                this.stopReplayTimer();
                this.cdr.markForCheck();
            }
        }, 200);
        this.cdr.markForCheck();
    }

    private stopReplayTimer(): void {
        this.ReplayPlaying = false;
        if (this.replayPlayTimer) {
            clearInterval(this.replayPlayTimer);
            this.replayPlayTimer = null;
        }
    }

    /** Direct node-gutter breakpoint click from canvas. */
    public OnCanvasNodeBreakpointClicked(node: FlowNode): void {
        if (!this.AllowBreakpointEditing) return;
        this.BreakpointToggled.emit({
            TaskID: node.ID,
            Enabled: !this.hasBreakpoint(node.ID),
        });
    }

    /** Direct X-Ray `Run This Step` click from canvas. */
    public OnCanvasNodeRunStepClicked(node: FlowNode): void {
        this.RunStepRequested.emit(node.ID);
    }

    /** Layout orientation flip (`LR ⇄ TB`) from canvas toolbar. */
    public OnCanvasLayoutDirectionChanged(direction: FlowLayoutDirection): void {
        this.layoutDirection = direction;
        this.rebuildOverlay();
        this.cdr.markForCheck();
    }

    /** Select a step from the compact embedded vertical card list. */
    public OnEmbeddedStepSelected(task: MJTaskEntity): void {
        this.SelectedTaskID = task.ID;
        this.NodeSelected.emit({ TaskID: task.ID, Task: task });
        this.cdr.markForCheck();
    }

    /** Live progress helper for embedded step cards. */
    public StepLiveProgress(taskID: string): { Message: string; Percent?: number } | null {
        return this.LiveActivity.get(taskID) ?? null;
    }

    /** Steps in a terminal state, for the host's summary line. Uses the same map the canvas paints. */
    public get CompletedCount(): number {
        return this.countRuntime('Complete');
    }

    public get TotalCount(): number {
        return this.Spec?.tasks.length ?? this.taskByID.size;
    }

    public get SkippedCount(): number {
        return this.countRuntime('Skipped');
    }

    public get RunningCount(): number {
        return this.countRuntime('In Progress');
    }

    public get IsSettled(): boolean {
        if (!this.Spec || this.Spec.tasks.length === 0) return false;
        return IsRuntimeSettled(this.RuntimeStatus ?? {}, this.Spec.tasks.map((t) => t.tempId));
    }

    /**
     * A node was selected on the canvas.
     *
     * The projected `tempId` IS the task id, so the row lookup is exact — and handing the host the
     * whole task rather than an id spares every host from re-reading a row this component already
     * holds.
     */
    public OnSelectionChanged(args: TaskGraphSelectionChangedEventArgs): void {
        const tempId = args?.Task?.tempId;
        if (!tempId) return;
        this.SelectedTaskID = tempId;
        if (this.ShowVariables && !this.Prefs.InvocationOpen) {
            this.prefsStore.SetInvocationOpen(true);
        }
        this.NodeSelected.emit({ TaskID: tempId, Task: this.taskByID.get(tempId) ?? null });
        this.cdr.markForCheck();
    }

    public OnConnectionSelected(connection: FlowConnection | null): void {
        if (!connection) {
            this.ConnectionSelected.emit({ EdgeID: null, FromTaskID: '', ToTaskID: '' });
            return;
        }
        const data = connection.Data ?? {};
        const edgeID = typeof data['EdgeID'] === 'string' ? data['EdgeID'] : null;
        const from = typeof data['FromTempId'] === 'string' ? data['FromTempId'] : connection.SourceNodeID;
        const to = typeof data['ToTempId'] === 'string' ? data['ToTempId'] : connection.TargetNodeID;
        this.ConnectionSelected.emit({
            EdgeID: edgeID,
            FromTaskID: from,
            ToTaskID: to,
            Condition: connection.Condition,
        });
    }

    private countRuntime(state: TaskGraphRuntimeStatus[string]): number {
        if (!this.RuntimeStatus) {
            return [...this.taskByID.values()].filter((t) => NormalizeRuntimeState(t.Status) === state).length;
        }
        return Object.values(this.RuntimeStatus).filter((s) => s === state).length;
    }

    public get HasSelectedBreakpoint(): boolean {
        return !!this.SelectedTaskID && this.hasBreakpoint(this.SelectedTaskID);
    }

    public get SelectedTaskName(): string {
        if (!this.SelectedTaskID) return '';
        return this.taskByID.get(this.SelectedTaskID)?.Name ?? 'this step';
    }

    public get WaitingStepName(): string {
        if (this.pausedAtTaskID) {
            return this.taskByID.get(this.pausedAtTaskID)?.Name
                ?? this.Spec?.tasks.find((t) => t.tempId === this.pausedAtTaskID)?.name
                ?? 'this step';
        }
        const entry = this.Spec?.tasks.find((t) => (t.dependsOn?.length ?? 0) === 0);
        return entry?.name ?? 'the first step';
    }

    public get SelectedTask(): MJTaskEntity | null {
        return this.SelectedTaskID ? this.taskByID.get(this.SelectedTaskID) ?? null : null;
    }

    /** All loaded task step entities for the current parent workflow run. */
    public get Tasks(): MJTaskEntity[] {
        return [...this.taskByID.values()];
    }

    /** The stable step ID of a task on the canvas, from its `Configuration.stepId`; null for rows submitted before it. */
    public StepIDOf(taskID: string): string | null {
        return StepIDOfTask(this.taskByID.get(taskID)?.Configuration);
    }

    public OnToggleSelectedBreakpoint(): void {
        if (!this.AllowBreakpointEditing || !this.SelectedTaskID) return;
        this.BreakpointToggled.emit({
            TaskID: this.SelectedTaskID,
            Enabled: !this.HasSelectedBreakpoint,
        });
    }

    /** Debug attaches here: replace Edit/Remove with breakpoint / path-override items. */
    public OnBeforeContextMenu(event: FlowBeforeContextMenuEventArgs): void {
        if (!this.AllowBreakpointEditing) {
            event.Cancel = true;
            return;
        }
        if (event.Target === 'node' && event.Node) {
            const on = this.hasBreakpoint(event.Node.ID);
            event.Items = [{
                ID: 'toggle-breakpoint',
                Label: on ? 'Remove Breakpoint' : 'Add Breakpoint',
                Icon: 'fa-circle',
                Shortcut: 'F9',
            }];
            const stepID = this.AllowRememberBreakpoints ? this.StepIDOf(event.Node.ID) : null;
            if (stepID) {
                const remembered = this.RememberedStepIDs.includes(stepID);
                event.Items.push({
                    ID: 'toggle-remember-breakpoint',
                    Label: remembered ? 'Stop Remembering Breakpoint' : 'Remember Breakpoint for Future Runs',
                    Icon: remembered ? 'fa-bookmark' : 'fa-regular fa-bookmark',
                });
            }
            return;
        }
        if (event.Target === 'connection' && event.Connection?.Condition?.trim()) {
            const edgeID = typeof event.Connection.Data?.['EdgeID'] === 'string'
                ? event.Connection.Data['EdgeID']
                : null;
            if (!edgeID) {
                event.Cancel = true;
                return;
            }
            event.Items = [
                { ID: 'force-true', Label: 'Take this path', Icon: 'fa-check' },
                { ID: 'force-false', Label: 'Skip this path', Icon: 'fa-xmark' },
                { ID: 'force-clear', Label: 'Clear override', Icon: 'fa-rotate-left' },
            ];
            return;
        }
        event.Cancel = true;
    }

    public OnAfterContextMenuAction(event: FlowAfterContextMenuActionEventArgs): void {
        if (event.ActionID === 'toggle-breakpoint' && event.Node) {
            this.BreakpointToggled.emit({
                TaskID: event.Node.ID,
                Enabled: !this.hasBreakpoint(event.Node.ID),
            });
            return;
        }
        if (event.ActionID === 'toggle-remember-breakpoint' && event.Node) {
            const stepID = this.StepIDOf(event.Node.ID);
            if (stepID) {
                this.RememberBreakpointToggled.emit({
                    TaskID: event.Node.ID,
                    StepID: stepID,
                    Remember: !this.RememberedStepIDs.includes(stepID),
                });
            }
            return;
        }
        const edgeID = typeof event.Connection?.Data?.['EdgeID'] === 'string'
            ? event.Connection.Data['EdgeID']
            : null;
        if (!edgeID) return;
        if (event.ActionID === 'force-true') this.EdgeOverrideRequested.emit({ EdgeID: edgeID, Verdict: 'true' });
        if (event.ActionID === 'force-false') this.EdgeOverrideRequested.emit({ EdgeID: edgeID, Verdict: 'false' });
        if (event.ActionID === 'force-clear') this.EdgeOverrideRequested.emit({ EdgeID: edgeID, Verdict: null });
    }

    private hasBreakpoint(taskID: string): boolean {
        return this.breakpoints.some((id) => UUIDsEqual(id, taskID));
    }

    @HostListener('document:keydown', ['$event'])
    public OnDebugHotkey(event: KeyboardEvent): void {
        if (!this.AllowBreakpointEditing) return;
        if (isTypingTarget(event.target)) return;
        if (event.key === 'F9') {
            event.preventDefault();
            this.OnToggleSelectedBreakpoint();
        }
    }

    private rebuildOverlay(): void {
        const rememberedTaskIDs: string[] = [];
        if (this.rememberedStepIDs?.length > 0 && this.taskByID) {
            for (const [taskID] of this.taskByID) {
                const stepID = this.StepIDOf(taskID);
                if (stepID && this.rememberedStepIDs.includes(stepID)) {
                    rememberedTaskIDs.push(taskID);
                }
            }
        }
        const telemetry = this.telemetry;
        this.Overlay = {
            breakpoints: this.breakpoints ?? [],
            rememberedTaskIDs,
            // A finished graph is not "paused here" — the durable bag can still name the last
            // breakpoint after every step is terminal.
            pausedAtTaskID: this.IsSettled ? null : this.pausedAtTaskID,
            paused: !this.IsSettled && this.graphPaused,
            edgeOverrides: this.edgeOverrides ?? {},
            showConditions: true,
            showUntakenPaths: this.showUntakenPaths ?? true,
            layoutDirection: this.layoutDirection ?? 'horizontal',
            liveActivity: this.LiveActivity ? new Map(this.LiveActivity) : undefined,
            blastRadiusTaskIDs: this.blastRadiusTaskIDs ?? [],
            taintedTaskIDs: telemetry?.TaintedTaskIDs ?? [],
            verifiedTaskIDs: telemetry?.VerifiedTaskIDs ?? [],
            sagaCompensationLabels: telemetry?.SagaCompensationLabels ?? {},
            decisionConfidence: telemetry?.DecisionConfidence ?? {},
            xrayItems: telemetry?.XRayItems ?? {},
            canStepSingle: Boolean(this.canStepSingle) && !this.IsSettled,
        };
    }

    private emitSettledOnce(): void {
        if (this.settledEmitted || !this.IsSettled) return;
        this.settledEmitted = true;
        this.Settled.emit();
    }

    /**
     * Reads the graph and projects it onto the canvas.
     *
     * `BypassCache` throughout: a run view exists to show what is true *now*, and the whole point of
     * the poll is to see a status that changed a second ago. A cached read would render a stale graph
     * that looks authoritative.
     */
    private async load(): Promise<void> {
        this.stopPolling();
        if (!this.parentTaskID) {
            this.Spec = null;
            this.cdr.markForCheck();
            return;
        }

        this.IsLoading = this.Spec === null; // only show the spinner on first load, not on every poll
        this.ErrorMessage = null;

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [tasks, deps] = await rv.RunViews<MJTaskEntity | MJTaskDependencyEntity>([
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID='${this.parentTaskID}'`,
                    // Started work in the order it ran, unstarted last, persist order as the
                    // tiebreak — the same rule GetAgentRunTree uses, so a graph reads identically
                    // wherever it is shown.
                    //
                    // `__mj_CreatedAt ASC` alone was persist order, which is the COMPILER's walk
                    // order, not the author's numbering and not what actually happened: a settled
                    // graph listed its steps in an order unrelated to their execution, and a skipped
                    // step could sit above work that ran.
                    OrderBy: 'CASE WHEN StartedAt IS NULL THEN 1 ELSE 0 END, StartedAt, __mj_CreatedAt',
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                {
                    EntityName: 'MJ: Task Dependencies',
                    ExtraFilter: `TaskID IN (SELECT ID FROM [__mj].[vwTasks] WHERE ParentID='${this.parentTaskID}')`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
            ]);

            if (this.destroyed) return;

            if (!tasks.Success) {
                this.fail(`The workflow's steps could not be loaded: ${tasks.ErrorMessage}`);
                return;
            }

            const taskRows = (tasks.Results ?? []) as MJTaskEntity[];
            const depRows = (deps.Success ? (deps.Results ?? []) : []) as MJTaskDependencyEntity[];
            this.project(taskRows, depRows);
            this.rebuildOverlay();
            this.emitSettledOnce();

            if (this.LiveUpdates && !this.isSettled(taskRows)) this.schedulePoll();
        } catch (e) {
            this.fail(e instanceof Error ? e.message : String(e));
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** Rows → spec + runtime + geometry. */
    private project(taskRows: MJTaskEntity[], depRows: MJTaskDependencyEntity[]): void {
        this.taskByID = new Map(taskRows.map((t) => [t.ID, t]));
        this.telemetry = ExtractGraphTelemetry(taskRows);
        if (taskRows.length === 0) {
            this.SelectedTaskID = null;
        } else if (!this.SelectedTaskID || !this.taskByID.has(this.SelectedTaskID)) {
            const activeRow = taskRows.find((t) => t.Status === 'In Progress');
            this.SelectedTaskID = (activeRow ?? taskRows[0]).ID;
        }

        const projection = ProjectTaskRowsToSpec(this.WorkflowName, taskRows, depRows);
        this.Spec = projection.Spec;

        // Correlate by ID, not by name: a projected node's tempId IS the task id, which is the one
        // case where an id match is exact. Name correlation exists for specs whose tempIds were
        // never real, and would be needlessly lossy here.
        const knownIDs = new Set(taskRows.map((t) => t.ID));
        this.RuntimeStatus = this.replayAt
            ? this.statusAt(this.replayAt)
            : BuildRuntimeStatus(taskRows, new Map(), knownIDs);

        this.Positions = this.resolvePositions(projection.AuthoredPositions, taskRows, depRows);
    }

    /** Re-derives the overlay for the current replay position (or the present) from held rows. */
    private applyReplay(): void {
        if (this.taskByID.size === 0) return;
        const rows = [...this.taskByID.values()];
        this.RuntimeStatus = this.replayAt
            ? this.statusAt(this.replayAt)
            : BuildRuntimeStatus(rows, new Map(), new Set(rows.map((t) => t.ID)));
        this.cdr.markForCheck();
    }

    /** The overlay as it stood at `moment`, from each row's own timestamps. */
    private statusAt(moment: Date): TaskGraphRuntimeStatus {
        const at = moment.getTime();
        const status: TaskGraphRuntimeStatus = {};
        for (const [id, row] of this.taskByID) {
            const started = row.StartedAt?.getTime?.() ?? (row.StartedAt ? new Date(row.StartedAt).getTime() : null);
            const completed = row.CompletedAt?.getTime?.() ?? (row.CompletedAt ? new Date(row.CompletedAt).getTime() : null);
            if (started == null || started > at) status[id] = 'Pending';
            else if (completed == null || completed > at) status[id] = 'In Progress';
            else status[id] = NormalizeRuntimeState(row.Status);
        }
        return status;
    }

    /**
     * The author's arrangement where there is one, a computed layout everywhere else.
     *
     * Mixing the two per-node rather than choosing one for the whole graph: a workflow whose author
     * positioned some steps and left others where they fell should keep the positions they chose.
     * A wholly unpositioned graph — the normal case for anything an agent emitted — is laid out
     * entirely by the algorithm.
     */
    private resolvePositions(
        authored: Map<string, GraphNodePosition>,
        taskRows: MJTaskEntity[],
        depRows: MJTaskDependencyEntity[],
    ): Map<string, GraphNodePosition> {
        const missing = taskRows.filter((t) => !authored.has(t.ID)).map((t) => t.ID);
        if (missing.length === 0) return authored;

        const edges: GraphLayoutEdge[] = depRows.map((d) => ({ From: d.DependsOnTaskID, To: d.TaskID }));
        const computed = LayoutGraphNodes(taskRows.map((t) => t.ID), edges, { Direction: 'LR' });

        const resolved = new Map(computed);
        for (const [id, position] of authored) resolved.set(id, position);
        return resolved;
    }

    private isSettled(taskRows: MJTaskEntity[]): boolean {
        return taskRows.length > 0 && taskRows.every((t) => SETTLED.has(t.Status));
    }

    /**
     * Folds one live frame into the overlay.
     *
     * Direct status frames patch in place — a new `RuntimeStatus` object, because the canvas is
     * OnPush and mutation would render nothing. Frames whose consequences the dispatcher computes
     * across the whole graph (skips cascade, blocks propagate, settlement rolls up) reload the rows
     * instead: inferring a cascade client-side would be a second implementation of the engine's
     * rules, free to drift.
     */
    private foldFrame(frame: TaskGraphRunFrame): void {
        this.latestFrame = frame;
        if (frame.kind === 'GateDecision' || frame.kind === 'ClaimChanged' || frame.kind === 'BreakpointHit') {
            this.diagnosticDismissed = false;
        }
        switch (frame.kind) {
            case 'TaskStarted':
            case 'TaskCompleted':
            case 'TaskFailed':
                if (frame.taskId && frame.status && this.RuntimeStatus) {
                    const row = this.taskByID.get(frame.taskId);
                    if (row) row.Status = frame.status as MJTaskEntity['Status'];
                    this.RuntimeStatus = { ...this.RuntimeStatus, [frame.taskId]: NormalizeRuntimeState(frame.status) };
                    if (frame.kind !== 'TaskStarted') this.LiveActivity.delete(frame.taskId);
                    this.rebuildOverlay();
                    this.emitSettledOnce();
                    this.cdr.markForCheck();
                }
                break;
            case 'NodeProgress':
                if (frame.taskId && frame.progressMessage) {
                    this.LiveActivity.set(frame.taskId, { Message: frame.progressMessage, Percent: frame.progressPercent });
                    this.rebuildOverlay();
                    this.cdr.markForCheck();
                }
                break;
            case 'GraphSettled':
                this.scheduleFrameReload();
                // The engine said the graph is done — do not wait for the row reload to tell the host.
                if (!this.settledEmitted) {
                    this.settledEmitted = true;
                    this.Settled.emit();
                }
                break;
            case 'TaskSkipped':
            case 'TaskBlocked':
            case 'TaskAwaitingHuman':
            case 'GraphResumed':
                this.scheduleFrameReload();
                break;
            default:
                // GateDecision / ClaimChanged / PassCompleted / GraphPaused / BreakpointHit are
                // console-chrome concerns the HOST renders; unknown kinds are a newer server.
                break;
        }
    }

    /** One reload per burst of cascade frames, not one per frame. */
    private scheduleFrameReload(): void {
        if (this.frameReloadTimer) return;
        this.frameReloadTimer = setTimeout(() => {
            this.frameReloadTimer = null;
            void this.load();
        }, 250);
    }

    private schedulePoll(): void {
        this.pollTimer = setTimeout(() => void this.load(), Math.max(1, this.PollIntervalSeconds) * 1000);
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private fail(message: string): void {
        LogError(`[TaskGraphRunView] ${message}`);
        this.ErrorMessage = message;
        this.cdr.markForCheck();
    }

    /** Canvas extent, so a host can size its container to the graph rather than guessing. */
    public get GraphBounds(): { Width: number; Height: number } {
        const box = GraphLayoutBounds(this.Positions);
        return { Width: box.Width, Height: box.Height };
    }
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
