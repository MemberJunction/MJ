import { Component, Input } from '@angular/core';
import { SeriesType, CategoryAxisTitle } from '@progress/kendo-angular-charts';
import { SkipColumnInfo, SkipData } from '../ask-skip/ask-skip.component';
import { EntityFieldTSType, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { SeriesClickEvent } from '@progress/kendo-angular-charts';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/ng-shared';

@Component({
  selector: 'mj-dynamic-chart',
  template: `
    <plotly-plot #plotlyPlot [data]="plotData" [layout]="plotLayout" ></plotly-plot>
  ` 
})
export class DynamicChartComponent {
    @Input() plotData: any;
    @Input() plotLayout: any;

    private _skipData: SkipData | undefined;
    @Input() get SkipData(): SkipData | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipData | undefined){
        this._skipData = d;
        if (d) {
            this.plotData = d.executionResults?.plotData?.data;
            this.plotLayout = d.executionResults?.plotData?.layout;
        }
    }

   
    public onChartSeriesClick(e: SeriesClickEvent): void {
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
    }
}