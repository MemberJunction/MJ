import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJAIAgentEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { NavigationService } from '@memberjunction/ng-explorer-core';
import type { WorkflowDraftRequest, WorkflowListItem } from './workflows.types';

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

    constructor(private cdr: ChangeDetectorRef, private navigationService: NavigationService) {
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
                Name: a.Name,
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
     * The draft is carried as navigation state rather than written first — the middle tile promises
     * "Nothing is saved until you approve it", and approval happens on the canvas.
     */
    public OnCreated(request: WorkflowDraftRequest): void {
        this.IsCreating = false;
        this.cdr.markForCheck();
        this.navigationService.NavigateToResource('Workflow Editor', undefined, {
            mode: request.Mode,
            name: request.Name,
            description: request.Description ?? '',
            sourceRunId: request.SourceRunID ?? '',
        });
    }

    public OnOpenWorkflow(item: WorkflowListItem): void {
        this.navigationService.NavigateToResource('Workflow Editor', item.ID);
    }

    /** Reports surface state and registers the operations an agent may drive here. */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            Surface: 'Workflows',
            IsCreating: this.IsCreating,
            WorkflowCount: this.Workflows.length,
            WorkflowNames: this.Workflows.slice(0, 10).map((w) => w.Name),
        });

        this.navigationService.SetAgentClientTools(this, [
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
                Handler: async (params) => {
                    const wanted = String(params['name'] ?? '').trim().toLowerCase();
                    const match = this.Workflows.find((w) => w.Name.trim().toLowerCase() === wanted);
                    if (!match) {
                        return { Success: false, Message: `No workflow named "${params['name']}".` };
                    }
                    this.OnOpenWorkflow(match);
                    return { Success: true };
                },
            },
        ]);
    }
}
