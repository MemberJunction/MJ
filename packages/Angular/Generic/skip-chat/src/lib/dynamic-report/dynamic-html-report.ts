import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CompositeKey, GetEntityNameFromSchemaAndViewString, KeyValuePair, LogError, Metadata, RunView } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse, SkipHTMLReportInitFunction, SkipHTMLReportObject } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';
import { InvokeManualResize } from '@memberjunction/global';
import { Meta } from '@angular/platform-browser';
import { DataContext, DataContextItem } from '@memberjunction/data-context';

@Component({
  selector: 'skip-dynamic-html-report',
  template: `
    <button kendoButton *ngIf="ShowPrintReport" (click)="PrintReport()">
      <span class="fa-regular fa-image"></span>
      Print 
    </button>
    <div #htmlContainer mjFillContainer>
        <!-- this is where we'll dynamically inject the HTML that was AI generated -->
    </div>
  `,
  styles: [`button { margin-top: 5px; margin-bottom: 5px;}`] 
})
export class SkipDynamicHTMLReportComponent implements AfterViewInit {
    @Input() HTMLReport: string | null = null;
    @Input() HTMLReportObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    @ViewChild('htmlContainer', { static: false }) htmlContainer!: ElementRef;

    constructor(private cdr: ChangeDetectorRef) { }
  
    public async PrintReport() {
        // Implement printing of the HTML element only here
    }

    ngAfterViewInit() {
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
            this.HTMLReport = d.htmlReport;
            this.HTMLReportObjectName = d.htmlReportObjectName;
        }
        if (d && hadData) {
            // normally the initFunction is called in ngAfterViewInit, but here the data changed so we need to call it again
            this.invokeHTMLInitFunction();
        }
    }

    private invokeHTMLInitFunction() {
        try {
            const container = this.htmlContainer?.nativeElement;
            if (container && this.HTMLReportObjectName) {
                // First set the HTML as is, with script tags
                container.innerHTML = this.HTMLReport; 
                
                // Force Angular to detect changes
                this.cdr.detectChanges();
                
                // Now find and manually execute all scripts in the container
                const scriptElements = container.querySelectorAll('script');
                scriptElements.forEach((script: HTMLScriptElement) => {
                    // For external scripts
                    if (script.src) {
                        // Create a new script element
                        const newScript = document.createElement('script');
                        newScript.src = script.src;
                        document.head.appendChild(newScript);
                    } 
                    // For inline scripts
                    else if (script.textContent) {
                        // Execute the script content directly
                        try {
                            // This will execute the script in global context
                            eval(script.textContent);
                        } catch (error) {
                            console.error('Error executing script:', error);
                        }
                    }
                });
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
