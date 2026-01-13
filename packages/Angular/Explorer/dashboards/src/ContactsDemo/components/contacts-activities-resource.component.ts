import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { ActivityEditPanelComponent } from './activity-edit-panel.component';

/**
 * Tree-shaking prevention function
 */
export function LoadContactsActivitiesResource() {
  // Force inclusion in production builds
}

interface ActivityRow {
  ID: string;
  Subject: string;
  Description: string | null;
  RawContent: string | null;
  ActivityDate: Date;
  Status: string;
  DurationMinutes: number | null;
  ContactID: string;
  ContactName: string;
  ActivityTypeID: string;
  ActivityTypeName: string;
  ActivityTypeIcon: string;
  UrgencyLevel: string | null;
  UrgencyScore: number | null;
  RequiresFollowUp: boolean;
  FollowUpDate: Date | null;
  ProcessedByAI: boolean;
  SentimentScore: number | null;
  OverallSentiment: string | null;
}

interface ActivityTypeOption {
  text: string;
  value: string;
}

/**
 * Contacts Activities Resource - displays and manages activity timeline
 */
@RegisterClass(BaseResourceComponent, 'ContactsActivitiesResource')
@Component({
  selector: 'mj-contacts-activities-resource',
  templateUrl: './contacts-activities-resource.component.html',
  styleUrls: ['./contacts-activities-resource.component.css']
})
export class ContactsActivitiesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  @ViewChild('editPanel') editPanel!: ActivityEditPanelComponent;

  public isLoading = true;
  public isEditPanelOpen = false;
  public activities: ActivityRow[] = [];
  public filteredActivities: ActivityRow[] = [];
  public activityTypeOptions: ActivityTypeOption[] = [{ text: 'All Types', value: 'all' }];

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedType$ = new BehaviorSubject<string>('all');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedUrgency$ = new BehaviorSubject<string>('all');
  public selectedSentiment$ = new BehaviorSubject<string>('all');
  public followUpOnly$ = new BehaviorSubject<boolean>(false);

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Completed', value: 'Completed' },
    { text: 'Planned', value: 'Planned' },
    { text: 'Cancelled', value: 'Cancelled' }
  ];

  public urgencyOptions = [
    { text: 'All Urgency', value: 'all' },
    { text: 'Critical', value: 'Critical' },
    { text: 'High', value: 'High' },
    { text: 'Medium', value: 'Medium' },
    { text: 'Low', value: 'Low' }
  ];

  public sentimentOptions = [
    { text: 'All Sentiment', value: 'all' },
    { text: 'Positive', value: 'Positive' },
    { text: 'Neutral', value: 'Neutral' },
    { text: 'Negative', value: 'Negative' }
  ];

  private destroy$ = new Subject<void>();

  // Activity type icons mapping
  private activityTypeIcons: Record<string, string> = {
    'Phone Call': 'fa-solid fa-phone',
    'Email': 'fa-solid fa-envelope',
    'Meeting': 'fa-solid fa-users',
    'Note': 'fa-solid fa-sticky-note',
    'Task': 'fa-solid fa-check-square',
    'Chat': 'fa-solid fa-comments'
  };

  constructor(
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.setupFilters();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilters(): void {
    combineLatest([
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.selectedType$.pipe(distinctUntilChanged()),
      this.selectedStatus$.pipe(distinctUntilChanged()),
      this.selectedUrgency$.pipe(distinctUntilChanged()),
      this.selectedSentiment$.pipe(distinctUntilChanged()),
      this.followUpOnly$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;

      const rv = new RunView();

      const [activitiesResult, contactsResult, activityTypesResult, sentimentsResult] = await rv.RunViews([
        {
          EntityName: 'Activities__Demo',
          OrderBy: 'ActivityDate DESC',
          MaxRows: 500,
          ResultType: 'simple'
        },
        {
          EntityName: 'Contacts__Demo',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activity Types__Demo',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activity Sentiments__Demo',
          ResultType: 'simple'
        }
      ]);

      if (!activitiesResult.Success) {
        throw new Error('Failed to load activities: ' + activitiesResult.ErrorMessage);
      }

      const rawActivities = activitiesResult.Results || [];
      const contacts = contactsResult.Success ? (contactsResult.Results || []) : [];
      const activityTypes = activityTypesResult.Success ? (activityTypesResult.Results || []) : [];
      const sentiments = sentimentsResult.Success ? (sentimentsResult.Results || []) : [];

      // Build lookups
      const contactMap = new Map<string, { FirstName: string; LastName: string }>();
      for (const c of contacts) {
        contactMap.set(c.ID, { FirstName: c.FirstName, LastName: c.LastName });
      }

      const activityTypeMap = new Map<string, { Name: string; Icon: string }>();
      for (const at of activityTypes) {
        activityTypeMap.set(at.ID, {
          Name: at.Name,
          Icon: at.Icon || this.activityTypeIcons[at.Name] || 'fa-solid fa-circle'
        });
      }

      const sentimentMap = new Map<string, { SentimentScore: number; OverallSentiment: string }>();
      for (const s of sentiments) {
        sentimentMap.set(s.ActivityID, {
          SentimentScore: s.SentimentScore,
          OverallSentiment: s.OverallSentiment
        });
      }

      // Build activity type options
      this.activityTypeOptions = [
        { text: 'All Types', value: 'all' },
        ...activityTypes.map(at => ({ text: at.Name, value: at.ID }))
      ];

      // Transform activities
      this.activities = rawActivities.map(a => {
        const contact = contactMap.get(a.ContactID);
        const activityType = activityTypeMap.get(a.ActivityTypeID);
        const sentiment = sentimentMap.get(a.ID);

        return {
          ID: a.ID,
          Subject: a.Subject,
          Description: a.Description,
          RawContent: a.RawContent,
          ActivityDate: new Date(a.ActivityDate),
          Status: a.Status,
          DurationMinutes: a.DurationMinutes,
          ContactID: a.ContactID,
          ContactName: contact ? `${contact.FirstName} ${contact.LastName}` : 'Unknown',
          ActivityTypeID: a.ActivityTypeID,
          ActivityTypeName: activityType?.Name || 'Unknown',
          ActivityTypeIcon: activityType?.Icon || 'fa-solid fa-circle',
          UrgencyLevel: a.UrgencyLevel,
          UrgencyScore: a.UrgencyScore,
          RequiresFollowUp: a.RequiresFollowUp === true || a.RequiresFollowUp === 1,
          FollowUpDate: a.FollowUpDate ? new Date(a.FollowUpDate) : null,
          ProcessedByAI: a.ProcessedByAI === true || a.ProcessedByAI === 1,
          SentimentScore: sentiment?.SentimentScore ?? null,
          OverallSentiment: sentiment?.OverallSentiment ?? null
        };
      });

      this.applyFilters();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading activities data:', error);
      LogError('Failed to load activities data', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private applyFilters(): void {
    const searchTerm = this.searchTerm$.value.toLowerCase();
    const selectedType = this.selectedType$.value;
    const selectedStatus = this.selectedStatus$.value;
    const selectedUrgency = this.selectedUrgency$.value;
    const selectedSentiment = this.selectedSentiment$.value;
    const followUpOnly = this.followUpOnly$.value;

    this.filteredActivities = this.activities.filter(activity => {
      // Search filter
      if (searchTerm) {
        const matchesSearch =
          activity.Subject.toLowerCase().includes(searchTerm) ||
          (activity.Description?.toLowerCase().includes(searchTerm)) ||
          activity.ContactName.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (selectedType !== 'all' && activity.ActivityTypeID !== selectedType) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && activity.Status !== selectedStatus) {
        return false;
      }

      // Urgency filter
      if (selectedUrgency !== 'all' && activity.UrgencyLevel !== selectedUrgency) {
        return false;
      }

      // Sentiment filter
      if (selectedSentiment !== 'all' && activity.OverallSentiment !== selectedSentiment) {
        return false;
      }

      // Follow-up filter
      if (followUpOnly && !activity.RequiresFollowUp) {
        return false;
      }

      return true;
    });

    this.cdr.detectChanges();
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public onTypeChange(typeId: string): void {
    this.selectedType$.next(typeId);
  }

  public onStatusChange(status: string): void {
    this.selectedStatus$.next(status);
  }

  public onUrgencyChange(urgency: string): void {
    this.selectedUrgency$.next(urgency);
  }

  public onSentimentChange(sentiment: string): void {
    this.selectedSentiment$.next(sentiment);
  }

  public onFollowUpToggle(checked: boolean): void {
    this.followUpOnly$.next(checked);
  }

  public openActivity(activityId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: activityId }]);
    this.navigationService.OpenEntityRecord('Activities__Demo', key);
  }

  public openContact(contactId: string, event: Event): void {
    event.stopPropagation();
    const key = new CompositeKey([{ FieldName: 'ID', Value: contactId }]);
    this.navigationService.OpenEntityRecord('Contacts__Demo', key);
  }

  public getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'Completed': return 'success';
      case 'Planned': return 'info';
      case 'Cancelled': return 'warning';
      default: return 'info';
    }
  }

  public getUrgencyColor(level: string | null): string {
    switch (level) {
      case 'Critical': return '#d32f2f';
      case 'High': return '#f44336';
      case 'Medium': return '#FF9800';
      case 'Low': return '#4CAF50';
      default: return 'transparent';
    }
  }

  public getSentimentIcon(sentiment: string | null): string {
    switch (sentiment) {
      case 'Positive': return 'fa-solid fa-face-smile';
      case 'Neutral': return 'fa-solid fa-face-meh';
      case 'Negative': return 'fa-solid fa-face-frown';
      default: return 'fa-solid fa-question';
    }
  }

  public getSentimentColor(sentiment: string | null): string {
    switch (sentiment) {
      case 'Positive': return '#4CAF50';
      case 'Neutral': return '#9e9e9e';
      case 'Negative': return '#f44336';
      default: return '#9e9e9e';
    }
  }

  public formatDuration(minutes: number | null): string {
    if (minutes == null) return '';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Activities';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }

  public openNewActivityPanel(preselectedContactId?: string): void {
    this.isEditPanelOpen = true;
    this.cdr.detectChanges();
    if (this.editPanel) {
      this.editPanel.open(preselectedContactId);
    }
  }

  public onEditPanelClose(): void {
    this.isEditPanelOpen = false;
    this.cdr.detectChanges();
  }

  public onActivitySaved(): void {
    // Reload data to show the new activity
    this.loadData();
  }
}
