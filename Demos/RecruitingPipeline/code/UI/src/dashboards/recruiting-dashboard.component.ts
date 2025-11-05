import { Component, OnInit } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { RecruitingService } from '../services/recruiting.service';
import { BaseEntity } from '@memberjunction/core-entities';

interface DashboardMetrics {
  openPositions: number;
  totalApplications: number;
  applicationsThisMonth: number;
  averageResumeScore: number;
  averageAudioScore: number;
  applicationsByStage: Map<string, number>;
  applicationsByStatus: Map<string, number>;
  recentApplications: BaseEntity[];
  topPerformers: Array<{candidate: string, score: number, jobTitle: string}>;
}

/**
 * Main recruiting pipeline dashboard showing overview metrics
 */
@Component({
  selector: 'app-recruiting-dashboard',
  template: `
    <div class="recruiting-dashboard">
      <h2><i class="fa-solid fa-chart-line"></i> Recruiting Pipeline Dashboard</h2>

      <div class="metrics-grid" *ngIf="metrics">
        <div class="metric-card primary">
          <div class="metric-icon">
            <i class="fa-solid fa-briefcase"></i>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ metrics.openPositions }}</div>
            <div class="metric-label">Open Positions</div>
          </div>
        </div>

        <div class="metric-card success">
          <div class="metric-icon">
            <i class="fa-solid fa-file-lines"></i>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ metrics.totalApplications }}</div>
            <div class="metric-label">Total Applications</div>
          </div>
        </div>

        <div class="metric-card info">
          <div class="metric-icon">
            <i class="fa-solid fa-calendar"></i>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ metrics.applicationsThisMonth }}</div>
            <div class="metric-label">This Month</div>
          </div>
        </div>

        <div class="metric-card warning">
          <div class="metric-icon">
            <i class="fa-solid fa-star"></i>
          </div>
          <div class="metric-content">
            <div class="metric-value">{{ metrics.averageResumeScore | number:'1.1-1' }}</div>
            <div class="metric-label">Avg Resume Score</div>
          </div>
        </div>
      </div>

      <div class="dashboard-sections" *ngIf="metrics">
        <div class="section">
          <h3><i class="fa-solid fa-funnel"></i> Applications by Stage</h3>
          <div class="chart-container">
            <div class="stage-chart">
              <div *ngFor="let stage of getStageArray()" class="stage-bar">
                <div class="stage-label">{{ formatStageName(stage.name) }}</div>
                <div class="stage-bar-container">
                  <div class="stage-bar-fill" [style.width.%]="getStagePercentage(stage.count)">
                    <span class="stage-count">{{ stage.count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h3><i class="fa-solid fa-chart-pie"></i> Applications by Status</h3>
          <div class="status-grid">
            <div *ngFor="let status of getStatusArray()" class="status-item">
              <div class="status-badge" [class]="'status-' + status.name.toLowerCase()">
                {{ formatStatusName(status.name) }}
              </div>
              <div class="status-count">{{ status.count }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-sections" *ngIf="metrics">
        <div class="section full-width">
          <h3><i class="fa-solid fa-trophy"></i> Top Candidates</h3>
          <div class="top-performers-list">
            <div *ngFor="let performer of metrics.topPerformers" class="performer-item">
              <div class="performer-rank">
                <i class="fa-solid fa-medal"></i>
              </div>
              <div class="performer-info">
                <div class="performer-name">{{ performer.candidate }}</div>
                <div class="performer-job">{{ performer.jobTitle }}</div>
              </div>
              <div class="performer-score">
                <span class="score-value">{{ performer.score | number:'1.1-1' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-sections" *ngIf="metrics">
        <div class="section full-width">
          <h3><i class="fa-solid fa-clock"></i> Recent Applications</h3>
          <div class="recent-applications-table">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Job Title</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Resume Score</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let app of metrics.recentApplications">
                  <td>{{ app.Get('CandidateName') }}</td>
                  <td>{{ app.Get('JobTitle') }}</td>
                  <td>
                    <span class="stage-badge">{{ formatStageName(app.Get('CurrentStage')) }}</span>
                  </td>
                  <td>
                    <span class="status-badge" [class]="'status-' + app.Get('Status')?.toLowerCase()">
                      {{ formatStatusName(app.Get('Status')) }}
                    </span>
                  </td>
                  <td>
                    <span *ngIf="app.Get('ResumeEvaluationScore') != null" [class]="'score-badge ' + getScoreClass(app.Get('ResumeEvaluationScore'))">
                      {{ app.Get('ResumeEvaluationScore') | number:'1.1-1' }}
                    </span>
                    <span *ngIf="app.Get('ResumeEvaluationScore') == null">-</span>
                  </td>
                  <td>{{ app.Get('SubmittedAt') | date:'short' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="loading-indicator" *ngIf="!metrics">
        <kendo-loader type="infinite-spinner" size="large"></kendo-loader>
        <p>Loading dashboard data...</p>
      </div>
    </div>
  `,
  styles: [`
    .recruiting-dashboard {
      padding: 20px;
    }

    h2 {
      margin: 0 0 20px 0;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }

    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .metric-icon {
      font-size: 40px;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    }

    .metric-card.primary .metric-icon {
      background: #e3f2fd;
      color: #0078d4;
    }

    .metric-card.success .metric-icon {
      background: #e8f5e9;
      color: #28a745;
    }

    .metric-card.info .metric-icon {
      background: #e1f5fe;
      color: #17a2b8;
    }

    .metric-card.warning .metric-icon {
      background: #fff3e0;
      color: #ffc107;
    }

    .metric-content {
      flex: 1;
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      color: #333;
      line-height: 1;
    }

    .metric-label {
      font-size: 14px;
      color: #6c757d;
      margin-top: 5px;
    }

    .dashboard-sections {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .section {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .section.full-width {
      grid-column: 1 / -1;
    }

    .section h3 {
      margin: 0 0 20px 0;
      color: #333;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 15px;
      border-bottom: 2px solid #f0f0f0;
    }

    .stage-chart {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .stage-bar {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stage-label {
      min-width: 150px;
      font-weight: 500;
      color: #495057;
      font-size: 14px;
    }

    .stage-bar-container {
      flex: 1;
      height: 30px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .stage-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0078d4, #005a9e);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
      transition: width 0.3s ease;
    }

    .stage-count {
      color: white;
      font-weight: 600;
      font-size: 14px;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 15px;
    }

    .status-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      text-align: center;
    }

    .status-count {
      font-size: 24px;
      font-weight: 700;
      color: #333;
      margin-top: 10px;
    }

    .top-performers-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .performer-item {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      transition: background 0.2s;
    }

    .performer-item:hover {
      background: #e9ecef;
    }

    .performer-rank {
      font-size: 24px;
      color: #ffc107;
    }

    .performer-info {
      flex: 1;
    }

    .performer-name {
      font-weight: 600;
      color: #333;
      font-size: 16px;
    }

    .performer-job {
      color: #6c757d;
      font-size: 14px;
      margin-top: 2px;
    }

    .performer-score .score-value {
      font-size: 24px;
      font-weight: 700;
      color: #28a745;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
    }

    .data-table th {
      text-align: left;
      padding: 12px;
      background: #f8f9fa;
      font-weight: 600;
      color: #495057;
      border-bottom: 2px solid #dee2e6;
    }

    .data-table td {
      padding: 12px;
      border-bottom: 1px solid #dee2e6;
    }

    .data-table tbody tr:hover {
      background: #f8f9fa;
    }

    .status-badge, .stage-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      display: inline-block;
    }

    .score-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .score-badge.high { background: #d4edda; color: #155724; }
    .score-badge.medium { background: #fff3cd; color: #856404; }
    .score-badge.low { background: #f8d7da; color: #721c24; }

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
export class RecruitingDashboardComponent extends BaseDashboard implements OnInit {

  metrics: DashboardMetrics | null = null;

  constructor(private recruitingService: RecruitingService) {
    super();
  }

  async ngOnInit() {
    await this.loadData();
  }

  protected async loadData(): Promise<void> {
    const data = await this.recruitingService.loadDashboardData();

    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

    this.metrics = {
      openPositions: data.jobRequisitions.filter(j => j.Get('Status') === 'Open').length,
      totalApplications: data.applications.length,
      applicationsThisMonth: data.applications.filter(a =>
        new Date(a.Get('SubmittedAt') as string) >= monthAgo
      ).length,
      averageResumeScore: this.recruitingService.getAverageResumeScore(data.applications),
      averageAudioScore: this.recruitingService.getAverageAudioScore(data.applications),
      applicationsByStage: this.recruitingService.getApplicationStatsByStage(data.applications),
      applicationsByStatus: this.recruitingService.getApplicationStatsByStatus(data.applications),
      recentApplications: data.applications.slice(0, 10),
      topPerformers: this.getTopPerformers(data.applications).slice(0, 5)
    };
  }

  getStageArray(): Array<{name: string, count: number}> {
    if (!this.metrics) return [];
    return Array.from(this.metrics.applicationsByStage.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count);
  }

  getStatusArray(): Array<{name: string, count: number}> {
    if (!this.metrics) return [];
    return Array.from(this.metrics.applicationsByStatus.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count);
  }

  getStagePercentage(count: number): number {
    if (!this.metrics || this.metrics.totalApplications === 0) return 0;
    return (count / this.metrics.totalApplications) * 100;
  }

  getTopPerformers(applications: BaseEntity[]): Array<{candidate: string, score: number, jobTitle: string}> {
    return applications
      .filter(app => app.Get('ResumeEvaluationScore') != null)
      .map(app => ({
        candidate: app.Get('CandidateName') as string,
        score: app.Get('ResumeEvaluationScore') as number,
        jobTitle: app.Get('JobTitle') as string
      }))
      .sort((a, b) => b.score - a.score);
  }

  formatStageName(stage: string): string {
    return stage.replace(/([A-Z])/g, ' $1').trim();
  }

  formatStatusName(status: string): string {
    return status.replace(/([A-Z])/g, ' $1').trim();
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }
}
