import { Component, OnInit, ViewContainerRef, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ActionEntity, AIAgentActionEntity, AIAgentEntity, AIAgentLearningCycleEntity, AIAgentNoteEntity, AIAgentPromptEntity, AIAgentRunEntity, AIPromptEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentFormComponent } from '../../generated/Entities/AIAgent/aiagent.form.component';
import { DialogService } from '@progress/kendo-angular-dialog';
import { SharedService } from '@memberjunction/ng-shared';
import { EntitySelectorDialogComponent, EntitySelectorConfig } from '../shared/entity-selector-dialog.component';

/**
 * Enhanced AI Agent form component that extends the auto-generated base form
 * with comprehensive agent management capabilities including test harness integration,
 * related entity management, and execution history tracking.
 * 
 * ## Key Features:
 * - **Integrated Test Harness**: Built-in access to agent testing capabilities
 * - **Related Entity Management**: Display and manage sub-agents, prompts, and actions
 * - **Execution History**: View recent agent runs with status and timing information
 * - **Rich UI Components**: Enhanced cards, badges, and status indicators
 * - **Navigation Support**: Links to related entities and management functions
 * 
 * ## Form Sections:
 * - **Agent Details**: Basic agent configuration and settings
 * - **Sub-Agents**: Hierarchical agent relationships
 * - **Prompts**: Associated prompts with priority ordering
 * - **Actions**: Available actions and configurations
 * - **Execution History**: Recent runs with detailed status information
 * 
 * ## Usage:
 * This component is automatically loaded when editing AI Agent entities through
 * the MemberJunction form system. It extends the base generated form with
 * additional functionality while maintaining full compatibility.
 * 
 * @example
 * ```html
 * <!-- Automatically used by form system -->
 * <mj-ai-agent-form [recordId]="agentId"></mj-ai-agent-form>
 * ```
 */
@RegisterClass(BaseFormComponent, 'AI Agents')
@Component({
    selector: 'mj-ai-agent-form',
    templateUrl: './ai-agent-form.component.html',
    styleUrls: ['./ai-agent-form.component.css']
})
export class AIAgentFormComponentExtended extends AIAgentFormComponent implements OnInit {
    /** The AI Agent entity being edited */
    public record!: AIAgentEntity;
    
    /** Whether the test harness is currently visible */
    public showTestHarness = false;
    
    // === Related Entity Counts ===
    /** Number of sub-agents under this agent */
    public subAgentCount = 0;
    
    /** Number of prompts associated with this agent */
    public promptCount = 0;
    
    /** Number of actions configured for this agent */
    public actionCount = 0;
    
    
    /** Number of learning cycles for this agent */
    public learningCycleCount = 0;
    
    /** Number of notes associated with this agent */
    public noteCount = 0;
    
    /** Number of execution history records */
    public executionHistoryCount = 0;
    
    // === Related Entity Data for Display ===
    /** Array of sub-agent entities for card display */
    public subAgents: AIAgentEntity[] = [];
    
    /** Array of agent prompt entities for card display */
    public agentPrompts: AIPromptEntityExtended[] = [];
    
    /** Array of agent action entities for card display */
    public agentActions: ActionEntity[] = [];
    
    
    /** Array of learning cycle entities for display */
    public learningCycles: AIAgentLearningCycleEntity[] = [];
    
    /** Array of agent note entities for display */
    public agentNotes: AIAgentNoteEntity[] = [];
    
    /** Array of recent execution records for history display */
    public recentExecutions: AIAgentRunEntity[] = [];

    constructor(
        elementRef: ElementRef,
        protected override sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef,
        private dialogService: DialogService,
        private viewContainerRef: ViewContainerRef
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }

    /**
     * Component initialization. Calls parent initialization and loads related entity data
     * if an agent record is already available.
     */
    async ngOnInit() {
        await super.ngOnInit();
        if (this.record?.ID) {
            await this.loadRelatedCounts();
        }
    }

