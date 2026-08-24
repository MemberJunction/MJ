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
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  /** Term to open with, e.g. handed over from a narrower filter the user had already typed. */
  @Input() initialQuery: string = '';

  private _isOpen: boolean = false;

  /**
   * A setter rather than ngOnChanges so only an actual open transition acts — ngOnChanges
   * fires for every input, so a currentUser or environmentId re-emit while the panel was
   * open yanked focus back out of whatever field the user was in.
   */
  @Input()
  set isOpen(value: boolean) {
    const wasOpen = this._isOpen;
    this._isOpen = value;
    if (value && !wasOpen) {
      this.onOpened();
    }
  }
  get isOpen(): boolean {
    return this._isOpen;
  }

  @Output() close = new EventEmitter<void>();
  @Output() resultSelected = new EventEmitter<SearchResult>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  public searchQuery: string = '';
  public activeFilter: SearchFilter = 'all';
  public dateRange: DateRange = { start: null, end: null };
  public isSearching: boolean = false;
  public results: GroupedSearchResults = {
    conversations: [],
    messages: [],
    artifacts: [],
    collections: [],
    tasks: [],
    total: 0
  };
  public recentSearches: string[] = [];
  public selectedIndex: number = -1;

  /**
   * Flat view of `results`, rebuilt only on each results emission. The template binds
   * isResultSelected() once per row, so deriving this on demand allocated a fresh array of
   * every result for every row on every change-detection pass.
   */
  private flatResults: SearchResult[] = [];

  /** Message for the "no results" empty state, echoing the search term. */
  public get NoResultsMessage(): string {
    return `No results found for "${this.searchQuery}"`;
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
          this.isSearching = isSearching;
        });
      });

    this.searchService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.applyState(() => {
          this.results = results;
          this.flatResults = [
            ...results.conversations,
            ...results.messages,
            ...results.artifacts,
            ...results.collections,
            ...results.tasks
          ];
          this.selectedIndex = -1;
        });
      });

    this.searchService.searchFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filter => {
        this.applyState(() => {
          this.activeFilter = filter;
        });
      });

    this.searchService.dateRange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(range => {
        this.applyState(() => {
          this.dateRange = range;
        });
      });
  }

  /**
   * Load recent searches
   */
  private loadRecentSearches(): void {
    this.recentSearches = this.searchService.getRecentSearches();
  }

  /**
   * Handle search input
   */
  public onSearchInput(): void {
    if (this.searchQuery.trim()) {
      this.performSearch();
    } else {
      this.searchService.clearResults();
    }
  }

  /**
   * Perform search
   */
  private async performSearch(): Promise<void> {
    await this.searchService.search(
      this.searchQuery,
      this.environmentId,
      this.currentUser
    );
  }

  /**
   * Set search filter
   */
  public setFilter(filter: SearchFilter): void {
    this.searchService.setSearchFilter(filter);
    if (this.searchQuery.trim()) {
      this.performSearch();
    }
  }

  /**
   * Clear search
   */
  public clearSearch(): void {
    this.searchQuery = '';
    this.searchService.clearResults();
    this.focusSearchInput();
  }

  /**
   * Select a result
   */
  public selectResult(result: SearchResult): void {
    this.resultSelected.emit(result);
    this.closePanel();
  }

  /**
   * Use recent search
   */
  public useRecentSearch(query: string): void {
    this.searchQuery = query;
    this.performSearch();
  }

  /**
   * Clear recent searches
   */
  public clearRecentSearches(): void {
    this.searchService.clearRecentSearches();
    this.recentSearches = [];
  }

  /**
   * Close panel
   */
  public closePanel(): void {
    this.close.emit();
  }

  /**
   * Seed and focus the box once the panel is open.
   *
   * Deferred to the next task so the @if(isOpen) view exists (there is no input to focus
   * before it renders) and so every input bound in the same pass has been set — this reads
   * initialQuery, which the host may bind after isOpen.
   */
  private onOpened(): void {
    setTimeout(() => {
      const seed = this.initialQuery?.trim();
      if (seed && seed !== this.searchQuery) {
        this.searchQuery = seed;
        this.onSearchInput();
        this.cdr.detectChanges();
      }
      this.searchInput?.nativeElement.focus();
    }, 0);
  }

  /**
   * Focus search input
   */
  private focusSearchInput(): void {
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 0);
  }

  /**
   * Handle keyboard navigation
   */
  @HostListener('keydown', ['$event'])
  public handleKeyboard(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    const allResults = this.flatResults;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closePanel();
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (allResults.length > 0) {
          this.selectedIndex = Math.min(this.selectedIndex + 1, allResults.length - 1);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (this.selectedIndex > 0) {
          this.selectedIndex--;
        } else {
          this.selectedIndex = -1;
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0 && allResults[this.selectedIndex]) {
          this.selectResult(allResults[this.selectedIndex]);
        }
        break;
    }
  }

  /**
   * Check if result is selected
   */
  public isResultSelected(result: SearchResult): boolean {
    const selected = this.flatResults[this.selectedIndex];
    return !!selected && selected.id === result.id && selected.type === result.type;
  }

  /**
   * Get icon for result type
   */
  public getResultIcon(type: string): string {
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

  /**
   * Get filter display text
   */
  public getFilterText(filter: SearchFilter): string {
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
  public highlightMatch(text: string, query: string): string {
    return HighlightSearchMatches(text, query);
  }

  /**
   * Handle date range change
   */
  public onDateRangeChange(): void {
    this.searchService.setDateRange(this.dateRange);
    if (this.searchQuery.trim()) {
      this.performSearch();
    }
  }

  /**
   * Clear date range
   */
  public clearDateRange(): void {
    this.dateRange = { start: null, end: null };
    this.searchService.setDateRange({ start: null, end: null });
    if (this.searchQuery.trim()) {
      this.performSearch();
    }
  }

}
