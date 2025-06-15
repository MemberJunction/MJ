import { Component, Input, Output, EventEmitter, ViewContainerRef } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DialogService } from '@progress/kendo-angular-dialog';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { 
    BaseTestHarnessComponent, 
    BaseConversationMessage, 
    BaseVariable, 
    BaseSavedConversation 
} from '../shared/base-test-harness.component';

/**
 * AI Agent specific interfaces extending base types
 */
export interface AIAgentRunResult {
    success: boolean;
    output?: string;
    parsedResult?: string;
    error?: string;
    executionTimeMs?: number;
    agentRunId?: string;
    rawResult?: string;
    nextStep?: string;
}

export interface DataContextVariable extends BaseVariable {
    // Agent-specific variable properties can be added here
}

export interface ConversationMessage extends BaseConversationMessage {
    agentRunId?: string;
    // Agent-specific message properties
}

export interface SavedConversation extends BaseSavedConversation {
    agentId: string;
    agentName: string;
    dataContext: Record<string, any>;
    templateData: Record<string, any>;
}

/**
 * AI Agent Test Harness Component - extends shared base functionality
 * with agent-specific execution logic and data context management.
 */
@Component({
    selector: 'mj-ai-agent-test-harness',
    templateUrl: './ai-agent-test-harness.component.html',
    styleUrls: ['../shared/base-test-harness.component.css', './ai-agent-test-harness.component.css']
})
export class AIAgentTestHarnessComponent extends BaseTestHarnessComponent {
    
    @Input() aiAgent: AIAgentEntity | null = null;
    
    public _isVisible: boolean = false;
    @Input() 
    get isVisible(): boolean {
        return this._isVisible;
    }
    set isVisible(value: boolean) {
        const wasVisible = this._isVisible;
        this._isVisible = value;
        if (value && !wasVisible) {
            this.resetHarness();
            this.initializeDataContext();
        }
        this.visibilityChange.emit(value);
    }

    @Output() visibilityChange = new EventEmitter<boolean>();

    // Agent-specific variables
    public dataContextVariables: DataContextVariable[] = [];
    public templateDataVariables: DataContextVariable[] = [];

    // Override activeTab to use agent-specific tab names
    public override activeTab = 'dataContext';

    // Implement base class abstract property
    public get variables(): BaseVariable[] {
        return this.dataContextVariables;
    }

    constructor(
        sanitizer: DomSanitizer,
        dialogService: DialogService,
        viewContainerRef: ViewContainerRef
    ) {
        super(sanitizer, dialogService, viewContainerRef);
    }

    // === Implementation of abstract methods ===

    protected async executeTest(): Promise<void> {
        if (!this.aiAgent?.ID) {
            throw new Error('No agent selected for testing');
        }

        // Get the last assistant message to update
        const assistantMessage = this.conversationMessages[this.conversationMessages.length - 1] as ConversationMessage;
        
        try {
            const dataProvider = new GraphQLDataProvider();
            
            // Prepare messages for agent
            const messages = this.conversationMessages
                .slice(0, -1) // Exclude the placeholder assistant message
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            // Build contexts
            const dataContext = this.buildDataContext();
            const templateData = this.buildTemplateData();

            // Execute the agent
            const query = `
                mutation RunAIAgent($agentId: String!, $messages: String!, $data: String, $templateData: String) {
                    RunAIAgent(agentId: $agentId, messages: $messages, data: $data, templateData: $templateData) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        agentRunId
                        rawResult
                        nextStep
                    }
                }
            `;

            const variables = {
                agentId: this.aiAgent.ID,
                messages: JSON.stringify(messages),
                data: Object.keys(dataContext).length > 0 ? JSON.stringify(dataContext) : null,
                templateData: Object.keys(templateData).length > 0 ? JSON.stringify(templateData) : null
            };

            // Set up streaming simulation
            assistantMessage.agentRunId = this.generateMessageId();
            this.currentStreamingMessageId = assistantMessage.agentRunId;
            this.simulateStreaming(assistantMessage);

            const result = await dataProvider.ExecuteGQL(query, variables);
            const executionResult: AIAgentRunResult = result?.RunAIAgent;

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            assistantMessage.agentRunId = executionResult?.agentRunId || assistantMessage.agentRunId;
            
            if (executionResult?.success) {
                assistantMessage.rawContent = executionResult.rawResult || executionResult.output || '';
                assistantMessage.content = executionResult.parsedResult || executionResult.output || 'No response generated';
                assistantMessage.executionTime = executionResult.executionTimeMs;
            } else {
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.error || 'Unknown error occurred';
            }

            delete assistantMessage.streamingContent;
            this.currentStreamingMessageId = null;
            this.scrollNeeded = true;

        } catch (error) {
            assistantMessage.isStreaming = false;
            assistantMessage.content = 'I encountered an error processing your request.';
            assistantMessage.error = (error as Error).message;
            delete assistantMessage.streamingContent;
            throw error;
        }
    }

