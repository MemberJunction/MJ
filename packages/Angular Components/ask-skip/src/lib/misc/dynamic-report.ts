import { AfterViewInit, ChangeDetectorRef, Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse, MJAPISkipResult } from '@memberjunction/skip-types';
import { SharedService, HtmlListType } from '@memberjunction/ng-shared';
import { Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { SelectEvent } from '@progress/kendo-angular-layout';
import { DataContext } from '@memberjunction/data-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';


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
    templateUrl: './dynamic-report.html',
  })
export class DynamicReportComponent implements AfterViewInit {
  @Input() ShowDetailsTab: boolean = false;
  @Input() ShowCreateReportButton: boolean = false;
  @Input() ConversationID: number | null = null; 
  @Input() ConversationName: string | null = null;
  @Input() ConversationDetailID: number | null = null;
  @Input() DataContext!: DataContext;
  @Input() ReportEntity?: ReportEntity;
  @Input() LayoutMode: 'linear' | 'tabs' = 'tabs';
  @Input() LinearExpandAll: boolean = true;
  @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;


  constructor (public sharedService: SharedService, private router: Router, private cdRef: ChangeDetectorRef) {}

  public matchingReportID: number | null = null;
  public matchingReportName: string | null = null;
  private static _reportCache: {reportId: number, conversationId: number, reportName: string, conversationDetailId: number}[] = [];
  private _loaded: boolean = false;
  async RefreshMatchingReport() {
    if (this.SkipData && !this._loaded && this.ConversationDetailID && this.ConversationID) {
        this._loaded = true;
        if (this.ShowCreateReportButton) {
          // check to see if a report has been created that is linked to this ConvoID/ConvoDetailID
          // if so don't allow the user to create another report, show a link to the existing one 
          const cachedItem = DynamicReportComponent._reportCache.find(x => x.conversationId === this.ConversationID && x.conversationDetailId === this.ConversationDetailID);
          if (cachedItem) {
            this.matchingReportID = cachedItem.reportId;
            this.matchingReportName = cachedItem.reportName;
          }
          else {
            const rv = new RunView();
            const matchingReports = await rv.RunView({
              EntityName: 'Reports',
              ExtraFilter: 'ConversationID = ' + this.ConversationID + ' AND ConversationDetailID = ' + this.ConversationDetailID
            })
            if (matchingReports && matchingReports.Success && matchingReports.RowCount > 0) {
              const item = matchingReports.Results[0];
              this.matchingReportID = item.ID;
              this.matchingReportName = item.Name;
              // cache for future to avoid db call
              DynamicReportComponent._reportCache.push({reportId: item.ID, conversationId: this.ConversationID, reportName: item.Name, conversationDetailId: this.ConversationDetailID});

              this.cdRef.detectChanges(); // the above will change the view so we need to manually trigger change detection
            }
          }
        }
    }
  }

  async ngAfterViewInit() {
    await this.RefreshMatchingReport();
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

        const newDataContext = await DataContext.Clone(this.DataContext);
        if (!newDataContext)
          throw new Error('Error cloning data context')
        report.DataContextID = newDataContext.ID;

        // next, strip out the messags from the SkipData object to put them into our Report Configuration as we dont need to store that information as we have a 
        // link back to the conversation and conversation detail
        const newSkipData : SkipAPIAnalysisCompleteResponse = JSON.parse(JSON.stringify(this.SkipData));
        newSkipData.messages = [];
        report.Configuration = JSON.stringify(newSkipData) 

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

  public async doRefreshReport() {
    try {
      if (this.ReportEntity && this.ReportEntity.ID > 0) {
        const gql = `query ExecuteAskSkipRunScript($dataContextId: Int!, $scriptText: String!) {
          ExecuteAskSkipRunScript(DataContextId: $dataContextId, ScriptText: $scriptText) {
            Success
            Status
            Result
            ConversationId 
            UserMessageConversationDetailId
            AIMessageConversationDetailId
          }
        }`
        const result = await GraphQLDataProvider.ExecuteGQL(gql, { 
            dataContextId: this.ReportEntity.DataContextID,
            scriptText: this.SkipData?.scriptText
          });
  
        const resultObj = <MJAPISkipResult>result.ExecuteAskSkipRunScript;
        if (resultObj.Success) {
          // it worked, refresh the report here 
          const newSkipData : SkipAPIAnalysisCompleteResponse = JSON.parse(resultObj.Result);
          this.ReportEntity.Configuration = JSON.stringify(newSkipData);
          await this.ReportEntity.Save();
          this.SkipData = newSkipData; // this drives binding to chart and table and so forth for a refresh
        }
        return result;          
      }
    }
    catch (err) {
      console.error(err);          
    }
  }
}