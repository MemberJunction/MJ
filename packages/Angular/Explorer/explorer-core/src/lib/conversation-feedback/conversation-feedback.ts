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
  IsInitializing = true;

  /** @deprecated Use {@link IsInitializing}. */
  get isInitializing() {
    return this.IsInitializing;
  }
  /** @deprecated Use {@link IsInitializing}. */
  set isInitializing(value) {
    this.IsInitializing = value;
  }
  Loading = false;

  /** @deprecated Use {@link Loading}. */
  get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  set loading(value) {
    this.Loading = value;
  }
  StatsLoading = false;

  /** @deprecated Use {@link StatsLoading}. */
  get statsLoading() {
    return this.StatsLoading;
  }
  /** @deprecated Use {@link StatsLoading}. */
  set statsLoading(value) {
    this.StatsLoading = value;
  }
  error: string | null = null;

  RatingBand: RatingBand = 'all';

  /** @deprecated Use {@link RatingBand}. */
  get ratingBand(): RatingBand {
    return this.RatingBand;
  }
  /** @deprecated Use {@link RatingBand}. */
  set ratingBand(value: RatingBand) {
    this.RatingBand = value;
  }
  DateRange: DateRange = '7d';

  /** @deprecated Use {@link DateRange}. */
  get dateRange(): DateRange {
    return this.DateRange;
  }
  /** @deprecated Use {@link DateRange}. */
  set dateRange(value: DateRange) {
    this.DateRange = value;
  }
  SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  set searchTerm(value) {
    this.SearchTerm = value;
  }

  Rows: FeedbackRow[] = [];

  /** @deprecated Use {@link Rows}. */
  get rows(): FeedbackRow[] {
    return this.Rows;
  }
  /** @deprecated Use {@link Rows}. */
  set rows(value: FeedbackRow[]) {
    this.Rows = value;
  }
  TotalRowCount = 0;

  /** @deprecated Use {@link TotalRowCount}. */
  get totalRowCount() {
    return this.TotalRowCount;
  }
  /** @deprecated Use {@link TotalRowCount}. */
  set totalRowCount(value) {
    this.TotalRowCount = value;
  }

  pageSize: number = 10;
  CurrentPage: number = 1;

  /** @deprecated Use {@link CurrentPage}. */
  get currentPage(): number {
    return this.CurrentPage;
  }
  /** @deprecated Use {@link CurrentPage}. */
  set currentPage(value: number) {
    this.CurrentPage = value;
  }
  readonly PageSizeOptions: number[] = [10, 25, 50, 100];

  /** @deprecated Use {@link PageSizeOptions}. */
  get pageSizeOptions(): number[] {
    return this.PageSizeOptions;
  }

  Stats = { total: 0, avgRating: 0, percentPositive: 0, percentNegative: 0 };

  /** @deprecated Use {@link Stats}. */
  get stats() {
    return this.Stats;
  }
  /** @deprecated Use {@link Stats}. */
  set stats(value) {
    this.Stats = value;
  }

  SelectedRow: FeedbackRow | null = null;

  /** @deprecated Use {@link SelectedRow}. */
  get selectedRow(): FeedbackRow | null {
    return this.SelectedRow;
  }
  /** @deprecated Use {@link SelectedRow}. */
  set selectedRow(value: FeedbackRow | null) {
    this.SelectedRow = value;
  }

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
    this.IsInitializing = false;
    this.cdr.detectChanges();
    await this.applyFilters();
    this.NotifyLoadComplete();
  }

  /** Manual refresh from the page header — same path as a filter change. */
  async LoadFeedback(): Promise<void> {
    await this.applyFilters();
  }

  /** @deprecated Use {@link LoadFeedback}. */
  async loadFeedback(): Promise<void> {
    return this.LoadFeedback();
  }

  SetBand(band: RatingBand): void {
    if (this.RatingBand === band) return;
    this.RatingBand = band;
    this.CurrentPage = 1;
    void this.applyFilters();
  }

  /** @deprecated Use {@link SetBand}. */
  setBand(band: RatingBand): void {
    return this.SetBand(band);
  }

  SetDateRange(range: DateRange): void {
    if (this.DateRange === range) return;
    this.DateRange = range;
    this.CurrentPage = 1;
    void this.applyFilters();
  }

  /** @deprecated Use {@link SetDateRange}. */
  setDateRange(range: DateRange): void {
    return this.SetDateRange(range);
  }

  /**
   * Search input fires on every keystroke; debounce so we don't slam the
   * server while the user is typing. 250ms is enough to feel responsive
   * without firing on intermediate states.
   */
  OnSearchChange(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.CurrentPage = 1;
      void this.applyFilters();
    }, 250);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  onSearchChange(): void {
    return this.OnSearchChange();
  }

  OnPageChange(event: { PageNumber: number; PageSize: number; StartRow: number }): void {
    if (event.PageNumber === this.CurrentPage) return;
    this.CurrentPage = event.PageNumber;
    void this.loadRows();
  }

  /** @deprecated Use {@link OnPageChange}. */
  onPageChange(event: { PageNumber: number; PageSize: number; StartRow: number }): void {
    return this.OnPageChange(event);
  }

  OnPageSizeChange(size: number): void {
    const next = Number(size);
    if (!next || next === this.pageSize) return;
    this.pageSize = next;
    this.CurrentPage = 1;
    void this.loadRows();
  }

  /** @deprecated Use {@link OnPageSizeChange}. */
  onPageSizeChange(size: number): void {
    return this.OnPageSizeChange(size);
  }

  OpenDrawer(row: FeedbackRow): void {
    this.SelectedRow = row;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OpenDrawer}. */
  openDrawer(row: FeedbackRow): void {
    return this.OpenDrawer(row);
  }

  CloseDrawer(): void {
    this.SelectedRow = null;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link CloseDrawer}. */
  closeDrawer(): void {
    return this.CloseDrawer();
  }

  async OpenConversation(): Promise<void> {
    if (!this.SelectedRow?.conversationID) return;
    const conversationID = this.SelectedRow.conversationID;

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

    this.CloseDrawer();
    await this.navigationService.OpenNavItemByName(navItemLabel, { conversationId: conversationID }, appId);
  }

  /** @deprecated Use {@link OpenConversation}. */
  async openConversation(): Promise<void> {
    return this.OpenConversation();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.SelectedRow) this.CloseDrawer();
  }

  BandClassFor(rating: number): string {
    if (rating >= 8) return 'rating-high';
    if (rating >= 4) return 'rating-mid';
    return 'rating-low';
  }

  /** @deprecated Use {@link BandClassFor}. */
  bandClassFor(rating: number): string {
    return this.BandClassFor(rating);
  }

  TrackByRatingID = (_: number, row: FeedbackRow): string => row.ratingID;

  /** @deprecated Use {@link TrackByRatingID}. */
  get trackByRatingID() {
    return this.TrackByRatingID;
  }
  /** @deprecated Use {@link TrackByRatingID}. */
  set trackByRatingID(value) {
    this.TrackByRatingID = value;
  }

  /** 1-based index of the first row on the current page (0 when empty). */
  get RangeStart(): number {
    if (this.TotalRowCount === 0) return 0;
    return (this.CurrentPage - 1) * this.pageSize + 1;
  }

  /** @deprecated Use {@link RangeStart}. */
  get rangeStart(): number {
    return this.RangeStart;
  }

  /** 1-based index of the last row on the current page (clamped to total). */
  get RangeEnd(): number {
    return Math.min(this.CurrentPage * this.pageSize, this.TotalRowCount);
  }

  /** @deprecated Use {@link RangeEnd}. */
  get rangeEnd(): number {
    return this.RangeEnd;
  }

  /**
   * True when the filtered set fits on a single page — in this case
   * mj-pagination hides itself, so the footer renders a fallback summary
   * line. When false we let mj-pagination own the bar (it has its own
   * `1-N of M` summary on the left + nav controls on the right).
   */
  get IsSinglePage(): boolean {
    if (this.TotalRowCount <= 0) return false;
    return Math.ceil(this.TotalRowCount / this.pageSize) <= 1;
  }

  /** @deprecated Use {@link IsSinglePage}. */
  get isSinglePage(): boolean {
    return this.IsSinglePage;
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
    this.Loading = true;
    this.error = null;
    this.cdr.detectChanges();

    try {
      const rq = new RunQuery();
      const result = await rq.RunQuery({
        QueryName: 'ListConversationDetailFeedback',
        CategoryPath: '/MJ/Conversations',
        Parameters: this.buildQueryParameters(),
        StartRow: (this.CurrentPage - 1) * this.pageSize,
        MaxRows: this.pageSize
      });

      if (!result.Success) {
        this.error = result.ErrorMessage || 'Failed to load feedback';
        this.Rows = [];
        this.TotalRowCount = 0;
        return;
      }

      this.Rows = (result.Results ?? []).map((r: any) => this.mapRow(r));
      this.TotalRowCount = result.TotalRowCount ?? this.Rows.length;
    } catch (e: any) {
      this.error = e?.message || 'Failed to load feedback';
      this.Rows = [];
      this.TotalRowCount = 0;
    } finally {
      this.Loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Aggregate counts over the same filter universe as `loadRows()`. Runs in
   * parallel with the rows query so the stat cards and the table stay in
   * sync after every filter change.
   */
  private async loadStats(): Promise<void> {
    this.StatsLoading = true;
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

      this.Stats = {
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
      this.StatsLoading = false;
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

    if (this.RatingBand === 'high') {
      params.MinRating = 8;
    } else if (this.RatingBand === 'mid') {
      params.MinRating = 4;
      params.MaxRating = 7;
    } else if (this.RatingBand === 'low') {
      params.MaxRating = 3;
    }

    const cutoffIso = this.dateRangeCutoffIso();
    if (cutoffIso) {
      params.StartDate = cutoffIso;
    }

    const term = this.SearchTerm.trim();
    if (term) {
      params.SearchText = term;
    }

    return params;
  }

  private dateRangeCutoffIso(): string | null {
    if (this.DateRange === 'all') return null;
    const days = this.DateRange === '1d' ? 1
      : this.DateRange === '7d' ? 7
      : this.DateRange === '30d' ? 30
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
