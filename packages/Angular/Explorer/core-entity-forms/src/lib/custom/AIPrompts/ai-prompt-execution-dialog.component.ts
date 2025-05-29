import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIPromptEntity, AIModelEntityExtended, AIVendorEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';


export interface AIPromptRunResult {
    success: boolean;
    output?: string;
    parsedResult?: string;
    error?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    promptRunId?: string;
    rawResult?: string;
    validationResult?: string;
}

export interface AIPromptExecutionOptions {
    modelId?: string;
    vendorId?: string;
    configurationId?: string;
    skipValidation?: boolean;
    parallelizationMode?: string;
}

@Component({
    selector: 'mj-ai-prompt-execution-dialog',
    templateUrl: './ai-prompt-execution-dialog.component.html',
    styleUrls: ['./ai-prompt-execution-dialog.component.css']
})
export class AIPromptExecutionDialogComponent implements OnInit {
    @Input() aiPrompt: AIPromptEntity | null = null;
    
    public _isVisible: boolean = false;
    @Input() 
    get isVisible(): boolean {
        return this._isVisible;
    }
    set isVisible(value: boolean) {
        const wasVisible = this._isVisible;
        this._isVisible = value;
        
        // Reset dialog state when opening
        if (value && !wasVisible) {
            this.resetDialogState();
        }
    }
    
    @Output() isVisibleChange = new EventEmitter<boolean>();
    @Output() onClose = new EventEmitter<void>();

    public dataContext: string = '';
    public executionOptions: AIPromptExecutionOptions = {};
    public availableModels: AIModelEntityExtended[] = [];
    public availableVendors: AIVendorEntity[] = [];
    public isLoading = false;
    public isRunning = false;
    public executionResult: AIPromptRunResult | null = null;
    
    // UI State
    public optionsExpanded = false;
    public resultsExpanded = true;

    constructor() {}

    ngOnInit() {}

    /**
     * Resets the dialog to initial state
     */
    private resetDialogState() {
        this.dataContext = '';
        this.executionResult = null;
        this.executionOptions = {};
        
        if (this.aiPrompt?.ID) {
            this.loadDialogData();
        }
    }

    /**
     * Loads available models for the execution dialog
     */
    private async loadDialogData() {
        this.isLoading = true;
        try {
            await this.loadAvailableModels();
            await this.loadAvailableVendors();

            // Set default execution options based on AI Prompt configuration
            this.executionOptions = {
                parallelizationMode: this.aiPrompt?.ParallelizationMode || 'None',
                skipValidation: false
            };

        } catch (error) {
            console.error('Error loading dialog data:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading prompt data',
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }


    /**
     * Loads available AI models for the prompt
     */
    private async loadAvailableModels() {
        try {
            const rv = new RunView();
            const result = await rv.RunView<AIModelEntityExtended>({
                EntityName: 'AI Models',
                ExtraFilter: `IsActive=1`,
                OrderBy: 'PowerRank DESC, Name ASC',
                ResultType: 'entity_object'
            });

            this.availableModels = result.Results || [];

        } catch (error) {
            console.error('Error loading AI models:', error);
            throw error;
        }
    }

    /**
     * Loads available AI vendors for the prompt
     */
    private async loadAvailableVendors() {
        try {
            const rv = new RunView();
            const result = await rv.RunView<AIVendorEntity>({
                EntityName: 'AI Vendors',
                ExtraFilter: `IsActive=1`,
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });

            this.availableVendors = result.Results || [];

        } catch (error) {
            console.error('Error loading AI vendors:', error);
            throw error;
        }
    }


    /**
     * Executes the AI prompt
     */
    async runAIPrompt() {
        if (!this.aiPrompt?.ID) return;

        // Validate data context
        if (!this.dataContext?.trim()) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please provide data context for the AI prompt to process.',
                'warning'
            );
            return;
        }

        this.isRunning = true;
        this.executionResult = null;

        try {
            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;
            
            // Execute the RunAIPrompt GraphQL mutation
            const query = `
                mutation RunAIPrompt($promptId: String!, $data: String, $modelId: String, $vendorId: String, $configurationId: String, $skipValidation: Boolean, $templateData: String) {
                    RunAIPrompt(promptId: $promptId, data: $data, modelId: $modelId, vendorId: $vendorId, configurationId: $configurationId, skipValidation: $skipValidation, templateData: $templateData) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        tokensUsed
                        promptRunId
                        rawResult
                        validationResult
                    }
                }
            `;

            const variables = {
                promptId: this.aiPrompt.ID,
                data: this.dataContext,
                modelId: this.executionOptions.modelId,
                vendorId: this.executionOptions.vendorId,
                configurationId: this.executionOptions.configurationId,
                skipValidation: this.executionOptions.skipValidation,
                templateData: null // Could be extended for additional template context
            };

            const result = await dataProvider.ExecuteGQL(query, variables);
            
            if (result?.RunAIPrompt) {
                this.executionResult = result.RunAIPrompt;
                
                if (this.executionResult?.success) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `AI Prompt executed successfully in ${this.executionResult.executionTimeMs}ms`,
                        'success'
                    );
                }
            } else {
                throw new Error('No result returned from AI prompt execution');
            }

        } catch (error) {
            console.error('AI Prompt execution error:', error);
            this.executionResult = {
                success: false,
                error: (error as Error).message || 'Unknown error occurred'
            };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Saves execution results to file
     */
    saveResults() {
        if (!this.executionResult) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `ai-prompt-result-${this.aiPrompt?.Name?.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.json`;
        
        const resultData = {
            aiPrompt: {
                id: this.aiPrompt?.ID,
                name: this.aiPrompt?.Name,
                parallelizationMode: this.aiPrompt?.ParallelizationMode
            },
            executionOptions: this.executionOptions,
            dataContext: this.dataContext,
            result: this.executionResult,
            timestamp: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * Closes the dialog
     */
    close() {
        this._isVisible = false;
        this.isVisibleChange.emit(false);
        this.onClose.emit();
    }
}