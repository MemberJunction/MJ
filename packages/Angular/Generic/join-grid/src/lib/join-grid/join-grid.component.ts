import { Component, OnInit, Input, EventEmitter, Output, AfterViewInit } from '@angular/core';

import { BaseEntity, EntityInfo, Metadata, RunView } from '@memberjunction/core';
import { Router } from '@angular/router';
 
 
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
   * Required: provide an array of BaseEntity objects that will be used to display the rows in the grid.
   */
  @Input() RowsEntityData?: BaseEntity[];

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
   * Required when ColumnsMode is set to Entity: provide an array of BaseEntity objects that will be used to display the columns in the grid.
   */ 
  @Input() ColumnsEntityData?: BaseEntity[] 

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
  @Input() CheckBoxValueMode: 'JoinRecordExists' | 'ColumnValue' = 'JoinRecordExists'

  /**
   * Required when CheckBoxValueMode is set to ColumnValue: the name of the field in the JoinEntity that will be used to store the value of the checkbox.
   */
  @Input() CheckBoxValueField!: string

  ngAfterViewInit(): void {
    // load up the grid
    this.Refresh();
  }


  /*The below members are public because the Angular template needs access to them, but by naming convention we prefix with an _ so that it is clear they are not to be used outside of the component */
  public _GridData: any[] = [];
  public _ShowLoader: boolean = false;

  /* protected internal members */
  protected _rowsEntityInfo: EntityInfo | null = null;
  protected _columnsEntityInfo: EntityInfo | null = null;

  /**
   * This method is called automatically when the component is first loaded. Call the method anytime if you want to refresh the grid.
   */
  public async Refresh() {
    // we are provided an array of Column and Row objects. We need to get the rows from the JoinEntity that link them up.
    const md = new Metadata();
    this._rowsEntityInfo = md.EntityByName(this.RowsEntityName);
    this._columnsEntityInfo = md.EntityByName(this.ColumnsEntityName);
    if (!this._rowsEntityInfo) 
      throw new Error('Invalid entity name provided for rows entity.');
    if (!this._columnsEntityInfo)
      throw new Error('Invalid entity name provided for columns entity.');

    const rv = new RunView();

    const rowQuotes = this._rowsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
    let filter = `${this.JoinEntityRowForeignKey} IN (${this.RowsEntityData!.map(obj => `${rowQuotes}${obj.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name)}${rowQuotes}`).join(',')})` 
    if (this.ColumnsMode === 'Entity') {
      const colQuotes = this._columnsEntityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : "";
      filter += ` AND ${this.JoinEntityColumnForeignKey} IN (${this.ColumnsEntityData!.map(obj => `${colQuotes}${obj.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name)}${colQuotes}`).join(',')})`;
    }
    const result = await rv.RunView(
      { 
        EntityName: this.JoinEntityName, 
        ExtraFilter: filter,
        ResultType: 'entity_object'
      });
    if (result && result.Success) {
      // we have the data, now we need to build the grid
      this.BuildGrid(result.Results);
    }
  }

  protected async BuildGrid(data: BaseEntity[]) {
    // we have the data, now we need to build the grid
    // we need to build the grid data
    const gridData: any[] = [];
    this.RowsEntityData!.forEach(row => {
      let rowData: any = {
        first: row.Get(this.RowsEntityDisplayField)
      };

      // for the mode where we are using columns, do the following
      if (this.ColumnsMode === 'Entity') {
        this.ColumnsEntityData!.forEach(column => {
          const join = data.find(j => j.Get(this.JoinEntityRowForeignKey) === row.Get(this._rowsEntityInfo!.FirstPrimaryKey.Name) && j.Get(this.JoinEntityColumnForeignKey) === column.Get(this._columnsEntityInfo!.FirstPrimaryKey.Name));
          if (join) {
            rowData = { 
              ...rowData, 
              [column.Get(this.ColumnsEntityDisplayField)]: true,
              [this.JoinEntityColumnForeignKey]: join.Get(this.JoinEntityColumnForeignKey), 
              [this.JoinEntityRowForeignKey]: join.Get(this.JoinEntityRowForeignKey),
              [this.JoinEntityName]: join.Get(this.JoinEntityName)
             };
          } else {
            rowData[column.Get(this.ColumnsEntityDisplayField)] = false;
          }
        });  
      }
      else {
        // we are display the values from the JoinEntity as columns from the JoinEntityDisplayColumns array
      }
      gridData.push(rowData);
    });
    this._GridData = gridData;
  }
}

