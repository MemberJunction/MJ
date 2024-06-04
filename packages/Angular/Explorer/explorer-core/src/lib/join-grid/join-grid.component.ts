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
