import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

interface ActionParamValue {
    param: ActionParamEntity;
    value: any;
    error?: string;
}

interface ActionResult {
    Success: boolean;
    Message?: string;
    ResultCode?: string;
    ResultData?: any;
}

@Component({
    selector: 'mj-action-test-harness',
    templateUrl: './action-test-harness.component.html',
    styleUrls: ['./action-test-harness.component.css']
})
export class ActionTestHarnessComponent implements OnInit {
    @Input() action!: ActionEntity;
    @Input() actionParams: ActionParamEntity[] = [];
    @Input() isVisible: boolean = false;
    @Output() visibilityChange = new EventEmitter<boolean>();

    public paramValues: ActionParamValue[] = [];
    public isExecuting = false;
    public executionResult: ActionResult | null = null;
    public executionError: string | null = null;
    public executionTime: number = 0;
    public showRawResult = false;
    public skipActionLog = false;

    constructor(
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit() {
        this.initializeParamValues();
    }

    private initializeParamValues() {
        // Initialize parameter values with defaults
        this.paramValues = this.actionParams
            .filter(p => {
                const type = p.Type?.trim().toLowerCase();
                return type === 'input' || type === 'both';
            })
            .sort((a, b) => {
                // Sort required params first, then by name
                if (a.IsRequired !== b.IsRequired) {
                    return a.IsRequired ? -1 : 1;
                }
                return a.Name.localeCompare(b.Name);
            })
            .map(param => ({
                param,
                value: this.getDefaultValue(param)
            }));
    }

    private getDefaultValue(param: ActionParamEntity): any {
        if (param.DefaultValue) {
            return this.parseDefaultValue(param.DefaultValue, param.ValueType);
        }
        
        // Return appropriate empty value based on type
        if (param.IsArray) {
            return [];
        }
        
        switch (param.ValueType) {
            case 'Scalar':
                return null;
            case 'Simple Object':
                return {};
            case 'BaseEntity Sub-Class':
                return null;
            default:
                return null;
        }
    }

    private parseDefaultValue(defaultValue: string, valueType: string): any {
        try {
            // Try to parse as JSON first
            return JSON.parse(defaultValue);
        } catch {
            // If not JSON, return as string for scalar types
            if (valueType === 'Scalar') {
                return defaultValue;
            }
            return defaultValue;
        }
    }

    public getInputType(param: ActionParamEntity): string {
        if (param.IsArray || param.ValueType === 'Simple Object' || param.ValueType === 'BaseEntity Sub-Class') {
            return 'textarea';
        }
        
        // Try to infer from default value or name
        const value = param.DefaultValue?.toLowerCase() || param.Name.toLowerCase();
        if (value.includes('date') || value.includes('time')) {
            return 'datetime-local';
        }
        if (value === 'true' || value === 'false') {
            return 'checkbox';
        }
        if (!isNaN(Number(value))) {
            return 'number';
        }
        
        return 'text';
    }

    public onParamValueChange(paramValue: ActionParamValue, event: any) {
        const inputType = this.getInputType(paramValue.param);
        
        if (inputType === 'checkbox') {
            paramValue.value = event.target.checked;
        } else if (inputType === 'number') {
            paramValue.value = event.target.valueAsNumber;
        } else if (inputType === 'textarea') {
            // For complex types, try to parse as JSON
            try {
                paramValue.value = JSON.parse(event.target.value);
                paramValue.error = undefined;
            } catch (e) {
                // If not valid JSON, keep as string
                paramValue.value = event.target.value;
                if (paramValue.param.ValueType !== 'Scalar') {
                    paramValue.error = 'Invalid JSON format';
                }
            }
        } else {
            paramValue.value = event.target.value;
        }
    }

    public getParamDisplayValue(paramValue: ActionParamValue): string {
        if (paramValue.value === null || paramValue.value === undefined) {
            return '';
        }
        
        if (typeof paramValue.value === 'object') {
            return JSON.stringify(paramValue.value, null, 2);
        }
        
        return String(paramValue.value);
    }

    public validateParams(): boolean {
        let isValid = true;
        
        for (const paramValue of this.paramValues) {
            // Check required fields
            if (paramValue.param.IsRequired) {
                if (paramValue.value === null || paramValue.value === undefined || 
                    (typeof paramValue.value === 'string' && paramValue.value.trim() === '') ||
                    (Array.isArray(paramValue.value) && paramValue.value.length === 0)) {
                    paramValue.error = 'This field is required';
                    isValid = false;
                }
            }
            
            // Check for JSON parse errors
            if (paramValue.error) {
                isValid = false;
            }
        }
        
        return isValid;
    }

    public async executeAction() {
        if (!this.validateParams()) {
            return;
        }
        
        this.isExecuting = true;
        this.executionResult = null;
        this.executionError = null;
        
        const startTime = Date.now();
        
        try {
            // Build parameters object
            const params: any = {};
            for (const paramValue of this.paramValues) {
                params[paramValue.param.Name] = paramValue.value;
            }
            
            // Execute the action using GraphQL
            const query = `
                mutation RunAction($input: RunActionInput!) {
                    RunAction(input: $input) {
                        Success
                        Message
                        ResultCode
                        ResultData
                    }
                }
            `;
            
            // Get GraphQL data provider from Metadata
            const graphQLProvider = Metadata.Provider as GraphQLDataProvider;
            
            // Convert params to ActionParamInput array format
            const actionParams = this.paramValues.map(paramValue => ({
                Name: paramValue.param.Name,
                Value: typeof paramValue.value === 'object' 
                    ? JSON.stringify(paramValue.value) 
                    : String(paramValue.value),
                Type: paramValue.param.ValueType
            }));
            
            const variables = {
                input: {
                    ActionID: this.action.ID,
                    Params: actionParams,
                    SkipActionLog: this.skipActionLog
                }
            };
            
            const result = await graphQLProvider.ExecuteGQL(query, variables);
            
            this.executionTime = Date.now() - startTime;
            
            if (result?.RunAction) {
                this.executionResult = result.RunAction;
            } else {
                throw new Error('No result returned from action execution');
            }
            
        } catch (error: any) {
            this.executionTime = Date.now() - startTime;
            this.executionError = error.message || 'An unknown error occurred';
            console.error('Action execution error:', error);
        } finally {
            this.isExecuting = false;
            this.cdr.detectChanges();
        }
    }

    public clearResults() {
        this.executionResult = null;
        this.executionError = null;
        this.executionTime = 0;
    }

    public resetParams() {
        this.initializeParamValues();
        this.clearResults();
    }

    public copyResultToClipboard() {
        if (!this.executionResult) return;
        
        const resultText = JSON.stringify(this.executionResult, null, 2);
        navigator.clipboard.writeText(resultText).then(() => {
            // Could add a notification here
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    public getResultIcon(): string {
        if (!this.executionResult) return '';
        return this.executionResult.Success ? 'fa-check-circle' : 'fa-times-circle';
    }

    public getResultColor(): string {
        if (!this.executionResult) return '';
        return this.executionResult.Success ? '#28a745' : '#dc3545';
    }

    public getOutputParams(): ActionParamEntity[] {
        return this.actionParams.filter(p => p.Type === 'Output' || p.Type === 'Both');
    }

    public formatResultData(data: any): string {
        if (data === null || data === undefined) return 'null';
        if (typeof data === 'object') {
            return JSON.stringify(data, null, 2);
        }
        return String(data);
    }
}