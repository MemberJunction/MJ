import { Component, OnInit, Input } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { RecruitingService } from '../services/recruiting.service';
import { BaseEntity } from '@memberjunction/core-entities';

interface PipelineStage {
  name: string;
  displayName: string;
  count: number;
  percentage: number;
  applications: BaseEntity[];
}

/**
 * Job-specific pipeline dashboard showing candidate funnel
 */
@Component({
  selector: 'app-job-pipeline-dashboard',
  template: `
    <div class="job-pipeline-dashboard">
      <div class="dashboard-header">
        <div class="header-content">
          <h2><i class="fa-solid fa-filter"></i> Candidate Pipeline</h2>
          <div class="job-selector" *ngIf="jobRequisitions.length > 0">
            <label>Select Job:</label>
            <kendo-dropdownlist
              [(ngModel)]="selectedJobID"
              [data]="jobRequisitions"
              [textField]="'Title'"
              [valueField]="'ID'"
              (valueChange)="onJobChange()"
              [defaultItem]="{Title: 'Select a job...', ID: null}">
            </kendo-dropdownlist>
          </div>
        </div>
      </div>

      <div class="job-details" *ngIf="selectedJob">
        <div class="detail-card">
          <div class="detail-label">Department</div>
          <div class="detail-value">{{ selectedJob.Get('Department') || 'N/A' }}</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">Status</div>
          <div class="detail-value">
            <span class="status-badge">{{ selectedJob.Get('Status') }}</span>
          </div>
        </div>
        <div class="detail-card">
          <div class="detail-label">Total Applications</div>
          <div class="detail-value highlight">{{ totalApplications }}</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">Avg Score</div>
          <div class="detail-value highlight">{{ averageScore | number:'1.1-1' }}</div>
        </div>
      </div>

      <div class="pipeline-funnel" *ngIf="pipelineStages.length > 0">
        <div *ngFor="let stage of pipelineStages; let i = index" class="funnel-stage">
          <div class="stage-header" (click)="toggleStage(stage)">
            <div class="stage-info">
              <h3>{{ stage.displayName }}</h3>
              <div class="stage-stats">
                <span class="stage-count">{{ stage.count }} candidates</span>
                <span class="stage-percentage">{{ stage.percentage | number:'1.0-0' }}% of total</span>
              </div>
            </div>
            <div class="stage-arrow">
              <i [class]="stage.expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
            </div>
          </div>

          <div class="stage-bar-container">
            <div class="stage-bar" [style.width.%]="stage.percentage">
              <div class="bar-fill"></div>
            </div>
          </div>

          <div class="stage-details" *ngIf="stage.expanded">
            <div class="candidate-list">
              <div *ngFor="let app of stage.applications" class="candidate-card">
                <div class="candidate-header">
                  <div class="candidate-name">
                    <i class="fa-solid fa-user"></i>
                    {{ app.Get('CandidateName') }}
                  </div>
                  <div class="candidate-status">
                    <span class="status-badge" [class]="'status-' + app.Get('Status')?.toLowerCase()">
                      {{ app.Get('Status') }}
                    </span>
                  </div>
                </div>
                <div class="candidate-scores">
                  <div class="score-item" *ngIf="app.Get('ResumeEvaluationScore') != null">
                    <span class="score-label">Resume:</span>
                    <span [class]="'score-value ' + getScoreClass(app.Get('ResumeEvaluationScore'))">
                      {{ app.Get('ResumeEvaluationScore') | number:'1.1-1' }}
                    </span>
                  </div>
                  <div class="score-item" *ngIf="app.Get('AudioEvaluationScore') != null">
                    <span class="score-label">Audio:</span>
                    <span [class]="'score-value ' + getScoreClass(app.Get('AudioEvaluationScore'))">
                      {{ app.Get('AudioEvaluationScore') | number:'1.1-1' }}
                    </span>
                  </div>
                </div>
                <div class="candidate-date">
                  Submitted: {{ app.Get('SubmittedAt') | date:'short' }}
                </div>
              </div>
            </div>
          </div>

          <div class="stage-connector" *ngIf="i < pipelineStages.length - 1">
            <i class="fa-solid fa-arrow-down"></i>
          </div>
        </div>
      </div>

      <div class="no-data" *ngIf="!selectedJobID && jobRequisitions.length > 0">
        <i class="fa-solid fa-filter"></i>
        <p>Select a job requisition to view the candidate pipeline</p>
      </div>

      <div class="no-data" *ngIf="selectedJobID && pipelineStages.length === 0">
        <i class="fa-solid fa-inbox"></i>
        <p>No applications yet for this position</p>
      </div>

      <div class="loading-indicator" *ngIf="loading">
        <kendo-loader type="infinite-spinner" size="large"></kendo-loader>
        <p>Loading pipeline data...</p>
      </div>
    </div>
  `,
  styles: [`
    .job-pipeline-dashboard {
      padding: 20px;
    }

    .dashboard-header {
      margin-bottom: 30px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }

    h2 {
      margin: 0;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .job-selector {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .job-selector label {
      font-weight: 500;
      color: #495057;
    }

    .job-selector kendo-dropdownlist {
      min-width: 300px;
    }

    .job-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }

    .detail-card {
      background: white;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .detail-label {
      font-size: 12px;
      color: #6c757d;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .detail-value {
      font-size: 20px;
      font-weight: 700;
      color: #333;
    }

    .detail-value.highlight {
      color: #0078d4;
    }

    .pipeline-funnel {
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .funnel-stage {
      margin-bottom: 20px;
      position: relative;
    }

    .stage-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: #f8f9fa;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .stage-header:hover {
      background: #e9ecef;
    }

    .stage-info h3 {
      margin: 0 0 8px 0;
      color: #333;
      font-size: 18px;
    }

    .stage-stats {
      display: flex;
      gap: 15px;
      font-size: 14px;
    }

    .stage-count {
      color: #495057;
      font-weight: 600;
    }

    .stage-percentage {
      color: #6c757d;
    }

    .stage-arrow {
      font-size: 20px;
      color: #6c757d;
    }

    .stage-bar-container {
      margin: 10px 0;
      padding: 0 20px;
    }

    .stage-bar {
      height: 40px;
      background: #e9ecef;
      border-radius: 20px;
      overflow: hidden;
      transition: width 0.3s ease;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0078d4, #005a9e);
    }

    .stage-details {
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      margin-top: 10px;
    }

    .candidate-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }

    .candidate-card {
      background: white;
      border-radius: 8px;
      padding: 15px;
      border: 1px solid #dee2e6;
      transition: box-shadow 0.2s;
    }

    .candidate-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .candidate-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 10px;
    }

    .candidate-name {
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .candidate-name i {
      color: #0078d4;
    }

    .candidate-scores {
      display: flex;
      gap: 15px;
      margin-bottom: 10px;
    }

    .score-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .score-label {
      font-size: 12px;
      color: #6c757d;
      font-weight: 500;
    }

    .score-value {
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .score-value.high { background: #d4edda; color: #155724; }
    .score-value.medium { background: #fff3cd; color: #856404; }
    .score-value.low { background: #f8d7da; color: #721c24; }

    .candidate-date {
      font-size: 12px;
      color: #6c757d;
    }

    .stage-connector {
      text-align: center;
      padding: 10px 0;
      color: #6c757d;
      font-size: 24px;
    }

    .status-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      background: #6c757d;
      color: white;
    }

    .no-data {
      text-align: center;
      padding: 60px 20px;
      color: #6c757d;
    }

    .no-data i {
      font-size: 48px;
      margin-bottom: 15px;
      opacity: 0.5;
    }

    .no-data p {
      font-size: 16px;
    }

    .loading-indicator {
      text-align: center;
      padding: 60px 20px;
      color: #6c757d;
    }

    .loading-indicator p {
      margin-top: 20px;
      font-size: 16px;
    }
  `]
})
export class JobPipelineDashboardComponent extends BaseDashboard implements OnInit {

