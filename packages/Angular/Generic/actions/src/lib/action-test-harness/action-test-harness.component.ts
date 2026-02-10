import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { ActionEntity, ActionParamEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

// Setting key prefix for action run input caching
const ACTION_INPUT_CACHE_PREFIX = '__ACTION_DASHBOARD__action-run-inputs/';

export interface ActionParamValue {
    Param: ActionParamEntity;
    Value: unknown;
    Error?: string;
}

export interface ActionResult {
    Success: boolean;
    Message?: string;
    ResultCode?: string;
    ResultData?: unknown;
}

@Component({
  standalone: false,
    selector: 'mj-action-test-harness',
    templateUrl: './action-test-harness.component.html',
    styleUrls: ['./action-test-harness.component.css']
})
export class ActionTestHarnessComponent implements OnInit {
    @ViewChild('resultsSection') ResultsSectionRef!: ElementRef<HTMLDivElement>;

    // Private backing fields
    private _action!: ActionEntity;
    private _actionParams: ActionParamEntity[] = [];
    private _isVisible = false;

    // Input properties with getter/setters
    @Input()
    set Action(value: ActionEntity) {
        this._action = value;
        if (value && this._actionParams.length > 0) {
            this.initializeParamValues();
        }
    }
    get Action(): ActionEntity {
        return this._action;
    }

    @Input()
    set ActionParams(value: ActionParamEntity[]) {
        this._actionParams = value || [];
        if (this._action && value) {
            this.initializeParamValues();
        }
    }
    get ActionParams(): ActionParamEntity[] {
        return this._actionParams;
    }

    @Input()
    set IsVisible(value: boolean) {
        this._isVisible = value;
    }
    get IsVisible(): boolean {
        return this._isVisible;
    }

    @Output() VisibilityChange = new EventEmitter<boolean>();
    @Output() ExecutionComplete = new EventEmitter<ActionResult>();

    // Public state properties
    public ParamValues: ActionParamValue[] = [];
    public IsExecuting = false;
    public ExecutionResult: ActionResult | null = null;
    public ExecutionError: string | null = null;
    public ExecutionTime = 0;
    public ShowRawResult = false;
    public SkipActionLog = false;
    public InputsCollapsed = false;

    constructor(
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this.initializeParamValues();
    }

    private initializeParamValues(): void {
        // Initialize parameter values with defaults
        this.ParamValues = this._actionParams
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
                Param: param,
                Value: this.getDefaultValue(param)
            }));

        // Load cached values for this action
        this.loadCachedInputs();
    }

    /**
     * Load cached input values from UserInfoEngine
     */
    private loadCachedInputs(): void {
        if (!this._action?.ID) return;

        try {
            const cacheKey = `${ACTION_INPUT_CACHE_PREFIX}${this._action.ID}`;
            const cachedJson = UserInfoEngine.Instance.GetSetting(cacheKey);

            if (cachedJson) {
                const cachedValues = JSON.parse(cachedJson) as Record<string, unknown>;

                // Apply cached values to matching parameters
                for (const paramValue of this.ParamValues) {
                    const paramName = paramValue.Param.Name;
                    if (paramName in cachedValues) {
                        paramValue.Value = cachedValues[paramName];
                    }
                }
            }
        } catch (error) {
            // Silently ignore cache load errors - just use defaults
            console.warn('Action Test Harness: Failed to load cached inputs', error);
        }
    }

    /**
     * Save current input values to cache using debounced setting
     */
    private saveCachedInputs(): void {
        if (!this._action?.ID) return;

        try {
            const cacheKey = `${ACTION_INPUT_CACHE_PREFIX}${this._action.ID}`;
            const values: Record<string, unknown> = {};

            for (const paramValue of this.ParamValues) {
                values[paramValue.Param.Name] = paramValue.Value;
            }

            // Use debounced setting to avoid excessive saves during rapid typing
            UserInfoEngine.Instance.SetSettingDebounced(cacheKey, JSON.stringify(values));
        } catch (error) {
            // Silently ignore cache save errors
            console.warn('Action Test Harness: Failed to save cached inputs', error);
        }
    }

    private getDefaultValue(param: ActionParamEntity): unknown {
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

    private parseDefaultValue(defaultValue: string, valueType: string): unknown {
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

    public GetInputType(param: ActionParamEntity): string {
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

    public OnParamValueChange(paramValue: ActionParamValue, event: Event): void {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const inputType = this.GetInputType(paramValue.Param);

        if (inputType === 'checkbox') {
            paramValue.Value = (target as HTMLInputElement).checked;
        } else if (inputType === 'number') {
            paramValue.Value = (target as HTMLInputElement).valueAsNumber;
        } else if (inputType === 'textarea') {
            // For complex types, try to parse as JSON
            try {
                paramValue.Value = JSON.parse(target.value);
                paramValue.Error = undefined;
            } catch {
                // If not valid JSON, keep as string
                paramValue.Value = target.value;
                if (paramValue.Param.ValueType !== 'Scalar') {
                    paramValue.Error = 'Invalid JSON format';
                }
            }
        } else {
            paramValue.Value = target.value;
        }

        // Cache the inputs for this action (debounced)
        this.saveCachedInputs();
    }

    public GetParamDisplayValue(paramValue: ActionParamValue): string {
        if (paramValue.Value === null || paramValue.Value === undefined) {
            return '';
        }

        if (typeof paramValue.Value === 'object') {
            return JSON.stringify(paramValue.Value, null, 2);
        }

        return String(paramValue.Value);
    }

    public ValidateParams(): boolean {
        let isValid = true;

        for (const paramValue of this.ParamValues) {
            // Check required fields
            if (paramValue.Param.IsRequired) {
                if (paramValue.Value === null || paramValue.Value === undefined ||
                    (typeof paramValue.Value === 'string' && paramValue.Value.trim() === '') ||
                    (Array.isArray(paramValue.Value) && paramValue.Value.length === 0)) {
                    paramValue.Error = 'This field is required';
                    isValid = false;
                }
            }

            // Check for JSON parse errors
            if (paramValue.Error) {
                isValid = false;
            }
        }

        return isValid;
    }

    public async ExecuteAction(): Promise<void> {
        if (!this.ValidateParams()) {
            return;
        }

        this.IsExecuting = true;
        this.ExecutionResult = null;
        this.ExecutionError = null;

        const startTime = Date.now();

        try {
            // Build parameters object
            const params: Record<string, unknown> = {};
            for (const paramValue of this.ParamValues) {
                params[paramValue.Param.Name] = paramValue.Value;
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
            const actionParams = this.ParamValues.map(paramValue => {
                // Determine the actual data type for the Type field
                let dataType = 'string'; // default

                if (paramValue.Param.ValueType === 'Scalar') {
                    // For scalar, check the actual value type
                    if (typeof paramValue.Value === 'boolean') {
                        dataType = 'boolean';
                    } else if (typeof paramValue.Value === 'number') {
                        dataType = 'number';
                    } else {
                        dataType = 'string';
                    }
                } else if (paramValue.Param.ValueType === 'Simple Object') {
                    dataType = 'object';
                } else if (paramValue.Param.IsArray) {
                    dataType = 'array';
                }

                return {
                    Name: paramValue.Param.Name,
                    Value: paramValue.Value === null || paramValue.Value === undefined
                        ? null
                        : typeof paramValue.Value === 'object'
                            ? JSON.stringify(paramValue.Value)
                            : String(paramValue.Value),
                    Type: dataType
                };
            });

            const variables = {
                input: {
                    ActionID: this._action.ID,
                    Params: actionParams,
                    SkipActionLog: this.SkipActionLog
                }
            };

            let result;
            try {
                result = await graphQLProvider.ExecuteGQL(query, variables);
            } catch (gqlError: unknown) {
                const error = gqlError as { message?: string; networkError?: unknown; graphQLErrors?: unknown };
                console.error('Action Test Harness: GraphQL execution failed', {
                    error: gqlError,
                    message: error?.message,
                    networkError: error?.networkError,
                    graphQLErrors: error?.graphQLErrors
                });
                throw gqlError;
            }

            this.ExecutionTime = Date.now() - startTime;

            if (result?.RunAction) {
                this.ExecutionResult = result.RunAction;

                // If result is false/failed, it might still have an error in the data
                if (!this.ExecutionResult?.Success && this.ExecutionResult?.Message) {
                    console.warn('Action Test Harness: Action failed with message', this.ExecutionResult.Message);
                }

                // Emit the execution complete event
                if (this.ExecutionResult) {
                    this.ExecutionComplete.emit(this.ExecutionResult);
                }
            } else {
                console.error('Action Test Harness: No RunAction in result', {
                    result,
                    resultType: typeof result,
                    resultStringified: JSON.stringify(result)
                });
                throw new Error('No result returned from action execution');
            }

        } catch (error: unknown) {
            this.ExecutionTime = Date.now() - startTime;
            const err = error as { message?: string; stack?: string; constructor?: { name?: string } };
            this.ExecutionError = err.message || 'An unknown error occurred';
            console.error('Action Test Harness: Caught error during action execution', {
                error: error,
                message: err?.message,
                stack: err?.stack,
                type: err?.constructor?.name
            });
        } finally {
            this.IsExecuting = false;

            // Auto-collapse inputs and scroll to results
            this.InputsCollapsed = true;
            this.cdr.detectChanges();

            // Scroll to results section after a small delay to allow DOM update
            setTimeout(() => {
                this.ScrollToResults();
            }, 100);
        }
    }

    private ScrollToResults(): void {
        if (this.ResultsSectionRef?.nativeElement) {
            this.ResultsSectionRef.nativeElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    public ToggleInputsCollapsed(): void {
        this.InputsCollapsed = !this.InputsCollapsed;
    }

    public ClearResults(): void {
        this.ExecutionResult = null;
        this.ExecutionError = null;
        this.ExecutionTime = 0;
    }

    public ResetParams(): void {
        this.initializeParamValues();
        this.ClearResults();
    }

    public CopyResultToClipboard(): void {
        if (!this.ExecutionResult) return;

        const resultText = JSON.stringify(this.ExecutionResult, null, 2);
        navigator.clipboard.writeText(resultText).catch(() => {
            // Failed to copy to clipboard
        });
    }

    public CopyResultDataToClipboard(): void {
        if (!this.ExecutionResult?.ResultData) return;

        const resultDataText = this.FormatResultData(this.ExecutionResult.ResultData);
        navigator.clipboard.writeText(resultDataText).catch(() => {
            // Failed to copy to clipboard
        });
    }

    public GetResultIcon(): string {
        if (!this.ExecutionResult) return '';
        return this.ExecutionResult.Success ? 'fa-check-circle' : 'fa-times-circle';
    }

    public GetResultColor(): string {
        if (!this.ExecutionResult) return '';
        return this.ExecutionResult.Success ? '#28a745' : '#dc3545';
    }

    public GetOutputParams(): ActionParamEntity[] {
        return this._actionParams.filter(p => p.Type === 'Output' || p.Type === 'Both');
    }

    public GetOutputParamValue(paramName: string): string {
        if (!this.ExecutionResult?.ResultData) return 'null';
        const data = this.ExecutionResult.ResultData as Record<string, unknown>;
        return this.FormatResultData(data[paramName]);
    }

    public FormatResultData(data: unknown): string {
        if (data === null || data === undefined) return 'null';
        if (typeof data === 'object') {
            return JSON.stringify(data, null, 2);
        }
        return String(data);
    }
}