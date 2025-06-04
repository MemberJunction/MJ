import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, ViewChildren, QueryList, SimpleChanges } from '@angular/core';
import { CompositeKey, KeyValuePair, LogError, Metadata, RunQuery, RunQueryParams, RunView, RunViewParams } from '@memberjunction/core';
import { SkipReactComponentHost } from './skip-react-component-host';
import { MapEntityInfoToSkipEntityInfo, SimpleMetadata, SimpleRunQuery, SimpleRunView, SkipAPIAnalysisCompleteResponse, SkipComponentStyles, SkipComponentCallbacks, SkipComponentUtilities, SkipComponentOption, BuildSkipComponentCompleteCode } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';

@Component({
  selector: 'skip-dynamic-html-report',
  template: `
    @if (reportOptions.length > 1) {
      <!-- Multiple options: show tabs -->
      <kendo-tabstrip 
        (tabSelect)="onTabSelect($event)"
        [keepTabContent]="true"
        style="height: 100%; display: flex; flex-direction: column;">
        @for (option of reportOptions; track option; let i = $index) {
          <kendo-tabstrip-tab [title]="getTabTitle(i)" [selected]="i === selectedReportOptionIndex">
            <ng-template kendoTabContent>
              <div style="height: 100%; display: flex; flex-direction: column; padding: 20px;">
                <!-- Print button for this tab -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                  <button kendoButton *ngIf="ShowPrintReport" (click)="PrintReport()">
                    <span class="fa-solid fa-print"></span>
                    Print Report
                  </button>
                </div>
                
                <!-- React component container -->
                <div #htmlContainer [attr.data-tab-index]="i" 
                     style="flex: 1; position: relative; min-height: 0;">
                  <!-- Content will be rendered here by React host -->
                </div>
              </div>
            </ng-template>
          </kendo-tabstrip-tab>
        }
      </kendo-tabstrip>
    } @else {
      <!-- Single option: no tabs needed -->
      <div style="height: 100%; display: flex; flex-direction: column; padding: 20px;">
        <!-- Print button -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
          <button kendoButton *ngIf="ShowPrintReport" (click)="PrintReport()">
            <span class="fa-solid fa-print"></span>
            Print Report
          </button>
        </div>
        
        <!-- React component container -->
        <div #htmlContainer style="flex: 1; position: relative; min-height: 0;">
          <!-- Content will be rendered here by React host -->
        </div>
      </div>
    }
    
    <!-- Error overlay (shown on top of content when needed) -->
    @if (currentError) {
      <div style="position: absolute; 
                  top: 0; 
                  left: 0; 
                  right: 0; 
                  bottom: 0; 
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: rgba(255, 255, 255, 0.95);
                  z-index: 1000;">
        <div style="width: 90%; 
                    max-width: 600px; 
                    max-height: 80vh;
                    background-color: #f8f9fa; 
                    border: 2px solid #dc3545; 
                    border-radius: 8px; 
                    padding: 20px;
                    overflow-y: auto;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="position: relative;">
            <button kendoButton (click)="copyErrorToClipboard()" 
                    style="position: absolute; top: 0; right: 0;">
              <span class="fa-solid fa-copy"></span>
              Copy Error Details
            </button>
            <h3 style="color: #dc3545; margin-top: 0; margin-right: 150px;">
              <span class="fa-solid fa-exclamation-triangle"></span>
              Component Rendering Error
            </h3>
          </div>
          <p style="margin-bottom: 10px;">
            The selected component option could not be rendered due to the following error:
          </p>
          <div style="background-color: #fff; border: 1px solid #dee2e6; 
                      border-radius: 4px; padding: 15px; margin-bottom: 15px;
                      font-family: 'Courier New', monospace; font-size: 14px;">
            <strong>Error Type:</strong> {{ currentError.type }}<br>
            <strong>Details:</strong> {{ currentError.message }}
            @if (currentError.technicalDetails) {
              <details style="margin-top: 10px;">
                <summary style="cursor: pointer; color: #0056b3;">Technical Details (click to expand)</summary>
                <pre style="margin-top: 10px; white-space: pre-wrap; word-break: break-word;">{{ currentError.technicalDetails }}</pre>
              </details>
            }
          </div>
          <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; 
                      border-radius: 4px; padding: 15px; margin-bottom: 15px;">
            <strong>What to do:</strong>
            <ol style="margin: 10px 0 0 20px; padding: 0;">
              <li>Try selecting a different report option from the dropdown above</li>
              <li>Copy the error details and send them back to Skip in the chat to get a corrected version</li>
              <li>Contact your IT department if the issue persists</li>
            </ol>
          </div>
          <button kendoButton (click)="retryCurrentOption()">
            <span class="fa-solid fa-rotate"></span>
            Retry
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      position: relative;
    }
    
    button { 
      margin-top: 5px; 
      margin-bottom: 5px;
    }
    
    /* Tab styling */
    .k-tabstrip {
      border: none;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    .k-tabstrip-items {
      background: transparent;
      border-bottom: 2px solid #e0e0e0;
      flex: 0 0 auto;
    }
    
    .k-tabstrip-items-wrapper {
      height: 100%;
    }
    
    .k-content {
      flex: 1;
      overflow: hidden;
      padding: 0;
    }
    
    .k-tabstrip .k-item {
      margin-right: 4px;
      border: none;
      background: transparent;
    }
    
    .k-tabstrip .k-item.k-selected {
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-bottom: 1px solid #ffffff;
      margin-bottom: -1px;
    }
    
    .k-tabstrip .k-link {
      padding: 8px 16px;
      font-weight: 500;
    }
    
    .k-tabstrip .k-item.k-selected .k-link {
      color: #2196f3;
    }
    
    /* React host container */
    .react-host-container {
      width: 100%;
      height: 100%;
    }
  `] 
})
export class SkipDynamicHTMLReportComponent implements AfterViewInit, OnDestroy {
    @Input() HTMLReport: string | null = null;
    @Input() ComponentObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Input() ShowReportOptionsToggle: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    @ViewChildren('htmlContainer') htmlContainers!: QueryList<ElementRef>;

