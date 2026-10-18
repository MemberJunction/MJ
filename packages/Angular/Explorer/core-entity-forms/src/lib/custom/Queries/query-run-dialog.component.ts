import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { MJQueryEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Metadata } from '@memberjunction/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
interface QueryRunResult {
    QueryID: string;
    QueryName: string;
    Success: boolean;
    Results: string;  // This is a JSON string that needs to be parsed
    ErrorMessage: string;
    RowCount: number;
    TotalRowCount: number;
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
  standalone: false,
    selector: 'mj-query-run-dialog',
    templateUrl: './query-run-dialog.component.html',
    styleUrls: ['./query-run-dialog.component.css']
})
export class QueryRunDialogComponent extends BaseAngularComponent implements OnInit, OnChanges {
    private cdr = inject(ChangeDetectorRef);

    @Input() query: MJQueryEntity | null = null;
    @Input() parameters: MJQueryParameterEntity[] = [];
    @Input() IsVisible = false;

    /** @deprecated Use {@link IsVisible}. */
    @Input() set isVisible(value: QueryRunDialogComponent['IsVisible']) {
      this.IsVisible = value;
    }
    /** @deprecated Use {@link IsVisible}. */
    get isVisible(): QueryRunDialogComponent['IsVisible'] {
      return this.IsVisible;
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

    public IsRunning = false;

    /** @deprecated Use {@link IsRunning}. */
    public get isRunning() {
      return this.IsRunning;
    }
    /** @deprecated Use {@link IsRunning}. */
    public set isRunning(value) {
      this.IsRunning = value;
    }
    public IsLoadingParams = false;

    /** @deprecated Use {@link IsLoadingParams}. */
    public get isLoadingParams() {
      return this.IsLoadingParams;
    }
    /** @deprecated Use {@link IsLoadingParams}. */
    public set isLoadingParams(value) {
      this.IsLoadingParams = value;
    }
    public ParameterPairs: ParameterPair[] = [];

    /** @deprecated Use {@link ParameterPairs}. */
    public get parameterPairs(): ParameterPair[] {
      return this.ParameterPairs;
    }
    /** @deprecated Use {@link ParameterPairs}. */
    public set parameterPairs(value: ParameterPair[]) {
      this.ParameterPairs = value;
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
    public ResultsExpanded = true;

    /** @deprecated Use {@link ResultsExpanded}. */
    public get resultsExpanded() {
      return this.ResultsExpanded;
    }
    /** @deprecated Use {@link ResultsExpanded}. */
    public set resultsExpanded(value) {
      this.ResultsExpanded = value;
    }
    public PaginationExpanded = false;

    /** @deprecated Use {@link PaginationExpanded}. */
    public get paginationExpanded() {
      return this.PaginationExpanded;
    }
    /** @deprecated Use {@link PaginationExpanded}. */
    public set paginationExpanded(value) {
      this.PaginationExpanded = value;
    }
    public RunResult: QueryRunResult | null = null;

    /** @deprecated Use {@link RunResult}. */
    public get runResult(): QueryRunResult | null {
      return this.RunResult;
    }
    /** @deprecated Use {@link RunResult}. */
    public set runResult(value: QueryRunResult | null) {
      this.RunResult = value;
    }
    public ResultColumns: any[] = [];

    /** @deprecated Use {@link ResultColumns}. */
    public get resultColumns(): any[] {
      return this.ResultColumns;
    }
    /** @deprecated Use {@link ResultColumns}. */
    public set resultColumns(value: any[]) {
      this.ResultColumns = value;
    }
    public ResultRows: any[] = [];

    /** @deprecated Use {@link ResultRows}. */
    public get resultRows(): any[] {
      return this.ResultRows;
    }
    /** @deprecated Use {@link ResultRows}. */
    public set resultRows(value: any[]) {
      this.ResultRows = value;
    }
    public SelectedRows: any[] = [];

    /** @deprecated Use {@link SelectedRows}. */
    public get selectedRows(): any[] {
      return this.SelectedRows;
    }
    /** @deprecated Use {@link SelectedRows}. */
    public set selectedRows(value: any[]) {
      this.SelectedRows = value;
    }
    public MaxRows: number | null = null;

    /** @deprecated Use {@link MaxRows}. */
    public get maxRows(): number | null {
      return this.MaxRows;
    }
    /** @deprecated Use {@link MaxRows}. */
    public set maxRows(value: number | null) {
      this.MaxRows = value;
    }
    public StartRow: number = 0;

    /** @deprecated Use {@link StartRow}. */
    public get startRow(): number {
      return this.StartRow;
    }
    /** @deprecated Use {@link StartRow}. */
    public set startRow(value: number) {
      this.StartRow = value;
    }

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
        this.ParameterPairs = this.parameters.map(param => ({
            name: param.Name,
            value: param.DefaultValue || '',
            type: param.Type || 'string',
            defaultValue: param.DefaultValue || '',
            description: param.Description || '',
            isRequired: param.IsRequired || false
        }));
    }

    GetValueListOptions(valueList: string): Array<{text: string, value: string}> {
        if (!valueList) return [];
        
        try {
            const options = valueList.split(',').map(v => v.trim());
            return options.map(opt => ({ text: opt, value: opt }));
        } catch {
            return [];
        }
    }

    /** @deprecated Use {@link GetValueListOptions}. */
    getValueListOptions(valueList: string): Array<{text: string, value: string}> {
      return this.GetValueListOptions(valueList);
    }

    IsParameterValid(param: ParameterPair): boolean {
        if (param.isRequired && !param.value) {
            return false;
        }
        
        // Additional type-specific validation could go here
        if (param.type === 'number' && param.value) {
            return !isNaN(Number(param.value));
        }
        
        return true;
    }

    /** @deprecated Use {@link IsParameterValid}. */
    isParameterValid(param: ParameterPair): boolean {
      return this.IsParameterValid(param);
    }

    async RunQuery(isPaginationRequest: boolean = false) {
        if (!this.query?.ID) return;

        // Validate required parameters
        const invalidParams = this.ParameterPairs.filter(p => p.isRequired && !p.value);
        if (invalidParams.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Required parameters missing: ${invalidParams.map(p => p.name).join(', ')}`,
                'warning',
                3000
            );
            return;
        }

        this.IsRunning = true;
        this.RunResult = null;

        try {
            // Build parameters object
            const queryParameters: Record<string, any> = {};
            this.ParameterPairs.forEach(param => {
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
            const dataProvider = this.ProviderToUse as GraphQLDataProvider;
            
            // Execute the GetQueryData GraphQL query
            const query = `
                query GetQueryData($QueryID: String!, $Parameters: JSONObject, $MaxRows: Int, $StartRow: Int) {
                    GetQueryData(QueryID: $QueryID, Parameters: $Parameters, MaxRows: $MaxRows, StartRow: $StartRow) {
                        QueryID
                        QueryName
                        Success
                        Results
                        ErrorMessage
                        RowCount
                        TotalRowCount
                        ExecutionTime
                        AppliedParameters
                    }
                }
            `;

            const variables: any = {
                QueryID: this.query.ID,
                Parameters: queryParameters
            };
            
            // Only include MaxRows if it's set
            if (this.MaxRows && this.MaxRows > 0) {
                variables.MaxRows = this.MaxRows;
            }
            
            // Only include StartRow if it's set and greater than 0
            if (this.StartRow && this.StartRow > 0) {
                variables.StartRow = this.StartRow;
            }

            console.log('Executing query with variables:', variables);
            
            const response = await dataProvider.ExecuteGQL(
                query, 
                variables
            ) as {GetQueryData: QueryRunResult};

            if (response?.GetQueryData) {
                this.RunResult = response.GetQueryData;
                
                if (this.RunResult.Success && this.RunResult.Results) {
                    // Parse the JSON string results
                    try {
                        const parsedResults = JSON.parse(this.RunResult.Results);
                        this.processResults(parsedResults);
                        // Only show notification on first run (not pagination)
                        if (!isPaginationRequest) {
                            const rowCountMsg = this.RunResult.TotalRowCount > this.RunResult.RowCount
                                ? `Query executed successfully. Showing ${this.RunResult.RowCount} of ${this.RunResult.TotalRowCount} total rows.`
                                : `Query executed successfully. ${this.RunResult.RowCount} rows returned.`;
                            MJNotificationService.Instance.CreateSimpleNotification(
                                rowCountMsg,
                                'success',
                                3000
                            );
                        }
                        
                        // Automatically expand results and collapse other sections
                        this.ParametersExpanded = false;
                        this.PaginationExpanded = false;
                        this.ResultsExpanded = true;
                    } catch (error) {
                        console.error('Error parsing results:', error);
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'Failed to parse query results',
                            'error',
                            3000
                        );
                    }
                } else {
                    console.error('Query execution failed:', this.RunResult);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        this.RunResult?.ErrorMessage || 'Query execution failed',
                        'error',
                        3000
                    );
                    
                    // Expand results section to show error
                    this.ParametersExpanded = false;
                    this.PaginationExpanded = false;
                    this.ResultsExpanded = true;
                }
            } else {
                throw new Error('No response from server');
            }
        } catch (error) {
            console.error('Error running query:', error);
            this.RunResult = {
                QueryID: this.query.ID,
                QueryName: this.query.Name,
                Success: false,
                Results: '[]',
                ErrorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0
            };
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute query. Please check your parameters and try again.',
                'error',
                3000
            );
        } finally {
            this.IsRunning = false;
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link RunQuery}. */
    async runQuery(isPaginationRequest: boolean = false) {
      return this.RunQuery(isPaginationRequest);
    }

    private processResults(results: any[]) {
        if (!results || results.length === 0) {
            this.ResultColumns = [];
            this.ResultRows = [];
            return;
        }

        // Extract columns from first row
        const firstRow = results[0];
        this.ResultColumns = Object.keys(firstRow).map(key => ({
            field: key,
            title: this.formatColumnTitle(key),
            width: this.calculateColumnWidth(key, results)
        }));

        // Set rows
        this.ResultRows = results;
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

    ExportToCSV() {
        if (!this.ResultRows || this.ResultRows.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No data to export',
                'warning',
                3000
            );
            return;
        }

        // Create CSV content
        const headers = this.ResultColumns.map(col => col.title).join(',');
        const rows = this.ResultRows.map(row =>
            this.ResultColumns.map(col => {
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
            'success',
            3000
        );
    }

    /** @deprecated Use {@link ExportToCSV}. */
    exportToCSV() {
      return this.ExportToCSV();
    }

    async CopyToClipboard() {
        if (!this.ResultRows || this.ResultRows.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No data to copy',
                'warning',
                3000
            );
            return;
        }

        try {
            // Create tab-delimited content for pasting into Excel
            const headers = this.ResultColumns.map(col => col.title).join('\t');
            const rows = this.ResultRows.map(row =>
                this.ResultColumns.map(col => row[col.field] || '').join('\t')
            );

            const content = [headers, ...rows].join('\n');
            await navigator.clipboard.writeText(content);

            MJNotificationService.Instance.CreateSimpleNotification(
                'Results copied to clipboard',
                'success',
                3000
            );
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to copy to clipboard',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link CopyToClipboard}. */
    async copyToClipboard() {
      return this.CopyToClipboard();
    }

    close() {
        this.IsVisible = false;
        this.IsVisibleChange.emit(false);
        this.OnClose.emit();
        
        // Reset state
        this.RunResult = null;
        this.ResultColumns = [];
        this.ResultRows = [];
        this.SelectedRows = [];
        this.StartRow = 0;
    }

    GetAppliedParametersCount(): number {
        return this.ParameterPairs.filter(p => p.value).length;
    }

    /** @deprecated Use {@link GetAppliedParametersCount}. */
    getAppliedParametersCount(): number {
      return this.GetAppliedParametersCount();
    }
    
    HasInvalidParameters(): boolean {
        return this.ParameterPairs.some(p => !this.IsParameterValid(p));
    }

    /** @deprecated Use {@link HasInvalidParameters}. */
    hasInvalidParameters(): boolean {
      return this.HasInvalidParameters();
    }
    
    // Pagination methods
    GoToFirstPage() {
        this.StartRow = 0;
        this.RunQuery(true);
    }

    /** @deprecated Use {@link GoToFirstPage}. */
    goToFirstPage() {
      return this.GoToFirstPage();
    }
    
    GoToPreviousPage() {
        if (this.StartRow > 0 && this.MaxRows) {
            this.StartRow = Math.max(0, this.StartRow - this.MaxRows);
            this.RunQuery(true);
        }
    }

    /** @deprecated Use {@link GoToPreviousPage}. */
    goToPreviousPage() {
      return this.GoToPreviousPage();
    }
    
    GoToNextPage() {
        if (this.MaxRows && this.RunResult && this.StartRow + this.RunResult.RowCount < this.RunResult.TotalRowCount) {
            this.StartRow += this.MaxRows;
            this.RunQuery(true);
        }
    }

    /** @deprecated Use {@link GoToNextPage}. */
    goToNextPage() {
      return this.GoToNextPage();
    }
    
    GoToLastPage() {
        if (this.MaxRows && this.RunResult) {
            const totalPages = Math.ceil(this.RunResult.TotalRowCount / this.MaxRows);
            this.StartRow = (totalPages - 1) * this.MaxRows;
            this.RunQuery(true);
        }
    }

    /** @deprecated Use {@link GoToLastPage}. */
    goToLastPage() {
      return this.GoToLastPage();
    }
}