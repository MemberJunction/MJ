import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, SimpleChanges } from '@angular/core';
import { CompositeKey, KeyValuePair, LogError, Metadata, RunQuery, RunQueryParams, RunView, RunViewParams } from '@memberjunction/core';
import { SkipReactComponentHost } from './skip-react-component-host';
import { MapEntityInfoToSkipEntityInfo, SimpleMetadata, SimpleRunQuery, SimpleRunView, SkipAPIAnalysisCompleteResponse, SkipComponentStyles, SkipComponentCallbacks, SkipComponentUtilities, SkipComponentOption, BuildSkipComponentCompleteCode } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';

@Component({
  selector: 'skip-dynamic-html-report',
  template: `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      @if (ShowReportOptionsToggle && reportOptions.length > 1) {
        <div style="display: flex; align-items: center; gap: 10px;">
          <label for="reportOption">Report Option:</label>
          <kendo-dropdownlist 
            [data]="reportOptionLabels" 
            [textField]="'text'" 
            [valueField]="'value'" 
            [valuePrimitive]="true"
            [(ngModel)]="selectedReportOptionIndex"
            (ngModelChange)="onReportOptionChange($event)"
            [style.min-width.px]="150">
          </kendo-dropdownlist>
        </div>
      }
      
      <button kendoButton *ngIf="ShowPrintReport" (click)="PrintReport()">
        <span class="fa-regular fa-image"></span>
        Print 
      </button>
    </div>
    
    <div #htmlContainer mjFillContainer>
        <!-- this is where we'll dynamically inject the HTML that was AI generated -->
    </div>
  `,
  styles: [`
    button { margin-top: 5px; margin-bottom: 5px;}
  `] 
})
export class SkipDynamicHTMLReportComponent implements AfterViewInit, OnDestroy {
    @Input() HTMLReport: string | null = null;
    @Input() ComponentObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Input() ShowReportOptionsToggle: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    @ViewChild('htmlContainer', { static: false }) htmlContainer!: ElementRef;

    // Properties for handling multiple report options
    public reportOptions: SkipComponentOption[] = [];
    public selectedReportOptionIndex: number = 0;
    public reportOptionLabels: { text: string; value: number }[] = [];
    
    private reactHost: SkipReactComponentHost | null = null;
    private callbacks: SkipComponentCallbacks = {
        RefreshData: () => this.handleRefreshData(),
        OpenEntityRecord: (entityName: string, key: CompositeKey) => this.handleOpenEntityRecord(entityName, key),
        UpdateUserState: (userState: any) => this.handleUpdateUserState(userState),
        NotifyEvent: (eventName: string, eventData: any) => this.handleNotifyEvent(eventName, eventData)
    };

    constructor() { }

    /**
     * Gets the currently selected report option
     */
    public get selectedReportOption(): SkipComponentOption | null {
        return this.reportOptions.length > this.selectedReportOptionIndex 
            ? this.reportOptions[this.selectedReportOptionIndex] 
            : null;
    }

    /**
     * Handles when the user changes the selected report option
     */
    public onReportOptionChange(selectedIndex: number): void {
        if (selectedIndex >= 0 && selectedIndex < this.reportOptions.length) {
            this.selectedReportOptionIndex = selectedIndex;
            this.updateCurrentReport();
        }
    }

    /**
     * Updates the current report display based on the selected option
     */
    private updateCurrentReport(): void {
        const selectedOption = this.selectedReportOption;
        if (selectedOption) {
            this.HTMLReport = selectedOption.option.componentCode;
            this.ComponentObjectName = selectedOption.option.componentName;
            
            // Clear the container before loading new report
            const container = this.htmlContainer?.nativeElement;
            if (container) {
                container.innerHTML = '';
            }
            
            this.invokeHTMLInitFunction();
        }
    }
  
    public async PrintReport() {
        if (this.reactHost) {
            this.reactHost.print();
        } else {
            window.print();
        }
    }

    ngAfterViewInit() {
        if (this.SkipData) {
            this.setupReportOptions(this.SkipData);
        }
        if (this.HTMLReport) {
            const container = this.htmlContainer?.nativeElement;
            if (container) {
                if (this.ComponentObjectName && this.SkipData) {
                    this.invokeHTMLInitFunction();
                }
            }
        }
    }
    
    ngOnDestroy(): void {
        this.cleanupReactComponent();
    }
    
    ngOnChanges(changes: SimpleChanges): void {
        if (this.reactHost && changes['SkipData'] && !changes['SkipData'].firstChange) {
            // Update React component state when Angular data changes
            this.reactHost.updateState('data', this.getFlattenedDataContext());
        }
    }
  
