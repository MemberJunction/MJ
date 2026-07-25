import { Component, Input, Output, EventEmitter, HostListener, ViewChild, ElementRef } from '@angular/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';

/** UserInfoEngine setting key holding the recently-switched-to apps */
const RECENT_APPS_KEY = 'mj.shell.recentApps.v1';
/** How many recent entries to persist (display shows fewer) */
const RECENT_STORE_MAX = 8;
/** How many recent cards to display */
const RECENT_DISPLAY_MAX = 3;

interface RecentAppEntry {
  id: string;
  ts: number;
}

/**
 * App switcher in the header: the trigger shows the active app's identity
 * glyph; activating it opens a centered launcher overlay — a filterable grid
 * of app cards (identity glyph + name + Description summary), with the user's
 * most recently used apps surfaced first.
 *
 * Accessibility model: every app card is a real focusable control (via
 * mjClickable), so Tab walks filter → close → cards → Configure, and
 * Enter/Space activate the focused card. Arrow keys are the fast path:
 * ArrowDown from the filter focuses the first card; arrows move between
 * cards; ArrowUp from the first card returns to the filter. Escape clears
 * an active filter first, then closes. Tab is trapped inside the panel and
 * focus returns to the trigger on close.
 */
@Component({
  standalone: false,
  selector: 'mj-app-switcher',
  templateUrl: './app-switcher.component.html',
  styleUrls: ['./app-switcher.component.css']
})
export class AppSwitcherComponent {
  @Input() activeApp: BaseApplication | null = null;
  @Input() isViewingSystemTab = false;
  /** ID of the app currently being loaded (shows loading indicator) */
  @Input() loadingAppId: string | null = null;
  @Output() appSelected = new EventEmitter<string>();

  @ViewChild('filterInput') private filterInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  showDropdown = false;
  /** When true, the launcher body shows the app-configuration view instead of the card grid */
  public ConfigMode = false;

  /** Live filter text — matches app names AND Description summaries */
  public FilterText = '';

  private recentEntries: RecentAppEntry[] = [];

  constructor(private appManager: ApplicationManager) {}

  /** Template handler for the filter input's input event */
  onFilterInput(event: Event): void {
    this.FilterText = (event.target as HTMLInputElement).value;
    this.onFilterChange();
  }

  /**
   * Check if the app switcher should show loading state
   */
  get isLoading(): boolean {
    return this.loadingAppId !== null;
  }

  /**
   * Visible trigger label: the current app's name, or "Apps" when there's no
   * app context (system tabs, nothing active yet).
   */
  get TriggerLabel(): string {
    return this.activeApp && !this.isViewingSystemTab ? this.activeApp.Name : 'Apps';
  }

  /** Accessible name for the trigger — names the control AND the current app */
  get TriggerAriaLabel(): string {
    return this.activeApp && !this.isViewingSystemTab
      ? `Switch application — current: ${this.activeApp.Name}`
      : 'Switch application';
  }

  /**
   * Get applications that should appear in the app switcher
   * (NavigationStyle = 'App Switcher' or 'Both')
   */
  get apps(): BaseApplication[] {
    return this.appManager.GetAppSwitcherApps();
  }

  /** Recently-used apps (persisted per user), newest first, capped for display */
  get RecentApps(): BaseApplication[] {
    const byId = new Map(this.apps.map(a => [NormalizeUUID(a.ID), a]));
    const result: BaseApplication[] = [];
    for (const entry of this.recentEntries) {
      const app = byId.get(NormalizeUUID(entry.id));
      if (app) {
        result.push(app);
        if (result.length >= RECENT_DISPLAY_MAX) {
          break;
        }
      }
    }
    return this.applyFilter(result);
  }

  /** Every switcher app not already shown in the Recent section */
  get OtherApps(): BaseApplication[] {
    const recentIds = new Set(this.RecentAppsUnfiltered.map(a => NormalizeUUID(a.ID)));
    return this.applyFilter(this.apps.filter(a => !recentIds.has(NormalizeUUID(a.ID))));
  }

  /** Flat visible list (Recent then All) — the keyboard-navigation order */
  get VisibleApps(): BaseApplication[] {
    return [...this.RecentApps, ...this.OtherApps];
  }

  /** True when a filter is active (sections collapse into one result list) */
  get IsFiltering(): boolean {
    return this.FilterText.trim().length > 0;
  }

  private get RecentAppsUnfiltered(): BaseApplication[] {
    const byId = new Map(this.apps.map(a => [NormalizeUUID(a.ID), a]));
    const result: BaseApplication[] = [];
    for (const entry of this.recentEntries) {
      const app = byId.get(NormalizeUUID(entry.id));
      if (app) {
        result.push(app);
        if (result.length >= RECENT_DISPLAY_MAX) {
          break;
        }
      }
    }
    return result;
  }

  private applyFilter(apps: BaseApplication[]): BaseApplication[] {
    const q = this.FilterText.trim().toLowerCase();
    if (!q) {
      return apps;
    }
    return apps.filter(a =>
      a.Name.toLowerCase().includes(q) || (a.Description || '').toLowerCase().includes(q));
  }

  /** Stable DOM id for a card (arrow-key focus target) */
  OptionId(index: number): string {
    return `mj-launcher-opt-${index}`;
  }

  ToggleLauncher(): void {
    if (this.showDropdown) {
      this.closeLauncher();
    } else {
      this.openLauncher();
    }
  }

  private openLauncher(): void {
    this.loadRecents();
    this.FilterText = '';
    this.ConfigMode = false;
    this.showDropdown = true;
    // Focus the filter once the panel renders
    requestAnimationFrame(() => this.filterInputRef?.nativeElement?.focus());
  }

