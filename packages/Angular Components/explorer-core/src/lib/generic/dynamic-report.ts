import { Component, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipData } from '../ask-skip/ask-skip.component';
import { SharedService, HtmlListType, EventCodes } from '../shared/shared.service';
import { DynamicGridComponent } from './dynamic-grid';
import { DynamicChartComponent } from './dynamic-chart';
import { Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { SelectEvent, TabStripComponent } from '@progress/kendo-angular-layout';


// This component is used for dynamically rendering report data, it is wrapped by app-single-report which gets
// info from the database. This can also be used directly to render a dynamic report that is NOT saved in the DB
// which is what Skip does in its conversational UI

@Component({
  selector: 'app-dynamic-report',
  styles: [
    `.report-tab-title { margin-left: 10px;}`,
    `.create-report-button { 
        margin-bottom: 10px;
        margin-top: 10px;
      }`,
      `.report-link {
        margin-top: 10px;
        margin-bottom: 10px;
        cursor: pointer;
        color: blue;
        font-weight: bold;
      }`,
    ],
  template: `
<div mjFillContainer> 
  <button kendoButton *ngIf="ShowCreateReportButton && !matchingReportID" (click)="doCreateReport()" class="create-report-button">Create Report</button>
  <div *ngIf="matchingReportID!==null" class="report-link" (click)="clickMatchingReport()">Report: {{matchingReportName}} (ID: {{matchingReportID}}) Created From This Message</div>
  <kendo-tabstrip mjFillContainer [keepTabContent]="true" [animate]="false" class="report-tabstrip" (tabSelect)="onTabSelect($event)" #tabStrip>
      <kendo-tabstrip-tab *ngIf="IsChart" [selected]="isTabSelected(0)">
          <ng-template kendoTabTitle>
            <kendo-icon name="graph" ></kendo-icon>
            <span class="report-tab-title">Chart</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <app-dynamic-chart mjFillContainer #theChart [SkipData]="SkipData">
              </app-dynamic-chart>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab [closable]="false" [selected]="isTabSelected(1)">
          <ng-template kendoTabTitle>
            <kendo-icon name="table"></kendo-icon>
            <span class="report-tab-title">Table</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <app-dynamic-grid mjFillContainer #theGrid [SkipData]="SkipData">
              </app-dynamic-grid>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab [closable]="false" [selected]="isTabSelected(2)">
          <ng-template kendoTabTitle>
              <img src="assets/Skip - Mark Only - Small.png" class="avatar" style="height:16px;width:16px;" />
              <span class="report-tab-title">Analysis</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <div mjFillContainer [innerHTML]="createAnalysisHtml()"></div>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab [closable]="false" [selected]="isTabSelected(3)">
          <ng-template kendoTabTitle>
            <kendo-icon name="file"></kendo-icon>
            <span class="report-tab-title">Explanation</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <div mjFillContainer>{{SkipData?.ReportExplanation || 'No Explanation Provided'}}</div>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab *ngIf="ShowDetailsTab" [selected]="isTabSelected(4)">
          <ng-template kendoTabTitle>
            <kendo-icon name="page-properties"></kendo-icon>
            <span class="report-tab-title">Details</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <div><span><b>SQL:</b></span><span><textarea [disabled]="true" mjFillContainer [fillHeight]="false">{{SkipData?.SQLResults?.sql}}</textarea></span></div>
              <div *ngIf="ConversationID!==null"><span>Skip Conversation ID:</span><span>{{ConversationID}}</span></div>
              <div *ngIf="ConversationDetailID!==null"><span>Skip Conversation Detail ID:</span><span>{{ConversationDetailID}}</span></div>
          </ng-template>
      </kendo-tabstrip-tab>  
  </kendo-tabstrip>
</div>
` 
})
export class DynamicReportComponent {
  @Input() ShowDetailsTab: boolean = false;
  @Input() ShowCreateReportButton: boolean = false;
  @Input() ConversationID: number | null = null; 
  @Input() ConversationName: string | null = null;
  @Input() ConversationDetailID: number | null = null;

  private _skipData!: SkipData | undefined;
  @Input() get SkipData(): SkipData | undefined{ 
      return this._skipData;   
  }
  set SkipData(d: SkipData | undefined){
      this._skipData = d;
      if (d && !this._loaded)
        this.ngAfterViewInit();
  }

  @ViewChild('theGrid', { static: false }) theGrid!: DynamicGridComponent;
  @ViewChild('theChart', { static: false }) theChart!: DynamicChartComponent;
  @ViewChild('tabStrip', { static: false }) tabStrip!: TabStripComponent;

  constructor (private sharedService: SharedService, private router: Router) {}

  public matchingReportID: number | null = null;
  public matchingReportName: string | null = null;

  private _loaded: boolean = false;
  async ngAfterViewInit() {
    if (this.SkipData) {
        this._loaded = true;
        if (this.ShowCreateReportButton) {
          // check to see if a report has been created that is linked to this ConvoID/ConvoDetailID
          // if so don't allow the user to create another report, show a link to the existing one 
          const rv = new RunView();
          const matchingReports = await rv.RunView({
            EntityName: 'Reports',
            ExtraFilter: 'ConversationID = ' + this.ConversationID + ' AND ConversationDetailID = ' + this.ConversationDetailID
          })
          if (matchingReports && matchingReports.Success && matchingReports.RowCount > 0) {
            const item = <any>matchingReports.Results.at(0);
            this.matchingReportID = item?.ID;
            this.matchingReportName = item?.Name;
          }
        }
    }
  }

  public clickMatchingReport() {
    if (this.matchingReportID !== null && this.matchingReportID > 0) {
      // navigate to the report
      this.router.navigate(['resource', 'report', this.matchingReportID])
    }
  }

  public activeTabIndex: number = 0;
  public onTabSelect(e: SelectEvent): void {
    e.preventDefault();
    
    this.activeTabIndex = e.index
    this.sharedService.InvokeManualResize(100)
  }
  
  public isTabSelected(index: number) {
    const offset = !this.IsChart ? 1 : 0;
    return this.activeTabIndex === (index - offset);
  }

  public get Columns(): SkipColumnInfo[] {
    return this.SkipData?.SQLResults.columns || [];
  }

  public get IsChart(): boolean {
    if (!this.SkipData) return false;
    return this.SkipData.DisplayType.trim().toLowerCase() !== 'table';
  }
  public get IsTable(): boolean {
    if (!this.SkipData) return false;
    return this.SkipData.DisplayType.trim().toLowerCase() === 'table';
  }

  public createAnalysisHtml(): string {
    const analysis = this.SkipData?.Analysis;
    if (analysis && analysis.length > 0) {
      return this.sharedService.ConvertMarkdownStringToHtmlList(HtmlListType.Unordered, analysis);
    }
    else
      return '<h2>No Analysis Provided</h2>'
  }

  public async doCreateReport() {
    if (!this.SkipData || !this.ConversationID || !this.ConversationName || !this.ConversationDetailID) {
        throw new Error('Must set SkipData, ConversationID, ConversationName, and ConversationDetailID to enable saving report')
    }
    else {
      if (confirm('Do you want to save this report?')) {
        const md = new Metadata();
        const report = <ReportEntity>await md.GetEntityObject('Reports');
        report.NewRecord();
        report.Name = this.SkipData.ReportTitle;
        report.Description = this.SkipData.ReportExplanation ? this.SkipData.ReportExplanation : '';
        report.ConversationID = this.ConversationID;
        report.ConversationDetailID = this.ConversationDetailID;
        report.ReportSQL = this.SkipData.SQLResults.sql;
        report.ReportConfiguration = JSON.stringify(this.SkipData) 
        report.SharingScope = 'None'
        report.UserID = md.CurrentUser.ID

        if (await report.Save())  {
          this.matchingReportID = report.ID;
          this.matchingReportName = report.Name;
          this.sharedService.CreateSimpleNotification(`Report "${report.Name}"Saved`, 'success', 2500)
        }
        else 
          this.sharedService.CreateSimpleNotification('Error saving report', 'error', 2500)
      }  
    } 
  }


}