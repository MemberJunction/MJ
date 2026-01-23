import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { AIAgentTypeEntity, AIAgentPromptEntity, AIAgentActionEntity, ActionEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentManagementService } from './ai-agent-management.service';
import { AIPromptEntityExtended, AIAgentEntityExtended } from "@memberjunction/ai-core-plus";
export interface CreateSubAgentConfig {
  /** Title for the dialog */
  title?: string;
  /** Initial name for the sub-agent */
  initialName?: string;
  /** Pre-selected agent type ID */
  initialTypeID?: string;
  /** Parent agent ID for relationship */
  parentAgentId: string;
  /** Parent agent name for display */
  parentAgentName?: string;
}

export interface CreateSubAgentResult {
  /** Created sub-agent entity (not saved to database) */
  subAgent: AIAgentEntityExtended;
  /** Agent prompt link entities (not saved to database) */
  agentPrompts?: AIAgentPromptEntity[];
  /** Agent action link entities (not saved to database) */
  agentActions?: AIAgentActionEntity[];
  /** Any new prompts created within the dialog */
  newPrompts?: AIPromptEntityExtended[];
  /** Any new prompt templates created within the dialog */
  newPromptTemplates?: any[];
  /** Any new template contents created within the dialog */
  newTemplateContents?: any[];
}

/**
 * Dialog for creating new AI Sub-Agents with essential fields, actions, and prompts management.
 * Creates entities but does not save them - returns entities for parent to add to PendingRecords.
 * This ensures atomicity with the parent form's save operation.
 */
@Component({
  selector: 'mj-create-sub-agent-dialog',
  templateUrl: './create-sub-agent-dialog.component.html',
  styleUrls: ['./create-sub-agent-dialog.component.css']
})
export class CreateSubAgentDialogComponent implements OnInit, OnDestroy {
  
  // Configuration
  config: CreateSubAgentConfig = {} as CreateSubAgentConfig;
  
  // State management
  private destroy$ = new Subject<void>();
  public result = new Subject<CreateSubAgentResult | null>();
  
  // Form and validation
  subAgentForm: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  isSaving$ = new BehaviorSubject<boolean>(false);
  
  // Data
  availableAgentTypes$ = new BehaviorSubject<AIAgentTypeEntity[]>([]);
  availablePrompts$ = new BehaviorSubject<AIPromptEntityExtended[]>([]);
  availableActions$ = new BehaviorSubject<ActionEntity[]>([]);
  
  // Entities (not saved to database)
  subAgentEntity: AIAgentEntityExtended | null = null;
  linkedPrompts: AIPromptEntityExtended[] = [];
  linkedActions: ActionEntity[] = [];
  
  // Link entities for database relationships
  agentPromptLinks: AIAgentPromptEntity[] = [];
  agentActionLinks: AIAgentActionEntity[] = [];
  
  // Storage for new entities created within dialog
  newlyCreatedPrompts: AIPromptEntityExtended[] = [];
  newlyCreatedPromptTemplates: any[] = [];
  newlyCreatedTemplateContents: any[] = [];

  constructor(
    private dialogRef: WindowRef,
    private cdr: ChangeDetectorRef,
    private agentManagementService: AIAgentManagementService,
    private viewContainerRef: ViewContainerRef
  ) {
    this.subAgentForm = this.createForm();
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
      name: new FormControl(this.config.initialName || '', [Validators.required]),
      description: new FormControl(''),
      typeID: new FormControl(this.config.initialTypeID || '', [Validators.required]),
      status: new FormControl('Pending'),
      executionMode: new FormControl('Sequential'),
      purpose: new FormControl(''),
      userMessage: new FormControl(''),
      // systemMessage: new FormControl(''), // SystemMessage does not exist on AIAgentEntity
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
    this.subAgentForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(formValue => {
        this.updateSubAgentEntity(formValue);
      });
  }

  private async loadInitialData() {
    this.isLoading$.next(true);
    
    try {
      const rv = new RunView();
      
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
          EntityName: 'AI Prompts',
          ExtraFilter: `Status = 'Active'`,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        // Available actions (index 2)
        {
          EntityName: 'Actions',
          ExtraFilter: `Status = 'Active'`,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        }
      ]);

      // Process agent types (index 0)
      if (results[0].Success && results[0].Results) {
        this.availableAgentTypes$.next(results[0].Results as AIAgentTypeEntity[]);
        
        // Set default type if not specified
        if (!this.config.initialTypeID && results[0].Results.length > 0) {
          this.subAgentForm.patchValue({ typeID: results[0].Results[0].ID });
        }
      }

      // Process available prompts (index 1)
      if (results[1].Success && results[1].Results) {
        this.availablePrompts$.next(results[1].Results as AIPromptEntityExtended[]);
      }

