import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { DialogRef, WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { RunView, Metadata } from '@memberjunction/core';
import { AIAgentPromptEntity, AIConfigurationEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export interface AgentPromptAdvancedSettingsFormData {
  executionOrder: number;
  purpose: string | null;
  configurationID: string | null;
  contextBehavior: 'Complete' | 'Smart' | 'None' | 'RecentMessages' | 'InitialMessages' | 'Custom';
  contextMessageCount: number | null;
  status: 'Active' | 'Inactive' | 'Deprecated' | 'Preview';
}

/**
 * Advanced Settings dialog for AI Agent Prompts.
 * Manages execution order, context behavior, and other advanced prompt configurations.
 */
@Component({
  standalone: false,
  selector: 'mj-agent-prompt-advanced-settings-dialog',
  templateUrl: './agent-prompt-advanced-settings-dialog.component.html',
  styleUrls: ['./agent-prompt-advanced-settings-dialog.component.css']
})
export class AgentPromptAdvancedSettingsDialogComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  agentPrompt!: AIAgentPromptEntity;
  allAgentPrompts: AIAgentPromptEntity[] = []; // For execution order validation
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public result = new Subject<AgentPromptAdvancedSettingsFormData | null>();
  
  // Form and data
  advancedForm!: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  isSaving$ = new BehaviorSubject<boolean>(false);
  
  // Dropdown data
  configurations$ = new BehaviorSubject<AIConfigurationEntity[]>([]);
  
  // Available options
  contextBehaviorOptions = [
    { text: 'Complete Context', value: 'Complete', description: 'Include entire conversation context' },
    { text: 'Smart Context', value: 'Smart', description: 'AI determines relevant context automatically' },
    { text: 'No Context', value: 'None', description: 'No conversation context included' },
    { text: 'Recent Messages', value: 'RecentMessages', description: 'Include only recent messages' },
    { text: 'Initial Messages', value: 'InitialMessages', description: 'Include only conversation start' },
    { text: 'Custom Context', value: 'Custom', description: 'Custom context filtering logic' }
  ];

  statusOptions = [
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' },
    { text: 'Deprecated', value: 'Deprecated' },
    { text: 'Preview', value: 'Preview' }
  ];

  // Execution order validation
  executionOrderError: string | null = null;

  constructor(
    private dialogRef: WindowRef,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initializeForm();
    this.loadDropdownData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm() {
    this.advancedForm = this.fb.group({
      executionOrder: [this.agentPrompt.ExecutionOrder || 0, [Validators.required, Validators.min(0)]],
      purpose: [this.agentPrompt.Purpose],
      configurationID: [this.agentPrompt.ConfigurationID],
      contextBehavior: [this.agentPrompt.ContextBehavior || 'Complete', [Validators.required]],
      contextMessageCount: [this.agentPrompt.ContextMessageCount],
      status: [this.agentPrompt.Status || 'Active', [Validators.required]]
    });

    this.setupValidationLogic();
  }

  private setupValidationLogic() {
    // Context behavior validation
    const contextBehaviorControl = this.advancedForm.get('contextBehavior');
    const contextMessageCountControl = this.advancedForm.get('contextMessageCount');

    contextBehaviorControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(behavior => {
      if (behavior === 'RecentMessages' || behavior === 'InitialMessages') {
        contextMessageCountControl?.setValidators([Validators.required, Validators.min(1)]);
      } else {
        contextMessageCountControl?.clearValidators();
        if (behavior !== 'Custom') {
          contextMessageCountControl?.setValue(null);
        }
      }
      contextMessageCountControl?.updateValueAndValidity();
    });

    // Execution order validation
    const executionOrderControl = this.advancedForm.get('executionOrder');
    executionOrderControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(order => {
      this.validateExecutionOrder(order);
    });
  }

  private validateExecutionOrder(order: number) {
    if (order == null) {
      this.executionOrderError = null;
      return;
    }

    // Check for conflicts with other prompts (excluding current one)
    const conflictingPrompt = this.allAgentPrompts.find(p => 
      p.ID !== this.agentPrompt.ID && 
      p.ExecutionOrder === order
    );

    if (conflictingPrompt) {
      this.executionOrderError = `Execution order ${order} is already used by another prompt. Please choose a different order.`;
    } else {
      this.executionOrderError = null;
    }

    this.cdr.detectChanges();
  }

  private async loadDropdownData() {
    this.isLoading$.next(true);
    
    try {
      const rv = new RunView();
      
      // Load AI Configurations
      const configurationsResult = await rv.RunView<AIConfigurationEntity>({
        EntityName: 'MJ: AI Configurations',
        ExtraFilter: "Status = 'Active'",
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (configurationsResult.Success) {
        this.configurations$.next(configurationsResult.Results || []);
      }

    } catch (error) {
      console.error('Error loading dropdown data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading form data. Please try again.',
        'error',
        3000
      );
    } finally {
      this.isLoading$.next(false);
    }
  }

  // === Validation Helpers ===

  isFieldInvalid(fieldName: string): boolean {
    const field = this.advancedForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.advancedForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['min']) return `${fieldName} must be greater than or equal to ${field.errors['min'].min}`;
    }
    return '';
  }

  hasExecutionOrderError(): boolean {
    return !!this.executionOrderError;
  }

  // === Context Behavior Helpers ===

  requiresMessageCount(): boolean {
    const behavior = this.advancedForm.get('contextBehavior')?.value;
    return behavior === 'RecentMessages' || behavior === 'InitialMessages';
  }

  getContextBehaviorDescription(value: string): string {
    const option = this.contextBehaviorOptions.find(opt => opt.value === value);
    return option?.description || '';
  }

  // === Dialog Actions ===

  cancel() {
    this.result.next(null);
    this.dialogRef.close();
  }

  async save() {
    if (this.advancedForm.invalid || this.hasExecutionOrderError()) {
      this.advancedForm.markAllAsTouched();
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fix validation errors before saving',
        'error',
        3000
      );
      return;
    }

    this.isSaving$.next(true);
    
    try {
      const formData: AgentPromptAdvancedSettingsFormData = {
        executionOrder: this.advancedForm.get('executionOrder')?.value,
        purpose: this.advancedForm.get('purpose')?.value || null,
        configurationID: this.advancedForm.get('configurationID')?.value || null,
        contextBehavior: this.advancedForm.get('contextBehavior')?.value,
        contextMessageCount: this.advancedForm.get('contextMessageCount')?.value || null,
        status: this.advancedForm.get('status')?.value
      };

      this.result.next(formData);
      this.dialogRef.close();
      
    } catch (error) {
      console.error('Error saving advanced settings:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error saving settings. Please try again.',
        'error',
        3000
      );
    } finally {
      this.isSaving$.next(false);
    }
  }
}