/* 
import { AfterViewInit, Component, Input, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { Subscription, debounceTime, fromEvent } from 'rxjs';

@Component({
  selector: 'app-join-grid',
  templateUrl: './join-grid.component.html',
  styleUrls: ['./join-grid.component.css']
})
export class JoinGridComponent implements OnInit, AfterViewInit {
  @Input() RowsEntity: string = '';
  @Input() ColumnsEntity: string = '';
  @Input() JoinEntity: string = '';
  @Input() JoinRowForeignKey: string = '';
  @Input() JoinColumunForeignKey: string = '';
  @Input() RowsFilter: string = '';
  @Input() ColumnsFilter: string = '';
  @Input() EditMode: boolean = false;
  public showloader: boolean = false;
  public viewData: any[] = [];
  public visibleColumns: any[] = [];
  public ShowError: boolean = false;
  public ErrorMessage: string = '';
  public gridHeight: number = 750;
  private resizeSub: Subscription | null = null;

  constructor() { }

  ngOnInit(): void {
    if (!this.RowsEntity || !this.ColumnsEntity || !this.JoinEntity || !this.JoinRowForeignKey || !this.JoinColumunForeignKey) {
      this.ShowError = true;
      this.ErrorMessage = 'Missing required parameters';
    } else {
      this.LoadData();
    }
  }

  ngAfterViewInit(): void {
    this.setGridHeight();
  }

  async LoadData() {
    const rv = new RunView();
    this.showloader = true;
    const promises = [];
    promises.push(rv.RunView({ EntityName: this.RowsEntity, ExtraFilter: this.RowsFilter }));
    promises.push(rv.RunView({ EntityName: this.ColumnsEntity, ExtraFilter: this.ColumnsFilter }));
    const responses = await Promise.all(promises);
    if (responses[0].Success && responses[1].Success) {
      this.getJoinData(responses[0].Results, responses[1].Results);
    } else {
      this.ShowError = true;
      this.ErrorMessage = responses[0].ErrorMessage || responses[1].ErrorMessage;
    }
  }

  async getJoinData(rows: any[], columns: any[]) {
    const rv = new RunView();
    // getting the relations between rows and columns
    const res = await rv.RunView({ EntityName: this.JoinEntity, ExtraFilter: `${this.JoinRowForeignKey} IN (${rows.map(obj => obj.ID).join(',')}) AND ${this.JoinColumunForeignKey} IN (${columns.map(obj => obj.ID).join(',')})` });
    if (res.Success) {
      this.prepareGridData(rows, columns, res.Results);
    } else {
      this.showloader = false;
      this.ShowError = true;
      this.ErrorMessage = res.ErrorMessage;
    }
  }

  prepareGridData(rows: any[], columns: any[], joinEntities: any[]) {
    const gridData: any[] = [];
    this.visibleColumns = [{ field: 'first', title: '', width: 80 }];
    columns.forEach(column => {
      this.visibleColumns.push({ field: column.Name, title: column.Name, width: 80  });
    });
    rows.forEach(row => {
      let rowData: any = {
        first: row.Name
      };
      columns.forEach(column => {
        const join = joinEntities.find(j => j[this.JoinColumunForeignKey] === column.ID && j[this.JoinRowForeignKey] === row.ID);
        if (join) {
          rowData = { 
            ...rowData, 
            [column.Name]: true,
            [this.JoinColumunForeignKey]: join[this.JoinColumunForeignKey], 
            [this.JoinRowForeignKey]: join[this.JoinRowForeignKey],
            [this.JoinEntity]: join[this.JoinEntity]
           };
        } else {
          rowData[column.Name] = false;
        }
      });
      gridData.push(rowData);
    });
    this.showloader = false;
    this.viewData = gridData;
  }

  private _gridMargin = 150;
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
    // this._gridMargin = this.getGridTopPosition();
    this.gridHeight = window.innerHeight - this._gridMargin;  
  }
}


*/