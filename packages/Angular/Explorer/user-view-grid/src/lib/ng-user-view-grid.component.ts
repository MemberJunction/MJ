import { Component, ViewChild, ElementRef, Output, EventEmitter, OnInit, Input, AfterViewInit, OnDestroy, Renderer2} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { Metadata, BaseEntity, RunView, RunViewParams, EntityFieldInfo, EntityFieldTSType, EntityInfo, LogError, CompositeKey, PotentialDuplicateRequest, RunViewResult } from '@memberjunction/core';
import { ViewInfo, ViewGridState, ViewColumnInfo, UserViewEntityExtended, ListEntity, ListDetailEntityExtended, ResourcePermissionEngine, EntityActionEntity } from '@memberjunction/core-entities';

import { CellClickEvent, GridDataResult, PageChangeEvent, GridComponent, CellCloseEvent, 
         ColumnReorderEvent, ColumnResizeArgs, ColumnComponent, SelectionEvent, SelectableSettings} from "@progress/kendo-angular-grid";
import { Keys } from '@progress/kendo-angular-common';


import { Subject, distinctUntilChanged } from 'rxjs';
import { debounceTime} from "rxjs/operators";
import { ExcelExportComponent } from '@progress/kendo-angular-excel-export';
import { DisplaySimpleNotificationRequestData, MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { CompareRecordsComponent } from '@memberjunction/ng-compare-records';
import { TextAreaComponent } from '@progress/kendo-angular-inputs';
import { EntityFormDialogComponent } from '@memberjunction/ng-entity-form-dialog';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { BaseFormComponentEvent, BaseFormComponentEventCodes, FormEditingCompleteEvent, PendingRecordItem } from '@memberjunction/ng-base-types';
import { EntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { CommunicationEngineBase, Message } from '@memberjunction/communication-types';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { EntityActionEngineBase } from '@memberjunction/actions-base';
import { GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { LoadEntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { ListManagementDialogConfig, ListManagementResult } from '@memberjunction/ng-list-management';
// Prevent tree-shaking of EntityCommunicationsEngineClient
LoadEntityCommunicationsEngineClient();

export type GridRowClickedEvent = {
  entityId: string;
  entityName: string;
  CompositeKey: CompositeKey;
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

/**
 * @deprecated use @memberjunction/ng-entity-viewer package and the mj-entity-data-grid as a replacement
 */
@Component({
  selector: 'mj-user-view-grid',
  templateUrl: './ng-user-view-grid.component.html',
  styleUrls: ['./ng-user-view-grid.component.css']
})
export class UserViewGridComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'UserViewGrid';
  /**
   * Parameters for running the view.
   * When this changes, the grid will automatically refresh if AutoRefreshOnParamsChange is true.
   */
  private _params: RunViewParams | undefined;
  @Input()
  get Params(): RunViewParams | undefined {
    return this._params;
  }
  set Params(value: RunViewParams | undefined) {
    const paramsChanged = this.hasParamsChanged(this._params, value);
    this._params = value;

    // Auto-refresh when params change (after initial load)
    if (paramsChanged && this.AutoRefreshOnParamsChange && !this.neverLoaded) {
      this.Refresh(value!);
    }
  }

  /**
   * If set to true (default), the grid will automatically refresh when Params input changes.
   * Set to false if you want to manually control refresh timing.
   */
  @Input() AutoRefreshOnParamsChange: boolean = true;
  @Input() BottomMargin: number = 0;
  /**
   * Height of the grid. Can be:
   * - A number for fixed pixel height (e.g., 400)
   * - 'auto' to fill available viewport space (use for standalone views)
   * - undefined (default) uses 400px for backward compatibility
   */
  @Input() Height: number | 'auto' | undefined = undefined;
  @Input() InEditMode: boolean = false;
  @Input() EditMode: "None" | "Save" | "Queue" = "None"
  @Input() AutoNavigate: boolean = true;
  /**
   * If set to false, the component will not automatically refresh when Params are provided.
   * This is useful when the parent component wants to control when Refresh is called.
   */
  @Input() AutoRefreshOnInit: boolean = true;


  /**
   * If you enable the ShowCreateNewRecordButton and the user has permission, when they click the New button, these values from this object will auto-populate the new record form
   */
  @Input() NewRecordValues: any;
  /**
   * If set to true, the Create New Record button will be displayed if the user is allowed to create new records for the entity being shown. If set to false, the Create New Record button will be hidden.
   */
  @Input() ShowCreateNewRecordButton: boolean = true;

  /**
   * If set to true, any Actions that are linked to the displayed entity via EntityActions that have an InvocationContext for Views will be shown.
   */
  @Input() ShowEntityActionButtons: boolean = true;

  /**
   * If set to true, and if the entity being displayed supports communication, the communication button will be displayed. If set to false, the communication button will be hidden.
   */
  @Input() ShowCommunicationButton: boolean = true;

  /**
   * When set to Dialog, the Create New Record button will open a dialog to create a new record. When set to Tab, the Create New Record button will open a new tab to create a new record.
   */
  @Input() CreateRecordMode: "Dialog" | "Tab" = "Tab";

  @Output() rowClicked = new EventEmitter<GridRowClickedEvent>();
  @Output() rowEdited = new EventEmitter<GridRowEditedEvent>();
  @Output() dataLoaded = new EventEmitter<{ totalRowCount: number, loadTime: number }>();

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;
  @ViewChild('excelExport', { read: ExcelExportComponent }) kendoExcelExport: ExcelExportComponent | null = null;
  @ViewChild('recordCompareRef', { static: false }) recordCompareComponent: CompareRecordsComponent | null = null;

  @ViewChild('analysisQuestion', { read: TextAreaComponent }) analysisQuestion: TextAreaComponent | null = null;
  @ViewChild('analysisResults', { read: ElementRef }) analysisResults: ElementRef | null = null;

  @ViewChild('compareDialogContainer') private compareDialogContainer!: ElementRef;

  private _pendingRecords: GridPendingRecordItem[] = [];

  public viewData: any[] = [];
  public totalRowCount: number = 0;
  public formattedData: { [key: string]: any }[] = [];
  public viewColumns: ViewColumnInfo[] = [];
  public visibleColumns: ViewColumnInfo[] = [];
  public sortSettings: any[] = [];
  public entityRecord: BaseEntity | null = null; 
  public skip: number = 0;
  public pageSize: number = 40;
  public isLoading: boolean = false;
  public neverLoaded: boolean = true;
  public gridView: GridDataResult = { data: [], total: 0 };
  public gridHeight: number = 400;
  private resizeListener: (() => void) | null = null;

  public _viewEntity: UserViewEntityExtended | undefined
  public  _entityInfo: EntityInfo | undefined;
  private _newGridState: ViewGridState = {};

  private editModeEnded = new Subject<void>();
  private searchDebounce$: Subject<string> = new Subject();

  public recordsToCompare: any[] = [];

  public compareMode: boolean = false;
  public mergeMode: boolean = false;
  public duplicateMode: boolean = false;
  public addToListMode: boolean = false;

  public get anyModeEnabled(): boolean {
    return this.compareMode || this.mergeMode || this.duplicateMode || this.addToListMode;
  }

  public get EntityInfo(): EntityInfo | undefined {
    return this._entityInfo;
  }

  public showNewRecordDialog: boolean = false;

  public selectableSettings: SelectableSettings = {
    enabled: false
  };
  public selectedKeys: any[] = [];
  public isCompareDialogOpened: boolean = false;
  public isConfirmDialogOpen: boolean = false;
  public showRefreshButton: boolean = true;

  public viewExecutionTime: number = 0;
  public showAddToListDialog: boolean = false;
  public showAddToListLoader: boolean = false;
  public sourceListEntities: ListEntity[] | null = null;
  public listEntities: ListEntity[] = [];
  public selectedListEntities: ListEntity[] = [];
  public listEntitySearch: string = '';

  // Enhanced list management dialog properties
  public showEnhancedListDialog: boolean = false;
  public listManagementConfig: ListManagementDialogConfig | null = null;
  public useEnhancedListDialog: boolean = true; // Toggle between old and new dialog

  public EntityActions: EntityActionEntity[] = [];

  public get PendingRecords(): GridPendingRecordItem[] {
    return this._pendingRecords;
  }

  public get ViewID(): string {
    if (this.Params && this.Params.ViewID)
      return this.Params.ViewID;
    else
      return "";
  }

  /**
   * This property is true if the user has the ability to create a new record which is a combination of the user-level permission coupled with the
   * entity-level setting AllowCreateAPI being set to 1.
   */
  public get UserCanCreateNewRecord(): boolean {
    if (this._entityInfo && this._entityInfo.AllowCreateAPI) {
      const perm = this._entityInfo.GetUserPermisions(new Metadata().CurrentUser)
      return perm.CanCreate;
    }
    else
      return false;
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
      // tell our grid to close the cell that is currently being edited
      this.kendoGridElement?.closeCell();
      this.kendoGridElement?.closeRow(); // close the row too

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
  data = [
    { text: "Folder" },
    { text: "Report with Skip" },
  ];
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
                let formattedValue: any = null;
                if (c.EntityField.TSType === EntityFieldTSType.Boolean) {
                  formattedValue = this.viewData[i][c.EntityField.Name] ? '✓' : ''; // show a check mark if true, nothing if false
                }
                else {
                  formattedValue = ef.FormatValue(this.viewData[i][c.EntityField.Name], 0, undefined, 300);
                }

                return {field: c.EntityField.Name, value: formattedValue}
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

  constructor(private elementRef: ElementRef,
              private formBuilder: FormBuilder,
              private navigationService: NavigationService,
              private renderer: Renderer2) {

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

  public get UserCanEdit(): boolean {
    if (this._viewEntity) 
      return this._viewEntity.UserCanEdit;
    else
      return false;
  }

  public get UserCanView(): boolean {
    if (this._viewEntity) 
      return this._viewEntity.UserCanView;
    else
      return false;
  }


  private _viewDirty: boolean = false;
  public async innerSaveView() {
    if (this._viewDirty) {
      const md = new Metadata()
      if (this._viewEntity && 
          this._viewEntity.UserCanEdit) {  
        // this view is a saved view, AND it belongs to the current user
  
        // update the grid state if we have settings updates for columns and/or sorts
        const tempGridState: ViewGridState = JSON.parse(this._viewEntity.Get('GridState'));
        const tempColSettings = this._newGridState.columnSettings ? this._newGridState.columnSettings : tempGridState.columnSettings;
        tempColSettings?.forEach((col) => {col.DisplayName, col.ID, col.Name, col.hidden, col.orderIndex, col.width}); // remove EntityFieldInfo from the column settings
        tempGridState.columnSettings = tempColSettings;
        tempGridState.sortSettings = this._newGridState.sortSettings ? this._newGridState.sortSettings : tempGridState.sortSettings;
          
        // now stringify the grid state and save it
        this._viewEntity.Set('GridState', JSON.stringify(tempGridState));
        const newSortState = tempGridState.sortSettings ? tempGridState.sortSettings.map((s: any) => {return {field: s.field, direction: s.dir}}) : [];
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

      
    this.sortSettings = this._newGridState.sortSettings || []; // for the UI display - grid binding to this shows that the sort is applied via arrows in the column headers

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
    if(this.compareMode || this.mergeMode ){
      return;
    }

    if(!this._entityInfo){
      LogError("cellClickHandler() called but this._entityInfo is null or undefined");
      return;
    }
    
    const compositeKey: CompositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(this._entityInfo, this.viewData[args.rowIndex]);
    this.rowClicked.emit({
      entityId: this._entityInfo.ID,
      entityName: this._entityInfo.Name,
      CompositeKey: compositeKey
    });

    if (this._entityInfo.AllowUpdateAPI && this.EditMode !== "None") {
      const perm = this._entityInfo.GetUserPermisions(new Metadata().CurrentUser)
      if (perm.CanUpdate) {
        this.StartEditMode();
        args.sender.editCell(args.rowIndex, args.columnIndex, this.createFormGroup(args.dataItem));
      }
    }

    if (this.EditMode ==='None' && this.AutoNavigate) {
      // Use NavigationService to open the record
      this.navigationService.OpenEntityRecord(this._entityInfo!.Name, compositeKey);
    }
  } 

  public createFormGroup(dataItem: any): FormGroup {
    const groupFields: any = {};
    this.viewColumns.forEach((vc: ViewColumnInfo) => {
      if (vc.EntityField?.AllowUpdateAPI && 
          vc.EntityField?.IsVirtual === false &&
          vc.EntityField?.AllowUpdateInView)
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
        const { formGroup, dataItem, column } = args;
  
        if (!formGroup.valid) {
          // prevent closing the edited cell if there are invalid values.
          args.preventDefault();
        } 
        else if (formGroup.dirty) {
          if (args.originalEvent && args.originalEvent.keyCode === Keys.Escape) {
            return; // user hit escape, so don't save their changes
          }
          
          // update the data item with the new values - this drives UI refresh while we save the record...
  
          Object.assign(dataItem, formGroup.value);
  
          const md = new Metadata();
          let record: BaseEntity | undefined;
          let bSaved: boolean = false;
          if (this.EditMode === "Save") {
            let compositeKey: CompositeKey = new CompositeKey();
            compositeKey.LoadFromEntityInfoAndRecord(this._entityInfo, dataItem);
            record = await md.GetEntityObject(this._entityInfo.Name);
            await record.InnerLoad(compositeKey);
            record.SetMany(formGroup.value);
            bSaved = await record.Save();
            // if (!bSaved)
            //   this.CreateSimpleNotification("Error saving record: " + record.Get(pkey), 'error', 5000)
          }
          else {
            record = this._pendingRecords.find((r: GridPendingRecordItem) => {
              // match on all columns within the primary key of the entity using the
              // _entityInfo object to get the primary key fields
              const noMatch = this._entityInfo!.PrimaryKeys.some((ef: EntityFieldInfo) => {
                return r.record.Get(ef.Name) !== dataItem[ef.Name];
              });
              // noMatch will be true if any of the primary key fields don't match
              return !noMatch;
            })?.record;
            if (!record) { 
              // haven't edited this one before 
              record = await md.GetEntityObject(this._viewEntity!.Get('Entity'));
              let compositeKey: CompositeKey = new CompositeKey();
              compositeKey.LoadFromEntityInfoAndRecord(this._entityInfo, dataItem);
              await record.InnerLoad(compositeKey);
              this._pendingRecords.push({record, 
                                         row: args.rowIndex, 
                                         dataItem}); // don't save - put the changed record on a queue for saving later by our container
            }
            // now, based on the column that we're in, update the record with the new value
            record.Set(column.field, formGroup.value[column.field]);
            // if a boolean value, modify what is in the grid so it is formatted properly
            if (column.field && column.field.length > 0) {
              const ef = this._entityInfo.Fields.find(f => f.Name === column.field);
              if (ef && ef.TSType === EntityFieldTSType.Boolean) {
                dataItem[column.field] = record.Get(column.field) ? '✓' : '';
              }
            }
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



  async ngAfterViewInit() {
    // Delay height calculation to ensure DOM is fully rendered
    setTimeout(() => {
      this.setGridHeight();
      this.setupResizeListener();
    }, 0);

    if (this.Params && this.AutoRefreshOnInit)
      this.Refresh(this.Params);

    // setup event listener for MJGlobal because we might have a parent component that sends us messages
    MJGlobal.Instance.GetEventListener(false).subscribe((e: MJEvent) => {
      switch (e.event) {
        case MJEventType.ComponentEvent:
          if (e.eventCode === BaseFormComponentEventCodes.BASE_CODE) {
            // we have an event from a BaseFormComponent, now we need to determine if WE are a descendant of that component
            const event: BaseFormComponentEvent = e.args as BaseFormComponentEvent;
            if (SharedService.IsDescendant(event.elementRef, this.elementRef)) {
              // we are a descendant of the component that sent the event, so we need to handle it
              switch (event.subEventCode) {
                case BaseFormComponentEventCodes.EDITING_COMPLETE:
                  this.EditingComplete();
                  break;
                case BaseFormComponentEventCodes.REVERT_PENDING_CHANGES:
                  this.RevertPendingChanges();
                  break;
                case BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS:
                  // provide all of our pending records back to the caller
                  this.PendingRecords.forEach((r: GridPendingRecordItem) => {
                    const edEvent: FormEditingCompleteEvent = event as FormEditingCompleteEvent;
                    const p: PendingRecordItem = {entityObject: r.record, action: 'save'};
                    edEvent.pendingChanges.push(p);
                  });
                  break;
              }
            }
           }
          break;
      }
    });
  }

  private _movedToBody: boolean = false;
  moveDialogToBody() {
    if (this._movedToBody)
      return;
    const dialogElement = this.compareDialogContainer.nativeElement;
    this.renderer.appendChild(document.body, dialogElement);

    this._movedToBody = true;
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
    }
  }

  async RefreshFromSavedParams() {
    if (this.Params)
      this.Refresh(this.Params)
  }
  async Refresh(params: RunViewParams) {
    this.Params = params;

    if (this.AllowLoad === false) { // MUST DO THIS IMMEDIATELY AFTER STORING PARAMS SO THAT IT IS NOT ASYNC FROM HERE - THAT WAY WE GET FUTURE CALLS TO Refresh() when AllowLoad is set to TRUE
      return;
    }

    // NOW WE CAN DO ASYNC stuff, before we check AllowLoad we must not do async stuff

    await TemplateEngineBase.Instance.Config(false);
    await CommunicationEngineBase.Instance.Config(false);
    await EntityActionEngineBase.Instance.Config(false);
    await EntityCommunicationsEngineClient.Instance.Config(false);

    // Check for valid params - ExtraFilter can be empty string (meaning no filter), so use != null check
    if (params && (params.ViewEntity || params.ViewID || params.ViewName || (params.EntityName && params.ExtraFilter != null))) {
      const startTime = new Date().getTime();
      this.isLoading = true
      this.neverLoaded = false;

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
        if (params.ViewID && params.ViewID.length > 0) {
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
                                                                                                    Name: f.CodeName,
                                                                                                    DisplayName: f.DisplayName,
                                                                                                    EntityField: f,
                                                                                                    hidden: false,
                                                                                                    orderIndex: f.Sequence,
                                                                                                    width: f.DefaultColumnWidth ? f.DefaultColumnWidth : 100,
                                                                                                  } as ViewColumnInfo
                                                                                                });
        if (cols) {
          this.viewColumns = cols
          const tempCols = cols.filter(x => x.hidden === false && x.EntityField/*make sure there is an entity field linked*/).sort((a,b) => {
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

        this.LoadEntityActions();
      }

      this.viewExecutionTime = (new Date().getTime() - startTime) / 1000; // in seconds
      this.isLoading = false;

      // Recalculate height after data loads to ensure proper sizing
      if (this.Height === 'auto') {
        setTimeout(() => {
          this.calculateAutoHeight();
        }, 0);
      }

      // Emit dataLoaded event with row count and load time
      this.dataLoaded.emit({
        totalRowCount: this.totalRowCount,
        loadTime: this.viewExecutionTime
      });
    }
    else {
      LogError("Refresh(params) must have ViewID or ViewName or (EntityName and ExtraFilter). Note: ExtraFilter can be an empty string for no filtering.")
    }
  }

  /**
   * Check if params have meaningfully changed (compares key properties)
   */
  private hasParamsChanged(oldParams: RunViewParams | undefined, newParams: RunViewParams | undefined): boolean {
    // If both are undefined/null, no change
    if (!oldParams && !newParams) return false;
    // If one is undefined/null and other isn't, changed
    if (!oldParams || !newParams) return true;

    // Compare key properties that would require a refresh
    return oldParams.EntityName !== newParams.EntityName ||
           oldParams.ViewID !== newParams.ViewID ||
           oldParams.ViewName !== newParams.ViewName ||
           oldParams.ExtraFilter !== newParams.ExtraFilter ||
           oldParams.UserSearchString !== newParams.UserSearchString;
  }

  /**
   * Load up the entity action metadata for the current entity the view is displaying
   */
  protected LoadEntityActions() {
    if (this._entityInfo) {
      this.EntityActions = EntityActionEngineBase.Instance.GetActionsByEntityNameAndInvocationType(this._entityInfo.Name, 'View', 'Active');
    }
  }

  GetColumnTitle(col: ViewColumnInfo) {
    if (col.DisplayName)
      return col.DisplayName; // use view's display name first if it exists
    else if (col.EntityField?.DisplayName )
      return col.EntityField.DisplayName; // then use entity display name, if that exist
    else
      return col.Name; // otherwise just use the column name
  }

  GetColumnCellStyle(col: ViewColumnInfo) {
    switch (col.EntityField?.Type.trim().toLowerCase()) {
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
      this.moveDialogToBody();
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

  enableCheckbox(cancel: boolean = false, type: 'merge' | 'compare' | 'duplicate' | 'addToList' | ''){
    if(!cancel && type === 'addToList' && this.recordsToCompare.length >= 1){
      this.toggleAddToListDialog(true);
    }
    else if(!cancel && this.recordsToCompare.length >= 2){
      // this scenario occurs when we've already started the merge/compare/duplicate and the user has selected records, then clicked the merge/compare button again
      this.isCompareDialogOpened = true;
      this.moveDialogToBody();
    }
    else if (cancel) {
      // the user clicked cancel in our toolbar
      this.mergeMode = false;
      this.compareMode = false;
      this.duplicateMode = false;
      this.addToListMode = false;
      this.selectedKeys = [];
      this.recordsToCompare = [];
    }
    else {
      // just turning on the checkbox from the merge/compare/duplicate button, so just turn it on and let the user select records
      if(type === 'merge'){
        this.mergeMode = true;
      }
      else if(type === 'compare'){
        this.compareMode = true;
      }
      else if(type === 'duplicate'){
        this.duplicateMode = true;
      }
      else if(type === 'addToList'){
        this.addToListMode = true;
      }
    }
  }

  async closeConfirmMergeDialog(event: 'cancel' | 'yes' | 'no') {
    if (event === 'yes') {
      if (this._entityInfo && this.recordCompareComponent) {
        const md = new Metadata();
        const pkeys = this._entityInfo.PrimaryKeys;
        const result = await md.MergeRecords({
          EntityName: this._entityInfo.Name,
          RecordsToMerge: this.recordsToCompare.map((r: BaseEntity) => {
            return r.PrimaryKey;
          }).filter((compositeKey: CompositeKey) => {
            if (!this.recordCompareComponent){
              return false;
            }

            return this.recordCompareComponent.selectedRecordCompositeKey.Equals(compositeKey);
          }),
          SurvivingRecordCompositeKey: this.recordCompareComponent.selectedRecordCompositeKey,
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

  async closeCompareDialog(event: 'close' | 'cancel' | 'merge' | 'duplicate' | 'addToList') {
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
        this.duplicateMode = false;
        this.addToListMode = false;
        this.isCompareDialogOpened = false;
        break;
    }
  }

  public async findDuplicateRecords(): Promise<void> 
  {
    if(!this._entityInfo){
      console.error("Entity Info is not available");
      this.closeCompareDialog('duplicate');
      return;
    }

    const md: Metadata = new Metadata();
    const list: ListEntity = await md.GetEntityObject<ListEntity>('Lists');
    list.NewRecord();
    list.Name = `Potential Duplicate Run`;
    list.Description = `Potential Duplicate Run for ${this._entityInfo.Name} Entity`;
    list.EntityID = this._entityInfo.ID;
    list.UserID = md.CurrentUser.ID;

    const saveResult = await list.Save();
    if(!saveResult){
        LogError(`Failed to save list for Potential Duplicate Run`, undefined, list.LatestResult);
        return;
    }

    let params: PotentialDuplicateRequest = new PotentialDuplicateRequest();
    params.EntityID = this._entityInfo?.ID;
    params.ListID = list.ID;
    params.RecordIDs = [];

    for(const index of this.selectedKeys){
      const viewData = this.viewData[index];
      const idField: number = viewData.ID;
      const listDetail: ListDetailEntityExtended = await md.GetEntityObject<ListDetailEntityExtended>('List Details');
      listDetail.NewRecord();
      listDetail.ListID = list.ID;
      listDetail.RecordID = idField.toString();
      listDetail.ContextCurrentUser = md.CurrentUser;
      const ldSaveResult: boolean = await listDetail.Save();
      if(!ldSaveResult){
        LogError(`Failed to save list detail for Potential Duplicate Run`, undefined, listDetail.LatestResult);
        return;
      }
    }

    this.closeCompareDialog('duplicate');
    this.CreateSimpleNotification("Working on finding duplicates, will notify you when it is complete...", 'info', 2000);

    let response = await md.GetRecordDuplicates(params, md.CurrentUser);
    console.log(response);
  }


  // Export Functionality
  public exportColumns: ViewColumnInfo[] = [];
  public exportData: any[] = [];
  public async doExcelExport() {
    if (this.kendoExcelExport === null) 
      throw new Error("kendoExcelExport is null, cannot export data");

    try {
      this.CreateSimpleNotification("Working on the export, will notify you when it is complete...", 'info', 2000);
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
      LogError(e);
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


  public showTemplatePreviewDialog: boolean = false;
  /**
   * Handles communication functionality for a given view, only available if the entity being displayed supports communication.
   */
  public async doCommunication() {
    if (!this.Params)
      return;

    this.showTemplatePreviewDialog = true;
  }

  /**
   * This method will invoke the selected action
   * @param action 
   */
  public async doEntityAction(action: EntityActionEntity) {
    try {
      // Get the currently selected record if we have one
      if (!this._entityInfo) {
        SharedService.Instance.CreateSimpleNotification("Unable to determine entity information", "error", 3000);
        return;
      }

      // Check if we have selected rows
      const selectedItems = this.selectedKeys?.length > 0 
        ? this.selectedKeys.map(key => this.viewData[key]) 
        : null;

      // Get reference to data provider and create ActionClient
      const md = new Metadata();
      
      // Since we can't access provider directly with typing, use a temporary any cast
      const provider = (md as any)._provider;
      const actionClient = new GraphQLActionClient(provider);
      
      // Determine the invocation type based on selection
      let invocationType = 'View'; // Default to View invocation type
      let entityObject = null;
      let result = null;

      // If we have selected records, use SingleRecord type for the first selected record
      if (selectedItems && selectedItems.length > 0) {
        invocationType = 'SingleRecord';
        
        // Get the entity object for the first selected record
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromEntityInfoAndRecord(this._entityInfo, selectedItems[0]);
        
        entityObject = await md.GetEntityObject(this._entityInfo.Name);
        await entityObject.InnerLoad(compositeKey);
      }
      
      // Run the entity action
      if (invocationType === 'SingleRecord' && entityObject) {
        const params: any = {
          EntityAction: action,
          InvocationType: { Name: invocationType },
          EntityObject: entityObject,
          ContextUser: md.CurrentUser
        };
        result = await actionClient.RunEntityAction(params);
      } else if (invocationType === 'View') {
        const params: any = {
          EntityAction: action,
          InvocationType: { Name: invocationType },
          ViewID: this.ViewID,
          ContextUser: md.CurrentUser
        };
        result = await actionClient.RunEntityAction(params);
      }

      if (result) {
        if (result.Success) {
          SharedService.Instance.CreateSimpleNotification(`Action ${action.Action} executed successfully`, "success", 3000);
          
          // Refresh the grid if needed
          if (this.Params) {
            this.Refresh(this.Params);
          }
        } else {
          SharedService.Instance.CreateSimpleNotification(`Error executing action: ${result.Message}`, "error", 5000);
        }
      }
    } catch (e) {
      const error = e as Error;
      LogError(`Error invoking entity action: ${error}`);
      SharedService.Instance.CreateSimpleNotification(`Error invoking action: ${error.message}`, "error", 5000);
    }
  }


  public get EntitySupportsCommunication(): boolean {
    try {
      if(!this._entityInfo)
        return false;

      return EntityCommunicationsEngineClient.Instance.EntitySupportsCommunication(this._entityInfo.ID);
    }
    catch (e){
      LogError (e);
      return false; // make this non fatal - this can occur at times due to timing issues, it seems, we need to investigate further
    }
  }


  @ViewChild('entityFormDialog') entityFormDialog: EntityFormDialogComponent | null = null;
  
  /**
   * This method will create a new record of the given entity type. It will only work if the User has the ability to create records of 
   * this entity type and also if the entity level setting AllowCreateAPI is set to 1. If either of these conditions are not met, then
   * this method will do nothing.
   */
  public async doCreateNewRecord() {
    // creates a new record either using a dialog or with NavigationService
    if (this.UserCanCreateNewRecord && this._entityInfo) {
      if (this.CreateRecordMode === 'Tab') {
        // Use NavigationService to open a new record form, passing initial values if provided
        this.navigationService.OpenNewEntityRecord(this._entityInfo.Name, {
          newRecordValues: this.NewRecordValues || undefined
        });
      }
      else {
        // configured to display a dialog instead, we'll use the entity-form-dialog for this
        if (this.entityFormDialog) {
          const md = new Metadata();
          const newRecord = await md.GetEntityObject(this._entityInfo.Name);
          if (this.NewRecordValues) {
            // we have new record values in a simple JS object, so grab the key/values from the object and set the values in the new record for non null/undefined values
            Object.keys(this.NewRecordValues).filter((key: string) => this.NewRecordValues[key] !== null && this.NewRecordValues[key] !== undefined).forEach((key: string) => {
              newRecord.Set(key, this.NewRecordValues[key]);
            });
          }
          this.entityFormDialog.Record = newRecord;
          this.showNewRecordDialog = true;
        }
        else {
          // don't have the dialog reference, throw an error
          throw new Error("Unable to create new record, entity-form-dialog is not available")
        }
      }
    }
  }

  public async toggleAddToListDialog(show: boolean): Promise<void> {
    // Use enhanced dialog if enabled
    if (this.useEnhancedListDialog && show) {
      this.openEnhancedListDialog();
      return;
    }

    this.showAddToListDialog = show;

    if(show){
      if(!this.sourceListEntities){
        await this.loadListEntities();
      }
      else{
        this.listEntities = this.sourceListEntities;
        this.selectedListEntities = [];
      }
    }
    else{
      this.enableCheckbox(true, 'addToList');
    }

    this.setupSearchDebounce();
  }

  public async loadListEntities(): Promise<void> {

    if(!this._entityInfo){
      LogError("Entity Info is not set");
      return;
    }

    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();

    const rvResult: RunViewResult = await rv.RunView({
      EntityName: 'Lists',
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this._entityInfo.ID}'` 
    });

    if(!rvResult.Success){
      LogError("Failed to load List Entities");
      return;
    }

    this.sourceListEntities = this.listEntities = rvResult.Results as ListEntity[];
  }

  public async addToList(listEntity: ListEntity): Promise<void> {
    console.log('add to list', listEntity.Name);
    this.selectedListEntities.push(listEntity);
    this.selectedListEntities.includes(listEntity);
  }

  public async removeFromList(listEntity: ListEntity): Promise<void> {
    console.log('remove from list', listEntity.Name);
    this.selectedListEntities = this.selectedListEntities.filter((le: ListEntity) => le.ID !== listEntity.ID);
  }

  public async addRecordsToSelectedLists(): Promise<void> {
    this.showAddToListLoader = true;
    const md: Metadata = new Metadata();
    let errorCount: number = 0;
    for(const listEntity of this.selectedListEntities){
      for(const index of this.selectedKeys){
        const listDetail: ListDetailEntityExtended = await md.GetEntityObject<ListDetailEntityExtended>('List Details');
        const viewData = this.viewData[index];
        const idField: number = viewData.ID;
        listDetail.NewRecord();
        listDetail.ListID = listEntity.ID;
        listDetail.RecordID = idField.toString();
        listDetail.Sequence = 0;
        listDetail.ContextCurrentUser = md.CurrentUser;
        let saveResult: boolean = await listDetail.Save();

        if(!saveResult){
          LogError(`Failed to save record to list: ${listEntity.Name}`);
          LogError(listDetail.LatestResult);
          errorCount++;
        }
      }
    }

    if(errorCount === 0){
      this.CreateSimpleNotification('Records successfully added to the selected lists', 'success', 2000);
    }
    else{
      this.CreateSimpleNotification('Some records failed to be added to the selected lists', 'error', 2000);
    }

    this.showAddToListLoader = false;
    this.toggleAddToListDialog(false);
  }

  /**
   * Opens the enhanced list management dialog with full membership visibility
   */
  public openEnhancedListDialog(): void {
    if (!this._entityInfo) {
      LogError("Entity Info is not set");
      return;
    }

    // Get selected record IDs
    const selectedRecordIds = this.selectedKeys.map((index: number) => {
      const viewData = this.viewData[index];
      return String(viewData.ID);
    });

    if (selectedRecordIds.length === 0) {
      this.CreateSimpleNotification('Please select at least one record', 'warning', 2000);
      return;
    }

    // Configure the enhanced dialog
    this.listManagementConfig = {
      mode: 'manage',
      entityId: this._entityInfo.ID,
      entityName: this._entityInfo.Name,
      recordIds: selectedRecordIds,
      allowCreate: true,
      allowRemove: true,
      showMembership: true
    };

    this.showEnhancedListDialog = true;
  }

  /**
   * Handles completion of the enhanced list management dialog
   */
  public onEnhancedListDialogComplete(result: ListManagementResult): void {
    this.showEnhancedListDialog = false;
    this.listManagementConfig = null;

    if (result.action === 'apply') {
      const addedCount = result.added.reduce((sum, a) => sum + a.recordIds.length, 0);
      const removedCount = result.removed.reduce((sum, r) => sum + r.recordIds.length, 0);

      if (addedCount > 0 || removedCount > 0) {
        let message = '';
        if (addedCount > 0) {
          message += `Added to ${result.added.length} list(s)`;
        }
        if (removedCount > 0) {
          if (message) message += ', ';
          message += `Removed from ${result.removed.length} list(s)`;
        }
        this.CreateSimpleNotification(message, 'success', 2500);
      }

      if (result.newListsCreated.length > 0) {
        // Invalidate the list cache since new lists were created
        this.sourceListEntities = null;
      }
    }

    // Exit selection mode
    this.enableCheckbox(true, 'addToList');
  }

  /**
   * Handles cancellation of the enhanced list management dialog
   */
  public onEnhancedListDialogCancel(): void {
    this.showEnhancedListDialog = false;
    this.listManagementConfig = null;
    this.enableCheckbox(true, 'addToList');
  }

  public onSearch(inputValue: string): void {
    this.searchDebounce$.next(inputValue);
  }


  private setupSearchDebounce(): void {
    this.searchDebounce$.pipe(
      debounceTime(500), // updated to 500ms to reduce API calls and since most people don't type super fast
      distinctUntilChanged(),
    ).subscribe((inputValue: string) => {
      this.search(inputValue);
    });
  }

  private async search(inputValue: string) {
    if(!this.sourceListEntities){
      return;
    }

    this.listEntitySearch = inputValue;
    const toLowerCase: string = inputValue.toLowerCase();
    this.listEntities = this.sourceListEntities.filter((listEntity: ListEntity) => {
      return listEntity.Name.toLowerCase().includes(toLowerCase);
    });
  }

  /**
   * Calculates and sets the grid height based on the Height input property.
   * - If Height is a number, uses that exact pixel height
   * - If Height is 'auto', calculates height to fill available viewport space
   * - If Height is undefined, uses legacy default of 400px
   */
  protected setGridHeight(): void {
    if (typeof this.Height === 'number') {
      // Explicit numeric height provided
      this.gridHeight = this.Height;
    } else if (this.Height === 'auto') {
      // Calculate height to fill viewport
      this.calculateAutoHeight();
    } else {
      // Legacy default (backward compatible)
      this.gridHeight = 400;
    }
  }

  /**
   * Calculates the auto height based on viewport and grid position
   */
  protected calculateAutoHeight(): void {
    if (this.kendoGridElementRef?.nativeElement) {
      const gridElement = this.kendoGridElementRef.nativeElement;
      const rect = gridElement.getBoundingClientRect();
      const gridTop = rect.top;
      const windowHeight = window.innerHeight;
      // Account for parent container bottom padding (10px from .single-view-wrap)
      const calculatedHeight = windowHeight - gridTop - this.BottomMargin - 10;

      // Ensure minimum height of 300px for usability
      const newHeight = Math.max(calculatedHeight, 300);

      // Only update if height actually changed to avoid unnecessary re-renders
      if (this.gridHeight !== newHeight) {
        this.gridHeight = newHeight;
      }
    } else {
      // Grid element not yet available, use default
      this.gridHeight = 400;
    }
  }

  /**
   * Sets up window resize listener to recalculate grid height dynamically
   */
  protected setupResizeListener(): void {
    if (this.Height === 'auto') {
      this.resizeListener = () => {
        this.calculateAutoHeight();
      };
      window.addEventListener('resize', this.resizeListener);
    }
  }

  /**
   * Cleanup when component is destroyed
   */
  ngOnDestroy(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
  }
}
 