import { Component, OnInit } from '@angular/core';
import { ActionEntity, AIAgentActionEntity, AIAgentEntity, AIAgentLearningCycleEntity, AIAgentNoteEntity, AIAgentPromptEntity, AIAgentRunEntity, AIPromptEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentFormComponent } from '../../generated/Entities/AIAgent/aiagent.form.component';

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
        // Open a new AI Agent Prompt form with AgentID pre-populated
        MJNotificationService.Instance.CreateSimpleNotification(
            'Opening new prompt form...',
            'info',
            2000
        );
        
        // For now, we'll just show a notification
        // In a full implementation, this would emit an event to open a new form
        // with AgentID pre-populated to this.record.ID
    }

    /**
     * Opens the action configuration dialog
     */
    public configureActions() {
        // For now, just show a notification
        // In the future, this could open a specialized action configuration dialog
        MJNotificationService.Instance.CreateSimpleNotification(
            'Action configuration dialog coming soon',
            'info',
            3000
        );
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
}

export function LoadAIAgentFormComponentExtended() {
    // This function is called to ensure the component is loaded and registered
}