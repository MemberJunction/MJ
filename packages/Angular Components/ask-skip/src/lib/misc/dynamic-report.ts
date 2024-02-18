import { Component, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { SharedService, HtmlListType, EventCodes } from '@memberjunction/ng-shared';
import { DynamicGridComponent } from './dynamic-grid';
import { DynamicChartComponent } from './dynamic-chart';
import { Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { SelectEvent, TabStripComponent } from '@progress/kendo-angular-layout';


// This component is used for dynamically rendering report data, it is wrapped by app-single-report which gets
// info from the database. This can also be used directly to render a dynamic report that is NOT saved in the DB
// which is what Skip does in its conversational UI

@Component({
  selector: 'mj-dynamic-report',
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
<div> 
  <button kendoButton *ngIf="ShowCreateReportButton && !matchingReportID" (click)="doCreateReport()" class="create-report-button">Create Report</button>
  <div *ngIf="matchingReportID!==null" class="report-link" (click)="clickMatchingReport()">Report: {{matchingReportName}} (ID: {{matchingReportID}}) Created From This Message</div>
  <kendo-tabstrip [keepTabContent]="true" [animate]="false" class="report-tabstrip" (tabSelect)="onTabSelect($event)" #tabStrip>
      <kendo-tabstrip-tab *ngIf="IsChart" [selected]="isTabSelected(0)">
          <ng-template kendoTabTitle>
            <kendo-svgicon [icon]="sharedService.kendoSVGIcon('graph')"></kendo-svgicon>
            <span class="report-tab-title">Chart</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <mj-dynamic-chart mjFillContainer #theChart [SkipData]="SkipData">
              </mj-dynamic-chart>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab [closable]="false" [selected]="isTabSelected(1)">
          <ng-template kendoTabTitle>
            <kendo-svgicon  [icon]="sharedService.kendoSVGIcon('table')"></kendo-svgicon>
            <span class="report-tab-title">Table</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <mj-dynamic-grid mjFillContainer #theGrid [SkipData]="SkipData">
              </mj-dynamic-grid>
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
            <kendo-svgicon [icon]="sharedService.kendoSVGIcon('file')"></kendo-svgicon>
            <span class="report-tab-title">Explanation</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
            <label>Explanation:</label>
              <div mjFillContainer>{{SkipData?.userExplanation || 'No Explanation Provided'}}</div>
              <label>Technical Details:</label>
              <div mjFillContainer>{{SkipData?.techExplanation || 'No Technical Details Provided'}}</div>
          </ng-template>
      </kendo-tabstrip-tab>  
      <kendo-tabstrip-tab *ngIf="ShowDetailsTab" [selected]="isTabSelected(4)">
          <ng-template kendoTabTitle>
            <kendo-svgicon  [icon]="sharedService.kendoSVGIcon('pageProperties')" name="page-properties"></kendo-svgicon>
            <span class="report-tab-title">Details</span>
          </ng-template>
          <ng-template kendoTabContent class="report-tab-contents">
              <div><span><b>Script: </b></span><span><textarea [disabled]="true" mjFillContainer [fillHeight]="false">{{SkipData?.scriptText}}</textarea></span></div>
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

  private _skipData!: SkipAPIAnalysisCompleteResponse | undefined;
  @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined{ 
      return this._skipData;   
  }
  set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
      this._skipData = d;
      if (d && !this._loaded)
        this.ngAfterViewInit();
  }

  @ViewChild('theGrid', { static: false }) theGrid!: DynamicGridComponent;
  @ViewChild('theChart', { static: false }) theChart!: DynamicChartComponent;
  @ViewChild('tabStrip', { static: false }) tabStrip!: TabStripComponent;

  constructor (public sharedService: SharedService, private router: Router) {}

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
    return this.SkipData?.tableDataColumns || [];
  }

  public get IsChart(): boolean {
    if (!this.SkipData) return false;
    return this.SkipData.executionResults?.resultType?.trim().toLowerCase() === 'plot';
  }
  public get IsTable(): boolean {
    if (!this.SkipData) return false;
    return this.SkipData.executionResults?.resultType?.trim().toLowerCase() === 'table';
  }
  public get IsHTML(): boolean {
    if (!this.SkipData) return false;
    return this.SkipData.executionResults?.resultType?.trim().toLowerCase() === 'html';
  }

  public createAnalysisHtml(): string {
    const analysis = this.SkipData?.analysis;
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
        const report = await md.GetEntityObject<ReportEntity>('Reports');
        report.NewRecord();
        report.Name = this.SkipData.reportTitle ? this.SkipData.reportTitle : 'Untitled Report';
        report.Description = this.SkipData.userExplanation ? this.SkipData.userExplanation : '';
        report.ConversationID = this.ConversationID;
        report.ConversationDetailID = this.ConversationDetailID;
        //TO-DO FIX UP REPORT SCHEMA TO PROPERLY MAP TO SKIP DATA FORMAT AS IT IS NOW ----- report.ReportSQL = this.SkipData.SQLResults.sql;
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