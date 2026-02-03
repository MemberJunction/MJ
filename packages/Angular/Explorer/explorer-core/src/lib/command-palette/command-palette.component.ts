import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, ChangeDetectorRef, Output, EventEmitter, ViewContainerRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { CommandPaletteService } from './command-palette.service';
import { SettingsDialogService } from '../shell/services/settings-dialog.service';

/**
 * Base interface for all searchable items in command palette
 */
interface SearchableItem {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color?: string;
  type: 'application' | 'system-action';
}

/**
 * Application item (existing behavior)
 */
interface ApplicationItem extends SearchableItem {
  type: 'application';
  application: BaseApplication;
}

/**
 * System action item (new concept for non-application actions like settings, help, etc.)
 */
interface SystemActionItem extends SearchableItem {
  type: 'system-action';
  action: () => void;
  keywords?: string[]; // Additional search terms for better discoverability
}

/**
 * Union type for all command palette items
 */
type CommandPaletteItem = ApplicationItem | SystemActionItem;

/**
 * Command Palette Component
 *
 * Provides a Notion-style command palette for quickly searching and navigating to applications and system actions.
 * Triggered by Cmd+K (Mac) or Ctrl+/ (Windows/Linux).
 *
 * Features:
 * - Fuzzy search with relevance scoring
 * - Keyword matching for system actions
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Loading state during navigation
 * - Empty state with helpful message
 * - Support for both applications and system actions
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
  AllItems: CommandPaletteItem[] = [];
  FilteredItems: CommandPaletteItem[] = [];
  SelectedIndex = 0;
  IsNavigating = false;

  constructor(
    private service: CommandPaletteService,
    private appManager: ApplicationManager,
    private cdr: ChangeDetectorRef,
    private settingsDialogService: SettingsDialogService,
    private viewContainerRef: ViewContainerRef
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

    // Subscribe to application changes and combine with system actions
    this.appManager.AllApplications.pipe(takeUntil(this.destroy$)).subscribe((apps) => {
      // Convert apps to ApplicationItem format
      const appItems: ApplicationItem[] = apps.map(app => ({
        id: app.ID,
        name: app.Name,
        description: app.Description,
        icon: app.Icon,
        color: app.Color,
        type: 'application',
        application: app
      }));

      // Get system actions
      const systemActions = this.getSystemActions();

      // Combine all items
      this.AllItems = [...appItems, ...systemActions];
      this.filterAndSortItems();
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

    // Filter items (will show all initially)
    this.filterAndSortItems();

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
    this.filterAndSortItems();
    this.SelectedIndex = 0; // Reset selection
  }

  /**
   * Filter and sort items (applications and system actions) based on search query
   */
  private filterAndSortItems(): void {
    const query = this.SearchQuery.toLowerCase().trim();

    // If no query, show all items
    if (!query) {
      this.FilteredItems = [...this.AllItems];
      return;
    }

    // Score all items
    const scored = this.AllItems.map((item) => ({
      item,
      score: this.calculateMatchScore(item, query)
    }));

    // Filter to only matches (score > 0)
    const matches = scored.filter((scoredItem) => scoredItem.score > 0);

    // Sort by score (descending)
    matches.sort((a, b) => b.score - a.score);

    // Extract items
    this.FilteredItems = matches.map((scoredItem) => scoredItem.item);
  }

  /**
   * Calculate match score for fuzzy search
   *
   * Scoring:
   * - Exact match: 1000 points
   * - Starts with: 500 points
   * - Contains: 100 points
   * - Keywords match (system actions): 75 points
   * - Description match: 50 points
   * - Initials match: 25 points (e.g., "de" matches "Data Explorer")
   */
  private calculateMatchScore(item: CommandPaletteItem, query: string): number {
    const name = item.name.toLowerCase();
    const desc = (item.description || '').toLowerCase();

    // Exact match (highest priority)
    if (name === query) return 1000;

    // Starts with query (very high priority)
    if (name.startsWith(query)) return 500;

    // Contains query in name (high priority)
    if (name.includes(query)) return 100;

    // Description match (medium priority)
    if (desc.includes(query)) return 50;

    // Keywords match for system actions (medium-high priority)
    if (item.type === 'system-action' && item.keywords) {
      for (const keyword of item.keywords) {
        if (keyword.toLowerCase().includes(query)) {
          return 75; // Between name contains and description
        }
      }
    }

    // Fuzzy match - initials (e.g., "de" matches "Data Explorer")
    const initials = name
      .split(' ')
      .map((word) => word[0] || '')
      .join('')
      .toLowerCase();
    if (initials.includes(query)) return 25;

    return 0; // No match
  }

  /**
   * Select an item (application or system action) and handle appropriately
   */
  SelectItem(item: CommandPaletteItem): void {
    if (this.IsNavigating) return;

    // Close the palette first
    this.service.Close();

    // Handle based on item type
    if (item.type === 'application') {
      // Existing behavior - emit for shell to handle navigation
      this.AppSelected.emit(item.application.ID);
    } else if (item.type === 'system-action') {
      // Execute action directly (no loading state)
      item.action();
    }
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
        this.SelectedIndex = Math.min(this.SelectedIndex + 1, this.FilteredItems.length - 1);
        this.scrollToSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.SelectedIndex = Math.max(this.SelectedIndex - 1, 0);
        this.scrollToSelected();
        break;

      case 'Enter':
        event.preventDefault();
        if (this.FilteredItems[this.SelectedIndex]) {
          this.SelectItem(this.FilteredItems[this.SelectedIndex]);
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

  /**
   * Get all system actions (non-application items like settings, help, etc.)
   * These appear in search results alongside applications.
   */
  private getSystemActions(): SystemActionItem[] {
    return [
      {
        id: 'system-action-my-profile',
        name: 'My Profile',
        description: 'View and edit your profile settings',
        icon: 'fa-solid fa-user-circle',
        type: 'system-action',
        keywords: ['settings', 'preferences', 'account', 'profile', 'user'],
        action: () => this.openMyProfile()
      }
      // Future system actions can be added here:
      // - Help Documentation
      // - Keyboard Shortcuts
      // - Report a Bug
      // - Add Applications (marketplace)
      // - System Status
    ];
  }

  /**
   * Open the My Profile settings dialog
   */
  private openMyProfile(): void {
    this.settingsDialogService.open(this.viewContainerRef);
  }
}
