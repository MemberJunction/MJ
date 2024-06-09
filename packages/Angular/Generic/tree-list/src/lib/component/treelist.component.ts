import { Component, OnInit, Input, EventEmitter, Output, AfterViewInit } from '@angular/core';

import { BaseEntity, Metadata, RunView, RunViewParams } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared'
import { Router } from '@angular/router';

/**
 * 
 */
export class TreelistGroup {
  /**
   * Entity name for the type of records to be displayed in this group
   */
  EntityName!: string;
  /**
   * The actual data you want displayed in this group. This is an array of BaseEntity objects that will be displayed in the treelist. You can populate this array from a view or any other source.
   */
  EntityObjects: BaseEntity[] = [];
  /**
   * The name of the field in the entity that contains the title of the record that will be displayed in the treelist
   */
  TitleFieldName!: string;
  /**
   * 
   */
  DealTypeID!: string;
  /**
   * Only used if DisplayIconMode is set to custom, the CSS class name to use from Font Awesome (or any other library that has styles pre-loaded), for the span that will be shown
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
   * Creates a new instance of the TreelistGroup class using the information from the RunViewParams provided.
   * After receiving back the new object, you can set other properties of the new instance as appropriate.
   * @param params 
   * @returns 
   */
  public static async CreateFromRunViewParams(params: RunViewParams): Promise<TreelistGroup> {
    const group = new TreelistGroup();
    const rv = new RunView();
    params.ResultType = 'entity_object'; // this might be already set but we want to make sure of it
    const result = await rv.RunView<BaseEntity>(params);
    if (result && result.Success) {
      group.EntityName = await RunView.GetEntityNameFromRunViewParams(params);
      group.EntityObjects = result.Results;
    }
    return group
  }
}

@Component({
  selector: 'mj-treelist',
  templateUrl: './treelist.component.html',
  styleUrls: ['./treelist.component.css']
})
export class TreelistComponent implements AfterViewInit {
  private _deferLoadCount: number = 0;
  private _allowLoad: boolean = true;
  private _groups: TreelistGroup[] = [];
  public data: any[] = [];
  
  public get Groups(): TreelistGroup[] {
    return this._groups;
  }

  public set Groups(value: TreelistGroup[]) {
    this._groups = value;
    if (this.AllowLoad)
      this.Refresh();
  }

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
  
  ngAfterViewInit(): void {
    
  }

  /**
   * This method refreshes the treelist with the data from the provided parameters.
   */
  public Refresh() {
    if (this.Groups && this.Groups.length > 0) {
      this.Groups.forEach(g => this.LoadSingleGroup(g));
    }
  }

  protected LoadSingleGroup(group: TreelistGroup) {
    this.data = group.EntityObjects.map(e => {
      let title = e.Get(group.TitleFieldName);
      let summary = "";
      if (group.SummaryMode == 'field') {
        summary = e.Get(group.TitleFieldName);
      } else if (group.SummaryMode == 'custom' && group.SummaryFunction) {
        summary = group.SummaryFunction(e);
      }
      return {
        id: e.Get("ID"),
        dealID: e.Get(group.DealTypeID), // this is the parent ID for the record, if any (for example, the deal ID for a task record
        title: title,
        description: summary,
        color: group.DisplayColor,
        icon: group.DisplayIcon,
      };
    });
  }

}


