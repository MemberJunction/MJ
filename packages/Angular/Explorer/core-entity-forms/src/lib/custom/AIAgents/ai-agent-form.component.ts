import { Component, OnInit } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Metadata, RunView } from '@memberjunction/core';
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
    
    /** Number of execution history records */
    public executionHistoryCount = 0;
    
    // === Related Entity Data for Display ===
    /** Array of sub-agent entities for card display */
    public subAgents: any[] = [];
    
    /** Array of agent prompt entities for card display */
    public agentPrompts: any[] = [];
    
    /** Array of agent action entities for card display */
    public agentActions: any[] = [];
    
    /** Array of recent execution records for history display */
    public recentExecutions: any[] = [];
    
    /** MemberJunction metadata instance for entity operations */
    private _metadata = new Metadata();

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
     * prompts, actions, and execution history. This data populates the various
     * tabs and cards in the enhanced form interface.
     * @private
     */
    private async loadRelatedCounts(): Promise<void> {
        if (!this.record?.ID) return;
        
        try {
            const rv = new RunView();
            
            // Load sub-agents with data
            const subAgentResult = await rv.RunView<any>({
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID = '${this.record.ID}'`,
                OrderBy: 'Name ASC',
                MaxRows: 10,
                ResultType: 'entity_object'
            });
            this.subAgents = subAgentResult.Results || [];
            this.subAgentCount = subAgentResult.TotalRowCount || 0;
            
            // Load prompts with data
            const promptResult = await rv.RunView<any>({
                EntityName: 'AI Agent Prompts',
                ExtraFilter: `AgentID = '${this.record.ID}'`,
                OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
                MaxRows: 10,
                ResultType: 'entity_object'
            });
            this.agentPrompts = promptResult.Results || [];
            this.promptCount = promptResult.TotalRowCount || 0;
            
            // Load actions with data
            const actionResult = await rv.RunView<any>({
                EntityName: 'AI Agent Actions',
                ExtraFilter: `AgentID = '${this.record.ID}'`,
                OrderBy: 'Name ASC',
                MaxRows: 10,
                ResultType: 'entity_object'
            });
            this.agentActions = actionResult.Results || [];
            this.actionCount = actionResult.TotalRowCount || 0;
            
            // Load recent execution history
            const historyResult = await rv.RunView<any>({
                EntityName: 'AI Agent Runs',
                ExtraFilter: `AgentID = '${this.record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 5,
                ResultType: 'entity_object'
            });
            this.recentExecutions = historyResult.Results || [];
            this.executionHistoryCount = historyResult.TotalRowCount || 0;
        } catch (error) {
            console.error('Error loading related data:', error);
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
        // This would emit an event to navigate to the entity
        // For now, just show a notification
        MJNotificationService.Instance.CreateSimpleNotification(
            `Opening ${entityName} record...`,
            'info',
            2000
        );
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
}

export function LoadAIAgentFormComponentExtended() {
    // This function is called to ensure the component is loaded and registered
}