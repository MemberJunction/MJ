import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeActivityRailComponent } from './realtime-activity-rail.component';
import { RealtimeChannelPaneComponent } from './channels/realtime-channel-pane.component';
import {
  RealtimeSurfaceTabsModel, RealtimeSurfaceTab, RealtimeChannelTabRegistration
} from './realtime-surface-tabs.model';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * The call overlay's TABBED SURFACE PANEL (the right panel) — per the approved
 * `plans/realtime/mockups/whiteboard.html` mockup:
 *
 *  - **Activity** — always the first tab; hosts the existing
 *    {@link RealtimeActivityRailComponent} unchanged (in `Embedded` mode, since this panel
 *    owns the chrome + collapse).
 *  - **One tab per artifact** produced by delegated runs: when a delegation result carries
 *    artifacts, a tab is auto-opened, FOCUSED, and briefly flashed violet. The pane reuses
 *    the standard `mj-artifact-viewer-panel` (read-only embed: no header/tabs/actions),
 *    loading by ArtifactID — the latest version, i.e. the one the run just produced.
 *  - **Channel tabs** — rendered ONLY once a channel registers via
 *    {@link RegisterChannelTab}. The overlay shell registers one per registry-resolved
 *    {@link BaseRealtimeChannelClient} plugin; the pane creates the plugin's surface
 *    component dynamically (via `mj-realtime-channel-pane`). Until a registration supplies
 *    a plugin (or legacy template), the pane shows the "coming online…" placeholder;
 *    re-registering the same key swaps the real surface in.
 *
 * Panes are kept ALIVE while hidden (CSS `display:none`, mirroring the mockup's
 * `.s-pane.active`) so switching tabs never reloads an artifact or resets the rail.
 * The whole panel collapses to a slim strip via the chevron at the tab strip's end —
 * the collapse-to-strip behavior that used to live on the rail, lifted to the panel.
 *
 * SIZING IS EXTERNAL: the overlay shell hosts this panel in an `angular-split` area
 * and owns the width (user drag + persisted preference + default tiers). This panel
 * just fills its area and REPORTS the layout signals the shell sizes from:
 * {@link CollapsedChange} (slim-strip toggle) and {@link WideChanged} (a content tab
 * is focused → the default width tier widens).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-surface-tabs',
  imports: [CommonModule, ArtifactsModule, RealtimeActivityRailComponent, RealtimeChannelPaneComponent],
  templateUrl: './realtime-surface-tabs.component.html',
  styleUrl: './realtime-surface-tabs.component.css'
})
export class RealtimeSurfaceTabsComponent implements OnInit, OnDestroy {
  /** How long a just-arrived tab keeps its violet flash highlight. */
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

  /** Re-emitted from the Activity rail's dev "Open run" links. */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /**
   * Emitted when the panel toggles between expanded and the slim collapsed strip —
   * the overlay shell resizes this panel's split area to the strip width.
   */
  @Output() CollapsedChange = new EventEmitter<boolean>();

  /**
   * Emitted when {@link IsWide} flips (a content tab gained / lost focus) — the
   * overlay shell widens the panel's DEFAULT split-area size while wide (only when
   * the user has never dragged an explicit width).
   */
  @Output() WideChanged = new EventEmitter<boolean>();

  /** The panel's tab state (add / focus / dedupe / flash) — see the model for the rules. */
  public readonly Model = new RealtimeSurfaceTabsModel();

  /** Whether the panel is collapsed to its slim strip. */
  public Collapsed = false;

  /** Artifact version ids already turned into tabs (guards the State rescan). */
  private tabbedVersionIds = new Set<string>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private lastWide = false;
  private cdr = inject(ChangeDetectorRef);

  /** The currently focused tab. */
  public get ActiveTab(): RealtimeSurfaceTab {
    return this.Model.ActiveTab;
  }

  /** Wide presentation when a content tab (artifact / channel) is focused. */
  public get IsWide(): boolean {
    return !this.Collapsed && this.ActiveTab.Kind !== 'activity';
  }

  ngOnInit(): void {
    this.subs.push(
      this.State.Changed$.subscribe(() => this.onStateChanged()),
      this.Model.Changed$.subscribe(() => this.onModelChanged())
    );
    this.syncArtifactTabs();
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

  /** Emits {@link WideChanged} when the wide tier flips (content tab focus / collapse). */
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
   * Focuses (opening if needed) the tab for an artifact — the "View →" affordance target
   * on done delegation cards and rail entries. Expands the panel if it was collapsed.
   */
  public FocusArtifact(artifact: ParsedDelegationArtifact): void {
    this.tabbedVersionIds.add(artifact.ArtifactVersionID);
    this.Model.OpenArtifactTab(artifact, true);
    this.setCollapsed(false);
    this.cdr.markForCheck();
  }

  /**
   * Registers (or updates) an interactive-channel tab — one per registry-resolved channel
   * plugin, forwarded from `RealtimeSessionOverlayComponent.RegisterChannelTab`.
   */
  public RegisterChannelTab(registration: RealtimeChannelTabRegistration): void {
    this.Model.RegisterChannelTab(registration);
    this.cdr.markForCheck();
  }

  /**
   * Removes a tab from the panel (Activity is irremovable; focus falls back to Activity —
   * see {@link RealtimeSurfaceTabsModel.RemoveTab}). Used by the overlay shell on a
   * review→live continuation whose live channel set resolved WITHOUT the channel a stale
   * review tab represents (e.g. no Whiteboard channel → drop the read-only review board tab).
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
   * Registers an artifact tab WITHOUT stealing focus (default) — the SESSION REVIEW /
   * resume-carryover path, where a reviewed session's (and its prior legs') history
   * artifacts are surfaced as tabs the user can visit, as opposed to the live
   * auto-open-on-arrival behavior. Idempotent per artifact version; the registered tab
   * survives the review→live transition (tabs are never cleared on resume).
   */
  public RegisterArtifactTab(artifact: ParsedDelegationArtifact, focus: boolean = false): void {
    this.tabbedVersionIds.add(artifact.ArtifactVersionID);
    this.Model.OpenArtifactTab(artifact, focus);
    this.cdr.markForCheck();
  }

  /** On session-state changes: open tabs for newly-arrived artifacts, then re-render. */
  private onStateChanged(): void {
    this.syncArtifactTabs();
    this.cdr.markForCheck();
  }

  /** On model changes: schedule the flash clear, report a wide-tier flip, re-render. */
  private onModelChanged(): void {
    this.scheduleFlashClear();
    this.syncWide();
    this.cdr.markForCheck();
  }

  /**
   * Scans the session's delegation cards for artifacts that don't have a tab yet and
   * auto-opens one per artifact — focused on arrival, with the brief violet flash —
   * expanding the panel if it was collapsed so the new tab is actually visible.
   */
  private syncArtifactTabs(): void {
    for (const card of this.State.Cards) {
      if (!card.Done || !card.Artifacts) {
        continue;
      }
      for (const artifact of card.Artifacts) {
        if (this.tabbedVersionIds.has(artifact.ArtifactVersionID)) {
          continue;
        }
        this.tabbedVersionIds.add(artifact.ArtifactVersionID);
        this.Model.OpenArtifactTab(artifact, true);
        this.Collapsed = false;
      }
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
