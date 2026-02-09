import { Component, Input, AfterViewInit, ChangeDetectorRef, ElementRef } from '@angular/core';

import { BaseEntity, EntityFieldInfo, EntityFieldTSType, EntityInfo, LogError, Metadata, RunView, RunViewParams, ValidationErrorInfo } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { BaseFormComponentEvent, BaseFormComponentEventCodes, FormEditingCompleteEvent } from '@memberjunction/ng-base-types';

export class JoinGridCell {
  index!: number;
  RowForeignKeyValue: any;
  ColumnForeignKeyValue?: any;
  /**
   * Used when the ColumnsMode is set to Entity. This is the BaseEntity object that represents the data in the JoinEntity that links the Row and Column entities together.
   */
  data?: BaseEntity | undefined;
  /**
   * Used when the ColumnsMode is set to Fields. This is an array of values from the JoinEntity that are displayed as columns in the grid.
   */
  value?: any
}
export class JoinGridRow {
  FirstColValue: any;
  JoinExists: boolean = false;
  RowForeignKeyValue: any;
  ColumnData: JoinGridCell[] = []
  GetColumnValue(colIndex: number): any {
    return this.ColumnData && this.ColumnData.length > colIndex ? this.ColumnData[colIndex].value : undefined
  }
  constructor (data: any) {
    this.FirstColValue = data.FirstColValue;
    this.JoinExists = data.JoinExists;
    this.RowForeignKeyValue = data.RowForeignKeyValue;
    this.ColumnData = data.ColumnData;
  }
}

@Component({
  standalone: false,
  selector: 'mj-join-grid',
  templateUrl: './join-grid.component.html',
  styleUrls: ['./join-grid.component.css']
})
export class JoinGridComponent implements AfterViewInit { 
  /**
   * Required: the name of the entity that will be used for displaying data for rows. This means that each row in the RowsEntity will be shown as a row in the grid
   * where the RowsEntityDisplayField will be used in the first column of the grid.
   */
  @Input() RowsEntityName!: string
  /**
   * Optional: if provided, this value will be shown in the top-left corner of the grid instead of the RowsEntityName
   */
  @Input() RowsEntityDisplayName?: string

  public get RowsEntityDisplayNameOrName(): string {
    return this.RowsEntityDisplayName ? this.RowsEntityDisplayName : this.RowsEntityName;
  }

  /**
   * Required: the field name in the RowsEntityName that will be shown in the first column in the grid
   */
  @Input() RowsEntityDisplayField!: string
  /**
   * Determines how the row data will be fetched. 
   * * When set to FullEntity, all rows in the specified RowEntityName will be used.
   * * When set to ViewName, the RowsEntityViewName will be used to fetch the rows from a defined User View
   * * When set to Array, the RowsEntityData array will be used to fetch the rows
   */
  @Input() RowsEntityDataSource: 'FullEntity' | 'ViewName' | 'Array' = 'FullEntity'

  /**
   * For RowsEntityDataSource = FullEntity or ViewName, this is the extra filter to apply to the rows entity when fetching data. This is optional.
   */
  @Input() RowsExtraFilter?: string

  /**
   * For RowsEntityDataSource = FullEntity or ViewName, this is the order by clause to apply to the rows entity when fetching data. This is optional.
   */
  @Input() RowsOrderBy?: string

  /**
   * Used when RowsEntityDataSource = ViewName, this will be the name of the User View for the specified RowsEntity to run to get data
   */
  @Input() RowsEntityViewName?: string

  /**
   * Required: provide an array of BaseEntity objects that will be used to display the rows in the grid.
   */
  @Input() RowsEntityArray?: BaseEntity[];

  /**
   * When set to Entity, the ColumnsEntity and related settings will be used to build the columns in the grid. When set to Fields, fields from the JoinEntity will be used to build the columns in the grid.
   */
  @Input() ColumnsMode: 'Entity' | 'Fields' = 'Entity'

