import { Component, Input } from '@angular/core';
import { SeriesType, CategoryAxisTitle } from '@progress/kendo-angular-charts';
import { SkipColumnInfo, SkipData } from '../ask-skip/ask-skip.component';
import { EntityFieldTSType, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { SeriesClickEvent } from '@progress/kendo-angular-charts';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-dynamic-chart',
  template: `
    <kendo-chart mjFillContainer
        (seriesClick)="onChartSeriesClick($event)"
        >
        <kendo-chart-title [text]="chartTitle"></kendo-chart-title>
        <kendo-chart-category-axis>
            <kendo-chart-category-axis-item *ngFor="let axis of chartCategoryAxes" [title]="axis.title" [categories]="axis.categories"></kendo-chart-category-axis-item>
        </kendo-chart-category-axis>
        <kendo-chart-series>
            <kendo-chart-series-item *ngFor="let item of chartSeries" 
                                     [color]="getSeriesColor(item)"
                                     [type]="kendoSeriesType" 
                                     [data]="item.data" 
                                     [name]="item.name"></kendo-chart-series-item>
        </kendo-chart-series>
    </kendo-chart>
  ` 
})
export class DynamicChartComponent {
    private _data: any[] = [];
    @Input() get data(): any[] {
        return this._data;
    }
    set data(value: any[]) {
        // reset the series and axes when the data changes
        this._series = [];
        this._axes = []; 
        this._data = value;
    }
    @Input() chartTitle: string = 'Chart Title';
    @Input() chartType: string = 'column';
    @Input() xAxis: string | string[] | null = null;
    @Input() yAxis: string | string[] | null = null;
    @Input() xLabel: string = '';
    @Input() yLabel: string = '';
    @Input() columns: SkipColumnInfo[] = [];

    private _skipData: SkipData | undefined;
    @Input() get SkipData(): SkipData | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipData | undefined){
        this._skipData = d;
        if (d) {
            this.data = d.SQLResults.results;
            this.columns = d.SQLResults.columns;
            this.xAxis = d.ChartOptions.xAxis;
            this.xLabel = d.ChartOptions.xLabel;
            this.yLabel = d.ChartOptions.yLabel;
            this.yAxis = d.ChartOptions.yAxis;
            this.chartType = d.DisplayType;
            this.chartTitle = d.ReportTitle;      
        }
    }


    public get kendoSeriesType(): SeriesType {
        return <SeriesType>this.chartType;
    }
    
    private _axes: {categories: string[], title: CategoryAxisTitle}[] = [];
    public get chartCategoryAxes() {
        if (this._axes.length === 0) {
            const result: {categories: string[], title: CategoryAxisTitle}[] = [];
            if (this.xAxis) {
                const xArray = this.convertAxisToArray(this.xAxis);
                for (let i = 0; i < xArray.length; i++) {
                    const xItem = xArray[i];
                    if (xItem !== null && xItem !== undefined && xItem.length > 0)
                        result.push({ 
                                categories: this.data.map(x => x[xItem]),
                                title: { text: this.xLabel }
                            });
                }
            }
            this._axes = result;
            return result;      
        }
        else {
            return this._axes;
        }          
    }

    protected convertAxisToArray(axis: string | string[] | null): string[] {
        if (Array.isArray(axis)) {
            return axis;
        }
        else if (axis !== null && axis !== undefined && axis.length > 0) {
            if (!axis.includes(',')) {
                return [axis];
            }
            else 
                return axis.split(',');
        }
        else 
            return [];
    }


    private _series: any[] = [];
    public get chartSeries() {
        if (this._series.length === 0) {            
            const result = [];
            if (this.yAxis) {
                const yArray = this.convertAxisToArray(this.yAxis);
                for (let i = 0; i < yArray.length; i++) {
                    const yItem = yArray[i];
                    if (yItem !== null && yItem !== undefined && yItem.length > 0) {
                        const colDisplayName = this.columns.find(col => col.FieldName === yItem)?.DisplayName || yItem;
                        result.push({ data: this.data.map(x => x[yItem]), name: colDisplayName });
                    }
                }
            }
            this._series = result;
            return result;        
        }
        else {
            return this._series;
        }
    }

    // simple default colors
    private colors: string[] = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
        '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
        '#000000', '#7cb9e8', '#c9ffe5', '#b284be', '#5d8aa8', '#00308f', '#72a0c1', '#e32636', '#c46210', '#efdecd'
    ];

    public getSeriesColor(item: any): string {
        try {
            const c = this.SkipData?.ChartOptions.color;
            if (c && c.length > 0) {
                // use the configured color since it was provided
                return c;
            }
            else {
                const index = this.chartSeries.indexOf(item);
                return this.colors[index % this.colors.length];        
            }
        }
        catch (ex) {
            LogError(ex);
            return '#000000';
        }
    }

 
    public onChartSeriesClick(e: SeriesClickEvent): void {
        try {
            const drillDownValue = e.category; // contains the category for the clicked series item
            const ddBaseViewField = this.SkipData?.DrillDownBaseViewField ;
            const ddV = this.SkipData?.DrillDownView;
            if (ddBaseViewField && ddV && ddBaseViewField.length > 0 && ddV.length > 0 && drillDownValue && drillDownValue.length > 0 ) {
                // we have a valid situation to drill down where we have the configuration and we have a drill down value. 
                const md = new Metadata();
                const e = md.Entities.find(x => x.BaseView.trim().toLowerCase() === ddV.trim().toLowerCase());
                if (e) {
                    // we have a valid entity for the drill down view
                    // now that we've validated all of this, we can navigate to the drill down view
                    // which is simply a dynamic view for a given entity with a filter applied
                    const rd = new ResourceData();
                    const ef = e.Fields.find(ef => ef.Name.trim().toLowerCase() === ddBaseViewField.trim().toLowerCase());
                    // next, fix up the drill down value to wrap with quotes if we need if we are a string or  date, and also if a string, escape any single quotes
                    let filterVal: string = drillDownValue;
                    if (ef?.TSType === EntityFieldTSType.String) {
                        filterVal = `'${filterVal.replace(/'/g, "''")}'`;
                    }
                    else if (ef?.TSType === EntityFieldTSType.Date) {
                        filterVal = `'${filterVal}'`;
                    }
    
                    rd.ResourceTypeID = SharedService.Instance.ViewResourceType.ID;
                    rd.ResourceRecordID = 0;
                    rd.Configuration = {
                        Entity: e.Name,
                        ExtraFilter: `${ddBaseViewField} = ${filterVal}`,
                    }
    
                    // now we've built up our ResourceData object, we can raise the event to navigate to the drill down view
                    LogStatus(`drilling down to ${ddV} with filter ${ddBaseViewField} = ${drillDownValue}`);
                    MJGlobal.Instance.RaiseEvent({
                        component: this,
                        event: MJEventType.ComponentEvent,
                        eventCode: EventCodes.ViewClicked,
                        args: rd
                    });
                }
                else
                    LogError(`Could not find entity for the specified DrillDownView: ${ddV}`);
            }
        }
        catch (e) {
            LogError(e);
        }
    }
}