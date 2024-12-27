import { Component, Input } from '@angular/core';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';

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
}