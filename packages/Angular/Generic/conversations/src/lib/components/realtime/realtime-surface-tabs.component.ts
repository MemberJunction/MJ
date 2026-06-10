import {
  Component, ElementRef, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeActivityRailComponent } from './realtime-activity-rail.component';
import { RealtimeChannelPaneComponent } from './channels/realtime-channel-pane.component';
import {
  RealtimeSurfaceTabsModel, RealtimeSurfaceTab, RealtimeChannelTabRegistration
} from './realtime-surface-tabs.model';
import {
  SURFACE_PANEL_PREF_KEY, ClampSurfacePanelWidth, ParseSurfacePanelPref, SerializeSurfacePanelPref
} from './realtime-surface-panel-prefs';
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

  /** The panel's tab state (add / focus / dedupe / flash) — see the model for the rules. */
  public readonly Model = new RealtimeSurfaceTabsModel();

  /** Whether the panel is collapsed to its slim strip. */
  public Collapsed = false;

  /**
   * The user's EXPLICIT panel width in px (from a drag or the stored preference), or
   * `null` when the user has never resized — in which case the default width tiers
   * (normal / auto-widen-on-content-tab) apply. Once set, this width WINS for both
   * states; double-clicking the grab handle resets back to `null` (default behavior).
   */
  public UserWidth: number | null = null;

  /** True while the grab handle is being dragged (disables the width transition). */
  public Resizing = false;

  /** Drag bookkeeping for the grab handle (pointer capture based). */
  private dragStartX = 0;
  private dragStartWidth = 0;
  private bodyUserSelectBackup: string | null = null;

  /** Artifact version ids already turned into tabs (guards the State rescan). */
  private tabbedVersionIds = new Set<string>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private cdr = inject(ChangeDetectorRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The currently focused tab. */
  public get ActiveTab(): RealtimeSurfaceTab {
    return this.Model.ActiveTab;
  }

  /** Wide presentation when a content tab (artifact / channel) is focused. */
  public get IsWide(): boolean {
    return !this.Collapsed && this.ActiveTab.Kind !== 'activity';
  }

  /**
   * The explicit width applied inline on the panel, or `null` to fall back to the
   * default CSS tiers. Suppressed while collapsed (slim strip) and in FILL mode
   * (the panel owns the whole overlay) — the user width resumes afterwards.
   */
  public get AppliedWidthPx(): number | null {
    if (this.UserWidth === null || this.Collapsed || this.Fill) {
      return null;
    }
    return this.UserWidth;
  }

  /** Whether the grab handle is shown (hidden while collapsed / in fill mode). */
  public get ShowResizeHandle(): boolean {
    return !this.Collapsed && !this.Fill;
  }

  ngOnInit(): void {
    this.subs.push(
      this.State.Changed$.subscribe(() => this.onStateChanged()),
      this.Model.Changed$.subscribe(() => this.onModelChanged())
    );
    this.syncArtifactTabs();
    this.readStoredWidth();
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
    this.restoreTextSelection();
  }

  // ── Drag-resize (left-edge grab handle) ────────────────────────────────────

  /** Start a width drag: capture the pointer and snapshot the current width. */
  public OnHandlePointerDown(event: PointerEvent): void {
    if (!this.ShowResizeHandle) {
      return;
    }
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.Resizing = true;
    this.dragStartX = event.clientX;
    this.dragStartWidth = this.currentPanelWidth();
    this.suppressTextSelection();
  }

  /** Drag: the handle rides the panel's LEFT edge, so moving left widens it. */
  public OnHandlePointerMove(event: PointerEvent): void {
    if (!this.Resizing) {
      return;
    }
    const candidate = this.dragStartWidth + (this.dragStartX - event.clientX);
    const clamped = ClampSurfacePanelWidth(candidate, this.overlayWidth());
    if (clamped !== this.UserWidth) {
      this.UserWidth = clamped;
      this.persistWidth(clamped);
      this.cdr.markForCheck();
    }
  }

  /** End of drag: release state and persist the final width. */
  public OnHandlePointerUp(event: PointerEvent): void {
    if (!this.Resizing) {
      return;
    }
    this.Resizing = false;
    this.restoreTextSelection();
    if (this.UserWidth !== null) {
      this.persistWidth(this.UserWidth);
    }
    const target = event.target as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.cdr.markForCheck();
  }

  /** Double-click the handle: reset to the default width behavior (auto-widen tiers). */
  public OnHandleReset(): void {
    this.UserWidth = null;
    this.persistWidth(null);
    this.cdr.markForCheck();
  }

  /** The panel's current rendered width (drag baseline). */
  private currentPanelWidth(): number {
    const surface = this.host.nativeElement.querySelector<HTMLElement>('.surface');
    return surface?.getBoundingClientRect().width ?? this.dragStartWidth;
  }

  /** The overlay's width — the clamp's 70% upper-bound basis (0 = unknown). */
  private overlayWidth(): number {
    return this.host.nativeElement.parentElement?.getBoundingClientRect().width ?? 0;
  }

  /** Suppress text selection app-wide while dragging (restored on release). */
  private suppressTextSelection(): void {
    if (this.bodyUserSelectBackup === null && typeof document !== 'undefined') {
      this.bodyUserSelectBackup = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
    }
  }

  /** Restore the pre-drag text-selection behavior. */
  private restoreTextSelection(): void {
    if (this.bodyUserSelectBackup !== null && typeof document !== 'undefined') {
      document.body.style.userSelect = this.bodyUserSelectBackup;
      this.bodyUserSelectBackup = null;
    }
  }

  // ── Width preference (UserInfoEngine — per-user, server-side) ──────────────

  /**
   * Reads the stored width preference once at init. No-ops safely (keeps the
   * default tiers) when the engine isn't configured — e.g. plain-node tests.
   */
  private readStoredWidth(): void {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(SURFACE_PANEL_PREF_KEY);
      const pref = ParseSurfacePanelPref(raw);
      if (pref) {
        this.UserWidth = ClampSurfacePanelWidth(pref.Width, this.overlayWidth());
      }
    } catch {
      // Engine not configured (no provider) — keep the default width tiers.
    }
  }

  /** Debounced fire-and-forget write of the width preference (`null` = reset). */
  private persistWidth(width: number | null): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(SURFACE_PANEL_PREF_KEY, SerializeSurfacePanelPref(width));
    } catch {
      // Engine not configured — preference simply isn't persisted.
    }
  }

  /** Toggle the panel between expanded and slim-collapsed. */
  public ToggleCollapsed(): void {
    this.Collapsed = !this.Collapsed;
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
    this.Collapsed = false;
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

  /** On session-state changes: open tabs for newly-arrived artifacts, then re-render. */
  private onStateChanged(): void {
    this.syncArtifactTabs();
    this.cdr.markForCheck();
  }

  /** On model changes: schedule the flash clear (if one is pending) and re-render. */
  private onModelChanged(): void {
    this.scheduleFlashClear();
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
