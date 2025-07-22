import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { QueryEntity, QueryParameterEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Metadata } from '@memberjunction/core';

interface QueryRunResult {
    QueryID: string;
    QueryName: string;
    Success: boolean;
    Results: string;  // This is a JSON string that needs to be parsed
    ErrorMessage: string;
    RowCount: number;
    ExecutionTime: number;
    AppliedParameters?: string;  // JSON string of applied parameters
}

interface ParameterPair {
    name: string;
    value: string;
    type: string;
    defaultValue: string;
    description: string;
    isRequired: boolean;
}

@Component({
    selector: 'mj-query-run-dialog',
    templateUrl: './query-run-dialog.component.html',
    styleUrls: ['./query-run-dialog.component.css']
})
export class QueryRunDialogComponent implements OnInit, OnChanges {
    @Input() query: QueryEntity | null = null;
    @Input() parameters: QueryParameterEntity[] = [];
    @Input() isVisible = false;
    @Output() isVisibleChange = new EventEmitter<boolean>();
    @Output() onClose = new EventEmitter<void>();

    public isRunning = false;
    public isLoadingParams = false;
    public parameterPairs: ParameterPair[] = [];
    public parametersExpanded = true;
    public resultsExpanded = true;
    public runResult: QueryRunResult | null = null;
    public resultColumns: any[] = [];
    public resultRows: any[] = [];
    public selectedRows: any[] = [];

    ngOnInit() {
        this.initializeParameters();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['isVisible'] && changes['isVisible'].currentValue) {
            this.initializeParameters();
        }
        if (changes['parameters']) {
            this.initializeParameters();
        }
    }

    private initializeParameters() {
        if (!this.query || !this.parameters) return;

        // Create parameter pairs from defined query parameters only
        this.parameterPairs = this.parameters.map(param => ({
            name: param.Name,
            value: param.DefaultValue || '',
            type: param.Type || 'string',
            defaultValue: param.DefaultValue || '',
            description: param.Description || '',
            isRequired: param.IsRequired || false
        }));
    }

    getValueListOptions(valueList: string): Array<{text: string, value: string}> {
        if (!valueList) return [];
        
        try {
            const options = valueList.split(',').map(v => v.trim());
            return options.map(opt => ({ text: opt, value: opt }));
        } catch {
            return [];
        }
    }

    isParameterValid(param: ParameterPair): boolean {
        if (param.isRequired && !param.value) {
            return false;
        }
        
        // Additional type-specific validation could go here
        if (param.type === 'number' && param.value) {
            return !isNaN(Number(param.value));
        }
        
        return true;
    }

    async runQuery() {
        if (!this.query?.ID) return;

        // Validate required parameters
        const invalidParams = this.parameterPairs.filter(p => p.isRequired && !p.value);
        if (invalidParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Required parameters missing: ${invalidParams.map(p => p.name).join(', ')}`,
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
                if (param.value) {
                    try {
                        // Try to parse as JSON first, fallback to string
                        queryParameters[param.name] = JSON.parse(param.value);
                    } catch {
                        // If JSON parsing fails, treat as string or number based on type
                        if (param.type === 'number') {
                            queryParameters[param.name] = Number(param.value);
                        } else {
                            queryParameters[param.name] = param.value;
                        }
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
                        ErrorMessage
                        RowCount
                        ExecutionTime
                        AppliedParameters
                    }
                }
            `;

            const variables = {
                QueryID: this.query.ID,
                Parameters: queryParameters
            };

            console.log('Executing query with variables:', variables);
            
            const response = await dataProvider.ExecuteGQL(
                query, 
                variables
            ) as {GetQueryData: QueryRunResult};

            if (response?.GetQueryData) {
                this.runResult = response.GetQueryData;
                
                if (this.runResult.Success && this.runResult.Results) {
                    // Parse the JSON string results
                    try {
                        const parsedResults = JSON.parse(this.runResult.Results);
                        this.processResults(parsedResults);
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Query executed successfully. ${this.runResult.RowCount} rows returned.`,
                            'success'
                        );
                    } catch (error) {
                        console.error('Error parsing results:', error);
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'Failed to parse query results',
                            'error'
                        );
                    }
                } else {
                    console.error('Query execution failed:', this.runResult);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        this.runResult?.ErrorMessage || 'Query execution failed',
                        'error'
                    );
                }
            } else {
                throw new Error('No response from server');
            }
        } catch (error) {
            console.error('Error running query:', error);
            this.runResult = {
                QueryID: this.query.ID,
                QueryName: this.query.Name,
                Success: false,
                Results: '[]',
                ErrorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
                RowCount: 0,
                ExecutionTime: 0
            };
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute query. Please check your parameters and try again.',
                'error'
            );
        } finally {
            this.isRunning = false;
        }
    }

    private processResults(results: any[]) {
        if (!results || results.length === 0) {
            this.resultColumns = [];
            this.resultRows = [];
            return;
        }

        // Extract columns from first row
        const firstRow = results[0];
        this.resultColumns = Object.keys(firstRow).map(key => ({
            field: key,
            title: this.formatColumnTitle(key),
            width: this.calculateColumnWidth(key, results)
        }));

        // Set rows
        this.resultRows = results;
    }

    private formatColumnTitle(field: string): string {
        // Convert camelCase or snake_case to Title Case
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^\s+/, '')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    private calculateColumnWidth(field: string, data: any[]): number {
        // Calculate appropriate column width based on content
        const maxLength = Math.max(
            field.length,
            ...data.slice(0, 10).map(row => String(row[field] || '').length)
        );
        return Math.min(Math.max(maxLength * 10, 100), 300);
    }

    exportToCSV() {
        if (!this.resultRows || this.resultRows.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No data to export',
                'warning'
            );
            return;
        }

        // Create CSV content
        const headers = this.resultColumns.map(col => col.title).join(',');
        const rows = this.resultRows.map(row =>
            this.resultColumns.map(col => {
                const value = row[col.field];
                // Escape values containing commas or quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',')
        );

        const csv = [headers, ...rows].join('\n');

        // Create and download file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.query?.Name || 'query'}_results_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        MJNotificationService.Instance.CreateSimpleNotification(
            'Results exported to CSV',
            'success'
        );
    }

    async copyToClipboard() {
        if (!this.resultRows || this.resultRows.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No data to copy',
                'warning'
            );
            return;
        }

        try {
            // Create tab-delimited content for pasting into Excel
            const headers = this.resultColumns.map(col => col.title).join('\t');
            const rows = this.resultRows.map(row =>
                this.resultColumns.map(col => row[col.field] || '').join('\t')
            );

            const content = [headers, ...rows].join('\n');
            await navigator.clipboard.writeText(content);

            MJNotificationService.Instance.CreateSimpleNotification(
                'Results copied to clipboard',
                'success'
            );
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to copy to clipboard',
                'error'
            );
        }
    }

    close() {
        this.isVisible = false;
        this.isVisibleChange.emit(false);
        this.onClose.emit();
        
        // Reset state
        this.runResult = null;
        this.resultColumns = [];
        this.resultRows = [];
        this.selectedRows = [];
    }

    getAppliedParametersCount(): number {
        return this.parameterPairs.filter(p => p.value).length;
    }
    
    hasInvalidParameters(): boolean {
        return this.parameterPairs.some(p => !this.isParameterValid(p));
    }
}