import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { Observable } from 'rxjs';
import { ActionEntity, AIAgentEntity, AIAgentPromptEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { AddActionDialogComponent } from './add-action-dialog.component';
import { AgentAdvancedSettingsDialogComponent, AdvancedSettingsFormData } from './agent-advanced-settings-dialog.component';
import { PromptSelectorDialogComponent, PromptSelectorConfig, PromptSelectorResult } from './prompt-selector-dialog.component';
import { AgentPromptAdvancedSettingsDialogComponent, AgentPromptAdvancedSettingsFormData } from './agent-prompt-advanced-settings-dialog.component';
import { SubAgentAdvancedSettingsDialogComponent, SubAgentAdvancedSettingsFormData } from './sub-agent-advanced-settings-dialog.component';

/**
 * Consolidated service for managing AI Agent operations including:
 * - Adding/removing actions
 * - Advanced settings configuration  
 * - Agent creation (future)
 * - Agent editing operations
 * 
 * This service centralizes all agent-related dialog and management functionality
 * to provide a consistent interface for both editing existing agents and creating new ones.
 */
@Injectable({
  providedIn: 'root'
})
export class AIAgentManagementService {

  constructor(private dialogService: DialogService) {}

  // === Action Management ===

  /**
   * Opens the Add Action dialog for selecting actions to link to an agent
   * 
   * @param config Configuration for the action selection dialog
   * @returns Observable that emits the selected actions when dialog is closed
   */
  openAddActionDialog(config: {
    agentId: string;
    agentName: string;
    existingActionIds: string[];
    viewContainerRef?: ViewContainerRef;
  }): Observable<ActionEntity[]> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: `Add Actions to ${config.agentName}`,
      content: AddActionDialogComponent,
      actions: [], // Component handles actions
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      preventAction: () => false
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as AddActionDialogComponent;
    componentInstance.agentId = config.agentId;
    componentInstance.agentName = config.agentName;
    componentInstance.existingActionIds = [...config.existingActionIds];

    return componentInstance.result.asObservable();
  }

  // === Advanced Settings Management ===

  /**
   * Opens the Advanced Settings dialog for an AI Agent
   * 
   * @param config Configuration for the advanced settings dialog
   * @returns Observable that emits the form data when dialog is closed, or null if cancelled
   */
  openAdvancedSettingsDialog(config: {
    agent: AIAgentEntity;
    viewContainerRef?: ViewContainerRef;
  }): Observable<AdvancedSettingsFormData | null> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: `Advanced Settings - ${config.agent.Name || 'AI Agent'}`,
      content: AgentAdvancedSettingsDialogComponent,
      actions: [], // Component handles actions
      width: 900,
      height: 700,
      minWidth: 600,
      minHeight: 500,
      preventAction: () => false
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as AgentAdvancedSettingsDialogComponent;
    componentInstance.agent = config.agent;

    return componentInstance.result.asObservable();
  }

  // === Prompt Management ===

  /**
   * Opens the prompt selector dialog for selecting general prompts to add to an agent
   * 
   * @param config Configuration for the prompt selection dialog
   * @returns Observable that emits the selected prompts when dialog is closed
   */
  openPromptSelectorDialog(config: {
    title?: string;
    multiSelect?: boolean;
    selectedPromptIds?: string[];
    showCreateNew?: boolean;
    extraFilter?: string;
    viewContainerRef?: ViewContainerRef;
  }): Observable<PromptSelectorResult | null> {
    const selectorConfig: PromptSelectorConfig = {
      title: config.title || 'Select Prompts',
      multiSelect: config.multiSelect ?? true,
      selectedPromptIds: config.selectedPromptIds || [],
      showCreateNew: config.showCreateNew ?? true,
      extraFilter: config.extraFilter
    };

    const dialogRef: DialogRef = this.dialogService.open({
      title: selectorConfig.title,
      content: PromptSelectorDialogComponent,
      actions: [], // Component handles actions
      width: 900,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      preventAction: () => false
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as PromptSelectorDialogComponent;
    componentInstance.config = selectorConfig;

    return componentInstance.result.asObservable();
  }

  /**
   * Opens the prompt selector for selecting a context compression prompt (single select)
   * 
   * @param config Configuration for the context compression prompt selection
   * @returns Observable that emits the selected prompt when dialog is closed
   */
  openContextCompressionPromptSelector(config: {
    currentPromptId?: string;
    viewContainerRef?: ViewContainerRef;
  }): Observable<AIPromptEntity | null> {
    return new Observable(observer => {
      this.openPromptSelectorDialog({
        title: 'Select Context Compression Prompt',
        multiSelect: false,
        selectedPromptIds: config.currentPromptId ? [config.currentPromptId] : [],
        showCreateNew: false,
        extraFilter: undefined, // Show all active prompts
        viewContainerRef: config.viewContainerRef
      }).subscribe(result => {
        if (result && result.selectedPrompts.length > 0) {
          observer.next(result.selectedPrompts[0]);
        } else {
          observer.next(null);
        }
        observer.complete();
      });
    });
  }

  // === Advanced Settings for Related Entities ===

  /**
   * Opens the advanced settings dialog for an AI Agent Prompt
   * 
   * @param config Configuration for the agent prompt advanced settings dialog
   * @returns Observable that emits the form data when dialog is closed, or null if cancelled
   */
  openAgentPromptAdvancedSettingsDialog(config: {
    agentPrompt: AIAgentPromptEntity;
    allAgentPrompts: AIAgentPromptEntity[];
    viewContainerRef?: ViewContainerRef;
  }): Observable<AgentPromptAdvancedSettingsFormData | null> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: `Advanced Settings - Prompt Configuration`,
      content: AgentPromptAdvancedSettingsDialogComponent,
      actions: [], // Component handles actions
      width: 700,
      height: 600,
      minWidth: 500,
      minHeight: 400,
      preventAction: () => false
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as AgentPromptAdvancedSettingsDialogComponent;
    componentInstance.agentPrompt = config.agentPrompt;
    componentInstance.allAgentPrompts = config.allAgentPrompts;

    return componentInstance.result.asObservable();
  }

  /**
   * Opens the advanced settings dialog for a Sub-Agent
   * 
   * @param config Configuration for the sub-agent advanced settings dialog
   * @returns Observable that emits the form data when dialog is closed, or null if cancelled
   */
  openSubAgentAdvancedSettingsDialog(config: {
    subAgent: AIAgentEntity;
    allSubAgents: AIAgentEntity[];
    viewContainerRef?: ViewContainerRef;
  }): Observable<SubAgentAdvancedSettingsFormData | null> {
    const dialogRef: DialogRef = this.dialogService.open({
      title: `Advanced Settings - ${config.subAgent.Name || 'Sub-Agent'}`,
      content: SubAgentAdvancedSettingsDialogComponent,
      actions: [], // Component handles actions
      width: 700,
      height: 600,
      minWidth: 500,
      minHeight: 400,
      preventAction: () => false
    });

    // Pass configuration to the dialog component
    const componentInstance = dialogRef.content.instance as SubAgentAdvancedSettingsDialogComponent;
    componentInstance.subAgent = config.subAgent;
    componentInstance.allSubAgents = config.allSubAgents;

    return componentInstance.result.asObservable();
  }

  // === Future: Agent Creation ===

  /**
   * Opens the agent creation dialog (to be implemented)
   * This will reuse existing components and provide a streamlined agent creation experience
   * 
   * @param config Configuration for agent creation
   * @returns Observable that emits the created agent when dialog is closed
   */
  openCreateAgentDialog(config: {
    parentAgentId?: string;
    initialData?: Partial<AIAgentEntity>;
    viewContainerRef?: ViewContainerRef;
  }): Observable<AIAgentEntity | null> {
    // TODO: Implement agent creation dialog
    // This will reuse the same form components and advanced settings
    // but in a creation context rather than editing context
    throw new Error('Agent creation dialog not yet implemented');
  }

  // === Utility Methods ===

  /**
   * Validates agent configuration and relationships
   * Used by both creation and editing workflows
   */
  validateAgentConfiguration(agent: AIAgentEntity): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // ParentID vs ExposeAsAction validation
    if (agent.ParentID && agent.ExposeAsAction) {
      errors.push('Agents with a parent cannot be exposed as actions');
    }

    // Context compression validation
    if (agent.EnableContextCompression) {
      if (!agent.ContextCompressionMessageThreshold) {
        errors.push('Context compression requires a message threshold');
      }
      if (!agent.ContextCompressionPromptID) {
        errors.push('Context compression requires a compression prompt');
      }
      if (!agent.ContextCompressionMessageRetentionCount) {
        errors.push('Context compression requires a message retention count');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // === Sub-Agent Management ===

  /**
   * Future method for managing sub-agent relationships
   * This will handle ParentID, ExecutionOrder, and ExecutionMode
   * in the context of the parent agent's sub-agents section
   */
  openSubAgentManagementDialog(config: {
    parentAgent: AIAgentEntity;
    subAgent?: AIAgentEntity; // For editing existing sub-agent relationship
    viewContainerRef?: ViewContainerRef;
  }): Observable<any> {
    // TODO: Implement sub-agent management dialog
    // This will handle the hierarchy settings that were removed from Advanced Settings
    throw new Error('Sub-agent management dialog not yet implemented');
  }
}