    protected getStorageKey(): string {
        return 'mj_agent_conversations';
    }

    public resetHarness(): void {
        this.conversationMessages = [];
        this.currentUserMessage = '';
        this.isExecuting = false;
        this.currentStreamingMessageId = null;
        this.currentConversationId = null;
        this.clearIntervals();
    }

    // === Agent-specific methods ===

    public initializeDataContext(): void {
        // Initialize with common data context variables if needed
        if (this.dataContextVariables.length === 0) {
            // Add some default variables
            this.dataContextVariables = [
                { name: 'user_id', value: '1', type: 'string' },
                { name: 'session_id', value: this.generateMessageId(), type: 'string' }
            ];
        }
    }

    public buildDataContext(): Record<string, any> {
        const context: Record<string, any> = {};
        
        for (const variable of this.dataContextVariables) {
            if (variable.name && variable.value) {
                try {
                    switch (variable.type) {
                        case 'number':
                            context[variable.name] = parseFloat(variable.value);
                            break;
                        case 'boolean':
                            context[variable.name] = variable.value === 'true';
                            break;
                        case 'object':
                        case 'array':
                            context[variable.name] = JSON.parse(variable.value);
                            break;
                        default:
                            context[variable.name] = variable.value;
                    }
                } catch (e) {
                    console.warn(`Invalid JSON for variable ${variable.name}:`, variable.value);
                    context[variable.name] = variable.value; // Fall back to string
                }
            }
        }
        
        return context;
    }

    public buildTemplateData(): Record<string, any> {
        const templateData: Record<string, any> = {};
        
        for (const variable of this.templateDataVariables) {
            if (variable.name && variable.value) {
                try {
                    switch (variable.type) {
                        case 'number':
                            templateData[variable.name] = parseFloat(variable.value);
                            break;
                        case 'boolean':
                            templateData[variable.name] = variable.value === 'true';
                            break;
                        case 'object':
                        case 'array':
                            templateData[variable.name] = JSON.parse(variable.value);
                            break;
                        default:
                            templateData[variable.name] = variable.value;
                    }
                } catch (e) {
                    console.warn(`Invalid JSON for template variable ${variable.name}:`, variable.value);
                    templateData[variable.name] = variable.value;
                }
            }
        }
        
        return templateData;
    }

    public getStatusBadgeColor(): string {
        switch (this.aiAgent?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    public addTemplateDataVariable(): void {
        this.templateDataVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    public removeTemplateDataVariable(index: number): void {
        this.templateDataVariables.splice(index, 1);
    }

    // === Base class implementation ===

    protected createSavedConversation(name: string): BaseSavedConversation {
        const conversation: SavedConversation = {
            id: this.generateMessageId(),
            name: name,
            agentId: this.aiAgent?.ID || '',
            agentName: this.aiAgent?.Name || '',
            messages: [...this.conversationMessages],
            dataContext: this.buildDataContext(),
            templateData: this.buildTemplateData(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        return conversation;
    }

    protected loadConversationVariables(conversation: BaseSavedConversation): void {
        const agentConversation = conversation as SavedConversation;
        
        // Restore data context
        this.dataContextVariables = [];
        for (const [key, value] of Object.entries(agentConversation.dataContext)) {
            this.dataContextVariables.push({
                name: key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: typeof value === 'boolean' ? 'boolean' : 
                      typeof value === 'number' ? 'number' :
                      typeof value === 'object' ? 'object' : 'string'
            });
        }
        
        // Restore template data
        this.templateDataVariables = [];
        for (const [key, value] of Object.entries(agentConversation.templateData)) {
            this.templateDataVariables.push({
                name: key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: typeof value === 'boolean' ? 'boolean' : 
                      typeof value === 'number' ? 'number' :
                      typeof value === 'object' ? 'object' : 'string'
            });
        }
    }

    protected updateSavedConversationVariables(conversation: BaseSavedConversation): void {
        const agentConversation = conversation as SavedConversation;
        agentConversation.dataContext = this.buildDataContext();
        agentConversation.templateData = this.buildTemplateData();
    }

    /**
     * Gets the agent name from a saved conversation
     */
    public getAgentName(conversation: BaseSavedConversation): string {
        return (conversation as SavedConversation).agentName || 'Unknown Agent';
    }
}