import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { NotificationService } from '@progress/kendo-angular-notification';
import { Metadata } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended } from "@memberjunction/ai-core-plus";
import { NavigationService } from '@memberjunction/ng-shared';
import { BehaviorSubject } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

export interface NewAgentConfig {
  parentAgentId?: string;
  parentAgentName?: string;
  redirectToForm?: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-new-agent-dialog',
  templateUrl: './new-agent-dialog.component.html',
  styleUrls: ['./new-agent-dialog.component.css']
})
export class NewAgentDialogComponent implements OnInit {
  @Input() config: NewAgentConfig = {
    redirectToForm: true
  };
  
  form!: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  models$ = new BehaviorSubject<MJAIModelEntityExtended[]>([]);
  agentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);
  isSubmitting = false;
  
  constructor(
    private fb: FormBuilder,
    private dialog: DialogRef,
    private navigationService: NavigationService,
    private notificationService: NotificationService
  ) {}
  
  ngOnInit() {
    this.initializeForm();
    this.loadData();
  }
  
  private initializeForm() {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      description: [''],
      modelId: ['', Validators.required],
      agentType: ['standard', Validators.required],
      systemPrompt: ['You are a helpful AI assistant.'],
      enableStreaming: [true],
      temperature: [0.7, [Validators.min(0), Validators.max(2)]],
      maxTokens: [2000, [Validators.min(1), Validators.max(8000)]]
    });
  }
  
  private async loadData() {
    this.isLoading$.next(true);
    
    try {
      const engine = AIEngineBase.Instance;
      await engine.Config(false);
      const models = engine.Models;
      models.sort ((a, b) => { 
        return a.Name.localeCompare(b.Name);
      });
      
      this.models$.next(models || []);
      
      // Pre-select first model if available
      if (models && models.length > 0) {
        this.form.patchValue({ modelId: models[0].ID });
      }
      
      const agentTypes = engine.AgentTypes;
      this.agentTypes$.next(agentTypes as MJAIAgentTypeEntity[] || []);
    } catch (error) {
      console.error('Error loading data:', error);
      this.showError('Failed to load required data');
    } finally {
      this.isLoading$.next(false);
    }
  }
  
  async onSubmit() {
    if (this.form.invalid || this.isSubmitting) {
      return;
    }
    
    this.isSubmitting = true;
    
    try {
      const md = new Metadata();
      const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
      
      if (!agent) {
        throw new Error('Failed to create agent entity');
      }
      
      // Set agent properties
      agent.Name = this.form.value.name;
      agent.Description = this.form.value.description;
      
      // Set parent agent if provided
      if (this.config.parentAgentId) {
        agent.ParentID = this.config.parentAgentId;
      }
      
      // Set execution mode
      agent.ExecutionMode = 'Sequential';
      agent.ExecutionOrder = 0;
      agent.ExposeAsAction = false;
      
      // Save the agent
      const saveResult = await agent.Save();
      
      if (saveResult) {
        this.showSuccess('Agent created successfully!');
        
        // Close dialog with the new agent
        this.dialog.close({ agent, action: 'created' });
        
        // Redirect to form if configured
        if (this.config.redirectToForm && !this.config.parentAgentId) {
          // Only redirect for top-level agents - use NavigationService to open the record
          setTimeout(() => {
            this.navigationService.OpenEntityRecord('MJ: AI Agents', agent.PrimaryKey);
          }, 100);
        }
      } else {
        throw new Error('Failed to save agent');
      }
    } catch (error: any) {
      console.error('Error creating agent:', error);
      this.showError('Failed to create agent: ' + (error.message || 'Unknown error'));
    } finally {
      this.isSubmitting = false;
    }
  }
  
  onCancel() {
    this.dialog.close({ action: 'cancelled' });
  }
  
  private showSuccess(message: string) {
    this.notificationService.show({
      content: message,
      type: { style: 'success', icon: true },
      position: { horizontal: 'right', vertical: 'top' },
      animation: { type: 'slide', duration: 300 },
      hideAfter: 3000
    });
  }
  
  private showError(message: string) {
    this.notificationService.show({
      content: message,
      type: { style: 'error', icon: true },
      position: { horizontal: 'right', vertical: 'top' },
      animation: { type: 'slide', duration: 300 },
      hideAfter: 5000
    });
  }
}