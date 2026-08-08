import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity, ResourceData } from '@memberjunction/core-entities';
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

    /**
     * The draft being edited on the canvas, or null when the list is showing.
     *
     * Held here rather than persisted, because the front door's middle tile promises "Nothing is
     * saved until you approve it" — approval happens on the canvas, so until then the workflow
     * exists only as this value.
     */
    public DraftSpec: TaskGraphSpec | null = null;

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
            const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJAIAgentEntity>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `TypeID IN (SELECT ID FROM __mj.vwAIAgentTypes WHERE Name='Flow')`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object',
                },
                undefined,
            );
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
     * Takes the author from the front door to the canvas.
     *
     * The canvas is EMBEDDED rather than routed to. It is a widgets-layer component that
     * deliberately refuses to know about routing, and this app is what supplies the shell around it
     * — which is exactly the arrangement the plan calls for. Routing would also need a resource that
     * does not exist; inventing one to navigate to would be a link to nowhere.
     *
     * An empty graph for `blank`; for the other two doors the steps arrive later — drafted from the
     * brief, or projected from the run being promoted — and the canvas is where the author reviews
     * them either way.
     */
    public OnCreated(request: WorkflowDraftRequest): void {
        this.IsCreating = false;
        this.DraftSpec = {
            workflowName: request.Name,
            reasoning: request.Description,
            tasks: [],
        };
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** Leaves the canvas without saving. The draft is discarded — nothing was ever written. */
    public OnCloseCanvas(): void {
        this.DraftSpec = null;
        this.publishAgentContext();
        this.cdr.markForCheck();
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
            IsEditingDraft: !!this.DraftSpec,
            DraftName: this.DraftSpec?.workflowName ?? null,
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
