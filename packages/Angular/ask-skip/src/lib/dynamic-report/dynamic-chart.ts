import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { PlotlyComponent } from 'angular-plotly.js';
import * as Plotly from 'plotly.js-dist-min';
import { DrillDownInfo } from './dynamic-drill-down';
import { DynamicReportComponent } from './dynamic-report';

@Component({
  selector: 'mj-dynamic-chart',
  template: `
    <button kendoButton *ngIf="ShowSaveAsImage" (click)="SaveChartAsImage()">Save as Image</button>
    <div #plotContainer>
      <plotly-plot #plotlyPlot 
                   [data]="plotData" 
                   [layout]="plotLayout" 
                   mjFillContainer 
                   [useResizeHandler]="true"
                   (plotlyClick)="handleChartClick($event)"></plotly-plot>
    </div>
  ` 
})
export class DynamicChartComponent implements OnInit, OnDestroy {
    @Input() plotData: any;
    @Input() plotLayout: any;
    @Input() defaultPlotHeight: number = 550;
    @Input() ShowSaveAsImage: boolean = true;
    @Input() AllowDrillDown: boolean = true
    @Input() AutoResizeChart: boolean = false
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

    @ViewChild('plotlyPlot') plotlyPlot!: PlotlyComponent;
    @ViewChild('plotContainer') plotContainer!: ElementRef;

    private resizeObserver: ResizeObserver | undefined;

    constructor(private el: ElementRef) { }
  
    ngOnInit() {
      if (this.AutoResizeChart)
        this.setupResizeObserver();
    }
  
    ngOnDestroy() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
    }

    public async SaveChartAsImage() {
      if (this.plotlyPlot) {
        const el = this.plotContainer.nativeElement.querySelector('.js-plotly-plot');
        const image = await Plotly.toImage(el, {format: 'png'} as Plotly.ToImgopts)
        if (image) {
          // Create an <a> element
          const downloadLink = document.createElement('a');
          // Set the download attribute with a default file name
          downloadLink.download = this.SkipData?.reportTitle || this.plotLayout?.title || 'chart.png';
          // Set the href to the data URL
          downloadLink.href = image;
          // Append the <a> element to the body (required for Firefox)
          document.body.appendChild(downloadLink);
          // Programmatically trigger a click on the <a> element
          downloadLink.click();
          // Remove the <a> element after download
          document.body.removeChild(downloadLink);
        }
      }
    }

    public async handleChartClick(chartClickEvent: any) {
      try {
        if (!this.AllowDrillDown)
          return;

        const drillDownValue = chartClickEvent.points[0].label;
        const drillDown = this.SkipData?.drillDown;
        if (drillDown && drillDownValue && drillDownValue.length > 0 ) {
          // we have a valid situation to drill down where we have the configuration and we have a drill down value. 
          // we can navigate to the drill down view
          const entityName = DynamicReportComponent.GetEntityNameFromSchemaAndViewString(drillDown.viewName);

          if (entityName) {
            const filterSQL = drillDown.filters.map(f => {
              const isDateValue = drillDownValue instanceof Date;
              const isNumberValue = !isNaN(parseFloat(drillDownValue));
              const needsQuotes = isDateValue ? true : (isNumberValue ? false : true);
              const quotes = needsQuotes ? "'" : '';
              return `${f.viewFieldName} = ${quotes}${drillDownValue}${quotes}`
            }).join(' AND ');
            this.DrillDownEvent.emit(new DrillDownInfo(entityName, filterSQL));
          }
        }
      }
      catch (e) {
        console.warn('Error handling chart click', e)
      }
    }
 
    setupResizeObserver() {
        // Invoke manual resize from SharedService.Instance to ensure the chart is sized correctly
        SharedService.Instance.InvokeManualResize();
        // now wait 1ms - which really just results in the event loop being processed and the manual resize being invoked
        setTimeout(() => {
            this.resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const { height } = entry.contentRect;
                    this.updateChartHeight(height);
                }
            });
            this.resizeObserver.observe(this.el.nativeElement);
        }, 1);
    }

    updateChartHeight(newHeight: number) {
        if (this.plotLayout)
            this.plotLayout.height = newHeight;
    }

    private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
        this._skipData = d;
        if (d) {
            this.plotData = d.executionResults?.plotData?.data;
            this.plotLayout = d.executionResults?.plotData?.layout;
            if (this.plotLayout) {
              if (this.plotLayout.height === undefined || this.plotLayout.height === null || this.plotLayout.height === 0)
                this.plotLayout.height = this.defaultPlotHeight;
            }
        }
    }

   
    // TO DO
    // below was used with Kendo charts, but we are now using Plotly
    // we should wire this type of behavior up to Plotly too if we have the drill down info from Skip
    //public onChartSeriesClick(e: SeriesClickEvent): void {
        // try {
        //     const drillDownValue = e.category; // contains the category for the clicked series item
        //     const ddBaseViewField = this.SkipData?.DrillDownBaseViewField ;
        //     const ddV = this.SkipData?.DrillDownView;
        //     if (ddBaseViewField && ddV && ddBaseViewField.length > 0 && ddV.length > 0 && drillDownValue && drillDownValue.length > 0 ) {
        //         // we have a valid situation to drill down where we have the configuration and we have a drill down value. 
        //         const md = new Metadata();
        //         const e = md.Entities.find(x => x.BaseView.trim().toLowerCase() === ddV.trim().toLowerCase());
        //         if (e) {
        //             // we have a valid entity for the drill down view
        //             // now that we've validated all of this, we can navigate to the drill down view
        //             // which is simply a dynamic view for a given entity with a filter applied
        //             const rd = new ResourceData();
        //             const ef = e.Fields.find(ef => ef.Name.trim().toLowerCase() === ddBaseViewField.trim().toLowerCase());
        //             // next, fix up the drill down value to wrap with quotes if we need if we are a string or  date, and also if a string, escape any single quotes
        //             let filterVal: string = drillDownValue;
        //             if (ef?.TSType === EntityFieldTSType.String) {
        //                 filterVal = `'${filterVal.replace(/'/g, "''")}'`;
        //             }
        //             else if (ef?.TSType === EntityFieldTSType.Date) {
        //                 filterVal = `'${filterVal}'`;
        //             }
    
        //             rd.ResourceTypeID = SharedService.Instance.ViewResourceType.ID;
        //             rd.ResourceRecordID = 0;
        //             rd.Configuration = {
        //                 Entity: e.Name,
        //                 ExtraFilter: `${ddBaseViewField} = ${filterVal}`,
        //             }
    
        //             // now we've built up our ResourceData object, we can raise the event to navigate to the drill down view
        //             LogStatus(`drilling down to ${ddV} with filter ${ddBaseViewField} = ${drillDownValue}`);
        //             MJGlobal.Instance.RaiseEvent({
        //                 component: this,
        //                 event: MJEventType.ComponentEvent,
        //                 eventCode: EventCodes.ViewClicked,
        //                 args: rd
        //             });
        //         }
        //         else
        //             LogError(`Could not find entity for the specified DrillDownView: ${ddV}`);
        //     }
        // }
        // catch (e) {
        //     LogError(e);
        // }
    //}
}