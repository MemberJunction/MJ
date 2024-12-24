import { AfterViewInit, AfterViewChecked, ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse, MJAPISkipResult } from '@memberjunction/skip-types';
import { SharedService, HtmlListType } from '@memberjunction/ng-shared';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { DataContext } from '@memberjunction/data-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * This component is used for dynamically rendering Skip Reports
 */
@Component({
  selector: 'skip-dynamic-linear-report',
  styleUrls: ['./linear-report.css'],
  templateUrl: './linear-report.html',
})
export class SkipDynamicLinearReportComponent implements AfterViewInit {
  @Input() ShowCreateReportButton: boolean = false;
  @Input() ConversationID: string | null = null;
  @Input() ConversationName: string | null = null;
  @Input() ConversationDetailID: string | null = null;
  @Input() DataContext!: DataContext;
  @Input() ReportEntity?: ReportEntity;
  @Input() ExpandAll: boolean = true;
  @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;

  constructor(
    public sharedService: SharedService,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {}

  public matchingReportID: string | null = null;
  public matchingReportName: string | null = null;
  private static _reportCache: { reportId: string; conversationId: string; reportName: string; conversationDetailId: string }[] = [];
  private _loaded: boolean = false;
  async RefreshMatchingReport() {
    if (this.SkipData && !this._loaded && this.ConversationDetailID && this.ConversationID) {
      this._loaded = true;
      if (this.ShowCreateReportButton) {
        // check to see if a report has been created that is linked to this ConvoID/ConvoDetailID
        // if so don't allow the user to create another report, show a link to the existing one
        const cachedItem = SkipDynamicLinearReportComponent._reportCache.find(
          (x) => x.conversationId === this.ConversationID && x.conversationDetailId === this.ConversationDetailID
        );
        if (cachedItem) {
          this.matchingReportID = cachedItem.reportId;
          this.matchingReportName = cachedItem.reportName;
        } else {
          const rv = new RunView();
          const matchingReports = await rv.RunView({
            EntityName: 'Reports',
            ExtraFilter: `ConversationID = '${this.ConversationID}' AND ConversationDetailID = '${this.ConversationDetailID}'`,
          });
          if (matchingReports && matchingReports.Success && matchingReports.RowCount > 0) {
            const item = matchingReports.Results[0];
            this.matchingReportID = item.ID;
            this.matchingReportName = item.Name;
            // cache for future to avoid db call
            SkipDynamicLinearReportComponent._reportCache.push({
              reportId: item.ID,
              conversationId: this.ConversationID,
              reportName: item.Name,
              conversationDetailId: this.ConversationDetailID,
            });
          }
        }
        this.cdRef.detectChanges(); // the above will change the view so we need to manually trigger change detection
      }
    }
  }

  async ngAfterViewInit() {
    await this.RefreshMatchingReport();
    setTimeout(() => {
      SharedService.Instance.InvokeManualResize(250); // resize the tab strip and its contents after short delay
    }, 100);
  }

  public clickMatchingReport() {
    if (this.matchingReportID !== null && this.matchingReportID.length > 0) {
      // navigate to the report
      this.router.navigate(['resource', 'report', this.matchingReportID]);
    }
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
    } else return '<h2>No Analysis Provided</h2>';
  }

  public confirmCreateReportDialogOpen: boolean = false;
  public isCreatingReport: boolean = false;
  public async askCreateReport() {
    if (!this.SkipData || !this.ConversationID || !this.ConversationName || !this.ConversationDetailID) {
      throw new Error('Must set SkipData, ConversationID, ConversationName, and ConversationDetailID to enable saving report');
    } else {
      this.confirmCreateReportDialogOpen = true; // shows the dialog, the rest happens when the uesr clicks yes/no/cancel
    }
  }

  public closeCreateReport(action: 'yes' | 'no') {
    if (action === 'yes') {
      this.doCreateReport();
    }
    this.confirmCreateReportDialogOpen = false;
  }
  public async doCreateReport() {
    this.isCreatingReport = true;
    if (!this.SkipData || !this.ConversationID || !this.ConversationName || !this.ConversationDetailID) {
      throw new Error('Must set SkipData, ConversationID, ConversationName, and ConversationDetailID to enable saving report');
    } else {
      const result = await this.graphQLCreateNewReport();
      if (result && result.Success) {
        this.matchingReportID = result.ReportID;
        this.matchingReportName = result.ReportName;
        this.sharedService.CreateSimpleNotification(`Report "${result.ReportName}"Saved`, 'success', 2500);
      } else {
        this.sharedService.CreateSimpleNotification('Error saving report', 'error', 2500);
        this.isCreatingReport = false;
      }
    }
  }

