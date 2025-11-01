import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { SubmissionEntity, SpeakerEntity } from 'mj_generatedentities';
import { SubmissionService } from '../../services/submission.service';
import { SpeakerService } from '../../services/speaker.service';

interface SubmissionDashboardState {
  activeTab: string;
  selectedEventId?: string;
}

@Component({
  selector: 'mj-abstract-submission-dashboard',
  templateUrl: './abstract-submission-dashboard.component.html',
  styleUrls: ['./abstract-submission-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(Object, 'AbstractSubmission')
export class AbstractSubmissionDashboardComponent implements OnInit {

  public isLoading = false;
  public activeTab = 'overview';
  public selectedIndex = 0;

  public submissions: SubmissionEntity[] = [];
  public speakers: SpeakerEntity[] = [];

  // Statistics
  public totalSubmissions = 0;
  public acceptedCount = 0;
  public underReviewCount = 0;
  public rejectedCount = 0;

  constructor(
    private submissionService: SubmissionService,
    private speakerService: SpeakerService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadDashboardData();
  }

  async loadDashboardData(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();

    try {
      // Load all submissions
      this.submissions = await this.submissionService.getAllSubmissions();

      // Load all speakers
      this.speakers = await this.speakerService.getAllSpeakers();

      // Calculate statistics
      const stats = await this.submissionService.getSubmissionStatistics();
      this.totalSubmissions = stats.total;
      this.acceptedCount = stats.accepted;
      this.underReviewCount = stats.underReview;
      this.rejectedCount = stats.rejected;

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onTabSelect(event: any): void {
    this.selectedIndex = event.index;
    const tabs = ['overview', 'submissions', 'speakers'];
    this.activeTab = tabs[event.index] || 'overview';
    this.cdr.markForCheck();
  }

  async onRefresh(): Promise<void> {
    await this.loadDashboardData();
  }

  onViewSubmission(submission: SubmissionEntity): void {
    // TODO: Open submission details or form
    console.log('View submission:', submission);
  }

  onViewSpeaker(speaker: SpeakerEntity): void {
    // TODO: Open speaker details or form
    console.log('View speaker:', speaker);
  }

  get recentSubmissions(): SubmissionEntity[] {
    return this.submissions.slice(0, 10);
  }
}

export function LoadAbstractSubmissionDashboardComponent() {
  // Tree-shaking prevention
}
