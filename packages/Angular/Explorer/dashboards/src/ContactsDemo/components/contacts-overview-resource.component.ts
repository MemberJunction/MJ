import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

/**
 * Tree-shaking prevention function
 */
export function LoadContactsOverviewResource() {
  // Force inclusion in production builds
}

interface ContactMetrics {
  totalContacts: number;
  activeContacts: number;
  inactiveContacts: number;
  totalActivities: number;
  recentActivities: number;
  avgSentimentScore: number;
  positiveContacts: number;
  negativeContacts: number;
  highEngagement: number;
  mediumEngagement: number;
  lowEngagement: number;
}

interface RecentActivity {
  ID: string;
  Subject: string;
  Description: string | null;
  ActivityDate: Date;
  Status: string;
  ContactName: string;
  ContactID: string;
  ActivityType: string;
  ActivityTypeIcon: string;
  UrgencyLevel: string | null;
}

interface ContactWithInsight {
  ID: string;
  FirstName: string;
  LastName: string;
  Email: string | null;
  Company: string | null;
  Status: string;
  EngagementLevel: string | null;
  SentimentTrend: string | null;
  ChurnRiskScore: number | null;
}

interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
}

/**
 * Contacts Overview Resource - displays contact management dashboard with AI insights
 */
@RegisterClass(BaseResourceComponent, 'ContactsOverviewResource')
@Component({
  selector: 'mj-contacts-overview-resource',
  templateUrl: './contacts-overview-resource.component.html',
  styleUrls: ['./contacts-overview-resource.component.css']
})
export class ContactsOverviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  public isLoading = true;
  public metrics: ContactMetrics = {
    totalContacts: 0,
    activeContacts: 0,
    inactiveContacts: 0,
    totalActivities: 0,
    recentActivities: 0,
    avgSentimentScore: 0,
    positiveContacts: 0,
    negativeContacts: 0,
    highEngagement: 0,
    mediumEngagement: 0,
    lowEngagement: 0
  };

  public sentimentDistribution: SentimentDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0
  };

  public recentActivities: RecentActivity[] = [];
  public topContacts: ContactWithInsight[] = [];
  public atRiskContacts: ContactWithInsight[] = [];

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');

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
      this.selectedStatus$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadFilteredData();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;

      const rv = new RunView();

      // Load all data in a single batch
      const [contactsResult, activitiesResult, sentimentsResult, insightsResult, activityTypesResult] = await rv.RunViews([
        {
          EntityName: 'Contacts__Demo',
          OrderBy: '__mj_UpdatedAt DESC',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activities__Demo',
          OrderBy: 'ActivityDate DESC',
          MaxRows: 100,
          ResultType: 'simple'
        },
        {
          EntityName: 'Activity Sentiments',
          OrderBy: 'AnalyzedAt DESC',
          ResultType: 'simple'
        },
        {
          EntityName: 'Contact Insights',
          OrderBy: 'LastAnalyzedAt DESC',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activity Types',
          ResultType: 'simple'
        }
      ]);

      if (!contactsResult.Success) {
        throw new Error('Failed to load contacts: ' + contactsResult.ErrorMessage);
      }

      const contacts = contactsResult.Results || [];
      const activities = activitiesResult.Success ? (activitiesResult.Results || []) : [];
      const sentiments = sentimentsResult.Success ? (sentimentsResult.Results || []) : [];
      const insights = insightsResult.Success ? (insightsResult.Results || []) : [];
      const activityTypes = activityTypesResult.Success ? (activityTypesResult.Results || []) : [];

      // Build activity type lookup
      const activityTypeMap = new Map<string, string>();
      for (const at of activityTypes) {
        activityTypeMap.set(at.ID, at.Name);
      }

      // Build contact lookup
      const contactMap = new Map<string, { FirstName: string; LastName: string }>();
      for (const c of contacts) {
        contactMap.set(c.ID, { FirstName: c.FirstName, LastName: c.LastName });
      }

      // Build insights lookup
      const insightsMap = new Map<string, { EngagementLevel: string | null; OverallSentimentTrend: string | null; ChurnRiskScore: number | null }>();
      for (const i of insights) {
        insightsMap.set(i.ContactID, {
          EngagementLevel: i.EngagementLevel,
          OverallSentimentTrend: i.OverallSentimentTrend,
          ChurnRiskScore: i.ChurnRiskScore
        });
      }

      this.calculateMetrics(contacts, activities, sentiments, insights);
      this.calculateSentimentDistribution(sentiments);
      this.buildRecentActivities(activities, contactMap, activityTypeMap);
      this.buildTopContacts(contacts, insightsMap);
      this.buildAtRiskContacts(contacts, insightsMap);

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading contacts overview data:', error);
      LogError('Failed to load contacts overview data', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private calculateMetrics(
    contacts: Record<string, unknown>[],
    activities: Record<string, unknown>[],
    sentiments: Record<string, unknown>[],
    insights: Record<string, unknown>[]
  ): void {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);

    // Calculate average sentiment score
    let totalSentimentScore = 0;
    let sentimentCount = 0;
    for (const s of sentiments) {
      if (s.SentimentScore != null) {
        totalSentimentScore += s.SentimentScore as number;
        sentimentCount++;
      }
    }

    // Count engagement levels from insights
    let highEngagement = 0;
    let mediumEngagement = 0;
    let lowEngagement = 0;
    let positiveContacts = 0;
    let negativeContacts = 0;

    for (const i of insights) {
      switch (i.EngagementLevel) {
        case 'High': highEngagement++; break;
        case 'Medium': mediumEngagement++; break;
        case 'Low': lowEngagement++; break;
      }
      switch (i.OverallSentimentTrend) {
        case 'Improving': positiveContacts++; break;
        case 'Declining': negativeContacts++; break;
      }
    }

    this.metrics = {
      totalContacts: contacts.length,
      activeContacts: contacts.filter(c => c.Status === 'Active').length,
      inactiveContacts: contacts.filter(c => c.Status === 'Inactive').length,
      totalActivities: activities.length,
      recentActivities: activities.filter(a => {
        const activityDate = a.ActivityDate ? new Date(a.ActivityDate as string) : null;
        return activityDate && activityDate > dayAgo;
      }).length,
      avgSentimentScore: sentimentCount > 0 ? Math.round((totalSentimentScore / sentimentCount) * 100) / 100 : 0,
      positiveContacts,
      negativeContacts,
      highEngagement,
      mediumEngagement,
      lowEngagement
    };
  }

  private calculateSentimentDistribution(sentiments: Record<string, unknown>[]): void {
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const s of sentiments) {
      switch (s.OverallSentiment) {
        case 'Positive': positive++; break;
        case 'Neutral': neutral++; break;
        case 'Negative': negative++; break;
      }
    }

    const total = positive + neutral + negative;
    this.sentimentDistribution = {
      positive: total > 0 ? Math.round((positive / total) * 100) : 0,
      neutral: total > 0 ? Math.round((neutral / total) * 100) : 0,
      negative: total > 0 ? Math.round((negative / total) * 100) : 0
    };
  }

  private buildRecentActivities(
    activities: Record<string, unknown>[],
    contactMap: Map<string, { FirstName: string; LastName: string }>,
    activityTypeMap: Map<string, string>
  ): void {
    this.recentActivities = activities.slice(0, 8).map(a => {
      const contact = contactMap.get(a.ContactID as string);
      const activityTypeName = activityTypeMap.get(a.ActivityTypeID as string) || 'Unknown';
      return {
        ID: a.ID as string,
        Subject: a.Subject as string,
        Description: a.Description as string | null,
        ActivityDate: new Date(a.ActivityDate as string),
        Status: a.Status as string,
        ContactName: contact ? `${contact.FirstName} ${contact.LastName}` : 'Unknown',
        ContactID: a.ContactID as string,
        ActivityType: activityTypeName,
        ActivityTypeIcon: this.activityTypeIcons[activityTypeName] || 'fa-solid fa-circle',
        UrgencyLevel: a.UrgencyLevel as string | null
      };
    });
  }

  private buildTopContacts(
    contacts: Record<string, unknown>[],
    insightsMap: Map<string, { EngagementLevel: string | null; OverallSentimentTrend: string | null; ChurnRiskScore: number | null }>
  ): void {
    // Get contacts with high engagement
    this.topContacts = contacts
      .map(c => {
        const insight = insightsMap.get(c.ID as string);
        return {
          ID: c.ID as string,
          FirstName: c.FirstName as string,
          LastName: c.LastName as string,
          Email: c.Email as string | null,
          Company: c.Company as string | null,
          Status: c.Status as string,
          EngagementLevel: insight?.EngagementLevel || null,
          SentimentTrend: insight?.OverallSentimentTrend || null,
          ChurnRiskScore: insight?.ChurnRiskScore || null
        };
      })
      .filter(c => c.EngagementLevel === 'High' || c.SentimentTrend === 'Improving')
      .slice(0, 5);
  }

  private buildAtRiskContacts(
    contacts: Record<string, unknown>[],
    insightsMap: Map<string, { EngagementLevel: string | null; OverallSentimentTrend: string | null; ChurnRiskScore: number | null }>
  ): void {
    // Get contacts with high churn risk or declining sentiment
    this.atRiskContacts = contacts
      .map(c => {
        const insight = insightsMap.get(c.ID as string);
        return {
          ID: c.ID as string,
          FirstName: c.FirstName as string,
          LastName: c.LastName as string,
          Email: c.Email as string | null,
          Company: c.Company as string | null,
          Status: c.Status as string,
          EngagementLevel: insight?.EngagementLevel || null,
          SentimentTrend: insight?.OverallSentimentTrend || null,
          ChurnRiskScore: insight?.ChurnRiskScore || null
        };
      })
      .filter(c => (c.ChurnRiskScore != null && c.ChurnRiskScore > 0.5) || c.SentimentTrend === 'Declining')
      .sort((a, b) => (b.ChurnRiskScore || 0) - (a.ChurnRiskScore || 0))
      .slice(0, 5);
  }

  private async loadFilteredData(): Promise<void> {
    const searchTerm = this.searchTerm$.value;
    const status = this.selectedStatus$.value;

    let extraFilter = '';
    const filters: string[] = [];

    if (status !== 'all') {
      filters.push(`Status = '${status}'`);
    }

    if (filters.length > 0) {
      extraFilter = filters.join(' AND ');
    }

    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'Contacts',
        ExtraFilter: extraFilter,
        OrderBy: '__mj_UpdatedAt DESC',
        UserSearchString: searchTerm,
        MaxRows: 100,
        ResultType: 'simple'
      });

      if (result.Success) {
        // Rebuild top contacts with filtered data
        const contacts = result.Results || [];
        const insightsMap = new Map<string, { EngagementLevel: string | null; OverallSentimentTrend: string | null; ChurnRiskScore: number | null }>();
        this.buildTopContacts(contacts, insightsMap);
        this.cdr.detectChanges();
      }
    } catch (error) {
      LogError('Failed to load filtered contacts', undefined, error);
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public onStatusFilterChange(status: string): void {
    this.selectedStatus$.next(status);
  }

  public openContact(contactId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: contactId }]);
    this.navigationService.OpenEntityRecord('Contacts', key);
  }

  public openActivity(activityId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: activityId }]);
    this.navigationService.OpenEntityRecord('Activities', key);
  }

  public getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'Active': return 'success';
      case 'Inactive': return 'error';
      case 'Completed': return 'success';
      case 'Planned': return 'info';
      case 'Cancelled': return 'warning';
      default: return 'info';
    }
  }

  public getEngagementColor(level: string | null): string {
    switch (level) {
      case 'High': return '#4CAF50';
      case 'Medium': return '#FF9800';
      case 'Low': return '#f44336';
      default: return '#9e9e9e';
    }
  }

  public getSentimentTrendIcon(trend: string | null): string {
    switch (trend) {
      case 'Improving': return 'fa-solid fa-arrow-trend-up';
      case 'Stable': return 'fa-solid fa-minus';
      case 'Declining': return 'fa-solid fa-arrow-trend-down';
      default: return 'fa-solid fa-question';
    }
  }

  public getSentimentTrendColor(trend: string | null): string {
    switch (trend) {
      case 'Improving': return '#4CAF50';
      case 'Stable': return '#2196F3';
      case 'Declining': return '#f44336';
      default: return '#9e9e9e';
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

  public formatChurnRisk(score: number | null): string {
    if (score == null) return 'N/A';
    return `${Math.round(score * 100)}%`;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Contacts Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-pie';
  }
}
