import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  Input,
  HostListener,
  ViewChild,
  ElementRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserInfo } from '@memberjunction/core';
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
  @Input() isOpen: boolean = false;

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

  private destroy$ = new Subject<void>();

  constructor(private searchService: SearchService) {}

  ngOnInit(): void {
    this.subscribeToSearchState();
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
        this.isSearching = isSearching;
      });

    this.searchService.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        this.results = results;
        this.selectedIndex = -1;
      });

    this.searchService.searchFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filter => {
        this.activeFilter = filter;
      });

    this.searchService.dateRange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(range => {
        this.dateRange = range;
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

    const allResults = this.getAllResultsFlat();

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
   * Get all results as flat array
   */
  private getAllResultsFlat(): SearchResult[] {
    return [
      ...this.results.conversations,
      ...this.results.messages,
      ...this.results.artifacts,
      ...this.results.collections,
      ...this.results.tasks
    ];
  }

  /**
   * Check if result is selected
   */
  public isResultSelected(result: SearchResult): boolean {
    const allResults = this.getAllResultsFlat();
    const index = allResults.findIndex(r => r.id === result.id && r.type === result.type);
    return index === this.selectedIndex;
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

  /**
   * Highlight matched text in result
   */
  public highlightMatch(text: string, query: string): string {
    if (!query) return text;

    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  /**
   * Watch for panel open state changes
   */
  ngOnChanges(): void {
    if (this.isOpen) {
      this.focusSearchInput();
    }
  }
}