  /**
   * Required when ColumnsMode is set to Entity: the name of the entity that will be used for displaying data for columns. This means that each row in the ColumnsEntity will be shown as a column in the grid
   */
  @Input() ColumnsEntityName!: string

  /**
   * Required when ColumnsMode is set to Entity: the field name in the ColumnsEntityName that will be shown as columns in the grid
   */
  @Input() ColumnsEntityDisplayField!: string

  /**
   * Determines how the column data will be fetched.
   * * When set to FullEntity, all columns in the specified ColumnsEntityName will be used.
   * * When set to ViewName, the ColumnsEntityViewName will be used to fetch the columns from a defined User View
   * * When set to Array, the ColumnsEntityArray array will be used to fetch the columns
   */
  @Input() ColumnsEntityDataSource: 'FullEntity' | 'ViewName' | 'Array' = 'FullEntity'

  /**
   * For ColumnsEntityDataSource = FullEntity or ViewName, this is the extra filter to apply to the columns entity when fetching data. This is optional.
   */
  @Input() ColumnsExtraFilter?: string

  /**
   * For ColumnsEntityDataSource = FullEntity or ViewName, this is the order by clause to apply to the columns entity when fetching data. This is optional.
   */
  @Input() ColumnsOrderBy?: string

  /**
   * Used when ColumnsEntityDataSource = ViewName, this will be the name of the User View for the specified ColumnsEntity to run to get data
   */
  @Input() ColumnsEntityViewName?: string

  /**
   * Required when ColumnsMode is set to Entity: provide an array of BaseEntity objects that will be used to display the columns in the grid.
   */ 
  @Input() ColumnsEntityArray?: BaseEntity[] 

  /**
   * The name of the entity that will be used for joining the RowsEntity and ColumnsEntity. Or, in the case of ColumnsMode = Fields, there is no true "joining" happening but we are joining the data from the RowsEntity and JoinEntity together.
   */
  @Input() JoinEntityName!: string

  /**
   * The name of the foreign key field in the JoinEntity that will be used to link to the Primary Key field in the RowsEntity
   */
  @Input() JoinEntityRowForeignKey!: string

  /**
   * The name of the foreign key field in the JoinEntity that will be used to link to the Primary Key field in the ColumnsEntity
   */
  @Input() JoinEntityColumnForeignKey!: string

  /**
   * The names of the columns from the JoinEntity to display as columns in the grid. This is only used when ColumnsMode is set to Fields.
   */
  @Input() JoinEntityDisplayColumns?: string[]

  /**
   * When specified, this filter is used to further constrain the data in the JoinEntity. This is optional but is generally
   * most useful when ColumnsMode is set to Fields and you want to filter the data in the JoinEntity based on some criteria.
   */
  @Input() JoinEntityExtraFilter?: string

  /**
   * ONLY USED WHEN ColumnsMode=Entity
   * When this property is set to JoinRecordExists the grid will operate as follows:
   *  * When a user checks the checkbox in the grid, a record will be created in the JoinEntity with the Row and Column foreign keys.
   *  * When a user unchecks the checkbox in the grid, the record in the JoinEntity will be deleted.
   * In comparison, when the CheckBoxValueMode is set to ColumnValue, the grid will operate as follows:
   *  * When a user checks the checkbox in the grid, a value in the JoinEntity will be set to true in the CheckBoxValueField field.
   *  * When a user unchecks the checkbox in the grid, the value in the JoinEntity will be set to false in the CheckBoxValueField field.
   */
  @Input() CheckBoxValueMode: 'RecordExists' | 'ColumnValue' = 'RecordExists'

  /**
   * Required when CheckBoxValueMode is set to ColumnValue: the name of the field in the JoinEntity that will be used to store the value of the checkbox.
   */
  @Input() CheckBoxValueField!: string

