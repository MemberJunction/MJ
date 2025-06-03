import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CompositeKey, GetEntityNameFromSchemaAndViewString, KeyValuePair, LogError, Metadata, RunQuery, RunQueryParams, RunView, RunViewParams } from '@memberjunction/core';
import { MapEntityInfoToSkipEntityInfo, SimpleMetadata, SimpleRunQuery, SimpleRunView, SkipAPIAnalysisCompleteResponse, SkipEntityFieldInfo, SkipEntityInfo, SkipEntityRelationshipInfo, SkipComponentStyles, SkipComponentCallbacks, SkipComponentInitFunction, SkipComponentInitParams, SkipComponentObject, SkipComponentUtilities } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';

@Component({
  selector: 'skip-dynamic-html-report',
  template: `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      @if (ShowReportOptionsToggle && htmlReportOptions.length > 1) {
        <div style="display: flex; align-items: center; gap: 10px;">
          <label for="reportOption">Report Option:</label>
          <kendo-dropdownlist 
            [data]="reportOptionLabels" 
            [textField]="'text'" 
            [valueField]="'value'" 
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
export class SkipDynamicHTMLReportComponent implements AfterViewInit {
    @Input() HTMLReport: string | null = null;
    @Input() ComponentObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Input() ShowReportOptionsToggle: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    @ViewChild('htmlContainer', { static: false }) htmlContainer!: ElementRef;

    // Properties for handling multiple report options
    public htmlReportOptions: SkipHTMLReportOption[] = [];
    public selectedReportOptionIndex: number = 0;
    public reportOptionLabels: { text: string; value: number }[] = [];

    constructor(private cdr: ChangeDetectorRef) { }

    /**
     * Gets the currently selected report option
     */
    public get selectedReportOption(): SkipHTMLReportOption | null {
        return this.htmlReportOptions.length > this.selectedReportOptionIndex 
            ? this.htmlReportOptions[this.selectedReportOptionIndex] 
            : null;
    }

    /**
     * Handles when the user changes the selected report option
     */
    public onReportOptionChange(selectedIndex: number): void {
        if (selectedIndex >= 0 && selectedIndex < this.htmlReportOptions.length) {
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
            this.HTMLReport = selectedOption.reportCode;
            this.HTMLReportObjectName = selectedOption.reportObjectName;
            
            // Clear the container before loading new report
            const container = this.htmlContainer?.nativeElement;
            if (container) {
                container.innerHTML = '';
            }
            
            this.invokeHTMLInitFunction();
        }
    }
  
    public async PrintReport() {
        // Implement printing of the HTML element only here
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
                this.HTMLReport = component.code;
                this.ComponentObjectName = component.componentObjectName;
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
        if (data.htmlReportOptions && data.htmlReportOptions.length > 0) {
            // Sort by AIRank (lower numbers = better ranking)
            this.htmlReportOptions = [...data.htmlReportOptions].sort((a, b) => {
                const rankA = a.AIRank ?? Number.MAX_SAFE_INTEGER;
                const rankB = b.AIRank ?? Number.MAX_SAFE_INTEGER;
                return rankA - rankB;
            });
            
            // Create dropdown labels
            this.reportOptionLabels = this.htmlReportOptions.map((option, index) => ({
                text: `Option ${index + 1}${option.AIRank ? ` (Rank ${option.AIRank})` : ''}`,
                value: index
            }));
            
            // Select the best option (first in sorted array)
            this.selectedReportOptionIndex = 0;
            const bestOption = this.htmlReportOptions[0];
            this.HTMLReport = bestOption.reportCode;
            this.HTMLReportObjectName = bestOption.reportObjectName;
        } else {
            // Fall back to deprecated properties for backward compatibility
            this.htmlReportOptions = [];
            this.reportOptionLabels = [];
            this.selectedReportOptionIndex = 0;
            this.HTMLReport = data.htmlReport;
            this.HTMLReportObjectName = data.htmlReportObjectName;
        }
    }

    private async invokeHTMLInitFunction() {
        try {
            const container = this.htmlContainer?.nativeElement;
            if (container && this.ComponentObjectName) {
                // First set the HTML as is, with script tags
                container.innerHTML = this.HTMLReport; 
                
                // Force Angular to detect changes
                this.cdr.detectChanges();
                
                // Now find and manually execute all scripts in the container
                const scriptElements = container.querySelectorAll('script');
                await this.loadScriptsSequentially(scriptElements);
                // scriptElements.forEach((script: HTMLScriptElement) => {
                //     // For external scripts
                //     if (script.src) {
                //         // Create a new script element
                //         const newScript = document.createElement('script');
                //         newScript.src = script.src;
                //         document.head.appendChild(newScript);
                //     } 
                //     // For inline scripts
                //     else if (script.textContent) {
                //         // Execute the script content directly
                //         try {
                //             // This will execute the script in global context
                //             eval(script.textContent);
                //         } catch (error) {
                //             console.error('Error executing script:', error);
                //         }
                //     }
                // });
                this.finishHTMLInitialization();
            }
            else {
                console.warn('HTML Report container not found or init function name not provided');
            }
        }
        catch (e) {
            LogError(e);
        }
    }

    protected async loadScriptsSequentially(scriptElements: HTMLScriptElement[]) {
        for (let i = 0; i < scriptElements.length; i++) {
            const script = scriptElements[i];
            
            // For external scripts
            if (script.src) {
                // we use the promise to ensure we are awaiting for the script to load before moving on to the next one
                await new Promise<void>((resolve, reject) => {
                    const newScript = document.createElement('script');
                    newScript.src = script.src;
                    
                    // Set up handlers
                    newScript.onload = () => resolve();
                    newScript.onerror = (error) => {
                        console.error('Error loading script:', script.src, error);
                        resolve(); // Resolve anyway to continue loading other scripts
                    };
                    
                    document.head.appendChild(newScript);
                });
            } 
            // For inline scripts
            else if (script.textContent) {
                try {
                    // Execute inline script
                    eval(script.textContent);
                } catch (error) {
                    console.error('Error executing inline script:', error);
                    // Continue to next script even if this one failed
                }
            }
        }
        
        console.log('All scripts loaded');
    }

    protected finishHTMLInitialization() {
        // TODO: The new Skip component architecture uses a completely different approach
        // for bootstrapping generated code. The old init function approach is deprecated.
        // This needs to be reimplemented to support the new React-based component architecture.
        
        throw new Error('Skip component initialization not yet implemented for new component architecture. This functionality needs to be updated to support the new React-based approach.');
        
        /* Commented out old implementation for reference:
        try {
            if (!this.ComponentObjectName) {
                console.warn('Component object name not provided');
                return;
            }
    
            const componentObject = (window as any)[this.ComponentObjectName];
            const md = new Metadata();
            if (componentObject && this.SkipData?.dataContext) {
                const castedObject = componentObject as SkipComponentObject;
                const userState = {};
    
                const flattenedDataContext: Record<string, any> = {};
                // Flatten the data context to make it easier to work with

                const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
                for (let i = 0; i < loadedItems.length; i++) {
                    flattenedDataContext["data_item_" + i] = loadedItems[i]._Data;
                }
    

                const params: SkipComponentInitParams = {
                    data: flattenedDataContext,
                    userState: userState,
                    utilities: this.SetupUtilities(md),
                    styles: this.SetupStyles(),
                    callbacks: this.SetupCallbacks(),
                };
                
                // Old approach with init function no longer applies
            }
            else {
                console.warn(`Component object ${this.ComponentObjectName} not found or invalid data context`);
            }
        }
        catch (e) {
            LogError(e);
        }
        */
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
}
