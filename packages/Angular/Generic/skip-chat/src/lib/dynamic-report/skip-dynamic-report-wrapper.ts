import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { DrillDownInfo } from '../drill-down-info';
import { SkipDynamicLinearReportComponent } from './linear-report';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

@Component({
  standalone: false,
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
    <skip-dynamic-linear-report #linearReport
        [SkipData]="SkipData"
        [ConversationID]="ConversationID"
        [ConversationName]="ConversationName"
        [ConversationDetailID]="ConversationDetailID"
        [DataContext]="DataContext"
        [ShowCreateReportButton]="true"
        [ShowOpenReportButton]="ShowOpenReportButton"
        [ExpandAll]="true"
        [Provider]="Provider"
        [showFeedbackPanel]="showFeedbackPanel"
        [toggleFeedbackPanel]="toggleFeedbackPanel"
        (NavigateToMatchingReport)="bubbleNavigateToMatchingReport($event)"
        (NewReportCreated)="bubbleNewReportCreated($event)"
        (DrillDownEvent)="bubbleDrillDownEvent($event)"
    ></skip-dynamic-linear-report>
</div>
`
})
export class SkipDynamicReportWrapperComponent {
    @ViewChild('linearReport') linearReport?: SkipDynamicLinearReportComponent;
    @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() ConversationID: string | null = null;
    @Input() ConversationName: string | null = null;
    @Input() ConversationDetailID: string | null = null;
    @Input() DataContext!: DataContext;
    @Input() AllowDrillDown: boolean = true;
    @Input() Provider: IMetadataProvider | null = null;
    @Input() ShowOpenReportButton: boolean = true;

    // Feedback props
    public showFeedbackPanel: boolean = false;
    public toggleFeedbackPanel: () => void = () => {};

    /**
     * Event emitted when the user clicks on a matching report and the application needs to handle the navigation
     */
    @Output() NavigateToMatchingReport = new EventEmitter<string>();

    /**
     * This event fires whenever a new report is created.
     */
    @Output() NewReportCreated = new EventEmitter<string>();

    /**
     * This event fires whenever a drill down is requested within a given report.
     */
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();
    

    public bubbleNavigateToMatchingReport(reportID: string) {
        this.NavigateToMatchingReport.emit(reportID);
    }
    public bubbleNewReportCreated(reportID: string) {
        this.NewReportCreated.emit(reportID);
    }
    public bubbleDrillDownEvent(drillDownInfo: DrillDownInfo) {
        this.DrillDownEvent.emit(drillDownInfo);
    }

    /**
     * Get the resolved component spec from the React component
     * Returns null if the component is not yet initialized or spec is not available
     */
    public getResolvedComponentSpec(): ComponentSpec | null {
        if (!this.linearReport?.theUIComponent) {
            return null;
        }

        const reactComponents = this.linearReport.theUIComponent.reactComponents;
        if (!reactComponents || reactComponents.length === 0) {
            return null;
        }

        // Get the first (or currently selected) React component
        const reactComponent = reactComponents.first || reactComponents.toArray()[0];
        return reactComponent?.resolvedComponentSpec || null;
    }
}