    /**
     * Loads counts and preview data for all related entities including sub-agents,
     * prompts, actions, learning cycles, notes, and execution history. 
     * This data populates the various expander panels in the enhanced form interface.
     * @private
     */
    private async loadRelatedCounts(): Promise<void> {
        if (!this.record?.ID) return;
        
        try {
            console.log('🔍 AI Agent Form - Loading related data for Agent ID:', this.record.ID);
            const rv = new RunView();
            
            // Load sub-agents with data
            const subAgentResult = await rv.RunView<AIAgentEntity>({
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID='${this.record.ID}'`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });
            this.subAgents = subAgentResult.Results || [];
            this.subAgentCount = subAgentResult.TotalRowCount || 0;

            const promptResult = await rv.RunView<AIPromptEntityExtended>({
                EntityName: 'AI Prompts',
                ExtraFilter: `ID IN (SELECT PromptID FROM __mj.vwAIAgentPrompts WHERE AgentID='${this.record.ID}')` 
            });
            
            this.agentPrompts = promptResult.Results || [];
            this.promptCount = promptResult.TotalRowCount || 0;
 
            const actionResult = await rv.RunView<ActionEntity>({
                EntityName: 'Actions',
                ExtraFilter: `ID IN (SELECT ActionID FROM __mj.vwAIAgentActions WHERE AgentID='${this.record.ID}')`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });
            
            this.agentActions = actionResult.Results || [];
            this.actionCount = actionResult.TotalRowCount || 0;
            
            console.log('⚡ Final actions count:', this.actionCount, 'items');
            
            // Load learning cycles with data
            const learningResult = await rv.RunView<AIAgentLearningCycleEntity>({
                EntityName: 'AI Agent Learning Cycles',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                OrderBy: 'StartedAt DESC',
                ResultType: 'entity_object'
            });
            this.learningCycles = learningResult.Results || [];
            this.learningCycleCount = learningResult.TotalRowCount || 0;
            
            // Load notes with data
            const noteResult = await rv.RunView<AIAgentNoteEntity>({
                EntityName: 'AI Agent Notes',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                ResultType: 'entity_object'
            });
            this.agentNotes = noteResult.Results || [];
            this.noteCount = noteResult.TotalRowCount || 0;
            
            // Load recent execution history
            const historyResult = await rv.RunView<AIAgentRunEntity>({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'entity_object'
            });
            this.recentExecutions = historyResult.Results || [];
            this.executionHistoryCount = historyResult.TotalRowCount || 0;
        } catch (error) {
            console.error('Error loading related data:', error);
            // Set all counts to 0 on error to ensure UI shows proper empty states
            this.subAgentCount = 0;
            this.promptCount = 0;
            this.actionCount = 0;
            this.learningCycleCount = 0;
            this.noteCount = 0;
            this.executionHistoryCount = 0;
        }
    }


    /**
     * Opens the integrated test harness for the current agent.
     * Validates that the agent has been saved before allowing testing.
     * Shows a notification if the agent needs to be saved first.
     */
    public openTestHarness() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before testing',
                'warning',
                4000
            );
            return;
        }

        this.showTestHarness = true;
    }

    /**
     * Returns the appropriate color for the agent status badge.
     * Uses standard color coding: green for active, yellow for pending, gray for disabled.
     * @returns CSS color value for the status badge
     */
    public getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    /**
     * Event handler for test harness visibility changes.
     * Updates the component state when the test harness is opened or closed.
     * @param isVisible - Whether the test harness is currently visible
     */
    public onTestHarnessVisibilityChanged(isVisible: boolean) {
        this.showTestHarness = isVisible;
    }

    /**
     * Gets the count of sub-agents
     */
    public getSubAgentCount(): number {
        return this.subAgentCount;
    }

    /**
     * Gets the count of prompts
     */
    public getPromptCount(): number {
        return this.promptCount;
    }

    /**
     * Gets the count of actions
     */
    public getActionCount(): number {
        return this.actionCount;
    }

    /**
     * Gets the icon for the execution mode
     */
    public getExecutionModeIcon(mode: string): string {
        switch (mode) {
            case 'Sequential':
                return 'fa-solid fa-list-ol';
            case 'Parallel':
                return 'fa-solid fa-layer-group';
            default:
                return 'fa-solid fa-robot';
        }
    }

    /**
     * Creates a new sub-agent
     */
    public async createSubAgent() {
        // Open a new AI Agent form with ParentID pre-populated
        MJNotificationService.Instance.CreateSimpleNotification(
            'Opening new sub-agent form...',
            'info',
            2000
        );
        
        // For now, we'll just show a notification
        // In a full implementation, this would emit an event to open a new form
        // with ParentID pre-populated to this.record.ID
    }

    /**
     * Adds a new prompt to the agent
     */
    public async addPrompt() {
        const config: EntitySelectorConfig = {
            entityName: 'AI Prompts',
            title: 'Select AI Prompt',
            displayField: 'Name',
            descriptionField: 'Description',
            statusField: 'Status',
            filters: `Status='Active'`,
            orderBy: 'Name ASC',
            icon: 'fa-solid fa-comment-dots'
        };

        const dialogRef = this.dialogService.open({
            content: EntitySelectorDialogComponent
        });

        const componentInstance = dialogRef.content.instance as EntitySelectorDialogComponent;
        componentInstance.config = config;

        const result = await dialogRef.result;
        if (result && (result as any).entity) {
            // User selected an existing prompt
            await this.linkPromptToAgent((result as any).entity);
        } else if (result && (result as any).createNew) {
            // User wants to create a new prompt
            await this.createNewPrompt();
        }
    }

    /**
     * Opens the action configuration dialog
     */
    public async configureActions() {
        const config: EntitySelectorConfig = {
            entityName: 'Actions',
            title: 'Select Action',
            displayField: 'Name',
            descriptionField: 'Description',
            statusField: 'Status',
            filters: `Status='Active'`,
            orderBy: 'Name ASC',
            icon: 'fa-solid fa-bolt'
        };

        const dialogRef = this.dialogService.open({
            content: EntitySelectorDialogComponent
        });

        const componentInstance = dialogRef.content.instance as EntitySelectorDialogComponent;
        componentInstance.config = config;

        const result = await dialogRef.result;
        if (result && (result as any).entity) {
            // User selected an existing action
            await this.linkActionToAgent((result as any).entity);
        } else if (result && (result as any).createNew) {
            // User wants to create a new action
            await this.createNewAction();
        }
    }

    /**
     * Gets the status icon for execution runs
     */
    public getExecutionStatusIcon(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return 'fa-solid fa-check-circle';
            case 'failed':
            case 'error':
                return 'fa-solid fa-exclamation-triangle';
            case 'running':
            case 'in_progress':
                return 'fa-solid fa-spinner fa-spin';
            case 'pending':
                return 'fa-solid fa-clock';
            default:
                return 'fa-solid fa-question-circle';
        }
    }

    /**
     * Gets the status color for execution runs
     */
    public getExecutionStatusColor(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return '#28a745';
            case 'failed':
            case 'error':
                return '#dc3545';
            case 'running':
            case 'in_progress':
                return '#17a2b8';
            case 'pending':
                return '#ffc107';
            default:
                return '#6c757d';
        }
    }

    public formatExecutionTimeFromDates(startDate: Date, endDate: Date): string {
        if (!startDate || !endDate) return 'N/A';
        
        const milliseconds = endDate.getTime() - startDate.getTime();
        return this.formatExecutionTime(milliseconds);
    }

    /**
     * Formats execution time
     */
    public formatExecutionTime(milliseconds: number): string {
        if (!milliseconds) return 'N/A';
        
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(1)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    /**
     * Gets the priority badge color
     */
    public getPriorityBadgeColor(priority: number): string {
        if (priority <= 1) return '#dc3545'; // High priority - red
        if (priority <= 5) return '#ffc107'; // Medium priority - yellow
        return '#28a745'; // Low priority - green
    }

    /**
     * Gets the priority label
     */
    public getPriorityLabel(priority: number): string {
        if (priority <= 1) return 'High';
        if (priority <= 5) return 'Medium';
        return 'Low';
    }

    /**
     * Navigates to a related entity
     */
    public navigateToEntity(entityName: string, recordId: string) {
        this.sharedService.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }

    /**
     * Refreshes the related data
     */
    public async refreshRelatedData() {
        if (this.record?.ID) {
            await this.loadRelatedCounts();
            MJNotificationService.Instance.CreateSimpleNotification(
                'Related data refreshed',
                'success',
                2000
            );
        }
    }


    /**
     * Adds a new note to the agent
     */
    public addNote() {
        MJNotificationService.Instance.CreateSimpleNotification(
            'Opening new note form...',
            'info',
            2000
        );
        
        // In a full implementation, this would open a new AI Agent Note form
        // with AgentID pre-populated to this.record.ID
    }

    /**
     * Links an existing prompt to the agent
     */
    private async linkPromptToAgent(prompt: AIPromptEntity) {
        try {
            const md = new Metadata();
            const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('AI Agent Prompts');
            
            agentPrompt.AgentID = this.record.ID;
            agentPrompt.PromptID = prompt.ID;
            agentPrompt.Status = 'Active'; // Default value
            agentPrompt.ExecutionOrder = 1; // Default execution order
            
            const result = await agentPrompt.Save();
            if (result) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Prompt "${prompt.Name}" added successfully`,
                    'success',
                    3000
                );
                await this.loadRelatedCounts();
            } else {
                throw new Error('Failed to save AI Agent Prompt');
            }
        } catch (error) {
            console.error('Error linking prompt to agent:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add prompt',
                'error',
                3000
            );
        }
    }

