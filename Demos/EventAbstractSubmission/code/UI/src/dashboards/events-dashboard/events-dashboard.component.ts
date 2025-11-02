import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { SharedService } from '@memberjunction/ng-shared';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { EventEntity, SubmissionEntity, SpeakerEntity } from 'mj_generatedentities';

interface DashboardStats {
  totalEvents: number;
  activeSubmissions: number;
  acceptanceRate: number;
  pendingReviews: number;
  avgAIScore: number;
}

interface EventSummary {
  event: EventEntity;
  submissionCount: number;
  daysUntilDeadline: number | null;
  urgency: 'high' | 'medium' | 'low' | 'none';
}

interface ActivityItem {
  type: 'submission' | 'status_change' | 'review';
  timestamp: Date;
  title: string;
  submissionId: string;
  icon: string;
  description: string;
}

interface SpeakerStats {
  speaker: SpeakerEntity;
  submissionCount: number;
  acceptanceRate: number;
}

@Component({
  selector: 'mj-events-dashboard',
  templateUrl: './events-dashboard.component.html',
  styleUrls: ['./events-dashboard.component.css']
})
@RegisterClass(BaseDashboard, '__EventsDashboard')
export class EventsDashboardComponent extends BaseDashboard implements OnInit {

  public isLoading = true;
  public stats: DashboardStats = {
    totalEvents: 0,
    activeSubmissions: 0,
    acceptanceRate: 0,
    pendingReviews: 0,
    avgAIScore: 0
  };