  /**
   * When the CheckBoxValueMode is set to RecordExists this means the grid will be adding and removing records from the JoinEntity. In some cases, entities require additional values
   * beyond the foreign keys that are automatically set, in those cases, use this property to provide additional default values for the new records that are created.
   */
  @Input() NewRecordDefaultValues?: { [key: string]: any }

  /**
   * When set to true, the Save button is shown
   */
  @Input() ShowSaveButton: boolean = true
  /**
   * When set to true, the Cancel button is shown
   */
  @Input() ShowCancelButton: boolean = true;

  /**
   * Change the value of this property to true or false when you want to enter or exit edit mode. Only use this when the grid
   * is embedded in another form and you are not showing the built-in save/cancel buttons
   */
  @Input() EditMode: 'None' | 'Save' | 'Queue' = 'None';

  constructor(private cdr: ChangeDetectorRef, private elementRef: ElementRef) { 

  }


  /*The below members are public because the Angular template needs access to them, but by naming convention we prefix with an _ so that it is clear they are not to be used outside of the component */
  public _GridData: JoinGridRow[] = [];
  public _IsLoading: boolean = false;

  /* protected internal members */
  protected _rowsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityData: BaseEntity[] | undefined = undefined;
  protected _rowsEntityData: BaseEntity[] | undefined = undefined;
  protected _joinEntityData: BaseEntity[] | undefined = undefined;

  /**
   * Saves all of the changes made in the grid. This includes adding new records, updating existing records, and deleting records.
   */
  public async Save(): Promise<boolean> {
    // for each pending delete, we need to delete the record
    // for each pending insert, we need to save the record
    // do it all in one transaction
    const md = new Metadata();
    const tg = await md.CreateTransactionGroup();

    if (this.ColumnsMode === 'Entity') {
      let validated = true;
      const valErrors: ValidationErrorInfo[][] = [];
      for (const obj of this._pendingDeletes) {
        obj.TransactionGroup = tg;
        await obj.Delete();
      }
      for (const obj of this._pendingInserts) {
        obj.TransactionGroup = tg;
        const valResult = obj.Validate()
        validated = validated && valResult.Success;
        valErrors.push(valResult.Errors);
        await obj.Save();
      }

      if (validated) {
        if (!await tg.Submit()) {
          alert ('Error saving changes');
          return false;
        }
        else {
          await this.Refresh(); // refresh afterwards
          return true;  
        }  
      }
      else {
        alert ('Error validating changes, details in console');
        console.log(valErrors);
        return false;
      }  
    }
    else {
      // in fields mode we use the _joinEntityData array to save the changes
      let validated = true;
      const valErrors: ValidationErrorInfo[][] = [];
      if (this._joinEntityData) {
        for (const obj of this._joinEntityData) {
          if (obj.Dirty) {
            obj.TransactionGroup = tg;
            const valResult = obj.Validate()
            validated = validated && valResult.Success;
            valErrors.push(valResult.Errors);
            await obj.Save();
          }
        }
      }

      if (validated) {
        if (!await tg.Submit()) {
          alert ('Error saving changes');
          return false;
        }
        else {
          await this.Refresh(); // refresh afterwards
          return true;  
        }  
      }
      else {
        alert ('Error validating changes, details in console');
        console.log(valErrors);
        return false;
      }
    }
  }

