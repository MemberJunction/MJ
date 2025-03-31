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
    @Input() HTMLReportText: string | undefined;
    @Input() InitFunctionName: string | undefined;
    @Input() ShowPrintReport: boolean = true;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    constructor(private el: ElementRef) { }
  
    public async PrintReport() {
        // Implement printing of the HTML element only here
    }

    ngAfterViewInit() {
        // here we want to dynamically inject the HTML that was AI generated
        if (this.HTMLReportText) {
            const container = this.el.nativeElement.querySelector('#htmlContainer');
            if (container) {
                container.innerHTML = this.HTMLReportText;
                // call the function for the embedded generated HTML report to pass it updated data
                if (this.InitFunctionName && this.SkipData) {
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
        if (d && hadData) {
            // normally the initFunction is called in ngAfterViewInit, but here the data changed so we need to call it again
            this.invokeHTMLInitFunction();
        }
    }

    private invokeHTMLInitFunction() {
        const container = this.el.nativeElement.querySelector('#htmlContainer');
        if (container && this.InitFunctionName) {
            const initFunction = (window as any)[this.InitFunctionName];
            if (initFunction && this.SkipData) {
                const castedFunction = initFunction as SkipHTMLReportInitFunction;
                castedFunction(this.SkipData, {
                    RefreshData: () => {
                        // this is a callback function that can be called from the HTML report to refresh the data
                        if (this.SkipData) {
                            this.SkipData = this.SkipData;
                        }
                    },
                    OpenEntityRecord: (entityName: string, key: CompositeKey) => {
                        // this is a callback function that can be called from the HTML report to open an entity record
                        const entityId = GetEntityNameFromSchemaAndViewString(entityName);
                        if (entityId) {
                            // bubble this up to our parent component as we don't directly open records in this component
                            this.DrillDownEvent.emit(new DrillDownInfo(entityId, key.ToURLSegment()));
                        }
                    },
                    NotifyEvent: (eventName: string, eventData: any) => {
                        // this is a callback function that can be called from the HTML report to notify an event
                        console.log(`HTML Report raised event: ${eventName} notified with data:`, eventData);
                    }
                });
            }
        }
    }
}
