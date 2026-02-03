import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { CommandPaletteService } from './command-palette.service';

/**
 * Command Palette Component
 *
 * Provides a Notion-style command palette for quickly searching and navigating to applications.
 * Triggered by Cmd+K (Mac) or Ctrl+/ (Windows/Linux).
 *
 * Features:
 * - Fuzzy search with relevance scoring
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Loading state during navigation
 * - Empty state with helpful message
 */
@Component({
  selector: 'mj-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.css']
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('searchInput') SearchInput!: ElementRef<HTMLInputElement>;
  @Output() AppSelected = new EventEmitter<string>();

  IsOpen = false;
  SearchQuery = '';
  AllApps: BaseApplication[] = [];
  FilteredApps: BaseApplication[] = [];
  SelectedIndex = 0;
  IsNavigating = false;

  constructor(
    private service: CommandPaletteService,
    private appManager: ApplicationManager,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to service's open/close state
    this.service.IsOpen.pipe(takeUntil(this.destroy$)).subscribe((isOpen) => {
      this.IsOpen = isOpen;

      if (isOpen) {
        this.onOpen();
      } else {
        this.onClose();
      }

      this.cdr.detectChanges();
    });

    // Subscribe to application changes
    this.appManager.AllApplications.pipe(takeUntil(this.destroy$)).subscribe((apps) => {
      this.AllApps = apps;
      this.filterAndSortApps();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Called when command palette opens
   */
  private onOpen(): void {
    // Reset state
    this.SearchQuery = '';
    this.SelectedIndex = 0;
    this.IsNavigating = false;

    // Filter apps (will show all initially)
    this.filterAndSortApps();

    // Focus search input after view updates
    setTimeout(() => {
      if (this.SearchInput) {
        this.SearchInput.nativeElement.focus();
      }
    }, 100);
  }

  /**
   * Called when command palette closes
   */
  private onClose(): void {
    this.SearchQuery = '';
    this.SelectedIndex = 0;
    this.IsNavigating = false;
  }

  /**
   * Handle search query change
   */
  OnSearchChange(): void {
    this.filterAndSortApps();
    this.SelectedIndex = 0; // Reset selection
  }

  /**
   * Filter and sort applications based on search query
   */
  private filterAndSortApps(): void {
    const query = this.SearchQuery.toLowerCase().trim();

    // If no query, show all apps
    if (!query) {
      this.FilteredApps = [...this.AllApps];
      return;
    }

    // Score all apps
    const scored = this.AllApps.map(app => ({
      app,
      score: this.calculateMatchScore(app, query)
    }));

    // Filter to only matches (score > 0)
    const matches = scored.filter(item => item.score > 0);

    // Sort by score (descending)
    matches.sort((a, b) => b.score - a.score);

    // Extract apps
    this.FilteredApps = matches.map(item => item.app);
  }

  /**
   * Calculate match score for fuzzy search
   *
   * Scoring:
   * - Exact match: 1000 points
   * - Starts with: 500 points
   * - Contains: 100 points
   * - Description match: 50 points
   * - Initials match: 25 points (e.g., "de" matches "Data Explorer")
   */
  private calculateMatchScore(app: BaseApplication, query: string): number {
    const name = app.Name.toLowerCase();
    const desc = (app.Description || '').toLowerCase();

    // Exact match (highest priority)
    if (name === query) return 1000;

    // Starts with query (very high priority)
    if (name.startsWith(query)) return 500;

    // Contains query in name (high priority)
    if (name.includes(query)) return 100;

    // Description match (medium priority)
    if (desc.includes(query)) return 50;

    // Fuzzy match - initials (e.g., "de" matches "Data Explorer")
    const initials = name
      .split(' ')
      .map(word => word[0] || '')
      .join('')
      .toLowerCase();
    if (initials.includes(query)) return 25;

    return 0; // No match
  }

  /**
   * Select an application and emit event for shell to handle navigation
   */
  SelectApp(app: BaseApplication): void {
    if (this.IsNavigating) return;
    // Close the palette first
    this.service.Close();
    // Emit event for shell to handle navigation (same pattern as app-switcher)
    this.AppSelected.emit(app.ID);
  }

  /**
   * Close the command palette
   */
  Close(): void {
    this.service.Close();
  }

  /**
   * Handle keyboard navigation
   */
  @HostListener('document:keydown', ['$event'])
  HandleKeyDown(event: KeyboardEvent): void {
    if (!this.IsOpen) return;

    // Skip if user is typing in input (except for navigation keys)
    const target = event.target as HTMLElement;
    const navigationKeys = ['Escape', 'Enter', 'ArrowUp', 'ArrowDown'];
    if (target.tagName === 'INPUT' && !navigationKeys.includes(event.key)) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.SelectedIndex = Math.min(this.SelectedIndex + 1, this.FilteredApps.length - 1);
        this.scrollToSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.SelectedIndex = Math.max(this.SelectedIndex - 1, 0);
        this.scrollToSelected();
        break;

      case 'Enter':
        event.preventDefault();
        if (this.FilteredApps[this.SelectedIndex]) {
          this.SelectApp(this.FilteredApps[this.SelectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.service.Close();
        break;
    }
  }

  /**
   * Ensure selected item is visible in results list
   */
  private scrollToSelected(): void {
    setTimeout(() => {
      const selected = document.querySelector('.result-item.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }
}