  /**
   * Cancels any changes and reverts to the prior state of the grid that reflects the last saved state.
   */
  public async CancelEdit() {
    // go through all of the pending deletes and remove them from the array
    // and go through all of the pending inserts and remove them from the array
    // before removing stuff from arrays we need to go back through all of hte grid cells and restore to original data
    this._GridData.forEach(row => {
      row.ColumnData.forEach(cell => {
        // for each cell, if we have a data object, look for a match in the pending inserts array, that means it is a NEW record
        if (cell.data) {
          const match = this._pendingInserts.find(obj => obj.Get(this.JoinEntityColumnForeignKey) === cell.ColumnForeignKeyValue && obj.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue);
          if (match) {
            // means that the current cell is a new record, so we need to remove it
            cell.data = undefined;
            this._pendingInserts.splice(this._pendingInserts.indexOf(match), 1);
          }
        }
        else {
          // we need to check if a match exists in the pending deletes array, if so, we need to restore the data
          const match = this._pendingDeletes.find(obj => obj.Get(this.JoinEntityColumnForeignKey) === cell.ColumnForeignKeyValue && obj.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue);
          if (match) {
            cell.data = match;
            this._pendingDeletes.splice(this._pendingDeletes.indexOf(match), 1);
          }
        }
      });
    })
  }

  public get NumDirtyRecords(): number {
    return this._pendingDeletes.length + this._pendingInserts.length;
  }

  public IsRecordReallyDirty(row: JoinGridRow): boolean {
    return false;
  }

  public IsCellReallyDirty(cell: JoinGridCell): boolean {
    if (cell.data) {
      // we have a record here, check if it is dirty or not as step 1
      if (cell.data.Dirty)
        return true;
    }
    else {
      // we need to see if we previoulsy HAD a data element in the cell but we removed it and it is located in the pendingDeletes array
      const record = this._pendingDeletes.find(obj => obj.Get(this.JoinEntityColumnForeignKey) === cell.ColumnForeignKeyValue && 
                                                      obj.Get(this.JoinEntityRowForeignKey) === cell.RowForeignKeyValue);
      if (record)
        return true; // found a pending delete, we're dirty
    }
    return false;
  }

