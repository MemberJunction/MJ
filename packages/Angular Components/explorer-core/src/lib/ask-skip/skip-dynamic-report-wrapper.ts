import { Component, Input, ViewChild } from '@angular/core';
import { DynamicReportComponent } from '../generic/dynamic-report';
import { SkipData } from './ask-skip.component';

@Component({
  selector: 'app-skip-dynamic-report',
  styles: [
    `.report-tab-title { margin-left: 10px;}`,
    `.skip-dynamic-report-container {
        display: block;
        height: 450px;
        width: 90%;
        margin-right: 20px;
    }`
    ],
  template: `
<div class='skip-dynamic-report-container'> 
    <app-dynamic-report #theReport
        [SkipData]="SkipData"
        [ConversationID]="ConversationID"
        [ConversationName]="ConversationName"
        [ConversationDetailID]="ConversationDetailID"
        [ShowCreateReportButton]="true"
    ></app-dynamic-report>
</div>
` 
})
export class SkipDynamicReportComponent {
   @ViewChild('theReport', { static: false }) theReport!: DynamicReportComponent;

    @Input() SkipData: SkipData | undefined;
    @Input() ConversationID: number | null = null;
    @Input() ConversationName: string | null = null;    
    @Input() ConversationDetailID: number | null = null;
}