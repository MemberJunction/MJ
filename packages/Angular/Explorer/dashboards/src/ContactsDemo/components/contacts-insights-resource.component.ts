import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';

/**
 * Tree-shaking prevention function
 */
export function LoadContactsInsightsResource() {
  // Force inclusion in production builds
}

interface ContactInsightRow {
  ID: string;
  ContactID: string;
  ContactName: string;
  Company: string | null;
  Email: string | null;
  OverallSentimentTrend: string | null;
  AverageSentimentScore: number | null;
  EngagementLevel: string | null;
  ChurnRiskScore: number | null;
  TopTopics: string[];
  LastAnalyzedAt: Date;
  ActivityCount: number;
}

interface TopicSummary {
  name: string;
  count: number;
  percentage: number;
}

interface EngagementSummary {
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

interface SentimentSummary {
  improving: number;
  stable: number;
  declining: number;
  unknown: number;
}

/**
 * Contacts Insights Resource - AI-generated insights dashboard
 */
@RegisterClass(BaseResourceComponent, 'ContactsInsightsResource')
@Component({
  selector: 'mj-contacts-insights-resource',
  templateUrl: './contacts-insights-resource.component.html',
  styleUrls: ['./contacts-insights-resource.component.css']
})
export class ContactsInsightsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  public isLoading = true;
  public insights: ContactInsightRow[] = [];
  public topTopics: TopicSummary[] = [];
  public engagementSummary: EngagementSummary = { high: 0, medium: 0, low: 0, unknown: 0 };
  public sentimentSummary: SentimentSummary = { improving: 0, stable: 0, declining: 0, unknown: 0 };
  public atRiskCount = 0;
  public analyzedCount = 0;
  public avgChurnRisk = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;

      const rv = new RunView();

      const [insightsResult, contactsResult, activitiesResult, topicsResult, activityTopicsResult] = await rv.RunViews([
        {
          EntityName: 'Contact Insights',
          OrderBy: 'LastAnalyzedAt DESC',
          ResultType: 'simple'
        },
        {
          EntityName: 'Contacts',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activities',
          ResultType: 'simple'
        },
        {
          EntityName: 'Topics',
          ResultType: 'simple'
        },
        {
          EntityName: 'Activity Topics',
          ResultType: 'simple'
        }
      ]);

      const rawInsights = insightsResult.Success ? (insightsResult.Results || []) : [];
      const contacts = contactsResult.Success ? (contactsResult.Results || []) : [];
      const activities = activitiesResult.Success ? (activitiesResult.Results || []) : [];
      const topics = topicsResult.Success ? (topicsResult.Results || []) : [];
      const activityTopics = activityTopicsResult.Success ? (activityTopicsResult.Results || []) : [];

      // Build lookups
      const contactMap = new Map<string, { FirstName: string; LastName: string; Company: string | null; Email: string | null }>();
      for (const c of contacts) {
        contactMap.set(c.ID, {
          FirstName: c.FirstName,
          LastName: c.LastName,
          Company: c.Company,
          Email: c.Email
        });
      }

      const topicMap = new Map<string, string>();
      for (const t of topics) {
        topicMap.set(t.ID, t.Name);
      }

      // Count activities per contact
      const activityCountMap = new Map<string, number>();
      for (const a of activities) {
        const count = activityCountMap.get(a.ContactID) || 0;
        activityCountMap.set(a.ContactID, count + 1);
      }

      // Count topic occurrences
      const topicCounts = new Map<string, number>();
      for (const at of activityTopics) {
        const topicName = topicMap.get(at.TopicID);
        if (topicName) {
          const count = topicCounts.get(topicName) || 0;
          topicCounts.set(topicName, count + 1);
        }
      }

      // Transform insights
      this.insights = rawInsights.map(i => {
        const contact = contactMap.get(i.ContactID);
        let topTopicsArray: string[] = [];

        if (i.TopTopics) {
          try {
            topTopicsArray = JSON.parse(i.TopTopics);
          } catch {
            topTopicsArray = [];
          }
        }

        return {
          ID: i.ID,
          ContactID: i.ContactID,
          ContactName: contact ? `${contact.FirstName} ${contact.LastName}` : 'Unknown',
          Company: contact?.Company || null,
          Email: contact?.Email || null,
          OverallSentimentTrend: i.OverallSentimentTrend,
          AverageSentimentScore: i.AverageSentimentScore,
          EngagementLevel: i.EngagementLevel,
          ChurnRiskScore: i.ChurnRiskScore,
          TopTopics: topTopicsArray,
          LastAnalyzedAt: new Date(i.LastAnalyzedAt),
          ActivityCount: activityCountMap.get(i.ContactID) || 0
        };
      });

      // Calculate summaries
      this.calculateSummaries();
      this.buildTopTopics(topicCounts);

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading insights data:', error);
      LogError('Failed to load insights data', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private calculateSummaries(): void {
    let high = 0, medium = 0, low = 0, unknownEngagement = 0;
    let improving = 0, stable = 0, declining = 0, unknownSentiment = 0;
    let atRisk = 0;
    let totalChurnRisk = 0;
    let churnRiskCount = 0;

    for (const insight of this.insights) {
      // Engagement
      switch (insight.EngagementLevel) {
        case 'High': high++; break;
        case 'Medium': medium++; break;
        case 'Low': low++; break;
        default: unknownEngagement++; break;
      }

      // Sentiment
      switch (insight.OverallSentimentTrend) {
        case 'Improving': improving++; break;
        case 'Stable': stable++; break;
        case 'Declining': declining++; break;
        default: unknownSentiment++; break;
      }

      // Churn risk
      if (insight.ChurnRiskScore != null) {
        totalChurnRisk += insight.ChurnRiskScore;
        churnRiskCount++;
        if (insight.ChurnRiskScore > 0.5) {
          atRisk++;
        }
      }
    }

    this.engagementSummary = { high, medium, low, unknown: unknownEngagement };
    this.sentimentSummary = { improving, stable, declining, unknown: unknownSentiment };
    this.atRiskCount = atRisk;
    this.analyzedCount = this.insights.length;
    this.avgChurnRisk = churnRiskCount > 0 ? Math.round((totalChurnRisk / churnRiskCount) * 100) : 0;
  }

  private buildTopTopics(topicCounts: Map<string, number>): void {
    const totalTopics = Array.from(topicCounts.values()).reduce((sum, count) => sum + count, 0);

    this.topTopics = Array.from(topicCounts.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalTopics > 0 ? Math.round((count / totalTopics) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  public openContact(contactId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: contactId }]);
    this.navigationService.OpenEntityRecord('Contacts', key);
  }

  public openInsight(insightId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: insightId }]);
    this.navigationService.OpenEntityRecord('Contact Insights', key);
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

  public formatChurnRisk(score: number | null): string {
    if (score == null) return 'N/A';
    return `${Math.round(score * 100)}%`;
  }

  public getChurnRiskColor(score: number | null): string {
    if (score == null) return '#9e9e9e';
    if (score > 0.7) return '#d32f2f';
    if (score > 0.5) return '#f44336';
    if (score > 0.3) return '#FF9800';
    return '#4CAF50';
  }

  public formatSentimentScore(score: number | null): string {
    if (score == null) return 'N/A';
    const prefix = score > 0 ? '+' : '';
    return `${prefix}${score.toFixed(2)}`;
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Insights';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-brain';
  }
}
