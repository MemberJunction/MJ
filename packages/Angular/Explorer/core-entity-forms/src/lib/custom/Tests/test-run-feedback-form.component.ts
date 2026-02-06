import { Component, ChangeDetectionStrategy, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TestRunFeedbackEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { CompositeKey } from '@memberjunction/core';
import { TestRunFeedbackFormComponent } from '../../generated/Entities/TestRunFeedback/testrunfeedback.form.component';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Feedbacks')
@Component({
  standalone: false,
  selector: 'mj-test-run-feedback-form',
  template: `
    <div class="feedback-form">
      <div class="feedback-header">
        <h2><i class="fas fa-comment-dots"></i> Test Run Feedback</h2>
        @if (record.TestRunID) {
          <button kendoButton (click)="openTestRun()">
            <i class="fas fa-external-link"></i> View Test Run
          </button>
        }
      </div>
      <div class="feedback-content">
        <div class="field-group">
          <label>Rating (1-5)</label>
          <input type="number" [(ngModel)]="record.Rating" min="1" max="5" />
        </div>
        <div class="field-group">
          <label>Is Correct?</label>
          <input type="checkbox" [(ngModel)]="record.IsCorrect" />
        </div>
        <div class="field-group">
          <label>Comments</label>
          <textarea [(ngModel)]="record.Comments" rows="6"></textarea>
        </div>
        <div class="field-group">
          <label>Reviewer</label>
          <div>{{ record.ReviewerUser }}</div>
        </div>
        <div class="field-group">
          <label>Submitted At</label>
          <div>{{ record.__mj_CreatedAt | date:'medium' }}</div>
        </div>
      </div>
    </div>
    `,
  styles: [`
    .feedback-form { padding: 20px; }
    .feedback-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .feedback-header h2 { margin: 0; font-size: 20px; display: flex; align-items: center; gap: 12px; }
    .feedback-content { background: white; padding: 24px; border-radius: 8px; }
    .field-group { margin-bottom: 20px; }
    .field-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
    .field-group input[type="number"], .field-group textarea { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
    .field-group input[type="checkbox"] { width: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRunFeedbackFormComponentExtended extends TestRunFeedbackFormComponent {
  public override record!: TestRunFeedbackEntity;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    protected cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  openTestRun() {
    if (this.record.TestRunID) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(this.record.TestRunID));
    }
  }
}

export function LoadTestRunFeedbackFormComponentExtended() {}
LoadTestRunFeedbackFormComponentExtended();