    private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
        const hadData = this._skipData ? true : false;
        this._skipData = d;
        if (d) {
            // For backward compatibility, check if we have component options
            if (d.componentOptions && d.componentOptions.length > 0) {
                // Use the first component option (or the highest ranked one)
                const component = d.componentOptions[0];
                this.HTMLReport = BuildSkipComponentCompleteCode(component.option);
                this.ComponentObjectName = component.option.componentName;
            } else {
                // Fallback for old format
                this.HTMLReport = (d as any).htmlReport;
                this.ComponentObjectName = (d as any).htmlReportObjectName;
            }
        }
        if (d && hadData) {
            // normally the initFunction is called in ngAfterViewInit, but here the data changed so we need to call it again
            this.invokeHTMLInitFunction();
        }
    }

    /**
     * Sets up the report options from the SkipData, prioritizing the new htmlReportOptions array
     * but falling back to the deprecated htmlReport/htmlReportObjectName for backward compatibility
     */
    private setupReportOptions(data: SkipAPIAnalysisCompleteResponse): void {
        // Check if we have the new htmlReportOptions array
        if (data.componentOptions && data.componentOptions.length > 0) {
            // Sort by AIRank (lower numbers = better ranking)
            this.reportOptions = [...data.componentOptions].sort((a, b) => {
                const rankA = a.AIRank ?? Number.MAX_SAFE_INTEGER;
                const rankB = b.AIRank ?? Number.MAX_SAFE_INTEGER;
                return rankA - rankB;
            });
            
            // Create dropdown labels
            this.reportOptionLabels = this.reportOptions.map((option, index) => ({
                text: `Option ${index + 1}${option.AIRank ? ` (Rank ${option.AIRank})` : ''}`,
                value: index
            }));
            
            // Select the best option (first in sorted array)
            this.selectedReportOptionIndex = 0;
            const bestOption = this.reportOptions[0];
            this.HTMLReport = BuildSkipComponentCompleteCode(bestOption.option);
            this.ComponentObjectName = bestOption.option.componentName;
        } 
    }

    private async invokeHTMLInitFunction() {
        try {
            const container = this.htmlContainer?.nativeElement;
            if (container && this.ComponentObjectName && this.HTMLReport) {
                this.cleanupReactComponent();
                
                const md = new Metadata();
                const data = this.getFlattenedDataContext();
                
                // Create the React component host
                this.reactHost = new SkipReactComponentHost({
                    componentCode: this.HTMLReport,
                    container: container,
                    callbacks: this.callbacks,
                    data: data,
                    utilities: this.SetupUtilities(md),
                    styles: this.SetupStyles()
                });
                
                // Initialize and render the React component
                this.reactHost.initialize();
            }
            else {
                console.warn('HTML Report container not found or component code not provided');
            }
        }
        catch (e) {
            LogError(e);
        }
    }

    private cleanupReactComponent(): void {
        if (this.reactHost) {
            this.reactHost.destroy();
            this.reactHost = null;
        }
    }
    
    private getFlattenedDataContext(): Record<string, any> {
        const flattenedDataContext: Record<string, any> = {};
        
        if (this.SkipData?.dataContext) {
            const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
            for (let i = 0; i < loadedItems.length; i++) {
                flattenedDataContext["data_item_" + i] = loadedItems[i]._Data;
            }
        }
        
        return flattenedDataContext;
    }

    // Event handler implementations
    private handleRefreshData(): void {
        console.log('Component requested data refresh');
        // Emit an event or call parent component method to refresh data
    }
    
    private handleOpenEntityRecord(entityName: string, key: CompositeKey): void {
        if (entityName) {
            // bubble this up to our parent component as we don't directly open records in this component
            const md = new Metadata();
            const entityMatch = md.EntityByName(entityName);
            if (!entityMatch) {
                // couldn't find it, but sometimes the AI uses a table name or a view name, let's check for that
                const altMatch = md.Entities.filter(e => e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.BaseView.toLowerCase() === entityName.toLowerCase() || 
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseView.toLowerCase() === entityName.toLowerCase());
                if (altMatch && altMatch.length === 1) { 
                    entityName = altMatch[0].Name;
                }
            }
            const cKey = new CompositeKey(key as any as KeyValuePair[])
            this.DrillDownEvent.emit(new DrillDownInfo(entityName, cKey.ToWhereClause()));
        }
    }
    
    private handleUpdateUserState(userState: any): void {
        console.log('Component updated user state:', userState);
        // TODO: Implement user state persistence if needed
    }
    
    private handleNotifyEvent(eventName: string, eventData: any): void {
        console.log(`Component raised event: ${eventName} notified with data:`, eventData);
        // TODO: Handle custom events as needed
    }

    protected SetupUtilities(md: Metadata): SkipComponentUtilities {
        const rv = new RunView();
        const rq = new RunQuery();
        const u: SkipComponentUtilities = {
            md: this.CreateSimpleMetadata(md),
            rv: this.CreateSimpleRunView(rv),
            rq: this.CreateSimpleRunQuery(rq)
        };            
        return u;
    }

    protected CreateSimpleMetadata(md: Metadata): SimpleMetadata {
        return {
            entities: md.Entities.map(e => MapEntityInfoToSkipEntityInfo(e))
        }
    }

    protected SetupStyles(): SkipComponentStyles{
        // This is a placeholder for any styles that the HTML report might need
        // For now, we just return an empty object
        return {
            colors: {
                primary: '#2196f3',
                primaryHover:  '#1976d2',
                secondary: '#757575',
                success: '#4caf50',
                background: '#ffffff',
                surface: '#f8f9fa',
                text: '#333333',
                textSecondary: '#656565',
                border: '#e2e8f0',
            },
            spacing: {
                xs: '4px',
                sm: '8px',
                md: '16px',
                lg: '24px',
                xl: '32px',
            },
            typography: {
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: {
                sm:  '14px',
                md:  '16px',
                lg:  '18px',
                xl:  '24px'
                },
            },
            borders: {
                radius: '4px',
                width: '1px'
            },
            overflow: 'auto' // Default overflow style        
        }
    }
    
    protected CreateSimpleRunQuery(rq: RunQuery): SimpleRunQuery {
        return {
            runQuery: async (params: RunQueryParams) => {
                // Run a single query and return the results
                try {
                    const result = await rq.RunQuery(params);
                    return result;
                } catch (error) {
                    LogError(error);
                    throw error; // Re-throw to handle it in the caller
                }
            }
        }
    }
    protected CreateSimpleRunView(rv: RunView): SimpleRunView {
        return {
            runView: async (params: RunViewParams) => {
                // Run a single view and return the results
                try {
                    const result = await rv.RunView(params);
                    return result;
                } catch (error) {
                    LogError(error);
                    throw error; // Re-throw to handle it in the caller
                }
            },
            runViews: async (params: RunViewParams[]) => {
                // Runs multiple views and returns the results
                try {
                    const results = await rv.RunViews(params);
                    return results;
                } catch (error) {
                    LogError(error);
                    throw error; // Re-throw to handle it in the caller
                }
            }
        }
    }

    protected SetupCallbacks(): SkipComponentCallbacks {
        const cb: SkipComponentCallbacks = {
            RefreshData: () => {
                // this is a callback function that can be called from the component to refresh data
                console.log('Component requested data refresh');
                // need to implement this
            },
            OpenEntityRecord: (entityName: string, key: CompositeKey) => {
                // this is a callback function that can be called from the component to open an entity record
                if (entityName) {
                    // bubble this up to our parent component as we don't directly open records in this component
                    const md = new Metadata();
                    const entityMatch = md.EntityByName(entityName);
                    if (!entityMatch) {
                        // couldn't find it, but sometimes the AI uses a table name or a view name, let's check for that
                        const altMatch = md.Entities.filter(e => e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                                e.BaseView.toLowerCase() === entityName.toLowerCase() || 
                                                                e.SchemaName.toLowerCase() + '.' + e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                                e.SchemaName.toLowerCase() + '.' + e.BaseView.toLowerCase() === entityName.toLowerCase());
                        if (altMatch && altMatch.length === 1) { 
                            entityName = altMatch[0].Name;
                        }
                    }
                    const cKey = new CompositeKey(key as any as KeyValuePair[])
                    this.DrillDownEvent.emit(new DrillDownInfo(entityName, cKey.ToWhereClause()));
                }
            },
            UpdateUserState: (userState: any) => {
                // this is a callback function that can be called from the component to update user state
                console.log('Component updated user state:', userState);
                // need to implement this
            },
            NotifyEvent: (eventName: string, eventData: any) => {
                // this is a callback function that can be called from the component to notify an event
                console.log(`Component raised event: ${eventName} notified with data:`, eventData);
            }
        };
        return cb;
    }

    public async refreshReport(data?: any): Promise<void> {
        if (this.reactHost) {
            this.reactHost.refresh(data);
        } else {
            // If no React host is available, re-render the report
            this.invokeHTMLInitFunction();
        }
    }
}
