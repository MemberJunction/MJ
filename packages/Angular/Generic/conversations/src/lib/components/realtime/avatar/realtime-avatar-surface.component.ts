import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, inject } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { MediaTileComponent } from '@memberjunction/ng-realtime-media';

/**
 * `mj-realtime-avatar-surface`: the Avatar channel's surface. The agent's video (an avatar) in a media tile, with the
 * agent's name and the "AI-generated video" label the tile shows while it plays an avatar. Without video the tile shows
 * the agent's initials, although the host brings this surface up only once the video has arrived.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-avatar-surface',
  imports: [MediaTileComponent],
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

  /** The agent as the tile shows it. */
  public Agent: MediaParticipant = agentParticipant(this.agentName, null);

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

  public ngOnDestroy(): void {
    this.videoSub?.unsubscribe();
    this.videoSub = null;
  }
}

/** The agent as a media tile shows it: its name, and its video as the avatar when there is one. */
function agentParticipant(name: string, video: MediaVideoSource | null): MediaParticipant {
  return { Identity: 'agent', DisplayName: name, Role: 'agent', IsSpeaking: false, Video: video ? { avatar: video } : {} };
}
