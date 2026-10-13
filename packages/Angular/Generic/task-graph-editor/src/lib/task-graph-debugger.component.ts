/**
 * Drop-in debugger for a live task graph.
 *
 * This is a wrap of the existing run view + VCR toolbar + the session wiring the harness and
 * Runs console already had (RouteOperation, frame subscribe, `$.debug` bag). The picture and
 * the verbs are unchanged; a host now supplies a parent task id and nothing else.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RunView, type IMetadataProvider, type IRemoteOperationProvider } from '@memberjunction/core';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import type { FlowToolbarAlign, FlowToolbarVisibility } from '@memberjunction/ng-flow-editor';
import {
    ComposeBreakpointSet,
    ParseWorkflowDebugOverlay,
    ParseWorkflowInvocation,
    type WorkflowInvocationRoots,
} from './workflow-debug-host';
import {
    TaskGraphRunViewComponent,
    type TaskGraphRunConnectionSelectedEvent,
    type TaskGraphRunFrame,
    type TaskGraphRunNodeSelectedEvent,
} from './task-graph-run-view.component';

/** A provider that can push dispatcher frames. GraphQL does; others simply do not. */
type FrameCapableProvider = IMetadataProvider & {
    TaskGraphFrames(parentTaskId: string): {
        subscribe(observer: {
            next: (frame: TaskGraphRunFrame) => void;
            error: () => void;
            complete: () => void;
        }): Subscription;
    };
};

function AsFrameSource(provider: IMetadataProvider): FrameCapableProvider | null {
    const candidate = provider as FrameCapableProvider;
    return typeof candidate.TaskGraphFrames === 'function' ? candidate : null;
}

type ControlOutput = {
    success?: boolean;
    errorMessage?: string;
};

