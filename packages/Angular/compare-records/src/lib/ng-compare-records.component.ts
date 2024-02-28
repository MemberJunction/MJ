import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { GridComponent, RowClassArgs } from '@progress/kendo-angular-grid';
import { Subscription, debounceTime, fromEvent } from 'rxjs';
import { BaseEntity, EntityDependency, LogError, Metadata } from '@memberjunction/core'
import { ViewColumnInfo } from '@memberjunction/core-entities'

@Component({
  selector: 'mj-compare-records',
  templateUrl: './ng-compare-records.component.html',
  styleUrls: ['./ng-compare-records.component.css']
})
export class CompareRecordsComponent {
  @Input() recordsToCompare: BaseEntity[] = [];
  @Input() entityName: string = '';
  @Input() visibleColumns: ViewColumnInfo[] = [];
  @Input() selectionMode: boolean = false;

  viewData: any = [];
  private resizeSub: Subscription | null = null;
  public gridHeight: number = 700;
  private _gridMargin = 150;
  public isLoading: boolean = false;
  public columns: any[] = [];
  public showDifferences: boolean = true;
  public suppressBlankFields: boolean = true;
  public selectedRecordPKeyVal: any = null;
  public fieldMap: {fieldName: string, recordId: any, value: any}[] = [];

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;

  constructor() {}

  async ngOnInit() {
    this.setGridHeight();
    await this.prepareViewData();
  }

  setGridHeight(): void {
    // Subscribe to the window resize event
    this.resizeSub = fromEvent(window, 'resize').pipe(
      debounceTime(100) // Debounce the resize event to avoid frequent updates
    ).subscribe(() => {
      // Update the grid height when the window is resized
      this.ResizeGrid();
    });

    // Set the initial grid height with a slight delay to allow stuff to get set
    setTimeout(() => {
      this.ResizeGrid();
    }, 100);
  }

  public ResizeGrid(): void {
    this._gridMargin = this.getGridTopPosition();
    this.gridHeight = window.innerHeight - this._gridMargin;
  }

  protected getGridTopPosition(): number {
    if (this.kendoGridElementRef) {
      const gridElement = this.kendoGridElementRef.nativeElement;
      const gridRect = gridElement.getBoundingClientRect();
      const bodyRect = document.body.getBoundingClientRect();

      return gridRect.top - bodyRect.top;
    }
    else
      return 0;
  }

  protected async prepareViewData() {
    try {
      this.isLoading = true;
      this.viewData = [];
      if (this.visibleColumns.length && this.recordsToCompare.length) {
        this.columns[0] = { field: 'Fields', title: 'Fields', width: 200, locked: true, lockable: false, filterable: false, sortable: false };
        this.visibleColumns.forEach((column) => {
          if (!column.hidden) {
            let obj: any = {};
            obj['Fields'] = column.Name;
            this.recordsToCompare.forEach((record, index: number) => { 
              obj[record.PrimaryKey.Value] = { Field: column.Name, Value: record.Get(column.Name), metaData: column, recordId: record.PrimaryKey.Value };
              this.columns[index + 1] = { field: record.PrimaryKey.Value, recordId: record.PrimaryKey.Value, title: record.PrimaryKey.Value, width: 200, locked: true, lockable: false, filterable: false, sortable: false };
            });
            if ((this.suppressBlankFields || this.showDifferences) && !['ID', 'Name'].includes(obj.Fields)) {
              let tempObj = { ...obj };
              delete tempObj['Fields'];
              let values = Object.values(tempObj);
              let addValue = false;
              const hasBlankFields = values.every((item:any) => item['Value'] === '' || item['Value'] === null || item['Value'] === undefined);
              const hasDifferentValues = new Set(values.map((item: any) => item['Value'])).size === values.length;
              if (this.suppressBlankFields && !this.showDifferences && !hasBlankFields) {
                addValue = true;  
              } else if (!this.suppressBlankFields && this.showDifferences && hasDifferentValues) {
                addValue = true;
              } else if (this.suppressBlankFields && this.showDifferences && !hasBlankFields && hasDifferentValues) {
                addValue = true;
              }
              if(addValue){
                this.viewData.push(obj);  
              }
            } else {
              this.viewData.push(obj);  
            }
          }
        });
  
        // temp - set the selected record to the first record to compare, we should use dependencies to check 
        if (this.selectionMode) {
          await this.SetDefaultSelectedRecord();
        }
  
        this.isLoading = false;
      }
    }
    catch (e) {
      LogError(e);
    }
  }

