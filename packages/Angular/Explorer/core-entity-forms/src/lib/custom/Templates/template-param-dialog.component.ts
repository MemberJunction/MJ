import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { MJTemplateEntity, MJTemplateParamEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { TemplateRunOperation } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class TemplateParamDialogComponent extends BaseAngularComponent implements OnInit {
    @Input() Template: MJTemplateEntity | null = null;

    /** @deprecated Use {@link Template}. */
    @Input() set template(value: MJTemplateEntity | null) {
      this.Template = value;
    }
    /** @deprecated Use {@link Template}. */
    get template(): MJTemplateEntity | null {
      return this.Template;
    }
    
    public IsVisible: boolean = false;

    /** @deprecated Use {@link IsVisible}. */
    public get _isVisible(): boolean {
      return this.IsVisible;
    }
    /** @deprecated Use {@link IsVisible}. */
    public set _isVisible(value: boolean) {
      this.IsVisible = value;
    }
    @Input() 
    get isVisible(): boolean {  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
        return this.IsVisible;
    }
    set isVisible(value: boolean) {  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
        const wasVisible = this.IsVisible;
        this.IsVisible = value;
        
        // Reset dialog state when opening
        if (value && !wasVisible) {
            this.resetDialogState();
        }
    }
    
    @Output() IsVisibleChange = new EventEmitter<boolean>();

    /**
     * @deprecated Use {@link IsVisibleChange}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (isVisibleChange) keeps working. Must stay AFTER IsVisibleChange: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() isVisibleChange = this.IsVisibleChange;
    @Output() OnClose = new EventEmitter<void>();

    /**
     * @deprecated Use {@link OnClose}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (onClose) keeps working. Must stay AFTER OnClose: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() onClose = this.OnClose;

    public parameters: ParameterPair[] = [];
    public isLoading = false;
    public IsRunning = false;

    /** @deprecated Use {@link IsRunning}. */
    public get isRunning() {
      return this.IsRunning;
    }
    /** @deprecated Use {@link IsRunning}. */
    public set isRunning(value) {
      this.IsRunning = value;
    }
    public TestResult: TemplateRunResult | null = null;

    /** @deprecated Use {@link TestResult}. */
    public get testResult(): TemplateRunResult | null {
      return this.TestResult;
    }
    /** @deprecated Use {@link TestResult}. */
    public set testResult(value: TemplateRunResult | null) {
      this.TestResult = value;
    }
    public HasUnsavedParameters = false;

    /** @deprecated Use {@link HasUnsavedParameters}. */
    public get hasUnsavedParameters() {
      return this.HasUnsavedParameters;
    }
    /** @deprecated Use {@link HasUnsavedParameters}. */
    public set hasUnsavedParameters(value) {
      this.HasUnsavedParameters = value;
    }
    public ParametersExpanded = true;

    /** @deprecated Use {@link ParametersExpanded}. */
    public get parametersExpanded() {
      return this.ParametersExpanded;
    }
    /** @deprecated Use {@link ParametersExpanded}. */
    public set parametersExpanded(value) {
      this.ParametersExpanded = value;
    }
    public JsonPreviewExpanded = false;

    /** @deprecated Use {@link JsonPreviewExpanded}. */
    public get jsonPreviewExpanded() {
      return this.JsonPreviewExpanded;
    }
    /** @deprecated Use {@link JsonPreviewExpanded}. */
    public set jsonPreviewExpanded(value) {
      this.JsonPreviewExpanded = value;
    }
    public ResultsExpanded = true;

    /** @deprecated Use {@link ResultsExpanded}. */
    public get resultsExpanded() {
      return this.ResultsExpanded;
    }
    /** @deprecated Use {@link ResultsExpanded}. */
    public set resultsExpanded(value) {
      this.ResultsExpanded = value;
    }

    private originalTemplateParams: MJTemplateParamEntity[] = [];

    ngOnInit() {
        if (this.Template) {
            this.LoadTemplateParams();
        }
    }

    async LoadTemplateParams() {
        if (!this.Template?.ID) return;

        this.isLoading = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const results = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID='${this.Template.ID}'`,
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
                this.AddParameter();
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

    /** @deprecated Use {@link LoadTemplateParams}. */
    async loadTemplateParams() {
      return this.LoadTemplateParams();
    }

    AddParameter() {
        this.parameters.push({
            key: '',
            value: '',
            isFromTemplate: false
        });
    }

    /** @deprecated Use {@link AddParameter}. */
    addParameter() {
      return this.AddParameter();
    }

    RemoveParameter(index: number) {
        if (this.parameters.length > 1) {
            this.parameters.splice(index, 1);
        }
    }

    /** @deprecated Use {@link RemoveParameter}. */
    removeParameter(index: number) {
      return this.RemoveParameter(index);
    }

    OnParameterChange() {
        // Check if we have new parameters not in template
        this.HasUnsavedParameters = this.parameters.some(param => 
            param.key && 
            !param.isFromTemplate && 
            !this.originalTemplateParams.find(tp => tp.Name === param.key)
        );
    }

    /** @deprecated Use {@link OnParameterChange}. */
    onParameterChange() {
      return this.OnParameterChange();
    }

    async RunTemplate() {
        if (!this.Template?.ID) return;

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

        this.IsRunning = true;
        this.TestResult = null;

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

            // Run the template via the Template.Run Remote Operation (provider-scoped; routes over the
            // generic ExecuteRemoteOperation transport — no bespoke GraphQL client).
            const opResult = await new TemplateRunOperation().Execute(
                { templateID: this.Template.ID, data: contextData },
                { provider: this.ProviderToUse },
            );

            {
                this.TestResult = {
                    success: opResult.Success,
                    output: opResult.Output?.output,
                    error: opResult.ErrorMessage,
                    executionTimeMs: opResult.Output?.executionTimeMs,
                };

                // Collapse parameters and expand results after execution
                this.ParametersExpanded = false;
                this.ResultsExpanded = true;
                
                if (this.TestResult?.success) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Template executed successfully in ${this.TestResult.executionTimeMs || 0}ms`,
                        'success',
                        4000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Template execution failed: ${this.TestResult?.error || 'Unknown error'}`,
                        'error',
                        5000
                    );
                }
            }

        } catch (error) {
            console.error('Template test error:', error);
            this.TestResult = {
                success: false,
                error: (error as Error).message || 'Unknown error occurred'
            };
            
            // Still collapse parameters and expand results on error
            this.ParametersExpanded = false;
            this.ResultsExpanded = true;
            
            MJNotificationService.Instance.CreateSimpleNotification(
                `Template test failed: ${this.TestResult?.error || 'Unknown error'}`,
                'error',
                5000
            );
        } finally {
            this.IsRunning = false;
        }
    }

    /** @deprecated Use {@link RunTemplate}. */
    async runTemplate() {
      return this.RunTemplate();
    }

    async UpdateTemplateParams() {
        if (!this.Template?.ID || !this.HasUnsavedParameters) return;

        const newParams = this.parameters.filter(param => 
            param.key && 
            !param.isFromTemplate && 
            !this.originalTemplateParams.find(tp => tp.Name === param.key)
        );

        if (newParams.length === 0) return;

        try {
            const md = this.ProviderToUse;
            
            for (const param of newParams) {
                const templateParam = await md.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params');
                templateParam.TemplateID = this.Template.ID;
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

            this.HasUnsavedParameters = false;
            
            // Reload template params to sync
            await this.LoadTemplateParams();

        } catch (error) {
            console.error('Error updating template params:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving template parameters',
                'error'
            );
        }
    }

    /** @deprecated Use {@link UpdateTemplateParams}. */
    async updateTemplateParams() {
      return this.UpdateTemplateParams();
    }

    close() {
        this.IsVisible = false;
        this.IsVisibleChange.emit(false);
        this.OnClose.emit();
    }

    private resetDialogState() {
        // Reset expansion states for a clean testing experience
        this.ParametersExpanded = true;     // Show params by default
        this.JsonPreviewExpanded = false;   // Hide JSON (developer-focused)
        this.ResultsExpanded = true;        // Show results when they exist
        
        // Clear previous test results
        this.TestResult = null;
        this.IsRunning = false;
        
        // Reset unsaved parameters flag
        this.HasUnsavedParameters = false;
    }

    SaveResults() {
        if (!this.TestResult) return;

        const content = this.TestResult.success 
            ? this.TestResult.output || 'No output'
            : this.TestResult.error || 'No error details';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const templateName = this.Template?.Name?.replace(/[^a-zA-Z0-9]/g, '_') || 'template';
        const status = this.TestResult.success ? 'success' : 'error';
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

    /** @deprecated Use {@link SaveResults}. */
    saveResults() {
      return this.SaveResults();
    }

    get ParametersAsJson(): string {
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

    /** @deprecated Use {@link ParametersAsJson}. */
    get parametersAsJson(): string {
      return this.ParametersAsJson;
    }
}