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
  
  Form!: FormGroup;

  /** @deprecated Use {@link Form}. */
  get form(): FormGroup {
    return this.Form;
  }
  /** @deprecated Use {@link Form}. */
  set form(value: FormGroup) {
    this.Form = value;
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
  Models$ = new BehaviorSubject<MJAIModelEntityExtended[]>([]);

  /** @deprecated Use {@link Models$}. */
  get models$() {
    return this.Models$;
  }
  /** @deprecated Use {@link Models$}. */
  set models$(value) {
    this.Models$ = value;
  }
  AgentTypes$ = new BehaviorSubject<MJAIAgentTypeEntity[]>([]);

  /** @deprecated Use {@link AgentTypes$}. */
  get agentTypes$() {
    return this.AgentTypes$;
  }
  /** @deprecated Use {@link AgentTypes$}. */
  set agentTypes$(value) {
    this.AgentTypes$ = value;
  }
  IsSubmitting = false;

  /** @deprecated Use {@link IsSubmitting}. */
  get isSubmitting() {
    return this.IsSubmitting;
  }
  /** @deprecated Use {@link IsSubmitting}. */
  set isSubmitting(value) {
    this.IsSubmitting = value;
  }
  
  /** Set by NewAgentDialogService after creation */
  public DialogRef: MJDialogRef | null = null;

  /** @deprecated Use {@link DialogRef}. */
  public get dialogRef(): MJDialogRef | null {
    return this.DialogRef;
  }
  /** @deprecated Use {@link DialogRef}. */
  public set dialogRef(value: MJDialogRef | null) {
    this.DialogRef = value;
  }

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
    this.Form = this.fb.group({
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
    this.IsLoading$.next(true);
    
    try {
      const engine = AIEngineBase.Instance;
      await engine.Config(false);
      const models = engine.Models;
      models.sort ((a, b) => { 
        return a.Name.localeCompare(b.Name);
      });
      
      this.Models$.next(models || []);
      
      // Pre-select first model if available
      if (models && models.length > 0) {
        this.Form.patchValue({ modelId: models[0].ID });
      }
      
      const agentTypes = engine.AgentTypes;
      this.AgentTypes$.next(agentTypes as MJAIAgentTypeEntity[] || []);
    } catch (error) {
      console.error('Error loading data:', error);
      console.error('Failed to load required data');
    } finally {
      this.IsLoading$.next(false);
    }
  }
  
  async OnSubmit() {
    if (this.Form.invalid || this.IsSubmitting) {
      return;
    }
    
    this.IsSubmitting = true;
    
    try {
      const md = this.ProviderToUse;
      const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
      
      if (!agent) {
        throw new Error('Failed to create agent entity');
      }
      
      // Set agent properties
      agent.Name = this.Form.value.name;
      agent.Description = this.Form.value.description;
      
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
        this.DialogRef?.Close({ agent, action: 'created' });

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
      this.IsSubmitting = false;
    }
  }

  /** @deprecated Use {@link OnSubmit}. */
  async onSubmit() {
    return this.OnSubmit();
  }

  onCancel() {
    this.DialogRef?.Close({ action: 'cancelled' });
  }
}