import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { RunView, Metadata } from '@memberjunction/core';
import { MJAIAgentPromptEntity, MJAIConfigurationEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface AgentPromptAdvancedSettingsFormData {
  ExecutionOrder: number;
  Purpose: string | null;
  ConfigurationID: string | null;
  ContextBehavior: 'Complete' | 'Smart' | 'None' | 'RecentMessages' | 'InitialMessages' | 'Custom';
  ContextMessageCount: number | null;
  Status: 'Active' | 'Inactive' | 'Deprecated' | 'Preview';
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
export class AgentPromptAdvancedSettingsDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  AgentPrompt!: MJAIAgentPromptEntity;

  /** @deprecated Use {@link AgentPrompt}. */
  get agentPrompt(): MJAIAgentPromptEntity {
    return this.AgentPrompt;
  }
  /** @deprecated Use {@link AgentPrompt}. */
  set agentPrompt(value: MJAIAgentPromptEntity) {
    this.AgentPrompt = value;
  }
  AllAgentPrompts: MJAIAgentPromptEntity[] = [];

  /** @deprecated Use {@link AllAgentPrompts}. */
  get allAgentPrompts(): MJAIAgentPromptEntity[] {
    return this.AllAgentPrompts;
  }
  /** @deprecated Use {@link AllAgentPrompts}. */
  set allAgentPrompts(value: MJAIAgentPromptEntity[]) {
    this.AllAgentPrompts = value;
  } // For execution order validation
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public Result = new Subject<AgentPromptAdvancedSettingsFormData | null>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Form and data
  AdvancedForm!: FormGroup;

  /** @deprecated Use {@link AdvancedForm}. */
  get advancedForm(): FormGroup {
    return this.AdvancedForm;
  }
  /** @deprecated Use {@link AdvancedForm}. */
  set advancedForm(value: FormGroup) {
    this.AdvancedForm = value;
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
  
  // Dropdown data
  Configurations$ = new BehaviorSubject<MJAIConfigurationEntity[]>([]);

  /** @deprecated Use {@link Configurations$}. */
  get configurations$() {
    return this.Configurations$;
  }
  /** @deprecated Use {@link Configurations$}. */
  set configurations$(value) {
    this.Configurations$ = value;
  }
  
  // Available options
  ContextBehaviorOptions = [
    { text: 'Complete Context', value: 'Complete', description: 'Include entire conversation context' },
    { text: 'Smart Context', value: 'Smart', description: 'AI determines relevant context automatically' },
    { text: 'No Context', value: 'None', description: 'No conversation context included' },
    { text: 'Recent Messages', value: 'RecentMessages', description: 'Include only recent messages' },
    { text: 'Initial Messages', value: 'InitialMessages', description: 'Include only conversation start' },
    { text: 'Custom Context', value: 'Custom', description: 'Custom context filtering logic' }
  ];

  /** @deprecated Use {@link ContextBehaviorOptions}. */
  get contextBehaviorOptions() {
    return this.ContextBehaviorOptions;
  }
  /** @deprecated Use {@link ContextBehaviorOptions}. */
  set contextBehaviorOptions(value) {
    this.ContextBehaviorOptions = value;
  }

  StatusOptions = [
    { text: 'Active', value: 'Active' },
    { text: 'Inactive', value: 'Inactive' },
    { text: 'Deprecated', value: 'Deprecated' },
    { text: 'Preview', value: 'Preview' }
  ];

  /** @deprecated Use {@link StatusOptions}. */
  get statusOptions() {
    return this.StatusOptions;
  }
  /** @deprecated Use {@link StatusOptions}. */
  set statusOptions(value) {
    this.StatusOptions = value;
  }

  // Execution order validation
  ExecutionOrderError: string | null = null;

  /** @deprecated Use {@link ExecutionOrderError}. */
  get executionOrderError(): string | null {
    return this.ExecutionOrderError;
  }
  /** @deprecated Use {@link ExecutionOrderError}. */
  set executionOrderError(value: string | null) {
    this.ExecutionOrderError = value;
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    super();}

  ngOnInit() {
    this.initializeForm();
    this.loadDropdownData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm() {
    this.AdvancedForm = this.fb.group({
      executionOrder: [this.AgentPrompt.ExecutionOrder || 0, [Validators.required, Validators.min(0)]],
      purpose: [this.AgentPrompt.Purpose],
      configurationID: [this.AgentPrompt.ConfigurationID],
      contextBehavior: [this.AgentPrompt.ContextBehavior || 'Complete', [Validators.required]],
      contextMessageCount: [this.AgentPrompt.ContextMessageCount],
      status: [this.AgentPrompt.Status || 'Active', [Validators.required]]
    });

    this.setupValidationLogic();
  }

  private setupValidationLogic() {
    // Context behavior validation
    const contextBehaviorControl = this.AdvancedForm.get('contextBehavior');
    const contextMessageCountControl = this.AdvancedForm.get('contextMessageCount');

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
    const executionOrderControl = this.AdvancedForm.get('executionOrder');
    executionOrderControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(order => {
      this.validateExecutionOrder(order);
    });
  }

  private validateExecutionOrder(order: number) {
    if (order == null) {
      this.ExecutionOrderError = null;
      return;
    }

    // Check for conflicts with other prompts (excluding current one)
    const conflictingPrompt = this.AllAgentPrompts.find(p => 
      !UUIDsEqual(p.ID, this.AgentPrompt.ID) && 
      p.ExecutionOrder === order
    );

    if (conflictingPrompt) {
      this.ExecutionOrderError = `Execution order ${order} is already used by another prompt. Please choose a different order.`;
    } else {
      this.ExecutionOrderError = null;
    }

    this.cdr.detectChanges();
  }

  private async loadDropdownData() {
    this.IsLoading$.next(true);
    
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Load AI Configurations
      const configurationsResult = await rv.RunView<MJAIConfigurationEntity>({
        EntityName: 'MJ: AI Configurations',
        ExtraFilter: "Status = 'Active'",
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (configurationsResult.Success) {
        this.Configurations$.next(configurationsResult.Results || []);
      }

    } catch (error) {
      console.error('Error loading dropdown data:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error loading form data. Please try again.',
        'error',
        3000
      );
    } finally {
      this.IsLoading$.next(false);
    }
  }

  // === Validation Helpers ===

  IsFieldInvalid(fieldName: string): boolean {
    const field = this.AdvancedForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /** @deprecated Use {@link IsFieldInvalid}. */
  isFieldInvalid(fieldName: string): boolean {
    return this.IsFieldInvalid(fieldName);
  }

  GetFieldError(fieldName: string): string {
    const field = this.AdvancedForm.get(fieldName);
    if (field?.errors) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['min']) return `${fieldName} must be greater than or equal to ${field.errors['min'].min}`;
    }
    return '';
  }

  /** @deprecated Use {@link GetFieldError}. */
  getFieldError(fieldName: string): string {
    return this.GetFieldError(fieldName);
  }

  HasExecutionOrderError(): boolean {
    return !!this.ExecutionOrderError;
  }

  /** @deprecated Use {@link HasExecutionOrderError}. */
  hasExecutionOrderError(): boolean {
    return this.HasExecutionOrderError();
  }

  // === Context Behavior Helpers ===

  RequiresMessageCount(): boolean {
    const behavior = this.AdvancedForm.get('contextBehavior')?.value;
    return behavior === 'RecentMessages' || behavior === 'InitialMessages';
  }

  /** @deprecated Use {@link RequiresMessageCount}. */
  requiresMessageCount(): boolean {
    return this.RequiresMessageCount();
  }

  GetContextBehaviorDescription(value: string): string {
    const option = this.ContextBehaviorOptions.find(opt => opt.value === value);
    return option?.description || '';
  }

  /** @deprecated Use {@link GetContextBehaviorDescription}. */
  getContextBehaviorDescription(value: string): string {
    return this.GetContextBehaviorDescription(value);
  }

  // === Dialog Actions ===

  cancel() {
    this.Result.next(null);
    this.DialogClose.emit();
  }

  async save() {
    if (this.AdvancedForm.invalid || this.HasExecutionOrderError()) {
      this.AdvancedForm.markAllAsTouched();
      MJNotificationService.Instance.CreateSimpleNotification(
        'Please fix validation errors before saving',
        'error',
        3000
      );
      return;
    }

    this.IsSaving$.next(true);
    
    try {
      const formData: AgentPromptAdvancedSettingsFormData = {
        ExecutionOrder: this.AdvancedForm.get('executionOrder')?.value,
        Purpose: this.AdvancedForm.get('purpose')?.value || null,
        ConfigurationID: this.AdvancedForm.get('configurationID')?.value || null,
        ContextBehavior: this.AdvancedForm.get('contextBehavior')?.value,
        ContextMessageCount: this.AdvancedForm.get('contextMessageCount')?.value || null,
        Status: this.AdvancedForm.get('status')?.value
      };

      this.Result.next(formData);
      this.DialogClose.emit();
      
    } catch (error) {
      console.error('Error saving advanced settings:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error saving settings. Please try again.',
        'error',
        3000
      );
    } finally {
      this.IsSaving$.next(false);
    }
  }
}