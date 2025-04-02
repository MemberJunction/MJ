import { AfterViewInit, ChangeDetectorRef, Component, Directive, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView } from "@memberjunction/core";
import { ReportEntity } from "@memberjunction/core-entities";
import { DataContext } from "@memberjunction/data-context";
import { ConvertMarkdownStringToHtmlList } from "@memberjunction/global";
import { GraphQLDataProvider } from "@memberjunction/graphql-dataprovider";
import { BaseAngularComponent } from "@memberjunction/ng-base-types";
import { MJAPISkipResult, SkipAPIAnalysisCompleteResponse, SkipColumnInfo } from "@memberjunction/skip-types";
import { SkipConversationReportCache } from "../report-cache";

@Directive() // using a directive here becuase this is an abstract base class that will later be subclassed and decorated as @Component
export abstract class SkipDynamicReportBase  extends BaseAngularComponent implements AfterViewInit {
  @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
  @Input() ShowCreateReportButton: boolean = false;
  @Input() ConversationID: string | null = null;
  @Input() ConversationName: string | null = null;
  @Input() ConversationDetailID: string | null = null;
  @Input() DataContext!: DataContext;
  @Input() ReportEntity?: ReportEntity;

  @Output() UserNotification = new EventEmitter<{message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number}>();

  /**
   * This event fires whenever the component has a click on a matching report link. 
   * The provided parameter is the ID of the matching report.
   */
  @Output() NavigateToMatchingReport = new EventEmitter<string>();

  /**
   * This event fires whenever a new report is created.
   */
  @Output() NewReportCreated = new EventEmitter<string>();

  constructor(protected cdRef: ChangeDetectorRef) {
    super();
  }
  
