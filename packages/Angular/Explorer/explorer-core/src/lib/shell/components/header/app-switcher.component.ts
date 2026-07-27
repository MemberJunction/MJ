import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { UserAppConfigContentComponent } from '@memberjunction/ng-explorer-settings';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';

/** UserInfoEngine setting key holding the recently-switched-to apps */
const RECENT_APPS_KEY = 'mj.shell.recentApps.v1';
/** UserInfoEngine setting key for the launcher's All-apps sort preference */
const LAUNCHER_SORT_KEY = 'mj.shell.launcherSort.v1';
/** How many recent entries to persist (display shows fewer) */
const RECENT_STORE_MAX = 8;
/** How many recent cards to display */
const RECENT_DISPLAY_MAX = 3;
/** 'auto' style: below this many apps the compact anchored panel is used */
const COMPACT_AUTO_THRESHOLD = 8;
/** Compact mode: the filter input appears only at or above this many apps */
const COMPACT_FILTER_THRESHOLD = 10;

/**
 * Presentation style for the app switcher, resolved from the
 * `Shell.AppSwitcher.Style` instance-config key:
 * - 'launcher': always the centered card launcher
 * - 'compact': always the anchored compact panel (dropdown-like)
 * - 'auto' (default): compact below {@link COMPACT_AUTO_THRESHOLD} apps
 */
