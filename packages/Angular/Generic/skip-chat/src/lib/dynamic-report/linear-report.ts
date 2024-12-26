import { AfterViewInit, ChangeDetectorRef, Component, Input, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { SkipColumnInfo, SkipAPIAnalysisCompleteResponse, MJAPISkipResult } from '@memberjunction/skip-types';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { OutputDeliveryTypeEntity, ReportEntity } from '@memberjunction/core-entities';
import { DataContext } from '@memberjunction/data-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ConvertMarkdownStringToHtmlList } from '@memberjunction/global';
import { SkipDynamicReportBase } from './base-report';

/**
 * This component is used for dynamically rendering Skip Reports
 */
@Component({
  selector: 'skip-dynamic-linear-report',
  styleUrls: ['./linear-report.css'],
  templateUrl: './linear-report.html',
})
export class SkipDynamicLinearReportComponent extends SkipDynamicReportBase implements AfterViewInit {
  @Input() ShowCreateReportButton: boolean = false;
  @Input() ConversationID: string | null = null;
  @Input() ConversationName: string | null = null;
  @Input() ConversationDetailID: string | null = null;
  @Input() DataContext!: DataContext;
  @Input() ReportEntity?: ReportEntity;
  @Input() ExpandAll: boolean = true;
  @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
  @Output() ManualResizeRequest = new EventEmitter<number>();
  @Output() NavigateToMatchingReport = new EventEmitter<string>();

  constructor(
    protected cdRef: ChangeDetectorRef,
  ) {
    super(cdRef);
  } 
 
  async ngAfterViewInit() {
    await this.RefreshMatchingReport();
    setTimeout(() => {
      this.ManualResizeRequest.emit(250); // resize the tab strip and its contents after short delay
    }, 100);
  } 

  public clickMatchingReport() {
    if (this.matchingReportID !== null && this.matchingReportID.length > 0) {
      // navigate to the report
      this.NavigateToMatchingReport.emit(this.matchingReportID);
      //this.router.navigate(['resource', 'report', this.matchingReportID]);
    }
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
}
