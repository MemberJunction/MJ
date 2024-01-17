import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router'

import { Metadata, BaseEntity, RunView, RunViewParams, EntityFieldInfo, EntityFieldTSType, EntityInfo, LogError, PrimaryKeyValue } from '@memberjunction/core';
import { ViewInfo, ViewGridState, ViewColumnInfo, UserViewEntityExtended } from '@memberjunction/core-entities';

import { CellClickEvent, GridDataResult, PageChangeEvent, GridComponent, CellCloseEvent, 
         ColumnReorderEvent, ColumnResizeArgs, ColumnComponent, SelectionEvent, SelectableSettings} from "@progress/kendo-angular-grid";
import { Keys } from '@progress/kendo-angular-common';


import { Subject } from 'rxjs';
import { ExcelExportComponent } from '@progress/kendo-angular-excel-export';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { CompareRecordsComponent } from '@memberjunction/ng-compare-records';


export type GridRowClickedEvent = {
  entityId: number;
  entityName: string;
  primaryKeyValues: PrimaryKeyValue[];
}

export type GridRowEditedEvent = {
  record: BaseEntity;
  row: number;
  saved: boolean;
}
 
export type GridPendingRecordItem = {
  record: BaseEntity;
  row: number;
  dataItem: any;
}

@Component({
  selector: 'mj-user-view-grid',
  templateUrl: './ng-user-view-grid.component.html',
  styleUrls: ['./ng-user-view-grid.component.css']
})
export class UserViewGridComponent implements OnInit, AfterViewInit {
  title = 'UserViewGrid';
  @Input() Params: RunViewParams | undefined;
  @Input() BottomMargin: number = 0;
  @Input() InEditMode: boolean = false;
  @Input() EditMode: "None" | "Save" | "Queue" = "None"
  @Input() AutoNavigate: boolean = true;

  @Output() rowClicked = new EventEmitter<GridRowClickedEvent>();
  @Output() rowEdited = new EventEmitter<GridRowEditedEvent>();

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;
  @ViewChild('excelExport', { read: ExcelExportComponent }) kendoExcelExport: ExcelExportComponent | null = null;
  @ViewChild('recordCompareRef', { static: false }) recordCompareComponent: CompareRecordsComponent | null = null;

  private _pendingRecords: GridPendingRecordItem[] = [];

  public viewData: [] = [];
  public totalRowCount: number = 0;
  public formattedData: { [key: string]: any }[] = [];
  public viewColumns: ViewColumnInfo[] = [];
  public visibleColumns: ViewColumnInfo[] = [];
  public sortSettings: any[] = [];
  public entityRecord: BaseEntity | null = null; 
  public skip: number = 0;
  public pageSize: number = 40;
  public isLoading: boolean = false;
  public gridView: GridDataResult = { data: [], total: 0 };
  public gridHeight: number = 750;

  public _viewEntity: UserViewEntityExtended | undefined
  public  _entityInfo: EntityInfo | undefined;
  private _newGridState: ViewGridState = {};

  private editModeEnded = new Subject<void>();

  public recordsToCompare: any[] = [];
  public compareMode: boolean = false;
//  public compareRecords: BaseEntity[] = [];

  public mergeMode: boolean = false;
//  public mergeRecords: BaseEntity[] = [];

  public selectableSettings: SelectableSettings = {
    enabled: false
  };
  public selectedKeys: any[] = [];
  public isCompareDialogOpened: boolean = false;
  public isConfirmDialogOpen: boolean = false;
  public showRefreshButton: boolean = true;

  public viewExecutionTime: number = 0;

  public get PendingRecords(): GridPendingRecordItem[] {
    return this._pendingRecords;
  }

  protected StartEditMode() {
    this.InEditMode = true;
  }
  protected EndEditMode() {
    this.InEditMode = false;
    this.editModeEnded.next();
  }
  public EditingComplete(): Promise<boolean> {
    if (this.InEditMode) {
      // we need to wait for edit mode to end before we can return true
      return new Promise((resolve, reject) => {
        const subscription = this.editModeEnded.subscribe(() => {
          resolve(true);
          subscription.unsubscribe();
        });
      });
    } 
    else 
      return Promise.resolve(true); // not in edit mode, so editing is complete!
  }

  public IsDynamicView(): boolean {
    return !this._viewEntity; // if we have a viewEntity it is a stored view
  }

  public pageChange(event: PageChangeEvent): void {
    this.skip = event.skip;
    this.virtualLoadData();
  }

