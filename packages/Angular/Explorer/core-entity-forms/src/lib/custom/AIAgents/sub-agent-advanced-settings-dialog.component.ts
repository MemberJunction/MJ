import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface SubAgentAdvancedSettingsFormData {
  ExecutionOrder: number;
  ExecutionMode: 'Sequential' | 'Parallel';
  Status: 'Active' | 'Disabled' | 'Pending';
  TypeID: string | null;
  ExposeAsAction: boolean;
}

/**
 * Advanced Settings dialog for Sub-Agents.
 * Manages execution order, execution mode, and other advanced sub-agent configurations.
 */
@Component({
  standalone: false,
  selector: 'mj-sub-agent-advanced-settings-dialog',
  templateUrl: './sub-agent-advanced-settings-dialog.component.html',
  styleUrls: ['./sub-agent-advanced-settings-dialog.component.css']
})
export class SubAgentAdvancedSettingsDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  SubAgent!: MJAIAgentEntityExtended;

  /** @deprecated Use {@link SubAgent}. */
  get subAgent(): MJAIAgentEntityExtended {
    return this.SubAgent;
  }
  /** @deprecated Use {@link SubAgent}. */
  set subAgent(value: MJAIAgentEntityExtended) {
    this.SubAgent = value;
  }
  AllSubAgents: MJAIAgentEntityExtended[] = [];

  /** @deprecated Use {@link AllSubAgents}. */
  get allSubAgents(): MJAIAgentEntityExtended[] {
    return this.AllSubAgents;
  }
  /** @deprecated Use {@link AllSubAgents}. */
  set allSubAgents(value: MJAIAgentEntityExtended[]) {
    this.AllSubAgents = value;
  } // For execution order validation
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public Result = new Subject<SubAgentAdvancedSettingsFormData | null>();

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
  AgentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);

  /** @deprecated Use {@link AgentTypes$}. */
  get agentTypes$() {
    return this.AgentTypes$;
  }
  /** @deprecated Use {@link AgentTypes$}. */
  set agentTypes$(value) {
    this.AgentTypes$ = value;
  }
  
  // Available options
  ExecutionModeOptions = [
    { 
      text: 'Sequential', 
      value: 'Sequential', 
      description: 'Child agents execute one after another in order',
      icon: 'fa-list-ol'
    },
    { 
      text: 'Parallel', 
      value: 'Parallel', 
      description: 'Child agents execute simultaneously for faster processing',
      icon: 'fa-layer-group'
    }
  ];

  /** @deprecated Use {@link ExecutionModeOptions}. */
  get executionModeOptions() {
    return this.ExecutionModeOptions;
  }
  /** @deprecated Use {@link ExecutionModeOptions}. */
  set executionModeOptions(value) {
    this.ExecutionModeOptions = value;
  }

  StatusOptions = [
    { text: 'Active', value: 'Active' },
    { text: 'Disabled', value: 'Disabled' },
    { text: 'Pending', value: 'Pending' }
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
      executionOrder: [this.SubAgent.ExecutionOrder || 0, [Validators.required, Validators.min(0)]],
      executionMode: [this.SubAgent.ExecutionMode || 'Sequential', [Validators.required]],
      status: [this.SubAgent.Status || 'Active', [Validators.required]],
      typeID: [this.SubAgent.TypeID],
      exposeAsAction: [this.SubAgent.ExposeAsAction || false]
    });

    this.setupValidationLogic();
  }

  private setupValidationLogic() {
    // Execution order validation
    const executionOrderControl = this.AdvancedForm.get('executionOrder');
    executionOrderControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(order => {
      this.validateExecutionOrder(order);
    });

    // ExposeAsAction validation (sub-agents cannot be exposed as actions)
    const exposeAsActionControl = this.AdvancedForm.get('exposeAsAction');
    exposeAsActionControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(expose => {
      if (expose && this.SubAgent.ParentID) {
        // Sub-agents cannot be exposed as actions
        exposeAsActionControl.setValue(false);
        MJNotificationService.Instance.CreateSimpleNotification(
          'Sub-agents cannot be exposed as actions. Only root agents can be exposed.',
          'warning',
          4000
        );
      }
    });
  }

  private validateExecutionOrder(order: number) {
    if (order == null) {
      this.ExecutionOrderError = null;
      return;
    }

    // Check for conflicts with other sub-agents under the same parent (excluding current one)
    const conflictingAgent = this.AllSubAgents.find(agent => 
      !UUIDsEqual(agent.ID, this.SubAgent.ID) && 
      UUIDsEqual(agent.ParentID, this.SubAgent.ParentID) &&
      agent.ExecutionOrder === order
    );

    if (conflictingAgent) {
      this.ExecutionOrderError = `Execution order ${order} is already used by "${conflictingAgent.Name}". Please choose a different order.`;
    } else {
      this.ExecutionOrderError = null;
    }

    this.cdr.detectChanges();
  }

  private async loadDropdownData() {
    this.IsLoading$.next(true);
    
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Load AI Agent Types
      const agentTypesResult = await rv.RunView<MJAIAgentTypeEntity>({
        EntityName: 'MJ: AI Agent Types',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (agentTypesResult.Success) {
        this.AgentTypes$.next(agentTypesResult.Results || []);
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

  // === Execution Mode Helpers ===

  GetExecutionModeIcon(mode: string): string {
    const option = this.ExecutionModeOptions.find(opt => opt.value === mode);
    return option?.icon || 'fa-robot';
  }

  /** @deprecated Use {@link GetExecutionModeIcon}. */
  getExecutionModeIcon(mode: string): string {
    return this.GetExecutionModeIcon(mode);
  }

  GetExecutionModeDescription(mode: string): string {
    const option = this.ExecutionModeOptions.find(opt => opt.value === mode);
    return option?.description || '';
  }

  /** @deprecated Use {@link GetExecutionModeDescription}. */
  getExecutionModeDescription(mode: string): string {
    return this.GetExecutionModeDescription(mode);
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
      const formData: SubAgentAdvancedSettingsFormData = {
        ExecutionOrder: this.AdvancedForm.get('executionOrder')?.value,
        ExecutionMode: this.AdvancedForm.get('executionMode')?.value,
        Status: this.AdvancedForm.get('status')?.value,
        TypeID: this.AdvancedForm.get('typeID')?.value || null,
        ExposeAsAction: false // Sub-agents cannot be exposed as actions
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