  protected _recordDependencies: {pkeyValue: any, dependencies: EntityDependency[]}[] = [];  
  public async SetDefaultSelectedRecord() {
    try {
      // find out how many dependencies each record has
      const md = new Metadata();
      if (this._recordDependencies.length !== this.recordsToCompare.length) {
        // dependencies not loaded yet, so load 'em up
        this._recordDependencies = [];
        for (const record of this.recordsToCompare) {
          const dependencies = await md.GetRecordDependencies(this.entityName, record.PrimaryKey.Value)
          this._recordDependencies.push({pkeyValue: record.PrimaryKey.Value, dependencies: dependencies});
        }
      }
      // the default is simply the record with the most dependencies, and if they're all equal, the first one
      let maxDependencies = 0;
      let defaultPkeyValue: any = null;
      for (const record of this._recordDependencies) {
        if (record.dependencies.length > maxDependencies) {
          maxDependencies = record.dependencies.length;
          defaultPkeyValue = record.pkeyValue;
        }
      }
      this.selectedRecordPKeyVal = defaultPkeyValue;
    }
    catch (e) {
      LogError(e)
    }
  }

  public GetRowClass = (context: RowClassArgs) => {
    return { 'compare-grid-rows': true };
  }

  public FormatColumnValue(dataItem: any, item: any, maxLength: number) { //column: ViewColumnInfo, value: string, maxLength: number) {
    try {
      if (dataItem && item && item.recordId && dataItem[item.recordId] && dataItem[item.recordId].metaData && dataItem[item.recordId].metaData.EntityField) {
        const val = dataItem[item.recordId].Value;
        return dataItem[item.recordId].metaData.EntityField.FormatValue(val, undefined, undefined, maxLength);
      }
    }
    catch (err) {
      console.log(err);
    }
  }

  public IsCellSelected(dataItem: any, recordId: string) {
    if (this.selectionMode && dataItem && dataItem.Fields) {
      // we are in a mode where selection is possible. So, let's figure out if the current cell is selected or not
      // First, figure out which field we are dealing with
      const fieldName = dataItem.Fields;
      // now, see if we have a field map for this field
      const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
      if (fieldMapIndex >= 0) {
        // we have a field map for this field, so see if the recordId matches the selected recordId
        return (parseInt(recordId) === this.fieldMap[fieldMapIndex].recordId);
      }
      else {
        // we do not have a field map for this field, so see if the recordId matches the selected recordId
        // as we default to the selected record when we don't have a field map
        return (parseInt(recordId) === this.selectedRecordPKeyVal)
      }
    }
    else
      return false; // selection mode is off, always return false
  }

  public IsItemFieldMapped(dataItem: any, recordId: string): boolean {
    if (this.selectionMode && dataItem && dataItem.Fields) {
      // we are in a mode where selection is possible. So, let's figure out if the current cell is selected or not
      // First, figure out which field we are dealing with
      const fieldName = dataItem.Fields;
      // now, see if we have a field map for this field
      const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
      if (fieldMapIndex >= 0) {
        return true;
      }
      else {
        return false;
      }
    }
    else
      return false; // selection mode is off, always return false
  }

