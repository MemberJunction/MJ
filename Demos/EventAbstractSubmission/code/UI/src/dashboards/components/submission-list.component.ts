import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SubmissionEntity } from 'mj_generatedentities';

@Component({
  selector: 'mj-submission-list',
  template: `
    <div class="submission-list">
      <div *ngIf="submissions.length === 0" class="empty-state">
        No submissions found
      </div>
      <kendo-grid
        *ngIf="submissions.length > 0"
        [data]="submissions"
        [height]="400"
        [sortable]="true"
        [filterable]="true"
        [pageable]="true"
        [pageSize]="10">
        <kendo-grid-column field="SubmissionTitle" title="Title" [width]="300"></kendo-grid-column>
        <kendo-grid-column field="SubmissionType" title="Type" [width]="120"></kendo-grid-column>
        <kendo-grid-column field="Status" title="Status" [width]="120">
          <ng-template kendoGridCellTemplate let-dataItem>
            <mj-status-badge [status]="dataItem.Status"></mj-status-badge>
          </ng-template>
        </kendo-grid-column>
        <kendo-grid-column field="__mj_CreatedAt" title="Submitted" [width]="140" format="{0:d}"></kendo-grid-column>
        <kendo-grid-command-column title="Actions" [width]="120">
          <ng-template kendoGridCellTemplate let-dataItem>
            <button kendoButton [size]="'small'" (click)="onView(dataItem)">
              View
            </button>
          </ng-template>
        </kendo-grid-command-column>
      </kendo-grid>
    </div>
  `,
  styles: [`
    .submission-list {
      width: 100%;
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: #6b7280;
      font-style: italic;
    }
  `]
})
export class SubmissionListComponent {
  @Input() submissions: SubmissionEntity[] = [];
  @Output() viewSubmission = new EventEmitter<SubmissionEntity>();

  onView(submission: SubmissionEntity): void {
    this.viewSubmission.emit(submission);
  }
}
