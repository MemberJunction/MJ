import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ChatMessage } from '@memberjunction/ai';

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

export interface DataContextVariable {
    name: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'object';
}

@Component({
    selector: 'mj-ai-agent-execution-dialog',
    templateUrl: './ai-agent-execution-dialog.component.html',
    styleUrls: ['./ai-agent-execution-dialog.component.css']
})
export class AIAgentExecutionDialogComponent implements OnInit {
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
            this.resetForm();
        }
    }

    @Output() visibilityChange = new EventEmitter<boolean>();

    // Execution state
    public isExecuting = false;
    public executionResult: AIAgentRunResult | null = null;

    // Conversation messages
    public conversationMessages: string = JSON.stringify([
        {
            role: 'user',
            content: 'Hello, please help me with my task.'
        }
    ], null, 2);

    // Data context variables
    public dataContextVariables: DataContextVariable[] = [];
    public templateDataVariables: DataContextVariable[] = [];

    // Expandable sections
    public showAdvancedOptions = false;
    public showDataContext = false;
    public showTemplateData = false;

    private _metadata = new Metadata();

    async ngOnInit() {
        this.resetForm();
    }

    public resetForm() {
        this.isExecuting = false;
        this.executionResult = null;
        this.showAdvancedOptions = false;
        this.showDataContext = false;
        this.showTemplateData = false;
        
        // Reset to default conversation
        this.conversationMessages = JSON.stringify([
            {
                role: 'user',
                content: 'Hello, please help me with my task.'
            }
        ], null, 2);
        
        this.dataContextVariables = [];
        this.templateDataVariables = [];
    }

    public close() {
        this._isVisible = false;
        this.visibilityChange.emit(false);
    }

    public addDataVariable() {
        this.dataContextVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    public removeDataVariable(index: number) {
        this.dataContextVariables.splice(index, 1);
    }

    public addTemplateVariable() {
        this.templateDataVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    public removeTemplateVariable(index: number) {
        this.templateDataVariables.splice(index, 1);
    }

    public async executeAgent() {
        if (!this.aiAgent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No AI agent selected',
                'error',
                4000
            );
            return;
        }

        // Validate conversation messages JSON
        let parsedMessages: ChatMessage[];
        try {
            parsedMessages = JSON.parse(this.conversationMessages);
            if (!Array.isArray(parsedMessages)) {
                throw new Error('Messages must be an array');
            }
        } catch (error) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Invalid conversation messages JSON: ' + (error as Error).message,
                'error',
                5000
            );
            return;
        }

        this.isExecuting = true;
        this.executionResult = null;

        try {
            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;

            // Build data context
            const dataContext: Record<string, any> = {};
            for (const variable of this.dataContextVariables) {
                if (variable.name.trim()) {
                    dataContext[variable.name] = this.convertVariableValue(variable.value, variable.type);
                }
            }

            // Build template data
            const templateData: Record<string, any> = {};
            for (const variable of this.templateDataVariables) {
                if (variable.name.trim()) {
                    templateData[variable.name] = this.convertVariableValue(variable.value, variable.type);
                }
            }

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
                messages: JSON.stringify(parsedMessages),
                data: Object.keys(dataContext).length > 0 ? JSON.stringify(dataContext) : null,
                templateData: Object.keys(templateData).length > 0 ? JSON.stringify(templateData) : null
            };

            const result = await dataProvider.ExecuteGQL(query, variables);

            this.executionResult = result?.RunAIAgent;

            if (this.executionResult?.success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Agent executed successfully in ${this.executionResult.executionTimeMs}ms`,
                    'success',
                    4000
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Agent execution failed: ' + (this.executionResult?.error || 'Unknown error'),
                    'error',
                    6000
                );
            }

        } catch (error) {
            this.executionResult = {
                success: false,
                error: (error as Error).message || 'Unknown error occurred'
            };
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute agent: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.isExecuting = false;
        }
    }

    private convertVariableValue(value: string, type: string): any {
        switch (type) {
            case 'number':
                return parseFloat(value) || 0;
            case 'boolean':
                return value.toLowerCase() === 'true';
            case 'object':
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            default:
                return value;
        }
    }

    public get hasResult(): boolean {
        return this.executionResult !== null;
    }

    public get resultOutput(): string {
        if (!this.executionResult) return '';
        return this.executionResult.parsedResult || this.executionResult.output || '';
    }
}