    /**
     * Creates a new prompt and links it to the agent
     */
    private async createNewPrompt() {
        // TODO: Open new AI Prompt form
        // await this.sharedService.CreateNewRecord('AI Prompts', undefined, [
        //     { FieldName: 'Status', Value: 'Active' }
        // ]);
        MJNotificationService.Instance.CreateSimpleNotification(
            'Creating new prompt - functionality to be implemented',
            'info',
            3000
        );
    }

    /**
     * Links an existing action to the agent
     */
    private async linkActionToAgent(action: ActionEntity) {
        try {
            const md = new Metadata();
            const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions');
            
            agentAction.AgentID = this.record.ID;
            agentAction.ActionID = action.ID;
            agentAction.Status = 'Active'; // Default status
            
            const result = await agentAction.Save();
            if (result) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Action "${action.Name}" added successfully`,
                    'success',
                    3000
                );
                await this.loadRelatedCounts();
            } else {
                throw new Error('Failed to save AI Agent Action');
            }
        } catch (error) {
            console.error('Error linking action to agent:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to add action',
                'error',
                3000
            );
        }
    }

    /**
     * Creates a new action and links it to the agent
     */
    private async createNewAction() {
        // TODO: Open new Action form
        // await this.sharedService.CreateNewRecord('Actions', undefined, [
        //     { FieldName: 'Status', Value: 'Active' }
        // ]);
        MJNotificationService.Instance.CreateSimpleNotification(
            'Creating new action - functionality to be implemented',
            'info',
            3000
        );
    }

    /**
     * Removes a prompt from the agent
     */
    public async removePrompt(prompt: AIPromptEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Prompt',
            content: `Are you sure you want to remove the prompt "${prompt.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        const result = await confirmDialog.result;
        if (result && (result as any).text === 'Remove') {
            try {
                // Find the AI Agent Prompt link record
                const rv = new RunView();
                const linkResult = await rv.RunView<AIAgentPromptEntity>({
                    EntityName: 'AI Agent Prompts',
                    ExtraFilter: `AgentID='${this.record.ID}' AND PromptID='${prompt.ID}'`,
                    ResultType: 'entity_object'
                });

                if (linkResult.Results && linkResult.Results.length > 0) {
                    const agentPrompt = linkResult.Results[0];
                    const deleteResult = await agentPrompt.Delete();
                    
                    if (deleteResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Prompt "${prompt.Name}" removed successfully`,
                            'success',
                            3000
                        );
                        await this.loadRelatedCounts();
                    } else {
                        throw new Error('Failed to delete AI Agent Prompt link');
                    }
                } else {
                    throw new Error('AI Agent Prompt link not found');
                }
            } catch (error) {
                console.error('Error removing prompt from agent:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to remove prompt',
                    'error',
                    3000
                );
            }
        }
    }

    /**
     * Removes an action from the agent
     */
    public async removeAction(action: ActionEntity, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Action',
            content: `Are you sure you want to remove the action "${action.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        const result = await confirmDialog.result;
        if (result && (result as any).text === 'Remove') {
            try {
                // Find the AI Agent Action link record
                const rv = new RunView();
                const linkResult = await rv.RunView<AIAgentActionEntity>({
                    EntityName: 'AI Agent Actions',
                    ExtraFilter: `AgentID='${this.record.ID}' AND ActionID='${action.ID}'`,
                    ResultType: 'entity_object'
                });

                if (linkResult.Results && linkResult.Results.length > 0) {
                    const agentAction = linkResult.Results[0];
                    const deleteResult = await agentAction.Delete();
                    
                    if (deleteResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Action "${action.Name}" removed successfully`,
                            'success',
                            3000
                        );
                        await this.loadRelatedCounts();
                    } else {
                        throw new Error('Failed to delete AI Agent Action link');
                    }
                } else {
                    throw new Error('AI Agent Action link not found');
                }
            } catch (error) {
                console.error('Error removing action from agent:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Failed to remove action',
                    'error',
                    3000
                );
            }
        }
    }
}

export function LoadAIAgentFormComponentExtended() {
    // This function is called to ensure the component is loaded and registered
}