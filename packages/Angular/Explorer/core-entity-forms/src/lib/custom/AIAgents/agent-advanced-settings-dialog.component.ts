// import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewContainerRef } from '@angular/core';
// import { FormGroup, FormBuilder, Validators } from '@angular/forms';
// import { DialogRef } from '@progress/kendo-angular-dialog';
// import { Subject, BehaviorSubject, takeUntil } from 'rxjs';
// import { RunView, Metadata } from '@memberjunction/core';
// import { AIAgentEntityExtended, AIAgentTypeEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
// import { MJNotificationService } from '@memberjunction/ng-notifications';
// import { Router } from '@angular/router';
// import { AIAgentManagementService } from './ai-agent-management.service';

// export interface AdvancedSettingsFormData {
//   // Identity & Behavior
//   logoURL: string | null;
//   iconClass: string | null;
//   driverClass: string | null;
  
//   // System Configuration  
//   exposeAsAction: boolean;
//   typeID: string | null;
//   status: string | null;
  
//   // Context Compression
//   enableContextCompression: boolean;
//   contextCompressionMessageThreshold: number | null;
//   contextCompressionPromptID: string | null;
//   contextCompressionMessageRetentionCount: number | null;
  
//   // Payload Control
//   payloadDownstreamPaths: string;
//   payloadUpstreamPaths: string;
//   payloadSelfReadPaths: string | null;
//   payloadSelfWritePaths: string | null;
// }

// /**
//  * Advanced Settings dialog for AI Agents.
//  * Provides access to all advanced configuration options not available in the main UI.
//  */
// @Component({
//   standalone: false,
//   selector: 'mj-agent-advanced-settings-dialog',
//   templateUrl: './agent-advanced-settings-dialog.component.html',
//   styleUrls: ['./agent-advanced-settings-dialog.component.css']
// })
// export class AgentAdvancedSettingsDialogComponent implements OnInit, OnDestroy {
  
//   // Input properties set by service
//   agent!: AIAgentEntityExtended;
  
//   // Reactive state management
//   private destroy$ = new Subject<void>();
//   public result = new Subject<AdvancedSettingsFormData | null>();
  
//   // Form and data
//   advancedForm!: FormGroup;
//   isLoading$ = new BehaviorSubject<boolean>(false);
//   isSaving$ = new BehaviorSubject<boolean>(false);
  
//   // Dropdown data
//   agentTypes$ = new BehaviorSubject<AIAgentTypeEntity[]>([]);
  
//   // Selected compression prompt
//   selectedCompressionPrompt: AIPromptEntityExtended | null = null;
  
//   // Available options
//   statusOptions = [
//     { text: 'Active', value: 'Active' },
//     { text: 'Disabled', value: 'Disabled' },
//     { text: 'Pending', value: 'Pending' }
//   ];

//   constructor(
//     private dialogRef: DialogRef,
//     private fb: FormBuilder,
//     private cdr: ChangeDetectorRef,
//     private router: Router,
//     private agentManagementService: AIAgentManagementService,
//     private viewContainerRef: ViewContainerRef
//   ) {}

//   ngOnInit() {
//     this.initializeForm();
//     this.loadDropdownData();
//     this.loadSelectedCompressionPrompt();
//   }

//   ngOnDestroy() {
//     this.destroy$.next();
//     this.destroy$.complete();
//   }

//   private initializeForm() {
//     this.advancedForm = this.fb.group({
//       // Identity & Behavior
//       logoURL: [this.agent.LogoURL],
//       iconClass: [this.agent.IconClass],
//       driverClass: [this.agent.DriverClass],
      
//       // System Configuration
//       exposeAsAction: [this.agent.ExposeAsAction],
//       typeID: [this.agent.TypeID],
//       status: [this.agent.Status],
      
//       // Context Compression
//       enableContextCompression: [this.agent.EnableContextCompression],
//       contextCompressionMessageThreshold: [this.agent.ContextCompressionMessageThreshold, [Validators.min(1)]],
//       contextCompressionPromptID: [this.agent.ContextCompressionPromptID],
//       contextCompressionMessageRetentionCount: [this.agent.ContextCompressionMessageRetentionCount, [Validators.min(1)]],
      
//       // Payload Control
//       payloadDownstreamPaths: [this.agent.PayloadDownstreamPaths, [Validators.required]],
//       payloadUpstreamPaths: [this.agent.PayloadUpstreamPaths, [Validators.required]],
//       payloadSelfReadPaths: [this.agent.PayloadSelfReadPaths],
//       payloadSelfWritePaths: [this.agent.PayloadSelfWritePaths]
//     });

//     // Set up validation dependencies
//     this.setupValidationLogic();
//   }

//   private setupValidationLogic() {
//     // Context compression validation
//     const enableCompressionControl = this.advancedForm.get('enableContextCompression');
//     const thresholdControl = this.advancedForm.get('contextCompressionMessageThreshold');
//     const promptControl = this.advancedForm.get('contextCompressionPromptID');
//     const retentionControl = this.advancedForm.get('contextCompressionMessageRetentionCount');

//     enableCompressionControl?.valueChanges.pipe(
//       takeUntil(this.destroy$)
//     ).subscribe(enabled => {
//       if (enabled) {
//         thresholdControl?.setValidators([Validators.required, Validators.min(1)]);
//         promptControl?.setValidators([Validators.required]);
//         retentionControl?.setValidators([Validators.required, Validators.min(1)]);
//       } else {
//         // Clear validators and reset values to null when disabled
//         thresholdControl?.clearValidators();
//         promptControl?.clearValidators();
//         retentionControl?.clearValidators();
        
//         // Reset field values to null
//         thresholdControl?.setValue(null);
//         promptControl?.setValue(null);
//         retentionControl?.setValue(null);
        
