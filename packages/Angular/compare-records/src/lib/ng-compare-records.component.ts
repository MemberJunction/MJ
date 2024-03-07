import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { GridComponent, RowClassArgs } from '@progress/kendo-angular-grid';
import { Subscription, debounceTime, fromEvent } from 'rxjs';
import { BaseEntity, EntityDependency, EntityField, EntityFieldInfo, EntityInfo, LogError, Metadata, PrimaryKeyValue, RunView } from '@memberjunction/core'
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
  public selectedRecordPKeyVal: PrimaryKeyValue[] = [];
  public fieldMap: {fieldName: string, primaryKeyValues: PrimaryKeyValue[], value: any}[] = [];

  @ViewChild('kendoGrid', { read: GridComponent }) kendoGridElement: GridComponent | null = null;
  @ViewChild('kendoGrid', { read: ElementRef }) kendoGridElementRef: ElementRef | null = null;

  protected entityInfo: EntityInfo | undefined;
  protected primaryKeys: EntityFieldInfo[] = [];


  constructor() {}

  async ngOnInit() {
    this.setGridHeight();
    await this.preprocessRecordsToCompare();
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

  protected getPKeyString(record: any): string {
    // iterate through the record's primary key(s) and construct a string that represents the primary key
    let pkeyString = '';
    for (const pkey of this.primaryKeys) {
      if (pkeyString.length > 0)
        pkeyString += ',';
      pkeyString += record[pkey.Name];
    }
    return pkeyString;
  }
  protected getPKeyValues(record: any): PrimaryKeyValue[] {
    if (!record)
      return [];

    // iterate through the record's primary key(s) and construct a string that represents the primary key
    let pkeyValues: PrimaryKeyValue[] = [];
    for (const pkey of this.primaryKeys) {
      const pkeyValue = new PrimaryKeyValue();
      pkeyValue.FieldName = pkey.Name;
      pkeyValue.Value = record[pkey.Name];
      pkeyValues.push(pkeyValue);
    }
    return pkeyValues;
  }

  protected async preprocessRecordsToCompare() {
    // this function checks each of the records in the recordsto compare array and makes sure that they are all BaseEntity objects
    // if they are not base entity objects, we check to see if the record has the same # of fields as the entity we are comparing
    // and if not, we have to go to the DB and load the data, but to do that efficiently, we do it in one fell swoop via the RunView object

    const md = new Metadata();
    const entity = md.Entities.find(e => e.Name.trim().toLowerCase() === this.entityName.trim().toLowerCase());
    const loadFromDatabase: {rawObject: any, replacementObject?: BaseEntity}[] = [];
    if (!entity)
      throw new Error('Entity not found: ' + this.entityName);

    for (const r of this.recordsToCompare) {
      // first, check to see if r is a BaseEntity object
      if (r instanceof BaseEntity) {
        // it is, so we're good
      }
      else {
        // it's not an entity object, so we need to see how many fields it has
        const fields = Object.keys(r);
        // now make sure that we have every field within our fields array that exists in the entity.fields array
        const entityFields = entity.Fields.map(f => f.Name);
        const missingFields = entityFields.filter(f => !fields.includes(f));
        if (missingFields.length === 0) {
          // we have all the fields, so we can create a new BaseEntity object and load the data
          const record = await md.GetEntityObject(this.entityName); 
          record.LoadFromData(r); // we just load from the data we have
          // replace the object in the array
          this.recordsToCompare[this.recordsToCompare.indexOf(r)] = record;
        }
        else {
          // we have missing fields so add this to the list of records to load from the DB
          loadFromDatabase.push({rawObject: r});
        }
      }      
    }

    // now, at the end of the loop we check to see if we have any records in our loadFromDatabase array and if so, we have to run a view to get the data
    if (loadFromDatabase.length > 0) {
      // we have 1+ records to load from the db, so build a filter condition to use with the RunView object
      let filter: string = '';
      for (const r of loadFromDatabase) {
        if (filter.length > 0)
          filter += ' OR ';

        let innerFilter = '';
        for (const pkey of entity.PrimaryKeys) {
          if (innerFilter.length > 0)
            innerFilter += ' AND ';
          const quotes = pkey.NeedsQuotes ? "'" : '';
          innerFilter += `${pkey.Name}=${quotes}${r.rawObject[pkey.Name]}${quotes}`;
        }
        filter += `(${innerFilter})`;
      }

      // now we have a proper filter defined so we can run the view
      const rv = new RunView();
      const result = await rv.RunView({EntityName: this.entityName, ExtraFilter: filter, ResultType: 'entity_object'});
      if (result && result.Success) {
        for (const r of result.Results) {
          const rec = <BaseEntity>r;
          const index = loadFromDatabase.findIndex(l => {
            // check all of the primary key fields to see if they match
            for (const pkey of entity.PrimaryKeys) {
              if (rec.Get(pkey.Name) !== l.rawObject[pkey.Name]) {
                return false;
              }
            }
            return true;
          })
          if (index >= 0) {
            // update the replacement object in the loadFromDatabase array
            loadFromDatabase[index].replacementObject = rec;
            // update the recordsToCompare array with the new object
            this.recordsToCompare[this.recordsToCompare.indexOf(loadFromDatabase[index].rawObject)] = rec;
          }
        }
      }
    }
    // at this point, all of the objects in the recordsToCompare array are BaseEntity objects
  }

  protected async prepareViewData() {
    try {
      this.isLoading = true;
      this.viewData = [];
      const md = new Metadata();
      this.entityInfo = md.Entities.find(e => e.Name.trim().toLowerCase() === this.entityName.trim().toLowerCase());
      if (!this.entityInfo)
        throw new Error('Entity not found: ' + this.entityName);

      this.primaryKeys = this.entityInfo.PrimaryKeys;

      // remove all entries from this.visibleColumns, then add in new entries
      this.visibleColumns = [];
      this.entityInfo.Fields.forEach(f => this.visibleColumns.push(<ViewColumnInfo>{hidden: false, Name: f.Name, EntityField: f, ID: f.ID, DisplayName: f.DisplayName}));
      if (this.visibleColumns.length && this.recordsToCompare.length) {
        this.columns[0] = { field: 'Fields', title: 'Fields', width: 200, locked: true, lockable: false, filterable: false, sortable: false };
        this.visibleColumns.forEach((column) => {
          if (!column.hidden) {
            let obj: any = {};
            obj['Fields'] = column.Name;
            this.recordsToCompare.forEach((record, index: number) => { 
              const pkeyVals = this.getPKeyValues(record);
              obj[this.getPKeyString(record)] = { Field: column.Name, Value: record.Get(column.Name), metaData: column, primaryKeyValues:pkeyVals };
              this.columns[index + 1] = { field: '_' + this.getPKeyString(record), primaryKeyValues: pkeyVals, title: this.GetColumnHeaderTextFromPKeys(pkeyVals), width: 200, locked: true, lockable: false, filterable: false, sortable: false };
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

  protected _recordDependencies: {pkeyValues: PrimaryKeyValue[], dependencies: EntityDependency[]}[] = [];  
  public async SetDefaultSelectedRecord() {
    try {
      // find out how many dependencies each record has
      const md = new Metadata();
      if (this._recordDependencies.length !== this.recordsToCompare.length) {
        // dependencies not loaded yet, so load 'em up
        this._recordDependencies = [];
        for (const record of this.recordsToCompare) {
          const primaryKeyValues = this.getPKeyValues(record);
          const dependencies = await md.GetRecordDependencies(this.entityName, primaryKeyValues)
          this._recordDependencies.push({pkeyValues: primaryKeyValues, dependencies: dependencies});
        }
      }
      // the default is simply the record with the most dependencies, and if they're all equal, the first one
      let maxDependencies = 0;
      let defaultPkeyValue: PrimaryKeyValue[] = [];
      for (const record of this._recordDependencies) {
        if (record.dependencies.length > maxDependencies) {
          maxDependencies = record.dependencies.length;
          defaultPkeyValue = record.pkeyValues;
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

  public FormatColumnValue(dataItem: any, column: any, maxLength: number) { //column: ViewColumnInfo, value: string, maxLength: number) {
    try {
      if (dataItem && column && column.primaryKeyValues) { 
        const record = this.recordsToCompare.find(r => this.ComparePrimaryKeys(this.getPKeyValues(r), column.primaryKeyValues));
        const pkeyString = this.getPKeyString(record);
        const item = dataItem[pkeyString]
        const val = item.Value;
        const field = item.metaData.EntityField;
        return field.FormatValue(val, undefined, undefined, maxLength);
      }
    }
    catch (err) {
      console.log(err);
    }
  }

  public ComparePrimaryKeys(pkeyValues1: PrimaryKeyValue[], pkeyValues2: PrimaryKeyValue[]) {
    if (pkeyValues1.length !== pkeyValues2.length)
      return false;

    for (let i = 0; i < pkeyValues1.length; i++) {
      if ( pkeyValues1[i].Value !== pkeyValues2[i].Value)
        return false;
    }

    return true;
  }

  public IsCellSelected(dataItem: any, column: any) {
    if (this.selectionMode && dataItem && dataItem.Fields) {
      // we are in a mode where selection is possible. So, let's figure out if the current cell is selected or not
      // First, figure out which field we are dealing with
      const colIndex = this.columns.indexOf(column);
      const pkeyValues = this.getPKeyValues(this.recordsToCompare[colIndex - 1 /*first column is the field names so always subtract one*/]);

      const fieldName = dataItem.Fields;
      // now, see if we have a field map for this field
      const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
      if (fieldMapIndex >= 0) {
        // we have a field map for this field, so see if the pkeys matches the selected pkeys
        return (this.ComparePrimaryKeys(pkeyValues, this.fieldMap[fieldMapIndex].primaryKeyValues));
      }
      else {
        // we do not have a field map for this field, so see if the pkeys matches the selected pkeys
        // as we default to the selected record when we don't have a field map
        return (this.ComparePrimaryKeys(pkeyValues, this.selectedRecordPKeyVal));
      }
    }
    else
      return false; // selection mode is off, always return false
  }

  public IsItemFieldMapped(dataItem: any): boolean {
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

  public GetCellStyle(dataItem: any, column: any) {
    const bReadOnly = this.IsCellReadOnly(dataItem, column);
    const readOnlyClass = bReadOnly ? ' cell-readonly' : '';
    if(this.IsCellSelected(dataItem, column)) {
      if (this.IsItemFieldMapped(dataItem)) 
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

  public IsCellReadOnly(dataItem: any, column: any): boolean {
    if (dataItem && column) {  
      // dataItem.Fields contains the name of the field that we are showing in this row, check if that is read only
      const fieldName = dataItem.Fields;
      const field = this.entityInfo?.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
      if (field && field.ReadOnly)
        return true;
    }

    // if we get here, not read only
    return false;
  }

  public GetColumnHeaderText(column: any) {
    return this.GetColumnHeaderTextFromPKeys(column?.primaryKeyValues);
  }

  public GetColumnHeaderTextFromPKeys(pkeyValues: PrimaryKeyValue[]) {
    if (pkeyValues) {
      // see if we have any dependencies
      const r = this._recordDependencies.find(r =>  this.ComparePrimaryKeys(r.pkeyValues, pkeyValues) );
      const prefix = this.selectionMode && this.ComparePrimaryKeys(this.selectedRecordPKeyVal, pkeyValues) ? '✓✓✓ ' : '';
      const record = this.recordsToCompare.find(r => this.ComparePrimaryKeys(this.getPKeyValues(r), pkeyValues));
      const s = this.getPKeyString(record);
      if (r) {
        return `${prefix}Record: ${s} (${r.dependencies.length} dependencies)`;
      }
      else
        return prefix + 'Record: ' + s;
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
      // { fieldName: 'FirstName', primaryKeyValuse: [] }
      const record = this.recordsToCompare[col];
      const currentRecordPkeys = this.getPKeyValues(record);
      const currentRecordPkeyString = this.getPKeyString(record);
      const fieldName = this.viewData[row].Fields; // get the field name from the row -- use this.viewData, not visibleColumns because that visibleColumns stuff gets filtered down based on what is matching

      // first check to see if the user selected a read-only field
      if (!event.dataItem[currentRecordPkeyString].metaData.EntityField.ReadOnly) {
        // only make writeable fields selectable
        if (!this.ComparePrimaryKeys(this.selectedRecordPKeyVal, currentRecordPkeys)) {
          // check to see if we have a fieldmap for the current field. If we do have one, then update it to the current record
          // if we don't have one, then add it
          const fieldMapIndex = this.fieldMap.findIndex(f => f.fieldName === fieldName);
          if (fieldMapIndex >= 0) {
            // we found an entry in the field map for this field, so update it
            this.fieldMap[fieldMapIndex].primaryKeyValues = currentRecordPkeys;
            this.fieldMap[fieldMapIndex].value = event.dataItem[currentRecordPkeyString].Value;
          }
          else {
            // we didn't find an entry in the field map for this field, so add it
            this.fieldMap.push({fieldName: fieldName, primaryKeyValues: currentRecordPkeys, value: event.dataItem[currentRecordPkeyString].Value});
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
          // now find the column index from the column text
          const columnIndex = this.columns.findIndex(c => c.title === columnText);
          if (columnIndex >= 0) {
            this.selectedRecordPKeyVal = this.getPKeyValues(this.recordsToCompare[columnIndex]);
          }
        }
    }
  }
}
