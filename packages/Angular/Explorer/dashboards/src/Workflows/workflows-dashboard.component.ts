import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity, ResourceData, WorkflowSaveOperation } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { WorkflowDraftRequest, WorkflowListItem } from './workflows.types';

/**
 * Local alias for the client-tool shape `NavigationService.SetAgentClientTools` accepts. Declared
 * here rather than imported, matching the Scheduling dashboard, so this file adds no re-export
 * across packages.
 */
type WorkflowsAgentTool = {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

/**
 * The Workflows app — a workflow list and the Create Workflow front door.
 *
 * **Why its own app rather than a tab in AI (D18/D19).** The vocabulary rule is that end users see
 * *Workflow*; *Flow Agent* survives only in metadata and dev docs. Filing this under "AI" would
 * contradict that at the navigation level — someone looking to automate a task does not look under
 * AI — and D19 exists precisely because the editor is currently buried inside a saved agent record.
 *
 * The front door replaces the save-the-agent-record-first requirement. `UIFormSectionKey` stays
 * mounted for the record-form context, but it stops being the only door.
 */
@Component({
    standalone: false,
    selector: 'mj-workflows-dashboard',
    templateUrl: './workflows-dashboard.component.html',
    styleUrls: ['./workflows-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'WorkflowsDashboard')
export class WorkflowsDashboardComponent extends BaseDashboard implements AfterViewInit {
    public IsLoading = false;
    public Workflows: WorkflowListItem[] = [];
    public LoadError: string | null = null;

    /** True while the front door is open over the list. */
    public IsCreating = false;

    /** True while the drafted workflow is being committed. */
    public IsSaving = false;

    /** Why the commit failed, or null. Kept on screen so a failed create is never silent. */
    public SaveError: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflows';
    }

    initDashboard(): void {
        // Nothing to set up beyond what loadData does — the front door is opened on demand.
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
    }

    /**
     * Loads saved workflows.
     *
     * A workflow *is* a Flow agent — that is the substrate D18 renames rather than replaces — so the
     * list reads `MJ: AI Agents` filtered to the Flow type. The filter is by type name rather than a
     * hardcoded ID so an instance that reseeded its agent types still resolves.
     */
    async loadData(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJAIAgentEntity>({
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `TypeID IN (SELECT ID FROM __mj.vwAIAgentTypes WHERE Name='Flow')`,
                OrderBy: '__mj_UpdatedAt DESC',
                ResultType: 'entity_object',
            });

            if (!result.Success) {
                this.LoadError = result.ErrorMessage ?? 'Workflows could not be loaded.';
                this.Workflows = [];
                return;
            }
            this.Workflows = (result.Results ?? []).map((a) => ({
                ID: a.ID,
                // Name is nullable on the entity. A row with no label is unfindable, so it says so
                // rather than rendering blank — the ID is still there to open it by.
                Name: a.Name ?? '(unnamed workflow)',
                Description: a.Description,
                Status: a.Status,
                // Until the trigger reconciler is asked, everything reads as On demand — which is the
                // truthful default (④: saving is capture, not scheduling).
                TriggerSummary: 'On demand',
                UpdatedAt: a.__mj_UpdatedAt,
            }));
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Workflows = [];
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    public OnStartCreate(): void {
        this.IsCreating = true;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnCancelCreate(): void {
        this.IsCreating = false;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /**
     * Commits the new workflow, then hands the author to the editor.
     *
     * **There is exactly one workflow editor, and it is the AI Agents form.** The front door used to
     * open a second canvas here, which is the duplication that got this app retired: that canvas had
     * no Save path anywhere on it, so a drafted workflow could be admired and never kept. Rather than
     * restore the dead end, the front door now finishes the job it started — `Workflow.Save` writes
     * the agent and everything hanging off it, and the author lands on the real editor with a real
     * record under them.
     *
     * `Workflow.Save` rather than a bespoke mutation because it is the same typed call MCP and the
     * Agent Manager use, so a workflow created by hand and one created conversationally are written
     * by identical code.
     */
    public async OnCreated(request: WorkflowDraftRequest): Promise<void> {
        this.IsSaving = true;
        this.SaveError = null;
        this.cdr.markForCheck();
        try {
            // The drafted steps when an agent produced them; an empty graph otherwise — which is the
            // right outcome for "Blank canvas", and an honest one when drafting failed or was skipped.
            const spec: TaskGraphSpec = (request.Draft as TaskGraphSpec | undefined) ?? {
                workflowName: request.Name,
                reasoning: request.Description,
                tasks: [],
            };

            const op = new WorkflowSaveOperation();
            const result = await op.Execute(
                {
                    spec: {
                        name: request.Name,
                        description: request.Description,
                        // Draft, not Active. Saving is capture (④) — a workflow that started
                        // running the moment it was named would be a trap, and the author has not
                        // seen the steps in the editor yet.
                        status: 'Draft',
                        graph: { ...spec, workflowName: request.Name },
                        // Explicitly none. A trigger is not asked for on this screen, and an empty
                        // array says "on demand" where omitting it would leave the reconciler
                        // guessing at intent it was never given.
                        triggers: [],
                    },
                },
                { provider: this.ProviderToUse, user: this.ProviderToUse.CurrentUser },
            );

            const agentID = result.Success ? result.Output?.agentID : undefined;
            if (!agentID) {
                this.SaveError =
                    result.Output?.errorMessage ??
                    result.ErrorMessage ??
                    'The workflow could not be saved.';
                return;
            }

            this.IsCreating = false;
            await this.loadData();
            this.navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(agentID));
        } catch (e) {
            this.SaveError = e instanceof Error ? e.message : String(e);
        } finally {
            this.IsSaving = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    /**
     * Opens a saved workflow.
     *
     * A workflow IS a Flow agent, so this opens that record — the substrate D18 renames rather than
     * replaces. The dedicated editor surface is Phase 5's canvas work; until it has its own route,
     * the record form is the honest destination rather than a link to nothing.
     */
    public OnOpenWorkflow(item: WorkflowListItem): void {
        this.navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(item.ID));
    }

    /** Reports surface state and registers the operations an agent may drive here. */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            Surface: 'Workflows',
            IsCreating: this.IsCreating,
            IsSaving: this.IsSaving,
            SaveError: this.SaveError,
            WorkflowCount: this.Workflows.length,
            WorkflowNames: this.Workflows.slice(0, 10).map((w) => w.Name),
        });

        const tools: WorkflowsAgentTool[] = [
            {
                Name: 'OpenCreateWorkflow',
                Description: 'Open the Create Workflow front door',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.OnStartCreate();
                    return { Success: true };
                },
            },
            {
                Name: 'OpenWorkflow',
                Description: 'Open a saved workflow by name',
                ParameterSchema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    required: ['name'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const wanted = String(params['name'] ?? '').trim().toLowerCase();
                    const match = this.Workflows.find((w) => w.Name.trim().toLowerCase() === wanted);
                    if (!match) {
                        return { Success: false, Message: `No workflow named "${params['name']}".` };
                    }
                    this.OnOpenWorkflow(match);
                    return { Success: true };
                },
            },
        ];
        this.navigationService.SetAgentClientTools(this, tools);
    }
}
