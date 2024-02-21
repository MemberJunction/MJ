import { Component, Input, ViewChild } from '@angular/core';
import { DynamicReportComponent } from './dynamic-report';
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
    ></mj-dynamic-report>
</div>
` 
})
export class SkipDynamicReportComponent {
   @ViewChild('theReport', { static: false }) theReport!: DynamicReportComponent;

    @Input() SkipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() ConversationID: number | null = null;
    @Input() ConversationName: string | null = null;    
    @Input() ConversationDetailID: number | null = null;
    @Input() DataContext!: DataContext;
}