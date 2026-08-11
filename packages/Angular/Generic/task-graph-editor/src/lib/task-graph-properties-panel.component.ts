/**
 * @fileoverview Edits the selected task's properties, plus the graph-level traversal settings.
 *
 * Split out of the canvas component for the reason panels usually are — the canvas is about
 * *structure* (what connects to what) and this is about *content* (what a step actually does). But
 * also for a sharper reason: a host embedding the read-only viewer in a chat card or a run history
 * pane wants the graph without a form beside it, and a panel welded into the canvas cannot be
 * declined.
 *
 * Emits intent rather than mutating: the canvas component owns the spec, so every edit here leaves
 * as a request the parent applies through the same `Before*`/`After*` path a drag or a delete takes.
 * Two write paths into one spec would be two places for the veto contract to be wrong.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ConfigOf, TaskNode, type TaskGraphSpec, type TaskGraphSpecNode, type TaskNodeBase } from '@memberjunction/ai-core-plus';
import { GetDependencies, GetTaskNodeType, type TaskGraphNodeType } from './task-graph-canvas-adapter';

/** A requested change to one task. The parent applies it; this panel never writes. */
export class TaskPropertyChangeRequestedEventArgs {
    constructor(
        public readonly TempId: string,
        public readonly Next: TaskGraphSpecNode,
    ) {}
}

/** A requested change to a dependency edge's condition. */
export class DependencyConditionChangeRequestedEventArgs {
    constructor(
        public readonly FromTempId: string,
        public readonly ToTempId: string,
        /** Empty string clears the condition, making the edge unconditional again. */
        public readonly Condition: string,
    ) {}
}

@Component({
    standalone: false,
    selector: 'mj-task-graph-properties',
    templateUrl: './task-graph-properties-panel.component.html',
    styleUrls: ['./task-graph-properties-panel.component.css'],
})
export class TaskGraphPropertiesPanelComponent {
    /** The task being edited. Null shows the empty state rather than a form bound to nothing. */
    @Input()
    public set Task(value: TaskGraphSpecNode | null) {
        this.currentTask = value;
        // A working copy, so a half-typed name never reaches the spec — and so Cancel is possible
        // at all. Editing the live node would make every keystroke an unvetoable mutation.
        this.Draft = value ? { ...value } : null;
    }
    public get Task(): TaskGraphSpecNode | null {
        return this.currentTask;
    }

    /** The whole graph, for resolving the selected task's incoming edges. */
    @Input() public Spec: TaskGraphSpec | null = null;

    /** Agent names offered in the assignment dropdown. Supplied by the host, which owns data access. */
    @Input() public AvailableAgentNames: readonly string[] = [];

    /** Action names offered in the assignment dropdown. Same ownership rule as `AvailableAgentNames`. */
    @Input() public AvailableActionNames: readonly string[] = [];

    @Input() public ReadOnly: boolean = false;

    @Output() public TaskPropertyChangeRequested = new EventEmitter<TaskPropertyChangeRequestedEventArgs>();
    @Output() public DependencyConditionChangeRequested = new EventEmitter<DependencyConditionChangeRequestedEventArgs>();

    public Draft: TaskGraphSpecNode | null = null;

    private currentTask: TaskGraphSpecNode | null = null;

    /**
     * Which of the three assignment shapes this step currently uses.
     *
     * Derived from the draft rather than stored separately: the node's own `kind` is the single
     * source of truth, and a parallel field could disagree with it.
     */
    public get Assignment(): TaskGraphNodeType {
        return this.Draft ? GetTaskNodeType(this.Draft) : 'AgentTask';
    }

    /**
     * The chosen agent, read and written through the node's configuration.
     *
     * A template cannot narrow a discriminated union, so the two-way binding goes through here
     * rather than at `Draft.configuration.agentName` — which would also be wrong the moment the
     * draft is a different kind.
     */
    public get AgentName(): string {
        return ConfigOf(this.Draft!, 'Agent')?.agentName ?? '';
    }
    public set AgentName(value: string) {
        if (this.Draft?.kind === 'Agent') {
            this.Draft = { ...this.Draft, configuration: { ...ConfigOf(this.Draft, 'Agent')!, agentName: value } };
        }
    }

    /** The chosen action. Same reasoning as {@link AgentName}. */
    public get ActionName(): string {
        return ConfigOf(this.Draft!, 'Action')?.actionName ?? '';
    }
    public set ActionName(value: string) {
        if (this.Draft?.kind === 'Action') {
            this.Draft = { ...this.Draft, configuration: { ...ConfigOf(this.Draft, 'Action')!, actionName: value } };
        }
    }

    /** True when this step waits on a person. */
    public get IsHumanTask(): boolean {
        return this.Assignment === 'HumanTask';
    }

    /** The edges into this task, so their conditions are editable where the step is. */
    public get IncomingEdges(): Array<{ FromTempId: string; FromName: string; Condition: string }> {
        if (!this.Draft || !this.Spec) return [];
        const nameOf = (id: string) => this.Spec!.tasks.find((t) => t.tempId === id)?.name ?? id;
        return GetDependencies(this.Draft).map((d) => ({
            FromTempId: d.tempId,
            FromName: nameOf(d.tempId),
            Condition: d.condition ?? '',
        }));
    }

    /**
     * Switches the step between an agent, an action and a person.
     *
     * Replacing `kind` and `configuration` together is the whole operation now. Under the old flat
     * shape this had to clear two sibling fields on every branch, and forgetting one produced an
     * `AssignmentConflict` from a gesture that looked like a simple choice — a bug the union made
     * unrepresentable rather than merely guarded.
     *
     * The previous name is carried over where it still applies, so toggling Agent → Person → Agent
     * does not silently forget what the author had chosen.
     */
    public SetAssignment(kind: TaskGraphNodeType, name?: string): void {
        if (!this.Draft || this.ReadOnly) return;
        const base: TaskNodeBase = {
            tempId: this.Draft.tempId,
            name: this.Draft.name,
            description: this.Draft.description,
            dependsOn: this.Draft.dependsOn,
            policy: this.Draft.policy,
            layout: this.Draft.layout,
            inputPayload: this.Draft.inputPayload,
        };
        switch (kind) {
            case 'HumanTask':
                this.Draft = TaskNode.Human(base, ConfigOf(this.Draft, 'Human') ?? {});
                break;
            case 'ActionTask':
                this.Draft = TaskNode.Action(base, {
                    actionName: name ?? ConfigOf(this.Draft, 'Action')?.actionName ?? this.AvailableActionNames[0] ?? '',
                });
                break;
            default:
                this.Draft = TaskNode.Agent(base, {
                    agentName: name ?? ConfigOf(this.Draft, 'Agent')?.agentName ?? this.AvailableAgentNames[0] ?? '',
                });
                break;
        }
        this.Commit();
    }

    /** Asks the parent to apply the draft. */
    public Commit(): void {
        if (!this.Draft || !this.currentTask || this.ReadOnly) return;
        this.TaskPropertyChangeRequested.emit(
            new TaskPropertyChangeRequestedEventArgs(this.currentTask.tempId, { ...this.Draft }),
        );
    }

    /** Asks the parent to change (or, with an empty string, clear) an edge's condition. */
    public CommitCondition(fromTempId: string, condition: string): void {
        if (!this.Draft || this.ReadOnly) return;
        this.DependencyConditionChangeRequested.emit(
            new DependencyConditionChangeRequestedEventArgs(fromTempId, this.Draft.tempId, condition),
        );
    }
}
