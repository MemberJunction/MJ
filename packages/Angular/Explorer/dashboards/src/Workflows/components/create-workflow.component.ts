import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJTaskEntity, WorkflowDraftOperation } from '@memberjunction/core-entities';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    DEFAULT_WORKFLOW_START_MODE,
    WORKFLOW_START_OPTIONS,
    type PromotableRun,
    type WorkflowDraftRequest,
    type WorkflowStartMode,
    type WorkflowStartOption,
} from '../workflows.types';

/**
 * The Create Workflow front door — the screen that replaces today's save-the-agent-record-first
 * requirement.
 *
 * Implements screens A and B of `mockups/workflow-ux/front-door-v1.html`, which is the locked
 * contract for this surface. Two of its five ratified answers are visible here:
 *
 * - **④ saving is capture, not scheduling.** No trigger is asked for anywhere on this screen. A new
 *   workflow is On demand until someone gives it a schedule, and asking at creation time turns a
 *   two-second capture into a configuration task.
 * - **Only settled runs are promotable.** An in-flight run may still change shape under a retry or a
 *   recovery branch, so the workflow you saved would not be the one that ran.
 *
 * Emits a {@link WorkflowDraftRequest} rather than persisting anything: "Nothing is saved until you
 * approve it" is a promise the middle tile makes in so many words, and the canvas is where approval
 * happens.
 */