  @Input() jobRequisitionID?: string;

  jobRequisitions: BaseEntity[] = [];
  selectedJobID: string | null = null;
  selectedJob: BaseEntity | null = null;
  applications: BaseEntity[] = [];
  pipelineStages: Array<PipelineStage & {expanded: boolean}> = [];
  totalApplications = 0;
  averageScore = 0;
  loading = false;

  private stageOrder = [
    { name: 'Application', displayName: 'Application Received' },
    { name: 'ResumeScreening', displayName: 'Resume Screening' },
    { name: 'AudioScreening', displayName: 'Audio Prescreening' },
    { name: 'PreliminaryInterview', displayName: 'Preliminary Interview' },
    { name: 'TechnicalInterview', displayName: 'Technical Interview' },
    { name: 'FinalInterview', displayName: 'Final Interview' },
    { name: 'Offer', displayName: 'Offer Stage' }
  ];

  constructor(private recruitingService: RecruitingService) {
    super();
  }

  async ngOnInit() {
    await this.loadJobs();
    if (this.jobRequisitionID) {
      this.selectedJobID = this.jobRequisitionID;
      await this.onJobChange();
    }
  }

  async loadJobs() {
    this.loading = true;
    this.jobRequisitions = await this.recruitingService.getJobRequisitions();
    this.loading = false;
  }

  async onJobChange() {
    if (!this.selectedJobID) {
      this.selectedJob = null;
      this.applications = [];
      this.pipelineStages = [];
      return;
    }

    this.loading = true;
    this.selectedJob = this.jobRequisitions.find(j => j.Get('ID') === this.selectedJobID) || null;
    this.applications = await this.recruitingService.getApplicationsByJob(this.selectedJobID);
    this.totalApplications = this.applications.length;
    this.averageScore = this.recruitingService.getAverageResumeScore(this.applications);
    this.buildPipelineStages();
    this.loading = false;
  }

  buildPipelineStages() {
    this.pipelineStages = this.stageOrder.map(stageInfo => {
      const stageApplications = this.applications.filter(
        app => app.Get('CurrentStage') === stageInfo.name
      );
      const count = stageApplications.length;
      const percentage = this.totalApplications > 0 ? (count / this.totalApplications) * 100 : 0;

      return {
        name: stageInfo.name,
        displayName: stageInfo.displayName,
        count,
        percentage,
        applications: stageApplications,
        expanded: false
      };
    }).filter(stage => stage.count > 0); // Only show stages with candidates
  }

  toggleStage(stage: PipelineStage & {expanded: boolean}) {
    stage.expanded = !stage.expanded;
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  protected async loadData(): Promise<void> {
    // Data is loaded via onJobChange
  }
}
