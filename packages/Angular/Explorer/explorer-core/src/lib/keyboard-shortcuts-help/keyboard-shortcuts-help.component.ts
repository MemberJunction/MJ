import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { KeyboardShortcutsHelpService, KeyboardShortcutService, KeyboardShortcut, KeyCombination } from '@memberjunction/ng-shared';

interface ShortcutCategory {
  name: string;
  shortcuts: KeyboardShortcut[];
}

/**
 * Quick help overlay component for displaying keyboard shortcuts.
 * Triggered by pressing '?' key anywhere in the application.
 * Shows all registered shortcuts grouped by category with platform-specific key displays.
 */
@Component({
  selector: 'mj-keyboard-shortcuts-help',
  templateUrl: './keyboard-shortcuts-help.component.html',
  styleUrls: ['./keyboard-shortcuts-help.component.css']
})
export class KeyboardShortcutsHelpComponent implements OnInit, OnDestroy {
  public IsOpen = false;
  public Categories: ShortcutCategory[] = [];
  public IsMac = false;

  private destroy$ = new Subject<void>();

  constructor(
    private helpService: KeyboardShortcutsHelpService,
    private shortcutService: KeyboardShortcutService
  ) {
    this.IsMac = this.shortcutService.IsMac;
  }

  ngOnInit(): void {
    // Subscribe to overlay open/close state
    this.helpService.IsOpen()
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOpen => {
        this.IsOpen = isOpen;
        if (isOpen) {
          this.loadShortcuts();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all shortcuts and group by category
   */
  private loadShortcuts(): void {
    const shortcuts = this.shortcutService.GetShortcutsArray();

    // Group shortcuts by category (for now, just use "Global" - can be enhanced later)
    // In the future, shortcuts can have a 'category' property
    const categorized: Record<string, KeyboardShortcut[]> = {
      'Global': shortcuts.filter(s => this.isGlobalShortcut(s)),
      'Navigation': shortcuts.filter(s => this.isNavigationShortcut(s)),
    };

    // Convert to array format
    this.Categories = Object.entries(categorized)
      .filter(([_, shortcuts]) => shortcuts.length > 0)
      .map(([name, shortcuts]) => ({ name, shortcuts }));

    // If no categories, put all in Global
    if (this.Categories.length === 0 && shortcuts.length > 0) {
      this.Categories = [{ name: 'Global', shortcuts }];
    }
  }

  /**
   * Determine if a shortcut is a global shortcut (simple heuristic)
   */
  private isGlobalShortcut(shortcut: KeyboardShortcut): boolean {
    const globalKeywords = ['command', 'palette', 'search', 'help', 'open'];
    const name = shortcut.name.toLowerCase();
    return globalKeywords.some(kw => name.includes(kw));
  }

  /**
   * Determine if a shortcut is a navigation shortcut (simple heuristic)
   */
  private isNavigationShortcut(shortcut: KeyboardShortcut): boolean {
    const navKeywords = ['navigate', 'arrow', 'up', 'down', 'enter', 'escape', 'close'];
    const name = shortcut.name.toLowerCase();
    return navKeywords.some(kw => name.includes(kw));
  }

  /**
   * Get the platform-appropriate key combination for display
   */
  public GetPlatformCombination(shortcut: KeyboardShortcut): KeyCombination {
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
   * Close the overlay
   */
  public Close(): void {
    this.helpService.Close();
  }

  /**
   * Handle click on backdrop
   */
  public OnBackdropClick(): void {
    this.Close();
  }

  /**
   * Prevent modal click from closing
   */
  public OnModalClick(event: Event): void {
    event.stopPropagation();
  }

  /**
   * Handle Escape key to close overlay
   */
  @HostListener('document:keydown.escape', ['$event'])
  public OnEscapeKey(event: KeyboardEvent): void {
    if (this.IsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.Close();
    }
  }
}
