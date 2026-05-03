import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended } from "@memberjunction/ai-core-plus";
import { NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
import { BehaviorSubject } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class NewAgentDialogComponent extends BaseAngularComponent implements OnInit {
  @Input() config: NewAgentConfig = {
    redirectToForm: true
  };
  
  form!: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  models$ = new BehaviorSubject<MJAIModelEntityExtended[]>([]);
  agentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);
  isSubmitting = false;
  
  /** Set by NewAgentDialogService after creation */
  public dialogRef: MJDialogRef | null = null;

  constructor(
    private fb: FormBuilder,
    private navigationService: NavigationService
  ) {
    super();}
  
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
      console.error('Failed to load required data');
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
      const md = this.ProviderToUse;
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
        MJNotificationService.Instance.CreateSimpleNotification('Agent created successfully!', 'success', 3000);

        // Close dialog with the new agent
        this.dialogRef?.Close({ agent, action: 'created' });

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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error creating agent:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Failed to create agent: ' + errorMessage, 'error', 5000);
    } finally {
      this.isSubmitting = false;
    }
  }

  onCancel() {
    this.dialogRef?.Close({ action: 'cancelled' });
  }
}