      // Process available actions (index 2)
      const actionsResult = results[2];

      if (actionsResult.Success && actionsResult.Results) {
        this.availableActions$.next(actionsResult.Results);
      }

      // Create the sub-agent entity
      const md = new Metadata();
      this.subAgentEntity = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents');
      this.subAgentEntity.NewRecord();
      
      // Set default values
      this.subAgentEntity.Status = 'Pending';
      this.subAgentEntity.ExecutionMode = 'Sequential';
      this.subAgentEntity.ExposeAsAction = false; // Database constraint for sub-agents
      this.subAgentEntity.ParentID = this.config.parentAgentId;
      this.subAgentEntity.ModelSelectionMode = 'Agent Type';
      this.subAgentEntity.Set('Temperature', 0.1);
      this.subAgentEntity.Set('TopP', 0.1);
      this.subAgentEntity.Set('TopK', 40);
      this.subAgentEntity.Set('MaxTokensPerRun', 4000);
      this.subAgentEntity.Set('EnableCaching', false);
      this.subAgentEntity.Set('CacheTTLSeconds', 3600);

      // Update form with initial values
      this.updateSubAgentEntity(this.subAgentForm.value);

    } catch (error) {
      console.error('Error loading sub-agent creation data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading data for sub-agent creation',
        'error',
        3000
      );
    } finally {
      this.isLoading$.next(false);
    }
  }

  private updateSubAgentEntity(formValue: any) {
    if (!this.subAgentEntity) return;

    // Update entity with form values
    this.subAgentEntity.Name = formValue.name;
    this.subAgentEntity.Description = formValue.description || '';
    this.subAgentEntity.TypeID = formValue.typeID;
    this.subAgentEntity.Status = formValue.status;
    this.subAgentEntity.ExecutionMode = formValue.executionMode;
    this.subAgentEntity.Set('Purpose', formValue.purpose || '');
    this.subAgentEntity.Set('UserMessage', formValue.userMessage || '');
    // Note: SystemMessage does not exist on AIAgentEntityExtended, removing this line
    this.subAgentEntity.ModelSelectionMode = formValue.modelSelectionMode;
    this.subAgentEntity.Set('Temperature', formValue.temperature);
    this.subAgentEntity.Set('TopP', formValue.topP);
    this.subAgentEntity.Set('TopK', formValue.topK);
    this.subAgentEntity.Set('MaxTokensPerRun', formValue.maxTokens);
    this.subAgentEntity.Set('EnableCaching', formValue.enableCaching);
    this.subAgentEntity.Set('CacheTTLSeconds', formValue.cacheTTL);
  }

  public async addPrompt() {
    // Get currently linked prompt IDs
    const linkedPromptIds = this.linkedPrompts.map(p => p.ID);
    
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
          if (result && result.selectedPrompts.length > 0) {
            // Filter out already linked prompts
            const newPrompts = result.selectedPrompts.filter(prompt => 
              !linkedPromptIds.includes(prompt.ID)
            );
            
            if (newPrompts.length > 0) {
              // Add to UI
              this.linkedPrompts.push(...newPrompts);
              
              // Create agent prompt link entities
              const md = new Metadata();
              for (const prompt of newPrompts) {
                const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts');
                agentPrompt.NewRecord();
                agentPrompt.AgentID = this.subAgentEntity!.ID;
                agentPrompt.PromptID = prompt.ID;
                agentPrompt.Status = 'Active';
                agentPrompt.ExecutionOrder = this.agentPromptLinks.length + 1;
                
                this.agentPromptLinks.push(agentPrompt);
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
            await this.createNewPrompt();
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

  public async createNewPrompt() {
    try {
      this.agentManagementService.openCreatePromptDialog({
        title: `Create New Prompt for ${this.subAgentEntity?.Name || 'Sub-Agent'}`,
        initialName: '',
        viewContainerRef: this.viewContainerRef
      }).subscribe({
        next: async (result) => {
          if (result && result.prompt) {
            try {
              // Store the newly created entities
              this.newlyCreatedPrompts.push(result.prompt);
              
              if (result.template) {
                this.newlyCreatedPromptTemplates.push(result.template);
              }
              
              if (result.templateContents && result.templateContents.length > 0) {
                this.newlyCreatedTemplateContents.push(...result.templateContents);
              }

              // Add to UI
              this.linkedPrompts.push(result.prompt);
              
              // Create agent prompt link entity
              const md = new Metadata();
              const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts');
              agentPrompt.NewRecord();
              agentPrompt.AgentID = this.subAgentEntity!.ID;
              agentPrompt.PromptID = result.prompt.ID;
              agentPrompt.Status = 'Active';
              agentPrompt.ExecutionOrder = this.agentPromptLinks.length + 1;
              
              this.agentPromptLinks.push(agentPrompt);

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

  public async addAction() {
    // Get currently linked action IDs
    const linkedActionIds = this.linkedActions.map(a => a.ID);
    
    try {
      this.agentManagementService.openAddActionDialog({
        agentId: this.subAgentEntity?.ID || '',
        agentName: this.subAgentEntity?.Name || 'Sub-Agent',
        existingActionIds: linkedActionIds,
        viewContainerRef: this.viewContainerRef
      }).subscribe({
        next: async (selectedActions) => {
          if (selectedActions && selectedActions.length > 0) {
            // Filter out already linked actions
            const newActions = selectedActions.filter(action => 
              !linkedActionIds.includes(action.ID)
            );
            
            if (newActions.length > 0) {
              // Add to UI
              this.linkedActions.push(...newActions);
              
              // Create agent action link entities
              const md = new Metadata();
              for (const action of newActions) {
                const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions');
                agentAction.NewRecord();
                agentAction.AgentID = this.subAgentEntity!.ID;
                agentAction.ActionID = action.ID;
                agentAction.Status = 'Active';
                
                this.agentActionLinks.push(agentAction);
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

  public removePrompt(prompt: AIPromptEntityExtended) {
    // Remove from UI
    const promptIndex = this.linkedPrompts.findIndex(p => p.ID === prompt.ID);
    if (promptIndex >= 0) {
      this.linkedPrompts.splice(promptIndex, 1);
    }
    
    // Remove from link entities
    const linkIndex = this.agentPromptLinks.findIndex(ap => ap.PromptID === prompt.ID);
    if (linkIndex >= 0) {
      this.agentPromptLinks.splice(linkIndex, 1);
    }
    
    // Remove from newly created prompts if it was created in this dialog
    const newPromptIndex = this.newlyCreatedPrompts.findIndex(p => p.ID === prompt.ID);
    if (newPromptIndex >= 0) {
      this.newlyCreatedPrompts.splice(newPromptIndex, 1);
    }
    
    this.cdr.detectChanges();
    
    MJNotificationService.Instance.CreateSimpleNotification(
      `Prompt "${prompt.Name}" removed from sub-agent`,
      'info',
      3000
    );
  }

  public removeAction(action: ActionEntity) {
    // Remove from UI
    const actionIndex = this.linkedActions.findIndex(a => a.ID === action.ID);
    if (actionIndex >= 0) {
      this.linkedActions.splice(actionIndex, 1);
    }
    
    // Remove from link entities
    const linkIndex = this.agentActionLinks.findIndex(aa => aa.ActionID === action.ID);
    if (linkIndex >= 0) {
      this.agentActionLinks.splice(linkIndex, 1);
    }
    
    this.cdr.detectChanges();
    
    MJNotificationService.Instance.CreateSimpleNotification(
      `Action "${action.Name}" removed from sub-agent`,
      'info',
      3000
    );
  }

  public async save() {
    if (!this.subAgentForm.valid || !this.subAgentEntity) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fill in all required fields',
        'warning',
        3000
      );
      return;
    }

    this.isSaving$.next(true);

    try {
      // Update entity with final form values
      this.updateSubAgentEntity(this.subAgentForm.value);

      // Return the created entities (not saved to database)
      const result: CreateSubAgentResult = {
        subAgent: this.subAgentEntity,
        agentPrompts: this.agentPromptLinks,
        agentActions: this.agentActionLinks,
        newPrompts: this.newlyCreatedPrompts.length > 0 ? this.newlyCreatedPrompts : undefined,
        newPromptTemplates: this.newlyCreatedPromptTemplates.length > 0 ? this.newlyCreatedPromptTemplates : undefined,
        newTemplateContents: this.newlyCreatedTemplateContents.length > 0 ? this.newlyCreatedTemplateContents : undefined
      };

      this.result.next(result);
      this.dialogRef.close();

    } catch (error) {
      console.error('Error preparing sub-agent for creation:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error preparing sub-agent for creation',
        'error',
        3000
      );
    } finally {
      this.isSaving$.next(false);
    }
  }

  public cancel() {
    this.result.next(null);
    this.dialogRef.close();
  }

  // Helper methods for UI
  public getAgentIcon(): string {
    return this.subAgentEntity?.IconClass || 'fa-solid fa-robot';
  }

  public getPromptIcon(): string {
    return 'fa-solid fa-comments';
  }

  public getActionIcon(): string {
    return 'fa-solid fa-bolt';
  }

  public get linkedPromptCount(): number {
    return this.linkedPrompts.length;
  }

  public get linkedActionCount(): number {
    return this.linkedActions.length;
  }
}