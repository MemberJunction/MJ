import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RecruitingService } from '../services/recruiting.service';
import { BaseEntity } from '@memberjunction/core-entities';

/**
 * Form component for managing interview feedback
 */
@Component({
  selector: 'app-interview-form',
  template: `
    <div class="interview-form">
      <form-toolbar
        [record]="record"
        [editMode]="EditMode"
        (save)="SaveForm()"
        (cancel)="onCancel()"
        (delete)="onDelete()">
      </form-toolbar>

      <div class="form-content">
        <div class="form-section" *ngIf="application">
          <h3><i class="fa-solid fa-user"></i> Candidate</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Candidate Name</label>
              <div class="readonly-field">{{ application.Get('CandidateName') }}</div>
            </div>

            <div class="form-field">
              <label>Job Title</label>
              <div class="readonly-field">{{ application.Get('JobTitle') }}</div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-calendar"></i> Interview Details</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Interview Type *</label>
              <kendo-dropdownlist
                [(ngModel)]="record.InterviewType"
                [data]="interviewTypes"
                [defaultItem]="'Select Type'"
                required>
              </kendo-dropdownlist>
            </div>

            <div class="form-field">
              <label>Status</label>
              <kendo-dropdownlist
                [(ngModel)]="record.Status"
                [data]="statusOptions"
                [defaultItem]="'Select Status'">
              </kendo-dropdownlist>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>Scheduled Date/Time</label>
              <kendo-datetimepicker
                [(ngModel)]="record.ScheduledDateTime">
              </kendo-datetimepicker>
            </div>

            <div class="form-field" *ngIf="record.Status === 'Completed'">
              <label>Completed Date/Time</label>
              <kendo-datetimepicker
                [(ngModel)]="record.CompletedDateTime">
              </kendo-datetimepicker>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Interviewers (JSON array of emails)</label>
              <textarea
                [(ngModel)]="record.InterviewerEmails"
                class="k-textarea"
                rows="2"
                placeholder='["john@example.com", "jane@example.com"]'></textarea>
            </div>
          </div>
        </div>

        <div class="form-section" *ngIf="record.Status === 'Completed'">
          <h3><i class="fa-solid fa-clipboard-check"></i> Feedback</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Overall Score (1-5)</label>
              <kendo-numerictextbox
                [(ngModel)]="record.FeedbackScore"
                [format]="'n0'"
                [decimals]="0"
                [min]="1"
                [max]="5">
              </kendo-numerictextbox>
            </div>

            <div class="form-field">
              <label>Recommendation</label>
              <kendo-dropdownlist
                [(ngModel)]="record.Recommendation"
                [data]="recommendationOptions"
                [defaultItem]="'Select Recommendation'">
              </kendo-dropdownlist>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Feedback Notes</label>
              <textarea
                [(ngModel)]="record.FeedbackNotes"
                class="k-textarea"
                rows="8"
                placeholder="Detailed feedback from the interview..."></textarea>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Next Steps</label>
              <textarea
                [(ngModel)]="record.NextSteps"
                class="k-textarea"
                rows="3"
                placeholder="Recommended next steps for this candidate..."></textarea>
            </div>
          </div>
        </div>

        <div class="recommendation-guide" *ngIf="record.Status === 'Completed'">
          <h4>Recommendation Guide</h4>
          <ul>
            <li><strong>Strong Yes:</strong> Exceptional candidate, hire immediately</li>
            <li><strong>Yes:</strong> Strong candidate, proceed to next round</li>
            <li><strong>Maybe:</strong> Borderline, needs more evaluation</li>
            <li><strong>No:</strong> Does not meet requirements</li>
            <li><strong>Strong No:</strong> Clearly not a fit</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../shared/form-styles.css'],
  styles: [`
    .recommendation-guide {
      background: #e7f3ff;
      border: 1px solid #0078d4;
      border-radius: 8px;
      padding: 15px;
      margin-top: 20px;
    }

    .recommendation-guide h4 {
      margin: 0 0 10px 0;
      color: #0078d4;
    }

    .recommendation-guide ul {
      margin: 0;
      padding-left: 20px;
    }

    .recommendation-guide li {
      margin-bottom: 5px;
      color: #495057;
    }
  `]
})
export class InterviewFormComponent extends BaseFormComponent implements OnInit {

  application: BaseEntity | null = null;

  interviewTypes = ['Phone', 'Preliminary', 'Technical', 'Behavioral', 'Panel', 'Final', 'Other'];
  statusOptions = ['Scheduled', 'Completed', 'Canceled', 'NoShow', 'Rescheduled'];
  recommendationOptions = ['StrongYes', 'Yes', 'Maybe', 'No', 'StrongNo'];

  constructor(
    private cdr: ChangeDetectorRef,
    private recruitingService: RecruitingService
  ) {
    super();
  }

  override async ngOnInit() {
    await super.ngOnInit();
    await this.loadApplication();
    this.cdr.detectChanges();
  }

  async loadApplication() {
    if (this.record && this.record.Get('ApplicationID')) {
      const applicationID = this.record.Get('ApplicationID') as string;
      const applications = await this.recruitingService.getApplications();
      this.application = applications.find(a => a.Get('ID') === applicationID) || null;
    }
  }

  onCancel() {
    // Navigate back or close form
  }

  onDelete() {
    // Handle delete with confirmation
  }
}
