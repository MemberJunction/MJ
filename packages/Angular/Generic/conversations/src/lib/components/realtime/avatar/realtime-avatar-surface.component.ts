import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, inject } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { MediaTileComponent, MediaTilePlaceholderDirective } from '@memberjunction/ng-realtime-media';
import { AgentOrbStateFor, RealtimeAgentOrbComponent, type RealtimeAgentOrbState } from '../realtime-agent-orb.component';

/** After this long without a frame, the agent's video gives way to its placeholder (plan §5: about a second). */
export const AGENT_VIDEO_STALL_MS = 1000;

/**
 * How long the agent's last frame can hold while the call resumes on a new connection, from the resume's start, before
 * the orb takes its place (plan §5). New video came about 3 s after each move in the live runs on Vertex AI.
 */
export const AGENT_VIDEO_RESUME_HOLD_MS = 5000;

/**
 * `mj-realtime-avatar-surface`: the Avatar channel's surface. The agent's video (an avatar) in a media tile, with the
 * agent's name and the "AI-generated video" label the tile shows while it plays an avatar, and a chip that says what the
 * agent is doing. A ring frames the tile while the agent speaks, following its voice where the call overlay meters it.
 * Until the video's first frame, and after {@link AGENT_VIDEO_STALL_MS} without one, the call's orb takes its place,
 * following the agent's turn. While the call resumes on a new connection, the last frame holds instead, until new
 * frames come, {@link AGENT_VIDEO_RESUME_HOLD_MS} pass, or the call fails or ends.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-avatar-surface',
  imports: [MediaTileComponent, MediaTilePlaceholderDirective, RealtimeAgentOrbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './realtime-avatar-surface.component.html',
  styleUrls: ['./realtime-avatar-surface.component.css'],
})
export class RealtimeAvatarSurfaceComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private agentName = 'The assistant';
  private video: MediaVideoSource | null = null;
  private video$: Observable<MediaVideoSource | null> | null = null;
  private videoSub: Subscription | null = null;
  private state$: Observable<RealtimeConnectionState> | null = null;
  private stateSub: Subscription | null = null;
  private resuming$: Observable<boolean> | null = null;
  private resumingSub: Subscription | null = null;
  /** The last value {@link Resuming$} gave: a hold starts when a resume does. */
  private resuming = false;
  /** Ends the hold {@link AGENT_VIDEO_RESUME_HOLD_MS} after the resume started. */
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  /** The agent's turn, as the orb shows it. */
  public OrbState: RealtimeAgentOrbState = 'listening';

  /** What the tile's chip says the agent is doing, or `null` before the call's state is known. */
  public StatusLabel: string | null = null;

  /** The agent as the tile shows it. */
  public Agent: MediaParticipant = agentParticipant(this.agentName, null);

  /** How long without a frame the tile waits before showing the placeholder. */
  public readonly StallAfterMs = AGENT_VIDEO_STALL_MS;

  /**
   * Whether the tile keeps the agent's last frame on show while the video is out of frames: from the start of a resume
   * until new frames come, {@link AGENT_VIDEO_RESUME_HOLD_MS} pass, or the call fails or ends.
   */
  public HoldLastFrame = false;

  /** The agent's name, shown on the tile. */
  @Input()
  public set AgentName(value: string) {
    this.agentName = value;
    this.Agent = agentParticipant(value, this.video);
  }
  public get AgentName(): string {
    return this.agentName;
  }

  /** The agent's video, now and on every change (the session's `AgentVideo$`). */
  @Input()
  public set Video$(value: Observable<MediaVideoSource | null> | null) {
    if (value === this.video$) {
      return;
    }
    this.videoSub?.unsubscribe();
    this.video$ = value;
    this.videoSub =
      value?.subscribe((video) => {
        this.video = video;
        this.Agent = agentParticipant(this.agentName, video);
        this.cdr.markForCheck();
      }) ?? null;
  }
  public get Video$(): Observable<MediaVideoSource | null> | null {
    return this.video$;
  }

  /**
   * The call's state, now and on every change (the session's `ConnectionState$`): the orb follows the agent's turn, and
   * an error or the call's end stops holding the last frame.
   */
  @Input()
  public set State$(value: Observable<RealtimeConnectionState> | null) {
    if (value === this.state$) {
      return;
    }
    this.stateSub?.unsubscribe();
    this.state$ = value;
    this.stateSub =
      value?.subscribe((state) => {
        this.OrbState = AgentOrbStateFor(state);
        this.StatusLabel = statusLabelFor(state);
        if (state === 'error' || state === 'closed') {
          this.endHold();
        }
        this.cdr.markForCheck();
      }) ?? null;
  }
  public get State$(): Observable<RealtimeConnectionState> | null {
    return this.state$;
  }

  /**
   * Whether the call is resuming on a new connection, now and on every change (the session's `Resuming$`): a resume's
   * start holds the agent's last frame ({@link HoldLastFrame}).
   */
  @Input()
  public set Resuming$(value: Observable<boolean> | null) {
    if (value === this.resuming$) {
      return;
    }
    this.resumingSub?.unsubscribe();
    this.resuming$ = value;
    this.resuming = false;
    this.resumingSub = value?.subscribe((resuming) => this.onResuming(resuming)) ?? null;
  }
  public get Resuming$(): Observable<boolean> | null {
    return this.resuming$;
  }

  /** The tile's frames stopped or came back: frames that come back end a hold. */
  public OnFramesFlowingChange(flowing: boolean): void {
    if (flowing) {
      this.endHold();
    }
  }

  public ngOnDestroy(): void {
    this.videoSub?.unsubscribe();
    this.videoSub = null;
    this.stateSub?.unsubscribe();
    this.stateSub = null;
    this.resumingSub?.unsubscribe();
    this.resumingSub = null;
    this.clearHoldTimer();
  }

  /** A resume that starts holds the last frame; the hold ends on its own terms, not when the resume does. */
  private onResuming(resuming: boolean): void {
    if (resuming && !this.resuming) {
      this.startHold();
    }
    this.resuming = resuming;
  }

  /** Holds the last frame for up to {@link AGENT_VIDEO_RESUME_HOLD_MS}, counted again from a new resume's start. */
  private startHold(): void {
    this.clearHoldTimer();
    this.HoldLastFrame = true;
    this.holdTimer = setTimeout(() => this.endHold(), AGENT_VIDEO_RESUME_HOLD_MS);
    this.cdr.markForCheck();
  }

  /** Stops holding the last frame: the orb shows if the video is still out of frames. */
  private endHold(): void {
    this.clearHoldTimer();
    if (this.HoldLastFrame) {
      this.HoldLastFrame = false;
      this.cdr.markForCheck();
    }
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}

/** What the tile's chip says for a state of the call, or `null` for none (the call has ended). */
function statusLabelFor(state: RealtimeConnectionState): string | null {
  switch (state) {
    case 'speaking':
      return 'Speaking';
    case 'thinking':
      return 'Thinking';
    case 'listening':
      return 'Listening';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Connection error';
    default:
      return null;
  }
}

/** The agent as a media tile shows it: its name, and its video as the avatar when there is one. */
function agentParticipant(name: string, video: MediaVideoSource | null): MediaParticipant {
  return { Identity: 'agent', DisplayName: name, Role: 'agent', IsSpeaking: false, Video: video ? { avatar: video } : {} };
}
