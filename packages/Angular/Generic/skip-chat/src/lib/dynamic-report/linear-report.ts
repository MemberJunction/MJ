import { ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { SkipDynamicReportBase } from './base-report';
import { SkipDynamicUIComponentComponent } from './dynamic-ui-component';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * This component is used for dynamically rendering Skip Reports
 */
@Component({
  standalone: false,
  selector: 'skip-dynamic-linear-report',
  styleUrls: ['./linear-report.css'],
  templateUrl: './linear-report.html',
})
export class SkipDynamicLinearReportComponent extends SkipDynamicReportBase {
  @Input() ExpandAll: boolean = true;
  @Input() showFeedbackPanel: boolean = false;
  @Input() toggleFeedbackPanel: () => void = () => {};
  @ViewChild('theUIComponent') theUIComponent?: SkipDynamicUIComponentComponent;

  constructor(
    protected cdRef: ChangeDetectorRef,
    private notificationService: MJNotificationService
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
      
      // Force the child component to update its UI
      if (this.theUIComponent) {
        // Update the matchingReportID on the child component directly if needed
        this.theUIComponent.matchingReportID = this.matchingReportID;
        this.theUIComponent.isCreatingReport = false;
        
        // Trigger change detection on both parent and child
        this.cdRef.detectChanges();
        if (this.theUIComponent['cdr']) {
          this.theUIComponent['cdr'].detectChanges();
        }
      }
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

  /**
   * Override the base class method to use the notification service
   */
  protected override RaiseUserNotification(message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number) {
    // Call the parent to emit the event (in case something is listening)
    super.RaiseUserNotification(message, style, hideAfter);
    
    // Also show the notification using the MJNotificationService
    if (style !== 'none') {
      this.notificationService.CreateSimpleNotification(message, style, hideAfter || 3000);
    }
  }
}
