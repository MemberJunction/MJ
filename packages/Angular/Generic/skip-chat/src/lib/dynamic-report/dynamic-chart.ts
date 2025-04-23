import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { GetEntityNameFromSchemaAndViewString, Metadata, RunView } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { PlotlyModule } from 'angular-plotly.js';
import * as Plotly from 'plotly.js-dist-min';
import { DrillDownInfo } from '../drill-down-info';
import { InvokeManualResize } from '@memberjunction/global';
import { ReportTypeEntity } from '@memberjunction/core-entities';

const SKIP_DYNAMIC_CHART = 'Skip Dynamic Chart';

interface ReportTypeConfig {
  plot_bgcolor: string;
  font: FontConfig;
  colorway: string[];
  margin: MarginConfig;
  title: TitleConfig;
  xaxis: AxisConfig;
  yaxis: AxisConfig;
  legend: LegendConfig;
}

interface FontConfig {
  /** e.g. "Roboto, sans-serif" */
  family?: string;
  size: number;
  /** CSS color string, e.g. "#000" */
  color: string;
}

interface MarginConfig {
  l: number;
  r: number;
  t: number;
  b: number;
}

interface TitleConfig {
  font: FontConfig;
}

interface AxisConfig {
  automargin: boolean;
  tickangle: number;
  ticklabelposition: string;
  tickpadding: number;
  title: TitleConfig;
}

interface LegendConfig {
  x: number;
  xanchor: string;
}

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

    @ViewChild('plotlyPlot') plotlyPlot!: PlotlyModule;
    @ViewChild('plotContainer') plotContainer!: ElementRef;

    private resizeObserver: ResizeObserver | undefined;
    private _md: Metadata | undefined;

    constructor(private el: ElementRef) { 
      this._md = new Metadata();
    }
  
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
        // Invoke manual resize to ensure the chart is sized correctly
        InvokeManualResize();
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
        console.log(d)
        if (d) {
            this.plotData = d.executionResults?.plotData?.data;

            // Parse the Report Type configuration as a JSON object
            const chartConfigString = this._md?.ReportTypes?.find(rt => rt.Name === SKIP_DYNAMIC_CHART)?.Configuration;
            const chartConfig: ReportTypeConfig = chartConfigString ? JSON.parse(chartConfigString) : undefined;
            
            this.plotLayout = {
              ...this.plotLayout = d.executionResults?.plotData?.layout, // Preserve existing layout properties
              plot_bgcolor: chartConfig?.plot_bgcolor || '#f8f9fa',
              font: {
                family: chartConfig?.font?.family || 'Roboto, sans-serif',
                size: chartConfig?.font?.size || 12,
                color: chartConfig?.font?.color || '#000'             
              },
              colorway: chartConfig?.colorway || 
              [
                "#6EBBE4", // original
                "#4DAEE0", // cooler medium blue
                "#389FD5", // stronger sky blue
                "#1B91CB", // modern vibrant blue
                "#007BC1", // deep ocean blue
                "#0069AC", // navy-leaning blue
                "#2B87C9", // saturated cool blue
                "#5DA5D7", // balanced, web-safe vibe
                "#7AC3EA", // light, modern feel
                "#A2D8F2", // pale cyan blue
                "#CBE9F8", // softest cool tint
                "#E6F4FB"  // whisper blue (background-worthy)
              ],
              margin: chartConfig?.margin ||
              {
                l: 40,
                r: 40,
                t: 120,
                b: 120  // Give more space at the bottom if labels are long
              },
              title: {
                text: d.executionResults?.plotData?.layout?.title || d.executionResults?.plotData?.layout?.title.text,
                font: chartConfig?.title?.font ||
                {
                  family: 'Roboto, sans-serif',
                  size: 24,
                  color: '#0076B6'
                }
              },
              xaxis: {
                title: {
                  text: d.executionResults?.plotData?.layout?.xaxis?.title || d.executionResults?.plotData?.layout?.xaxis?.title.text,
                  font: chartConfig?.xaxis?.title?.font ||
                  {
                    color: '#0076B6',
                    size: 18,
                  }
                },
                automargin: chartConfig?.xaxis?.automargin || true,
                tickangle: chartConfig?.xaxis?.tickangle || 45,
                ticklabelposition: chartConfig?.xaxis?.ticklabelposition || 'outside',
                tickpadding: chartConfig?.xaxis?.tickpadding || 20,
              },
              yaxis: {
                title: {
                  text: d.executionResults?.plotData?.layout?.yaxis?.title || d.executionResults?.plotData?.layout?.yaxis?.title.text,
                  font: chartConfig?.yaxis?.title?.font ||{
                    color: '#0076B6',
                    size: 18,
                  }
                },
                automargin: chartConfig?.yaxis?.automargin || true,
                ticklabelposition: chartConfig?.yaxis?.ticklabelposition || 'outside',
                tickpadding: chartConfig?.yaxis?.tickpadding || 20 
              },
              legend:
              chartConfig?.legend ||
              {
                x: 1, // Position legend to the far right
                xanchor: 'left'
              }
            };
            if (this.plotLayout) {
              if (this.plotLayout.height === undefined || this.plotLayout.height === null || this.plotLayout.height === 0)
                this.plotLayout.height = this.defaultPlotHeight;
            }
        }
    }
}