  /**
   * This method is called automatically when the component is first loaded. Call the method anytime if you want to refresh the grid.
   */
  public async Refresh() {
    this._IsLoading = true;    // turn on the loading spinner
    this.cdr.detectChanges(); // let angular know we have changes

    this._pendingDeletes = [];
    this._pendingInserts = [];
    this._joinEntityData = undefined;

    // we are provided an array of Column and Row objects. We need to get the rows from the JoinEntity that link them up.
    const md = new Metadata();
    if (this.ColumnsMode === 'Entity') {
      this._columnsEntityInfo = md.EntityByName(this.ColumnsEntityName);
      if (!this._columnsEntityInfo)
        throw new Error('Invalid entity name provided for columns entity.');
    }
    this._rowsEntityInfo = md.EntityByName(this.RowsEntityName);
    if (!this._rowsEntityInfo) 
      throw new Error('Invalid entity name provided for rows entity.');

    await this.PopulateRowsAndColsData();

    const rowQuotes = this._rowsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
    let filter = `${this.JoinEntityRowForeignKey} IN (${this._rowsEntityData!.map(obj => `${rowQuotes}${obj.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name)}${rowQuotes}`).join(',')})` 
    if (this.ColumnsMode === 'Entity' && this._columnsEntityInfo) {
      const colQuotes = this._columnsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
      filter += ` AND ${this.JoinEntityColumnForeignKey} IN (${this._columnsEntityData!.map(obj => `${colQuotes}${obj.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name)}${colQuotes}`).join(',')})`;
    }
    if (this.JoinEntityExtraFilter) {
      filter = `(${filter}) AND (${this.JoinEntityExtraFilter})`;
    }
    const rv = new RunView();
    const result = await rv.RunView(
      { 
        EntityName: this.JoinEntityName, 
        ExtraFilter: filter,
        ResultType: 'entity_object'
      });
    if (result && result.Success) {
      // we have the data, now we need to build the grid
      this._joinEntityData = result.Results;
      this.PopulateGridData();
    }

    this._IsLoading = false; // turn off the loading spinner
    this.cdr.detectChanges(); // let Angular know we have changes
  }

  protected async PopulateRowsAndColsData() {
    const rv = new RunView();
    if (this.ColumnsMode==='Entity') {
      // only populate the columns if we are using the entity mode, otherwise the array from JoinGridDisplayColumns will be used
      if (this.ColumnsEntityDataSource === 'Array') {
        this._columnsEntityData = this.ColumnsEntityArray;
      }
      else {
        this._columnsEntityData = await this.RunColumnsOrRowsView(this.ColumnsEntityDataSource, this.ColumnsEntityName, this.ColumnsEntityViewName, this.ColumnsExtraFilter, this.ColumnsOrderBy);
      }  
    }
    if (this.RowsEntityDataSource === 'Array') {
      this._rowsEntityData = this.RowsEntityArray;
    }
    else {
      this._rowsEntityData = await this.RunColumnsOrRowsView(this.RowsEntityDataSource, this.RowsEntityName, this.RowsEntityViewName, this.RowsExtraFilter, this.RowsOrderBy);
    }
  }

  protected async RunColumnsOrRowsView(dataSource: 'FullEntity' | 'ViewName', entityName: string, viewName?: string, extraFilter?: string, orderBy?: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const params: RunViewParams = dataSource === 'FullEntity' ? { EntityName: entityName } : { ViewName: viewName };
    if (extraFilter)
      params.ExtraFilter = extraFilter;
    if (orderBy)  
      params.OrderBy = orderBy;

    params.ResultType = 'entity_object';
    const data = await rv.RunView(params);
    if (data && data.Success) {
      return data.Results; 
    }
    else {
      return [];
    }
  }

  protected async PopulateGridData() {
    // we have the data, now we need to build the grid
    // we need to build the grid data
    if (!this._joinEntityData)
      throw new Error('_joinEntityData must be populated before calling PopulateGridData()')

    const gridData: any[] = [];
    this._rowsEntityData!.forEach((row, rowIndex) => {
      let rowData: JoinGridRow = new JoinGridRow({
        FirstColValue: row.Get(this.RowsEntityDisplayField),
        JoinExists: false,
        RowForeignKeyValue: row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name),
        ColumnData: [] // start off with an empty array
      });

      // for the mode where we are using columns, do the following
      if (this.ColumnsMode === 'Entity') {
        for (let i = 0; i < this._columnsEntityData!.length; i++) {
          const column = this._columnsEntityData![i];
          const join = this._joinEntityData!.find(j => j.Get(this.JoinEntityRowForeignKey) === row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name) && 
                                                j.Get(this.JoinEntityColumnForeignKey) === column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name));
          rowData.JoinExists = true;
          rowData.ColumnData.push({
            index: i,
            ColumnForeignKeyValue: column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name),
            RowForeignKeyValue: rowData.RowForeignKeyValue,
            data: join          
          });
        }
      }
      else {
        if (!this.JoinEntityDisplayColumns)
          throw new Error('JoinEntityDisplayColumns is required when ColumnsMode is set to Fields');

        // we are display the values from the JoinEntity as columns from the JoinEntityDisplayColumns array
        this.JoinEntityDisplayColumns.forEach((col, i) => {
          const joinData = this._joinEntityData!.find(jed => jed.Get(this.JoinEntityRowForeignKey) === row.FirstPrimaryKey.Value)
          // joinData being undefined/null is a valid condition just means no join data for the row specified
          if (joinData) {
            rowData.JoinExists = true;
            rowData.ColumnData.push({
              index: i,
              RowForeignKeyValue: rowData.RowForeignKeyValue,
              value: joinData.Get(col)
            });
          }
        });
      }

      gridData.push(rowData);
    });
    this._GridData = gridData;
  }
 

  protected _pendingDeletes: BaseEntity[] = [];
  protected _pendingInserts: BaseEntity[] = [];
 

  public async _FlipRecord(event: MouseEvent, row: JoinGridRow, cell: JoinGridCell, stopPropagation: boolean = false) {
    if (stopPropagation)
        event.stopPropagation();

    if (!cell)
        throw new Error('cell is a required parameter');

    if (cell.data) {
        if (cell.data.IsSaved) {
          // If this is a record that is saved, put into an array of pending deletes
          this._pendingDeletes.push(cell.data!);
        }
        else {
          // we need to find the record in the pending inserts and remove it from that array
          const index = this._pendingInserts.indexOf(cell.data);
          if (index >= 0)
            this._pendingInserts.splice(index, 1);
        }


        // Now take data off the item
        cell.data = undefined;
    } else {
        // We need to add the record, first see if the record is in the _pendingDeletes array
        let record = this._pendingDeletes.find(obj => obj.Get(this.JoinEntityColumnForeignKey) === cell.ColumnForeignKeyValue && obj.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue);
        if (!record) {
            const md = new Metadata();
            record = await md.GetEntityObject(this.JoinEntityName);
            record.Set(this.JoinEntityRowForeignKey, row.RowForeignKeyValue);
            record.Set(this.JoinEntityColumnForeignKey, cell.ColumnForeignKeyValue);
            for (const key in this.NewRecordDefaultValues) {
              record.Set(key, this.NewRecordDefaultValues[key]);
            }
            this._pendingInserts.push(record);
        }
        cell.data = record;
    }

    this.cdr.detectChanges();
  }

  public _IsColumnChecked(cell: JoinGridCell): boolean {
    return cell?.data !== undefined;
  }

  public async UpdateCellValueDirect(row: JoinGridRow, colIndex: number, newValue: string) {
    // find the associated baseEntity object and update the value and then refresh the grid state from it
    if (this.ColumnsMode !== 'Fields')
      throw new Error("This method should only be called when ColumnsMode=Entity")

    // we are good now, so now proceed to find the related object that ties to the rowForeignKey in
    // the join entity data array
    const joinData = this._joinEntityData!.find(jed => jed.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue)
    if (!joinData)
      LogError('Could not find join data for rowForeignKey ' + row.RowForeignKeyValue)
    else {
      const colName = this.JoinEntityDisplayColumns![colIndex];
      joinData.Set(colName, newValue);
      // also update the row's column array
      row.ColumnData[colIndex].value = joinData.Get(colName);
    }
  }
  public async UpdateCellValue(row: JoinGridRow, colIndex: number, event: Event) {
    this.UpdateCellValueDirect(row, colIndex, (event.target as HTMLInputElement).value);
  }

  /**
   * Only used when ColumnsMode = Fields
   * @param row 
   */
  public async RemoveJoinEntityRecord(row: JoinGridRow) {
    // this method is called when the user wnats to remove a record that maps to the cell for the row specified and the colIndex
    // only used when Mode = Fields
    if (this.ColumnsMode !== 'Fields') 
      throw new Error('This method should only be called when ColumnsMode=Entity')      

    const joinData = this._joinEntityData!.find(jed => jed.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue)
    if (!joinData)
      LogError('Could not find join data for rowForeignKey ' + row.RowForeignKeyValue)
    else {
      this._pendingDeletes.push(joinData);
      this._joinEntityData?.splice(this._joinEntityData.indexOf(joinData), 1);
      this.PopulateGridData(); // refresh the grid's grid data array that is derived from all of the source data
    }  
  }

  /**
   * Only used when ColumnsMode = Fields
   */
  public async AddJoinEntityRecord(row: JoinGridRow) {
    // this method is called when the user wnats to create a new record that maps to the cell for the row specified and the colIndex
    // only used when Mode = Fields
    if (this.ColumnsMode !== 'Fields') 
      throw new Error('This method should only be called when ColumnsMode=Entity')      

    const md = new Metadata();
    // first check to see if this is in the _pendingDeletes array, if so, we need to remove it from there
    let newObj = this._pendingDeletes!.find(pd => pd.Get(this.JoinEntityRowForeignKey) === row.RowForeignKeyValue)
    if (newObj) {
      this._pendingDeletes.splice(this._pendingDeletes.indexOf(newObj), 1);
    }
    else {
      newObj = await md.GetEntityObject(this.JoinEntityName);  
      newObj.Set(this.JoinEntityRowForeignKey, row.RowForeignKeyValue);  
    }

    const keys = this.NewRecordDefaultValues ? Object.keys(this.NewRecordDefaultValues) : []
    for (const k of keys) {
      newObj.Set(k, this.NewRecordDefaultValues![k]);
    }

    this._joinEntityData?.push(newObj); // add to join data array
    if (this.EditMode === 'Save') {
      if (await newObj.Save()) {
        // all good
      }
      else {
        SharedService.Instance.CreateSimpleNotification('Error saving new ' + this.JoinEntityName + ' record','error', 2500)
      }
    }
    this.PopulateGridData(); // refresh the grid's grid data array that is derived from all of the source data
  }

  protected async EditingComplete() {
    // we've been told that editing is done. If we are in queue mode for editing, we do nothing because we've
    // already submitted our pending changes via events (below) but if we're in save mode we save stuff now
    if (this.EditMode === 'Save') {
      await this.Save();
    }
  }

  protected async RevertPendingChanges() {
    // this method means we should revert back to the last saved state
    // so just call Refresh
    await this.Refresh();
  }
  
  ngAfterViewInit(): void {
    this.Refresh();

    // setup event listener for MJGlobal because we might have a parent component that sends us messages
    MJGlobal.Instance.GetEventListener(false).subscribe((e: MJEvent) => {
      switch (e.event) {
        case MJEventType.ComponentEvent:
          const b = BaseFormComponentEventCodes; // having issues using the const vs the type if we refer to it below directly for comparison so assign the const to a local variable first
          if (e.eventCode === b.BASE_CODE) {
            // we have an event from a BaseFormComponent, now we need to determine if WE are a descendant of that component
            const event: BaseFormComponentEvent = e.args as BaseFormComponentEvent;
            if (SharedService.IsDescendant(event.elementRef, this.elementRef)) {
              // we are a descendant of the component that sent the event, so we need to handle it
              switch (event.subEventCode) {
                case b.EDITING_COMPLETE:
                  this.EditingComplete();
                  break;
                case b.REVERT_PENDING_CHANGES:
                  this.RevertPendingChanges();
                  break;
                case b.POPULATE_PENDING_RECORDS:
                  // provide all of our pending records back to the caller
                  this._joinEntityData?.forEach((r: BaseEntity) => {
                    // for anything that's changed, we need to add it to the pending records
                    const editingEvent: FormEditingCompleteEvent = event as FormEditingCompleteEvent;
                    if (r.Dirty) {
                      editingEvent.pendingChanges.push({entityObject: r, action: 'save'});
                    }
                  });

                  this._pendingDeletes.forEach((r: BaseEntity) => {
                    const editingEvent: FormEditingCompleteEvent = event as FormEditingCompleteEvent;
                    editingEvent.pendingChanges.push({entityObject: r, action: 'delete'});
                  });
                  break;
              }
            }
           }
          break;
      }
    });
  }

  /**
   * Returns the EntityFieldInfo that matches the specific column name within the JoinEntity
   * @param colName 
   */
  public GetJoinEntityField(colName: string): EntityFieldInfo {
    const md = new Metadata();
    const entity = md.EntityByName(this.JoinEntityName);
    if (!entity)
      throw new Error('Invalid entity name provided for JoinEntity');
    const field = entity.Fields.find(f => f.Name === colName);
    if (!field)
      throw new Error('Invalid field name provided for JoinEntity');
    return field;
  }
  
  public GetJoinEntityFieldValues(colName: string): string[] {
    return this.GetJoinEntityField(colName).EntityFieldValues.map(efv => efv.Value)
  }

  public get EntityFieldTSType() {
    return EntityFieldTSType;
  }
}
 