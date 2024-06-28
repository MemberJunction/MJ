import { Component, EventEmitter, Input, Output,  AfterViewInit, OnDestroy, ViewChild, ElementRef, Renderer2, ChangeDetectorRef} from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import { Metadata, EntityFieldInfo, EntityInfo, EntityFieldTSType } from "@memberjunction/core";
import { DragEndEvent} from '@progress/kendo-angular-sortable';
import { UserViewEntityExtended, ViewGridState } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { ResourceData } from '@memberjunction/ng-shared';
import { WindowComponent } from '@progress/kendo-angular-dialog';
import { TabComponent } from '@progress/kendo-angular-layout';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { CompositeFilterDescriptor } from '@progress/kendo-data-query';
import { TextBoxComponent } from '@progress/kendo-angular-inputs';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { FormBuilder } from "@angular/forms";

@Component({
  selector: 'mj-user-view-properties-dialog',
  templateUrl: './user-view-properties.component.html',
  styleUrls: ['./user-view-properties.component.scss']
})
export class UserViewPropertiesDialogComponent extends BaseFormComponent implements AfterViewInit, OnDestroy {
  @Input() public ViewID: number | undefined;
  @Input() public EntityName: string | undefined;
  @Input() public ShowPropertiesButton: boolean = true;

  @Output() dialogClosed = new EventEmitter();


  public isDialogOpened: boolean = false;
  public showloader: boolean = true;

  // public  localViewColumns: ViewColumnInfo[] = [];
  public localGridState: any = {}
  public localFilterState: any = {}
  public defaultFilterState: any = {}
  public record!: UserViewEntityExtended;

  public ViewEntityInfo!: EntityInfo;

  private keyPressListener: any;
  public usedFields: Set<string> = new Set(); // Track used fields

  public sortFields: any[] = [];
  public sortState: any[] = [];
  public sortDirections= [
    { Name: 'Up', Value: 'asc' }, 
    { Name: 'Down', Value: 'desc' }
  ];

  @ViewChild(WindowComponent) kendoWindow!: WindowComponent;
  @ViewChild(TabComponent) kendoTab!: TabComponent;
  @ViewChild('nameField') nameField!: TextBoxComponent;
  @ViewChild('dialogContainer') dialogContainer!: ElementRef;
  @ViewChild('outerDialogContainer') private outerDialogContainer!: ElementRef;


