import { Component, OnInit, Input, EventEmitter, Output, AfterViewInit } from '@angular/core';

import { BaseEntity, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared'
import { Router } from '@angular/router';

import { TimelineEvent } from "@progress/kendo-angular-layout";
import { FloatingActionButtonTemplateDirective } from '@progress/kendo-angular-buttons';

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
    const result = await rv.RunView<BaseEntity>(params);
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
  private _groups: TimelineGroup[] = [];

  /**
   * Provide an array of one or more TimelineGroup objects to display the data in the timeline. Each group will be displayed in a different color and icon.
   */
  @Input() public get Groups(): TimelineGroup[] {
    return this._groups;
  }
  public set Groups(value: TimelineGroup[]) {
    this._groups = value;
    if (this.AllowLoad)
      this.Refresh();
  }

  private _deferLoadCount: number = 0;
  private _allowLoad: boolean = true;
  /**
   * Set this property to false to prevent the timeline from loading the data. This is useful when you want to load the data yourself and then set this property to true to display the data.
   */
  @Input() public get AllowLoad(): boolean {
    return this._allowLoad;
  }
  public set AllowLoad(value: boolean) {
    this._allowLoad = value
    if (value === true && this._deferLoadCount === 0) {
      this._deferLoadCount++; // only do this one time 
      this.Refresh();
    }
  }

  /*
  * events is the array of timeline events that gets updated on each call of LoadSingleGroup. 
  * groupEvents is the array of total timeline events that will get called by the timeline component.
  */
  public events: TimelineEvent[] = [];
  public groupEvents: TimelineEvent[]= [];
  

  ngAfterViewInit(): void {
    if (this.AllowLoad)
      this.Refresh();
  }


  /**
   * This method refreshes the timeline with the data from the provided parameters.
   */
  public Refresh() {
    if (this.Groups && this.Groups.length > 0) {
      this.Groups.forEach(g => this.LoadSingleGroup(g));
    }
  }

  public SummaryFunction(record: BaseEntity): string {
    let first_name = record.Get('Name');

    return  first_name;
  }

  protected LoadSingleGroup(group: TimelineGroup) {
    group.SummaryMode = 'custom';
    this.events = group.EntityObjects.map(e => {
      let date = new Date(e.Get(group.DateFieldName));
      let title = group.TitleFieldName;
      let summary = "";
      if (group.SummaryMode == 'field') {
        summary = e.Get(group.EntityName);
      } else if (group.SummaryMode == 'custom') {
        summary = this.SummaryFunction(e);
      }
      return {
        description: summary,
        date: date,
        title: title,
        subtitle: date.toDateString(),
        images: [],
        actions: [],
      };
    })
    this.groupEvents = this.groupEvents.concat(this.events);
  }
  
}
