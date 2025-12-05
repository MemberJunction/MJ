import { Component, ChangeDetectorRef } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { BaseEntity } from '@memberjunction/core-entities';

/**
 * Form component for creating and editing job requisitions
 */
@Component({
  selector: 'app-job-requisition-form',
  template: `
    <div class="job-requisition-form">
      <form-toolbar
        [record]="record"
        [editMode]="EditMode"
        (save)="SaveForm()"
        (cancel)="onCancel()"
        (delete)="onDelete()">
      </form-toolbar>

      <div class="form-content">
        <div class="form-section">
          <h3><i class="fa-solid fa-briefcase"></i> Job Details</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Title *</label>
              <input
                type="text"
                [(ngModel)]="record.Title"
                class="k-textbox"
                required />
            </div>

            <div class="form-field">
              <label>Department</label>
              <input
                type="text"
                [(ngModel)]="record.Department"
                class="k-textbox" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Description *</label>
              <textarea
                [(ngModel)]="record.Description"
                class="k-textarea"
                rows="6"
                required></textarea>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>Employment Type</label>
              <kendo-dropdownlist
                [(ngModel)]="record.EmploymentType"
                [data]="employmentTypes"
                [defaultItem]="'Select Type'">
              </kendo-dropdownlist>
            </div>

            <div class="form-field">
              <label>Location</label>
              <input
                type="text"
                [(ngModel)]="record.Location"
                class="k-textbox" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>Salary Range Min</label>
              <kendo-numerictextbox
                [(ngModel)]="record.SalaryRangeMin"
                [format]="'c0'"
                [decimals]="0">
              </kendo-numerictextbox>
            </div>

            <div class="form-field">
              <label>Salary Range Max</label>
              <kendo-numerictextbox
                [(ngModel)]="record.SalaryRangeMax"
                [format]="'c0'"
                [decimals]="0">
              </kendo-numerictextbox>
            </div>

            <div class="form-field">
              <label>Min Years Experience</label>
              <kendo-numerictextbox
                [(ngModel)]="record.MinimumYearsExperience"
                [format]="'n0'"
                [decimals]="0"
                [min]="0">
              </kendo-numerictextbox>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-list-check"></i> Requirements</h3>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Required Skills (JSON array)</label>
              <textarea
                [(ngModel)]="record.RequiredSkills"
                class="k-textarea"
                rows="3"
                placeholder='["JavaScript", "TypeScript", "Angular"]'></textarea>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Preferred Skills (JSON array)</label>
              <textarea
                [(ngModel)]="record.PreferredSkills"
                class="k-textarea"
                rows="3"
                placeholder='["Node.js", "SQL", "Docker"]'></textarea>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Evaluation Rubric (JSON object)</label>
              <textarea
                [(ngModel)]="record.EvaluationRubric"
                class="k-textarea"
                rows="4"
                placeholder='{"weights": {"skills": 0.35, "experience": 0.25}}'></textarea>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>Baseline Passing Score</label>
              <kendo-numerictextbox
                [(ngModel)]="record.BaselinePassingScore"
                [format]="'n2'"
                [decimals]="2"
                [min]="0"
                [max]="100">
              </kendo-numerictextbox>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-gear"></i> Configuration</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Status</label>
              <kendo-dropdownlist
                [(ngModel)]="record.Status"
                [data]="statusOptions"
                [defaultItem]="'Select Status'">
              </kendo-dropdownlist>
            </div>

            <div class="form-field">
              <label>Hiring Manager Email</label>
              <input
                type="email"
                [(ngModel)]="record.HiringManagerEmail"
                class="k-textbox" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>TypeForm ID</label>
              <input
                type="text"
                [(ngModel)]="record.TypeformID"
                class="k-textbox"
                placeholder="Form ID for application collection" />
            </div>

            <div class="form-field">
              <label>
                <input
                  type="checkbox"
                  [(ngModel)]="record.TypeformMonitorEnabled"
                  class="k-checkbox" />
                Enable TypeForm Monitoring
              </label>
            </div>

            <div class="form-field" *ngIf="record.TypeformMonitorEnabled">
              <label>Check Frequency (minutes)</label>
              <kendo-numerictextbox
                [(ngModel)]="record.TypeformCheckFrequencyMinutes"
                [format]="'n0'"
                [decimals]="0"
                [min]="5">
              </kendo-numerictextbox>
            </div>
          </div>

          <div class="form-row" *ngIf="record.Status === 'Open' || record.Status === 'Closed'">
            <div class="form-field">
              <label>Opened Date</label>
              <kendo-datepicker
                [(ngModel)]="record.OpenedDate">
              </kendo-datepicker>
            </div>

            <div class="form-field" *ngIf="record.Status === 'Closed'">
              <label>Closed Date</label>
              <kendo-datepicker
                [(ngModel)]="record.ClosedDate">
              </kendo-datepicker>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .job-requisition-form {
      padding: 20px;
    }

    .form-content {
      margin-top: 20px;
    }

    .form-section {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .form-section h3 {
      margin: 0 0 20px 0;
      color: #333;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .form-section h3 i {
      color: #0078d4;
    }

    .form-row {
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
    }

    .form-field {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .form-field.full-width {
      flex: 1 1 100%;
    }

    .form-field label {
      margin-bottom: 5px;
      font-weight: 500;
      color: #555;
    }

    .k-textbox, .k-textarea {
      width: 100%;
    }
  `]
})
export class JobRequisitionFormComponent extends BaseFormComponent {

  employmentTypes = ['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Internship'];
  statusOptions = ['Draft', 'Open', 'Paused', 'Filled', 'Closed', 'Canceled'];

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  override async ngOnInit() {
    await super.ngOnInit();
    this.cdr.detectChanges();
  }

  onCancel() {
    // Navigate back or close form
  }

  onDelete() {
    // Handle delete with confirmation
  }
}