@Component({
    standalone: false,
    selector: 'mj-task-graph-debugger',
    templateUrl: './task-graph-debugger.component.html',
    styleUrls: ['./task-graph-debugger.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskGraphDebuggerComponent extends BaseAngularComponent implements OnDestroy {
    /**
     * The graph to debug — the parent `MJ: Tasks` row. Everything else is optional.
     */
    @Input()
    public set ParentTaskID(value: string | null) {
        if (value === this.parentTaskID) return;
        this.detachFrames();
        this.parentTaskID = value;
        this.IsSettled = false;
        if (value) {
            this.attachFrames(value);
            void this.Refresh();
        } else {
            this.clearSession();
        }
        this.cdr.markForCheck();
    }
    public get ParentTaskID(): string | null {
        return this.parentTaskID;
    }

    @Input() public WorkflowName: string = 'Workflow';
    @Input() public LiveUpdates: boolean = true;
    @Input() public PollIntervalSeconds: number = 3;
    @Input() public Height: string = '100%';
    @Input() public ShowLegend: boolean = false;
    @Input() public ShowCanvasToolbar: boolean = true;
    @Input() public ToolbarVisibility: FlowToolbarVisibility = 'minimized';
    @Input() public ToolbarAlign: FlowToolbarAlign = 'left';
    @Input() public AllowBreakpointEditing: boolean = true;
    @Input() public ShowVariables: boolean = true;
    /** VCR + error line above the canvas. Off if the host already has its own bar. */
    @Input() public ShowChrome: boolean = true;
    @Input() public Enabled: boolean = true;
    @Input() public ReplayAt: Date | null = null;

    /** Claim-gated. Public so a host toolbar can bind the same flag. */
    public Paused = false;
    public IsSettled = false;
    public Busy = false;
    public ControlError: string | null = null;
    public Breakpoints: readonly string[] = [];
    public PausedAtTaskID: string | null = null;
    public EdgeOverrides: Readonly<Record<string, 'true' | 'false'>> = {};
    public Invocation: WorkflowInvocationRoots | null = null;
    public LatestFrame: TaskGraphRunFrame | null = null;

    @Output() public NodeSelected = new EventEmitter<TaskGraphRunNodeSelectedEvent>();
    @Output() public ConnectionSelected = new EventEmitter<TaskGraphRunConnectionSelectedEvent>();
    @Output() public LegendToggled = new EventEmitter<boolean>();
    @Output() public SettledChange = new EventEmitter<boolean>();
    @Output() public PausedChange = new EventEmitter<boolean>();
    @Output() public Frame = new EventEmitter<TaskGraphRunFrame>();
    @Output() public ControlFailed = new EventEmitter<string>();
    @Output() public Settled = new EventEmitter<void>();

    @ViewChild(TaskGraphRunViewComponent) public RunView: TaskGraphRunViewComponent | undefined;

    private parentTaskID: string | null = null;
    private frameSub: Subscription | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnDestroy(): void {
        this.detachFrames();
    }

    // ── verbs: same RouteOperation calls the hosts already made ──────────────

    public Pause(): Promise<boolean> {
        return this.executeControl('TaskGraph.Pause', { parentTaskID: this.parentTaskID });
    }

    public Resume(): Promise<boolean> {
        return this.executeControl('TaskGraph.Resume', { parentTaskID: this.parentTaskID });
    }

    public Step(target: 'one' | 'wave' = 'one'): Promise<boolean> {
        return this.executeControl('TaskGraph.Step', { parentTaskID: this.parentTaskID, target });
    }

    public Cancel(): Promise<boolean> {
        return this.executeControl('TaskGraph.Cancel', { parentTaskID: this.parentTaskID });
    }

    public async ToggleBreakpoint(taskID: string, enabled: boolean): Promise<boolean> {
        await this.Refresh();
        return this.executeControl('TaskGraph.SetBreakpoints', {
            parentTaskID: this.parentTaskID,
            taskIDs: ComposeBreakpointSet(this.Breakpoints, taskID, enabled),
        });
    }

    public OverrideEdge(edgeID: string, verdict: 'true' | 'false' | null): Promise<boolean> {
        return this.executeControl('TaskGraph.OverrideEdge', {
            parentTaskID: this.parentTaskID,
            edgeID,
            verdict,
        });
    }

    public SkipTask(taskID: string): Promise<boolean> {
        return this.executeControl('TaskGraph.SkipTask', { taskID });
    }

    public RetryTask(taskID: string, inputPayload?: Record<string, unknown> | string): Promise<boolean> {
        return this.executeControl('TaskGraph.RetryTask', { taskID, inputPayload });
    }

    public UpdateTaskInput(taskID: string, payload: unknown): Promise<boolean> {
        return this.executeControl('TaskGraph.UpdateTaskInput', { taskID, payload });
    }

    public ForceCompleteTask(taskID: string, payload?: unknown): Promise<boolean> {
        return this.executeControl('TaskGraph.ForceCompleteTask', { taskID, payload });
    }

    public HasBreakpoint(taskID: string): boolean {
        return this.Breakpoints.some((id) => UUIDsEqual(id, taskID));
    }

    public GetEdgeOverride(edgeID: string | null): 'true' | 'false' | null {
        if (!edgeID) return null;
        for (const [id, verdict] of Object.entries(this.EdgeOverrides)) {
            if (UUIDsEqual(id, edgeID)) return verdict;
        }
        return null;
    }

    /** Re-read `$.debug` from the parent row. Same query the hosts already used. */
    public async Refresh(): Promise<void> {
        if (!this.parentTaskID) return;
        const parentTaskID = this.parentTaskID;
        const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ID='${parentTaskID}'`,
            ResultType: 'entity_object',
            BypassCache: true,
        });
        if (this.parentTaskID !== parentTaskID) return;
        const parent = result.Success ? result.Results?.[0] : undefined;
        const overlay = ParseWorkflowDebugOverlay(parent?.InputPayload);
        this.Breakpoints = overlay.breakpoints;
        this.EdgeOverrides = overlay.edgeOverrides;
        this.Invocation = ParseWorkflowInvocation(parent?.InputPayload);
        if (!this.IsSettled) {
            this.Paused = overlay.paused;
            this.PausedAtTaskID = overlay.pausedAtTaskID;
        }
        this.cdr.markForCheck();
    }

    public OnRunNodeSelected(event: TaskGraphRunNodeSelectedEvent): void {
        this.NodeSelected.emit(event);
    }

    public OnRunConnectionSelected(event: TaskGraphRunConnectionSelectedEvent): void {
        this.ConnectionSelected.emit(event);
    }

    public OnRunSettled(): void {
        this.markSettled();
    }

    public OnRunBreakpointToggled(event: { TaskID: string; Enabled: boolean }): void {
        void this.ToggleBreakpoint(event.TaskID, event.Enabled);
    }

    public OnRunEdgeOverride(event: { EdgeID: string; Verdict: 'true' | 'false' | null }): void {
        void this.OverrideEdge(event.EdgeID, event.Verdict);
    }

    private async executeControl(operationKey: string, input: Record<string, unknown>): Promise<boolean> {
        if (!this.parentTaskID) return false;
        const provider = this.ProviderToUse as IMetadataProvider & Partial<IRemoteOperationProvider>;
        if (typeof provider.RouteOperation !== 'function') {
            this.failControl('This connection cannot send workflow controls.');
            return false;
        }
        this.Busy = true;
        this.ControlError = null;
        this.cdr.markForCheck();
        try {
            const result = await provider.RouteOperation(operationKey, input, {});
            const output = result?.Output as ControlOutput | undefined;
            if (!result?.Success || output?.success === false) {
                this.failControl(output?.errorMessage ?? result?.ErrorMessage ?? 'The control could not be applied.');
                return false;
            }
            if (operationKey === 'TaskGraph.Pause') this.setPaused(true);
            if (operationKey === 'TaskGraph.Resume') this.setPaused(false);
            await this.Refresh();
            return true;
        } catch (e) {
            this.failControl(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            this.Busy = false;
            this.cdr.markForCheck();
        }
    }

    private attachFrames(parentTaskID: string): void {
        this.detachFrames();
        const source = AsFrameSource(this.ProviderToUse);
        if (!source) return;
        this.frameSub = source.TaskGraphFrames(parentTaskID).subscribe({
            next: (frame) => this.onFrame(frame),
            error: () => { this.frameSub = null; },
            complete: () => { this.frameSub = null; },
        });
    }

    private onFrame(frame: TaskGraphRunFrame): void {
        this.LatestFrame = frame;
        this.Frame.emit(frame);
        if (this.IsSettled && (frame.kind === 'GraphPaused' || frame.kind === 'BreakpointHit')) {
            return;
        }
        if (frame.kind === 'GraphPaused' || frame.kind === 'BreakpointHit') {
            this.IsSettled = false;
            this.setPaused(true);
            if (this.parentTaskID) void this.Refresh();
        } else if (frame.kind === 'GraphResumed' || frame.kind === 'TaskStarted') {
            this.IsSettled = false;
            this.setPaused(false);
        } else if (frame.kind === 'GraphSettled') {
            this.markSettled();
        }
        this.cdr.markForCheck();
    }

    private detachFrames(): void {
        this.frameSub?.unsubscribe();
        this.frameSub = null;
        this.LatestFrame = null;
    }

    private markSettled(): void {
        this.IsSettled = true;
        this.setPaused(false);
        this.PausedAtTaskID = null;
        this.SettledChange.emit(true);
        this.Settled.emit();
        if (this.parentTaskID) void this.Refresh();
        this.cdr.markForCheck();
    }

    private setPaused(paused: boolean): void {
        this.Paused = paused;
        this.PausedChange.emit(paused);
    }

    private failControl(message: string): void {
        this.ControlError = message;
        this.ControlFailed.emit(message);
        this.cdr.markForCheck();
    }

    private clearSession(): void {
        this.Paused = false;
        this.IsSettled = false;
        this.Busy = false;
        this.ControlError = null;
        this.Breakpoints = [];
        this.PausedAtTaskID = null;
        this.EdgeOverrides = {};
        this.Invocation = null;
        this.LatestFrame = null;
    }
}
