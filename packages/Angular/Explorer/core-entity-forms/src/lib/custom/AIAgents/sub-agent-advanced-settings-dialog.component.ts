import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { DialogRef, WindowRef } from '@progress/kendo-angular-dialog';
import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';

export interface SubAgentAdvancedSettingsFormData {
  executionOrder: number;
  executionMode: 'Sequential' | 'Parallel';
  status: 'Active' | 'Disabled' | 'Pending';
  typeID: string | null;
  exposeAsAction: boolean;
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
export class SubAgentAdvancedSettingsDialogComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  subAgent!: MJAIAgentEntityExtended;
  allSubAgents: MJAIAgentEntityExtended[] = []; // For execution order validation
  
  // Reactive state management
  private destroy$ = new Subject<void>();
  public result = new Subject<SubAgentAdvancedSettingsFormData | null>();
  
  // Form and data
  advancedForm!: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  isSaving$ = new BehaviorSubject<boolean>(false);
  
  // Dropdown data
  agentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);
  
  // Available options
  executionModeOptions = [
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

  statusOptions = [
    { text: 'Active', value: 'Active' },
    { text: 'Disabled', value: 'Disabled' },
    { text: 'Pending', value: 'Pending' }
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
      executionOrder: [this.subAgent.ExecutionOrder || 0, [Validators.required, Validators.min(0)]],
      executionMode: [this.subAgent.ExecutionMode || 'Sequential', [Validators.required]],
      status: [this.subAgent.Status || 'Active', [Validators.required]],
      typeID: [this.subAgent.TypeID],
      exposeAsAction: [this.subAgent.ExposeAsAction || false]
    });

    this.setupValidationLogic();
  }

  private setupValidationLogic() {
    // Execution order validation
    const executionOrderControl = this.advancedForm.get('executionOrder');
    executionOrderControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(order => {
      this.validateExecutionOrder(order);
    });

    // ExposeAsAction validation (sub-agents cannot be exposed as actions)
    const exposeAsActionControl = this.advancedForm.get('exposeAsAction');
    exposeAsActionControl?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(expose => {
      if (expose && this.subAgent.ParentID) {
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
      this.executionOrderError = null;
      return;
    }

    // Check for conflicts with other sub-agents under the same parent (excluding current one)
    const conflictingAgent = this.allSubAgents.find(agent => 
      !UUIDsEqual(agent.ID, this.subAgent.ID) && 
      UUIDsEqual(agent.ParentID, this.subAgent.ParentID) &&
      agent.ExecutionOrder === order
    );

    if (conflictingAgent) {
      this.executionOrderError = `Execution order ${order} is already used by "${conflictingAgent.Name}". Please choose a different order.`;
    } else {
      this.executionOrderError = null;
    }

    this.cdr.detectChanges();
  }

  private async loadDropdownData() {
    this.isLoading$.next(true);
    
    try {
      const rv = new RunView();
      
      // Load AI Agent Types
      const agentTypesResult = await rv.RunView<MJAIAgentTypeEntity>({
        EntityName: 'MJ: AI Agent Types',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      });

      if (agentTypesResult.Success) {
        this.agentTypes$.next(agentTypesResult.Results || []);
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

  // === Execution Mode Helpers ===

  getExecutionModeIcon(mode: string): string {
    const option = this.executionModeOptions.find(opt => opt.value === mode);
    return option?.icon || 'fa-robot';
  }

  getExecutionModeDescription(mode: string): string {
    const option = this.executionModeOptions.find(opt => opt.value === mode);
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
      const formData: SubAgentAdvancedSettingsFormData = {
        executionOrder: this.advancedForm.get('executionOrder')?.value,
        executionMode: this.advancedForm.get('executionMode')?.value,
        status: this.advancedForm.get('status')?.value,
        typeID: this.advancedForm.get('typeID')?.value || null,
        exposeAsAction: false // Sub-agents cannot be exposed as actions
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