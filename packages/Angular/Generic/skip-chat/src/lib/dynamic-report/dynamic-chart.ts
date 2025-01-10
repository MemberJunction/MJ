import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { GetEntityNameFromSchemaAndViewString, Metadata, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { PlotlyComponent } from 'angular-plotly.js';
import * as Plotly from 'plotly.js-dist-min';
import { DrillDownInfo } from '../drill-down-info';

@Component({
  selector: 'skip-dynamic-chart',
  template: `
    <button kendoButton *ngIf="ShowSaveAsImage" (click)="SaveChartAsImage()">
      <span class="fa-regular fa-image"></span>
      Save 
    </button>
    <div #plotContainer mjFillContainer>
      <plotly-plot #plotlyPlot 
                   [data]="plotData" 
                   [layout]="plotLayout" 
                   mjFillContainer 
                   [useResizeHandler]="true"
                   (plotlyClick)="handleChartClick($event)">
      </plotly-plot>
    </div>
  `,
  styles: [`button { margin-top: 5px; margin-bottom: 5px;}`] 
})
export class SkipDynamicChartComponent implements OnInit, OnDestroy {
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
          const entityName = GetEntityNameFromSchemaAndViewString(drillDown.viewName);

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
                    const { height, width } = entry.contentRect;
                    this.updateChartSize(height - 15, width); // some pixels of margin to make sure it all fits
                }
            });
            this.resizeObserver.observe(this.el.nativeElement);
        }, 1);
    }

    updateChartHeight(newHeight: number) {
      if (this.plotLayout && newHeight > 0)
        this.plotLayout.height = newHeight;
    }
    updateChartSize(newHeight: number, newWidth: number) {
      if (this.plotLayout) {
        if (newHeight > 0)
          this.plotLayout.height = newHeight;

        if (newWidth > 0)
          this.plotLayout.width = newWidth;
      }
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
}