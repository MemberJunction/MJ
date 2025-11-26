import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RecruitingService } from '../services/recruiting.service';
import { BaseEntity } from '@memberjunction/core-entities';

/**
 * Form component for viewing and editing applications
 */
@Component({
  selector: 'app-application-form',
  template: `
    <div class="application-form">
      <form-toolbar
        [record]="record"
        [editMode]="EditMode"
        (save)="SaveForm()"
        (cancel)="onCancel()">
      </form-toolbar>

      <div class="form-content">
        <!-- Status Badge -->
        <div class="status-badge-container">
          <span [class]="'status-badge status-' + record.Status?.toLowerCase()">
            {{ record.Status }}
          </span>
          <span [class]="'stage-badge stage-' + record.CurrentStage?.toLowerCase()">
            {{ record.CurrentStage }}
          </span>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-user"></i> Candidate Information</h3>

          <div class="form-row" *ngIf="candidate">
            <div class="form-field">
              <label>Name</label>
              <div class="readonly-field">{{ candidate.Get('FullName') }}</div>
            </div>

            <div class="form-field">
              <label>Email</label>
              <div class="readonly-field">{{ candidate.Get('Email') }}</div>
            </div>

            <div class="form-field">
              <label>Phone</label>
              <div class="readonly-field">{{ candidate.Get('Phone') || 'N/A' }}</div>
            </div>
          </div>

          <div class="form-row" *ngIf="candidate">
            <div class="form-field">
              <label>Current Title</label>
              <div class="readonly-field">{{ candidate.Get('CurrentTitle') || 'N/A' }}</div>
            </div>

            <div class="form-field">
              <label>Current Company</label>
              <div class="readonly-field">{{ candidate.Get('CurrentCompany') || 'N/A' }}</div>
            </div>

            <div class="form-field">
              <label>Years Experience</label>
              <div class="readonly-field">{{ candidate.Get('YearsExperience') || 'N/A' }}</div>
            </div>
          </div>

          <div class="form-row" *ngIf="candidate && candidate.Get('ResumeURL')">
            <div class="form-field full-width">
              <label>Resume</label>
              <a [href]="candidate.Get('ResumeURL')" target="_blank" class="link-button">
                <i class="fa-solid fa-file-pdf"></i> View Resume
              </a>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-briefcase"></i> Job Details</h3>

          <div class="form-row" *ngIf="jobRequisition">
            <div class="form-field full-width">
              <label>Job Title</label>
              <div class="readonly-field">{{ jobRequisition.Get('Title') }}</div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>Submitted At</label>
              <div class="readonly-field">{{ record.SubmittedAt | date:'medium' }}</div>
            </div>

            <div class="form-field">
              <label>TypeForm Response ID</label>
              <div class="readonly-field">{{ record.TypeformResponseID }}</div>
            </div>
          </div>
        </div>

        <div class="form-section" *ngIf="record.ResumeEvaluationScore != null">
          <h3><i class="fa-solid fa-file-lines"></i> Resume Evaluation</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Score</label>
              <div class="score-display">
                <span [class]="'score-value ' + getScoreClass(record.ResumeEvaluationScore)">
                  {{ record.ResumeEvaluationScore | number:'1.1-1' }}
                </span>
                <span class="score-badge" [class.passed]="record.PassedResumeScreening">
                  {{ record.PassedResumeScreening ? 'PASSED' : 'FAILED' }}
                </span>
              </div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.ResumeEvaluationDimensions">
            <div class="form-field full-width">
              <label>Evaluation Dimensions</label>
              <div class="dimensions-display">
                <div *ngFor="let dim of parseDimensions(record.ResumeEvaluationDimensions)" class="dimension-item">
                  <span class="dimension-name">{{ dim.name }}</span>
                  <span class="dimension-score">{{ dim.score }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.ResumeEvaluationReasoning">
            <div class="form-field full-width">
              <label>Reasoning</label>
              <div class="reasoning-box">{{ record.ResumeEvaluationReasoning }}</div>
            </div>
          </div>
        </div>

        <div class="form-section" *ngIf="record.AudioAgentSessionID">
          <h3><i class="fa-solid fa-microphone"></i> Audio Prescreening</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Session ID</label>
              <div class="readonly-field">{{ record.AudioAgentSessionID }}</div>
            </div>

            <div class="form-field" *ngIf="record.AudioAgentSessionURL">
              <label>Session Link</label>
              <a [href]="record.AudioAgentSessionURL" target="_blank" class="link-button">
                <i class="fa-solid fa-link"></i> View Session
              </a>
            </div>
          </div>

          <div class="form-row" *ngIf="record.AudioEvaluationScore != null">
            <div class="form-field">
              <label>Score</label>
              <div class="score-display">
                <span [class]="'score-value ' + getScoreClass(record.AudioEvaluationScore)">
                  {{ record.AudioEvaluationScore | number:'1.1-1' }}
                </span>
                <span class="score-badge" [class.passed]="record.PassedAudioScreening">
                  {{ record.PassedAudioScreening ? 'PASSED' : 'FAILED' }}
                </span>
              </div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.AudioEvaluationDimensions">
            <div class="form-field full-width">
              <label>Evaluation Dimensions</label>
              <div class="dimensions-display">
                <div *ngFor="let dim of parseDimensions(record.AudioEvaluationDimensions)" class="dimension-item">
                  <span class="dimension-name">{{ dim.name }}</span>
                  <span class="dimension-score">{{ dim.score }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.AudioEvaluationReasoning">
            <div class="form-field full-width">
              <label>Reasoning</label>
              <div class="reasoning-box">{{ record.AudioEvaluationReasoning }}</div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.AudioRecordingURL || record.AudioTranscriptURL">
            <div class="form-field" *ngIf="record.AudioRecordingURL">
              <a [href]="record.AudioRecordingURL" target="_blank" class="link-button">
                <i class="fa-solid fa-volume-high"></i> Audio Recording
              </a>
            </div>

            <div class="form-field" *ngIf="record.AudioTranscriptURL">
              <a [href]="record.AudioTranscriptURL" target="_blank" class="link-button">
                <i class="fa-solid fa-file-lines"></i> Transcript
              </a>
            </div>
          </div>
        </div>

        <div class="form-section" *ngIf="record.InterviewSchedulingLink">
          <h3><i class="fa-solid fa-calendar"></i> Interview Scheduling</h3>

          <div class="form-row">
            <div class="form-field">
              <a [href]="record.InterviewSchedulingLink" target="_blank" class="link-button primary">
                <i class="fa-solid fa-calendar-days"></i> Schedule Interview
              </a>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3><i class="fa-solid fa-gear"></i> Application Status</h3>

          <div class="form-row">
            <div class="form-field">
              <label>Current Stage</label>
              <kendo-dropdownlist
                [(ngModel)]="record.CurrentStage"
                [data]="stageOptions">
              </kendo-dropdownlist>
            </div>

            <div class="form-field">
              <label>Status</label>
              <kendo-dropdownlist
                [(ngModel)]="record.Status"
                [data]="statusOptions">
              </kendo-dropdownlist>
            </div>
          </div>

          <div class="form-row" *ngIf="record.FinalDecision">
            <div class="form-field">
              <label>Final Decision</label>
              <div class="readonly-field">{{ record.FinalDecision }}</div>
            </div>

            <div class="form-field">
              <label>Decision Date</label>
              <div class="readonly-field">{{ record.FinalDecisionDate | date:'medium' }}</div>
            </div>
          </div>

          <div class="form-row" *ngIf="record.FinalDecisionNotes">
            <div class="form-field full-width">
              <label>Decision Notes</label>
              <div class="reasoning-box">{{ record.FinalDecisionNotes }}</div>
            </div>
          </div>
        </div>

        <div class="form-section" *ngIf="notes && notes.length > 0">
          <h3><i class="fa-solid fa-notes"></i> Activity Notes</h3>

          <div class="notes-list">
            <div *ngFor="let note of notes" class="note-item">
              <div class="note-header">
                <span class="note-type">{{ note.Get('NoteType') }}</span>
                <span class="note-date">{{ note.Get('__mj_CreatedAt') | date:'medium' }}</span>
              </div>
              <div class="note-text">{{ note.Get('NoteText') }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../shared/form-styles.css']
})
export class ApplicationFormComponent extends BaseFormComponent implements OnInit {

  candidate: BaseEntity | null = null;
  jobRequisition: BaseEntity | null = null;
  notes: BaseEntity[] = [];

  stageOptions = ['Application', 'ResumeScreening', 'AudioScreening', 'PreliminaryInterview',
                  'TechnicalInterview', 'FinalInterview', 'Offer', 'Closed'];
  statusOptions = ['New', 'Screening', 'AudioScheduled', 'AudioCompleted', 'InterviewScheduled',
                   'InterviewCompleted', 'OfferExtended', 'OfferAccepted', 'Rejected', 'Withdrawn'];

  constructor(
    private cdr: ChangeDetectorRef,
    private recruitingService: RecruitingService
  ) {
    super();
  }

  override async ngOnInit() {
    await super.ngOnInit();
    await this.loadRelatedData();
    this.cdr.detectChanges();
  }

  async loadRelatedData() {
    if (this.record && this.record.Get('ID')) {
      const applicationID = this.record.Get('ID') as string;

      // Load candidate
      const candidateID = this.record.Get('CandidateID') as string;
      if (candidateID) {
        const candidates = await this.recruitingService.getCandidates();
        this.candidate = candidates.find(c => c.Get('ID') === candidateID) || null;
      }

      // Load job requisition
      const jobID = this.record.Get('JobRequisitionID') as string;
      if (jobID) {
        const jobs = await this.recruitingService.getJobRequisitions();
        this.jobRequisition = jobs.find(j => j.Get('ID') === jobID) || null;
      }

      // Load notes
      this.notes = await this.recruitingService.getApplicationNotes(applicationID);
    }
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  parseDimensions(dimensionsJSON: string): Array<{name: string, score: number}> {
    try {
      const dims = JSON.parse(dimensionsJSON);
      return Object.keys(dims).map(key => ({
        name: this.formatDimensionName(key),
        score: dims[key]
      }));
    } catch {
      return [];
    }
  }

  formatDimensionName(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').trim()
              .replace(/^./, str => str.toUpperCase());
  }

  onCancel() {
    // Navigate back or close form
  }
}
