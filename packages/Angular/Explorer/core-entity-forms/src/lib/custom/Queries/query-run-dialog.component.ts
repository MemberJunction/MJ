import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { QueryEntity, QueryParameterEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export interface QueryParameterPair {
    key: string;
    value: string;
    description?: string;
    isRequired?: boolean;
    type?: string;
    defaultValue?: string;
}

export interface QueryRunResult {
    success: boolean;
    results?: any[];
    rowCount?: number;
    executionTime?: number;
    error?: string;
    appliedParameters?: Record<string, any>;
}

@Component({
    selector: 'mj-query-run-dialog',
    templateUrl: './query-run-dialog.component.html',
    styleUrls: ['./query-run-dialog.component.css']
})
export class QueryRunDialogComponent implements OnInit {
    @Input() query: QueryEntity | null = null;
    @Input() parameters: QueryParameterEntity[] = [];
    
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

    public parameterPairs: QueryParameterPair[] = [];
    public isLoading = false;
    public isRunning = false;
    public runResult: QueryRunResult | null = null;
    public parametersExpanded = true;
    public resultsExpanded = true;
    public gridData: any[] = [];
    public gridColumns: any[] = [];

    ngOnInit() {
        if (this.query && this.parameters) {
            this.initializeParameterPairs();
        }
    }

    initializeParameterPairs() {
        this.parameterPairs = this.parameters.map(param => ({
            key: param.Name,
            value: param.DefaultValue || '',
            description: param.Description || undefined,
            isRequired: param.IsRequired || false,
            type: param.Type,
            defaultValue: param.DefaultValue || undefined
        }));

        // If no parameters, add one empty pair to start
        if (this.parameterPairs.length === 0) {
            this.addParameter();
        }
    }

    addParameter() {
        this.parameterPairs.push({
            key: '',
            value: '',
            isRequired: false,
            type: 'string'
        });
    }

    removeParameter(index: number) {
        if (this.parameterPairs.length > 1) {
            this.parameterPairs.splice(index, 1);
        }
    }

    async runQuery() {
        if (!this.query?.ID) return;

        // Validate parameter names - check for empty parameter names
        const emptyNameParams = this.parameterPairs.filter(p => p.value && !p.key);
        if (emptyNameParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'All parameters must have a name. Please enter parameter names or remove empty parameters.',
                'warning'
            );
            return;
        }

        // Validate required parameters
        const invalidParams = this.parameterPairs.filter(p => p.key && !p.value && p.isRequired);
        if (invalidParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Required parameters missing: ${invalidParams.map(p => p.key).join(', ')}`,
                'warning'
            );
            return;
        }

        this.isRunning = true;
        this.runResult = null;

        try {
            // Build parameters object
            const queryParameters: Record<string, any> = {};
            this.parameterPairs.forEach(param => {
                if (param.key && param.value) {
                    try {
                        // Try to parse as JSON first, fallback to string
                        queryParameters[param.key] = JSON.parse(param.value);
                    } catch {
                        // If JSON parsing fails, treat as string
                        queryParameters[param.key] = param.value;
                    }
                }
            });

            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;
            
            // Execute the GetQueryData GraphQL query
            const query = `
                query GetQueryData($QueryID: String!, $Parameters: JSONObject) {
                    GetQueryData(QueryID: $QueryID, Parameters: $Parameters) {
                        QueryID
                        QueryName
                        Success
                        Results
                        RowCount
                        ExecutionTime
                        ErrorMessage
                        AppliedParameters
                    }
                }
            `;

            const variables = {
                QueryID: this.query.ID,
                Parameters: Object.keys(queryParameters).length > 0 ? queryParameters : null
            };

            const result = await dataProvider.ExecuteGQL(query, variables);
            
            if (result?.GetQueryData) {
                const queryResult = result.GetQueryData;
                
                this.runResult = {
                    success: queryResult.Success,
                    rowCount: queryResult.RowCount,
                    executionTime: queryResult.ExecutionTime,
                    error: queryResult.ErrorMessage,
                    appliedParameters: queryResult.AppliedParameters ? JSON.parse(queryResult.AppliedParameters) : undefined
                };

                if (queryResult.Success) {
                    // Parse results and set up grid
                    const results = JSON.parse(queryResult.Results);
                    this.runResult.results = results;
                    this.setupGrid(results);
                    
                    // Collapse parameters and expand results after execution
                    this.parametersExpanded = false;
                    this.resultsExpanded = true;
                    
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Query executed successfully in ${this.runResult.executionTime || 0}ms. ${this.runResult.rowCount || 0} rows returned.`,
                        'success',
                        4000
                    );
                } else {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Query execution failed: ${this.runResult.error || 'Unknown error'}`,
                        'error',
                        5000
                    );
                }
            } else {
                throw new Error(result.errors?.[0]?.message || 'Unknown GraphQL error');
            }

        } catch (error) {
            console.error('Query execution error:', error);
            this.runResult = {
                success: false,
                error: (error as Error).message || 'Unknown error occurred'
            };
            
            // Still collapse parameters and expand results on error
            this.parametersExpanded = false;
            this.resultsExpanded = true;
            
            MJNotificationService.Instance.CreateSimpleNotification(
                `Query execution failed: ${this.runResult?.error || 'Unknown error'}`,
                'error',
                5000
            );
        } finally {
            this.isRunning = false;
        }
    }

    setupGrid(results: any[]) {
        this.gridData = results;
        
        if (results && results.length > 0) {
            // Create columns based on the first row
            const firstRow = results[0];
            this.gridColumns = Object.keys(firstRow).map(key => ({
                field: key,
                title: this.formatColumnTitle(key),
                width: this.getColumnWidth(key, firstRow[key])
            }));
        } else {
            this.gridColumns = [];
        }
    }

    formatColumnTitle(fieldName: string): string {
        // Convert field names like "CustomerID" to "Customer ID"
        return fieldName.replace(/([A-Z])/g, ' $1').trim();
    }

    getColumnWidth(fieldName: string, sampleValue: any): number {
        // Estimate column width based on field name and sample value
        const fieldNameLength = fieldName.length;
        const valueLength = sampleValue ? String(sampleValue).length : 0;
        const maxLength = Math.max(fieldNameLength, valueLength, 8);
        return Math.min(maxLength * 8 + 40, 300); // Cap at 300px
    }

    exportToCSV() {
        if (!this.gridData || this.gridData.length === 0) return;

        // Create CSV content
        const headers = this.gridColumns.map(col => col.title).join(',');
        const rows = this.gridData.map(row => 
            this.gridColumns.map(col => {
                const value = row[col.field];
                // Handle values that might contain commas or quotes
                if (value && (value.toString().includes(',') || value.toString().includes('"'))) {
                    return `"${value.toString().replace(/"/g, '""')}"`;
                }
                return value || '';
            }).join(',')
        );

        const csvContent = [headers, ...rows].join('\n');

        // Create and download file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const queryName = this.query?.Name?.replace(/[^a-zA-Z0-9]/g, '_') || 'query';
        const filename = `${queryName}_results_${timestamp}.csv`;

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        MJNotificationService.Instance.CreateSimpleNotification(
            `Results exported as ${filename}`,
            'success'
        );
    }

    copyToClipboard() {
        if (!this.gridData || this.gridData.length === 0) return;

        // Create tab-separated content for clipboard
        const headers = this.gridColumns.map(col => col.title).join('\t');
        const rows = this.gridData.map(row => 
            this.gridColumns.map(col => row[col.field] || '').join('\t')
        );

        const clipboardContent = [headers, ...rows].join('\n');

        // Copy to clipboard
        navigator.clipboard.writeText(clipboardContent).then(() => {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Results copied to clipboard',
                'success'
            );
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to copy to clipboard',
                'error'
            );
        });
    }

    close() {
        this._isVisible = false;
        this.isVisibleChange.emit(false);
        this.onClose.emit();
    }

    private resetDialogState() {
        // Reset expansion states
        this.parametersExpanded = true;
        this.resultsExpanded = true;
        
        // Clear previous results
        this.runResult = null;
        this.isRunning = false;
        this.gridData = [];
        this.gridColumns = [];
        
        // Reinitialize parameter pairs
        this.initializeParameterPairs();
    }

    get parametersAsJson(): string {
        const parametersData: Record<string, any> = {};
        this.parameterPairs.forEach(param => {
            if (param.key && param.value) {
                try {
                    parametersData[param.key] = JSON.parse(param.value);
                } catch {
                    parametersData[param.key] = param.value;
                }
            }
        });
        return JSON.stringify(parametersData, null, 2);
    }

    /**
     * Helper method to check if a parameter is defined in the query
     */
    isParameterDefined(paramKey: string): boolean {
        return this.parameters.some(p => p.Name === paramKey);
    }

    /**
     * Helper method to check if a parameter should show remove button
     */
    canRemoveParameter(param: QueryParameterPair): boolean {
        return this.parameterPairs.length > 1 && !this.isParameterDefined(param.key);
    }

    /**
     * Helper method to get the number of applied parameters for template
     */
    getAppliedParametersCount(): number {
        return this.runResult?.appliedParameters ? Object.keys(this.runResult.appliedParameters).length : 0;
    }
}