  private virtualLoadData(): void {
    // check to see if we have already formatted the slice of the data we need right now
    // we are storing the formattted data in the formattedData array and it has same set
    // of indexes as the viewData array (raw unformatted data). When we first get viewData
    // from the server we create an array of the same length as viewData, but have nulls in all of the 
    // indexes. As we format each row of viewData we store the formatted row in the same index
    // in the formattedData array. So if we have already formatted the data we need for the current
    // page, we just use that data, otherwise we format the data we need for the current page

     try {
      // check to see if we have already formatted the data we need for the current page
      for (let i = this.skip; (i < (this.skip + this.pageSize)) && (i < this.viewData.length); i++) {
        if (!this.formattedData[i]) {
          // we have not formatted this row yet, so format it
          const r = this.viewColumns.map((c) => {
            if (c && c.EntityField && this.viewData[i] && this.viewData[i][c.EntityField.Name]) {
              if (!c.hidden && c.EntityField.Name !== 'ID') {
                const ef = c.EntityField;
                return {field: c.EntityField.Name, value: ef.FormatValue(this.viewData[i][c.EntityField.Name], 0, undefined, 300)}
              }
              else
                return {field: c.EntityField.Name, value: this.viewData[i][c.EntityField.Name]} // hidden column, so just return the value, don't bother formatting
            }
            else
              return {field: c.Name, value: null};
          });
          // now r is an array of {field: string, value: any} objects, so we need to convert it to an object
          // with the field names as the keys and the values as the values
          const row: { [key: string]: any } = {};
          for (let j = 0; j < r.length; j++) { 
            if (r[j] && r[j].field && r[j].field.length > 0)
              row[r[j].field] = r[j].value;
          }  
          this.formattedData[i] = row;
        }
      }

      // now that we have made sure current page of data is formatted, we can return it
      this.gridView = {
        data: this.formattedData.slice(this.skip, this.skip + this.pageSize),
        total: this.viewData.length,
      };
    }
    catch (e) {
      LogError(e);
    }
  }

  constructor(private formBuilder: FormBuilder, 
              private router: Router) {

  } 

  private _saveTimeout: any;
  private SaveView() {
    // debounced outer function...
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(async ()=> {
      // when we actually call inner save view we do await
      await this.innerSaveView()
    }, 5000); // 5 seconds delay
  };


