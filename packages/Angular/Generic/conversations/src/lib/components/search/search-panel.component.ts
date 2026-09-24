import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  Input,
  HostListener,
  ViewChild,
  ElementRef,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserInfo } from '@memberjunction/core';
import { HighlightSearchMatches } from '@memberjunction/global';
import {
  SearchService,
  SearchResult,
  SearchFilter,
  GroupedSearchResults,
  DateRange
} from '../../services/search.service';

/**
 * Search panel component providing global search UI
 * Can be displayed as a modal or slide-out panel
 * Supports filtering, date ranges, and result navigation
 */
@Component({
  standalone: false,
  selector: 'mj-search-panel',
  templateUrl: './search-panel.component.html',
  styleUrls: ['./search-panel.component.css']
})
export class SearchPanelComponent implements OnInit, OnDestroy {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  /** Term to open with, e.g. handed over from a narrower filter the user had already typed. */
  @Input() InitialQuery: string = '';

  /** @deprecated Use {@link InitialQuery}. */
  @Input() set initialQuery(value: string) {
    this.InitialQuery = value;
  }
  /** @deprecated Use {@link InitialQuery}. */
  get initialQuery(): string {
    return this.InitialQuery;
  }

  private _isOpen: boolean = false;

  /**
   * A setter rather than ngOnChanges so only an actual open transition acts — ngOnChanges
   * fires for every input, so a CurrentUser or EnvironmentId re-emit while the panel was
   * open yanked focus back out of whatever field the user was in.
   */
  @Input()
  set IsOpen(value: boolean) {
    const wasOpen = this._isOpen;
    this._isOpen = value;
    if (value && !wasOpen) {
      this.onOpened();
    }
  }
  get IsOpen(): boolean {
    return this._isOpen;
  }

  /** @deprecated Use {@link IsOpen}. */
  @Input() set isOpen(value: boolean) {
    this.IsOpen = value;
  }
  /** @deprecated Use {@link IsOpen}. */
  get isOpen(): boolean {
    return this.IsOpen;
  }

  @Output() close = new EventEmitter<void>();
  @Output() ResultSelected = new EventEmitter<SearchResult>();

  /**
   * @deprecated Use {@link ResultSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (resultSelected) keeps working. Must stay AFTER ResultSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() resultSelected = this.ResultSelected;

  @ViewChild('searchInput') SearchInput?: ElementRef<HTMLInputElement>;

  /** @deprecated Use {@link SearchInput}. */
  get searchInput(): ElementRef<HTMLInputElement> | undefined {
    return this.SearchInput;
  }
  /** @deprecated Use {@link SearchInput}. */
  set searchInput(value: ElementRef<HTMLInputElement> | undefined) {
    this.SearchInput = value;
  }

  public SearchQuery: string = '';

  /** @deprecated Use {@link SearchQuery}. */
  public get searchQuery(): string {
    return this.SearchQuery;
  }
  /** @deprecated Use {@link SearchQuery}. */
  public set searchQuery(value: string) {
    this.SearchQuery = value;
  }
  public ActiveFilter: SearchFilter = 'all';

  /** @deprecated Use {@link ActiveFilter}. */
  public get activeFilter(): SearchFilter {
    return this.ActiveFilter;
  }
  /** @deprecated Use {@link ActiveFilter}. */
  public set activeFilter(value: SearchFilter) {
    this.ActiveFilter = value;
  }
  public DateRange: DateRange = { start: null, end: null };

  /** @deprecated Use {@link DateRange}. */
  public get dateRange(): DateRange {
    return this.DateRange;
  }
  /** @deprecated Use {@link DateRange}. */
  public set dateRange(value: DateRange) {
    this.DateRange = value;
  }
  public IsSearching: boolean = false;

  /** @deprecated Use {@link IsSearching}. */
  public get isSearching(): boolean {
    return this.IsSearching;
  }
  /** @deprecated Use {@link IsSearching}. */
  public set isSearching(value: boolean) {
    this.IsSearching = value;
  }
  public Results: GroupedSearchResults = {
    conversations: [],
    messages: [],
    artifacts: [],
    collections: [],
    tasks: [],
    total: 0
  };

  /** @deprecated Use {@link Results}. */
  public get results(): GroupedSearchResults {
    return this.Results;
  }
  /** @deprecated Use {@link Results}. */
  public set results(value: GroupedSearchResults) {
    this.Results = value;
  }
  public RecentSearches: string[] = [];

  /** @deprecated Use {@link RecentSearches}. */
  public get recentSearches(): string[] {
    return this.RecentSearches;
  }
  /** @deprecated Use {@link RecentSearches}. */
  public set recentSearches(value: string[]) {
    this.RecentSearches = value;
  }
  public SelectedIndex: number = -1;