@Component({
    standalone: false,
    selector: 'mj-create-workflow',
    templateUrl: './create-workflow.component.html',
    styleUrls: ['./create-workflow.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateWorkflowComponent {
    /** Provider to read past runs through — supplied by the host, never resolved globally. */
    @Input() Provider!: IMetadataProvider;

    /** The user to run the drafting operation as. */
    @Input() CurrentUser: UserInfo | null = null;

    /**
     * True while the host is committing the workflow.
     *
     * Owned by the host rather than this component because the host is what saves. Without it the
     * form stays live during the write and a second click would create a second workflow.
     */
    @Input() Busy = false;

    /** Emitted when the author commits. The host routes to the canvas. */
    @Output() Created = new EventEmitter<WorkflowDraftRequest>();
    /** Emitted when the author backs out. */
    @Output() Cancelled = new EventEmitter<void>();

    public readonly StartOptions: readonly WorkflowStartOption[] = WORKFLOW_START_OPTIONS;
    public SelectedMode: WorkflowStartMode = DEFAULT_WORKFLOW_START_MODE;

    public WorkflowName = '';
    public Description = '';
    public SelectedRunID: string | null = null;

    public PastRuns: PromotableRun[] = [];
    public IsLoadingRuns = false;
    public RunsError: string | null = null;

    /**
     * True while an agent is drafting the steps.
     *
     * Its own flag rather than a generic `busy`, because the wait is long enough to need explaining:
     * a spinner with no words reads as a hang, and this one can take several seconds.
     */
    public IsDrafting = false;
    public DraftError: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {}

    /**
     * True when the form can be submitted.
     *
     * Each door has its own bar, because each asks for something different: `describe` needs the
     * brief it will draft from, `past-run` needs the run being promoted, and `blank` needs only a
     * name — there is nothing else to supply before the canvas opens.
     */
    public get CanCreate(): boolean {
        if (this.Busy || !this.WorkflowName.trim()) {
            return false;
        }
        switch (this.SelectedMode) {
            case 'describe':
                return this.Description.trim().length > 0;
            case 'past-run':
                return !!this.SelectedRunID;
            case 'blank':
                return true;
        }
    }

    public async OnSelectMode(mode: WorkflowStartMode): Promise<void> {
        if (this.SelectedMode === mode) {
            return;
        }
        this.SelectedMode = mode;
        this.cdr.markForCheck();

        // Loaded on demand rather than up front: two of the three doors never look at past runs, and
        // the query is the only database work this screen does.
        if (mode === 'past-run' && this.PastRuns.length === 0 && !this.IsLoadingRuns) {
            await this.LoadPastRuns();
        }
    }

    public OnSelectRun(run: PromotableRun): void {
        // Guarded rather than merely styled: an unsettled row is not selectable, and relying on CSS
        // to convey that would leave it clickable for anyone navigating by keyboard.
        if (!run.IsSettled) {
            return;
        }
        this.SelectedRunID = run.ID;
        if (!this.WorkflowName.trim()) {
            this.WorkflowName = run.Name;
        }
        this.cdr.markForCheck();
    }

    public async OnCreate(): Promise<void> {
        if (!this.CanCreate || this.IsDrafting) {
            return;
        }
        const request: WorkflowDraftRequest = {
            Mode: this.SelectedMode,
            Name: this.WorkflowName.trim(),
            Description: this.SelectedMode === 'describe' ? this.Description.trim() : undefined,
            SourceRunID: this.SelectedMode === 'past-run' ? this.SelectedRunID ?? undefined : undefined,
        };

        // Only the "Describe it" door drafts. Blank canvas has nothing to draft FROM, and promoting a
        // past run is a projection of a graph that already exists rather than an act of authorship.
        if (request.Mode !== 'describe') {
            this.Created.emit(request);
            return;
        }

        this.IsDrafting = true;
        this.DraftError = null;
        this.cdr.markForCheck();
        try {
            const draft = await this.draftSteps(request);
            // A failed draft does NOT block the author. They described what they wanted and are
            // entitled to get to the canvas; drafting is a head start, not a gate. The error stays
            // on screen so the failure is not silent.
            this.Created.emit({ ...request, Draft: draft ?? undefined });
        } finally {
            this.IsDrafting = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Asks the server to draft the steps.
     *
     * A Remote Operation rather than a bespoke mutation, per the program's standing rule — the same
     * call is reachable from MCP and an Action, so an agent can draft a workflow the same way this
     * screen does.
     */
    private async draftSteps(request: WorkflowDraftRequest): Promise<TaskGraphSpec | null> {
        try {
            const op = new WorkflowDraftOperation();
            const result = await op.Execute(
                { description: request.Description ?? '', workflowName: request.Name },
                { provider: this.Provider ?? undefined, user: this.CurrentUser ?? undefined },
            );
            if (result.Success && result.Output?.success && result.Output.graph) {
                return result.Output.graph as TaskGraphSpec;
            }
            this.DraftError =
                result.Output?.errorMessage ??
                result.ErrorMessage ??
                'The steps could not be drafted. You can still build this workflow yourself.';
            return null;
        } catch (e) {
            this.DraftError = e instanceof Error ? e.message : String(e);
            return null;
        }
    }

    public OnCancel(): void {
        this.Cancelled.emit();
    }

    /**
     * Loads the runs a workflow can be promoted from.
     *
     * Reads parent task rows — a graph's root — because that is the unit someone recognises as "a
     * run". Filtered to terminal statuses in SQL rather than in memory so an instance with a long
     * history does not pull every task row across the wire to discard most of them.
     */
    public async LoadPastRuns(): Promise<void> {
        this.IsLoadingRuns = true;
        this.RunsError = null;
        this.cdr.markForCheck();
        try {
            const result = await RunView.FromMetadataProvider(this.Provider).RunView<MJTaskEntity>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID IS NULL AND Status IN ('Complete','Failed','Cancelled')`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 25,
                    ResultType: 'entity_object',
                },
                undefined,
            );
            if (!result.Success) {
                this.RunsError = result.ErrorMessage ?? 'Past runs could not be loaded.';
                this.PastRuns = [];
                return;
            }
            this.PastRuns = (result.Results ?? []).map((t) => this.toPromotableRun(t));
        } catch (e) {
            this.RunsError = e instanceof Error ? e.message : String(e);
            this.PastRuns = [];
        } finally {
            this.IsLoadingRuns = false;
            this.cdr.markForCheck();
        }
    }

    /** Projects a parent task row into the row the list renders. */
    private toPromotableRun(task: MJTaskEntity): PromotableRun {
        return {
            ID: task.ID,
            Name: task.Name,
            // Not queried per row on purpose: a count per run would be N queries for a decorative
            // number. The canvas shows the real shape the moment a run is chosen.
            StepCount: 0,
            Age: this.describeAge(task.CompletedAt ?? task.__mj_UpdatedAt),
            AgentName: task.Agent ?? 'Unattributed',
            Status: task.Status,
            IsSettled: task.Status === 'Complete',
        };
    }

    /** Human-readable age. Deliberately coarse — "2 days ago" is what someone scans for. */
    private describeAge(when: Date | null): string {
        if (!when) {
            return 'recently';
        }
        const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
        if (days <= 0) return 'today';
        if (days === 1) return 'yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 14) return 'last week';
        return `${Math.floor(days / 7)} weeks ago`;
    }
}