  private _viewDirty: boolean = false;
  public async innerSaveView() {
    if (this._viewDirty) {
      const md = new Metadata()
      if (this._viewEntity && 
          this._viewEntity.Get('UserID') === md.CurrentUser.ID) {  
        // this view is a saved view, AND it belongs to the current user
  
        // update the grid state if we have settings updates for columns and/or sorts
        const tempGridState: ViewGridState = JSON.parse(this._viewEntity.Get('GridState'));
        const tempColSettings = this._newGridState.columnSettings ? this._newGridState.columnSettings : tempGridState.columnSettings;
        tempColSettings.forEach((col: ViewColumnInfo) => {col.DisplayName, col.ID, col.Name, col.hidden, col.orderIndex, col.width}); // remove EntityFieldInfo from the column settings
        tempGridState.columnSettings = tempColSettings;
        tempGridState.sortSettings = this._newGridState.sortSettings ? this._newGridState.sortSettings : tempGridState.sortSettings;
          
        // now stringify the grid state and save it
        this._viewEntity.Set('GridState', JSON.stringify(tempGridState));
        const newSortState = tempGridState.sortSettings.map((s: any) => {return {field: s.field, direction: s.dir}})
        const oldSortState = JSON.parse(this._viewEntity.Get('SortState'));
        this._viewEntity.Set('SortState', JSON.stringify(newSortState));
  
        if (await this._viewEntity.Save()) {
          // check to see if sort state changed and if so, refresh the grid
          if (JSON.stringify(newSortState) !== JSON.stringify(oldSortState)) {
            if (this.Params) // makes sure we have params before we refresh
              this.Refresh(this.Params);
          }
          this._viewDirty = false;
        }
        else  {
          this.CreateSimpleNotification('Unable to save view settings', 'error', 5000)
        }
      }
    }
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

  public async columnReorder(args: ColumnReorderEvent) {
    // Remove the column from the original position
    // need to find the column in the viewColumns array because args.old/new Indexes are from the visibleColumns array
    const fieldName = (<any>args.column).field;
    if (fieldName) {
      const vcOldIndex = this.viewColumns.findIndex((vc: ViewColumnInfo) => vc.Name === fieldName);
      const vcNewIndex = this.viewColumns.findIndex((vc: ViewColumnInfo) => vc.orderIndex === args.newIndex);
      if (vcOldIndex >= 0) {
        // got the index, now remove the element
        const element = this.viewColumns.splice(vcOldIndex, 1)[0];

        // Insert it at the new position
        this.viewColumns.splice(vcNewIndex, 0, element);

        // go through all of the columns and set orderIndex as that isn't done automatically
        let visColIndex = 0;
        for (let i = 0; i < this.viewColumns.length; i++) {
          if (!this.viewColumns[i].hidden) {
            this.viewColumns[i].orderIndex = visColIndex;
            visColIndex++;
          }
        }
        // now loop through all of the HIDDEN columns and set their orderIndex, done in second loop because we want first loop to give us total number of visible columns
        for (let i = 0; i < this.viewColumns.length; i++) {
          if (this.viewColumns[i].hidden) {
            this.viewColumns[i].orderIndex = visColIndex;
            visColIndex++;
          }
        }

        // make sure that _newGridState.columnSettings is set
        this._newGridState.columnSettings = this.viewColumns;

        this._viewDirty = true;
        this.SaveView();
      }
    }


  }

  public async columnResize(args: ColumnResizeArgs[]) {
    for (const col of args) {
      const c = col.column as ColumnComponent;
      const viewCol = this.viewColumns.find(vc => vc.Name === c.field);
      const visCol = this.visibleColumns.find(vc => vc.Name === c.field);
      const visCols = this.visibleColumns;
      if (viewCol) 
        viewCol.width = col.newWidth;
    }

    this._newGridState.columnSettings = this.viewColumns.map(vc => {
      return { // only pass back the stuff that should persist, we don't want EntityField persisting, waste of space! 
        Name: vc.Name,
        DisplayName: vc.DisplayName,
        width: vc.width,
        orderIndex: vc.orderIndex,
        hidden: vc.hidden
      }
    });
    this._viewDirty = true;
    this.SaveView();
  }

  public async sortChanged(sort: any) {
    if (sort && sort.length > 0) {
      // remove any sort settings that don't have a direction
      const filterSort = sort.filter((s: any) => s.dir !== undefined && s.dir !== null && s.dir !== "");
      this._newGridState.sortSettings = filterSort;
    }
    else
      this._newGridState.sortSettings = sort;

      
    this.sortSettings = this._newGridState.sortSettings; // for the UI display - grid binding to this shows that the sort is applied via arrows in the column headers

    if (this.IsDynamicView()) {
      // Dynamic View, we have this.Params and can add an OrderBy and then just Refresh() the entire component
      // that will result in going to the server for a refreshed set of data
      if (this.Params) {
        this.Params.OrderBy = sort[0].field + ' ' + (sort[0].dir);
        this.Refresh(this.Params);  
      }
      else {
        LogError("sortChanged() called but this.Params is null or undefined") // should never get here
      }
    }
    else {
      // Saved view - we do this on the server side only
      this._viewDirty = true;
      this.innerSaveView(); // for sort changes we call innerSaveView() directly, not through SaveView() which is debounced  
    }
  }

  public async cellClickHandler(args: CellClickEvent) {
    if(this.compareMode || this.mergeMode) return;
    
    if (this._entityInfo) {
      const pkeyVals: PrimaryKeyValue[] = [];
      this._entityInfo.PrimaryKeys.forEach((pkey: EntityFieldInfo) => {
        pkeyVals.push({FieldName: pkey.Name, Value: this.viewData[args.rowIndex][pkey.Name]})
      })
      this.rowClicked.emit({
        entityId: this._entityInfo.ID,
        entityName: this._entityInfo.Name,
        primaryKeyValues: pkeyVals
      })

      if (this._entityInfo.AllowUpdateAPI && 
          this.EditMode !== "None"  ) {
        const perm = this._entityInfo.GetUserPermisions(new Metadata().CurrentUser)
        if (perm.CanUpdate) {
          this.StartEditMode();
          args.sender.editCell(args.rowIndex, args.columnIndex, this.createFormGroup(args.dataItem));
        }
      }

      if (!this.InEditMode && this.AutoNavigate) {
        // tell app router to go to this record
        const pkVals: string =  this.GeneratePrimaryKeyValueString(pkeyVals);
        this.router.navigate(['resource', 'record', pkVals], { queryParams: { Entity: this._entityInfo.Name } })
    }
    } 
  } 

  public GeneratePrimaryKeyValueString(pkVals: PrimaryKeyValue[]): string {
    return pkVals.length > 1 ? pkVals.map(pk => pk.FieldName + '|' + pk.Value).join('||') : pkVals[0].Value;
  }

  public createFormGroup(dataItem: any): FormGroup {
    const groupFields: any = {};
    this.viewColumns.forEach((vc: ViewColumnInfo) => {
      if (vc.EntityField.AllowUpdateAPI && 
          vc.EntityField.IsVirtual === false &&
          vc.EntityField.AllowUpdateInView)
        groupFields[vc.Name] = dataItem[vc.Name];
    });


    return this.formBuilder.group(groupFields);
  }

  public getEditor(ef: EntityFieldInfo): "boolean" | "text" | "numeric" | "date" {
      switch (ef.TSType) {  
        case EntityFieldTSType.Boolean:
          return "boolean";
        case EntityFieldTSType.Date:
          return "date";
        case EntityFieldTSType.Number:
          return "numeric";
        default:
          return "text";
      }          
  }

  public async cellCloseHandler(args: CellCloseEvent) {
    try {
      if (this._entityInfo && this.EditMode !== "None") {
        const { formGroup, dataItem } = args;
  
        if (!formGroup.valid) {
          // prevent closing the edited cell if there are invalid values.
          args.preventDefault();
        } 
        else if (formGroup.dirty) {
          if (args.originalEvent && args.originalEvent.keyCode === Keys.Escape) 
            return; // user hit escape, so don't save their changes
          
          // update the data item with the new values - this drives UI refresh while we save the record...
  
          Object.assign(dataItem, formGroup.value);
  
          const md = new Metadata();
          const pkey = this._entityInfo.PrimaryKey.Name;
          let record: BaseEntity | undefined;
          let bSaved: boolean = false;
          if (this.EditMode === "Save") {
            record = await md.GetEntityObject(this._entityInfo.Name);
            await record.Load(dataItem[pkey]);
            record.SetMany(formGroup.value);
            bSaved = await record.Save();
            if (!bSaved)
              this.CreateSimpleNotification("Error saving record: " + record.Get(pkey), 'error', 5000)
          }
          else {
            record = this._pendingRecords.find((r: GridPendingRecordItem) => r.record.Get(pkey) === dataItem[pkey])?.record;
            if (!record) { // haven't edited this one before 
              record = await md.GetEntityObject(this._viewEntity!.Get('Entity'));
              await record.Load(dataItem[pkey]);
              this._pendingRecords.push({record, 
                                         row: args.rowIndex, 
                                         dataItem}); // don't save - put the changed record on a queue for saving later by our container
            }
            // go through the formGroup and only set the values that exist as columns in the grid
            const keys = Object.keys(formGroup.value);
            keys.forEach((k: string) => {
              const vc = this.viewColumns.find((vc: ViewColumnInfo) => vc.Name === k && vc.hidden === false);
              if (vc) {
                record!.Set(k, formGroup.value[k]);
              }
            })

            //record.SetMany(formGroup.value);
          }
  
          this.rowEdited.emit({
            record: record,
            row: args.rowIndex,
            saved: bSaved
          })
  
        }
      }
    }
    catch (e) {
      console.error(e);
    }
    finally {
      this.EndEditMode(); 
    }

  }

  // this handles reverting pending cahnges to records WITHIN the grid, not the user view settings, unrelated to that.
  public RevertPendingChanges(): void {
    if (this._pendingRecords && this._pendingRecords.length > 0) {
      this._pendingRecords.forEach((r: GridPendingRecordItem) => {
        r.record!.Revert();
        Object.assign(r.dataItem, r.record!.GetAll()); // copy the original values back to the data Item which gets the grid to display the old values again...
      })
      this._pendingRecords = [];
      if (this.Params)
        this.Refresh(this.Params);
    }
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
  async Refresh(params: RunViewParams) {
    this.Params = params;

    if (this.AllowLoad === false) {
      return;
    }
    if (params && (params.ViewEntity || params.ViewID || params.ViewName || (params.EntityName && params.ExtraFilter))) {
      const startTime = new Date().getTime();
      this.isLoading = true

      const md = new Metadata();
      const rv = new RunView();

      // get the view entity first so we can pass it in, otherwise it will end up getting loaded inside of RunView() which is inefficient as we need it too
      // this is done for performance purposes
      if (params.ViewEntity) {
        // When we receive the .ViewEntity via our params that is a time saver as we don't need to load it again, so ALWAYS use that instance of the entity object for the view entity
        this._viewEntity = <UserViewEntityExtended>params.ViewEntity; 
        const e = md.Entities.find(x => x.ID === this._viewEntity?.EntityID);
        if (e)
          this._entityInfo = e
        else
          throw new Error("Unable to get entity info for view: " + this._viewEntity?.Name)
      }
      else if (!params.ViewEntity && (params.ViewID || params.ViewName)) {
        // this is NOT a dyamic view as we got either the ViewID or ViewName, so we can get the ViewEntity
        if (params.ViewID && params.ViewID > 0) {
          this._viewEntity = <UserViewEntityExtended>await ViewInfo.GetViewEntity(params.ViewID); 
        }
        else if (params.ViewName) {
          this._viewEntity = <UserViewEntityExtended>await ViewInfo.GetViewEntityByName(params.ViewName); 
        }
        params.ViewEntity = this._viewEntity;

        const e = md.Entities.find(x => x.ID === this._viewEntity?.EntityID)
        if (e)
          this._entityInfo = e;
        else  
          throw new Error("Unable to get entity info for view: " + this._viewEntity?.Name)
      }
      else if (params.EntityName)  { 
        // we don't have a ViewEntity because we're doing a dynamic view, so we need to get the entity info from the Entity Name
        const e = md.Entities.find(x => x.Name === params.EntityName);
        if (e)
          this._entityInfo = e
      }
      else
        throw new Error("Invalid configuration, we need to receive either a ViewEntity, ViewID, ViewName, or EntityName and ExtraFilter in order to run a view")

      const rvResult = await rv.RunView(params);
      if (!rvResult.Success) {
        // it failed
        this.CreateSimpleNotification("Error running view:\n\n" + rvResult.ErrorMessage, 'error', 5000)
      }
      else {
        // it worked
        this.viewData = rvResult.Results;

        this.totalRowCount = rvResult.TotalRowCount;
        this.formattedData = new Array(this.viewData.length);

        let cols: ViewColumnInfo[] | undefined;
        if (this._viewEntity) 
          cols = this._viewEntity.Columns
        else 
          cols = this._entityInfo?.Fields.filter((f: EntityFieldInfo) => f.DefaultInView ).map((f: EntityFieldInfo) => {
                                                                                                  return {
                                                                                                    ID: f.ID,
                                                                                                    Name: f.Name,
                                                                                                    DisplayName: f.DisplayName,
                                                                                                    EntityField: f,
                                                                                                    hidden: false,
                                                                                                    orderIndex: f.Sequence,
                                                                                                    width: f.DefaultColumnWidth ? f.DefaultColumnWidth : 100,
                                                                                                  } as ViewColumnInfo
                                                                                                });
        if (cols) {
          this.viewColumns = cols
          const tempCols = cols.filter(x => x.hidden === false).sort((a,b) => {
            const aOrder = a.orderIndex != null ? a.orderIndex : 9999;
            const bOrder = b.orderIndex != null ? b.orderIndex : 9999;
            return aOrder - bOrder;
          });

          this.visibleColumns = tempCols
        }

        // sorting setup
        if (this._viewEntity) {
          const temp = this._viewEntity.ViewSortInfo;
          const kendoSortSettings = temp.map((s: any) => {
            let dir: string;
            if (typeof s.direction === 'string')
              dir = s.direction.trim().toLowerCase();
            else if (typeof s.direction === 'number' && s.direction === 1)
              dir = 'asc';
            else if (typeof s.direction === 'number' && s.direction === 2)
              dir = 'desc';
            else
              dir = '';
            return {field: s.field, dir: dir}
          })
          this.sortSettings = kendoSortSettings;
        }
  
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

  GetColumnTitle(col: ViewColumnInfo) {
    if (col.DisplayName)
      return col.DisplayName; // use view's display name first if it exists
    else if (col.EntityField.DisplayName )
      return col.EntityField.DisplayName; // then use entity display name, if that exist
    else
      return col.Name; // otherwise just use the column name
  }

  GetColumnCellStyle(col: ViewColumnInfo) {
    switch (col.EntityField.Type.trim().toLowerCase()) {
      case "money":
      case 'decimal':
      case 'real':
      case 'float':
      case 'int':
        return {'text-align': 'right', 'vertical-align': 'top'}; // right align numbers,
      default:
        return {'text-align': 'left', 'vertical-align': 'top'}; // left align everything else
      }
  }

  selectionChange(args: SelectionEvent) {
    // update recordsToCompare based on the this.selectedKeys property that is bound
    // selectedKeys is an array of indexes in the this.viewData, and we need to make our 
    // this.recordsToCompare an array of records from this.viewData so just map() the selectedKeys for this
    this.recordsToCompare = this.selectedKeys.map((i: number) => this.viewData[i]);
  }

  enableMergeOrCompare(cancel: boolean = false, type: 'merge' | 'compare'){
    if(!cancel && this.recordsToCompare.length >= 2){
      // this scenario occurs when we've already started the merge/compare and the user has selected records, then clicked the merge/compare button again
      this.isCompareDialogOpened = true;
    }
    else if (cancel) {
      // the user clicked cancel in our toolbar
      if (type === 'merge')
        this.mergeMode = false;
      else
        this.compareMode = false;

      this.selectedKeys = [];
      this.recordsToCompare = [];
    }
    else {
      // just turning on merge mode from the merge/compare button, so just turn it on and let the user select records
      if (type === 'merge')
        this.mergeMode = true;
      else
        this.compareMode = true;
    }
  }

  async closeConfirmMergeDialog(event: 'cancel' | 'yes' | 'no') {
    if (event === 'yes') {
      if (this._entityInfo && this.recordCompareComponent) {
        const md = new Metadata();
        const pkey = this._entityInfo.PrimaryKey.Name;
        const result = await md.MergeRecords({
          EntityName: this._entityInfo.Name,
          RecordsToMerge: this.recordsToCompare.map((r: BaseEntity) => r.Get(pkey)).filter((pkeyVal: any) => pkeyVal !== this.recordCompareComponent?.selectedRecordPKeyVal),
          SurvivingRecordPrimaryKeyValue: this.recordCompareComponent.selectedRecordPKeyVal,
          FieldMap: this.recordCompareComponent.fieldMap.map((fm: any) => {
            return {
              FieldName: fm.fieldName,
              Value: fm.value
            }
          })
        })
        if (result.Success) {
          // merge was successful, so refresh the grid
          this.selectedKeys = [];
          this.recordsToCompare = [];
          this.mergeMode = false;
          this.compareMode = false;

          // close the dialogs
          this.isCompareDialogOpened = false;
          this.isConfirmDialogOpen = false; 

          // refresh the grid
          this.Refresh(this.Params!);
        }
        else {
          // the merge failed, so show an error message
          this.isConfirmDialogOpen = false; 
          this.CreateSimpleNotification("Error merging records: " + result.OverallStatus, 'error', 5000)
        }
      }
    }
    else {
      this.isConfirmDialogOpen = false; 
      // close the dialog and let the user continue to work on the merge, so don't close the compare dialog
    }
  }

  async closeCompareDialog(event: 'close' | 'cancel' | 'merge'){
    console.log(event)
    switch (event) {
      case 'merge':
        // user has requested to merge the records and retain the selected record from the compare records component, so run the merge
        // first, confirm with the user to make 100% sure they want to do this as it is irreversible
        this.isConfirmDialogOpen = true;
        break;
      default: // close and cancel
        this.selectedKeys = [];
        this.recordsToCompare = [];
        this.mergeMode = false;
        this.compareMode = false;

        this.isCompareDialogOpened = false;
        break;
    }
  }


  // Export Functionality
  public exportColumns: ViewColumnInfo[] = [];
  public exportData: any[] = [];
  public async doExcelExport() {
    if (this.kendoExcelExport === null) 
      throw new Error("kendoExcelExport is null, cannot export data");

    try {
      this.CreateSimpleNotification("Working on the export, will notify you when it is complete...", 'info', 2000)
      const data = await this.getExportData();
      // we have the data.
      const cols =  this.viewColumns.filter((vc: ViewColumnInfo) => vc.hidden === false) 
      this.exportColumns = cols;
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
    // Get the data for the ENTIRE view, not just the current page
    const md = new Metadata();
    const rv = new RunView();
    const p = {
      ...this.Params!,
      IgnoreMaxRows: true,
      ForceAuditLog: true,
      AuditLogDescription: `Export of Data From ${this._viewEntity ? '"' + this._viewEntity.Get('Name') + '"' : ''} View for User ${md.CurrentUser.Email}`
    }
    const result = await rv.RunView(p);    
    if (result && result.Success) {
      return result.Results;
    }
    else  
      throw new Error("Unable to get export data");    
  }

}
