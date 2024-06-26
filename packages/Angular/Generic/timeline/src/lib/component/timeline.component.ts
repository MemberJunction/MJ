import { Component, Input, AfterViewInit } from '@angular/core';

import { BaseEntity, RunView, RunViewParams } from '@memberjunction/core';

import { Orientation, TimelineEvent } from "@progress/kendo-angular-layout";

/**
 * 
 */
export class TimelineGroup {
  /**
   * Entity name for the type of records to be displayed in this group
   */
  EntityName!: string;
  /**
   * Specifies if the data will come from a provided array of BaseEntity objects - the EntityObjects array, or alternatively, from this object running its own view against the provided EntityName, optionally with a provided Filter (or without).
   */
  DataSourceType: 'array' | 'entity' = 'entity';
  /**
   * An optional filter that will be applied to the entity specified to reduce the number of records displayed
   */
  Filter?: string
  /**
   * The actual data you want displayed in this group. This is an array of BaseEntity objects that will be displayed in the timeline. You can populate this array from a view or any other source.
   */
  EntityObjects?: BaseEntity[] = [];
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
  DisplayIconMode?: 'standard' | 'custom' = 'standard';
  /**
   * Only used if DisplayIconMode is set to custom, the CSS class name to use from Font Awesome (or any other library that has styles pre-loaded), for the span that will be shown
   */
  DisplayIcon?: string;
  /**
   * Color mode for items in this group, defaults to auto-selected in which case the color will be determined by the system automatically based on the # of groups
   */
  DisplayColorMode?: 'auto' | 'manual' = 'auto';
  /**
   * Only used if DisplayColorMode is set to manual, the color to use for the items in this group. Any valid color string that can be set into the element style via CSS is valid here.
   */
  DisplayColor?: string;

  /**
   * When set to field, the SummaryFieldName will be used to display detailed information about the record in the timeline. If set to custom, you need to provide
   * a function for the SummaryFunction property. If set to none, no summary will be displayed.
   */
  SummaryMode?: 'field' | 'custom' | 'none' = 'field';
  /**
   * When SummaryMode is set to 'custom', this function will be used to generate the summary for the record. The function should take a single parameter, the BaseEntity object and will return a string.
   * The string returned can be plain text or HTML and will be displayed in the timeline.
   */
  SummaryFunction?: ((record: any) => string) | undefined;

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

  @Input() DisplayOrientation: 'horizontal' | 'vertical' = 'vertical';

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
  * timelineGroupEvents is the array of total timeline events that will get called used by the timeline component.
  */
  public events: TimelineEvent[] = [];

  async ngAfterViewInit() {
    if (this.AllowLoad)
      await this.Refresh();
  }


  /**
   * This method refreshes the timeline with the data from the provided parameters.
   */
  public async Refresh() {
    this.events.splice(0, this.events.length); // clear out what we have
    if (this.Groups && this.Groups.length > 0) {
      for (const g of this.Groups) {
        await this.LoadSingleGroup(g);
      }
    }
  }

  /**
   * This method loads the data for a single group and adds it to the timelineGroupEvents array.
   * @param group 
   */
  protected async LoadSingleGroup(group: TimelineGroup) {
    // load up the events for the specified group into the events array
    let newItems: TimelineEvent[] = [];

    switch (group.DataSourceType) {
      case 'array':
        // use the provided array
        if (!group.EntityObjects)
          throw new Error("No EntityObjects provided for group");
        newItems = this.mapEntityObjectsToEvents(group, group.EntityObjects!);
        break;
      case 'entity':
        // use run view
        const rv = new RunView();
        const result = await rv.RunView({
          EntityName: group.EntityName,
          ExtraFilter: group.Filter,
          ResultType: 'entity_object'
        });
        if (result && result.Success)
          newItems = this.mapEntityObjectsToEvents(group, result.Results);
        break;
    }

    this.events.push(...newItems);
  }

  protected mapEntityObjectsToEvents(group: TimelineGroup, entityObjects: BaseEntity[]): TimelineEvent[] {
    const ret: TimelineEvent[] = entityObjects.map(e => {
      let date = new Date(e.Get(group.DateFieldName));
      let title = e.Get(group.TitleFieldName);
      let summary = "";
      if (group.SummaryMode == 'field') {
        summary = e.Get(group.TitleFieldName);
      } else if (group.SummaryMode == 'custom') {
        summary = group.SummaryFunction ? group.SummaryFunction(e) : "";
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
    return ret;
  }
}