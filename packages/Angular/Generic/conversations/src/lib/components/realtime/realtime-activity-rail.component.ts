import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AngularSplitModule, SplitGutterInteractionEvent } from 'angular-split';
import { UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import {
  RealtimeSessionState, RealtimeDelegationCardVM, FriendlyStepLabel, FormatElapsed
} from './realtime-session-state';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';
import {
  ACTIVITY_SPLIT_DEFAULT_PERCENT, ACTIVITY_SPLIT_PREF_KEY,
  ClampActivitySplitPercent, ParseActivitySplitPercent, SerializeActivitySplitPercent
} from './realtime-surface-tab-style';

/**
 * The "Session activity" surface (the Activity tab's content): a compact, newest-first list
 * of EVERY tool/agent call of the session — so parallel/multiple delegations live here and
 * the conversation thread stays clean.
 *
 * Each entry shows agent name, status, the latest friendly step label, elapsed time, and a
 * one-line result preview. When a run produced ARTIFACTS, each artifact renders as an inline
 * PREVIEW card (reusing `mj-artifact-message-card`, the same component the conversation
 * messages use). Clicking a preview SPLITS this pane horizontally — activity list on the
 * LEFT, the full artifact viewer on the RIGHT (`as-split`); clicking another swaps the right
 * pane; a close control collapses back to full-width activity. The split width is persisted
 * per-user via {@link UserInfoEngine} (NOT localStorage). This replaces the old "one surface
 * tab per artifact" model.
 *
 * Collapsible via the chevron in its header (standalone presentation only). Presentational
 * over the same {@link RealtimeSessionState} the thread renders.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-activity-rail',
  imports: [CommonModule, AngularSplitModule, ArtifactsModule],
  templateUrl: './realtime-activity-rail.component.html',
  styleUrl: './realtime-activity-rail.component.css'
})
export class RealtimeActivityRailComponent implements OnInit, OnDestroy {
  /** Maximum characters of the result preview in a done card. */
  private static readonly PreviewMaxChars = 90;

  /** Shared live-session state, owned by the overlay shell. */
  @Input({ required: true }) State!: RealtimeSessionState;

  /** Whether developer affordances ("Open run" links) are revealed (gear-gated). */
  @Input() DevMode = false;

  /**
   * EMBEDDED mode: the rail renders as the content of the surface panel's Activity tab —
   * its own header/collapse chrome is hidden (the panel's tab strip owns collapse) and it
   * stretches to the pane's full width. Default `false` keeps the original standalone
   * right-rail presentation for any other consumer.
   */
  @Input() Embedded = false;

  /** The signed-in user, threaded to the split-pane artifact viewer. */
  @Input() CurrentUser: UserInfo | null = null;

  /** The active environment id, threaded to the split-pane artifact viewer. */
  @Input() EnvironmentID = '';

  /**
   * Extra artifacts NOT tied to a specific activity card — the SESSION-REVIEW chain's
   * carryover artifacts. Rendered as a "Session artifacts" group above the activity list so
   * a reviewed session's outputs are reachable inside the Activity tab (the live path gets
   * artifacts from each card's `Artifacts`). Empty for a live session.
   */
  @Input() ExtraArtifacts: ParsedDelegationArtifact[] = [];

  /** Emitted with the delegated run's ID when an entry's dev "Open run" link is clicked. */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /** Emitted when an artifact is opened in the split viewer (lets a host react if it wants). */
  @Output() OpenArtifactRequested = new EventEmitter<ParsedDelegationArtifact>();

  /** Whether the rail is collapsed to its slim toggle strip (standalone mode only). */
  public Collapsed = false;

  /** The artifact currently shown in the split-pane viewer, or null when the split is closed. */
  public SelectedArtifact: ParsedDelegationArtifact | null = null;

  /** The artifact (right) pane's width percentage — persisted per-user, clamped on load. */
  public SplitArtifactPercent = ACTIVITY_SPLIT_DEFAULT_PERCENT;

  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  /** True while reduced-motion is preferred — disables the split's drag transition. */
  public readonly PrefersReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void {
    this.loadSplitPref();
    this.changedSub = this.State.Changed$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
  }

  /** Toggle the rail between expanded and slim-collapsed (standalone presentation). */
  public Toggle(): void {
    this.Collapsed = !this.Collapsed;
  }

  /** track fn for the @for over cards. */
  public TrackCard(index: number, card: RealtimeDelegationCardVM): string {
    return card.CallID;
  }

  /** Friendly label of the card's latest step. */
  public StepLabel(card: RealtimeDelegationCardVM): string {
    return FriendlyStepLabel(card.LatestStep, card.LatestMessage);
  }

  /** Elapsed duration for finished work ("8s", "1m 04s"); null while running (kept cheap). */
  public Elapsed(card: RealtimeDelegationCardVM): string | null {
    if (card.FinishedAt == null) {
      return null;
    }
    return FormatElapsed(card.FinishedAt - card.StartedAt);
  }

  /** True when the dev "Open run" link should render for this card (gear on + run id known). */
  public ShowOpenRun(card: RealtimeDelegationCardVM): boolean {
    return this.DevMode && !!card.RunID;
  }

  /** Emits the open-run request for the card's delegated run. */
  public OpenRun(card: RealtimeDelegationCardVM): void {
    if (card.RunID) {
      this.OpenRunRequested.emit(card.RunID);
    }
  }

  /** The artifacts a done card carries (empty array when none — keeps the template simple). */
  public CardArtifacts(card: RealtimeDelegationCardVM): ParsedDelegationArtifact[] {
    return card.Done && card.Artifacts ? card.Artifacts : [];
  }

  /** track fn for the @for over a card's artifacts. */
  public TrackArtifact(index: number, artifact: ParsedDelegationArtifact): string {
    return artifact.ArtifactVersionID;
  }

  /** Whether the artifact `a` is the one currently open in the split viewer. */
  public IsArtifactOpen(artifact: ParsedDelegationArtifact): boolean {
    return this.SelectedArtifact?.ArtifactVersionID === artifact.ArtifactVersionID;
  }

  /**
   * Opens (or swaps to) `artifact` in the split-pane viewer: the activity list keeps the
   * left pane, the full artifact viewer fills the right. Re-opening the same artifact is a
   * no-op; opening a different one swaps the right pane. Also reachable from the surface-tabs
   * "View →" affordance.
   */
  public OpenArtifact(artifact: ParsedDelegationArtifact): void {
    if (this.SelectedArtifact?.ArtifactVersionID === artifact.ArtifactVersionID) {
      return;
    }
    this.SelectedArtifact = artifact;
    this.OpenArtifactRequested.emit(artifact);
    this.cdr.markForCheck();
  }

  /** Closes the split, returning to a full-width activity list. */
  public CloseArtifact(): void {
    if (this.SelectedArtifact) {
      this.SelectedArtifact = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * `as-split` drag finished: adopt + persist the artifact (right) pane's width percentage
   * per-user (debounced, via {@link UserInfoEngine} — never localStorage). The split reports
   * the two area sizes (percent here); index 1 is the artifact pane. A wildcard `'*'` size
   * (non-numeric) is ignored — nothing to persist.
   */
  public OnSplitDragEnd(event: SplitGutterInteractionEvent): void {
    const right = event.sizes[1];
    if (typeof right !== 'number') {
      return;
    }
    this.SplitArtifactPercent = ClampActivitySplitPercent(right);
    this.persistSplitPref(this.SplitArtifactPercent);
  }

  /** One-line result preview for done items. */
  public Preview(card: RealtimeDelegationCardVM): string {
    const text = (card.Result || card.LatestMessage || '').replace(/\s+/g, ' ').trim();
    const max = RealtimeActivityRailComponent.PreviewMaxChars;
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }

  /** Reads the persisted split width once (tolerant; default tier applies when unset). */
  private loadSplitPref(): void {
    try {
      const percent = ParseActivitySplitPercent(UserInfoEngine.Instance.GetSetting(ACTIVITY_SPLIT_PREF_KEY));
      if (percent !== null) {
        this.SplitArtifactPercent = percent;
      }
    } catch {
      // UserInfoEngine not configured (plain-node tests / early bootstrap) — default applies.
    }
  }

  /** Persists the split width preference server-side (debounced, best-effort). */
  private persistSplitPref(percent: number): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(ACTIVITY_SPLIT_PREF_KEY, SerializeActivitySplitPercent(percent));
    } catch {
      // engine unavailable — the width still applies for this session
    }
  }
}