export type AppSwitcherStyle = 'launcher' | 'compact' | 'auto';

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
 * Rendering model: the panel is a native <dialog> opened with showModal(),
 * so it lives in the browser's TOP LAYER — above every stacking context in
 * the app (the shell header's z-index:500 context, chat FAB, toasts). The
 * modal state also makes the rest of the document inert (focus cannot
 * escape) and the browser restores focus to the trigger on close.
 *
 * Accessibility model: every app card is a real focusable control (via
 * mjClickable), so Tab walks filter → close → cards → Configure, and
 * Enter/Space activate the focused card. Arrow keys are the fast path:
 * ArrowDown from the filter focuses the first card; arrows move between
 * cards; ArrowUp from the first card returns to the filter. Escape layers:
 * discard-bar → config view → filter → close. Exiting the config view with
 * unsaved changes shows an inline discard bar (a body-appended confirm
 * dialog would be inert/beneath the top layer).
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
  /** Presentation style (from Shell.AppSwitcher.Style instance config) */
  @Input() switcherStyle: AppSwitcherStyle = 'auto';
  @Output() appSelected = new EventEmitter<string>();

  @ViewChild('filterInput') private filterInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLDialogElement>;
  @ViewChild(UserAppConfigContentComponent) private configContent?: UserAppConfigContentComponent;

  showDropdown = false;
  /** When true, the launcher body shows the app-configuration view instead of the card grid */
  public ConfigMode = false;
  /** Pending action awaiting the inline unsaved-changes discard bar ('exit' = back to grid, 'close' = close launcher) */
  public PendingDiscard: 'exit' | 'close' | null = null;
  /** True when the panel renders as the compact anchored dropdown (few apps) */
  public CompactMode = false;
  /** All-apps sort: the user's configured order ('custom') or A–Z ('alpha').
   *  Per-user preference, persisted via UserInfoEngine. */
  public SortMode: 'custom' | 'alpha' = 'custom';
  /** Anchor position for the compact panel (px, from the trigger's rect) */
  public AnchorLeft = 0;
  public AnchorTop = 0;

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

  /** Recently-used apps (persisted per user), newest first, capped for display.
   *  Compact mode skips the Recent section — with a handful of apps it's noise. */
  get RecentApps(): BaseApplication[] {
    if (this.CompactMode) {
      return [];
    }
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

  /** Every switcher app not already shown in the Recent section, in the
   *  user's chosen sort (custom Sequence order or A–Z) */
  get OtherApps(): BaseApplication[] {
    const recentIds = new Set(this.RecentAppsUnfiltered.map(a => NormalizeUUID(a.ID)));
    let list = this.apps.filter(a => !recentIds.has(NormalizeUUID(a.ID)));
    if (this.SortMode === 'alpha') {
      list = [...list].sort((a, b) => a.Name.localeCompare(b.Name));
    }
    return this.applyFilter(list);
  }

  /** Flat visible list (Recent then All) — the keyboard-navigation order */
  get VisibleApps(): BaseApplication[] {
    return [...this.RecentApps, ...this.OtherApps];
  }

  /** True when a filter is active (sections collapse into one result list) */
  get IsFiltering(): boolean {
    return this.FilterText.trim().length > 0;
  }

  /** Compact mode hides the filter under a handful of apps — it's noise there */
  get ShowFilter(): boolean {
    return !this.CompactMode || this.apps.length >= COMPACT_FILTER_THRESHOLD;
  }

  private get RecentAppsUnfiltered(): BaseApplication[] {
    if (this.CompactMode) {
      return [];
    }
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

  /** Flip the All-apps sort and persist it (fail-silent, like recents) */
  ToggleSortMode(): void {
    this.SortMode = this.SortMode === 'alpha' ? 'custom' : 'alpha';
    try {
      UserInfoEngine.Instance.SetSettingDebounced(LAUNCHER_SORT_KEY, this.SortMode);
    } catch {
      // Preference persistence must never break the launcher
    }
  }

  private loadSortMode(): void {
    try {
      this.SortMode = UserInfoEngine.Instance.GetSetting(LAUNCHER_SORT_KEY) === 'alpha' ? 'alpha' : 'custom';
    } catch {
      this.SortMode = 'custom';
    }
  }

  private openLauncher(): void {
    this.loadRecents();
    this.loadSortMode();
    this.FilterText = '';
    this.ConfigMode = false;
    this.PendingDiscard = null;
    this.CompactMode = this.resolveCompactMode();
    if (this.CompactMode) {
      this.computeCompactAnchor();
    }
    this.showDropdown = true;
    // The dialog element renders under @if next frame: put it in the top
    // layer via showModal() (jsdom fallback: plain open attribute), then
    // focus the filter (or the first card when compact mode hides it).
    requestAnimationFrame(() => {
      const dialog = this.panelRef?.nativeElement;
      if (dialog && !dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
      if (this.ShowFilter) {
        this.filterInputRef?.nativeElement?.focus();
      } else {
        dialog?.querySelector<HTMLElement>('.app-card')?.focus();
      }
    });
  }

  /** Resolve the presentation for this open (auto = compact under the threshold) */
  private resolveCompactMode(): boolean {
    if (this.switcherStyle === 'compact') {
      return true;
    }
    if (this.switcherStyle === 'launcher') {
      return false;
    }
    return this.apps.length < COMPACT_AUTO_THRESHOLD;
  }

  /** Anchor the compact panel under the trigger, clamped to the viewport */
  private computeCompactAnchor(): void {
    const rect = this.triggerRef?.nativeElement?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const panelWidth = 320; // Keep in sync with .launcher-panel--compact width
    const margin = 8;
    this.AnchorLeft = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin));
    this.AnchorTop = rect.bottom + margin;
  }

  private closeLauncher(restoreFocus = true): void {
    const dialog = this.panelRef?.nativeElement;
    if (dialog?.open && typeof dialog.close === 'function') {
      dialog.close(); // Browser restores focus to the trigger automatically
    }
    this.showDropdown = false;
    this.FilterText = '';
    this.ConfigMode = false;
    this.PendingDiscard = null;
    if (restoreFocus) {
      requestAnimationFrame(() => {
        this.triggerRef?.nativeElement?.focus();
      });
    }
  }

  /** Guarded close for template paths (backdrop / close button): unsaved
   *  config changes surface the inline discard bar instead of closing. */
  CloseLauncher(): void {
    if (this.ConfigMode && this.configContent?.HasChanges()) {
      this.PendingDiscard = 'close';
      return;
    }
    this.closeLauncher();
  }

  /** Backdrop clicks arrive as clicks on the <dialog> element itself */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.panelRef?.nativeElement) {
      this.CloseLauncher();
    }
  }

  /** Native cancel (Esc while the browser owns the dialog) — route through
   *  our layered Escape handling instead of closing unconditionally. */
  onDialogCancel(event: Event): void {
    event.preventDefault();
    this.handleEscape();
  }

  /** Inline discard bar: confirm — perform the pending action, dropping changes */
  ConfirmDiscard(): void {
    const action = this.PendingDiscard;
    this.PendingDiscard = null;
    if (action === 'close') {
      this.closeLauncher();
    } else if (action === 'exit') {
      this.ExitConfigMode();
    }
  }

  /** Inline discard bar: keep editing */
  CancelDiscard(): void {
    this.PendingDiscard = null;
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
        // While filtering, Enter opens the top result (omnibar semantics —
        // the footer advertises "↵ open"); unfiltered it needs an unambiguous
        // single app.
        if (this.IsFiltering && visible.length > 0) {
          this.selectApp(visible[0]);
        } else if (visible.length === 1) {
          this.selectApp(visible[0]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        // Stop the bubble: the panel's own Escape handler would otherwise
        // re-evaluate AFTER we've mutated state and double-handle the key.
        event.stopPropagation();
        this.handleEscape();
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
  /** Escape layering: discard bar → config view (guarded) → filter → close.
   *  Tab is NOT manually trapped — showModal() makes the background inert,
   *  which is a real trap (no leak when focus sits on a non-focusable). */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.handleEscape();
    }
  }

  private handleEscape(): void {
    if (this.PendingDiscard) {
      this.CancelDiscard();
    } else if (this.ConfigMode) {
      this.RequestExitConfigMode();
    } else if (this.IsFiltering) {
      this.FilterText = '';
      this.filterInputRef?.nativeElement?.focus();
    } else {
      this.closeLauncher();
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
    this.PendingDiscard = null;
    // Move focus into the config view (the back button is its first focusable)
    requestAnimationFrame(() => {
      this.panelRef?.nativeElement
        ?.querySelector<HTMLElement>('.launcher-back')?.focus();
    });
  }

  /** Guarded exit from the config view: unsaved changes surface the inline
   *  discard bar instead of silently dropping the user's edits. */
  RequestExitConfigMode(): void {
    if (this.configContent?.HasChanges()) {
      this.PendingDiscard = 'exit';
      return;
    }
    this.ExitConfigMode();
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