  public GetCellStyle(dataItem: any, recordId: string) {
    const bReadOnly = this.IsCellReadOnly(dataItem, recordId);
    const readOnlyClass = bReadOnly ? ' cell-readonly' : '';
    if(this.IsCellSelected(dataItem, recordId)) {
      if (this.IsItemFieldMapped(dataItem, recordId)) 
        return 'cell cell-selected-override';
      else
        return 'cell cell-selected' + readOnlyClass;
    }
    else {
      if (this.selectionMode)
        return 'cell cell-not-selected' + readOnlyClass;
      else
        return 'cell'; // selection mode is off, just regular cell format
    }
  }

  public IsCellReadOnly(dataItem: any, recordId: string): boolean {
    // first check to see if the user selected a read-only field
    if (dataItem && recordId && dataItem[recordId].metaData?.EntityField?.ReadOnly) 
      return true;
    else 
      return false;
  }

  public GetColumnHeaderText(recordId: any) {
    if (recordId) {
      // see if we have any dependencies
      const r = this._recordDependencies.find(r => r.pkeyValue === recordId);
      const prefix = this.selectedRecordPKeyVal === recordId ? '✓✓✓ ' : '';
      if (r) {
        return `${prefix}Record: ${recordId} (${r.dependencies.length} dependencies)`;
      }
      else
        return prefix + 'Record: ' + recordId;
    }
    else
      return 'Fields';
  }

  public SelectField(event: any) {
    const col: number = event.columnIndex ? event.columnIndex - 1 : -1;
    const row = event.rowIndex;
    // select the record based on the column
    if (col >= 0 && col < this.recordsToCompare.length && row) {
      // we don't change the selected RECORD here, what we do is change the selected COLUMN
      // the way it works is that if we are using a field from a record OTHER than the selected record, we create an
      // entry in the this.fieldMap array to mark that field from that other record as overriding the selected record's field
      // so if we select a field from record 2, we will have an entry in the fieldMap array that looks like this:
      // { fieldName: 'FirstName', recordId: 2 }
      const currentRecordId = this.recordsToCompare[col].PrimaryKey.Value;
      const fieldName = this.viewData[row].Fields; // get the field name from the row -- use this.viewData, not visibleColumns because that visibleColumns stuff gets filtered down based on what is matching

      // first check to see if the user selected a read-only field
      if (!event.dataItem[currentRecordId].metaData.EntityField.ReadOnly) {
        // only make writeable fields selectable
        if (this.selectedRecordPKeyVal !== currentRecordId) {
          // check to see if we have a fieldmap for the current field. If we do have one, then update it to the current record
          // if we don't have one, then add it
          const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
          if (fieldMapIndex >= 0) {
            // we found an entry in the field map for this field, so update it
            this.fieldMap[fieldMapIndex].recordId = currentRecordId;
            this.fieldMap[fieldMapIndex].value = event.dataItem[currentRecordId].Value;
          }
          else {
            // we didn't find an entry in the field map for this field, so add it
            this.fieldMap.push({fieldName: fieldName, recordId: currentRecordId, value: event.dataItem[currentRecordId].Value});
          }
        }
        else {
          // the current record IS the selected record. So, let's see if there IS an entry in the field map for this field
          // and if so, let's remove it
          const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
          if (fieldMapIndex >= 0) {
            this.fieldMap.splice(fieldMapIndex, 1); // field map removed, which means we default back to the selected record
          }
        }
  
      }
    }
  }

  onGridClick(event: MouseEvent) {
    // Check if the clicked element or its parent has the 'k-header' class, indicating it's a header cell
    if (event.target instanceof HTMLElement) {
        const element: HTMLElement = event.target;
        if (element.classList.contains('k-header') || element.closest('.k-header')) {
          const columnText = element.innerText;
          const recordId = this.extractRecordId(columnText);
          if (recordId) {
            this.selectedRecordPKeyVal = recordId; // selected the record here
          }
        }
    }
  }

  protected extractRecordId(str: string): any {
    const match = str.match(/Record: (\d+)/);
    return match ? match[1] : null;
  }
}
