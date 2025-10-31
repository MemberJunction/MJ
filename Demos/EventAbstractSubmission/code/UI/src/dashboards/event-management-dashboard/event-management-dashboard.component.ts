import { Component, OnInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { RegisterClass } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { EventEntity, SubmissionEntity, SpeakerEntity } from 'mj_generatedentities';
import { EventService } from '../../services/event.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Event Management Dashboard for comprehensive conference oversight
 * with analytics, submission tracking, and speaker management.
 */
@Component({
  selector: 'mj-event-management-dashboard',
  templateUrl: './event-management-dashboard.component.html',
  styleUrls: ['./event-management-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'EventManagement')
export class EventManagementDashboardComponent extends BaseDashboard implements OnInit, OnDestroy {
  
  private destroy$ = new Subject<void>();
  
  // Loading states
  public isLoadingEvents = true;
  public isLoadingSubmissions = true;
  public isLoadingSpeakers = true;
  
  // Data collections
  public events: EventEntity[] = [];
  public selectedEvent: EventEntity | null = null;
  public submissions: SubmissionEntity[] = [];
  public speakers: SpeakerEntity[] = [];
  
  // Dashboard statistics
  public dashboardStats = {
    totalEvents: 0,
    activeEvents: 0,
    totalSubmissions: 0,
    pendingReviews: 0,
    totalSpeakers: 0,
    upcomingEvents: 0
  };
  
  // Chart data
  public submissionTrendData: any[] = [];
  public submissionTypeData: any[] = [];
  
  // Recent activity
  public recentSubmissions: SubmissionEntity[] = [];
  public recentActivity: any[] = [];
  
  constructor(
    private eventService: EventService,
    private notificationService: MJNotificationService
  ) {
    super();
  }
  
  /**
   * Initialize dashboard
   */
  protected initDashboard(): void {
    // Dashboard title and description come from Config.dashboard
    // No need to set them here
  }
  
  /**
   * Load dashboard data
   */
  protected loadData(): void {
    this.loadEvents();
  }

  /**
   * Component lifecycle
   */
  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    this.initDashboard();
    this.loadData();
    this.prepareChartData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  /**
   * Load events
   */
  private loadEvents(): void {
    this.isLoadingEvents = true;
    
    // Load events first
    this.eventService.getEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.events = events;
          this.calculateStatistics();
          if (this.events.length > 0) {
            this.selectEvent(this.events[0]);
          }
          this.isLoadingEvents = false;
        },
        error: (error) => {
          console.error('Error loading events:', error);
          this.isLoadingEvents = false;
          this.notificationService.CreateSimpleNotification('Failed to load events', 'error');
        }
      });
  }

  /**
   * Select an event for detailed view
   */
  public selectEvent(event: EventEntity): void {
    this.selectedEvent = event;
    this.loadSubmissions();
    this.loadSpeakers();
  }
  
  /**
   * Load submissions for selected event
   */
  private loadSubmissions(): void {
    if (!this.selectedEvent) return;
    
    this.isLoadingSubmissions = true;
    this.eventService.getEventSubmissions(this.selectedEvent.ID)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (submissions) => {
          this.submissions = submissions;
          this.recentSubmissions = submissions.slice(0, 5);
          this.isLoadingSubmissions = false;
          this.calculateStatistics();
        },
        error: (error) => {
          console.error('Error loading submissions:', error);
          this.isLoadingSubmissions = false;
          this.notificationService.CreateSimpleNotification('Failed to load submissions', 'error');
        }
      });
  }

  /**
   * Load speakers for selected event
   */
  private loadSpeakers(): void {
    if (!this.selectedEvent) return;
    
    this.isLoadingSpeakers = true;
    this.eventService.getEventSpeakers(this.selectedEvent.ID)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (speakers) => {
          this.speakers = speakers;
          this.isLoadingSpeakers = false;
          this.calculateStatistics();
        },
        error: (error) => {
          console.error('Error loading speakers:', error);
          this.isLoadingSpeakers = false;
          this.notificationService.CreateSimpleNotification('Failed to load speakers', 'error');
        }
      });
  }

  /**
   * Update dashboard statistics
   */
  private calculateStatistics(): void {
    const now = new Date();
    
    this.dashboardStats = {
      totalEvents: this.events.length,
      activeEvents: this.events.filter(e => e.Status === 'Open for Submissions' || e.Status === 'Review').length,
      totalSubmissions: this.submissions.length,
      pendingReviews: this.submissions.filter(s => s.Status === 'Under Review' || s.Status === 'New').length,
      totalSpeakers: this.speakers.length,
      upcomingEvents: this.events.filter(e => new Date(e.StartDate) > now).length
    };
  }
  
  /**
   * Prepare chart data for visualizations
   */
  private prepareChartData(): void {
    // Submission trend over time (mock data)
    this.submissionTrendData = [
      { month: 'Jan', submissions: 12 },
      { month: 'Feb', submissions: 19 },
      { month: 'Mar', submissions: 15 },
      { month: 'Apr', submissions: 25 },
      { month: 'May', submissions: 22 },
      { month: 'Jun', submissions: 30 }
    ];
    
    // Submission type distribution
    const typeCounts = this.submissions.reduce((acc, submission) => {
      const type = submission.SessionFormat || 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    this.submissionTypeData = Object.entries(typeCounts).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / this.submissions.length) * 100)
    }));
  }
  
  /**
   * Prepare recent activity data
   */
  private prepareRecentActivity(): void {
    // Mock activity data
    this.recentActivity = [
      { type: 'submission', message: 'New abstract submitted', time: '2 hours ago', icon: 'add_circle' },
      { type: 'review', message: 'Abstract approved', time: '4 hours ago', icon: 'check_circle' },
      { type: 'speaker', message: 'New speaker registered', time: '6 hours ago', icon: 'person_add' },
      { type: 'event', message: 'Event dates updated', time: '1 day ago', icon: 'event' },
      { type: 'review', message: 'Review assigned', time: '2 days ago', icon: 'assignment' }
    ];
  }
  
  /**
   * Create new event
   */
  public createEvent(): void {
    this.notificationService.CreateSimpleNotification('Create event functionality coming soon', 'info');
  }

  /**
   * Manage submissions for selected event
   */
  public manageSubmissions(): void {
    if (this.selectedEvent) {
      this.notificationService.CreateSimpleNotification(`Managing submissions for ${this.selectedEvent.Name}`, 'info');
    }
  }

  /**
   * Manage speakers for selected event
   */
  public manageSpeakers(): void {
    if (this.selectedEvent) {
      this.notificationService.CreateSimpleNotification(`Managing speakers for ${this.selectedEvent.Name}`, 'info');
    }
  }

  /**
   * Export event data
   */
  public exportData(): void {
    this.notificationService.CreateSimpleNotification('Export functionality coming soon', 'info');
  }

  /**
   * Get submission title for display
   */
  public getSubmissionTitle(submission: any): string {
    return submission?.SubmissionTitle || 'Untitled Submission';
  }

  /**
   * Format date for display
   */
  public formatDate(date: Date | string): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  /**
   * Calculate event duration
   */
  public getEventDuration(event: any): string {
    if (!event?.StartDate || !event?.EndDate) return 'N/A';
    const start = new Date(event.StartDate);
    const end = new Date(event.EndDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days === 1 ? '1 day' : `${days} days`;
  }

  /**
   * View event details
   */
  public viewEventDetails(event: EventEntity): void {
    this.selectEvent(event);
  }

  /**
   * Get status color for UI display
   */
  public getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return '#4caf50';
      case 'rejected':
        return '#f44336';
      case 'under review':
        return '#ff9800';
      case 'new':
        return '#2196f3';
      default:
        return '#9e9e9e';
    }
  }

  /**
   * Get status icon for UI display
   */
  public getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'open for submissions':
        return 'campaign';
      case 'review in progress':
        return 'rate_review';
      case 'completed':
        return 'check_circle';
      case 'planning':
        return 'event_note';
      default:
        return 'event';
    }
  }
}

/**
 * Tree shaking prevention function
 */
export function LoadEventManagementDashboard() {
  return EventManagementDashboardComponent;
}