  private closeLauncher(restoreFocus = true): void {
    this.showDropdown = false;
    this.FilterText = '';
    this.ConfigMode = false;
    if (restoreFocus) {
      requestAnimationFrame(() => {
        this.triggerRef?.nativeElement?.focus();
      });
    }
  }

  /** Public close hook for template (scrim / close button) */
  CloseLauncher(): void {
    this.closeLauncher();
  }

  onFilterChange(): void {
    // Filtering re-renders the card set; nothing else to sync — focus stays
    // in the input and Tab/arrows reach the new result set naturally.
  }

  /** Keyboard model on the filter input */
  onFilterKeydown(event: KeyboardEvent): void {
    const visible = this.VisibleApps;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusCard(0);
        break;
      case 'Enter':
        event.preventDefault();
        // Enter in the filter opens an unambiguous single result
        if (visible.length === 1) {
          this.selectApp(visible[0]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        // Stop the bubble: the panel's own Escape handler would otherwise
        // re-evaluate AFTER we've cleared the filter and close the launcher
        // in the same keystroke.
        event.stopPropagation();
        if (this.IsFiltering) {
          this.FilterText = '';
          this.onFilterChange();
        } else {
          this.closeLauncher();
        }
        break;
    }
  }

  /** Arrow-key navigation between focused cards */
  onCardKeydown(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.focusCard(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        if (index === 0) {
          this.filterInputRef?.nativeElement?.focus();
        } else {
          this.focusCard(index - 1);
        }
        break;
      case 'Home':
        event.preventDefault();
        this.focusCard(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusCard(this.VisibleApps.length - 1);
        break;
    }
  }

  /** Move DOM focus to the card at the given VisibleApps index (clamped) */
  private focusCard(index: number): void {
    const count = this.VisibleApps.length;
    if (count === 0) {
      return;
    }
    const clamped = Math.min(count - 1, Math.max(0, index));
    const el = document.getElementById(this.OptionId(clamped));
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Keep Tab cycling within the launcher's real focusables (filter, close, Configure) */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Escape layering: config view backs out to the app grid first; an
      // active filter clears next; only then does Escape close the launcher.
      event.preventDefault();
      if (this.ConfigMode) {
        this.ExitConfigMode();
      } else if (this.IsFiltering) {
        this.FilterText = '';
        this.filterInputRef?.nativeElement?.focus();
      } else {
        this.closeLauncher();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const panel = this.panelRef?.nativeElement;
    if (!panel) {
      return;
    }
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex="0"]'));
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Select an application.
   * When viewing a system tab, always emit to allow returning to the app.
   */
  selectApp(app: BaseApplication): void {
    this.recordRecent(app);
    this.closeLauncher(false); // Focus moves into the app, not back to the trigger
    if (!UUIDsEqual(app.ID, this.activeApp?.ID) || this.isViewingSystemTab) {
      this.appSelected.emit(app.ID);
    }
  }

  /** Case-insensitive UUID check whether an app is the currently active app. */
  IsActiveApp(app: BaseApplication): boolean {
    return UUIDsEqual(app.ID, this.activeApp?.ID);
  }

  /** Case-insensitive UUID check whether an app is the one currently loading. */
  IsLoadingApp(app: BaseApplication): boolean {
    return UUIDsEqual(app.ID, this.loadingAppId);
  }

  /**
   * Close launcher when clicking outside
   */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.showDropdown && !target.closest('.app-switcher-container')) {
      this.closeLauncher(false);
    }
  }

  // ---- Recents persistence (MJ: User Settings via UserInfoEngine) ----

  private loadRecents(): void {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(RECENT_APPS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      this.recentEntries = Array.isArray(parsed)
        ? parsed.filter((e: RecentAppEntry) => e && typeof e.id === 'string' && typeof e.ts === 'number')
        : [];
    } catch {
      this.recentEntries = [];
    }
  }

  private recordRecent(app: BaseApplication): void {
    const id = NormalizeUUID(app.ID);
    this.recentEntries = [
      { id, ts: Date.now() },
      ...this.recentEntries.filter(e => NormalizeUUID(e.id) !== id)
    ].slice(0, RECENT_STORE_MAX);
    try {
      UserInfoEngine.Instance.SetSettingDebounced(RECENT_APPS_KEY, JSON.stringify(this.recentEntries));
    } catch {
      // Settings persistence must never block app switching (e.g. engine not
      // configured in tests or permission-constrained sessions).
    }
  }

  /**
   * Swap the launcher body to the app-configuration view (in-panel, seamless —
   * no separate dialog). The embedded mj-user-app-config-content loads on
   * creation.
   */
  EnterConfigMode(): void {
    this.ConfigMode = true;
    this.FilterText = '';
    // Move focus into the config view (the back button is its first focusable)
    requestAnimationFrame(() => {
      this.panelRef?.nativeElement
        ?.querySelector<HTMLElement>('.launcher-back')?.focus();
    });
  }

  /**
   * Return from the configuration view to the app grid.
   * The app list refreshes reactively after a save: each UserApplication save
   * fires a BaseEntity event, UserInfoEngine's debounced refresh emits
   * DataChange$, and ApplicationManager.syncFromEngine() pushes the new list
   * to applications$, which the `apps` getter reads. No explicit reload needed.
   */
  ExitConfigMode(): void {
    this.ConfigMode = false;
    requestAnimationFrame(() => this.filterInputRef?.nativeElement?.focus());
  }
}
