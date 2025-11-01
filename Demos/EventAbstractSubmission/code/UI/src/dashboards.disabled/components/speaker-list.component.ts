import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SpeakerEntity } from 'mj_generatedentities';

@Component({
  selector: 'mj-speaker-list',
  template: `
    <div class="speaker-list">
      <div *ngIf="speakers.length === 0" class="empty-state">
        No speakers found
      </div>
      <kendo-grid
        *ngIf="speakers.length > 0"
        [data]="speakers"
        [height]="400"
        [sortable]="true"
        [filterable]="true"
        [pageable]="true"
        [pageSize]="10">
        <kendo-grid-column field="FirstName" title="First Name" [width]="150"></kendo-grid-column>
        <kendo-grid-column field="LastName" title="Last Name" [width]="150"></kendo-grid-column>
        <kendo-grid-column field="Email" title="Email" [width]="200"></kendo-grid-column>
        <kendo-grid-column field="Company" title="Company" [width]="180"></kendo-grid-column>
        <kendo-grid-column field="Title" title="Title" [width]="180"></kendo-grid-column>
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
    .speaker-list {
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
export class SpeakerListComponent {
  @Input() speakers: SpeakerEntity[] = [];
  @Output() viewSpeaker = new EventEmitter<SpeakerEntity>();

  onView(speaker: SpeakerEntity): void {
    this.viewSpeaker.emit(speaker);
  }
}
