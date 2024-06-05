import { Component, Input, AfterViewInit, ChangeDetectorRef } from '@angular/core';

import { BaseEntity, EntityInfo, Metadata, RunView, RunViewParams, ValidationErrorInfo } from '@memberjunction/core';
 

export class JoinGridCell {
  index!: number;
  RowForeignKeyValue: any;
  ColumnForeignKeyValue: any;
  data: BaseEntity | undefined;
}
export class JoinGridRow {
  FirstColValue: any;
  JoinExists: boolean = false;
  RowForeignKeyValue: any;
  ColumnData: JoinGridCell[] = []
}

@Component({
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

  ngAfterViewInit(): void {
    // load up the grid
    this.Refresh();
  }

  constructor(private cdr: ChangeDetectorRef) { }


  /*The below members are public because the Angular template needs access to them, but by naming convention we prefix with an _ so that it is clear they are not to be used outside of the component */
  public _GridData: JoinGridRow[] = [];
  public _IsLoading: boolean = false;

  /* protected internal members */
  protected _rowsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityData: BaseEntity[] | undefined = undefined;
  protected _rowsEntityData: BaseEntity[] | undefined = undefined;

  /**
   * Saves all of the changes made in the grid. This includes adding new records, updating existing records, and deleting records.
   */
  public async Save(): Promise<boolean> {
    // for each pending delete, we need to delete the record
    // for each pending insert, we need to save the record
    // do it all in one transaction
    const md = new Metadata();
    const tg = await md.CreateTransactionGroup();
    let validated = true;
    const valErrors: ValidationErrorInfo[][] = [];
    this._pendingDeletes.forEach(obj => {
      obj.TransactionGroup = tg;
      obj.Delete();
    });
    this._pendingInserts.forEach(obj => {
      obj.TransactionGroup = tg;
      const valResult = obj.Validate()
      validated = validated && valResult.Success;
      valErrors.push(valResult.Errors);
      obj.Save();
    });
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

    // we are provided an array of Column and Row objects. We need to get the rows from the JoinEntity that link them up.
    const md = new Metadata();
    this._rowsEntityInfo = md.EntityByName(this.RowsEntityName);
    this._columnsEntityInfo = md.EntityByName(this.ColumnsEntityName);
    if (!this._rowsEntityInfo) 
      throw new Error('Invalid entity name provided for rows entity.');
    if (!this._columnsEntityInfo)
      throw new Error('Invalid entity name provided for columns entity.');

    await this.PopulateRowsAndColsData();

    const rowQuotes = this._rowsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
    let filter = `${this.JoinEntityRowForeignKey} IN (${this._rowsEntityData!.map(obj => `${rowQuotes}${obj.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name)}${rowQuotes}`).join(',')})` 
    if (this.ColumnsMode === 'Entity') {
      const colQuotes = this._columnsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
      filter += ` AND ${this.JoinEntityColumnForeignKey} IN (${this._columnsEntityData!.map(obj => `${colQuotes}${obj.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name)}${colQuotes}`).join(',')})`;
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
      this.PopulateGridData(result.Results);
    }

    this._IsLoading = false; // turn off the loading spinner
    this.cdr.detectChanges(); // let Angular know we have changes
  }

  protected async PopulateRowsAndColsData() {
    const rv = new RunView();
    if (this.ColumnsEntityDataSource === 'Array') {
      this._columnsEntityData = this.ColumnsEntityArray;
    }
    else {
      this._columnsEntityData = await this.RunColumnsOrRowsView(this.ColumnsEntityDataSource, this.ColumnsEntityName, this.ColumnsEntityViewName, this.ColumnsExtraFilter, this.ColumnsOrderBy);
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

  protected async PopulateGridData(joinEntityData: BaseEntity[]) {
    // we have the data, now we need to build the grid
    // we need to build the grid data
    const gridData: any[] = [];
    this._rowsEntityData!.forEach(row => {
      let rowData: JoinGridRow = {
        FirstColValue: row.Get(this.RowsEntityDisplayField),
        JoinExists: false,
        RowForeignKeyValue: row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name),
        ColumnData: [] // start off with an empty array
      };

      // for the mode where we are using columns, do the following
      if (this.ColumnsMode === 'Entity') {
        for (let i = 0; i < this._columnsEntityData!.length; i++) {
          const column = this._columnsEntityData![i];
          const join = joinEntityData.find(j => j.Get(this.JoinEntityRowForeignKey) === row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name) && 
                                                j.Get(this.JoinEntityColumnForeignKey) === column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name));
          rowData.ColumnData.push({
            index: i,
            ColumnForeignKeyValue: column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name),
            RowForeignKeyValue: rowData.RowForeignKeyValue,
            data: join          
          });
        }
      }
      else {
        // we are display the values from the JoinEntity as columns from the JoinEntityDisplayColumns array
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
}
 