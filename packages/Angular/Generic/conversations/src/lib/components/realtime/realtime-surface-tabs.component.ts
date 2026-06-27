import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeActivityRailComponent } from './realtime-activity-rail.component';
import { RealtimeChannelPaneComponent } from './channels/realtime-channel-pane.component';
import { ChannelOnboardingPanelComponent } from './channels/channel-onboarding-panel.component';
import { ChannelOnboardingDetails } from './channels/base-realtime-channel-client';
import {
  RealtimeSurfaceTabsModel, RealtimeSurfaceTab, RealtimeChannelTabRegistration
} from './realtime-surface-tabs.model';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * User-settings key (NOT localStorage — see `UserInfoEngine`) under which the per-user "which
 * channel intros have been seen" map is persisted: a JSON object of `{ [channelName]: true }`,
 * so the first-run onboarding for each interactive channel shows exactly once per user and
 * follows them across devices.
 */
const CHANNEL_ONBOARDING_SEEN_SETTING_KEY = 'mj.realtimeChannels.onboardingSeen.v1';

/**
 * The call overlay's TABBED SURFACE PANEL (the right panel) — decluttered redesign:
 *
 *  - **Channel tabs** (LEFT cluster) — one per channel that has come into play. The whiteboard
 *    tabs immediately at session start; every other channel tabs only once the agent first
 *    USES it. Each carries a distinct accent color + its plugin icon. The pane creates the
 *    plugin's surface component dynamically (via `mj-realtime-channel-pane`); a placeholder
 *    shows the "coming online…" state until a plugin/template is supplied.
 *  - **Activity** (RIGHT-aligned, pinned LAST) — gated: appears only once ≥1 agent run has
 *    occurred (or in review mode). Hosts {@link RealtimeActivityRailComponent}, which now also
 *    renders inline artifact previews and a split-pane artifact viewer. Styled distinctly from
 *    channel tabs (activity-pulse icon + its own accent) and separated from the channel cluster
 *    by a flex spacer.
 *
 * Artifacts NO LONGER get their own tab — they live inside the Activity tab (cleaner than a
 * row of per-artifact tabs).
 *
 * Panes are kept ALIVE while hidden (CSS `display:none`) so switching tabs never reloads a
 * channel surface or resets the rail. The whole panel collapses to a slim strip via the chevron.
 *
 * SIZING IS EXTERNAL: the overlay shell hosts this panel in a fixed-width flex item and owns
 * the width. This panel just fills it and REPORTS the layout signals the shell sizes from:
 * {@link CollapsedChange} (slim-strip toggle) and {@link WideChanged} (a channel tab is focused
 * → the default width tier widens).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-surface-tabs',
  imports: [
    CommonModule, ArtifactsModule, RealtimeActivityRailComponent, RealtimeChannelPaneComponent,
    ChannelOnboardingPanelComponent
  ],
  templateUrl: './realtime-surface-tabs.component.html',
  styleUrl: './realtime-surface-tabs.component.css'
})
export class RealtimeSurfaceTabsComponent implements OnInit, OnDestroy {
  /** How long a just-revealed channel tab keeps its flash highlight. */
  private static readonly FlashDurationMs = 1400;

  /** Shared live-session state, owned by the overlay shell (feeds the Activity rail). */
  @Input({ required: true }) State!: RealtimeSessionState;

  /** Whether developer affordances ("Open run" links) are revealed (gear-gated). */
  @Input() DevMode = false;

  /**
   * FILL presentation: the panel stretches to the overlay's full width (the board-focus
   * layout, where the main call column is hidden and a channel surface owns the screen).
   * Bound by the overlay shell; overrides the normal / wide width tiers.
   */
  @Input() Fill = false;

  /** The signed-in user, threaded to the artifact viewer panel. */
  @Input() CurrentUser: UserInfo | null = null;

  /** The active environment id, threaded to the artifact viewer panel. */
  @Input() EnvironmentID = '';

  /**
   * Extra (review-carryover) artifacts to surface in the Activity tab, NOT tied to a live
   * activity card. Forwarded to the rail's "Session artifacts" group. Empty for a live session.
   */
  @Input() ExtraArtifacts: ParsedDelegationArtifact[] = [];

  /**
   * Whether the gated Activity tab should be shown — driven by the overlay shell once ≥1
   * agent run has occurred (or in review mode). A getter/setter so a late "first run" flips
   * the tab into the strip reactively.
   */
  private _showActivityTab = false;
  @Input()
  set ShowActivityTab(value: boolean) {
    if (value !== this._showActivityTab) {
      this._showActivityTab = value;
      this.Model.SetShowActivityTab(value);
      this.cdr.markForCheck();
    }
  }
  get ShowActivityTab(): boolean {
    return this._showActivityTab;
  }

  /** Re-emitted from the Activity rail's dev "Open run" links. */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /**
   * Emitted when the panel toggles between expanded and the slim collapsed strip —
   * the overlay shell resizes this panel's split area to the strip width.
   */
  @Output() CollapsedChange = new EventEmitter<boolean>();

  /**
   * Emitted when {@link IsWide} flips (a channel tab gained / lost focus) — the
   * overlay shell widens the panel's DEFAULT split-area size while wide (only when
   * the user has never dragged an explicit width).
   */
  @Output() WideChanged = new EventEmitter<boolean>();

  /** The panel's tab state (add / focus / dedupe / flash) — see the model for the rules. */
  public readonly Model = new RealtimeSurfaceTabsModel();

  /** Whether the panel is collapsed to its slim strip. */
  public Collapsed = false;

  /** The embedded Activity rail (owns the inline artifact previews + the split-pane viewer). */
  @ViewChild(RealtimeActivityRailComponent) private activityRail?: RealtimeActivityRailComponent;

  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private lastWide = false;
  private cdr = inject(ChangeDetectorRef);

  /**
   * The channel whose first-run intro is currently being shown (its `ChannelName`), or `null`
   * when no intro is up. Set when the user opens a channel tab they've never seen the intro
   * for; cleared on dismiss. Only one intro shows at a time (the active channel's).
   */
  private onboardingChannelName: string | null = null;
  /** The intro content for {@link onboardingChannelName}, mirrored for the template binding. */
  public OnboardingContent: ChannelOnboardingDetails | null = null;

  /** The currently focused tab. */
  public get ActiveTab(): RealtimeSurfaceTab {
    return this.Model.ActiveTab;
  }

  /** Wide presentation when a channel tab is focused (the Activity tab keeps the normal tier). */
  public get IsWide(): boolean {
    return !this.Collapsed && this.ActiveTab.Kind === 'channel';
  }

  ngOnInit(): void {
    this.subs.push(
      this.Model.Changed$.subscribe(() => this.onModelChanged())
    );
  }

  ngOnDestroy(): void {
    for (const s of this.subs) {
      s.unsubscribe();
    }
    this.subs = [];
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
  }

  /** Toggle the panel between expanded and slim-collapsed. */
  public ToggleCollapsed(): void {
    this.setCollapsed(!this.Collapsed);
  }

  /** Collapse-state transitions funnel through here so the shell always hears about them. */
  private setCollapsed(value: boolean): void {
    if (this.Collapsed !== value) {
      this.Collapsed = value;
      this.CollapsedChange.emit(value);
      this.syncWide();
    }
  }

  /** Emits {@link WideChanged} when the wide tier flips (channel tab focus / collapse). */
  private syncWide(): void {
    const wide = this.IsWide;
    if (wide !== this.lastWide) {
      this.lastWide = wide;
      this.WideChanged.emit(wide);
    }
  }

  /** track fn for the @for over tabs. */
  public TrackTab(index: number, tab: RealtimeSurfaceTab): string {
    return tab.Key;
  }

  /**
   * Focuses the Activity tab and opens the given artifact in the rail's split-pane viewer —
   * the "View →" affordance target on done delegation cards / thread entries. Expands the
   * panel if it was collapsed. Replaces the old "open a tab per artifact" behavior.
   */
  public FocusArtifact(artifact: ParsedDelegationArtifact): void {
    this.setCollapsed(false);
    // An artifact implies a run happened — ensure the Activity tab is present before focusing it.
    this.Model.SetShowActivityTab(true);
    this.Model.Focus(RealtimeSurfaceTabsModel.ActivityTabKey);
    // The rail may not be created yet (panel just expanded) — defer so it exists.
    if (this.activityRail) {
      this.activityRail.OpenArtifact(artifact);
    } else {
      setTimeout(() => this.activityRail?.OpenArtifact(artifact));
    }
    this.cdr.markForCheck();
  }

  /**
   * Registers (or updates) an interactive-channel tab — one per used channel plugin,
   * forwarded from `RealtimeSessionOverlayComponent.RegisterChannelTab`.
   */
  public RegisterChannelTab(registration: RealtimeChannelTabRegistration): void {
    // Microtask defer: the overlay forwards this while handling agent/channel activity, which can
    // land mid change-detection. Adding a tab to Model synchronously then trips NG0100 on the
    // tab-strip bindings (s-tab--active). A microtask lands the mutation in a fresh CD turn —
    // imperceptible for an async reveal, and ordered with any follow-on RevealChannel.
    Promise.resolve().then(() => {
      this.Model.RegisterChannelTab(registration);
      this.cdr.markForCheck();
    });
  }

  /**
   * AUTO-REVEALS a channel surface the moment the agent first acts on it: expands the
   * panel if collapsed, focuses the channel's tab and flashes it — so the user discovers
   * the whiteboard (or any channel) exists the instant it comes alive. No-op for unknown keys.
   */
  public RevealChannel(key: string): void {
    // Microtask defer (same NG0100 reason as RegisterChannelTab): the agent-activity reveal mutates
    // ActiveKey/FlashKey, which feed the tab-strip class bindings; doing it mid-CD trips the
    // ExpressionChanged check. Deferring lands it in a fresh CD turn and stays ordered after any
    // RegisterChannelTab queued just before it.
    Promise.resolve().then(() => {
      this.setCollapsed(false);
      this.Model.Focus(key);
      this.Model.FlashTab(key);
      this.cdr.markForCheck();
    });
  }

  /**
   * Removes a tab from the panel (Activity is irremovable; focus falls back per the model's
   * rules). Used by the overlay shell on a review→live continuation whose live channel set
   * resolved WITHOUT the channel a stale review tab represents (e.g. no Whiteboard channel →
   * drop the read-only review board tab).
   *
   * @returns `true` when a tab was removed.
   */
  public RemoveTab(key: string): boolean {
    const removed = this.Model.RemoveTab(key);
    if (removed) {
      this.cdr.markForCheck();
    }
    return removed;
  }

  /**
   * Registers the reviewed chain's history artifacts so they surface inside the Activity tab.
   * In the redesign there are no per-artifact tabs — the rail picks artifacts up from the
   * session state's cards, so this only needs to ensure the Activity tab is shown (review
   * mode always shows it) and, when `focus` is set, open the artifact in the split viewer.
   */
  public RegisterArtifactTab(artifact: ParsedDelegationArtifact, focus: boolean = false): void {
    this.Model.SetShowActivityTab(true);
    if (focus) {
      this.FocusArtifact(artifact);
    }
    this.cdr.markForCheck();
  }

  /** On model changes: schedule the flash clear, report a wide-tier flip, re-render. */
  private onModelChanged(): void {
    this.scheduleFlashClear();
    this.syncWide();
    this.evaluateOnboarding();
    this.cdr.markForCheck();
  }

  /**
   * Decides whether the first-run channel intro should be visible for the ACTIVE tab: shows it
   * the first time the user opens (focuses) a channel tab whose plugin supplies onboarding and
   * which this user hasn't dismissed before. Re-runs on every model change so switching away
   * from a channel tab tears the intro down (only the active channel's intro is ever up).
   */
  private evaluateOnboarding(): void {
    const tab = this.ActiveTab;
    const plugin = tab.Kind === 'channel' ? tab.Data?.Plugin ?? null : null;
    const details = plugin?.GetOnboardingDetails() ?? null;
    if (!plugin || !details || this.HasSeenOnboarding(plugin.ChannelName)) {
      this.onboardingChannelName = null;
      this.OnboardingContent = null;
      return;
    }
    this.onboardingChannelName = plugin.ChannelName;
    this.OnboardingContent = details;
  }

  /**
   * Dismisses the current channel intro: marks that channel seen for this user (persisted via
   * `UserInfoEngine`, debounced — NOT localStorage) and hides the panel so it never re-appears.
   */
  public DismissOnboarding(): void {
    const channelName = this.onboardingChannelName;
    this.onboardingChannelName = null;
    this.OnboardingContent = null;
    if (channelName) {
      this.markOnboardingSeen(channelName);
    }
    this.cdr.markForCheck();
  }

  /** Reads the per-user seen-map and reports whether this channel's intro has been dismissed. */
  private HasSeenOnboarding(channelName: string): boolean {
    return this.readOnboardingSeen()[channelName] === true;
  }

  /** Persists `channelName` into the per-user seen-map (merge + debounced save). */
  private markOnboardingSeen(channelName: string): void {
    const map = this.readOnboardingSeen();
    if (map[channelName] === true) {
      return;
    }
    map[channelName] = true;
    UserInfoEngine.Instance.SetSettingDebounced(CHANNEL_ONBOARDING_SEEN_SETTING_KEY, JSON.stringify(map));
  }

  /** Reads + parses the per-user seen-map setting (tolerant: malformed / unset → empty map). */
  private readOnboardingSeen(): Record<string, boolean> {
    const raw = UserInfoEngine.Instance.GetSetting(CHANNEL_ONBOARDING_SEEN_SETTING_KEY);
    if (!raw) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, boolean>)
        : {};
    } catch {
      return {};
    }
  }

  /**
   * Focuses the FIRST tab in the strip — channels lead, so a Details peek lands on the
   * marquee surface (e.g. the Whiteboard) when one exists, else on Activity.
   */
  public FocusFirstTab(): void {
    const first = this.Model.Tabs[0];
    if (first) {
      this.Model.Focus(first.Key);
      this.cdr.markForCheck();
    }
  }

  /** Clears the model's flash highlight after a beat (one timer; latest flash wins). */
  private scheduleFlashClear(): void {
    if (this.Model.FlashKey === null) {
      return;
    }
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
    }
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.Model.ClearFlash();
    }, RealtimeSurfaceTabsComponent.FlashDurationMs);
  }
}
