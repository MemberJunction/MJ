import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { EventEntity } from 'mj_generatedentities';
import { EventService } from '../../services/event.service';
import { SubmissionService } from '../../services/submission.service';
import { SpeakerService } from '../../services/speaker.service';

interface EventDashboardState {
  lastRefresh?: Date;
}

@Component({
  selector: 'mj-event-management-dashboard',
  templateUrl: './event-management-dashboard.component.html',
  styleUrls: ['./event-management-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(Object, 'EventManagement')
export class EventManagementDashboardComponent implements OnInit {

  public isLoading = false;
  public events: EventEntity[] = [];

  // KPI values
  public totalEvents = 0;
  public totalSubmissions = 0;
  public totalSpeakers = 0;

  constructor(
    private eventService: EventService,
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
      // Load events
      this.events = await this.eventService.getEvents();
      this.totalEvents = this.events.length;

      // Load submission statistics
      const submissionStats = await this.submissionService.getSubmissionStatistics();
      this.totalSubmissions = submissionStats.total;

      // Load speaker count
      const speakers = await this.speakerService.getAllSpeakers();
      this.totalSpeakers = speakers.length;

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async onRefresh(): Promise<void> {
    await this.loadDashboardData();
  }

  onCreateEvent(): void {
    // TODO: Open event form in modal or navigate to form
    console.log('Create event');
  }

  onViewEvent(event: EventEntity): void {
    // TODO: Navigate to event details or open in modal
    console.log('View event:', event);
  }

  onEditEvent(event: EventEntity): void {
    // TODO: Open event form for editing
    console.log('Edit event:', event);
  }
}

export function LoadEventManagementDashboardComponent() {
  // Tree-shaking prevention
}
