import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CompositeKey, GetEntityNameFromSchemaAndViewString, KeyValuePair, LogError, Metadata, RunView } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse, SkipHTMLReportInitFunction, SkipHTMLReportObject, SkipHTMLReportOption } from '@memberjunction/skip-types';
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
    @Input() HTMLReportObjectName: string | null = null;
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
                if (this.HTMLReportObjectName && this.SkipData) {
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
            this.setupReportOptions(d);
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
            if (container && this.HTMLReportObjectName) {
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
        try {
            if (!this.HTMLReportObjectName) {
                console.warn('HTML Report object name not provided');
                return;
            }
    
            const reportObject = (window as any)[this.HTMLReportObjectName];
            const md = new Metadata();
            if (reportObject && this.SkipData?.dataContext) {
                const castedObject = reportObject as SkipHTMLReportObject;
                const userState = {};
    
                const flattenedDataContext: Record<string, any> = {};
                // Flatten the data context to make it easier to work with

                const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
                for (let i = 0; i < loadedItems.length; i++) {
                    flattenedDataContext["data_item_" + i] = loadedItems[i]._Data;
                }
    
                castedObject.init(flattenedDataContext, userState, {
                    RefreshData: () => {
                        // this is a callback function that can be called from the HTML report to refresh data
                        console.log('HTML Report requested data refresh');
                        // need to implement this
                    },
                    OpenEntityRecord: (entityName: string, key: CompositeKey) => {
                        // this is a callback function that can be called from the HTML report to open an entity record
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
                        // this is a callback function that can be called from the HTML report to update user state
                        console.log('HTML Report updated user state:', userState);
                        // need to implement this
                    },
                    NotifyEvent: (eventName: string, eventData: any) => {
                        // this is a callback function that can be called from the HTML report to notify an event
                        console.log(`HTML Report raised event: ${eventName} notified with data:`, eventData);
                    }
                });
            }
            else {
                console.warn(`HTML Report object ${this.HTMLReportObjectName} not found or invalid data context`);
            }
        }
        catch (e) {
            LogError(e);
        }         
    }
}
