import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { SkipDynamicReportBase } from './base-report';

/**
 * This component is used for dynamically rendering Skip Reports
 */
@Component({
  selector: 'skip-dynamic-linear-report',
  styleUrls: ['./linear-report.css'],
  templateUrl: './linear-report.html',
})
export class SkipDynamicLinearReportComponent extends SkipDynamicReportBase {
  @Input() ExpandAll: boolean = true;

  constructor(
    protected cdRef: ChangeDetectorRef,
  ) {
    super(cdRef);
  } 
 

  public clickMatchingReport() {
    if (this.matchingReportID !== null && this.matchingReportID.length > 0) {
      // navigate to the report
      this.NavigateToMatchingReport.emit(this.matchingReportID);
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

  public async closeCreateReport(action: 'yes' | 'no') {
    if (action === 'yes') {
      await this.DoCreateReport();
      this.cdRef.detectChanges(); // ensure our refresh happens as the MatchingReportID could have been updated
    }
    this.confirmCreateReportDialogOpen = false;
  }

  /**
   * Handle create report request from a specific option in the HTML report
   */
  public handleCreateReportForOption(optionIndex: number): void {
    // For now, we'll use the same create report logic
    // In the future, we might want to pass the option index to create reports based on specific options
    this.askCreateReport();
  }
}
