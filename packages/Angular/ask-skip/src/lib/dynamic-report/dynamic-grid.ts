import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DecimalPipe, DatePipe } from '@angular/common';
import { GridDataResult, PageChangeEvent } from '@progress/kendo-angular-grid';
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared'
import { ExcelExportComponent } from '@progress/kendo-angular-excel-export';
import { DrillDownInfo } from './dynamic-drill-down';
import { DynamicReportComponent } from './dynamic-report';

@Component({
  selector: 'mj-dynamic-grid',
  template: `
    <kendo-grid *ngIf="GridHeight !== null" 
                [height]="GridHeight"
                [data]="gridView"
                [skip]="startingRow"
                [pageSize]="pageSize"
                scrollable="virtual"
                [rowHeight]="36"
                [reorderable]="true"
                [resizable]="true"
                (pageChange)="pageChange($event)"
                (cellClick)="cellClick($event)"
                [navigable]="true"
                >
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
        <ng-template kendoGridToolbarTemplate>
            <button kendoButton (click)="doExcelExport()" ><kendo-svgicon [icon]="kendoSVGIcon('fileExcel')" ></kendo-svgicon>Export to Excel</button>
        </ng-template>

        <kendo-excelexport #excelExport [data]="exportData" [fileName]="'Report_Grid_Export.xlsx'">
          <kendo-excelexport-column *ngFor="let exportCol of columns" [field]="exportCol.fieldName" [title]="exportCol.displayName">
          </kendo-excelexport-column>
        </kendo-excelexport>
    </kendo-grid>

    <!-- Now do the grid that does NOT have a height, wish kendo allowed you to do it another way! -->
    <kendo-grid *ngIf="GridHeight === null"
                [data]="gridView"
                [skip]="startingRow"
                [pageSize]="pageSize"
                scrollable="virtual"
                [rowHeight]="36"
                [reorderable]="true"
                [resizable]="true"
                (pageChange)="pageChange($event)"
                (cellClick)="cellClick($event)"
                [navigable]="true"
                >
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
        <ng-template kendoGridToolbarTemplate>
            <button kendoButton (click)="doExcelExport()" ><kendo-svgicon [icon]="kendoSVGIcon('fileExcel')" ></kendo-svgicon>Export to Excel</button>
        </ng-template>

        <kendo-excelexport #excelExport [data]="exportData" [fileName]="'Report_Grid_Export.xlsx'">
            <kendo-excelexport-column *ngFor="let exportCol of columns" [field]="exportCol.fieldName" [title]="exportCol.displayName">
            </kendo-excelexport-column>
        </kendo-excelexport>
    </kendo-grid>
  `,
  providers: [ DecimalPipe, DatePipe ]
})
export class DynamicGridComponent implements AfterViewInit {
  @Input() data: any[] = [];
  @Input() columns: SkipColumnInfo[] = [];
  @Input() public pageSize = 30;
  @Input() public startingRow = 0;
  @Input() public GridHeight: number | null = null;
  @Input() public ShowRefreshButton: boolean = false;
  @Input() AllowDrillDown: boolean = true
  @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();

  private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
  @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
      return this._skipData ? this._skipData : undefined;
  }

  set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
      this._skipData = d;
      if (d) {
        // check to see if the tableDataColumns is NOT provided, in that case we need to check to see if we 
        // have column names that are valid in our table data. If we don't we need to prepend whatever was provided with a "_" prefix so that 
        // we don't have things like 2022 as a column name which is not valid in JavaScript
        if (!d.tableDataColumns || d.tableDataColumns.length === 0) {
          // no columns provided, so we check here to make sure the column names are valid
          this.data = d.executionResults?.tableData ? d.executionResults?.tableData : [];
          // now loop through the data and fix up the column names if needed
          for (let i = 0; i < this.data.length; i++) {
            const row = this.data[i];
            for (let key in row) {
              if (key.match(/^\d/)) {
                const newKey = '_' + key;
                row[newKey] = row[key];
                delete row[key];
              }
            }
          }

          // now, populate the columns array with the column names
          this.columns = [];
          const row = this.data[0];
          for (let key in row) {
            const col = new SkipColumnInfo();
            col.fieldName = key;
            col.displayName = key;
            col.simpleDataType = 'string'; // don't know the type, so default to string
            this.columns.push(col);
          }
        }
        else {
          // we have table data columns provided, so use that info!
          this.columns = d.tableDataColumns 
          this.data = d.executionResults?.tableData ? d.executionResults?.tableData : [];
        }
        this.loadGridView();
      }
  }

  public gridView!: GridDataResult;

  constructor(private decimalPipe: DecimalPipe, private datePipe: DatePipe) { }

  @ViewChild('excelExport', { read: ExcelExportComponent }) kendoExcelExport: ExcelExportComponent | null = null;


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
    Promise.resolve().then(() => {
      this.gridView = {
        data: this.data.slice(this.startingRow, this.startingRow + this.pageSize),
        total: this.data.length,
      };  
    });
  }  

  public async cellClick(event: any) {
    try {
      if (!this.AllowDrillDown) 
        return;

      const rowSelected = event.dataItem;
      const drillDown = this.SkipData?.drillDown;
      if (drillDown && rowSelected ) {
        // we have a valid situation to drill down where we have the configuration and we have a drill down value. 
        // we can navigate to the drill down view
        const entityName = DynamicReportComponent.GetEntityNameFromSchemaAndViewString(drillDown.viewName);

        if (entityName) {
          const filterSQL = drillDown.filters.map(f => {
            const val = rowSelected[f.reportFieldName];
            const isDateValue = val instanceof Date;
            const isNumberValue = !isNaN(parseFloat(val));
            const needsQuotes = isDateValue ? true : (isNumberValue ? false : true);
            const quotes = needsQuotes ? "'" : '';
            return `${f.viewFieldName} = ${quotes}${val}${quotes}`
          }).join(' AND ');
          this.DrillDownEvent.emit(new DrillDownInfo(entityName, filterSQL));
        }
      }
    }
    catch (e) {
      console.warn('Error handling grid row click', e)
    }
  }

  // convenience for the HTML template
  public kendoSVGIcon = kendoSVGIcon;


  // Export Functionality
  public exportData: any[] = [];
  public async doExcelExport() {
    if (this.kendoExcelExport === null) 
      throw new Error("kendoExcelExport is null, cannot export data");

    try {
      this.exportData = await this.getExportData();

      // next show an initial notification, but only if a lot of data
      if (this.exportData.length > 5000)
        SharedService.Instance.CreateSimpleNotification("Working on the export, will notify you when it is complete...", 'info', 2000)

      // before we call the save, we need to let Angular do its thing that will result in the kendoExcelExport component binding properly to
      // the exportColumns and exportData arrays. So we wait for the next tick before we call save()
      setTimeout(() => {
        this.kendoExcelExport!.fileName = (this.SkipData?.reportTitle || 'Report_Grid_Export') + '.xlsx';
        this.kendoExcelExport!.save();
        SharedService.Instance.CreateSimpleNotification("Excel Export Complete", 'success', 2000)
      }, 100);
    }
    catch (e) {
      SharedService.Instance.CreateSimpleNotification("Error exporting data", 'error', 5000)
      LogError(e)
    }
  } 

  protected async getExportData(): Promise<any[]> {
    return this.data;
  }

}