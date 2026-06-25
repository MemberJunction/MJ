import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy,
  Output, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';

/** Number of bars rendered in the synthetic waveform behind the scrubber. */
const WAVEFORM_BARS = 64;

/**
 * TIME-ALIGNED EVIDENCE PLAYBACK (`mj-realtime-evidence-playback`) — replays a realtime session's
 * recorded audio next to its transcript, with the two kept in sync. The audio gets a custom transport
 * (play/pause, a synthetic waveform scrubber, time/duration readout); the transcript is a scrollable
 * list of clickable turns. Clicking a turn seeks the audio to that turn's start and plays; as the audio
 * plays, the turn whose `[UtteranceStartMs, UtteranceEndMs]` window contains the playhead is highlighted.
 *
 * Timestamps come from {@link MJConversationDetailEntity.UtteranceStartMs}; when a turn has none, the
 * component falls back to (`__mj_CreatedAt` − {@link RecordingStartedAt}). Generic + Router-free: all
 * state arrives via inputs, the only output is {@link TurnSeek}.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-evidence-playback',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-evidence-playback.component.html',
  styleUrls: ['./realtime-evidence-playback.component.scss'],
})
export class RealtimeEvidencePlaybackComponent implements OnDestroy {
  /** The session's transcript turns, in chronological order. */
  @Input()
  set Turns(value: MJConversationDetailEntity[] | null) {
    this._turns = value ?? [];
    this.cdr.markForCheck();
  }
  get Turns(): MJConversationDetailEntity[] {
    return this._turns;
  }
  private _turns: MJConversationDetailEntity[] = [];

  /** The recorded session audio URL, or `null` when no recording is available. */
  @Input()
  set AudioUrl(value: string | null) {
    if (value === this._audioUrl) {
      return;
    }
    this._audioUrl = value;
    this.CurrentMs = 0;
    this.DurationMs = 0;
    this.IsPlaying = false;
    this.cdr.markForCheck();
  }
  get AudioUrl(): string | null {
    return this._audioUrl;
  }
  private _audioUrl: string | null = null;

  /** When the recording started, used to derive a turn's offset when it has no `UtteranceStartMs`. */
  @Input() RecordingStartedAt: Date | null = null;

  /** Display name of the agent — labels and colors AI turns. */
  @Input() AgentName = 'Agent';

  /** Emitted when the user clicks a transcript turn (to seek the audio to it). */
  @Output() TurnSeek = new EventEmitter<MJConversationDetailEntity>();

  /** Current playhead position in ms (driven by the audio element's `timeupdate`). */
  public CurrentMs = 0;
  /** Total audio duration in ms (set on `loadedmetadata`). */
  public DurationMs = 0;
  /** Whether the audio is currently playing. */
  public IsPlaying = false;

  /** The synthetic waveform bar heights (stable per AudioUrl). */
  public readonly WaveformBars: number[] = this.buildWaveform();

  @ViewChild('audio') private audioRef?: ElementRef<HTMLAudioElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  ngOnDestroy(): void {
    this.audioRef?.nativeElement.pause();
  }

  /** The `<audio>` element, or `null` before the view initializes / when there's no audio. */
  private get audioEl(): HTMLAudioElement | null {
    return this.audioRef?.nativeElement ?? null;
  }

  /** Playhead progress as a fraction (0..1), for the scrubber fill + waveform reveal. */
  public get Progress(): number {
    return this.DurationMs > 0 ? Math.min(1, this.CurrentMs / this.DurationMs) : 0;
  }

  /** Toggles audio play / pause. */
  public TogglePlay(): void {
    const el = this.audioEl;
    if (!el) {
      return;
    }
    if (el.paused) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  /** Seeks to a fraction of the duration (scrubber click / keyboard). */
  public SeekToFraction(fraction: number): void {
    const el = this.audioEl;
    if (!el || this.DurationMs <= 0) {
      return;
    }
    el.currentTime = (Math.max(0, Math.min(1, fraction)) * this.DurationMs) / 1000;
    this.CurrentMs = el.currentTime * 1000;
    this.cdr.markForCheck();
  }

  /** Scrubber pointer handler — maps the click X within the track to a seek fraction. */
  public OnScrubberClick(event: MouseEvent, track: HTMLElement): void {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    this.SeekToFraction((event.clientX - rect.left) / rect.width);
  }

  /** Scrubber keyboard handler — arrows nudge ±5s, Home/End jump to ends, Space toggles play. */
  public OnScrubberKeydown(event: KeyboardEvent): void {
    const stepMs = 5000;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.seekByMs(stepMs);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.seekByMs(-stepMs);
        break;
      case 'Home':
        event.preventDefault();
        this.SeekToFraction(0);
        break;
      case 'End':
        event.preventDefault();
        this.SeekToFraction(1);
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.TogglePlay();
        break;
      default:
        break;
    }
  }

  /** Clicking a transcript turn → seek the audio to it, play, and emit {@link TurnSeek}. */
  public SeekToTurn(turn: MJConversationDetailEntity): void {
    const startMs = this.turnStartMs(turn);
    const el = this.audioEl;
    if (el && this.DurationMs > 0) {
      el.currentTime = Math.max(0, startMs / 1000);
      this.CurrentMs = startMs;
      void el.play().catch(() => undefined);
    }
    this.TurnSeek.emit(turn);
    this.cdr.markForCheck();
  }

  /** True when the playhead falls within this turn's utterance window (drives the active highlight). */
  public IsTurnActive(turn: MJConversationDetailEntity): boolean {
    if (!this.IsPlaying && this.CurrentMs === 0) {
      return false;
    }
    const start = this.turnStartMs(turn);
    const end = this.turnEndMs(turn);
    return this.CurrentMs >= start && this.CurrentMs < end;
  }

  /** Whether a turn is from the human user (vs. the agent) — drives the speaker color + label. */
  public IsUserTurn(turn: MJConversationDetailEntity): boolean {
    return turn.Role === 'User';
  }

  /** The speaker label for a turn. */
  public SpeakerLabel(turn: MJConversationDetailEntity): string {
    return this.IsUserTurn(turn) ? 'You' : this.AgentName;
  }

  /** The mm:ss timestamp shown on a turn (its start offset within the recording). */
  public TurnTimestamp(turn: MJConversationDetailEntity): string {
    return this.formatMs(this.turnStartMs(turn));
  }

  /** mm:ss of the current playhead. */
  public get CurrentLabel(): string {
    return this.formatMs(this.CurrentMs);
  }

  /** mm:ss of the total duration. */
  public get DurationLabel(): string {
    return this.formatMs(this.DurationMs);
  }

  /** Stable `@for` track for the transcript. */
  public TrackByTurn(_index: number, turn: MJConversationDetailEntity): string {
    return turn.ID;
  }

  // ----- audio element event handlers (bound in the template) -------------------------------

  /** `loadedmetadata` → capture the duration. */
  public OnLoadedMetadata(): void {
    const el = this.audioEl;
    this.DurationMs = el && Number.isFinite(el.duration) ? el.duration * 1000 : 0;
    this.cdr.markForCheck();
  }

  /** `timeupdate` → advance the playhead + re-evaluate the active turn. */
  public OnTimeUpdate(): void {
    const el = this.audioEl;
    if (el) {
      this.CurrentMs = el.currentTime * 1000;
      this.cdr.markForCheck();
    }
  }

  /** `play` / `pause` / `ended` → reflect the transport state. */
  public OnPlay(): void {
    this.IsPlaying = true;
    this.cdr.markForCheck();
  }
  public OnPause(): void {
    this.IsPlaying = false;
    this.cdr.markForCheck();
  }
  public OnEnded(): void {
    this.IsPlaying = false;
    this.cdr.markForCheck();
  }

  // ----- helpers ----------------------------------------------------------------------------

  /** Nudges the playhead by `deltaMs`, clamped to the duration. */
  private seekByMs(deltaMs: number): void {
    if (this.DurationMs <= 0) {
      return;
    }
    this.SeekToFraction((this.CurrentMs + deltaMs) / this.DurationMs);
  }

  /**
   * A turn's start offset (ms) within the recording: prefer {@link MJConversationDetailEntity.UtteranceStartMs};
   * fall back to (`__mj_CreatedAt` − {@link RecordingStartedAt}); 0 when neither is available.
   */
  private turnStartMs(turn: MJConversationDetailEntity): number {
    if (turn.UtteranceStartMs != null) {
      return Math.max(0, turn.UtteranceStartMs);
    }
    if (this.RecordingStartedAt && turn.__mj_CreatedAt) {
      return Math.max(0, turn.__mj_CreatedAt.getTime() - this.RecordingStartedAt.getTime());
    }
    return 0;
  }

  /**
   * A turn's end offset (ms): prefer {@link MJConversationDetailEntity.UtteranceEndMs}; otherwise the
   * next turn's start; otherwise the recording duration (or start + a small window when duration is unknown).
   */
  private turnEndMs(turn: MJConversationDetailEntity): number {
    if (turn.UtteranceEndMs != null) {
      return Math.max(this.turnStartMs(turn), turn.UtteranceEndMs);
    }
    const idx = this._turns.indexOf(turn);
    const next = idx >= 0 ? this._turns[idx + 1] : undefined;
    if (next) {
      return this.turnStartMs(next);
    }
    return this.DurationMs > 0 ? this.DurationMs : this.turnStartMs(turn) + 4000;
  }

  /** Formats a ms offset as mm:ss (clamped at 0). */
  private formatMs(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /** Builds a stable pseudo-random waveform (deterministic, no per-render churn). */
  private buildWaveform(): number[] {
    const bars: number[] = [];
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      // A smooth, repeatable envelope — looks like audio without needing to decode any.
      const base = Math.sin(i * 0.5) * 0.5 + 0.5;
      const detail = Math.sin(i * 1.7) * 0.25 + 0.25;
      bars.push(Math.max(0.12, Math.min(1, base * 0.7 + detail * 0.5)));
    }
    return bars;
  }
}
