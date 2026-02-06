import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { TemplateEntity, TemplateParamEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export interface ParameterPair {
    key: string;
    value: string;
    isFromTemplate: boolean;
    description?: string;
    isRequired?: boolean;
    type?: string;
}

export interface TemplateRunResult {
    success: boolean;
    output?: string;
    error?: string;
    executionTimeMs?: number;
}

@Component({
  standalone: false,
    selector: 'mj-template-param-dialog',
    templateUrl: './template-param-dialog.component.html',
    styleUrls: ['./template-param-dialog.component.css']
})
export class TemplateParamDialogComponent implements OnInit {
    @Input() template: TemplateEntity | null = null;
    
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

    public parameters: ParameterPair[] = [];
    public isLoading = false;
    public isRunning = false;
    public testResult: TemplateRunResult | null = null;
    public hasUnsavedParameters = false;
    public parametersExpanded = true;
    public jsonPreviewExpanded = false;
    public resultsExpanded = true;

    private originalTemplateParams: TemplateParamEntity[] = [];

    ngOnInit() {
        if (this.template) {
            this.loadTemplateParams();
        }
    }

    async loadTemplateParams() {
        if (!this.template?.ID) return;

        this.isLoading = true;
        try {
            const rv = new RunView();
            const results = await rv.RunView<TemplateParamEntity>({
                EntityName: 'Template Params',
                ExtraFilter: `TemplateID='${this.template.ID}'`,
                OrderBy: 'Name ASC' 
            });

            this.originalTemplateParams = results.Results;
            
            // Convert template params to parameter pairs
            this.parameters = this.originalTemplateParams.map(param => ({
                key: param.Name,
                value: param.DefaultValue || '',
                isFromTemplate: true,
                description: param.Description || undefined,
                isRequired: param.IsRequired,
                type: param.Type
            }));

            // If no template params, add one empty pair to start
            if (this.parameters.length === 0) {
                this.addParameter();
            }

        } catch (error) {
            console.error('Error loading template params:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error loading template parameters',
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    addParameter() {
        this.parameters.push({
            key: '',
            value: '',
            isFromTemplate: false
        });
    }

    removeParameter(index: number) {
        if (this.parameters.length > 1) {
            this.parameters.splice(index, 1);
        }
    }

    onParameterChange() {
        // Check if we have new parameters not in template
        this.hasUnsavedParameters = this.parameters.some(param => 
            param.key && 
            !param.isFromTemplate && 
            !this.originalTemplateParams.find(tp => tp.Name === param.key)
        );
    }

    async runTemplate() {
        if (!this.template?.ID) return;

        // Validate parameter names - check for empty parameter names
        const emptyNameParams = this.parameters.filter(p => p.value && !p.key);
        if (emptyNameParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'All parameters must have a name. Please enter parameter names or remove empty parameters.',
                'warning'
            );
            return;
        }

        // Validate required parameters
        const invalidParams = this.parameters.filter(p => p.key && !p.value && p.isRequired);
        if (invalidParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Required parameters missing: ${invalidParams.map(p => p.key).join(', ')}`,
                'warning'
            );
            return;
        }

        this.isRunning = true;
        this.testResult = null;

        try {
            // Build context data object from parameters
            const contextData: any = {};
            this.parameters.forEach(param => {
                if (param.key && param.value) {
                    try {
                        // Try to parse as JSON first, fallback to string
                        contextData[param.key] = JSON.parse(param.value);
                    } catch {
                        contextData[param.key] = param.value;
                    }
                }
            });

            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;
            
            // Execute the RunTemplate GraphQL mutation
            const query = `
                mutation RunTemplate($templateId: String!, $contextData: String) {
                    RunTemplate(templateId: $templateId, contextData: $contextData) {
                        success
                        output
                        error
                        executionTimeMs
                    }
                }
            `;

            const variables = {
                templateId: this.template.ID,
                contextData: JSON.stringify(contextData)
            };

            const result = await dataProvider.ExecuteGQL(query, variables);
            
            if (result?.RunTemplate) {
                this.testResult = result.RunTemplate;
                
                // Collapse parameters and expand results after execution
                this.parametersExpanded = false;
                this.resultsExpanded = true;
                
                if (this.testResult?.success) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Template executed successfully in ${this.testResult.executionTimeMs || 0}ms`,
                        'success',
                        4000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Template execution failed: ${this.testResult?.error || 'Unknown error'}`,
                        'error',
                        5000
                    );
                }
            } else {
                throw new Error(result.errors?.[0]?.message || 'Unknown GraphQL error');
            }

        } catch (error) {
            console.error('Template test error:', error);
            this.testResult = {
                success: false,
                error: (error as Error).message || 'Unknown error occurred'
            };
            
            // Still collapse parameters and expand results on error
            this.parametersExpanded = false;
            this.resultsExpanded = true;
            
            MJNotificationService.Instance.CreateSimpleNotification(
                `Template test failed: ${this.testResult?.error || 'Unknown error'}`,
                'error',
                5000
            );
        } finally {
            this.isRunning = false;
        }
    }

    async updateTemplateParams() {
        if (!this.template?.ID || !this.hasUnsavedParameters) return;

        const newParams = this.parameters.filter(param => 
            param.key && 
            !param.isFromTemplate && 
            !this.originalTemplateParams.find(tp => tp.Name === param.key)
        );

        if (newParams.length === 0) return;

        try {
            const md = new Metadata();
            
            for (const param of newParams) {
                const templateParam = await md.GetEntityObject<TemplateParamEntity>('Template Params');
                templateParam.TemplateID = this.template.ID;
                templateParam.Name = param.key;
                templateParam.Description = param.description || null;
                templateParam.Type = 'Scalar'; // Default type
                templateParam.DefaultValue = param.value || null;
                templateParam.IsRequired = param.isRequired || false;
                
                const saved = await templateParam.Save();
                if (!saved) {
                    throw new Error(`Failed to save parameter: ${param.key}`);
                }
            }

            MJNotificationService.Instance.CreateSimpleNotification(
                `Added ${newParams.length} new parameter(s) to template`,
                'success'
            );

            this.hasUnsavedParameters = false;
            
            // Reload template params to sync
            await this.loadTemplateParams();

        } catch (error) {
            console.error('Error updating template params:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving template parameters',
                'error'
            );
        }
    }

    close() {
        this._isVisible = false;
        this.isVisibleChange.emit(false);
        this.onClose.emit();
    }

    private resetDialogState() {
        // Reset expansion states for a clean testing experience
        this.parametersExpanded = true;     // Show params by default
        this.jsonPreviewExpanded = false;   // Hide JSON (developer-focused)
        this.resultsExpanded = true;        // Show results when they exist
        
        // Clear previous test results
        this.testResult = null;
        this.isRunning = false;
        
        // Reset unsaved parameters flag
        this.hasUnsavedParameters = false;
    }

    saveResults() {
        if (!this.testResult) return;

        const content = this.testResult.success 
            ? this.testResult.output || 'No output'
            : this.testResult.error || 'No error details';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const templateName = this.template?.Name?.replace(/[^a-zA-Z0-9]/g, '_') || 'template';
        const status = this.testResult.success ? 'success' : 'error';
        const filename = `${templateName}_${status}_${timestamp}.txt`;

        // Create blob and download
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        MJNotificationService.Instance.CreateSimpleNotification(
            `Results saved as ${filename}`,
            'success'
        );
    }

    get parametersAsJson(): string {
        const contextData: any = {};
        this.parameters.forEach(param => {
            if (param.key && param.value) {
                try {
                    contextData[param.key] = JSON.parse(param.value);
                } catch {
                    contextData[param.key] = param.value;
                }
            }
        });
        return JSON.stringify(contextData, null, 2);
    }
}