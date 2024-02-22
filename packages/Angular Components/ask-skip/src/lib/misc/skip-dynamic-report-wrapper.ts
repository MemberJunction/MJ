import { Component, Input } from '@angular/core';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';

@Component({
  selector: 'mj-skip-dynamic-report',
  styles: [
    `.report-tab-title { margin-left: 10px;}`,
    `.skip-dynamic-report-container {
        display: block;
        margin-right: 20px;
    }`
    ],
  template: `
<div class='skip-dynamic-report-container'> 
    <mj-dynamic-report #theReport
        [SkipData]="SkipData"
        [ConversationID]="ConversationID"
        [ConversationName]="ConversationName"
        [ConversationDetailID]="ConversationDetailID"
        [DataContext]="DataContext"
        [ShowCreateReportButton]="true"
        [LayoutMode]="'linear'"
        [LinearExpandAll]="true"
    ></mj-dynamic-report>
</div>
` 
})
export class SkipDynamicReportComponent {
    @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() ConversationID: number | null = null;
    @Input() ConversationName: string | null = null;    
    @Input() ConversationDetailID: number | null = null;
    @Input() DataContext!: DataContext;
}