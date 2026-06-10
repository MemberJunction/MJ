import { Observable, Subject, Subscription } from 'rxjs';
import {
  VoiceCaption, VoiceDelegationProgress, VoiceDelegationResult, VoiceDelegationNarration
} from '../../services/voice-session.service';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * The four reactive session streams {@link RealtimeSessionState} merges — structurally
 * satisfied by `VoiceSessionService`. Narrowed to an interface so the state (and its unit
 * tests) depend only on the streams, not on the full service / GraphQL import chain.
 */
export interface RealtimeSessionStreams {
  /** Growing user/assistant caption list. */
  Captions$: Observable<VoiceCaption[]>;
  /** Progress updates from delegated agent runs. */
  DelegationProgress$: Observable<VoiceDelegationProgress>;
  /** Terminal delegation results. */
  DelegationResult$: Observable<VoiceDelegationResult>;
  /** Ephemeral spoken progress narrations. */
  DelegationNarration$: Observable<VoiceDelegationNarration>;
}

/**
 * The view-model for one delegated tool/agent call in the live session. Built by
 * {@link RealtimeSessionState} from the `DelegationProgress$` / `DelegationResult$`
 * streams (correlated by `CallID`) and rendered both inline in the session thread
 * and as a compact card in the activity rail.
 *
 * Card objects are treated as IMMUTABLE — every progress/result event REPLACES the
 * card object (and the arrays containing it) so Angular bindings always see fresh
 * references and in-place updates reliably re-render.
 */
export interface RealtimeDelegationCardVM {
  /** The `invoke-target-agent` call this card represents. */
  CallID: string;
  /** Display name of the delegated agent (e.g. "Sage"). */
  AgentName: string;
  /** Latest human-readable progress message from the stream. */
  LatestMessage: string;
  /** The delegation phase (`prompt_execution` | `action_execution` | …). */
  LatestStep: string;
  /** Optional completion percentage (0–100) when the server supplies it. */
  Percentage?: number;
  /** `true` once the delegation reached a terminal result. */
  Done: boolean;
  /** Whether the delegated work succeeded (meaningful once {@link Done} is true). */
  Success: boolean;
  /** Short run identifier (e.g. "#a3f1") if known; shown in expanded provenance detail. */
  RunRef?: string;
  /**
   * ID of the delegated agent run (`MJ: AI Agent Runs`) once the result reports it.
   * Powers the gear-gated "Open run" developer link on the card / rail entry.
   */
  RunID?: string;
  /** The real result text once the delegation completes. */
  Result?: string | null;
  /**
   * Artifacts the delegated run produced (set with the terminal result). Powers the
   * "View" affordance on done cards / rail entries and the surface panel's artifact tabs.
   */
  Artifacts?: ParsedDelegationArtifact[];
  /** Epoch ms when the first progress event for this call arrived. */
  StartedAt: number;
  /** Epoch ms when the terminal result arrived. */
  FinishedAt?: number;
}

/** A caption turn (user or assistant) in the unified thread. */
export interface RealtimeThreadCaptionItem {
  Kind: 'caption';
  Role: 'User' | 'Assistant';
  Text: string;
}

/** A delegation card in the unified thread (working → done chip). */
export interface RealtimeThreadDelegationItem {
  Kind: 'delegation';
  Card: RealtimeDelegationCardVM;
}

/** One entry in the chronological thread: either a caption bubble or a delegation card. */
export type RealtimeThreadItem = RealtimeThreadCaptionItem | RealtimeThreadDelegationItem;

/**
 * Maps a raw delegation step id to a human-friendly phrase. Unknown steps fall back to
 * the raw progress message (per product direction) so the UI never shows snake_case ids.
 */
export function FriendlyStepLabel(step: string, message: string): string {
  switch (step) {
    case 'prompt_execution': return 'Thinking it through';
    case 'action_execution': return 'Running actions';
    case 'subagent_execution': return 'Working with another agent';
    case 'decision_processing': return 'Deciding next steps';
    default: return message || 'Working';
  }
}

/** Formats an elapsed duration in ms as a compact human string ("8s", "1m 04s"). */
export function FormatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * SINGLE SOURCE of merged live-session state, owned by the overlay shell
 * (`RealtimeSessionOverlayComponent`) and passed via `@Input()` to BOTH the session
 * thread and the activity rail — so the per-CallID card bookkeeping and subscription
 * logic exists exactly once.
 *
 * Merges FOUR reactive streams from {@link VoiceSessionService}:
 *  - `Captions$`            — growing user/assistant caption list → appended to {@link Items}.
 *  - `DelegationProgress$`  — first event per `CallID` inserts a working card at the thread
 *                             tail; later events REPLACE the card immutably (new object +
 *                             new arrays) so change detection always fires.
 *  - `DelegationResult$`    — flips the card to Done/Failed with the real result text.
 *  - `DelegationNarration$` — the EPHEMERAL spoken progress note (latest only, never
 *                             accumulated), cleared when no delegation is running anymore.
 *
 * Consumers subscribe to {@link Changed$} and `markForCheck()`; all exposed collections
 * are replaced (never mutated) on change.
 */
export class RealtimeSessionState {
  /** Display name used for new delegation cards (set by the overlay's AgentName input). */
  public AgentName = 'Sage';

  /** The merged, chronological thread (captions + delegation cards), oldest first. */
  public Items: RealtimeThreadItem[] = [];

  /** All delegation cards of the session, NEWEST first — the activity rail's list. */
  public Cards: RealtimeDelegationCardVM[] = [];

  /** Latest ephemeral narration text, or null when none should be shown. */
  public Narration: string | null = null;

  /** CallID of the most recently started, still-running delegation (anchors the live note). */
  public ActiveCallId: string | null = null;

