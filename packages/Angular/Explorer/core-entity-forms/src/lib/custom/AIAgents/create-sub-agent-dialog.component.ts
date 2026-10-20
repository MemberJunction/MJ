import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewContainerRef, Output, EventEmitter } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity, MJAIAgentPromptEntity, MJAIAgentActionEntity, MJActionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentManagementService } from './ai-agent-management.service';
import { MJAIPromptEntityExtended, MJAIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface CreateSubAgentConfig {
  /** Title for the dialog */
  title?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  /** Initial name for the sub-agent */
  InitialName?: string;
  /** Pre-selected agent type ID */
  InitialTypeID?: string;
  /** Parent agent ID for relationship */
  ParentAgentId: string;
  /** Parent agent name for display */
  ParentAgentName?: string;
}

export interface CreateSubAgentResult {
  /** Created sub-agent entity (not saved to database) */
  SubAgent: MJAIAgentEntityExtended;
  /** Agent prompt link entities (not saved to database) */
  AgentPrompts?: MJAIAgentPromptEntity[];
  /** Agent action link entities (not saved to database) */
  AgentActions?: MJAIAgentActionEntity[];
  /** Any new prompts created within the dialog */
  NewPrompts?: MJAIPromptEntityExtended[];
  /** Any new prompt templates created within the dialog */
  NewPromptTemplates?: any[];
  /** Any new template contents created within the dialog */
  NewTemplateContents?: any[];
}

/**
 * Dialog for creating new AI Sub-Agents with essential fields, actions, and prompts management.
 * Creates entities but does not save them - returns entities for parent to add to PendingRecords.
 * This ensures atomicity with the parent form's save operation.
 */
@Component({
  standalone: false,
  selector: 'mj-create-sub-agent-dialog',
  templateUrl: './create-sub-agent-dialog.component.html',
  styleUrls: ['./create-sub-agent-dialog.component.css']
})
export class CreateSubAgentDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Configuration
  config: CreateSubAgentConfig = {} as CreateSubAgentConfig;
  
  // State management
  private destroy$ = new Subject<void>();
  public Result = new Subject<CreateSubAgentResult | null>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Form and validation
  SubAgentForm: FormGroup;

  /** @deprecated Use {@link SubAgentForm}. */
  get subAgentForm(): FormGroup {
    return this.SubAgentForm;
  }
  /** @deprecated Use {@link SubAgentForm}. */
  set subAgentForm(value: FormGroup) {
    this.SubAgentForm = value;
  }
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
  }
  IsSaving$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsSaving$}. */
  get isSaving$() {
    return this.IsSaving$;
  }
  /** @deprecated Use {@link IsSaving$}. */
  set isSaving$(value) {
    this.IsSaving$ = value;
  }
  
  // Data
  AvailableAgentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);

  /** @deprecated Use {@link AvailableAgentTypes$}. */
  get availableAgentTypes$() {
    return this.AvailableAgentTypes$;
  }
  /** @deprecated Use {@link AvailableAgentTypes$}. */
  set availableAgentTypes$(value) {
    this.AvailableAgentTypes$ = value;
  }
  AvailablePrompts$ = new BehaviorSubject<MJAIPromptEntityExtended[]>([]);

  /** @deprecated Use {@link AvailablePrompts$}. */
  get availablePrompts$() {
    return this.AvailablePrompts$;
  }
  /** @deprecated Use {@link AvailablePrompts$}. */
  set availablePrompts$(value) {
    this.AvailablePrompts$ = value;
  }
  AvailableActions$ = new BehaviorSubject<MJActionEntity[]>([]);

  /** @deprecated Use {@link AvailableActions$}. */
  get availableActions$() {
    return this.AvailableActions$;
  }
  /** @deprecated Use {@link AvailableActions$}. */
  set availableActions$(value) {
    this.AvailableActions$ = value;
  }
  
  // Entities (not saved to database)
  SubAgentEntity: MJAIAgentEntityExtended | null = null;

  /** @deprecated Use {@link SubAgentEntity}. */
  get subAgentEntity(): MJAIAgentEntityExtended | null {
    return this.SubAgentEntity;
  }
  /** @deprecated Use {@link SubAgentEntity}. */
  set subAgentEntity(value: MJAIAgentEntityExtended | null) {
    this.SubAgentEntity = value;
  }
  LinkedPrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link LinkedPrompts}. */
  get linkedPrompts(): MJAIPromptEntityExtended[] {
    return this.LinkedPrompts;
  }
  /** @deprecated Use {@link LinkedPrompts}. */
  set linkedPrompts(value: MJAIPromptEntityExtended[]) {
    this.LinkedPrompts = value;
  }
  LinkedActions: MJActionEntity[] = [];

  /** @deprecated Use {@link LinkedActions}. */
  get linkedActions(): MJActionEntity[] {
    return this.LinkedActions;
  }
  /** @deprecated Use {@link LinkedActions}. */
  set linkedActions(value: MJActionEntity[]) {
    this.LinkedActions = value;
  }
  
  // Link entities for database relationships
  AgentPromptLinks: MJAIAgentPromptEntity[] = [];

  /** @deprecated Use {@link AgentPromptLinks}. */
  get agentPromptLinks(): MJAIAgentPromptEntity[] {
    return this.AgentPromptLinks;
  }
  /** @deprecated Use {@link AgentPromptLinks}. */
  set agentPromptLinks(value: MJAIAgentPromptEntity[]) {
    this.AgentPromptLinks = value;
  }
  AgentActionLinks: MJAIAgentActionEntity[] = [];

  /** @deprecated Use {@link AgentActionLinks}. */
  get agentActionLinks(): MJAIAgentActionEntity[] {
    return this.AgentActionLinks;
  }
  /** @deprecated Use {@link AgentActionLinks}. */
  set agentActionLinks(value: MJAIAgentActionEntity[]) {
    this.AgentActionLinks = value;
  }
  
  // Storage for new entities created within dialog
  NewlyCreatedPrompts: MJAIPromptEntityExtended[] = [];

  /** @deprecated Use {@link NewlyCreatedPrompts}. */
  get newlyCreatedPrompts(): MJAIPromptEntityExtended[] {
    return this.NewlyCreatedPrompts;
  }
  /** @deprecated Use {@link NewlyCreatedPrompts}. */
  set newlyCreatedPrompts(value: MJAIPromptEntityExtended[]) {
    this.NewlyCreatedPrompts = value;
  }
  NewlyCreatedPromptTemplates: any[] = [];

  /** @deprecated Use {@link NewlyCreatedPromptTemplates}. */
  get newlyCreatedPromptTemplates(): any[] {
    return this.NewlyCreatedPromptTemplates;
  }
  /** @deprecated Use {@link NewlyCreatedPromptTemplates}. */
  set newlyCreatedPromptTemplates(value: any[]) {
    this.NewlyCreatedPromptTemplates = value;
  }
  NewlyCreatedTemplateContents: any[] = [];

  /** @deprecated Use {@link NewlyCreatedTemplateContents}. */
  get newlyCreatedTemplateContents(): any[] {
    return this.NewlyCreatedTemplateContents;
  }
  /** @deprecated Use {@link NewlyCreatedTemplateContents}. */
  set newlyCreatedTemplateContents(value: any[]) {
    this.NewlyCreatedTemplateContents = value;
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private agentManagementService: AIAgentManagementService,
    private viewContainerRef: ViewContainerRef
  ) {
    super();
    this.SubAgentForm = this.createForm();
  }

  ngOnInit() {
    this.loadInitialData();
    this.setupFormWatching();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return new FormGroup({
      name: new FormControl(this.config.InitialName || '', [Validators.required]),
      description: new FormControl(''),
      typeID: new FormControl(this.config.InitialTypeID || '', [Validators.required]),
      status: new FormControl('Pending'),
      executionMode: new FormControl('Sequential'),
      purpose: new FormControl(''),
      userMessage: new FormControl(''),
      // systemMessage: new FormControl(''), // SystemMessage does not exist on MJAIAgentEntity
      modelSelectionMode: new FormControl('Agent Type'),
      temperature: new FormControl(0.1),
      topP: new FormControl(0.1),
      topK: new FormControl(40),
      maxTokens: new FormControl(4000),
      enableCaching: new FormControl(false),
      cacheTTL: new FormControl(3600)
    });
  }

  private setupFormWatching() {
    // Watch for form changes to update entity
    this.SubAgentForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(formValue => {
        this.updateSubAgentEntity(formValue);
      });
  }

  private async loadInitialData() {
    this.IsLoading$.next(true);
    
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Load all data in a single batch for better performance
      const results = await rv.RunViews([
        // Agent types (index 0)
        {
          EntityName: 'MJ: AI Agent Types',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        // Available prompts (index 1)
        {
          EntityName: 'MJ: AI Prompts',
          ExtraFilter: `Status = 'Active'`,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        // Available actions (index 2)
        {
          EntityName: 'MJ: Actions',
          ExtraFilter: `Status = 'Active'`,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        }
      ]);

      // Process agent types (index 0)
      if (results[0].Success && results[0].Results) {
        this.AvailableAgentTypes$.next(results[0].Results as MJAIAgentTypeEntity[]);
        
        // Set default type if not specified
        if (!this.config.InitialTypeID && results[0].Results.length > 0) {
          this.SubAgentForm.patchValue({ typeID: results[0].Results[0].ID });
        }
      }

      // Process available prompts (index 1)
      if (results[1].Success && results[1].Results) {
        this.AvailablePrompts$.next(results[1].Results as MJAIPromptEntityExtended[]);
      }

      // Process available actions (index 2)
      const actionsResult = results[2];

      if (actionsResult.Success && actionsResult.Results) {
        this.AvailableActions$.next(actionsResult.Results);
      }

      // Create the sub-agent entity
      const md = this.ProviderToUse;
      this.SubAgentEntity = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
      this.SubAgentEntity.NewRecord();
      
      // Set default values
      this.SubAgentEntity.Status = 'Pending';
      this.SubAgentEntity.ExecutionMode = 'Sequential';
      this.SubAgentEntity.ExposeAsAction = false; // Database constraint for sub-agents
      this.SubAgentEntity.ParentID = this.config.ParentAgentId;
      this.SubAgentEntity.ModelSelectionMode = 'Agent Type';
      this.SubAgentEntity.Set('Temperature', 0.1);
      this.SubAgentEntity.Set('TopP', 0.1);
      this.SubAgentEntity.Set('TopK', 40);
      this.SubAgentEntity.Set('MaxTokensPerRun', 4000);
      this.SubAgentEntity.Set('EnableCaching', false);
      this.SubAgentEntity.Set('CacheTTLSeconds', 3600);

      // Update form with initial values
      this.updateSubAgentEntity(this.SubAgentForm.value);

    } catch (error) {
      console.error('Error loading sub-agent creation data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading data for sub-agent creation',
        'error',
        3000
      );
    } finally {
      this.IsLoading$.next(false);
    }
  }

  private updateSubAgentEntity(formValue: any) {
    if (!this.SubAgentEntity) return;

    // Update entity with form values
    this.SubAgentEntity.Name = formValue.name;
    this.SubAgentEntity.Description = formValue.description || '';
    this.SubAgentEntity.TypeID = formValue.typeID;
    this.SubAgentEntity.Status = formValue.status;
    this.SubAgentEntity.ExecutionMode = formValue.executionMode;
    this.SubAgentEntity.Set('Purpose', formValue.purpose || '');
    this.SubAgentEntity.Set('UserMessage', formValue.userMessage || '');
    // Note: SystemMessage does not exist on MJAIAgentEntityExtended, removing this line
    this.SubAgentEntity.ModelSelectionMode = formValue.modelSelectionMode;
    this.SubAgentEntity.Set('Temperature', formValue.temperature);
    this.SubAgentEntity.Set('TopP', formValue.topP);
    this.SubAgentEntity.Set('TopK', formValue.topK);
    this.SubAgentEntity.Set('MaxTokensPerRun', formValue.maxTokens);
    this.SubAgentEntity.Set('EnableCaching', formValue.enableCaching);
    this.SubAgentEntity.Set('CacheTTLSeconds', formValue.cacheTTL);
  }

  public async AddPrompt() {
    // Get currently linked prompt IDs
    const linkedPromptIds = this.LinkedPrompts.map(p => p.ID);
    
    try {
      this.agentManagementService.openPromptSelectorDialog({
        title: 'Add Prompts to Sub-Agent',
        multiSelect: true,
        selectedPromptIds: [],
        showCreateNew: true,
        linkedPromptIds: linkedPromptIds,
        viewContainerRef: this.viewContainerRef
      }).subscribe({
        next: async (result) => {
          if (result && result.SelectedPrompts.length > 0) {
            // Filter out already linked prompts
            const newPrompts = result.SelectedPrompts.filter(prompt =>
              !linkedPromptIds.some(id => UUIDsEqual(id, prompt.ID))
            );
            
            if (newPrompts.length > 0) {
              // Add to UI
              this.LinkedPrompts.push(...newPrompts);
              
              // Create agent prompt link entities
              const md = this.ProviderToUse;
              for (const prompt of newPrompts) {
                const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts');
                agentPrompt.NewRecord();
                agentPrompt.AgentID = this.SubAgentEntity!.ID;
                agentPrompt.PromptID = prompt.ID;
                agentPrompt.Status = 'Active';
                agentPrompt.ExecutionOrder = this.AgentPromptLinks.length + 1;
                
                this.AgentPromptLinks.push(agentPrompt);
              }
              
              // Trigger change detection
              this.cdr.detectChanges();
              
              MJNotificationService.Instance.CreateSimpleNotification(
                `${newPrompts.length} prompt${newPrompts.length === 1 ? '' : 's'} added to sub-agent`,
                'success',
                3000
              );
            }
          } else if (result && result.createNew) {
            // User wants to create a new prompt
            await this.CreateNewPrompt();
          }
        },
        error: (error) => {
          console.error('Error opening prompt selector:', error);
          MJNotificationService.Instance.CreateSimpleNotification(
            'Error opening prompt selector. Please try again.',
            'error',
            3000
          );
        }
      });
    } catch (error) {
      console.error('Error in addPrompt:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error adding prompts. Please try again.',
        'error',
        3000
      );
    }
  }

  /** @deprecated Use {@link AddPrompt}. */
  public async addPrompt() {
    return this.AddPrompt();
  }

  public async CreateNewPrompt() {
    try {
      this.agentManagementService.openCreatePromptDialog({
        title: `Create New Prompt for ${this.SubAgentEntity?.Name || 'Sub-Agent'}`,
        initialName: '',
        viewContainerRef: this.viewContainerRef
      }).subscribe({
        next: async (result) => {
          if (result && result.prompt) {
            try {
              // Store the newly created entities
              this.NewlyCreatedPrompts.push(result.prompt);
              
              if (result.Template) {
                this.NewlyCreatedPromptTemplates.push(result.Template);
              }
              
              if (result.templateContents && result.templateContents.length > 0) {
                this.NewlyCreatedTemplateContents.push(...result.templateContents);
              }

              // Add to UI
              this.LinkedPrompts.push(result.prompt);
              
              // Create agent prompt link entity
              const md = this.ProviderToUse;
              const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts');
              agentPrompt.NewRecord();
              agentPrompt.AgentID = this.SubAgentEntity!.ID;
              agentPrompt.PromptID = result.prompt.ID;
              agentPrompt.Status = 'Active';
              agentPrompt.ExecutionOrder = this.AgentPromptLinks.length + 1;
              
              this.AgentPromptLinks.push(agentPrompt);

              // Trigger change detection
              this.cdr.detectChanges();

              MJNotificationService.Instance.CreateSimpleNotification(
                `New prompt "${result.prompt.Name}" created and linked to sub-agent`,
                'success',
                3000
              );
            } catch (error) {
              console.error('Error processing created prompt:', error);
              MJNotificationService.Instance.CreateSimpleNotification(
                'Error processing created prompt. Please try again.',
                'error',
                3000
              );
            }
          }
        },
        error: (error) => {
          console.error('Error in create prompt dialog:', error);
          MJNotificationService.Instance.CreateSimpleNotification(
            'Error opening prompt creation dialog. Please try again.',
            'error',
            3000
          );
        }
      });
    } catch (error) {
      console.error('Error in createNewPrompt:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error creating new prompt. Please try again.',
        'error',
        3000
      );
    }
  }

  /** @deprecated Use {@link CreateNewPrompt}. */
  public async createNewPrompt() {
    return this.CreateNewPrompt();
  }

  public async AddAction() {
    // Get currently linked action IDs
    const linkedActionIds = this.LinkedActions.map(a => a.ID);
    
    try {
      this.agentManagementService.openAddActionDialog({
        agentId: this.SubAgentEntity?.ID || '',
        agentName: this.SubAgentEntity?.Name || 'Sub-Agent',
        existingActionIds: linkedActionIds,
        viewContainerRef: this.viewContainerRef
      }).subscribe({
        next: async (selectedActions) => {
          if (selectedActions && selectedActions.length > 0) {
            // Filter out already linked actions
            const newActions = selectedActions.filter(action =>
              !linkedActionIds.some(id => UUIDsEqual(id, action.ID))
            );
            
            if (newActions.length > 0) {
              // Add to UI
              this.LinkedActions.push(...newActions);
              
              // Create agent action link entities
              const md = this.ProviderToUse;
              for (const action of newActions) {
                const agentAction = await md.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions');
                agentAction.NewRecord();
                agentAction.AgentID = this.SubAgentEntity!.ID;
                agentAction.ActionID = action.ID;
                agentAction.Status = 'Active';
                
                this.AgentActionLinks.push(agentAction);
              }
              
              // Trigger change detection
              this.cdr.detectChanges();
              
              MJNotificationService.Instance.CreateSimpleNotification(
                `${newActions.length} action${newActions.length === 1 ? '' : 's'} added to sub-agent`,
                'success',
                3000
              );
            }
          }
        },
        error: (error) => {
          console.error('Error in add action dialog:', error);
          MJNotificationService.Instance.CreateSimpleNotification(
            'Error opening action selection dialog. Please try again.',
            'error',
            3000
          );
        }
      });
    } catch (error) {
      console.error('Error in addAction:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error adding actions. Please try again.',
        'error',
        3000
      );
    }
  }

  /** @deprecated Use {@link AddAction}. */
  public async addAction() {
    return this.AddAction();
  }

  public RemovePrompt(prompt: MJAIPromptEntityExtended) {
    // Remove from UI
    const promptIndex = this.LinkedPrompts.findIndex(p => UUIDsEqual(p.ID, prompt.ID));
    if (promptIndex >= 0) {
      this.LinkedPrompts.splice(promptIndex, 1);
    }
    
    // Remove from link entities
    const linkIndex = this.AgentPromptLinks.findIndex(ap => UUIDsEqual(ap.PromptID, prompt.ID));
    if (linkIndex >= 0) {
      this.AgentPromptLinks.splice(linkIndex, 1);
    }
    
    // Remove from newly created prompts if it was created in this dialog
    const newPromptIndex = this.NewlyCreatedPrompts.findIndex(p => UUIDsEqual(p.ID, prompt.ID));
    if (newPromptIndex >= 0) {
      this.NewlyCreatedPrompts.splice(newPromptIndex, 1);
    }
    
    this.cdr.detectChanges();
    
    MJNotificationService.Instance.CreateSimpleNotification(
      `Prompt "${prompt.Name}" removed from sub-agent`,
      'info',
      3000
    );
  }

  /** @deprecated Use {@link RemovePrompt}. */
  public removePrompt(prompt: MJAIPromptEntityExtended) {
    return this.RemovePrompt(prompt);
  }

  public RemoveAction(action: MJActionEntity) {
    // Remove from UI
    const actionIndex = this.LinkedActions.findIndex(a => UUIDsEqual(a.ID, action.ID));
    if (actionIndex >= 0) {
      this.LinkedActions.splice(actionIndex, 1);
    }
    
    // Remove from link entities
    const linkIndex = this.AgentActionLinks.findIndex(aa => UUIDsEqual(aa.ActionID, action.ID));
    if (linkIndex >= 0) {
      this.AgentActionLinks.splice(linkIndex, 1);
    }
    
    this.cdr.detectChanges();
    
    MJNotificationService.Instance.CreateSimpleNotification(
      `Action "${action.Name}" removed from sub-agent`,
      'info',
      3000
    );
  }

  /** @deprecated Use {@link RemoveAction}. */
  public removeAction(action: MJActionEntity) {
    return this.RemoveAction(action);
  }

  public async save() {
    if (!this.SubAgentForm.valid || !this.SubAgentEntity) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fill in all required fields',
        'warning',
        3000
      );
      return;
    }

    this.IsSaving$.next(true);

    try {
      // Update entity with final form values
      this.updateSubAgentEntity(this.SubAgentForm.value);

      // Return the created entities (not saved to database)
      const result: CreateSubAgentResult = {
        SubAgent: this.SubAgentEntity,
        AgentPrompts: this.AgentPromptLinks,
        AgentActions: this.AgentActionLinks,
        NewPrompts: this.NewlyCreatedPrompts.length > 0 ? this.NewlyCreatedPrompts : undefined,
        NewPromptTemplates: this.NewlyCreatedPromptTemplates.length > 0 ? this.NewlyCreatedPromptTemplates : undefined,
        NewTemplateContents: this.NewlyCreatedTemplateContents.length > 0 ? this.NewlyCreatedTemplateContents : undefined
      };

      this.Result.next(result);
      this.DialogClose.emit();

    } catch (error) {
      console.error('Error preparing sub-agent for creation:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error preparing sub-agent for creation',
        'error',
        3000
      );
    } finally {
      this.IsSaving$.next(false);
    }
  }

  public cancel() {
    this.Result.next(null);
    this.DialogClose.emit();
  }

  // Helper methods for UI
  public GetAgentIcon(): string {
    return this.SubAgentEntity?.IconClass || 'fa-solid fa-robot';
  }

  /** @deprecated Use {@link GetAgentIcon}. */
  public getAgentIcon(): string {
    return this.GetAgentIcon();
  }

  public GetPromptIcon(): string {
    return 'fa-solid fa-comments';
  }

  /** @deprecated Use {@link GetPromptIcon}. */
  public getPromptIcon(): string {
    return this.GetPromptIcon();
  }

  public GetActionIcon(): string {
    return 'fa-solid fa-bolt';
  }

  /** @deprecated Use {@link GetActionIcon}. */
  public getActionIcon(): string {
    return this.GetActionIcon();
  }

  public get LinkedPromptCount(): number {
    return this.LinkedPrompts.length;
  }

  /** @deprecated Use {@link LinkedPromptCount}. */
  public get linkedPromptCount(): number {
    return this.LinkedPromptCount;
  }

  public get LinkedActionCount(): number {
    return this.LinkedActions.length;
  }

  /** @deprecated Use {@link LinkedActionCount}. */
  public get linkedActionCount(): number {
    return this.LinkedActionCount;
  }
}