    // Properties for handling multiple report options
    public reportOptions: SkipComponentOption[] = [];
    public selectedReportOptionIndex: number = 0;
    public currentError: { type: string; message: string; technicalDetails?: string } | null = null;
    
    // Cache for React component hosts - lazy loaded per option
    private reactHostCache: Map<number, SkipReactComponentHost> = new Map();
    private currentHostIndex: number | null = null;
    
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
     * Get tab title for a specific option index
     */
    public getTabTitle(index: number): string {
        const option = this.reportOptions[index];
        if (!option) return `Option ${index + 1}`;
        
        // Create a more descriptive title
        const rankText = option.AIRank ? ` (Rank ${option.AIRank})` : '';
        const componentType = option.option.componentType || 'Report';
        
        // Add an icon based on rank
        let icon = '';
        if (option.AIRank === 1) {
            icon = '⭐ '; // Star for best option
        } else if (option.AIRank && option.AIRank <= 3) {
            icon = '✓ '; // Check for good options
        }
        
        return `${icon}${componentType} ${index + 1}${rankText}`;
    }

    /**
     * Handles when the user selects a tab
     */
    public onTabSelect(event: any): void {
        const selectedIndex = event.index;
        this.onReportOptionChange(selectedIndex);
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
        if (!selectedOption) return;

        // Clear any previous error
        this.currentError = null;

        // Update the component info
        this.HTMLReport = BuildSkipComponentCompleteCode(selectedOption.option);
        this.ComponentObjectName = selectedOption.option.componentName;
        
        // Simply create or reuse the React host for this option
        // The tab component handles visibility automatically
        if (!this.reactHostCache.has(this.selectedReportOptionIndex)) {
            // Create a new host for this option
            this.createReactHostForOption(this.selectedReportOptionIndex);
        }
        
        this.currentHostIndex = this.selectedReportOptionIndex;
    }
  
    public async PrintReport() {
        const currentHost = this.getCurrentReactHost();
        if (currentHost) {
            currentHost.print();
        } else {
            window.print();
        }
    }

