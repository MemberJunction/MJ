import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit } from '@angular/core';

import { Metadata, BaseEntity, LogError, KeyValuePair, RunQueryParams, RunQuery } from '@memberjunction/core';

import { CellClickEvent, GridDataResult, PageChangeEvent, GridComponent, SelectableSettings} from "@progress/kendo-angular-grid";

import { ExcelExportComponent } from '@progress/kendo-angular-excel-export';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';

export type GridRowClickedEvent = {
  entityId: number;
  entityName: string;
  KeyValuePairs: KeyValuePair[];
}

/**
 * @deprecated Use `mj-query-viewer` from `@memberjunction/ng-query-viewer` instead.
 * This component is deprecated and will be removed in a future version.
 * The new QueryViewerComponent provides better features including:
 * - State persistence to User Settings
 * - Parameter persistence
 * - Entity linking for clickable record IDs
 * - Auto-run capability
 */
@Component({
  selector: 'mj-query-grid',
  templateUrl: './ng-query-grid.component.html',
  styleUrls: ['./ng-query-grid.component.css']
})
export class QueryGridComponent implements OnInit, AfterViewInit {
  title = 'QueryGrid';
  @Input() Params: RunQueryParams | undefined;
  @Input() BottomMargin: number = 0;
  @Input() InEditMode: boolean = false;
  @Input() EditMode: "None" | "Save" | "Queue" = "None"
  @Input() AutoNavigate: boolean = true;

  @Output() rowClicked = new EventEmitter<GridRowClickedEvent>();

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;
  @ViewChild('excelExport', { read: ExcelExportComponent }) kendoExcelExport: ExcelExportComponent | null = null;

  public queryData: any[] = [];
  public totalRowCount: number = 0;
  public entityRecord: BaseEntity | null = null; 
  public skip: number = 0;
  public pageSize: number = 40;
  public isLoading: boolean = false;
  public gridView: GridDataResult = { data: [], total: 0 };
  public gridHeight: number = 750;

  public selectableSettings: SelectableSettings = {
    enabled: false
  };
  public selectedKeys: any[] = []; 
  public showRefreshButton: boolean = true;

  public viewExecutionTime: number = 0;

 
  public pageChange(event: PageChangeEvent): void {
    this.skip = event.skip;
    this.virtualLoadData();
  }

  private virtualLoadData(): void {
    this.gridView = {
      data: this.queryData.slice(this.skip, this.skip + this.pageSize),
      total: this.queryData.length,
    };
  }

  constructor() {

  } 
 
  protected CreateSimpleNotification(message: string, style: "none" | "success" | "error" | "warning" | "info", duration: number) {
    const data: DisplaySimpleNotificationRequestData = {
      message: message,
      style: style,
      DisplayDuration: duration
    }
    MJGlobal.Instance.RaiseEvent({
      component: this,
      event: MJEventType.DisplaySimpleNotificationRequest,
      eventCode: "",
      args: data
    })
  }
 
  public async cellClickHandler(args: CellClickEvent) {
    // to do implement click handler for a query based on the entity field data
    // bubble up the event to the parent component
    this.rowClicked.emit(
      args.dataItem
    );
  } 
    

  ngOnInit(): void {
    
  }

  ngAfterViewInit(): void {
    //this.setGridHeight();
    if (this.Params)
      this.Refresh(this.Params)
  }

  private _deferLoadCount: number = 0;
  private _allowLoad: boolean = true;
  @Input() public get AllowLoad(): boolean {
    return this._allowLoad;
  }
  public set AllowLoad(value: boolean) {
    this._allowLoad = value
    if (value === true && this._deferLoadCount === 0) {
      this._deferLoadCount++; // only do this one time 
      if (this.Params)
        this.Refresh(this.Params)
      return;
    }
  }

  async RefreshFromSavedParams() {
    if (this.Params)
      this.Refresh(this.Params)
  }
  async Refresh(params: RunQueryParams) {
    this.Params = params;

    if (this.AllowLoad === false) {
      return;
    }
    if (params && params.QueryID) {
      const startTime = new Date().getTime();
      this.isLoading = true

      const md = new Metadata();
      const rq = new RunQuery();

      const rqResult = await rq.RunQuery(params);
      if (!rqResult.Success) {
        // it failed
        this.CreateSimpleNotification("Error running view:\n\n" + rqResult.ErrorMessage, 'error', 5000)
      }
      else {
        // it worked
        this.queryData = rqResult.Results;

        this.totalRowCount = rqResult.RowCount;
        this.skip = 0;
        this.virtualLoadData();
        
      }
      this.viewExecutionTime = (new Date().getTime() - startTime) / 1000; // in seconds
      this.isLoading = false
    }
    else {
      LogError("Refresh(params) must have ViewID or ViewName or (EntityName and ExtraFilter)")
    }
  }
    
  // Export Functionality
  public exportData: any[] = [];
  public async doExcelExport() {
    if (this.kendoExcelExport === null) 
      throw new Error("kendoExcelExport is null, cannot export data");

    try {
      this.CreateSimpleNotification("Working on the export, will notify you when it is complete...", 'info', 2000)
      const data = await this.getExportData();
      // we have the data.
      this.exportData = data;
      // before we call the save, we need to let Angular do its thing that will result in the kendoExcelExport component binding properly to
      // the exportColumns and exportData arrays. So we wait for the next tick before we call save()
      setTimeout(() => {
        this.kendoExcelExport!.save();
        this.CreateSimpleNotification("Excel Export Complete", 'success', 2000)
      }, 100);
    }
    catch (e) {
      this.CreateSimpleNotification("Error exporting data", 'error', 5000)
      LogError(e)
    }
  } 

  protected async getExportData(): Promise<any[]> {
    return this.queryData;
  }

  protected queryColumns() {
    // take first row of the data and get the keys
    const firstRow = this.queryData[0];
    if (firstRow) {
      return Object.keys(firstRow);
    }
  }
}