//         // Clear the selected compression prompt display
//         this.selectedCompressionPrompt = null;
//       }
//       thresholdControl?.updateValueAndValidity();
//       promptControl?.updateValueAndValidity();
//       retentionControl?.updateValueAndValidity();
//     });

//     // Note: ParentID vs ExposeAsAction validation is now handled in the sub-agents section
//   }

//   private async loadDropdownData() {
//     this.isLoading$.next(true);
    
//     try {
//       const rv = new RunView();
      
//       const agentTypesResult = await rv.RunView<AIAgentTypeEntity>({
//         EntityName: 'MJ: AI Agent Types',
//         ExtraFilter: 'IsActive = 1',
//         OrderBy: 'Name',
//         ResultType: 'entity_object',
//         MaxRows: 1000
//       });

//       if (agentTypesResult.Success) {
//         this.agentTypes$.next(agentTypesResult.Results || []);
//       }

//     } catch (error) {
//       console.error('Error loading dropdown data:', error);
//       MJNotificationService.Instance.CreateSimpleNotification(
//         'Error loading form data. Please try again.',
//         'error',
//         3000
//       );
//     } finally {
//       this.isLoading$.next(false);
//     }
//   }

//   private async loadSelectedCompressionPrompt() {
//     if (this.agent.ContextCompressionPromptID) {
//       try {
//         const rv = new RunView();
//         const result = await rv.RunView<AIPromptEntityExtended>({
//           EntityName: 'AI Prompts',
//           ExtraFilter: `ID = '${this.agent.ContextCompressionPromptID}'`,
//           ResultType: 'entity_object',
//           MaxRows: 1
//         });

//         if (result.Success && result.Results && result.Results.length > 0) {
//           this.selectedCompressionPrompt = result.Results[0];
//         }
//       } catch (error) {
//         console.error('Error loading compression prompt:', error);
//       }
//     }
//   }

//   // === Validation Helpers ===

//   isFieldInvalid(fieldName: string): boolean {
//     const field = this.advancedForm.get(fieldName);
//     return !!(field && field.invalid && (field.dirty || field.touched));
//   }

//   getFieldError(fieldName: string): string {
//     const field = this.advancedForm.get(fieldName);
//     if (field?.errors) {
//       if (field.errors['required']) return 'This field is required';
//       if (field.errors['min']) return `Minimum value is ${field.errors['min'].min}`;
//     }
//     return '';
//   }

//   // === JSON Helpers ===

//   isValidJSON(value: string): boolean {
//     try {
//       JSON.parse(value);
//       return true;
//     } catch {
//       return false;
//     }
//   }

//   formatJSON(fieldName: string) {
//     const control = this.advancedForm.get(fieldName);
//     if (control?.value) {
//       try {
//         const parsed = JSON.parse(control.value);
//         const formatted = JSON.stringify(parsed, null, 2);
//         control.setValue(formatted);
//       } catch {
//         // Invalid JSON, leave as is
//       }
//     }
//   }

//   resetToDefault(fieldName: string) {
//     const control = this.advancedForm.get(fieldName);
//     if (fieldName === 'payloadDownstreamPaths' || fieldName === 'payloadUpstreamPaths') {
//       control?.setValue('["*"]');
//     } else {
//       control?.setValue(null);
//     }
//   }

//   selectCompressionPrompt() {
//     this.agentManagementService.openContextCompressionPromptSelector({
//       currentPromptId: this.selectedCompressionPrompt?.ID,
//       viewContainerRef: this.viewContainerRef
//     }).subscribe(selectedPrompt => {
//       if (selectedPrompt) {
//         this.selectedCompressionPrompt = selectedPrompt;
//         this.advancedForm.get('contextCompressionPromptID')?.setValue(selectedPrompt.ID);
//       }
//     });
//   }

//   clearCompressionPrompt() {
//     this.selectedCompressionPrompt = null;
//     this.advancedForm.get('contextCompressionPromptID')?.setValue(null);
//   }

//   viewContextCompressionPrompt() {
//     if (this.selectedCompressionPrompt?.ID) {
//       // Navigate to the AI Prompt form
//       this.router.navigate(['/form', 'AI Prompts', this.selectedCompressionPrompt.ID]);
//     }
//   }

//   // === Dialog Actions ===

//   cancel() {
//     this.result.next(null);
//     this.dialogRef.close();
//   }

//   async save() {
//     if (this.advancedForm.invalid) {
//       // Mark all fields as touched to show validation errors
//       Object.keys(this.advancedForm.controls).forEach(key => {
//         this.advancedForm.get(key)?.markAsTouched();
//       });
//       return;
//     }

//     this.isSaving$.next(true);
    
//     try {
//       const formData: AdvancedSettingsFormData = this.advancedForm.value;
      
//       // Validate JSON fields
//       const jsonFields = ['payloadDownstreamPaths', 'payloadUpstreamPaths', 'payloadSelfReadPaths', 'payloadSelfWritePaths'];
//       for (const field of jsonFields) {
//         const value = formData[field as keyof AdvancedSettingsFormData];
//         if (value && typeof value === 'string' && !this.isValidJSON(value)) {
//           MJNotificationService.Instance.CreateSimpleNotification(
//             `Invalid JSON in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
//             'error',
//             3000
//           );
//           this.isSaving$.next(false);
//           return;
//         }
//       }

//       this.result.next(formData);
//       this.dialogRef.close();
      
//     } catch (error) {
//       console.error('Error saving advanced settings:', error);
//       MJNotificationService.Instance.CreateSimpleNotification(
//         'Error saving settings. Please try again.',
//         'error',
//         3000
//       );
//     } finally {
//       this.isSaving$.next(false);
//     }
//   }
// }