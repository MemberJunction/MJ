import { Component, Input, Output, EventEmitter, ViewContainerRef } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DialogService } from '@progress/kendo-angular-dialog';
import { AIPromptEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { 
    BaseTestHarnessComponent, 
    BaseConversationMessage, 
    BaseVariable, 
    BaseSavedConversation 
} from '../shared/base-test-harness.component';

/**
 * AI Prompt specific interfaces extending base types
 */
export interface AIPromptRunResult {
    success: boolean;
    output?: string;
    parsedResult?: string;
    error?: string;
    executionTimeMs?: number;
    promptRunId?: string;
    rawResult?: string;
    renderedPrompt?: string;
}

export interface TemplateVariable extends BaseVariable {
    description?: string;
}

export interface ConversationMessage extends BaseConversationMessage {
    promptRunId?: string;
    renderedPrompt?: string;
}

export interface SavedPromptConversation extends BaseSavedConversation {
    promptId: string;
    promptName: string;
    templateVariables: TemplateVariable[];
}

/**
 * AI Prompt Test Harness Component - extends shared base functionality
 * with prompt-specific execution logic and template variable management.
 */
@Component({
    selector: 'mj-ai-prompt-test-harness',
    templateUrl: './ai-prompt-test-harness.component.html',
    styleUrls: ['../shared/base-test-harness.component.css', './ai-prompt-test-harness.component.css']
})
export class AIPromptTestHarnessComponent extends BaseTestHarnessComponent {
    
    @Input() aiPrompt: AIPromptEntity | null = null;
    @Input() template: TemplateEntity | null = null;
    @Input() templateContent: TemplateContentEntity | null = null;
    
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
            this.initializeVariables();
        }
        this.visibilityChange.emit(value);
    }

    @Output() visibilityChange = new EventEmitter<boolean>();

    // Prompt-specific variables
    public templateVariables: TemplateVariable[] = [];

    // Implement base class abstract property
    public get variables(): BaseVariable[] {
        return this.templateVariables;
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
        if (!this.aiPrompt?.ID) {
            throw new Error('No prompt selected for testing');
        }

        // Get the last assistant message to update
        const assistantMessage = this.conversationMessages[this.conversationMessages.length - 1] as ConversationMessage;
        
        try {
            const dataProvider = new GraphQLDataProvider();
            
            // Build template data
            const templateData = this.buildTemplateData();

            // Execute the prompt
            const query = `
                mutation RunAIPrompt($promptId: String!, $userInput: String!, $data: String) {
                    RunAIPrompt(promptId: $promptId, userInput: $userInput, data: $data) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        promptRunId
                        rawResult
                        renderedPrompt
                    }
                }
            `;

            const variables = {
                promptId: this.aiPrompt.ID,
                userInput: this.currentUserMessage,
                data: Object.keys(templateData).length > 0 ? JSON.stringify(templateData) : null
            };

            // Set up streaming simulation
            assistantMessage.promptRunId = this.generateMessageId();
            this.currentStreamingMessageId = assistantMessage.promptRunId;
            this.simulateStreaming(assistantMessage);

            const result = await dataProvider.ExecuteGQL(query, variables);
            const executionResult: AIPromptRunResult = result?.RunAIPrompt;

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            assistantMessage.promptRunId = executionResult?.promptRunId || assistantMessage.promptRunId;
            
            if (executionResult?.success) {
                assistantMessage.rawContent = executionResult.rawResult || executionResult.output || '';
                assistantMessage.content = executionResult.parsedResult || executionResult.output || 'No response generated';
                assistantMessage.executionTime = executionResult.executionTimeMs;
                assistantMessage.renderedPrompt = executionResult.renderedPrompt;
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
        return 'mj_prompt_conversations';
    }

    public resetHarness(): void {
        this.conversationMessages = [];
        this.currentUserMessage = '';
        this.isExecuting = false;
        this.currentStreamingMessageId = null;
        this.currentConversationId = null;
        this.clearIntervals();
    }

    // === Prompt-specific methods ===

    public async initializeVariables(): Promise<void> {
        // Auto-detect template variables from template content
        if (this.templateContent?.TemplateText && this.templateVariables.length === 0) {
            const detectedVariables = this.detectTemplateVariables(this.templateContent.TemplateText);
            this.templateVariables = detectedVariables;
        }
    }

    private detectTemplateVariables(content: string): TemplateVariable[] {
        const variables: TemplateVariable[] = [];
        const variablePattern = /\{\{([^}]+)\}\}/g;
        const found = new Set<string>();
        
        let match;
        while ((match = variablePattern.exec(content)) !== null) {
            const variableName = match[1].trim();
            if (!found.has(variableName)) {
                found.add(variableName);
                variables.push({
                    name: variableName,
                    value: '',
                    type: 'string',
                    description: `Auto-detected from template`
                });
            }
        }
        
        return variables;
    }

    public buildTemplateData(): Record<string, any> {
        const templateData: Record<string, any> = {};
        
        for (const variable of this.templateVariables) {
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
        switch (this.aiPrompt?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    public toggleRenderedPrompt(message: BaseConversationMessage): void {
        (message as any).showRendered = !(message as any).showRendered;
    }

    public getPromptName(conversation: BaseSavedConversation): string {
        return (conversation as SavedPromptConversation).promptName || 'Unknown Prompt';
    }

    public hasRenderedPrompt(message: BaseConversationMessage): boolean {
        return !!(message as ConversationMessage).renderedPrompt;
    }

    public showRenderedPrompt(message: BaseConversationMessage): boolean {
        return (message as any).showRendered || false;
    }

    public getRenderedPrompt(message: BaseConversationMessage): string {
        return (message as ConversationMessage).renderedPrompt || '';
    }

    // === Base class implementation ===

    protected createSavedConversation(name: string): BaseSavedConversation {
        const conversation: SavedPromptConversation = {
            id: this.generateMessageId(),
            name: name,
            promptId: this.aiPrompt?.ID || '',
            promptName: this.aiPrompt?.Name || '',
            messages: [...this.conversationMessages],
            templateVariables: [...this.templateVariables],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        return conversation;
    }

    protected loadConversationVariables(conversation: BaseSavedConversation): void {
        const promptConversation = conversation as SavedPromptConversation;
        this.templateVariables = [...promptConversation.templateVariables];
    }

    protected updateSavedConversationVariables(conversation: BaseSavedConversation): void {
        const promptConversation = conversation as SavedPromptConversation;
        promptConversation.templateVariables = [...this.templateVariables];
    }
}