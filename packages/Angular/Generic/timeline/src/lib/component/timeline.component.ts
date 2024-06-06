import { Component, OnInit, Input, EventEmitter, Output, AfterViewInit } from '@angular/core';

import { BaseEntity, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared'
import { Router } from '@angular/router';

import { SchedulerEvent } from '@progress/kendo-angular-scheduler';
import { sampleData, displayDate } from './dummy-data';

/**
 * 
 */
export class TimelineGroup {
  /**
   * Entity name for the type of records to be displayed in this group
   */
  EntityName!: string;
  /**
   * The actual data you want displayed in this group. This is an array of BaseEntity objects that will be displayed in the timeline. You can populate this array from a view or any other source.
   */
  EntityObjects: BaseEntity[] = [];
  /**
   * The name of the field in the entity that contains the title of the record that will be displayed in the timeline
   */
  TitleFieldName!: string;
  /**
   * The name of the field in the entity that contains the date that will be used for the ordering in the timeline
   */
  DateFieldName!: string;
  /**
   * Use standard or custom icons, if custom is specified, the DisplayIcon property must be set
   */
  DisplayIconMode: 'standard' | 'custom' = 'standard';
  /**
   * Only used if DisplayIconMode is set to custom, the CSS class name to use from Font Awesome (or any other library that has styles pre-loaded), for the span that will be shown
   */
  DisplayIcon?: string;
  /**
   * Color mode for items in this group, defaults to auto-selected in which case the color will be determined by the system automatically based on the # of groups
   */
  DisplayColorMode: 'auto' | 'manual' = 'auto';
  /**
   * Only used if DisplayColorMode is set to manual, the color to use for the items in this group. Any valid color string that can be set into the element style via CSS is valid here.
   */
  DisplayColor?: string;

  /**
   * When set to field, the SummaryFieldName will be used to display detailed information about the record in the timeline. If set to custom, you need to provide
   * a function for the SummaryFunction property. If set to none, no summary will be displayed.
   */
  SummaryMode: 'field' | 'custom' | 'none' = 'field';
  /**
   * When SummaryMode is set to 'custom', this function will be used to generate the summary for the record. The function should take a single parameter, the BaseEntity object and will return a string.
   * The string returned can be plain text or HTML and will be displayed in the timeline.
   */
  SummaryFunction?: ((record: BaseEntity) => string) | undefined;

  /**
   * Creates a new instance of the TimelineGroup class using the information from the RunViewParams provided.
   * After receiving back the new object, you can set other properties of the new instance as appropriate.
   * @param params 
   * @returns 
   */
  public static async FromView(params: RunViewParams): Promise<TimelineGroup> {
    const group = new TimelineGroup();
    const rv = new RunView();
    params.ResultType = 'entity_object'; // this might be already set but we want to make sure of it
    const result = await rv.RunView(params);
    if (result && result.Success) {
      group.EntityName = await RunView.GetEntityNameFromRunViewParams(params);
      group.EntityObjects = result.Results;
    }
    return group;
  }
}

/**
 * Displays data on a timeline UI so that information can see a chronolgoical display of the provided data.
 */
@Component({
  selector: 'mj-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css']
})
export class TimelineComponent implements AfterViewInit { 
  /**
   * Provide an array of one or more TimelineGroup objects to display the data in the timeline. Each group will be displayed in a different color and icon.
   */
  @Input() public Groups: TimelineGroup[] = [];
  @Input() public record: BaseEntity|null = null; 

  public created!: Date;
  public updated!: Date;
  public name!: string;
  public selectedDate: Date = displayDate;
  public events: SchedulerEvent[] = [];

  ngAfterViewInit(): void {
    if(!this.record){
      console.log("record is null")
      return
    }
 
    const g=  this.Groups[0];
    this.events = g.EntityObjects.map(e => {
      let date = new Date(e.Get(g.DateFieldName));
      let title = e.Get(g.TitleFieldName);
      let summary = "";
      if (g.SummaryMode == 'field') {
        summary = e.Get(g.TitleFieldName);
      } else if (g.SummaryMode == 'custom' && g.SummaryFunction) {
        summary = g.SummaryFunction(e);
      }
      return {
        id: e.Get("ID"),
        title: title,
        start: date,
        end: date,
        isAllDay: true,
        description: summary,
        color: g.DisplayColor,
        icon: g.DisplayIcon,
      };
    });
    // let created = new Date(this.record.Get("CreatedAt"));
    // let updated = new Date(this.record.Get("UpdatedAt"));
    // let name = this.record.Get("Name"); 
    // console.log(name)

    // this.events = [
    //   {
    //     id: 1,
    //     title: "CreatedAt",
    //     start: created,
    //     end: created,
    //     isAllDay: true, 
    //   },
    //   {
    //     id: 2,
    //     title: "UpdatedAt",
    //     start: updated,
    //     end: updated,
    //     isAllDay: true, 
    //   },
    // ];
  }
  
}
