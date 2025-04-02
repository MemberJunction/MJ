import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CompositeKey, GetEntityNameFromSchemaAndViewString, Metadata, RunView } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse, SkipHTMLReportInitFunction } from '@memberjunction/skip-types';
import { DrillDownInfo } from '../drill-down-info';
import { InvokeManualResize } from '@memberjunction/global';

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
    @Input() HTMLReportInitFunctionName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    constructor(private el: ElementRef) { }
  
    public async PrintReport() {
        // Implement printing of the HTML element only here
    }

    ngAfterViewInit() {
        // here we want to dynamically inject the HTML that was AI generated
        if (this.HTMLReport) {
            const container = this.el.nativeElement.querySelector('#htmlContainer');
            if (container) {
                container.innerHTML = this.HTMLReport;
                // call the function for the embedded generated HTML report to pass it updated data
                if (this.HTMLReportInitFunctionName && this.SkipData) {
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
            this.HTMLReportInitFunctionName = d.htmlReportInitFunctionName;
        }
        if (d && hadData) {
            // normally the initFunction is called in ngAfterViewInit, but here the data changed so we need to call it again
            this.invokeHTMLInitFunction();
        }
    }

    private invokeHTMLInitFunction() {
        const container = this.el.nativeElement.querySelector('#htmlContainer');
        if (container && this.HTMLReportInitFunctionName) {
            const initFunction = (window as any)[this.HTMLReportInitFunctionName];
            if (initFunction && this.SkipData?.dataContext) {
                const castedFunction = initFunction as SkipHTMLReportInitFunction;
                const userState = {};
                castedFunction(this.SkipData.dataContext, userState, {
                    RefreshData: () => {
                        // this is a callback function that can be called from the HTML report to refresh data
                        console.log('HTML Report requested data refresh');
                        // need to implement this
                    },
                    OpenEntityRecord: (entityName: string, key: CompositeKey) => {
                        // this is a callback function that can be called from the HTML report to open an entity record
                        const entityId = GetEntityNameFromSchemaAndViewString(entityName);
                        if (entityId) {
                            // bubble this up to our parent component as we don't directly open records in this component
                            this.DrillDownEvent.emit(new DrillDownInfo(entityId, key.ToURLSegment()));
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
                console.warn(`HTML Report init function ${this.HTMLReportInitFunctionName} not found or invalid data context`);
            }
        }
        else {
            console.warn('HTML Report container not found or init function name not provided');
        }
    }
}
