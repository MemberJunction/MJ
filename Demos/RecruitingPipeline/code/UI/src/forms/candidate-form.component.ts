import { Component, ChangeDetectorRef } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

/**
 * Form component for creating and editing candidate profiles
 */
@Component({
  selector: 'app-candidate-form',
  template: `
    <div class="candidate-form">
      <form-toolbar
        [record]="record"
        [editMode]="EditMode"
        (save)="SaveForm()"
        (cancel)="onCancel()"
        (delete)="onDelete()">
      </form-toolbar>

      <div class="form-content">
        <div class="form-section">
          <h3><i class="fa-solid fa-user"></i> Personal Information</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Full Name *</label>
              <input
                type="text"
                [(ngModel)]="record.FullName"
                class="k-textbox"
                required />
            </div>

            <div class="form-field">
              <label>Email *</label>
              <input
                type="email"
                [(ngModel)]="record.Email"
                class="k-textbox"
                required />
            </div>

            <div class="form-field">
              <label>Phone</label>
              <input
                type="tel"
                [(ngModel)]="record.Phone"
                class="k-textbox" />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-briefcase"></i> Professional Information</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Current Title</label>
              <input
                type="text"
                [(ngModel)]="record.CurrentTitle"
                class="k-textbox" />
            </div>

            <div class="form-field">
              <label>Current Company</label>
              <input
                type="text"
                [(ngModel)]="record.CurrentCompany"
                class="k-textbox" />
            </div>

            <div class="form-field">
              <label>Years of Experience</label>
              <kendo-numerictextbox
                [(ngModel)]="record.YearsExperience"
                [format]="'n0'"
                [decimals]="0"
                [min]="0">
              </kendo-numerictextbox>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>LinkedIn Profile</label>
              <input
                type="url"
                [(ngModel)]="record.LinkedInProfile"
                class="k-textbox"
                placeholder="https://linkedin.com/in/..." />
            </div>
          </div>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Resume URL</label>
              <input
                type="url"
                [(ngModel)]="record.ResumeURL"
                class="k-textbox"
                placeholder="URL to resume document" />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-list-check"></i> Skills</h3>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Skills List (JSON array)</label>
              <textarea
                [(ngModel)]="record.SkillsList"
                class="k-textarea"
                rows="4"
                placeholder='["JavaScript", "TypeScript", "Angular", "Node.js"]'></textarea>
              <small class="form-hint">Enter skills as a JSON array</small>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-note-sticky"></i> Notes</h3>

          <div class="form-row">
            <div class="form-field full-width">
              <label>Additional Notes</label>
              <textarea
                [(ngModel)]="record.Notes"
                class="k-textarea"
                rows="6"
                placeholder="Any additional information about the candidate..."></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../shared/form-styles.css'],
  styles: [`
    .form-hint {
      color: #6c757d;
      font-size: 12px;
      margin-top: 4px;
    }
  `]
})
export class CandidateFormComponent extends BaseFormComponent {

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
