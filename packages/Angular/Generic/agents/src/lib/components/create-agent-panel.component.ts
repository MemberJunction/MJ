import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity, MJAIAgentPromptEntity, MJAIAgentActionEntity, MJActionEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Configuration for the CreateAgentPanel component.
 */
export interface CreateAgentConfig {
    /** Optional parent agent ID for creating sub-agents */
    ParentAgentId?: string;
    /** Optional parent agent name for display */
    ParentAgentName?: string;
    /** Initial name for the agent */
    InitialName?: string;
    /** Pre-selected agent type ID */
    InitialTypeId?: string;
    /** Title for the panel header */
    Title?: string;
    /** Whether to show advanced model configuration fields */
    ShowAdvancedConfig?: boolean;
}

/**
 * Result returned when an agent is created.
 */
export interface CreateAgentResult {
    /** Created agent entity (not saved to database) */
    Agent: MJAIAgentEntityExtended;
    /** Agent prompt link entities (not saved to database) */
    AgentPrompts?: MJAIAgentPromptEntity[];
    /** Agent action link entities (not saved to database) */
    AgentActions?: MJAIAgentActionEntity[];
}

/**
 * Base panel component for creating AI Agents.
 * This component contains all the logic and UI for agent creation.
 * Use CreateAgentDialogComponent or CreateAgentSlideInComponent as wrappers.
 *
 * Features:
 * - Creates both top-level agents and sub-agents
 * - Agent type selection with loaded types from AIEngineBase
 * - Basic info: Name, Description, Status, Execution Mode
 * - Advanced model configuration (optional)
 * - Linked prompts and actions management
 * - Returns unsaved entities for parent to handle atomically
 *
 * Usage:
 * ```html
 * <mj-create-agent-panel
 *     [Config]="{ Title: 'Create Agent' }"
 *     (Created)="onAgentCreated($event)"
 *     (Cancelled)="onCancel()">
 * </mj-create-agent-panel>
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-create-agent-panel',
    templateUrl: './create-agent-panel.component.html',
    styleUrls: ['./create-agent-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('slideDown', [
            transition(':enter', [
                style({ opacity: 0, transform: 'translateY(-8px)' }),
                animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
            ]),
            transition(':leave', [
                animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
            ])
        ]),
        trigger('fadeIn', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ])
        ])
    ]
})
export class CreateAgentPanelComponent implements OnInit, OnDestroy {
    // =========================================================================
    // Inputs & Outputs
    // =========================================================================

    private _config: CreateAgentConfig = {};

    @Input()
    set Config(value: CreateAgentConfig) {
        this._config = value || {};
        this.applyConfig();
    }
    get Config(): CreateAgentConfig {
        return this._config;
    }

    /** Emitted when agent is successfully created (returns unsaved entities) */
    @Output() Created = new EventEmitter<CreateAgentResult>();

    /** Emitted when user cancels the creation */
    @Output() Cancelled = new EventEmitter<void>();

    // =========================================================================
    // Public State
    // =========================================================================

    public Form!: FormGroup;
    public IsLoading = true;
    public IsSubmitting = false;
    public AgentTypes: MJAIAgentTypeEntity[] = [];
    public LinkedPrompts: MJAIPromptEntityExtended[] = [];
    public LinkedActions: MJActionEntity[] = [];
    public ShowAdvancedConfig = false;
    public ErrorMessage: string | null = null;

    // =========================================================================
    // Private State
    // =========================================================================

    private destroy$ = new Subject<void>();
    private agentEntity: MJAIAgentEntityExtended | null = null;
    private agentPromptLinks: MJAIAgentPromptEntity[] = [];
    private agentActionLinks: MJAIAgentActionEntity[] = [];
    private availablePrompts: MJAIPromptEntityExtended[] = [];
    private availableActions: MJActionEntity[] = [];

    constructor(
        private fb: FormBuilder,
        private cdr: ChangeDetectorRef
    ) {}

    // =========================================================================
    // Lifecycle
    // =========================================================================

    ngOnInit(): void {
        this.initializeForm();
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    private initializeForm(): void {
        this.Form = this.fb.group({
            name: ['', [Validators.required, Validators.maxLength(255)]],
            description: [''],
            typeId: ['', Validators.required],
            status: ['Pending'],
            executionMode: ['Sequential'],
            purpose: [''],
            userMessage: [''],
            modelSelectionMode: ['Agent Type'],
            temperature: [0.1, [Validators.min(0), Validators.max(2)]],
            topP: [0.1, [Validators.min(0), Validators.max(1)]],
            topK: [40, [Validators.min(1), Validators.max(100)]],
            maxTokens: [4000, [Validators.min(1), Validators.max(32000)]],
            enableCaching: [false],
            cacheTTL: [3600, [Validators.min(60), Validators.max(86400)]]
        });

        // Watch for form changes
        this.Form.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.syncEntityFromForm());
    }

    private applyConfig(): void {
        if (!this.Form) return;

        if (this._config.InitialName) {
            this.Form.patchValue({ name: this._config.InitialName });
        }
        if (this._config.InitialTypeId) {
            this.Form.patchValue({ typeId: this._config.InitialTypeId });
        }
        if (this._config.ShowAdvancedConfig !== undefined) {
            this.ShowAdvancedConfig = this._config.ShowAdvancedConfig;
        }
    }

    private async loadData(): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            // Load agent types from AIEngineBase
            const engine = AIEngineBase.Instance;
            await engine.Config(false);
            this.AgentTypes = engine.AgentTypes as MJAIAgentTypeEntity[];

            // Load available prompts and actions in parallel
            const rv = new RunView();
            const [promptsResult, actionsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Prompts',
                    ExtraFilter: `Status = 'Active'`,
                    OrderBy: 'Name ASC',
                    MaxRows: 1000,
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Actions',
                    ExtraFilter: `Status = 'Active'`,
                    OrderBy: 'Name ASC',
                    MaxRows: 1000,
                    ResultType: 'entity_object'
                }
            ]);

            if (promptsResult.Success && promptsResult.Results) {
                this.availablePrompts = promptsResult.Results as MJAIPromptEntityExtended[];
            }
            if (actionsResult.Success && actionsResult.Results) {
                this.availableActions = actionsResult.Results as MJActionEntity[];
            }

            // Set default type if not specified and types are available
            if (!this._config.InitialTypeId && this.AgentTypes.length > 0) {
                this.Form.patchValue({ typeId: this.AgentTypes[0].ID });
            }

            // Create the agent entity
            await this.createAgentEntity();

        } catch (error) {
            console.error('Error loading agent creation data:', error);
            this.ErrorMessage = 'Failed to load agent creation data. Please try again.';
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private async createAgentEntity(): Promise<void> {
        const md = new Metadata();
        this.agentEntity = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
        this.agentEntity.NewRecord();

        // Set defaults
        this.agentEntity.Status = 'Pending';
        this.agentEntity.ExecutionMode = 'Sequential';
        this.agentEntity.ExposeAsAction = false;
        this.agentEntity.ModelSelectionMode = 'Agent Type';

        // Set parent if creating sub-agent
        if (this._config.ParentAgentId) {
            this.agentEntity.ParentID = this._config.ParentAgentId;
        }

        // Set model config defaults
        this.agentEntity.Set('Temperature', 0.1);
        this.agentEntity.Set('TopP', 0.1);
        this.agentEntity.Set('TopK', 40);
        this.agentEntity.Set('MaxTokensPerRun', 4000);
        this.agentEntity.Set('EnableCaching', false);
        this.agentEntity.Set('CacheTTLSeconds', 3600);
    }

    private syncEntityFromForm(): void {
        if (!this.agentEntity) return;

        const v = this.Form.value;
        this.agentEntity.Name = v.name;
        this.agentEntity.Description = v.description || '';
        this.agentEntity.TypeID = v.typeId;
        this.agentEntity.Status = v.status;
        this.agentEntity.ExecutionMode = v.executionMode;
        this.agentEntity.Set('Purpose', v.purpose || '');
        this.agentEntity.Set('UserMessage', v.userMessage || '');
        this.agentEntity.ModelSelectionMode = v.modelSelectionMode;
        this.agentEntity.Set('Temperature', v.temperature);
        this.agentEntity.Set('TopP', v.topP);
        this.agentEntity.Set('TopK', v.topK);
        this.agentEntity.Set('MaxTokensPerRun', v.maxTokens);
        this.agentEntity.Set('EnableCaching', v.enableCaching);
        this.agentEntity.Set('CacheTTLSeconds', v.cacheTTL);
    }

    // =========================================================================
    // Public Methods
    // =========================================================================

    public get IsSubAgent(): boolean {
        return !!this._config.ParentAgentId;
    }

    public get Title(): string {
        if (this._config.Title) return this._config.Title;
        return this.IsSubAgent ? 'Create Sub-Agent' : 'Create New Agent';
    }

    public get LinkedPromptCount(): number {
        return this.LinkedPrompts.length;
    }

    public get LinkedActionCount(): number {
        return this.LinkedActions.length;
    }

    public get AvailablePrompts(): MJAIPromptEntityExtended[] {
        return this.availablePrompts;
    }

    public get AvailableActions(): MJActionEntity[] {
        return this.availableActions;
    }

    public ToggleAdvancedConfig(): void {
        this.ShowAdvancedConfig = !this.ShowAdvancedConfig;
        this.cdr.markForCheck();
    }

    public TrackById(_index: number, item: { ID: string }): string {
        return item.ID;
    }

    // =========================================================================
    // Prompt Management
    // =========================================================================

    public ShowPromptSelector = false;
    public PromptSearchQuery = '';
    public FilteredPrompts: MJAIPromptEntityExtended[] = [];

    public OnOpenPromptSelector(): void {
        this.ShowPromptSelector = true;
        this.PromptSearchQuery = '';
        this.updateFilteredPrompts();
        this.cdr.markForCheck();
    }

    public OnClosePromptSelector(): void {
        this.ShowPromptSelector = false;
        this.PromptSearchQuery = '';
        this.cdr.markForCheck();
    }

    public OnPromptSearchChanged(): void {
        this.updateFilteredPrompts();
        this.cdr.markForCheck();
    }

    private updateFilteredPrompts(): void {
        const query = this.PromptSearchQuery.toLowerCase().trim();
        const linkedIds = new Set(this.LinkedPrompts.map(p => p.ID));

        // Filter out already linked prompts
        let available = this.availablePrompts.filter(p => !linkedIds.has(p.ID));

        // Apply search filter
        if (query) {
            available = available.filter(p =>
                p.Name.toLowerCase().includes(query) ||
                (p.Description && p.Description.toLowerCase().includes(query))
            );
        }

        // Limit results
        this.FilteredPrompts = available.slice(0, 20);
    }

    public async OnSelectPrompt(prompt: MJAIPromptEntityExtended): Promise<void> {
        if (!this.agentEntity) return;

        // Add to linked prompts
        this.LinkedPrompts.push(prompt);

        // Create link entity
        const md = new Metadata();
        const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts');
        agentPrompt.NewRecord();
        agentPrompt.AgentID = this.agentEntity.ID;
        agentPrompt.PromptID = prompt.ID;
        agentPrompt.Status = 'Active';
        agentPrompt.ExecutionOrder = this.agentPromptLinks.length + 1;
        this.agentPromptLinks.push(agentPrompt);

        this.OnClosePromptSelector();
    }

    public RemovePrompt(prompt: MJAIPromptEntityExtended): void {
        const index = this.LinkedPrompts.findIndex(p => UUIDsEqual(p.ID, prompt.ID));
        if (index >= 0) {
            this.LinkedPrompts.splice(index, 1);
        }

        const linkIndex = this.agentPromptLinks.findIndex(ap => UUIDsEqual(ap.PromptID, prompt.ID));
        if (linkIndex >= 0) {
            this.agentPromptLinks.splice(linkIndex, 1);
        }

        this.cdr.markForCheck();
    }

    // =========================================================================
    // Action Management
    // =========================================================================

    public ShowActionSelector = false;
    public ActionSearchQuery = '';
    public FilteredActions: MJActionEntity[] = [];

    public OnOpenActionSelector(): void {
        this.ShowActionSelector = true;
        this.ActionSearchQuery = '';
        this.updateFilteredActions();
        this.cdr.markForCheck();
    }

    public OnCloseActionSelector(): void {
        this.ShowActionSelector = false;
        this.ActionSearchQuery = '';
        this.cdr.markForCheck();
    }

    public OnActionSearchChanged(): void {
        this.updateFilteredActions();
        this.cdr.markForCheck();
    }

    private updateFilteredActions(): void {
        const query = this.ActionSearchQuery.toLowerCase().trim();
        const linkedIds = new Set(this.LinkedActions.map(a => a.ID));

        // Filter out already linked actions
        let available = this.availableActions.filter(a => !linkedIds.has(a.ID));

        // Apply search filter
        if (query) {
            available = available.filter(a =>
                a.Name.toLowerCase().includes(query) ||
                (a.Description && a.Description.toLowerCase().includes(query))
            );
        }

        // Limit results
        this.FilteredActions = available.slice(0, 20);
    }

    public async OnSelectAction(action: MJActionEntity): Promise<void> {
        if (!this.agentEntity) return;

        // Add to linked actions
        this.LinkedActions.push(action);

        // Create link entity
        const md = new Metadata();
        const agentAction = await md.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions');
        agentAction.NewRecord();
        agentAction.AgentID = this.agentEntity.ID;
        agentAction.ActionID = action.ID;
        agentAction.Status = 'Active';
        this.agentActionLinks.push(agentAction);

        this.OnCloseActionSelector();
    }

    public RemoveAction(action: MJActionEntity): void {
        const index = this.LinkedActions.findIndex(a => UUIDsEqual(a.ID, action.ID));
        if (index >= 0) {
            this.LinkedActions.splice(index, 1);
        }

        const linkIndex = this.agentActionLinks.findIndex(aa => UUIDsEqual(aa.ActionID, action.ID));
        if (linkIndex >= 0) {
            this.agentActionLinks.splice(linkIndex, 1);
        }

        this.cdr.markForCheck();
    }

    // =========================================================================
    // Form Actions
    // =========================================================================

    public OnSubmit(): void {
        if (this.Form.invalid || !this.agentEntity || this.IsSubmitting) {
            // Mark all fields as touched to show validation errors
            this.Form.markAllAsTouched();
            this.cdr.markForCheck();
            return;
        }

        this.IsSubmitting = true;
        this.cdr.markForCheck();

        try {
            // Sync final form values to entity
            this.syncEntityFromForm();

            // Emit result with unsaved entities
            const result: CreateAgentResult = {
                Agent: this.agentEntity,
                AgentPrompts: this.agentPromptLinks.length > 0 ? this.agentPromptLinks : undefined,
                AgentActions: this.agentActionLinks.length > 0 ? this.agentActionLinks : undefined
            };

            this.Created.emit(result);

        } catch (error) {
            console.error('Error creating agent:', error);
            this.ErrorMessage = 'Failed to create agent. Please try again.';
        } finally {
            this.IsSubmitting = false;
            this.cdr.markForCheck();
        }
    }

    public OnCancel(): void {
        this.Cancelled.emit();
    }
}