  /** @deprecated Use {@link SelectedIndex}. */
  public get selectedIndex(): number {
    return this.SelectedIndex;
  }
  /** @deprecated Use {@link SelectedIndex}. */
  public set selectedIndex(value: number) {
    this.SelectedIndex = value;
  }

  /**
   * Flat view of `Results`, rebuilt only on each results emission. The template binds
   * IsResultSelected() once per row, so deriving this on demand allocated a fresh array of
   * every result for every row on every change-detection pass.
   */
  private flatResults: SearchResult[] = [];

  /** Message for the "no results" empty state, echoing the search term. */
  public get NoResultsMessage(): string {
    return `No results found for "${this.SearchQuery}"`;
  }

  private destroy$ = new Subject<void>();

  /** True only while ngOnInit subscribes — see applyState(). */
  private initializing = false;

  constructor(
    private searchService: SearchService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Apply state from an async emission and render it.
   *
   * The search resolves through the data provider's transport, and that emission does not
   * reliably schedule a change-detection pass: results land on the component while the panel
   * keeps showing the previous state until some DOM event — Enter, a click on the modal,
   * even the blur from clicking into devtools — triggers the next one. detectChanges()
   * checks this view on the spot; markForCheck() would only mark it for a pass that never
   * comes.
   */
  private applyState(fn: () => void): void {
    fn();
    // The BehaviorSubjects replay synchronously while ngOnInit subscribes, which is already
    // inside a pass. takeUntil(destroy$) stops emissions at teardown, so there is no
    // destroyed-view case to guard against.
    if (!this.initializing) {
      this.cdr.detectChanges();
    }
  }

  ngOnInit(): void {
    // Each BehaviorSubject replays synchronously on subscribe, inside this pass.
    this.initializing = true;
    this.subscribeToSearchState();
    this.initializing = false;
    this.loadRecentSearches();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Subscribe to search service state
   */
  private subscribeToSearchState(): void {
    this.searchService.isSearching$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isSearching => {
        this.applyState(() => {
          this.IsSearching = isSearching;
        });
      });

    this.searchService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.applyState(() => {
          this.Results = results;
          this.flatResults = [
            ...results.conversations,
            ...results.messages,
            ...results.artifacts,
            ...results.collections,
            ...results.tasks
          ];
          this.SelectedIndex = -1;
        });
      });

