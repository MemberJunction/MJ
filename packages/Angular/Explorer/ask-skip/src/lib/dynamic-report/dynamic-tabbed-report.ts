import { AfterViewInit, AfterViewChecked, ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SharedService } from '@memberjunction/ng-shared';
import { DynamicReportDrillDownComponent } from './dynamic-drill-down';
import { TabEvent } from '@memberjunction/ng-tabstrip';
import { DrillDownInfo } from '@memberjunction/ng-skip-chat';
import { SkipDynamicReportBase } from '@memberjunction/ng-skip-chat/dist/lib/dynamic-report/base-report';

// This component is used for dynamically rendering report data, it is wrapped by app-single-report which gets
// info from the database. This can also be used directly to render a dynamic report that is NOT saved in the DB
// which is what Skip does in its conversational UI

@Component({
  selector: 'skip-dynamic-tabbed-report',
  styleUrls: ['./dynamic-tabbed-report.css'],
  templateUrl: './dynamic-tabbed-report.html',
})
export class SkipDynamicTabbedReportComponent extends SkipDynamicReportBase implements AfterViewInit, AfterViewChecked {
  @Input() ShowDetailsTab: boolean = false;
  @Input() AllowDrillDown: boolean = true;

  public DrillDowns: DrillDownInfo[] = [];

  @ViewChild('drillDownComponent', { static: false }) drillDownComponent!: DynamicReportDrillDownComponent;

  constructor(
    public sharedService: SharedService,
    private router: Router,
    protected cdRef: ChangeDetectorRef
  ) {
    super(cdRef);
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

  public activeTabIndex: number = 0;
  public onTabSelect(e: TabEvent): void {
    this.activeTabIndex = e.index;
    this.sharedService.InvokeManualResize(100); // for the first tab, chart, have a longer delay because that is the plotly chart which takes a moment to render and needs to be resized after
    if (e.index === 0) {
      // special case, do an extra resize after a longer delay since plotly charts take a moment to render
      this.sharedService.InvokeManualResize(750);
    }
  }

  public isTabSelected(index: number) {
    // the index passed in is a value that is the index of the tab at the DESIGN TIME IN THE HTML
    // which is based on the maximum # of possible tabs that can exist.
    // If some of the tabs are NOT showing, then we have fewer tabs than the max
    // for this reason, we need to
    return this.activeTabIndex === index - this.getCurrentTabOffset(index);
  }

  protected getCurrentTabOffset(currentTabIndex: number): number {
    let offset = 0;
    switch (currentTabIndex) {
      case 0:
        // chart tab, no change
        break;
      case 1:
        // table tab. If chart tab isn't showing, then we need to offset by 1
        if (!this.IsChart) offset++;
        break;
      case 2:
        // drill down tab. If chart tab isn't showing, then we need to offset
        if (!this.IsChart) offset++;
        break;
      default:
        // rest of the tabs above the first 3 are always showing, so we need to offset by the number of tabs that are not showing
        if (!this.IsChart) offset++;
        if (this.DrillDowns.length === 0 || !this.AllowDrillDown) offset++;
        break;
    }
    return offset;
  }
 
  public confirmCreateReportDialogOpen: boolean = false;
  public async askCreateReport() {
    if (!this.SkipData || !this.ConversationID || !this.ConversationName || !this.ConversationDetailID) {
      throw new Error('Must set SkipData, ConversationID, ConversationName, and ConversationDetailID to enable saving report');
    } else {
      this.confirmCreateReportDialogOpen = true; // shows the dialog, the rest happens when the uesr clicks yes/no/cancel
    }
  }

  public closeCreateReport(action: 'yes' | 'no') {
    if (action === 'yes') {
      this.DoCreateReport();
    }
    this.confirmCreateReportDialogOpen = false;
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
    const idx = this.DrillDowns.findIndex((x) => x.EntityName === info.EntityName && x.Filter === info.Filter);
    if (idx >= 0) {
      // here we already have the drill down, so just select the tab
      this._drillDownSelectTab = idx;
    } else {
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
        this.activeTabIndex = 2; // chart tab IS showing show index of drill down is 2
      else this.activeTabIndex = 1; // chart tab is missing so index is 1

      this.drillDownComponent.SelectTab(this._drillDownSelectTab);
      this._drillDownSelectTab = -1; // turn off flag
    }
  }
}
