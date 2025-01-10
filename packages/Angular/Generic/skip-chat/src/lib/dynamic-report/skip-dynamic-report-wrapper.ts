import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'skip-dynamic-report',
  styles: [
    `.report-tab-title { margin-left: 10px;}`,
    `.skip-dynamic-report-container {
        display: block;
        margin-right: 20px;
    }`
    ],
  template: `
<div class='skip-dynamic-report-wrapper'> 
    <skip-dynamic-linear-report
        [SkipData]="SkipData"
        [ConversationID]="ConversationID"
        [ConversationName]="ConversationName"
        [ConversationDetailID]="ConversationDetailID"
        [DataContext]="DataContext"
        [ShowCreateReportButton]="true"
        [ExpandAll]="true"
        [Provider]="Provider"
        (NavigateToMatchingReport)="bubbleNavigateToMatchingReport($event)"
    ></skip-dynamic-linear-report>
</div>
` 
})
export class SkipDynamicReportWrapperComponent {
    @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() ConversationID: string | null = null;
    @Input() ConversationName: string | null = null;    
    @Input() ConversationDetailID: string | null = null;
    @Input() DataContext!: DataContext;
    @Input() AllowDrillDown: boolean = true;
    @Input() Provider: IMetadataProvider | null = null;
    /**
     * Event emitted when the user clicks on a matching report and the application needs to handle the navigation
     */
    @Output() NavigateToMatchingReport = new EventEmitter<string>();

    public bubbleNavigateToMatchingReport(reportID: string) {
        this.NavigateToMatchingReport.emit(reportID);
    }
}