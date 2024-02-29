import { AfterViewInit, AfterViewChecked, ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse, MJAPISkipResult } from '@memberjunction/skip-types';
import { SharedService, HtmlListType } from '@memberjunction/ng-shared';
import { Metadata, RunView } from '@memberjunction/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { SelectEvent } from '@progress/kendo-angular-layout';
import { TabComponent } from '@progress/kendo-angular-layout';
import { DataContext } from '@memberjunction/data-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { DrillDownInfo, DynamicReportDrillDownComponent } from './dynamic-drill-down';


// This component is used for dynamically rendering report data, it is wrapped by app-single-report which gets
// info from the database. This can also be used directly to render a dynamic report that is NOT saved in the DB
// which is what Skip does in its conversational UI

@Component({
  selector: 'mj-dynamic-report',
  styleUrls: ['./dynamic-report.css'],
  templateUrl: './dynamic-report.html',
})
export class DynamicReportComponent implements AfterViewInit, AfterViewChecked {
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
  @Input() AllowDrillDown: boolean = true;

  public DrillDowns: DrillDownInfo[] = [];

  @ViewChild('drillDownComponent', {static: false}) drillDownComponent!: DynamicReportDrillDownComponent;
  @ViewChild('tabComponent') tabComponent!: TabComponent;


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
    // the index passed in is a value that is the index of the tab at the DESIGN TIME IN THE HTML
    // which is based on the maximum # of possible tabs that can exist.
    // If some of the tabs are NOT showing, then we have fewer tabs than the max
    // for this reason, we need to 
    return this.activeTabIndex === (index - this.getCurrentTabOffset(index));
  }

  protected getCurrentTabOffset(currentTabIndex: number): number {
    let offset = 0;
    switch (currentTabIndex) {
      case 0:
        // chart tab, no change
        break;
      case 1:
        // table tab. If chart tab isn't showing, then we need to offset by 1
        if (!this.IsChart)
          offset++;
        break;
      case 2:
        // drill down tab. If chart tab isn't showing, then we need to offset 
        if (!this.IsChart)
          offset++;
        break;
      default:
        // rest of the tabs above the first 3 are always showing, so we need to offset by the number of tabs that are not showing
        if (!this.IsChart)
          offset++;
        if (this.DrillDowns.length === 0 || !this.AllowDrillDown)
          offset++;
        break;
    }
    return offset;
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

  public async handleChartDrillDown(info: DrillDownInfo) {
    this.handleDrillDown(info);
  }
  public handleGridDrillDown(info: DrillDownInfo) {
    this.handleDrillDown(info);
  }
  private _drillDownSelectTab: number = -1;
  protected handleDrillDown(info: DrillDownInfo) {
    // first, make sure that the info is not already in the drill down list
    const idx = this.DrillDowns.findIndex(x => x.EntityName === info.EntityName && x.Filter === info.Filter);
    if (idx >= 0) {
      // here we already have the drill down, so just select the tab
      this._drillDownSelectTab = idx;
    }
    else {
      // just add to the info, Angular binding will then update the drill down tabs
      if (this.SkipData?.drillDown?.baseFilter && (!info.BaseFilter || info.BaseFilter.length === 0))
        info.BaseFilter = this.SkipData?.drillDown?.baseFilter; // add the base filter if we have it from Skip and it wasn't already set

      this.DrillDowns.push(info);
      // now make sure the drill down tab is selected, but wait a bit to ensure angular has updated the view
      this._drillDownSelectTab = this.DrillDowns.length - 1;
    }
  }

  public ngAfterViewChecked(): void {
    if (this._drillDownSelectTab >= 0 && this.drillDownComponent) {
      if (this.IsChart)
        this.activeTabIndex = 2 // chart tab IS showing show index of drill down is 2
      else
        this.activeTabIndex = 1 // chart tab is missing so index is 1
      
      this.drillDownComponent.SelectTab(this._drillDownSelectTab);
      this._drillDownSelectTab = -1; // turn off flag
    }
  }

  public static GetEntityNameFromSchemaAndViewString(schemaAndView: string): string | null {
    const md = new Metadata();
    // check to see if the view has a . in it, that would mean it has schema and view name, SHOULD always have that
    let schema = '', view = '';
    if (schemaAndView.indexOf('.') === -1) {
      view = schemaAndView.trim().toLowerCase();
    }
    else {
      schema = schemaAndView.split('.')[0].trim().toLowerCase();
      view = schemaAndView.split('.')[1].trim().toLowerCase();
    }
    const e = md.Entities.filter(x => x.BaseView.trim().toLowerCase() === view && 
                                      (schema === '' || x.SchemaName.trim().toLowerCase() === schema) ); // try to find the entity even if we don't have the schema name. AI should include it in schema.view syntax but if it doesn't we'll try to find
    if (e && e.length === 1 ) {
      return e[0].Name;
    }
    else if (!e || e.length === 0) {
      console.warn(`Could not find entity for the specified DrillDownView: ${schemaAndView}`);
      return null;
    }
    else if (e && e.length > 1) {
      console.warn(`Found more than one entity for the specified DrillDownView: ${schemaAndView}`);
      return null;
    } 
    return null;
  }
}