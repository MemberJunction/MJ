import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJTaskDependencyEntity, MJTaskEntity, WorkflowDraftOperation } from '@memberjunction/core-entities';
import { ProjectTaskRowsToSpec, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    DEFAULT_WORKFLOW_START_MODE,
    WORKFLOW_START_OPTIONS,
    WORKFLOW_STARTER_RECIPES,
    type PromotableRun,
    type WorkflowDraftRequest,
    type WorkflowStartMode,
    type WorkflowStartOption,
    type WorkflowStarterRecipe,
} from '../workflows.types';
import { FormatShortDuration } from '../workflow-blueprint.util';

/**
 * The Create Workflow front door — Split Compiler combining the 3 entry doors & AI prompt studio
 * on the left with a live read-only Spatial Preview canvas on the right.
 *
 * Honors the promise: "Nothing is saved until you approve it." Drafting or selecting a past run
 * renders an interactive preview first; only clicking Approve & Enter Studio emits `Created`.
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

    /** True while the host is committing the workflow. */
    @Input() Busy = false;

    /** Emitted when the author approves and commits. The host saves and opens In-App Studio. */
    @Output() Created = new EventEmitter<WorkflowDraftRequest>();
    /** Emitted when the author backs out. */
    @Output() Cancelled = new EventEmitter<void>();

    public readonly StartOptions: readonly WorkflowStartOption[] = WORKFLOW_START_OPTIONS;
    public readonly StarterRecipes: readonly WorkflowStarterRecipe[] = WORKFLOW_STARTER_RECIPES;
    public SelectedMode: WorkflowStartMode = DEFAULT_WORKFLOW_START_MODE;

    public WorkflowName = '';
    public Description = '';
    public RefinementPrompt = '';
    public SelectedRunID: string | null = null;

    public PastRuns: PromotableRun[] = [];
    public IsLoadingRuns = false;
    public RunsError: string | null = null;

    /** Live spatial preview spec (from AI drafting or past-run projection). Nothing saved yet! */
    public PreviewSpec: TaskGraphSpec | null = null;
    public IsLoadingPreview = false;

    public IsDrafting = false;
    public DraftError: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {}

    public get CanCreate(): boolean {
        if (this.Busy || !this.WorkflowName.trim()) {
            return false;
        }
        switch (this.SelectedMode) {
            case 'describe':
                return this.Description.trim().length > 0;
            case 'past-run':
                return !!this.SelectedRunID && !this.IsLoadingPreview;
            case 'blank':
                return true;
        }
    }

    public get CanDraftPreview(): boolean {
        return this.SelectedMode === 'describe' && !this.IsDrafting && !this.Busy && this.Description.trim().length > 0;
    }

    public get PreviewStepCount(): number {
        return this.PreviewSpec?.tasks.length ?? 0;
    }

    public async OnSelectMode(mode: WorkflowStartMode): Promise<void> {
        if (this.SelectedMode === mode) {
            return;
        }
        this.SelectedMode = mode;
        this.DraftError = null;
        if (mode === 'blank') {
            this.PreviewSpec = null;
        }
        this.cdr.markForCheck();

        if (mode === 'past-run' && this.PastRuns.length === 0 && !this.IsLoadingRuns) {
            await this.LoadPastRuns();
        }
    }

    public OnApplyRecipe(recipe: WorkflowStarterRecipe): void {
        this.SelectedMode = 'describe';
        this.WorkflowName = recipe.Name;
        this.Description = recipe.Prompt;
        this.DraftError = null;
        this.cdr.markForCheck();
    }

    public async OnSelectRun(run: PromotableRun): Promise<void> {
        if (!run.IsSettled) {
            return;
        }
        this.SelectedRunID = run.ID;
        if (!this.WorkflowName.trim()) {
            this.WorkflowName = run.Name;
        }
        this.cdr.markForCheck();
        await this.projectPastRunPreview(run);
    }

    /** Drafts (or refines) steps into the live right-hand Spatial Preview without saving. */
    public async OnDraftPreview(): Promise<void> {
        if (!this.CanDraftPreview) return;
        const name = this.WorkflowName.trim() || 'Untitled Workflow';
        const combinedDescription = this.RefinementPrompt.trim()
            ? `${this.Description.trim()}\n\nRefinement: ${this.RefinementPrompt.trim()}`
            : this.Description.trim();

        this.IsDrafting = true;
        this.DraftError = null;
        this.cdr.markForCheck();
        try {
            const draft = await this.draftSteps({
                Mode: 'describe',
                Name: name,
                Description: combinedDescription,
            });
            if (draft) {
                this.PreviewSpec = draft;
                if (this.RefinementPrompt.trim()) {
                    this.Description = combinedDescription;
                    this.RefinementPrompt = '';
                }
            }
        } finally {
            this.IsDrafting = false;
            this.cdr.markForCheck();
        }
    }

    /** Approves the preview (drafting first if needed) and emits to the host for saving into Studio. */
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

        if (request.Mode === 'blank') {
            this.Created.emit(request);
            return;
        }

        if (request.Mode === 'past-run') {
            this.Created.emit({ ...request, Draft: this.PreviewSpec ?? undefined });
            return;
        }

        // Describe mode: if user already drafted & inspected a preview, approve it immediately!
        if (this.PreviewSpec && this.PreviewSpec.tasks.length > 0) {
            this.Created.emit({ ...request, Draft: this.PreviewSpec });
            return;
        }

        // Otherwise draft on click and hand off to Studio.
        this.IsDrafting = true;
        this.DraftError = null;
        this.cdr.markForCheck();
        try {
            const draft = await this.draftSteps(request);
            this.Created.emit({ ...request, Draft: draft ?? undefined });
        } finally {
            this.IsDrafting = false;
            this.cdr.markForCheck();
        }
    }

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
     * Loads promotable runs PLUS a single batched query of their child steps so each row shows
     * real step counts and waiting-on-person notes without N+1 round-trips.
     */
    public async LoadPastRuns(): Promise<void> {
        this.IsLoadingRuns = true;
        this.RunsError = null;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.Provider);
            const result = await rv.RunView<MJTaskEntity>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID IS NULL AND Status IN ('Complete','Failed','Cancelled','In Progress')`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 25,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                undefined,
            );
            if (!result.Success) {
                this.RunsError = result.ErrorMessage ?? 'Past runs could not be loaded.';
                this.PastRuns = [];
                return;
            }
            const parents = result.Results ?? [];
            const stepCounts = new Map<string, number>();
            const humanWaitingCounts = new Map<string, number>();

            if (parents.length > 0) {
                const idList = parents.map((p) => `'${p.ID}'`).join(',');
                const childRes = await rv.RunView<MJTaskEntity>(
                    {
                        EntityName: 'MJ: Tasks',
                        ExtraFilter: `ParentID IN (${idList})`,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    undefined,
                );
                if (childRes.Success) {
                    for (const child of childRes.Results ?? []) {
                        const pid = (child.ParentID ?? '').toLowerCase();
                        if (!pid) continue;
                        stepCounts.set(pid, (stepCounts.get(pid) ?? 0) + 1);
                        if (child.StepType === 'Human' && child.Status === 'In Progress') {
                            humanWaitingCounts.set(pid, (humanWaitingCounts.get(pid) ?? 0) + 1);
                        }
                    }
                }
            }

            this.PastRuns = parents.map((t) => this.toPromotableRun(t, stepCounts, humanWaitingCounts));
        } catch (e) {
            this.RunsError = e instanceof Error ? e.message : String(e);
            this.PastRuns = [];
        } finally {
            this.IsLoadingRuns = false;
            this.cdr.markForCheck();
        }
    }

    /** Queries the chosen past run's child steps & dependencies and projects them into a live preview. */
    private async projectPastRunPreview(run: PromotableRun): Promise<void> {
        this.IsLoadingPreview = true;
        this.DraftError = null;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.Provider);
            const [tasksRes, depsRes] = await Promise.all([
                rv.RunView<MJTaskEntity>({
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID='${run.ID}'`,
                    OrderBy: 'CASE WHEN StartedAt IS NULL THEN 1 ELSE 0 END, StartedAt, __mj_CreatedAt',
                    ResultType: 'entity_object',
                    BypassCache: true,
                }),
                rv.RunView<MJTaskDependencyEntity>({
                    EntityName: 'MJ: Task Dependencies',
                    ExtraFilter: `TaskID IN (SELECT ID FROM [__mj].[vwTasks] WHERE ParentID='${run.ID}')`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                }),
            ]);
            if (this.SelectedRunID !== run.ID) return;
            const childTasks = tasksRes.Success ? (tasksRes.Results ?? []) : [];
            const deps = depsRes.Success ? (depsRes.Results ?? []) : [];
            const projection = ProjectTaskRowsToSpec(
                this.WorkflowName.trim() || run.Name,
                childTasks,
                deps,
            );
            this.PreviewSpec = projection.Spec;
        } catch (e) {
            this.DraftError = e instanceof Error ? e.message : String(e);
            this.PreviewSpec = null;
        } finally {
            this.IsLoadingPreview = false;
            this.cdr.markForCheck();
        }
    }

    private toPromotableRun(
        task: MJTaskEntity,
        stepCounts: Map<string, number>,
        humanWaitingCounts: Map<string, number>,
    ): PromotableRun {
        const key = task.ID.toLowerCase();
        const waiting = humanWaitingCounts.get(key) ?? 0;
        const durationMs =
            task.StartedAt && task.CompletedAt
                ? Math.max(0, new Date(task.CompletedAt).getTime() - new Date(task.StartedAt).getTime())
                : null;
        return {
            ID: task.ID,
            Name: task.Name,
            StepCount: stepCounts.get(key) ?? 0,
            Age: this.describeAge(task.CompletedAt ?? task.__mj_UpdatedAt),
            AgentName: task.Agent ?? 'Unattributed',
            Status: task.Status,
            IsSettled: task.Status === 'Complete',
            WaitingNote: waiting > 0 ? `${waiting} waiting on a person` : undefined,
            Duration: durationMs != null ? FormatShortDuration(durationMs) : undefined,
        };
    }

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
