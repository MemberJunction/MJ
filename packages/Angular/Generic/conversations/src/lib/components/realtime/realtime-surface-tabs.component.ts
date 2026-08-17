import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, OnInit, OnDestroy,
  ChangeDetectorRef, QueryList, ViewChild, ViewChildren, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { LogError, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeActivityRailComponent } from './realtime-activity-rail.component';
import { RealtimeChannelPaneComponent } from './channels/realtime-channel-pane.component';
import { ChannelOnboardingPanelComponent } from './channels/channel-onboarding-panel.component';
import { ChannelOnboardingDetails } from './channels/base-realtime-channel-client';
import {
  RealtimeSurfaceTabsModel, RealtimeSurfaceTab, RealtimeChannelTabRegistration,
  RealtimeSurfaceLayoutMode, ResolveSplitPaneKeys
} from './realtime-surface-tabs.model';
import { RealtimeSplitPane, RealtimeSurfaceSplitLayout } from './realtime-surface-split-layout';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * User-settings key (NOT localStorage — see `UserInfoEngine`) under which the per-user "which
 * channel intros have been seen" map is persisted: a JSON object of `{ [channelName]: true }`,
 * so the first-run onboarding for each interactive channel shows exactly once per user and
 * follows them across devices.
 */
const CHANNEL_ONBOARDING_SEEN_SETTING_KEY = 'mj.realtimeChannels.onboardingSeen.v1';

/**
 * How long a `split` layout waits for its Golden Layout host to report a real size before giving
 * up and staying on tabs. The host is a flex child of an already-laid-out panel, so it normally
 * measures on the very first check; the wait covers the panel being rendered inside something
 * that has not sized ITSELF yet (a collapsed shell, a hidden route). Capped because "wait for a
 * size" with no limit is how a surface silently never appears.
 */
const SPLIT_HOST_MEASURE_TIMEOUT_MS = 4000;

