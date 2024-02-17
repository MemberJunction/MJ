import { AfterViewInit, Component, Input } from '@angular/core';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DecimalPipe, DatePipe } from '@angular/common';
import { GridDataResult, PageChangeEvent } from '@progress/kendo-angular-grid';
import { LogStatus } from '@memberjunction/core';

@Component({
  selector: 'mj-dynamic-grid',
  template: `
    <kendo-grid [data]="gridView"
                [skip]="startingRow"
                [pageSize]="pageSize"
                scrollable="virtual"
                [rowHeight]="36"
                [reorderable]="true"
                [resizable]="true"
                (pageChange)="pageChange($event)"
                (cellClick)="cellClick($event)"
                [navigable]="true">
        <ng-container *ngFor="let col of columns">
            <kendo-grid-column 
                field="{{col.fieldName}}" 
                title="{{col.displayName}}"
                [headerStyle]="{ 'font-weight' : 'bold', 'background-color': '#cyan' }">
                <ng-template kendoGridCellTemplate let-dataItem>
                    {{ formatData(col.simpleDataType, dataItem[col.fieldName]) }}
                </ng-template>
            </kendo-grid-column>
        </ng-container>
    </kendo-grid>
  `,
  providers: [ DecimalPipe, DatePipe ]
})
export class DynamicGridComponent implements AfterViewInit {
  @Input() data: any[] = [];
  @Input() columns: SkipColumnInfo[] = [];
  @Input() public pageSize = 30;
  @Input() public startingRow = 0;

  private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
  @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
      return this._skipData ? this._skipData : undefined;
  }
  set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
      this._skipData = d;
      if (d) {
        this.data = d.executionResults?.tableData ? d.executionResults?.tableData : [];
        this.columns = d.tableDataColumns ? d.tableDataColumns : [];
        this.loadGridView();
      }
  }

  public gridView!: GridDataResult;

  constructor(private decimalPipe: DecimalPipe, private datePipe: DatePipe) { }

  formatData(dataType: string, data: any): any {
    switch (dataType) {
      case 'bigint':
      case 'smallint':
      case 'int':
      case 'tinyint':
        return data;  // No specific formatting for integer types
      case 'decimal':
      case 'numeric':
      case 'smallmoney':
      case 'money':
        return this.decimalPipe.transform(data, '1.2-2');  // Format as decimal with 2 digits after the decimal point
      case 'date':
      case 'datetime':
      case 'datetime2':
      case 'smalldatetime':
        return this.datePipe.transform(data, 'short');  // Format as short date
      // Add more cases as needed for other SQL Server datatypes
      default:
        return data;  // For data types not handled, return data as is
    }
  }

  ngAfterViewInit() {
    if (this.data) {
      this.loadGridView();
    }
  }

  public pageChange(event: PageChangeEvent): void {
    this.startingRow = event.skip;
    this.loadGridView();
  }

  private loadGridView(): void {
    this.gridView = {
      data: this.data.slice(this.startingRow, this.startingRow + this.pageSize),
      total: this.data.length,
    };
  }  

  cellClick(event: any): void {
    LogStatus(`Cell clicked in DynamicGrid`, undefined, event);
    LogStatus('Need to implement cellClick in DynamicGridComponent like DyanmicChartComponent to do drill down!')
  }
}