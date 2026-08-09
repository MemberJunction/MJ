/**
 * @fileoverview View and edit a `TaskGraphSpec` on a canvas.
 *
 * **What makes this reusable is its subject.** It edits `TaskGraphSpec` — the one fully-qualified
 * graph contract every producer in the program already authors against (D16) — rather than any
 * particular persistence. A design-time flow, a graph an agent emitted at runtime, a stored workflow
 * definition and a graph a person is drawing from scratch are all the same type here, so one
 * component serves the Flow Agent editor, the Agent Run admin view, conversation plan cards, the
 * Tasks view, and anything downstream.
 *
 * The alternative — teaching the existing agent editor a second dialect — is precisely how the two
 * graph models drifted apart before Phase 4 pulled them onto one traversal engine.
 *
 * **Layer: `widgets` (L1/L2).** No `@angular/router`, no `@memberjunction/ng-shared`, no
 * `NavigationService`. Route-derived state arrives as `@Input()`; navigation *intent* leaves as an
 * `@Output()` the host acts on, because a widget cannot know whether it is inside Explorer, a
 * downstream app, or an embedded panel. See `guides/UI_LAYERING_GUIDE.md`.
 *
 * **Validation is the engine's.** Cycles, unknown dependency refs and assignment conflicts are
 * reported by calling `ValidateTaskGraphSpec` from `@memberjunction/ai-core-plus` — the same
 * function `LoopAgentType` and `TaskGraphService.Submit` call. A second implementation here would be
 * a second definition of "valid", and the graph that passes on the canvas would be free to fail at
 * submission.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import { Component, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type TaskGraphValidationError,
} from '@memberjunction/ai-core-plus';
import { FlowEditorComponent } from '@memberjunction/ng-flow-editor';
import type {
    FlowConnection,
    FlowConnectionCreatedEvent,
    FlowLayoutDirection,
    FlowNode,
    FlowNodeAddedEvent,
    FlowNodeMovedEvent,
    FlowNodeTypeConfig,
    FlowPosition,
} from '@memberjunction/ng-flow-editor';
import {
    AddDependency,
    AddTask,
    GetDependents,
    GetNodeTypeConfig,
    NewTaskFromNodeType,
    NextTempId,
    RemoveDependency,
    RemoveTask,
    SpecToConnections,
    SpecToNodes,
    TASK_GRAPH_NODE_TYPES,
    UpdateTask,
    WouldCreateCycle,
    type TaskGraphRuntimeStatus,
} from './task-graph-canvas-adapter';
import type {
    DependencyConditionChangeRequestedEventArgs,
    TaskPropertyChangeRequestedEventArgs,
} from './task-graph-properties-panel.component';
import {
    AfterDependencyAddedEventArgs,
    AfterDependencyRemovedEventArgs,
    AfterTaskAddedEventArgs,
    AfterTaskRemovedEventArgs,
    AfterTaskUpdatedEventArgs,
    AgentOpenRequestedEventArgs,
    BeforeDependencyAddedEventArgs,
    BeforeDependencyRemovedEventArgs,
    BeforeTaskAddedEventArgs,
    BeforeTaskRemovedEventArgs,
    BeforeTaskUpdatedEventArgs,
    RecordOpenRequestedEventArgs,
    TaskGraphSelectionChangedEventArgs,
    TaskGraphSpecChangedEventArgs,
    TaskGraphValidationChangedEventArgs,
} from './task-graph-editor-events';

@Component({
    standalone: false,
    selector: 'mj-task-graph-editor',
    templateUrl: './task-graph-editor.component.html',
    styleUrls: ['./task-graph-editor.component.css'],
})
export class TaskGraphEditorComponent extends BaseAngularComponent implements OnDestroy {
    // ── Inputs ───────────────────────────────────────────────────────────────

    /**
     * The graph to show. Setter-based rather than `ngOnChanges` (repo convention): the reaction is
     * explicit, runs only when this property changes, and costs nothing on other change-detection
     * passes.
     */
    @Input()
    public set Spec(value: TaskGraphSpec | null) {
        this.currentSpec = value;
        this.project();
    }
    public get Spec(): TaskGraphSpec | null {
        return this.currentSpec;
    }

    /**
     * Live per-task state, keyed by `tempId`. Supplying it turns the canvas into a runtime view of
     * the same graph — the convergence point the program was aiming at: one renderer for design time
     * and run time, rather than an editor and a separate Gantt that can disagree.
     */
    @Input()
    public set RuntimeStatus(value: TaskGraphRuntimeStatus | null) {
        this.currentRuntime = value;
        this.project();
    }
    public get RuntimeStatus(): TaskGraphRuntimeStatus | null {
        return this.currentRuntime;
    }

    /** Read-only mode. The same component is the viewer — there is no second, weaker renderer. */
    @Input() public ReadOnly: boolean = false;

    @Input() public ShowToolbar: boolean = true;
    @Input() public ShowPalette: boolean = true;
    @Input() public ShowMinimap: boolean = true;
    @Input() public ShowStatusBar: boolean = true;
    @Input() public AutoLayoutDirection: FlowLayoutDirection = 'vertical';

    /**
     * Whether the properties panel rides alongside the canvas.
     *
     * On by default, because without it a step added from the palette can never be named or
     * assigned — the canvas draws structure, the panel supplies content, and one without the other
     * is a graph the author can build but not finish. Hosts embedding the read-only viewer in a chat
     * card turn it off.
     */
    @Input() public ShowProperties: boolean = true;

    /**
     * Agent names offered when assigning a step. Supplied by the host, which owns data access —
     * this is a widgets-layer component and does not query.
     */
    @Input() public AvailableAgentNames: readonly string[] = [];

    /** Action names offered when assigning a step. Same ownership rule as `AvailableAgentNames`. */
    @Input() public AvailableActionNames: readonly string[] = [];

    /** Shown when there is nothing to draw yet. */
    @Input() public EmptyStateMessage: string = 'No steps yet. Add one to start building this workflow.';

    // ── Outputs ──────────────────────────────────────────────────────────────

    @Output() public BeforeTaskAdded = new EventEmitter<BeforeTaskAddedEventArgs>();
    @Output() public AfterTaskAdded = new EventEmitter<AfterTaskAddedEventArgs>();
    @Output() public BeforeTaskRemoved = new EventEmitter<BeforeTaskRemovedEventArgs>();
    @Output() public AfterTaskRemoved = new EventEmitter<AfterTaskRemovedEventArgs>();
    @Output() public BeforeTaskUpdated = new EventEmitter<BeforeTaskUpdatedEventArgs>();
    @Output() public AfterTaskUpdated = new EventEmitter<AfterTaskUpdatedEventArgs>();
    @Output() public BeforeDependencyAdded = new EventEmitter<BeforeDependencyAddedEventArgs>();
    @Output() public AfterDependencyAdded = new EventEmitter<AfterDependencyAddedEventArgs>();
    @Output() public BeforeDependencyRemoved = new EventEmitter<BeforeDependencyRemovedEventArgs>();
    @Output() public AfterDependencyRemoved = new EventEmitter<AfterDependencyRemovedEventArgs>();

    /** Informational — no `Before` pair, because these report what already happened. */
    @Output() public SpecChanged = new EventEmitter<TaskGraphSpecChangedEventArgs>();
    @Output() public SelectionChanged = new EventEmitter<TaskGraphSelectionChangedEventArgs>();
    @Output() public ValidationChanged = new EventEmitter<TaskGraphValidationChangedEventArgs>();

    /** Intent-only — the host navigates; this widget has no Router and must not acquire one. */
    @Output() public AgentOpenRequested = new EventEmitter<AgentOpenRequestedEventArgs>();
    @Output() public RecordOpenRequested = new EventEmitter<RecordOpenRequestedEventArgs>();

    // ── Rendered state ───────────────────────────────────────────────────────

    public Nodes: FlowNode[] = [];
    public Connections: FlowConnection[] = [];
    public NodeTypes: FlowNodeTypeConfig[] = [...TASK_GRAPH_NODE_TYPES];
    public SelectedTask: TaskGraphSpecNode | null = null;
    public ValidationErrors: readonly TaskGraphValidationError[] = [];
    public IsValid: boolean = true;

    @ViewChild(FlowEditorComponent) protected canvas: FlowEditorComponent | undefined;

    private currentSpec: TaskGraphSpec | null = null;
    private currentRuntime: TaskGraphRuntimeStatus | null = null;

    public get IsEmpty(): boolean {
        return (this.currentSpec?.tasks?.length ?? 0) === 0;
    }

    // ── Public methods ───────────────────────────────────────────────────────
    //
    // Imperative entry points exist for exactly the case the cancelable-event contract cannot serve:
    // a host that needs to `await` something (a confirm dialog) before the action proceeds. A
    // `Before*` handler cannot await — control returns to the emitter before the handler sets
    // `Cancel` — so the host awaits first and then calls one of these.

    /** Re-runs validation and emits the result. Idempotent. */
    public Validate(): TaskGraphValidationChangedEventArgs {
        const result = this.currentSpec
            ? ValidateTaskGraphSpec(this.currentSpec)
            : { Valid: true, Errors: [] as TaskGraphValidationError[] };

        this.IsValid = result.Valid;
        this.ValidationErrors = result.Errors;

        const args = new TaskGraphValidationChangedEventArgs(result.Valid, result.Errors);
        this.ValidationChanged.emit(args);
        return args;
    }

    /** Adds a task. Returns the new task, or null when a host vetoed it. */
    public AddTask(partial: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode | null {
        if (this.ReadOnly || !this.currentSpec) return null;

        const task: TaskGraphSpecNode = {
            tempId: partial.tempId ?? NextTempId(this.currentSpec),
            name: partial.name ?? 'New step',
            description: partial.description ?? '',
            agentName: partial.agentName,
            actionName: partial.actionName,
            assignToUser: partial.assignToUser,
            dependsOn: partial.dependsOn ?? [],
            inputPayload: partial.inputPayload,
        };

        const before = new BeforeTaskAddedEventArgs(task);
        this.BeforeTaskAdded.emit(before);
        if (before.Cancel) return null;

        this.commit(AddTask(this.currentSpec, task), 'TaskAdded');
        this.AfterTaskAdded.emit(new AfterTaskAddedEventArgs(task, this.currentSpec!));
        return task;
    }

    /** Removes a task and every edge into it. Returns false when a host vetoed it. */
    public RemoveTask(tempId: string): boolean {
        if (this.ReadOnly || !this.currentSpec) return false;
        const task = this.findTask(tempId);
        if (!task) return false;

        // The blast radius travels with the event: a host deciding whether to veto needs to know
        // what else breaks, not merely which box was clicked.
        const before = new BeforeTaskRemovedEventArgs(task, GetDependents(this.currentSpec, tempId));
        this.BeforeTaskRemoved.emit(before);
        if (before.Cancel) return false;

        this.commit(RemoveTask(this.currentSpec, tempId), 'TaskRemoved');
        if (this.SelectedTask?.tempId === tempId) this.selectTask(null);
        this.AfterTaskRemoved.emit(new AfterTaskRemovedEventArgs(task, this.currentSpec!));
        return true;
    }

    /** Replaces a task's properties. Returns false when a host vetoed it. */
    public UpdateTask(tempId: string, next: TaskGraphSpecNode): boolean {
        if (this.ReadOnly || !this.currentSpec) return false;
        const previous = this.findTask(tempId);
        if (!previous) return false;

        const before = new BeforeTaskUpdatedEventArgs(previous, next);
        this.BeforeTaskUpdated.emit(before);
        if (before.Cancel) return false;

        this.commit(UpdateTask(this.currentSpec, tempId, next), 'TaskUpdated');
        if (this.SelectedTask?.tempId === tempId) this.SelectedTask = next;
        this.AfterTaskUpdated.emit(new AfterTaskUpdatedEventArgs(next, this.currentSpec!));
        return true;
    }

    /**
     * Adds a dependency edge. Returns false when it was vetoed **or would create a cycle**.
     *
     * The cycle is refused unconditionally, not merely reported: a cyclic graph can never execute —
     * nothing would ever become eligible — so allowing the canvas to draw one would let a user build
     * something the engine must then reject. Better to refuse the stroke than to accept a graph that
     * cannot run.
     */
    public AddDependency(fromTempId: string, toTempId: string, condition?: string): boolean {
        if (this.ReadOnly || !this.currentSpec) return false;

        const cycle = WouldCreateCycle(this.currentSpec, fromTempId, toTempId);
        const before = new BeforeDependencyAddedEventArgs(fromTempId, toTempId, cycle);
        this.BeforeDependencyAdded.emit(before);
        if (before.Cancel || cycle) return false;

        this.commit(AddDependency(this.currentSpec, fromTempId, toTempId, condition), 'DependencyAdded');
        this.AfterDependencyAdded.emit(new AfterDependencyAddedEventArgs(fromTempId, toTempId, this.currentSpec!));
        return true;
    }

    /** Removes a dependency edge. Returns false when a host vetoed it. */
    public RemoveDependency(fromTempId: string, toTempId: string): boolean {
        if (this.ReadOnly || !this.currentSpec) return false;

        const before = new BeforeDependencyRemovedEventArgs(fromTempId, toTempId);
        this.BeforeDependencyRemoved.emit(before);
        if (before.Cancel) return false;

        this.commit(RemoveDependency(this.currentSpec, fromTempId, toTempId), 'DependencyRemoved');
        this.AfterDependencyRemoved.emit(new AfterDependencyRemovedEventArgs(fromTempId, toTempId, this.currentSpec!));
        return true;
    }

    /**
     * Sets — or with an empty string, clears — a dependency edge's condition.
     *
     * Implemented as remove-then-add so it travels the same `Before*`/`After*` path as any other
     * edge change. A separate silent mutation would be a second write path into the spec, and the
     * veto contract would then be right in one place and wrong in the other.
     */
    public SetDependencyCondition(fromTempId: string, toTempId: string, condition: string): boolean {
        if (this.ReadOnly || !this.currentSpec) return false;
        if (!this.RemoveDependency(fromTempId, toTempId)) return false;
        return this.AddDependency(fromTempId, toTempId, condition.trim() || undefined);
    }

    /** Asks the host to open the agent behind a task. */
    public RequestAgentOpen(task: TaskGraphSpecNode): void {
        if (task.agentName) {
            this.AgentOpenRequested.emit(new AgentOpenRequestedEventArgs(task.agentName, task));
        }
    }

    /** Asks the host to open a record the graph references. */
    public RequestRecordOpen(entityName: string, recordID: string): void {
        this.RecordOpenRequested.emit(new RecordOpenRequestedEventArgs(entityName, recordID));
    }

    // ── Canvas handlers ──────────────────────────────────────────────────────

    public OnNodeSelected(node: FlowNode | null): void {
        this.selectTask(node ? this.findTask(node.ID) : null);
    }

    /**
     * A palette entry was clicked or dragged onto the canvas.
     *
     * **This binding is the bug.** The canvas has always emitted `NodeAdded` for a palette drop, and
     * this component simply never listened — so the node the canvas announced was thrown away, the
     * spec never gained a task, and the author was told "a task graph must contain at least one
     * task" no matter how many times they tried to add one. The canvas does not mutate its own
     * `Nodes` on purpose (the host owns the model); an unheard event is therefore a silent no-op
     * rather than a visible failure, which is why it survived.
     *
     * The new step is selected immediately: it lands unnamed and, for an agent or action step with
     * nothing available to default to, unassigned — so the properties panel is where the author has
     * to go next, and putting them there beats making them find it.
     */
    public OnNodeAdded(event: FlowNodeAddedEvent): void {
        if (this.ReadOnly || !this.currentSpec) return;
        const type = GetNodeTypeConfig(event.Node.Type)?.Type;
        if (!type) return;

        const added = this.AddTask(
            NewTaskFromNodeType(this.currentSpec, type, {
                agentName: this.AvailableAgentNames[0],
                actionName: this.AvailableActionNames[0],
            }),
        );
        if (!added) return;

        // Remember where the canvas put it BEFORE anything re-projects. The spec has no geometry
        // field, so this map is the only record that the author dropped (or clicked) it here — and
        // without it the node would snap back to the origin on the very next edit.
        this.knownPositions.set(added.tempId, { ...event.Node.Position });
        // A graph that has received a hand-placed node is laid out, by definition. Marking it here
        // stops the one-time Dagre pass from firing later and discarding that placement.
        this.hasLaidOut = true;
        this.selectTask(added);
    }

    /** Applies a properties-panel edit through the same vetoable path a canvas edit takes. */
    public OnTaskPropertyChangeRequested(args: TaskPropertyChangeRequestedEventArgs): void {
        this.UpdateTask(args.TempId, args.Next);
    }

    /** Applies a properties-panel edge-condition edit. */
    public OnDependencyConditionChangeRequested(args: DependencyConditionChangeRequestedEventArgs): void {
        this.SetDependencyCondition(args.FromTempId, args.ToTempId, args.Condition);
    }

    public OnConnectionCreated(event: FlowConnectionCreatedEvent): void {
        this.AddDependency(event.SourceNodeID, event.TargetNodeID);
    }

    public OnConnectionRemoved(connection: FlowConnection): void {
        this.RemoveDependency(connection.SourceNodeID, connection.TargetNodeID);
    }

    public OnNodeRemoved(node: FlowNode): void {
        this.RemoveTask(node.ID);
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private findTask(tempId: string): TaskGraphSpecNode | null {
        return (this.currentSpec?.tasks ?? []).find((t) => t.tempId === tempId) ?? null;
    }

    private selectTask(task: TaskGraphSpecNode | null): void {
        this.SelectedTask = task;
        this.SelectionChanged.emit(new TaskGraphSelectionChangedEventArgs(task));
    }

    /** Applies a new spec, re-projects, re-validates, and tells the host — in that order. */
    private commit(spec: TaskGraphSpec, reason: TaskGraphSpecChangedEventArgs['Reason']): void {
        this.currentSpec = spec;
        this.project();
        this.SpecChanged.emit(new TaskGraphSpecChangedEventArgs(spec, reason));
    }

    /** Re-derives the canvas from the spec. Validation rides along so the two never disagree. */
    private project(): void {
        if (!this.currentSpec) {
            this.Nodes = [];
            this.Connections = [];
            this.ValidationErrors = [];
            this.IsValid = true;
            this.hasLaidOut = false;
            this.knownPositions.clear();
            return;
        }
        this.Nodes = SpecToNodes(this.currentSpec, this.currentRuntime ?? undefined, this.knownPositions);
        this.Connections = SpecToConnections(this.currentSpec);
        this.Validate();
        this.arrangeIfNeverLaidOut();
    }

    /**
     * Lays the graph out ONCE — when it arrives with no geometry of its own.
     *
     * A `TaskGraphSpec` carries no positions, so a spec opened for the first time projects with
     * every node at the origin and needs Dagre to make it readable. After that the author's layout
     * is the layout: `knownPositions` carries it across re-projections, and re-arranging again would
     * throw away the arrangement they just made.
     *
     * It must also not run on every edit, because `AutoArrange` ends in `ZoomToFit` — so arranging
     * per change meant the viewport snapped to fit after every added step and every drawn
     * connection, which on a one-node graph zooms to maximum. That is the behaviour being fixed
     * here; the rule mirrors the Flow Agent editor's (`flow-agent-editor.component.ts`), which has
     * always arranged only when every node sits at the origin.
     */
    private arrangeIfNeverLaidOut(): void {
        if (this.Nodes.length === 0) return;
        if (this.hasLaidOut) return;

        // Nothing to rescue a layout from: a spec whose nodes all sit at the origin has never been
        // arranged. One node at the origin is the legitimate starting case too.
        const allAtOrigin = this.Nodes.every((n) => n.Position.X === 0 && n.Position.Y === 0);
        if (!allAtOrigin) { this.hasLaidOut = true; return; }

        this.hasLaidOut = true;
        // Deferred one turn: the canvas has to render the nodes before Dagre can measure them.
        // Cleared on destroy so a pending layout cannot run against a torn-down view.
        if (this.pendingLayout !== null) clearTimeout(this.pendingLayout);
        this.pendingLayout = setTimeout(() => {
            this.pendingLayout = null;
            this.canvas?.AutoArrange(this.AutoLayoutDirection);
        });
    }

    /**
     * The canvas is the authority on geometry, so remember what it reports.
     *
     * Without this the spec — which has no geometry field — is the only survivor of a re-projection,
     * and every edit silently moved every node back to the origin. That is what forced a re-arrange
     * (and therefore a re-zoom) on each change.
     */
    public OnNodesChanged(nodes: FlowNode[]): void {
        for (const n of nodes) this.knownPositions.set(n.ID, { ...n.Position });
    }

    /** A single node was dragged. Same authority, narrower event. */
    public OnNodeMoved(event: FlowNodeMovedEvent): void {
        this.knownPositions.set(event.NodeID, { ...event.NewPosition });
    }

    public ngOnDestroy(): void {
        if (this.pendingLayout !== null) {
            clearTimeout(this.pendingLayout);
            this.pendingLayout = null;
        }
    }

    /** The topology the current layout was computed for; '' when nothing has been laid out. */
    /**
     * Node geometry, which the spec cannot hold.
     *
     * `TaskGraphSpec` is an execution contract with no layout field, so a re-projection would
     * otherwise return every node to the origin. Keyed by `tempId`; written from the canvas
     * (`NodesChanged` / `NodeMoved`) and from the drop position of a newly added node, and read back
     * by `SpecToNodes` on every projection.
     */
    private readonly knownPositions = new Map<string, FlowPosition>();

    /** Whether the one-time Dagre pass has run (or been made unnecessary by a hand-placed node). */
    private hasLaidOut: boolean = false;
    private pendingLayout: ReturnType<typeof setTimeout> | null = null;
}