  protected async graphQLCreateNewReport(): Promise<{ ReportID: string; ReportName: string; Success: boolean; ErrorMessage: string }> {
    // do this via a single gql call to make it faster than doing operation via standard objects since it is a multi-step operation
    const mutation = `mutation CreateReportFromConversationDetailIDMutation ($ConversationDetailID: String!) {
      CreateReportFromConversationDetailID(ConversationDetailID: $ConversationDetailID) {
        ReportID
        ReportName
        Success
        ErrorMessage
      }
    }`;
    const result = await GraphQLDataProvider.ExecuteGQL(mutation, {
      ConversationDetailID: this.ConversationDetailID,
    });
    if (result && result.CreateReportFromConversationDetailID) return result.CreateReportFromConversationDetailID;
    else
      return {
        Success: false,
        ErrorMessage: 'Failed to execute',
        ReportID: '',
        ReportName: '',
      };
  }

  public async doRefreshReport() {
    try {

      if(!this.SkipData){
        this.sharedService.CreateSimpleNotification('No data to refresh', 'error', 2500);
        return;
      }

      if(!this.ReportEntity || !this.ReportEntity.ID){
        this.sharedService.CreateSimpleNotification('No report to refresh', 'error', 2500);
        return
      }

      this.sharedService.CreateSimpleNotification('Refreshing report...', 'info', 2500);

      const gql: string = `query ExecuteAskSkipRunScript($dataContextId: String!, $scriptText: String!) {
        ExecuteAskSkipRunScript(DataContextId: $dataContextId, ScriptText: $scriptText) {
          Success
          Status
          Result
          ConversationId
          UserMessageConversationDetailId
          AIMessageConversationDetailId
        }
      }`;

      const result: {ExecuteAskSkipRunScript: MJAPISkipResult} = await GraphQLDataProvider.ExecuteGQL(gql, {
        dataContextId: this.ReportEntity.DataContextID,
        scriptText: this.SkipData?.scriptText,
      });

      const resultObj: MJAPISkipResult = result.ExecuteAskSkipRunScript;
      if(!resultObj.Success){
        LogError('Error refreshing report: resultObj.Success was false');
        this.sharedService.CreateSimpleNotification('Error refreshing report', 'error', 2500);
        return;
      }

      // it worked, refresh the report here
      const newSkipData: SkipAPIAnalysisCompleteResponse = JSON.parse(resultObj.Result);
      this.SkipData = newSkipData; // this drives binding to chart and table and so forth for a refresh
      this.ReportEntity.Configuration = JSON.stringify(newSkipData);

      const saveResult: boolean = await this.ReportEntity.Save();
      if(!saveResult){
        LogError('Error refreshing report: failed to save report entity', undefined, this.ReportEntity.LatestResult);
        this.sharedService.CreateSimpleNotification('Error refreshing report', 'error', 2500);
      }
      else{
        this.sharedService.CreateSimpleNotification('Report refreshed', 'success', 2500);
      }
    } 
    catch (err) {
      this.sharedService.CreateSimpleNotification('Error refreshing report', 'error', 2500);
      console.error(err);
    }
  }

  public static GetEntityNameFromSchemaAndViewString(schemaAndView: string): string | null {
    const md = new Metadata();
    // check to see if the view has a . in it, that would mean it has schema and view name, SHOULD always have that
    let schema = '',
      view = '';
    if (schemaAndView.indexOf('.') === -1) {
      view = schemaAndView.trim().toLowerCase();
    } else {
      schema = schemaAndView.split('.')[0].trim().toLowerCase();
      view = schemaAndView.split('.')[1].trim().toLowerCase();
    }
    const e = md.Entities.filter(
      (x) => x.BaseView.trim().toLowerCase() === view && (schema === '' || x.SchemaName.trim().toLowerCase() === schema)
    ); // try to find the entity even if we don't have the schema name. AI should include it in schema.view syntax but if it doesn't we'll try to find
    if (e && e.length === 1) {
      return e[0].Name;
    } else if (!e || e.length === 0) {
      console.warn(`Could not find entity for the specified DrillDownView: ${schemaAndView}`);
      return null;
    } else if (e && e.length > 1) {
      console.warn(`Found more than one entity for the specified DrillDownView: ${schemaAndView}`);
      return null;
    }
    return null;
  }
}