  constructor (protected override route: ActivatedRoute, private elRef: ElementRef, private ss: SharedService, private formBuilder: FormBuilder, protected override router: Router, private renderer: Renderer2, protected cdr: ChangeDetectorRef) {
    super(elRef, ss, router, route, cdr);
    this.BottomMargin = 75; 

  }

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.saveProperties();
    }
  }

  override GetTabTopPosition(): number {
    return 50; // for this dialog, we don't want to offset the tab position related to where it is on the page, this is relative to top of dialog
  }

  public CreateView(entityName: string) {
    this.EntityName = entityName;
    this.ViewID = undefined;
    this.Open();
  }

  public async Open(ViewID: number | undefined = this.ViewID) {
    this.ViewID = ViewID;
    await this.Load();
    this.isDialogOpened = true; // binding causes the kendo window to open from this method call
    this.moveDialogToBody();
  }

  async Load() {
    const md = new Metadata();
    this.record = <UserViewEntityExtended> await md.GetEntityObject('User Views');

    if (this.ViewID) {
      // load the view
      await this.record.Load(this.ViewID);
    }
    else if (this.EntityName) {
      // We don't have a View ID, we are creating a NEW view, so do NewRecord()
      this.record.NewRecord();
      const e = md.Entities.find (e => e.Name == this.EntityName);
      if (e){
        this.record.SetDefaultsFromEntity(e);
      }
      else {
        throw new Error(`Entity ${this.EntityName} not found in metadata`);
      }
    }

    // now we load up the columns
    this.FinishLoad(md);
    this.showloader = false;
    setTimeout(() => {
      this.ResizeTab();
    }, 200);
  }

  public closePropertiesDialog() {
    this.dialogClosed.emit({});
    this.isDialogOpened = false; // binding causes the kendo window to close from this method call
    if (this.keyPressListener) { // removing the keypress listener when the dialog closes
      this.dialogContainer.nativeElement.removeEventListener('keypress', this.keyPressListener);
    }
  }

  public async FinishLoad(md: Metadata) {
    this.ViewEntityInfo = md.Entities.find(e => e.ID == this.record.EntityID)!;
    // using all these local variables because the VSCode debugger doesn't know what "this" is all of a sudden
    if (!this.ViewEntityInfo) 
      throw new Error(`Entity ${this.record.EntityID} not found in metadata`);
    
    // prepare the sorting state
    this.sortFields = this.ViewEntityInfo.Fields;    
    if (this.record.SortState === null || this.record.SortState === undefined || this.record.SortState.trim().length === 0) 
      this.sortState = [];
    else
      this.sortState = JSON.parse(this.record.SortState);

    // now translate the sortState into the UI format by swapping out the primitve field names and sort direction with the data objects that the kendo ui will bind to
    this.sortState = this.sortState.map((s: any) => {
      let dir: string;
      if (typeof s.direction === 'string') {
        dir = s.direction;
      }
      else if (typeof s.direction === 'number' && s.direction === 1) { // some legacy views have 1 and 2 for asc and desc
        dir = 'asc';
      }
      else if (typeof s.direction === 'number' && s.direction === 2) {
        dir = 'desc';
      }
      else {
        dir = '';
      }
      return {
        field: this.ViewEntityInfo?.Fields.find((f: EntityFieldInfo) => f.Name === s.field),
        direction: this.sortDirections.find((d: any) => d.Value.trim().toLowerCase() === dir)
      }
    });

    this.localGridState = JSON.parse(this.record.GridState!);
    const temp = this.localGridState;
    this.localFilterState = JSON.parse(this.record.FilterState!);
    this.defaultFilterState = this.localFilterState; // adding a duplicate filter state for populating the default filter state
    this.appendUnusedColumnsToColumnSettings(this.localGridState);
    this.localGridState.columnSettings.sort((a: any,b:any) => {
      if (a.hidden && !b.hidden) return 1;
      if (!a.hidden && b.hidden) return -1;
      
      // if we get here, they're both hidden, or both not hidden, so sort by orderIndex
      return a.orderIndex - b.orderIndex;
    });
    
    setTimeout(() => {
      this.keyPressListener = this.onKeyPress.bind(this);
      this.dialogContainer.nativeElement.addEventListener('keypress', this.onKeyPress.bind(this));
      this.nameField.focus();
    }, 200);
  }

  private appendUnusedColumnsToColumnSettings(gridState: ViewGridState) {
    // we go through our EntityFields and add any that aren't already in the columnSettings
    // this is so that we can add new columns to the view that were not previously used in this view
    const unusedFields = this.ViewEntityInfo?.Fields.filter(f => {
      if (gridState.columnSettings.find((col: any) => col.Name.trim().toLowerCase() === f.Name.trim().toLowerCase())) 
        return false; // this entity field is already in the columnSettings
      else
        return true; // this entity field is not in the columnSettings
    });

    // now we add the unused fields to the columnSettings
    unusedFields?.forEach((f: EntityFieldInfo) => {
      gridState.columnSettings.push({
        ID: f.ID,
        DisplayName: f.DisplayName,
        Name: f.Name,
        orderIndex: gridState.columnSettings.length,
        width: f.DefaultColumnWidth ? f.DefaultColumnWidth : 100,
        EntityField: f,
        hidden: true
      });
    });
  }

  public onDragEnd(e: DragEndEvent): void {
    if (e.index >= 0) {
      // const column = this.localViewColumns[e.index];
      if (this.localGridState) {
        const lvc = this.localGridState.columnSettings;
        for (let i = 0; i < lvc.length; i++) {
          const col = lvc[i];
          col.orderIndex = i; // the orderIndex inside the column is what is actually used to drive this, the order in the ARRAY gets updated by KendoSortable but orderIndex isn't automatically updated
        }
        this.updateRecordGridState();
      }
    }
  }

  protected updateRecordGridState() {
    const temp = JSON.stringify(this.localGridState);
    const tempO = JSON.parse(temp); // make sure we have a clean object that is NOT linked in memory to the localGridState
    
    // now strip the EntityField from the columnSettings in the tempO object
    tempO.columnSettings.forEach((col: any) => {
      delete col.EntityField;
    });

    this.record.GridState = JSON.stringify(tempO); // stringify the state into the record  
  }

  public onFilterChange(value: CompositeFilterDescriptor): void {
    this.localFilterState = value;
  }

  public async toggleColumn(column: any) {
    column.hidden = !column.hidden; // do the toggle

     if (this.localGridState) 
        this.updateRecordGridState(); 
  }

  public async saveProperties() : Promise<void> {

    const bNewRecord = !this.record.IsSaved;
    this.showloader = true;
    const lfs = JSON.stringify(this.localFilterState);
    this.record.FilterState = JSON.stringify(this.localFilterState); // pass this along as as string, not directly bound since Kendo Filter is bound to a local object we need to translate to a string

    // need to convert the UI format to the data format.  
    const sortMap = this.sortState.map((s: any) => {
      return {
        field: s.field.Name,
        direction: s.direction.Value
      }
    });
    this.record.SortState = JSON.stringify(sortMap);

    // validate the record first
    const valResults = this.record.Validate();
    if (valResults.Success === false) {
      this.showloader = false;
      this.sharedService.CreateSimpleNotification('Validation Errors: ' + valResults.Errors.map((e) => e.Message).join('\n'), 'warning', 7500);
    }

    let saveResult: boolean = await this.record.Save(); 
    if(saveResult){
      // stop showing the loader and close the dialog if we saved successfully
      this.showloader = false;
      this.isDialogOpened = false;
  
      let event: any = {
        Saved: true, 
        ViewEntity: this.record,
        Cancel: false,
        bNewRecord: bNewRecord
      }

      this.dialogClosed.emit(event); 

      if(event.Cancel) {
        return;
      }

      if (!bNewRecord) // view already exists so we're not changing the route as it is alreayd on the view, but we fire an event to let people know that it's changed
        MJGlobal.Instance.RaiseEvent({
          event: MJEventType.ComponentEvent,
          eventCode: EventCodes.ViewUpdated,
          args: new ResourceData({ 
                                  ResourceTypeID: this.sharedService.ViewResourceType.ID,
                                  ResourceRecordID: this.record.FirstPrimaryKey.Value, 
                                  Configuration: {
                                    ViewEntity: this.record
                                  }
                                }),
          component: this
        });
      else{
        // we route to the new view using the router
        this.router.navigate(['resource', 'view', this.record.FirstPrimaryKey.Value])
      }
    }
    else {
      // it failed, so don't close the dialog
      this.showloader = false;
      this.sharedService.CreateSimpleNotification('Saving the view failed, please try again and if this persists contact your administrator.', 'error', 5000);
    }
  }
 
  public defaultOperators: any = {
    string: ["contains", "doesnotcontain", "eq", "neq", "startswith", "endswith", "isnull", "isnotnull", "isempty", "isnotempty"],
    number: ["neq", "eq", "gte", "gt", "lte", "lt", "isnull", "isnotnull"],
    date: ["neq", "eq", "gte", "gt", "lte", "lt", "isnull", "isnotnull"],
    boolean: ["eq", "neq"]
  };


  private _savedFilters: any = null;
  public setupFilters() {
    if (this._savedFilters === null) {
        const filters = this.ViewEntityInfo!.Fields.map((f: EntityFieldInfo) =>  this.toKendoFilterField(f));
        this._savedFilters = filters;
        return filters;
    }
    else
        return this._savedFilters;
  }
 
  public toKendoFilterField = (f: EntityFieldInfo): any => {
    return {
      field: f.Name,
      title: f.DisplayName ?? f.Name,
      editor: this.getKendoEditor(f),
      operators: this.getKendoOperators(f)
    }
  }
 
  public getKendoEditor (field: EntityFieldInfo)  {
    switch (field.TSType) {
        case EntityFieldTSType.Boolean:
            return 'boolean';
        case EntityFieldTSType.Date:
            return 'date';
        case EntityFieldTSType.Number:
            return 'number';
        default:
            return 'string';
    }
  }

  public getKendoOperators (field: EntityFieldInfo) {
    switch (field.TSType) {
        case EntityFieldTSType.Boolean:
            return this.defaultOperators.boolean;
        case EntityFieldTSType.Date:
            return this.defaultOperators.date;
        case EntityFieldTSType.Number:
            return this.defaultOperators.number;
        default:
            return this.defaultOperators.string;
    }
  }

  
  protected override get ContainerObjectHeight(): number {
    if (this.kendoWindow)
      return this.kendoWindow.height;
    else
      return 0;
  }

  addSort() {
    this.sortState = this.sortState.concat({field: this.ViewEntityInfo?.Fields[0], direction: this.sortDirections[0]}); // add a new sort item
  }

  removeSort(item: any) {
    this.sortState = this.sortState.filter((i) => i !== item);
  }
 
  sortColumnValueChange(sortItem: any, newValue: EntityFieldInfo) { 
    const idx = this.sortState.findIndex((i: any) => i === sortItem);

    console.log(this.sortState)
    console.log(newValue)
  }
  sortDirectionValueChange(sortItem: any, newValue: any) {
  }


  private _movedToBody: boolean = false;
  moveDialogToBody() {
    if (this._movedToBody)
      return;
    const dialogElement = this.outerDialogContainer.nativeElement;
    this.renderer.appendChild(document.body, dialogElement);

    this._movedToBody = true;
  }
}