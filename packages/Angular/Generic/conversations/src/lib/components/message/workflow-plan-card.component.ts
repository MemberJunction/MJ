/**
 * @fileoverview The plan card in a conversation: what an agent decomposed, and what became of it.
 *
 * **The moment this exists for.** An agent breaks a request into steps, the work runs, and it was
 * good. Today that is where it ends — the decomposition was ephemeral, so the next person who wants
 * the same thing asks an agent to invent it again. This card is where a one-off agent plan becomes
 * reusable organizational automation (D17).
 *
 * Renders through the *same* `TaskGraphSpec` component the editor uses, in `ReadOnly` mode. That is
 * deliberate: a second, simpler renderer for chat would be a second thing that can disagree with the
 * canvas about what a graph means, and the whole program has been about removing exactly that.
 *
 * Save is **intent only**. This is a `widgets`-layer component in a conversation; it does not
 * persist agents. The host converts and writes through `AgentSpecSync`, which keeps the one place
 * that writes an agent the one place that writes an agent.
 *
 * @module @memberjunction/ng-conversations
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { TaskGraphRuntimeStatus } from '@memberjunction/ng-task-graph-editor';
import { IsRuntimeSettled, SummarizeRuntime } from '@memberjunction/ng-task-graph-editor';

/** Fired when the user asks to promote this plan into a reusable workflow. */
export class SaveAsWorkflowRequestedEventArgs {
    constructor(
        public readonly Spec: TaskGraphSpec,
        /** The parent task the graph ran as, when it was dispatched. Absent for a folded graph. */
        public readonly ParentTaskID: string | null,
        /**
         * What to call it, as typed in the card.
         *
         * Asked here rather than in a dialog (ratified answer ④): one field and a button keeps the
         * capture at two seconds. A saved workflow gets NO trigger from this path — it runs on
         * demand until someone gives it a schedule — because the moment of saving is about capture,
         * not scheduling.
         */
        public readonly Name: string,
        /**
         * True when the user asked to continue in the editor rather than just save.
         *
         * A secondary route on purpose: making the editor mandatory turns a two-second capture into
         * a task, which is the friction that stops good one-off plans becoming reusable.
         */
        public readonly OpenInEditor: boolean = false,
    ) {}
}

@Component({
    standalone: false,
    selector: 'mj-workflow-plan-card',
    templateUrl: './workflow-plan-card.component.html',
    styleUrls: ['./workflow-plan-card.component.css'],
})
export class WorkflowPlanCardComponent {
    /** The plan. Null renders nothing — a card with no graph has nothing to say. */
    @Input() public Spec: TaskGraphSpec | null = null;

    /** Live per-step state. Absent means the card shows the plan without a progress line. */
    @Input() public RuntimeStatus: TaskGraphRuntimeStatus | null = null;

    /** Handle for status/cancel, when the graph was dispatched rather than folded. */
    @Input() public ParentTaskID: string | null = null;

    /**
     * Whether to offer Save as Workflow.
     *
     * Off while work is still running: offering to save a plan whose shape may yet change — a
     * retry, a failure routing down a recovery branch — invites saving something that never
     * actually happened.
     */
    @Input() public AllowSaveAsWorkflow: boolean = true;

    /** Starts collapsed. A plan card sits inline in a conversation and must not dominate it. */
    @Input() public Expanded: boolean = false;

    @Output() public SaveAsWorkflowRequested = new EventEmitter<SaveAsWorkflowRequestedEventArgs>();
    @Output() public ExpandedChange = new EventEmitter<boolean>();

    /**
     * The name to save under, seeded from the plan and editable in place.
     *
     * Held rather than read off the DOM so the empty-name guard is testable without a browser.
     */
    public SaveName = '';

    /** True once the user has typed, so the seeded name stops being overwritten by the plan's. */
    private nameTouched = false;

    public get StepCount(): number {
        return this.Spec?.tasks?.length ?? 0;
    }

    public get TempIds(): string[] {
        return (this.Spec?.tasks ?? []).map((t) => t.tempId);
    }

    /** One line of progress, or the plan's own reasoning when nothing is running yet. */
    public get SummaryLine(): string {
        if (this.RuntimeStatus) return SummarizeRuntime(this.RuntimeStatus, this.TempIds);
        return this.Spec?.reasoning || `${this.StepCount} step${this.StepCount === 1 ? '' : 's'}`;
    }

    /** True once every step has reached a state nothing will move it out of. */
    public get IsFinished(): boolean {
        return !!this.RuntimeStatus && IsRuntimeSettled(this.RuntimeStatus, this.TempIds);
    }

    /**
     * Save is offered only once the work has settled — or when there is no runtime at all, which is
     * the design-time case (a plan being previewed before it runs).
     */
    public get CanSave(): boolean {
        return this.AllowSaveAsWorkflow && !!this.Spec && (!this.RuntimeStatus || this.IsFinished);
    }

    public ToggleExpanded(): void {
        this.Expanded = !this.Expanded;
        this.ExpandedChange.emit(this.Expanded);
    }

    /**
     * The name the field shows: what the user typed, else the plan's own name.
     *
     * Seeded rather than left blank because the plan already has a perfectly good name, and making
     * someone invent one is the difference between saving and not bothering.
     */
    public get EffectiveName(): string {
        return this.nameTouched ? this.SaveName : this.SaveName || (this.Spec?.workflowName ?? '');
    }

    public OnNameChanged(value: string): void {
        this.nameTouched = true;
        this.SaveName = value;
    }

    /** A workflow with no name is not saveable — there would be nothing to find it by later. */
    public get CanCommit(): boolean {
        return this.CanSave && this.EffectiveName.trim().length > 0;
    }

    public RequestSave(openInEditor: boolean = false): void {
        if (this.Spec && this.CanCommit) {
            this.SaveAsWorkflowRequested.emit(
                new SaveAsWorkflowRequestedEventArgs(
                    this.Spec,
                    this.ParentTaskID,
                    this.EffectiveName.trim(),
                    openInEditor,
                ),
            );
        }
    }
}
