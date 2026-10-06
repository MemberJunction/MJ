import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, inject } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { MediaTileComponent, MediaTilePlaceholderDirective } from '@memberjunction/ng-realtime-media';
import { AgentOrbStateFor, RealtimeAgentOrbComponent, type RealtimeAgentOrbState } from '../realtime-agent-orb.component';

/** After this long without a frame, the agent's video gives way to its placeholder (plan §5: about a second). */
export const AGENT_VIDEO_STALL_MS = 1000;

/**
 * `mj-realtime-avatar-surface`: the Avatar channel's surface. The agent's video (an avatar) in a media tile, with the
 * agent's name and the "AI-generated video" label the tile shows while it plays an avatar. Until the video's first frame,
 * and after {@link AGENT_VIDEO_STALL_MS} without one, the call's orb takes its place, following the agent's turn.
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

  /** The agent's turn, as the orb shows it. */
  public OrbState: RealtimeAgentOrbState = 'listening';

  /** The agent as the tile shows it. */
  public Agent: MediaParticipant = agentParticipant(this.agentName, null);

  /** How long without a frame the tile waits before showing the placeholder. */
  public readonly StallAfterMs = AGENT_VIDEO_STALL_MS;

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

  /** The call's state, now and on every change (the session's `ConnectionState$`): the orb follows the agent's turn. */
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
        this.cdr.markForCheck();
      }) ?? null;
  }
  public get State$(): Observable<RealtimeConnectionState> | null {
    return this.state$;
  }

  public ngOnDestroy(): void {
    this.videoSub?.unsubscribe();
    this.videoSub = null;
    this.stateSub?.unsubscribe();
    this.stateSub = null;
  }
}

/** The agent as a media tile shows it: its name, and its video as the avatar when there is one. */
function agentParticipant(name: string, video: MediaVideoSource | null): MediaParticipant {
  return { Identity: 'agent', DisplayName: name, Role: 'agent', IsSpeaking: false, Video: video ? { avatar: video } : {} };
}
