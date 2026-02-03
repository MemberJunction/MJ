import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { KeyboardShortcutService, KeyboardShortcut, KeyCombination } from '@memberjunction/ng-shared';

/**
 * Settings tab component for managing keyboard shortcuts.
 *
 * Features:
 * - Display all registered shortcuts
 * - Search/filter shortcuts by name, description, or key combination
 * - Reset individual shortcuts to default
 * - Reset all shortcuts to defaults (with confirmation)
 * - Platform-specific key display (Cmd on Mac, Ctrl on Windows/Linux)
 * - Show customization indicators
 *
 * Usage:
 * Embedded in settings component via:
 * ```html
 * <mj-keyboard-shortcuts-settings></mj-keyboard-shortcuts-settings>
 * ```
 */
@Component({
  selector: 'mj-keyboard-shortcuts-settings',
  templateUrl: './keyboard-shortcuts-settings.component.html',
  styleUrls: ['./keyboard-shortcuts-settings.component.css']
})
export class KeyboardShortcutsSettingsComponent implements OnInit, OnDestroy {
  public SearchQuery = '';
  public AllShortcuts: KeyboardShortcut[] = [];
  public FilteredShortcuts: KeyboardShortcut[] = [];
  public IsLoading = false;
  public IsResetting = false;
  public IsMac = false;
  public HasChanges = false;

  private destroy$ = new Subject<void>();

  constructor(
    private shortcutService: KeyboardShortcutService
  ) {
    this.IsMac = this.shortcutService.IsMac;
  }

  ngOnInit(): void {
    this.loadShortcuts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all registered shortcuts from the service
   */
  private loadShortcuts(): void {
    this.IsLoading = true;

    // Subscribe to shortcuts observable for reactive updates
    this.shortcutService.GetShortcuts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(shortcuts => {
        this.AllShortcuts = shortcuts;
        this.FilterShortcuts();
        this.IsLoading = false;
        this.checkForChanges();
      });
  }

  /**
   * Filter shortcuts based on search query
   * Searches: name, description, and key combination
   */
  public FilterShortcuts(): void {
    const query = this.SearchQuery.toLowerCase().trim();

    if (!query) {
      this.FilteredShortcuts = [...this.AllShortcuts];
      return;
    }

    this.FilteredShortcuts = this.AllShortcuts.filter(shortcut => {
      // Search in name
      if (shortcut.name.toLowerCase().includes(query)) {
        return true;
      }

      // Search in description
      if (shortcut.description?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in key combination
      const keys = this.FormatKeyCombination(this.GetCombination(shortcut)).join('').toLowerCase();
      if (keys.includes(query)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Handle search input change
   */
  public OnSearchChange(): void {
    this.FilterShortcuts();
  }

  /**
   * Reset a single shortcut to default
   */
  public async ResetShortcut(shortcut: KeyboardShortcut): Promise<void> {
    if (!this.IsCustomized(shortcut)) {
      return; // Already at default
    }

    try {
      await this.shortcutService.ResetToDefault(shortcut.id);
      // Observable will update automatically
    } catch (error) {
      console.error('Failed to reset shortcut:', error);
    }
  }

  /**
   * Reset all shortcuts to defaults (with confirmation)
   */
  public async ResetAll(): Promise<void> {
    const confirmed = confirm(
      'Are you sure you want to reset all keyboard shortcuts to their defaults?\n\n' +
      'This will remove all your customizations.'
    );

    if (!confirmed) {
      return;
    }

    try {
      this.IsResetting = true;
      await this.shortcutService.ResetAll();
      // Observable will update automatically
    } catch (error) {
      console.error('Failed to reset all shortcuts:', error);
    } finally {
      this.IsResetting = false;
    }
  }

  /**
   * Check if a shortcut has been customized
   */
  public IsCustomized(shortcut: KeyboardShortcut): boolean {
    return this.shortcutService.IsCustomized(shortcut.id);
  }

  /**
   * Get the current combination for a shortcut (platform-specific)
   */
  public GetCombination(shortcut: KeyboardShortcut): KeyCombination {
    return this.shortcutService.GetPlatformCombination(shortcut);
  }

  /**
   * Format a key combination for display
   * Returns an array of key parts to render as separate badges
   */
  public FormatKeyCombination(combination: KeyCombination): string[] {
    const parts: string[] = [];

    if (combination.modifiers.ctrl) {
      parts.push(this.IsMac ? '⌃' : 'Ctrl');
    }
    if (combination.modifiers.alt) {
      parts.push(this.IsMac ? '⌥' : 'Alt');
    }
    if (combination.modifiers.shift) {
      parts.push(this.IsMac ? '⇧' : 'Shift');
    }
    if (combination.modifiers.meta) {
      parts.push(this.IsMac ? '⌘' : 'Win');
    }

    // Add the main key (capitalize single letters)
    const key = combination.key.length === 1
      ? combination.key.toUpperCase()
      : combination.key;
    parts.push(key);

    return parts;
  }

  /**
   * Get count of customized shortcuts
   */
  public get CustomizedCount(): number {
    return this.AllShortcuts.filter(s => this.IsCustomized(s)).length;
  }

  /**
   * Check if there are any changes from defaults
   */
  private checkForChanges(): void {
    this.HasChanges = this.CustomizedCount > 0;
  }

  /**
   * Track by function for ngFor optimization
   */
  public TrackByShortcutId(index: number, shortcut: KeyboardShortcut): string {
    return shortcut.id;
  }
}
