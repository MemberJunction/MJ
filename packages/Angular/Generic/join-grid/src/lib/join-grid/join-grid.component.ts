import { Component, Input, AfterViewInit } from '@angular/core';

import { BaseEntity, EntityInfo, Metadata, RunView, RunViewParams } from '@memberjunction/core';
 
 
export class JoinGridRow {
  FirstColValue: any;
  JoinExists: boolean = false;
  JoinEntityRowForeignKey: any;
  JoinEntityColumnForeignKey: any;
  ColumnData: {index: number, ColumnForeignKey: any, data: BaseEntity | undefined}[] = []
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

  ngAfterViewInit(): void {
    // load up the grid
    this.Refresh();
  }


  /*The below members are public because the Angular template needs access to them, but by naming convention we prefix with an _ so that it is clear they are not to be used outside of the component */
  public _GridData: JoinGridRow[] = [];
  public _IsLoading: boolean = false;
  public _NumDirtyRecords: number = 0;

  /* protected internal members */
  protected _rowsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityData: BaseEntity[] | undefined = undefined;
  protected _rowsEntityData: BaseEntity[] | undefined = undefined;

  /**
   * Saves all of the changes made in the grid. This includes adding new records, updating existing records, and deleting records.
   */
  public async Save(): Promise<boolean> {
    return true;
  }

  /**
   * Cancels any changes and reverts to the prior state of the grid that reflects the last saved state.
   */
  public async CancelEdit() {
  }

  public IsRecordReallyDirty(row: JoinGridRow): boolean {
    return false;
  }

  /**
   * This method is called automatically when the component is first loaded. Call the method anytime if you want to refresh the grid.
   */
  public async Refresh() {
    this._IsLoading = true;
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
    this._IsLoading = false;
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
        JoinEntityRowForeignKey: row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name),
        JoinEntityColumnForeignKey: null,
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
            ColumnForeignKey: column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name),
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

  public _IsColumnChecked(row: JoinGridRow, colRecord: BaseEntity): boolean {
    // check to see if there is a matching object in the row's data array that links to the colRecord's primary key value
    const pkey = colRecord.FirstPrimaryKey.Value;
    const item = row.ColumnData.find(item => item.ColumnForeignKey === pkey)
    if (item?.data)
      return true;
    else
      return false;
  }

  protected _pendingDeletes: BaseEntity[] = [];
  protected _pendingInserts: BaseEntity[] = [];

  public async _FlipRecord(row: JoinGridRow, colRecord: BaseEntity, stopPropagation: boolean = false) {
    const pkey = colRecord.FirstPrimaryKey.Value;
    const item = row.ColumnData.find(item => item.ColumnForeignKey === pkey)
    if (item && item.data) {
      // if this is a record that is saved, put into an array of pending deletes
      // now add the item to the array of stuff to delete, we can remove it from the array if the user unchecks the box
      if (item.data.IsSaved)
        this._pendingDeletes.push(item.data!);

      // now take data off the item
      item.data = undefined;
    } 
    else {
      // we need to add the record, first see if the record is in the _pendingDeletes array
      let record = this._pendingDeletes.find(obj => obj.Get(this.JoinEntityColumnForeignKey) === pkey && obj.Get(this.JoinEntityRowForeignKey) === row.JoinEntityRowForeignKey);
      if (!record) {
        const md = new Metadata();
        record = await md.GetEntityObject(this.JoinEntityName);
        record.Set(this.JoinEntityRowForeignKey, row.JoinEntityRowForeignKey);
        record.Set(this.JoinEntityColumnForeignKey, pkey);
      }
      if (item)
        item.data = record;
      else
        row.ColumnData.push({
          index: this._columnsEntityData!.findIndex(obj => obj.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name) === pkey),
          ColumnForeignKey: pkey,
          data: record
        });

      // if a new record, put into pending so that we can easily remove it if the user unchecks the box
      if (!record.IsSaved)
        this._pendingInserts.push(record);
    }
  }
}
 