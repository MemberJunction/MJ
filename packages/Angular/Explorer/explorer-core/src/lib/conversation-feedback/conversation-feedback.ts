import { Component, OnInit, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunQuery } from '@memberjunction/core';
import { ApplicationManager } from '@memberjunction/ng-base-application';

export interface FeedbackRow {
  ratingID: string;
  rating: number;
  comments: string | null;
  createdAt: string;
  raterName: string | null;
  raterEmail: string | null;
  conversationDetailID: string;
  conversationID: string | null;
  conversationName: string | null;
  messageText: string | null;
  messageSnippet: string | null;
  messageRole: string | null;
  agentID: string | null;
  agentName: string | null;
}

export type RatingBand = 'all' | 'high' | 'mid' | 'low';
export type DateRange = 'all' | '1d' | '7d' | '30d' | '90d';

@Component({
  standalone: false,
  selector: 'mj-conversation-feedback',
  templateUrl: './conversation-feedback.html',
  styleUrls: ['./conversation-feedback.css']
})
@RegisterClass(BaseResourceComponent, 'ConversationFeedbackResource')
export class ConversationFeedbackResource extends BaseResourceComponent implements OnInit {
  isInitializing = true;
  loading = false;
  statsLoading = false;
  error: string | null = null;

  ratingBand: RatingBand = 'all';
  dateRange: DateRange = '7d';
  searchTerm = '';

  rows: FeedbackRow[] = [];
  totalRowCount = 0;

  pageSize: number = 10;
  currentPage: number = 1;
  readonly pageSizeOptions: number[] = [10, 25, 50, 100];

  stats = { total: 0, avgRating: 0, percentPositive: 0, percentNegative: 0 };

  selectedRow: FeedbackRow | null = null;

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private cdr = inject(ChangeDetectorRef);
  private appManager = inject(ApplicationManager);

  async GetResourceDisplayName(): Promise<string> {
    return 'Agent Feedback';
  }

  async GetResourceIconClass(): Promise<string> {
    return 'fa-solid fa-comment-dots';
  }

  override async ngOnInit(): Promise<void> {
    this.isInitializing = false;
    this.cdr.detectChanges();
    await this.applyFilters();
    this.NotifyLoadComplete();
  }

  /** Manual refresh from the page header — same path as a filter change. */
  async loadFeedback(): Promise<void> {
    await this.applyFilters();
  }

  setBand(band: RatingBand): void {
    if (this.ratingBand === band) return;
    this.ratingBand = band;
    this.currentPage = 1;
    void this.applyFilters();
  }

  setDateRange(range: DateRange): void {
    if (this.dateRange === range) return;
    this.dateRange = range;
    this.currentPage = 1;
    void this.applyFilters();
  }