  ngAfterViewInit() {
    this.RefreshMatchingReport();
  }

  
  public matchingReportID: string | null = null;
  public matchingReportName: string | null = null;
  private static _reportCache: { reportId: string; conversationId: string; reportName: string; conversationDetailId: string }[] = [];
  private _loaded: boolean = false;
  public async RefreshMatchingReport() {
    if (this.SkipData && !this._loaded && this.ConversationDetailID && this.ConversationID) {
      this._loaded = true;
      if (this.ShowCreateReportButton) {
        // check to see if a report has been created that is linked to this ConvoID/ConvoDetailID
        // if so don't allow the user to create another report, show a link to the existing one
        const cachedItem = SkipDynamicReportBase._reportCache.find(
          (x) => x.conversationId === this.ConversationID && x.conversationDetailId === this.ConversationDetailID
        );
        if (cachedItem) {
          this.matchingReportID = cachedItem.reportId;
          this.matchingReportName = cachedItem.reportName;
        } 
        else {
          // no cached items locally so use the generalized ReportCache which can load for us if needed
          const reports = await SkipConversationReportCache.Instance.GetConversationReports(this.ConversationID, this.RunViewToUse); 
          const matchingReports = reports ? reports.filter((x) => x.ConversationDetailID === this.ConversationDetailID) : [];
          if (matchingReports && matchingReports.length > 0) {
            const item = matchingReports[0];
            this.matchingReportID = item.ID;
            this.matchingReportName = item.Name;
            // cache for future to avoid db call
            SkipDynamicReportBase._reportCache.push({
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


  public get Columns(): SkipColumnInfo[] {
      return this.SkipData?.tableDataColumns || [];
  }

  protected get ResultType(): string {
    // support for legacy format where the resultType was within executionResults and for the new location at the root of SkipData
    let rt = this.SkipData?.resultType?.trim().toLowerCase();
    if (!rt) {
      // we don't have the new format, so check for legacy location
      const executionResults = this.SkipData?.executionResults as any; // becuase new type does NOT have resultType on executionResults as it was moved
      if (executionResults) {
        rt = executionResults.resultType?.trim().toLowerCase();
      }
    }
    return rt || '';
  }
  public get IsChart(): boolean {
    return this.ResultType === 'plot';
  }
  public get IsTable(): boolean {
    return this.ResultType === 'table';
  }
  public get IsHTML(): boolean {
    return this.ResultType === 'html';
  }

  /**
   * This method is used to create the HTML for the analysis section of the report
   * @returns 
   */
  public CreateAnalysisHtml(): string {
      const analysis = this.SkipData?.analysis;
      if (analysis && analysis.length > 0) {
          return ConvertMarkdownStringToHtmlList('Unordered', analysis);
      } 
      else 
          return '<h2>No Analysis Provided</h2>';
  }    

  /**
   * Returns true if the component is in the process of creating a report
   */
  public get IsCreatingReport(): boolean {
      return this._isCreatingReport;
  }
  protected _isCreatingReport: boolean = false;

  /**
   * This method is used to create a report from the current conversation detail
   */
  public async DoCreateReport() {
      this._isCreatingReport = true;
      if (!this.SkipData || !this.ConversationID || !this.ConversationName || !this.ConversationDetailID) {
        throw new Error('Must set SkipData, ConversationID, ConversationName, and ConversationDetailID to enable saving report');
      } else {
        const result = await this._GraphQLCreateNewReport();
        if (result && result.Success) {
          this.matchingReportID = result.ReportID;
          this.matchingReportName = result.ReportName;
          // let the user know we saved the report
          this.RaiseUserNotification(`Report "${result.ReportName}"Saved`, 'success', 2500);

          // tell our shared report cache about the new report
          const report = await this.ProviderToUse.GetEntityObject<ReportEntity>('Reports', this.ProviderToUse.CurrentUser);
          report.Load(result.ReportID).then(() => {
            // do async so the user doesn't wait for this to finish
            SkipConversationReportCache.Instance.AddConversationReport(this.ConversationID!, report);
          });

          this.NewReportCreated.emit(result.ReportID); // finally emit the event
        } else {
          this.RaiseUserNotification('Error saving report', 'error', 2500);
          this._isCreatingReport = false;
        }
      }
  }
  
  protected RaiseUserNotification(message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number) {
      this.UserNotification.emit({message, style, hideAfter});
  }

  /**
   * This method does the internal work with the current GraphQLDataProvider to actually create a new report on the server. 
   */
  protected async _GraphQLCreateNewReport(): Promise<{ ReportID: string; ReportName: string; Success: boolean; ErrorMessage: string }> {
      // do this via a single gql call to make it faster than doing operation via standard objects since it is a multi-step operation
      const mutation = `mutation CreateReportFromConversationDetailIDMutation ($ConversationDetailID: String!) {
          CreateReportFromConversationDetailID(ConversationDetailID: $ConversationDetailID) {
            ReportID
            ReportName
            Success
            ErrorMessage
          }
      }`;
      const p = <GraphQLDataProvider>this.ProviderToUse;
      const result = await p.ExecuteGQL(mutation, {
          ConversationDetailID: this.ConversationDetailID,
      });
      if (result && result.CreateReportFromConversationDetailID) 
          return result.CreateReportFromConversationDetailID;
      else
          return {
          Success: false,
          ErrorMessage: 'Failed to execute',
          ReportID: '',
          ReportName: '',
          };
  }
    
  /**
   * This method will refresh the report by re-running the script that generated the report.
   * @returns 
   */
  public async DoRefreshReport() {
    try {

      if(!this.SkipData){
        this.RaiseUserNotification('No data to refresh', 'error', 2500);
        return;
      }

      if(!this.ReportEntity || !this.ReportEntity.ID){
        this.RaiseUserNotification('No report to refresh', 'error', 2500);
        return
      }

      this.RaiseUserNotification('Refreshing report...', 'info', 2500);

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

      const p = <GraphQLDataProvider>this.ProviderToUse;
      const result: {ExecuteAskSkipRunScript: MJAPISkipResult} = await p.ExecuteGQL(gql, {
        dataContextId: this.ReportEntity.DataContextID,
        scriptText: this.SkipData?.scriptText,
      });

      const resultObj: MJAPISkipResult = result.ExecuteAskSkipRunScript;
      if(!resultObj.Success){
        LogError('Error refreshing report: resultObj.Success was false');
        this.RaiseUserNotification('Error refreshing report', 'error', 2500);
        return;
      }

      // it worked, refresh the report here
      const newSkipData: SkipAPIAnalysisCompleteResponse = JSON.parse(resultObj.Result);
      this.SkipData.analysis = newSkipData.analysis; // update the analysis
      this.SkipData.executionResults = newSkipData.executionResults; // drives the chart/table bindings
      this.SkipData.dataContext = newSkipData.dataContext; // drives the HTML report bindings

      // make sure to push the techExplanation and userExplanation to the newSkipData object as that WILL NOT come back with that info from the original report
      newSkipData.userExplanation = this.SkipData.userExplanation;
      newSkipData.techExplanation = this.SkipData.techExplanation;
      newSkipData.resultType = this.SkipData.resultType;  
      newSkipData.responsePhase = this.SkipData.responsePhase; 
      newSkipData.messages = this.SkipData.messages; // this is the array of messages that are used to create the report from the original message, we don't want message from the refresh, it is simple message
      newSkipData.reportTitle = this.SkipData.reportTitle; // this is the title of the report, we don't want to change it
      newSkipData.drillDown = this.SkipData.drillDown; // this is the drill down data, we don't want to change it
      
      this.ReportEntity.Configuration = JSON.stringify(newSkipData);

      const saveResult: boolean = await this.ReportEntity.Save();
      if(!saveResult){
        LogError('Error refreshing report: failed to save report entity', undefined, this.ReportEntity.LatestResult);
        this.RaiseUserNotification('Error refreshing report', 'error', 2500);
      }
      else{
        this.RaiseUserNotification('Report refreshed', 'success', 2500);
      }
    } 
    catch (err) {
      this.RaiseUserNotification('Error refreshing report', 'error', 2500);
      console.error(err);
    }
  }
}
 