  /** Emits after every state change so views can mark themselves for check. */
  public readonly Changed$ = new Subject<void>();

  /** Number of captions already merged into {@link Items} (append-only bookkeeping). */
  private placedCaptionCount = 0;
  /** Live card lookup by CallID (insertion order = start order). */
  private cardsByCallId = new Map<string, RealtimeDelegationCardVM>();
  private subs: Subscription[] = [];

  /** True while at least one delegation is still running. */
  public get HasRunningDelegation(): boolean {
    return this.ActiveCallId !== null;
  }

  /** Subscribes to the session streams. Call once from the owning overlay shell. */
  public Attach(voice: RealtimeSessionStreams): void {
    if (this.subs.length > 0) {
      return; // already attached
    }
    this.subs.push(
      voice.Captions$.subscribe(c => this.onCaptions(c)),
      voice.DelegationProgress$.subscribe(p => this.onProgress(p)),
      voice.DelegationResult$.subscribe(r => this.onResult(r)),
      voice.DelegationNarration$.subscribe(n => this.onNarration(n))
    );
  }

  /** Unsubscribes from all session streams. Call from the owning shell's ngOnDestroy. */
  public Detach(): void {
    for (const s of this.subs) {
      s.unsubscribe();
    }
    this.subs = [];
  }

  /** Appends any newly-arrived captions, keeping order relative to delegation cards. */
  private onCaptions(captions: VoiceCaption[]): void {
    if (captions.length <= this.placedCaptionCount) {
      // Captions are cleared on a fresh session — reset all merge state.
      if (captions.length < this.placedCaptionCount) {
        this.reset();
        this.Changed$.next();
      }
      return;
    }
    const appended: RealtimeThreadItem[] = [];
    for (let i = this.placedCaptionCount; i < captions.length; i++) {
      appended.push({ Kind: 'caption', Role: captions[i].Role, Text: captions[i].Text });
    }
    this.placedCaptionCount = captions.length;
    this.Items = [...this.Items, ...appended];
    this.Changed$.next();
  }

  /** Inserts a new working card, or immutably replaces the existing one for this CallID. */
  private onProgress(progress: VoiceDelegationProgress): void {
    const existing = this.cardsByCallId.get(progress.CallID);
    if (existing) {
      this.replaceCard({
        ...existing,
        LatestStep: progress.Step,
        LatestMessage: progress.Message,
        Percentage: progress.Percentage
      });
    } else {
      this.insertCard(progress);
    }
    this.Changed$.next();
  }

  /** Creates a working card for a first-seen CallID and appends it to the thread tail. */
  private insertCard(progress: VoiceDelegationProgress): void {
    const card: RealtimeDelegationCardVM = {
      CallID: progress.CallID,
      AgentName: this.AgentName,
      LatestStep: progress.Step,
      LatestMessage: progress.Message,
      Percentage: progress.Percentage,
      Done: false,
      Success: false,
      RunRef: this.shortRunRef(progress.CallID),
      StartedAt: Date.now()
    };
    this.cardsByCallId.set(progress.CallID, card);
    this.Items = [...this.Items, { Kind: 'delegation', Card: card }];
    this.rebuildCards();
    this.recomputeActive();
  }

  /** Flips the card for a finished delegation to Done/Failed with its real result. */
  private onResult(result: VoiceDelegationResult): void {
    const existing = this.cardsByCallId.get(result.CallID);
    if (!existing) {
      return; // non-delegation tool result (no card was ever created) — ignore
    }
    this.replaceCard({
      ...existing,
      Done: true,
      Success: result.Success,
      Result: result.Output,
      RunID: result.RunID ?? existing.RunID,
      Artifacts: result.Artifacts ?? existing.Artifacts,
      FinishedAt: Date.now()
    });
    if (!this.HasRunningDelegation) {
      // All delegations finished — the live narration note fades away.
      this.Narration = null;
    }
    this.Changed$.next();
  }

  /** Latest narration REPLACES the previous one (never accumulated). */
  private onNarration(narration: VoiceDelegationNarration): void {
    this.Narration = narration.Text;
    this.Changed$.next();
  }

  /**
   * Immutable replacement of a card: new card object, new thread-item wrapper, new
   * Items array, rebuilt Cards array — so every binding sees a fresh reference.
   */
  private replaceCard(card: RealtimeDelegationCardVM): void {
    this.cardsByCallId.set(card.CallID, card);
    const idx = this.Items.findIndex(i => i.Kind === 'delegation' && i.Card.CallID === card.CallID);
    if (idx >= 0) {
      const next = [...this.Items];
      next[idx] = { Kind: 'delegation', Card: card };
      this.Items = next;
    }
    this.rebuildCards();
    this.recomputeActive();
  }

  /** Rebuilds the rail's newest-first card list from the (start-ordered) map. */
  private rebuildCards(): void {
    this.Cards = Array.from(this.cardsByCallId.values()).reverse();
  }

  /** Recomputes which still-running delegation anchors the live narration note. */
  private recomputeActive(): void {
    const running = this.Cards.find(c => !c.Done);
    this.ActiveCallId = running ? running.CallID : null;
  }

  /** Derives a short, stable run reference (e.g. "#a3f1") from the call id. */
  private shortRunRef(callId: string): string {
    const compact = callId.replace(/[^a-z0-9]/gi, '');
    return compact.length >= 4 ? `#${compact.slice(-4).toLowerCase()}` : `#${compact.toLowerCase()}`;
  }

  /** Clears all merged state (fresh session). */
  private reset(): void {
    this.Items = [];
    this.Cards = [];
    this.Narration = null;
    this.ActiveCallId = null;
    this.placedCaptionCount = 0;
    this.cardsByCallId.clear();
  }
}