    this.searchService.searchFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filter => {
        this.applyState(() => {
          this.ActiveFilter = filter;
        });
      });

    this.searchService.dateRange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(range => {
        this.applyState(() => {
          this.DateRange = range;
        });
      });
  }

  /**
   * Load recent searches
   */
  private loadRecentSearches(): void {
    this.RecentSearches = this.searchService.getRecentSearches();
  }

  /**
   * Handle search input
   */
  public OnSearchInput(): void {
    if (this.SearchQuery.trim()) {
      this.performSearch();
    } else {
      this.searchService.clearResults();
    }
  }

  /** @deprecated Use {@link OnSearchInput}. */
  public onSearchInput(): void {
    return this.OnSearchInput();
  }

  /**
   * Perform search
   */
  private async performSearch(): Promise<void> {
    await this.searchService.search(
      this.SearchQuery,
      this.EnvironmentId,
      this.CurrentUser
    );
  }

  /**
   * Set search filter
   */
  public SetFilter(filter: SearchFilter): void {
    this.searchService.setSearchFilter(filter);
    if (this.SearchQuery.trim()) {
      this.performSearch();
    }
  }

  /** @deprecated Use {@link SetFilter}. */
  public setFilter(filter: SearchFilter): void {
    return this.SetFilter(filter);
  }

  /**
   * Clear search
   */
  public ClearSearch(): void {
    this.SearchQuery = '';
    this.searchService.clearResults();
    this.focusSearchInput();
  }

  /** @deprecated Use {@link ClearSearch}. */
  public clearSearch(): void {
    return this.ClearSearch();
  }

  /**
   * Select a result
   */
  public SelectResult(result: SearchResult): void {
    this.ResultSelected.emit(result);
    this.ClosePanel();
  }

  /** @deprecated Use {@link SelectResult}. */
  public selectResult(result: SearchResult): void {
    return this.SelectResult(result);
  }

  /**
   * Use recent search
   */
  public UseRecentSearch(query: string): void {
    this.SearchQuery = query;
    this.performSearch();
  }

  /** @deprecated Use {@link UseRecentSearch}. */
  public useRecentSearch(query: string): void {
    return this.UseRecentSearch(query);
  }

  /**
   * Clear recent searches
   */
  public ClearRecentSearches(): void {
    this.searchService.clearRecentSearches();
    this.RecentSearches = [];
  }

  /** @deprecated Use {@link ClearRecentSearches}. */
  public clearRecentSearches(): void {
    return this.ClearRecentSearches();
  }

  /**
   * Close panel
   */
  public ClosePanel(): void {
    this.close.emit();
  }

  /** @deprecated Use {@link ClosePanel}. */
  public closePanel(): void {
    return this.ClosePanel();
  }

  /**
   * Seed and focus the box once the panel is open.
   *
   * Deferred to the next task so the @if(IsOpen) view exists (there is no input to focus
   * before it renders) and so every input bound in the same pass has been set — this reads
   * InitialQuery, which the host may bind after IsOpen.
   */
  private onOpened(): void {
    setTimeout(() => {
      const seed = this.InitialQuery?.trim();
      if (seed && seed !== this.SearchQuery) {
        this.SearchQuery = seed;
        this.OnSearchInput();
        this.cdr.detectChanges();
      }
      this.SearchInput?.nativeElement.focus();
    }, 0);
  }

  /**
   * Focus search input
   */
  private focusSearchInput(): void {
    setTimeout(() => {
      this.SearchInput?.nativeElement.focus();
    }, 0);
  }

  /**
   * Handle keyboard navigation
   */
  @HostListener('keydown', ['$event'])
  public handleKeyboard(event: KeyboardEvent): void {
    if (!this.IsOpen) return;

    const allResults = this.flatResults;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.ClosePanel();
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (allResults.length > 0) {
          this.SelectedIndex = Math.min(this.SelectedIndex + 1, allResults.length - 1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (this.SelectedIndex > 0) {
          this.SelectedIndex--;
        } else {
          this.SelectedIndex = -1;
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (this.SelectedIndex >= 0 && allResults[this.SelectedIndex]) {
          this.SelectResult(allResults[this.SelectedIndex]);
        }
        break;
    }
  }

  /**
   * Check if result is selected
   */
  public IsResultSelected(result: SearchResult): boolean {
    const selected = this.flatResults[this.SelectedIndex];
    return !!selected && selected.id === result.id && selected.type === result.type;
  }

  /** @deprecated Use {@link IsResultSelected}. */
  public isResultSelected(result: SearchResult): boolean {
    return this.IsResultSelected(result);
  }

  /**
   * Get icon for result type
   */
  public GetResultIcon(type: string): string {
    switch (type) {
      case 'conversation':
        return 'fa-comments';
      case 'message':
        return 'fa-comment';
      case 'artifact':
        return 'fa-file-alt';
      case 'collection':
        return 'fa-folder';
      case 'task':
        return 'fa-tasks';
      default:
        return 'fa-circle';
    }
  }

  /** @deprecated Use {@link GetResultIcon}. */
  public getResultIcon(type: string): string {
    return this.GetResultIcon(type);
  }

  /**
   * Get filter display text
   */
  public GetFilterText(filter: SearchFilter): string {
    switch (filter) {
      case 'all':
        return 'All';
      case 'conversations':
        return 'Conversations';
      case 'messages':
        return 'Messages';
      case 'artifacts':
        return 'Artifacts';
      case 'collections':
        return 'Collections';
      case 'tasks':
        return 'Tasks';
      default:
        return 'All';
    }
  }

  /** @deprecated Use {@link GetFilterText}. */
  public getFilterText(filter: SearchFilter): string {
    return this.GetFilterText(filter);
  }

  /**
   * Format date for display
   */
  public formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  /** Highlight matched text in result. Output is bound to `[innerHTML]` in the template. */
  public HighlightMatch(text: string, query: string): string {
    return HighlightSearchMatches(text, query);
  }

  /** @deprecated Use {@link HighlightMatch}. */
  public highlightMatch(text: string, query: string): string {
    return this.HighlightMatch(text, query);
  }

  /**
   * Handle date range change
   */
  public OnDateRangeChange(): void {
    this.searchService.setDateRange(this.DateRange);
    if (this.SearchQuery.trim()) {
      this.performSearch();
    }
  }

  /** @deprecated Use {@link OnDateRangeChange}. */
  public onDateRangeChange(): void {
    return this.OnDateRangeChange();
  }

  /**
   * Clear date range
   */
  public ClearDateRange(): void {
    this.DateRange = { start: null, end: null };
    this.searchService.setDateRange({ start: null, end: null });
    if (this.SearchQuery.trim()) {
      this.performSearch();
    }
  }

  /** @deprecated Use {@link ClearDateRange}. */
  public clearDateRange(): void {
    return this.ClearDateRange();
  }
}
