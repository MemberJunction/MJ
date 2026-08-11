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
    Input,
    OnDestroy,
    Output,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { LogError, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity } from '@memberjunction/core-entities';
import {
    GraphLayoutBounds,
    LayoutGraphNodes,
    ProjectTaskRowsToSpec,
    type GraphLayoutEdge,
    type GraphNodePosition,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { BuildRuntimeStatus } from './task-graph-runtime-source';
import type { TaskGraphRuntimeStatus } from './task-graph-canvas-adapter';
import type { TaskGraphSelectionChangedEventArgs } from './task-graph-editor-events';

/** What the host learns when someone clicks a step. */
export type TaskGraphRunNodeSelectedEvent = {
    /** The `MJ: Tasks` row id. */
    TaskID: string;
    Task: MJTaskEntity | null;
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

    @Output() public NodeSelected = new EventEmitter<TaskGraphRunNodeSelectedEvent>();
    /** Emitted once, when every step has reached a terminal status. */
    @Output() public Settled = new EventEmitter<void>();

    public Spec: TaskGraphSpec | null = null;
    public RuntimeStatus: TaskGraphRuntimeStatus | null = null;
    public Positions: Map<string, GraphNodePosition> = new Map();
    public IsLoading = false;
    public ErrorMessage: string | null = null;

    /** Rows by id, so a selection event can hand the host the whole task rather than an id. */
    private taskByID = new Map<string, MJTaskEntity>();
    private parentTaskID: string | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
        this.stopPolling();
    }

    /** Steps in a terminal state, for the host's summary line. */
    public get CompletedCount(): number {
        return [...this.taskByID.values()].filter((t) => t.Status === 'Complete').length;
    }

    public get TotalCount(): number {
        return this.taskByID.size;
    }

    public get SkippedCount(): number {
        return [...this.taskByID.values()].filter((t) => t.Status === 'Skipped').length;
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
        this.NodeSelected.emit({ TaskID: tempId, Task: this.taskByID.get(tempId) ?? null });
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
                    ExtraFilter: `TaskID IN (SELECT ID FROM __mj.Task WHERE ParentID='${this.parentTaskID}')`,
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

            if (this.LiveUpdates && !this.isSettled(taskRows)) this.schedulePoll();
            else if (taskRows.length > 0) this.Settled.emit();
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

        const projection = ProjectTaskRowsToSpec(this.WorkflowName, taskRows, depRows);
        this.Spec = projection.Spec;

        // Correlate by ID, not by name: a projected node's tempId IS the task id, which is the one
        // case where an id match is exact. Name correlation exists for specs whose tempIds were
        // never real, and would be needlessly lossy here.
        const knownIDs = new Set(taskRows.map((t) => t.ID));
        this.RuntimeStatus = BuildRuntimeStatus(taskRows, new Map(), knownIDs);

        this.Positions = this.resolvePositions(projection.AuthoredPositions, taskRows, depRows);
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