  public events: EventEntity[] = [];
  public submissions: SubmissionEntity[] = [];
  public speakers: SpeakerEntity[] = [];
  public eventSummaries: EventSummary[] = [];
  public recentActivity: ActivityItem[] = [];
  public topSpeakers: SpeakerStats[] = [];

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
  }

  protected initDashboard(): void {
    // Initialization logic
  }

  protected async loadData(): Promise<void> {
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      await this.loadAllData();
      this.calculateStats();
      this.buildEventSummaries();
      this.buildRecentActivity();
      this.buildTopSpeakers();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.sharedService.CreateSimpleNotification('Error loading dashboard', 'error', 3000);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      this.LoadingComplete.emit();
    }
  }

  private async loadAllData(): Promise<void> {
    const rv = new RunView();
    const md = new Metadata();

    const [eventsResult, submissionsResult, speakersResult] = await rv.RunViews([
      {
        EntityName: 'Events',
        ExtraFilter: '',
        OrderBy: 'StartDate DESC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Submissions',
        ExtraFilter: '',
        OrderBy: 'SubmittedAt DESC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Speakers',
        ExtraFilter: '',
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      }
    ], md.CurrentUser);

    if (eventsResult.Success && eventsResult.Results) {
      this.events = eventsResult.Results as EventEntity[];
    }

    if (submissionsResult.Success && submissionsResult.Results) {
      this.submissions = submissionsResult.Results as SubmissionEntity[];
    }

    if (speakersResult.Success && speakersResult.Results) {
      this.speakers = speakersResult.Results as SpeakerEntity[];
    }
  }

  private calculateStats(): void {
    this.stats.totalEvents = this.events.length;

    this.stats.activeSubmissions = this.submissions.filter(s =>
      s.Status === 'Under Review' || s.Status === 'Analyzing' || s.Status === 'Passed Initial'
    ).length;

    const reviewedSubmissions = this.submissions.filter(s =>
      s.Status === 'Accepted' || s.Status === 'Rejected'
    );
    const acceptedCount = this.submissions.filter(s => s.Status === 'Accepted').length;
    this.stats.acceptanceRate = reviewedSubmissions.length > 0
      ? Math.round((acceptedCount / reviewedSubmissions.length) * 100)
      : 0;

    this.stats.pendingReviews = this.submissions.filter(s =>
      s.Status === 'Under Review'
    ).length;

    const scoresArray = this.submissions
      .filter(s => s.AIEvaluationScore != null)
      .map(s => s.AIEvaluationScore as number);
    this.stats.avgAIScore = scoresArray.length > 0
      ? Math.round(scoresArray.reduce((a, b) => a + b, 0) / scoresArray.length)
      : 0;
  }

  private buildEventSummaries(): void {
    this.eventSummaries = this.events.map(event => {
      const submissionCount = this.submissions.filter(s => s.EventID === event.ID).length;
      const daysUntilDeadline = this.calculateDaysUntilDeadline(event.SubmissionDeadline);
      const urgency = this.calculateUrgency(daysUntilDeadline, event.Status);

      return {
        event,
        submissionCount,
        daysUntilDeadline,
        urgency
      };
    }).sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2, none: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  private calculateDaysUntilDeadline(deadline: Date | null): number | null {
    if (!deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateUrgency(days: number | null, status: string | null): 'high' | 'medium' | 'low' | 'none' {
    if (!days || status !== 'Open for Submissions') return 'none';
    if (days < 0) return 'high'; // Past deadline
    if (days <= 7) return 'high';
    if (days <= 30) return 'medium';
    return 'low';
  }

  private buildRecentActivity(): void {
    const activities: ActivityItem[] = [];

    // Add recent submissions
    this.submissions.slice(0, 10).forEach(submission => {
      activities.push({
        type: 'submission',
        timestamp: new Date(submission.SubmittedAt),
        title: submission.SubmissionTitle || 'Untitled Submission',
        submissionId: submission.ID,
        icon: 'fa-file-alt',
        description: `New submission received`
      });
    });

    // Sort by timestamp descending
    this.recentActivity = activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 8);
  }

  private buildTopSpeakers(): void {
    const speakerMap = new Map<string, { speaker: SpeakerEntity; submissions: SubmissionEntity[] }>();

    // Group submissions by speaker
    this.submissions.forEach(submission => {
      const speaker = this.speakers.find(s => {
        // Find speakers linked through SubmissionSpeaker junction (would need to load that)
        // For now, simplified - in real impl would need SubmissionSpeaker data
        return false; // Placeholder
      });

      if (speaker) {
        if (!speakerMap.has(speaker.ID)) {
          speakerMap.set(speaker.ID, { speaker, submissions: [] });
        }
        speakerMap.get(speaker.ID)!.submissions.push(submission);
      }
    });

    // Calculate stats for each speaker
    this.topSpeakers = Array.from(speakerMap.values())
      .map(({ speaker, submissions }) => {
        const acceptedCount = submissions.filter(s => s.Status === 'Accepted').length;
        const acceptanceRate = submissions.length > 0
          ? Math.round((acceptedCount / submissions.length) * 100)
          : 0;

        return {
          speaker,
          submissionCount: submissions.length,
          acceptanceRate
        };
      })
      .sort((a, b) => b.submissionCount - a.submissionCount)
      .slice(0, 5);
  }

  public openEventRecord(eventId: string): void {
    this.sharedService.OpenEntityRecord('Events', CompositeKey.FromID(eventId));
  }

  public openSubmissionRecord(submissionId: string): void {
    this.sharedService.OpenEntityRecord('Submissions', CompositeKey.FromID(submissionId));
  }

  public openSpeakerRecord(speakerId: string): void {
    this.sharedService.OpenEntityRecord('Speakers', CompositeKey.FromID(speakerId));
  }

  public refreshDashboard(): void {
    this.Refresh();
  }

  public getStatusBadgeClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Planning': 'badge-info',
      'Open for Submissions': 'badge-success',
      'Submissions Closed': 'badge-warning',
      'Review in Progress': 'badge-warning',
      'Completed': 'badge-secondary',
      'Cancelled': 'badge-danger'
    };
    return statusMap[status] || 'badge-default';
  }

  public getSubmissionStatusBadgeClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'New': 'badge-info',
      'Analyzing': 'badge-warning',
      'Passed Initial': 'badge-success',
      'Failed Initial': 'badge-danger',
      'Under Review': 'badge-warning',
      'Accepted': 'badge-success',
      'Rejected': 'badge-danger',
      'Waitlisted': 'badge-secondary',
      'Resubmitted': 'badge-info'
    };
    return statusMap[status] || 'badge-default';
  }

  public formatNumber(num: number): string {
    return num.toLocaleString();
  }

  public getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    return new Date(date).toLocaleDateString();
  }

  // Template helper methods for filtering submissions
  public getSubmissionsByStatus(status: string): number {
    return this.submissions.filter(s => s.Status === status).length;
  }

  public getEvaluatedSubmissionsCount(): number {
    return this.submissions.filter(s => s.AIEvaluationScore != null).length;
  }

  public getHighScoreCount(): number {
    return this.submissions.filter(s => s.AIEvaluationScore && s.AIEvaluationScore >= 80).length;
  }

  public getScoreRangeCount(min: number, max: number): number {
    return this.submissions.filter(s =>
      s.AIEvaluationScore != null &&
      s.AIEvaluationScore >= min &&
      s.AIEvaluationScore <= max
    ).length;
  }

  public getScoreRangePercentage(min: number, max: number): number {
    const total = this.getEvaluatedSubmissionsCount();
    if (total === 0) return 0;
    return (this.getScoreRangeCount(min, max) / total) * 100;
  }
}

export function LoadEventsDashboardComponent() {
  // Tree-shaking prevention
}