    /**
     * Copy error details to clipboard for user to send back to Skip
     */
    public copyErrorToClipboard(): void {
        if (!this.currentError) return;
        
        const errorText = `Skip Component Error:
Type: ${this.currentError.type}
Message: ${this.currentError.message}
${this.currentError.technicalDetails ? `\nTechnical Details:\n${this.currentError.technicalDetails}` : ''}

Component Option: ${this.selectedReportOptionIndex + 1}
Component Name: ${this.ComponentObjectName || 'Unknown'}`;

        navigator.clipboard.writeText(errorText).then(() => {
            alert('Error details copied to clipboard. You can paste this in the Skip chat to get help.');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    /**
     * Get the container element for a specific option index
     */
    private getContainerForOption(optionIndex: number): HTMLElement | null {
        if (!this.htmlContainers || this.htmlContainers.length === 0) {
            return null;
        }
        
        if (this.reportOptions.length === 1) {
            // Single option - use the only container
            return this.htmlContainers.first?.nativeElement || null;
        } else {
            // Multiple options - find container by data-tab-index
            const container = this.htmlContainers.find(ref => 
                ref.nativeElement.getAttribute('data-tab-index') === optionIndex.toString()
            );
            return container?.nativeElement || null;
        }
    }

    /**
     * Retry loading the current option
     */
    public retryCurrentOption(): void {
        // Clear the error
        this.currentError = null;
        
        // Remove the cached host for this option to force recreation
        if (this.reactHostCache.has(this.selectedReportOptionIndex)) {
            const host = this.reactHostCache.get(this.selectedReportOptionIndex);
            if (host) {
                host.destroy();
            }
            this.reactHostCache.delete(this.selectedReportOptionIndex);
        }
        
        // Try creating it again
        this.createReactHostForOption(this.selectedReportOptionIndex);
    }

    ngAfterViewInit() {
        if (this.SkipData) {
            this.setupReportOptions(this.SkipData);
        }
        
        // Wait for ViewChildren to be available
        setTimeout(() => {
            if (this.HTMLReport && this.ComponentObjectName && this.SkipData) {
                // Create the initial React host for the first option
                this.createReactHostForOption(this.selectedReportOptionIndex);
            }
        });
    }
    
    ngOnDestroy(): void {
        // Clean up all cached React hosts
        this.reactHostCache.forEach(host => {
            try {
                host.destroy();
            } catch (e) {
                console.error('Error destroying React host:', e);
            }
        });
        this.reactHostCache.clear();
    }
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['SkipData'] && !changes['SkipData'].firstChange) {
            // Update all cached React components with new data
            const newData = this.getFlattenedDataContext();
            this.reactHostCache.forEach(host => {
                try {
                    host.updateState('data', newData);
                } catch (e) {
                    console.error('Error updating React host data:', e);
                }
            });
        }
    }

    /**
     * Get the currently active React host
     */
    private getCurrentReactHost(): SkipReactComponentHost | null {
        if (this.currentHostIndex !== null && this.reactHostCache.has(this.currentHostIndex)) {
            return this.reactHostCache.get(this.currentHostIndex) || null;
        }
        return null;
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
            // Update the current display with new data
            this.updateCurrentReport();
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
            
            // Select the best option (first in sorted array)
            this.selectedReportOptionIndex = 0;
            const bestOption = this.reportOptions[0];
            this.HTMLReport = BuildSkipComponentCompleteCode(bestOption.option);
            this.ComponentObjectName = bestOption.option.componentName;
        } 
    }

    /**
     * Create a React host for a specific option index
     */
    private async createReactHostForOption(optionIndex: number): Promise<void> {
        const option = this.reportOptions[optionIndex];
        if (!option) return;

        const container = this.getContainerForOption(optionIndex);
        if (!container) return;

        try {
            const componentCode = BuildSkipComponentCompleteCode(option.option);

            // Check for unresolved placeholders in the code
            if (componentCode.includes('<<') && componentCode.includes('>>')) {
                const placeholderMatch = componentCode.match(/<<([^>]+)>>/);
                const placeholderName = placeholderMatch ? placeholderMatch[1] : 'Unknown';
                
                this.currentError = {
                    type: 'Incomplete Component',
                    message: `This component option contains unresolved placeholders (${placeholderName}). The component generation was not completed successfully.`,
                    technicalDetails: `The component code contains placeholder tokens that should have been replaced with actual implementations. This typically happens when the AI generation process was interrupted or encountered an error.\n\nPlaceholder found: <<${placeholderName}>>`
                };
                return;
            }
            
            const md = new Metadata();
            const data = this.getFlattenedDataContext();
            
            // Create the React component host directly in the tab container
            const reactHost = new SkipReactComponentHost({
                componentCode: componentCode,
                container: container,
                callbacks: this.callbacks,
                data: data,
                utilities: this.SetupUtilities(md),
                styles: this.SetupStyles()
            });
            
            // Initialize and render the React component
            await reactHost.initialize();
            
            // Cache the host
            this.reactHostCache.set(optionIndex, reactHost);
            
            // Update current index if this is the selected option
            if (optionIndex === this.selectedReportOptionIndex) {
                this.currentHostIndex = optionIndex;
            }
        }
        catch (e: any) {
            console.error('Error creating React host:', e);
            
            // Determine the type of error and create a user-friendly message
            let errorType = 'Component Initialization Error';
            let errorMessage = 'Failed to initialize the React component.';
            let technicalDetails = e.toString();
            
            if (e.message?.includes('JSX transpilation failed')) {
                errorType = 'Code Compilation Error';
                errorMessage = 'The component code could not be compiled. This usually indicates a syntax error in the generated code.';
                technicalDetails = e.message;
            } else if (e.message?.includes('is not defined')) {
                errorType = 'Missing Dependency';
                errorMessage = 'The component is trying to use a feature or library that is not available.';
            } else if (e.message?.includes('Cannot read properties')) {
                errorType = 'Property Access Error';
                errorMessage = 'The component is trying to access data that doesn\'t exist. This often happens when property names don\'t match the data structure.';
            }
            
            this.currentError = {
                type: errorType,
                message: errorMessage,
                technicalDetails: technicalDetails + '\n\nComponent Option: ' + (optionIndex + 1) + '\nComponent Name: ' + option.option.componentName
            };
            
            LogError(e);
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
        const currentHost = this.getCurrentReactHost();
        if (currentHost) {
            currentHost.refresh(data);
        } else {
            // If no React host is available, create one for the current option
            this.createReactHostForOption(this.selectedReportOptionIndex);
        }
    }
}