  /**
   * Search input fires on every keystroke; debounce so we don't slam the
   * server while the user is typing. 250ms is enough to feel responsive
   * without firing on intermediate states.
   */
  onSearchChange(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.currentPage = 1;
      void this.applyFilters();
    }, 250);
  }

  onPageChange(event: { PageNumber: number; PageSize: number; StartRow: number }): void {
    if (event.PageNumber === this.currentPage) return;
    this.currentPage = event.PageNumber;
    void this.loadRows();
  }

  onPageSizeChange(size: number): void {
    const next = Number(size);
    if (!next || next === this.pageSize) return;
    this.pageSize = next;
    this.currentPage = 1;
    void this.loadRows();
  }

  openDrawer(row: FeedbackRow): void {
    this.selectedRow = row;
    this.cdr.detectChanges();
  }

  closeDrawer(): void {
    this.selectedRow = null;
    this.cdr.detectChanges();
  }

  async openConversation(): Promise<void> {
    if (!this.selectedRow?.conversationID) return;
    const conversationID = this.selectedRow.conversationID;

    // The Chat app owns the Conversations nav item; the active app (Agent
    // Feedback) does not, so we must target Chat explicitly. Fall back to
    // scanning all apps for a nav item whose DriverClass is the chat resource.
    let appId: string | undefined = this.appManager.GetAppByName('Chat')?.ID;
    let navItemLabel = 'Conversations';

    if (!appId) {
      for (const app of this.appManager.GetAllApps()) {
        const navItems = await app.GetNavItems();
        const match = navItems.find(n => (n as any).DriverClass === 'ChatConversationsResource');
        if (match) {
          appId = app.ID;
          navItemLabel = match.Label;
          break;
        }
      }
    }

    if (!appId) {
      this.error = 'Could not find a Chat application to open this conversation in.';
      this.cdr.detectChanges();
      return;
    }

    this.closeDrawer();
    await this.navigationService.OpenNavItemByName(navItemLabel, { conversationId: conversationID }, appId);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedRow) this.closeDrawer();
  }

  bandClassFor(rating: number): string {
    if (rating >= 8) return 'rating-high';
    if (rating >= 4) return 'rating-mid';
    return 'rating-low';
  }

  trackByRatingID = (_: number, row: FeedbackRow): string => row.ratingID;

  /** 1-based index of the first row on the current page (0 when empty). */
  get rangeStart(): number {
    if (this.totalRowCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  /** 1-based index of the last row on the current page (clamped to total). */
  get rangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalRowCount);
  }

  /**
   * True when the filtered set fits on a single page — in this case
   * mj-pagination hides itself, so the footer renders a fallback summary
   * line. When false we let mj-pagination own the bar (it has its own
   * `1-N of M` summary on the left + nav controls on the right).
   */
  get isSinglePage(): boolean {
    if (this.totalRowCount <= 0) return false;
    return Math.ceil(this.totalRowCount / this.pageSize) <= 1;
  }

  /**
   * Run both the rows-query (paged) and the stats-query (aggregate) against
   * the current filter state. Called when filters change or on initial load.
   */
  private async applyFilters(): Promise<void> {
    await Promise.all([this.loadRows(), this.loadStats()]);
  }

  /**
   * Fetch the current page of rows from the server. The mj-pagination
   * footer reads `totalRowCount` to derive the page count.
   */
  private async loadRows(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const rq = new RunQuery();
      const result = await rq.RunQuery({
        QueryName: 'ListConversationDetailFeedback',
        CategoryPath: '/MJ/Conversations',
        Parameters: this.buildQueryParameters(),
        StartRow: (this.currentPage - 1) * this.pageSize,
        MaxRows: this.pageSize
      });

      if (!result.Success) {
        this.error = result.ErrorMessage || 'Failed to load feedback';
        this.rows = [];
        this.totalRowCount = 0;
        return;
      }

      this.rows = (result.Results ?? []).map((r: any) => this.mapRow(r));
      this.totalRowCount = result.TotalRowCount ?? this.rows.length;
    } catch (e: any) {
      this.error = e?.message || 'Failed to load feedback';
      this.rows = [];
      this.totalRowCount = 0;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Aggregate counts over the same filter universe as `loadRows()`. Runs in
   * parallel with the rows query so the stat cards and the table stay in
   * sync after every filter change.
   */
  private async loadStats(): Promise<void> {
    this.statsLoading = true;
    this.cdr.detectChanges();

    try {
      const rq = new RunQuery();
      const result = await rq.RunQuery({
        QueryName: 'ListConversationDetailFeedbackStats',
        CategoryPath: '/MJ/Conversations',
        Parameters: this.buildQueryParameters()
      });

      const row = (result.Results?.[0] as any) || {};
      const total = Number(row.Total ?? 0);
      const avg = Number(row.AvgRating ?? 0);
      const pos = Number(row.PositiveCount ?? 0);
      const neg = Number(row.NegativeCount ?? 0);

      this.stats = {
        total,
        avgRating: total ? Math.round(avg * 10) / 10 : 0,
        percentPositive: total ? Math.round((pos / total) * 100) : 0,
        percentNegative: total ? Math.round((neg / total) * 100) : 0
      };
    } catch (e) {
      // Stats are non-critical — the table is the primary surface. Log and
      // leave the previous stats values in place.
      console.warn('[Feedback] stats query failed', e);
    } finally {
      this.statsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Build the Nunjucks-bound parameter set passed to both queries. Server-side
   * filtering: emit only the keys that actually have a value so the SQL's
   * `{% if X %}` blocks stay inert when filters are at their default.
   */
  private buildQueryParameters(): Record<string, unknown> {
    const params: {
      MinRating?: number;
      MaxRating?: number;
      StartDate?: string;
      SearchText?: string;
    } = {};

    if (this.ratingBand === 'high') {
      params.MinRating = 8;
    } else if (this.ratingBand === 'mid') {
      params.MinRating = 4;
      params.MaxRating = 7;
    } else if (this.ratingBand === 'low') {
      params.MaxRating = 3;
    }

    const cutoffIso = this.dateRangeCutoffIso();
    if (cutoffIso) {
      params.StartDate = cutoffIso;
    }

    const term = this.searchTerm.trim();
    if (term) {
      params.SearchText = term;
    }

    return params;
  }

  private dateRangeCutoffIso(): string | null {
    if (this.dateRange === 'all') return null;
    const days = this.dateRange === '1d' ? 1
      : this.dateRange === '7d' ? 7
      : this.dateRange === '30d' ? 30
      : 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return cutoff.toISOString();
  }

  private mapRow(r: any): FeedbackRow {
    const message: string | null = r.MessageText ?? null;
    const snippet = message
      ? (message.length > 160 ? message.slice(0, 160) + '…' : message)
      : null;
    return {
      ratingID: r.RatingID,
      rating: r.Rating,
      comments: r.Comments ?? null,
      createdAt: r.RatedAt ?? '',
      raterName: r.RaterName ?? null,
      raterEmail: r.RaterEmail ?? null,
      conversationDetailID: r.ConversationDetailID,
      conversationID: r.ConversationID ?? null,
      conversationName: r.ConversationName ?? null,
      messageText: message,
      messageSnippet: snippet,
      messageRole: r.MessageRole ?? null,
      agentID: r.AgentID ?? null,
      agentName: r.AgentName ?? null
    };
  }
}