/** Whether an element has a real, laid-out box — the precondition for arranging anything in it. */
function IsMeasured(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

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
 * LAYOUT IS DECLARED, NOT IMPOSED: {@link Layout} picks between the tab strip (default, one
 * surface at a time) and a `split` arrangement of the surfaces named by {@link SplitKeys}, shown
 * side by side with draggable splitters. A host asking for two surfaces at once says so through
 * this input rather than overriding the panel's stylesheet — an override that LOOKS applied and
 * silently loses a specificity tie, because the panel's own `display: flex` on `.surface` carries
 * the same specificity and wins on document order (issue #3535). Panes are shared between the two
 * layouts and never re-created by a switch: split mode positions the same elements inline (see
 * {@link RealtimeSurfaceSplitLayout}), so a whiteboard's drawing and a remote browser's page
 * survive it.
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
export class RealtimeSurfaceTabsComponent implements OnInit, AfterViewInit, OnDestroy {
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
   * The panel's LAYOUT MODE — the host's declaration of how many surfaces are on screen:
   *
   *  - `tabs` (default) — unchanged behaviour: the tab strip picks one surface at a time.
   *  - `split` — the surfaces {@link SplitKeys} names are arranged side by side, with draggable
   *    splitters between them, and the strip reports them all as shown.
   *
   * `split` DEGRADES to the tabs presentation whenever it can't be honoured — fewer than two of
   * the requested surfaces are open, the panel is collapsed, or the arrangement fails to lay out
   * (which is reported via `LogError`, never silently). Existing callers pass nothing and get
   * exactly today's panel.
   */
  private _layout: RealtimeSurfaceLayoutMode = 'tabs';
  @Input()
  set Layout(value: RealtimeSurfaceLayoutMode) {
    if (value !== this._layout) {
      this._layout = value;
      this.scheduleSplitSync();
    }
  }
  get Layout(): RealtimeSurfaceLayoutMode {
    return this._layout;
  }

  /**
   * Which surfaces a `split` {@link Layout} shows, by tab key (a channel's `ChannelName`, or
   * `activity`). Keys that aren't open yet are simply not shown — a host may name surfaces the
   * agent hasn't brought into play, and the split grows into them as they register. EMPTY (the
   * default) means "every open surface". Ignored while {@link Layout} is `tabs`.
   */
  private _splitKeys: string[] = [];
  @Input()
  set SplitKeys(value: string[]) {
    const next = value ?? [];
    if (next.length !== this._splitKeys.length || next.some((key, i) => key !== this._splitKeys[i])) {
      this._splitKeys = [...next];
      this.scheduleSplitSync();
    }
  }
  get SplitKeys(): string[] {
    return this._splitKeys;
  }

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

  /**
   * Whether the panel is currently arranged as a SPLIT: renders the Golden Layout host and puts
   * pane visibility under the arrangement's control (`.surface--split`). Distinct from
   * `Layout === 'split'`, which is only the host's request — this is whether it is honoured.
   */
  public SplitEngaged = false;

  /** The embedded Activity rail (owns the inline artifact previews + the split-pane viewer). */
  @ViewChild(RealtimeActivityRailComponent) private activityRail?: RealtimeActivityRailComponent;

  /**
   * The Golden Layout host, as a SETTER: the element only exists once {@link SplitEngaged}
   * renders it, and the arrangement can't be measured before that. Angular calling this back is
   * the signal that the host is now in the DOM and the deferred sync can finish.
   */
  @ViewChild('splitHost')
  private set splitHostRef(ref: ElementRef<HTMLElement> | undefined) {
    const element = ref?.nativeElement ?? null;
    if (element === this.splitHostElement) {
      return;
    }
    this.splitHostElement = element;
    if (element) {
      this.scheduleSplitSync();
    }
  }

  /**
   * The live pane elements. The split resolves each pane by its own `data-channel` rather than
   * by index into this list, and the list's `changes` is the signal that a surface registered
   * mid-session has actually RENDERED — which is when a pending split can take it in.
   */
  @ViewChildren('surfacePane') private paneQuery!: QueryList<ElementRef<HTMLElement>>;

  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private lastWide = false;
  private cdr = inject(ChangeDetectorRef);

  /** The Golden Layout arrangement used by `Layout="split"` (idle until engaged). */
  private readonly splitLayout = new RealtimeSurfaceSplitLayout();
  /** The split's current members, in strip order. Empty while the panel is on tabs. */
  private splitMemberKeys: string[] = [];
  private splitHostElement: HTMLElement | null = null;
  /** Bumped by every layout request so a superseded (awaiting) sync stands down. */
  private splitSyncGeneration = 0;
  /** Live while a sync is waiting for the host to be measured — cancelled on teardown. */
  private splitMeasureWait: { Cancel: () => void } | null = null;

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

  ngAfterViewInit(): void {
    // A surface that comes into play mid-session renders its pane one change-detection pass after
    // it joins the strip; this is how a pending split learns the element now exists.
    this.subs.push(
      this.paneQuery.changes.subscribe(() => {
        if (this._layout === 'split') {
          this.scheduleSplitSync();
        }
      })
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
    // Golden Layout holds DOM and listeners of its own — it goes with the panel, not with GC.
    this.teardownSplit();
  }

  /** Toggle the panel between expanded and slim-collapsed. */
  public ToggleCollapsed(): void {
    this.setCollapsed(!this.Collapsed);
  }

  /** Collapse-state transitions funnel through here so the shell always hears about them. */
  private setCollapsed(value: boolean): void {
    if (this.Collapsed !== value) {
      this.Collapsed = value;
      if (value) {
        // Collapsing removes the panes (and the split host) from the DOM. Hand them back to the
        // tabs layout NOW rather than leaving Golden Layout holding elements Angular is about to
        // destroy — the panes come back on expand and re-split from scratch.
        this.teardownSplit();
      } else {
        this.scheduleSplitSync();
      }
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

  /** The surfaces the split is currently showing, in strip order. Empty while on tabs. */
  public get SplitMemberKeys(): ReadonlyArray<string> {
    return this.splitMemberKeys;
  }

  /**
   * Whether a tab's surface is ON SCREEN — the focused tab on tabs, every split member on a
   * split. The strip's active treatment and `aria-selected` read from this so it stays honest
   * about a layout showing more than one surface at a time.
   */
  public IsTabShown(key: string): boolean {
    return this.SplitEngaged ? this.splitMemberKeys.includes(key) : key === this.Model.ActiveKey;
  }

  /**
   * Whether a tab is unreachable in the current layout — a surface the split isn't showing.
   * Its strip button is disabled rather than left as a click that would do nothing visible:
   * which surfaces a split shows is the host's declaration ({@link SplitKeys}), not the user's.
   */
  public IsTabOutsideSplit(key: string): boolean {
    return this.SplitEngaged && !this.splitMemberKeys.includes(key);
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
    this.resyncSplitOnTabChange();
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

  // ── split layout (Layout="split") ─────────────────────────────────────────────────────────

  /**
   * Re-syncs the split when the STRIP changed under it — a channel registering, or a tab being
   * removed, changes which surfaces the split resolves to. Deliberately silent while the panel is
   * on tabs, so the default layout does no work at all on a model change; whether the membership
   * ACTUALLY changed is the sync's own call, made in one place.
   */
  private resyncSplitOnTabChange(): void {
    if (this._layout === 'split') {
      this.scheduleSplitSync();
    }
  }

  /**
   * Queues a layout sync for the next microtask, superseding any sync still in flight.
   *
   * Deferred for the same reason the channel-tab reveals are (NG0100): a layout request commonly
   * arrives mid change-detection, and this one additionally needs the DOM it is about to measure
   * to have been RENDERED — which the flag it sets is what triggers.
   */
  private scheduleSplitSync(): void {
    const generation = ++this.splitSyncGeneration;
    Promise.resolve().then(() => { void this.syncSplitLayout(generation); });
  }

  /**
   * Brings the actual arrangement in line with {@link Layout} / {@link SplitKeys}.
   *
   * Runs in up to three passes, re-entered by the `splitHost` ViewChild setter: engage (render
   * the host), measure (wait for it to have a size), attach. Anything that makes the split
   * unhonourable at any point — too few surfaces, a collapsed panel, a host that never gains a
   * size, a Golden Layout that lays out nothing — falls back to the tabs presentation, loudly.
   */
  private async syncSplitLayout(generation: number): Promise<void> {
    if (generation !== this.splitSyncGeneration) {
      return;
    }
    const keys = ResolveSplitPaneKeys(this.Model.Tabs, this._splitKeys);
    if (this._layout !== 'split' || this.Collapsed || keys.length === 0) {
      this.teardownSplit();
      return;
    }
    const arranged = this.splitLayout.PaneKeys;
    if (keys.length === arranged.length && keys.every((key, i) => key === arranged[i])) {
      // Already arranged exactly this way. Re-attaching would rebuild the layout and throw away
      // wherever the user has dragged the splitters, for no change at all.
      return;
    }
    if (!this.SplitEngaged) {
      // Pass 1: render the host (and hand pane visibility to the arrangement). The ViewChild
      // setter re-enters once the element exists.
      this.SplitEngaged = true;
      this.splitMemberKeys = keys;
      this.cdr.markForCheck();
      return;
    }
    this.splitMemberKeys = keys;
    const host = this.splitHostElement;
    if (!host) {
      // Engaged but not rendered yet — the ViewChild setter will re-enter with the element.
      return;
    }

    // Pass 2: Golden Layout lays its whole tree into whatever the host measures AT INIT and
    // reports nothing when that is nothing, so the size is established before it ever sees it.
    const measured = await this.waitForMeasuredSplitHost(host, generation);
    if (generation !== this.splitSyncGeneration) {
      return;
    }
    if (!measured) {
      LogError(`Realtime surface panel: the split layout host never gained a size within ${SPLIT_HOST_MEASURE_TIMEOUT_MS}ms (surfaces [${keys.join(', ')}]) — staying on the tabs layout.`);
      this.teardownSplit();
      return;
    }

    // Pass 3: attach. Every pane is looked up by its own data-channel, never by position.
    const panes: RealtimeSplitPane[] = [];
    for (const tab of this.Model.Tabs.filter(t => keys.includes(t.Key))) {
      const element = this.paneElement(tab.Key);
      if (element) {
        panes.push({ Key: tab.Key, Title: tab.Title, Element: element });
      }
    }
    if (panes.length !== keys.length) {
      // A surface that JUST joined the strip renders its pane on the next change-detection pass.
      // Not an error and not a reason to collapse the split — the pane list's `changes` re-enters
      // here the moment the element exists.
      return;
    }
    if (!this.splitLayout.Attach(host, panes)) {
      // Attach already reported WHY, and left the panes as it found them.
      this.teardownSplit();
      return;
    }
    this.cdr.markForCheck();
  }

  /**
   * Resolves once the split host reports a non-zero size, `false` if it never does within
   * {@link SPLIT_HOST_MEASURE_TIMEOUT_MS} or the sync is superseded. Never throws: the caller
   * degrades to tabs, which is the useful answer for a live session.
   */
  private waitForMeasuredSplitHost(host: HTMLElement, generation: number): Promise<boolean> {
    this.cancelSplitMeasureWait();
    if (IsMeasured(host)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>(resolve => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let observer: ResizeObserver | null = null;
      const settle = (measured: boolean): void => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        observer?.disconnect();
        observer = null;
        this.splitMeasureWait = null;
        resolve(measured);
      };
      observer = new ResizeObserver(() => {
        if (generation !== this.splitSyncGeneration) {
          settle(false);
        } else if (IsMeasured(host)) {
          settle(true);
        }
      });
      timer = setTimeout(() => settle(false), SPLIT_HOST_MEASURE_TIMEOUT_MS);
      this.splitMeasureWait = { Cancel: () => settle(false) };
      observer.observe(host);
    });
  }

  /** Drops a pending measure wait (teardown / a superseding request) so nothing dangles. */
  private cancelSplitMeasureWait(): void {
    const wait = this.splitMeasureWait;
    this.splitMeasureWait = null;
    wait?.Cancel();
  }

  /**
   * Returns the panel to the tabs layout: Golden Layout destroyed, every pane's inline geometry
   * removed, the host un-rendered. Idempotent — the panel spends most of its life here.
   */
  private teardownSplit(): void {
    this.cancelSplitMeasureWait();
    this.splitLayout.Destroy();
    this.splitMemberKeys = [];
    if (this.SplitEngaged) {
      this.SplitEngaged = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The live pane element for a tab key. Matched on the pane's own `data-channel` rather than by
   * index into the tab list: both lists render from the same array today, but that is an
   * implementation detail and not something a layout should be built on.
   */
  private paneElement(key: string): HTMLElement | null {
    for (const ref of this.paneQuery ?? []) {
      if (ref.nativeElement.dataset['channel'] === key) {
        return ref.nativeElement;
      }
    }
    return null;
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
