import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { MediaAudioMeterComponent, type MediaAudioMeterSettings } from './audio-meter.component';
import { MediaVideoBinding } from '../media-video-binding';
import { VideoFrameWatch } from '../video-frame-watch';

/**
 * Marks the content an `mj-media-tile` shows instead of the participant's picture or initials, while it has no video to
 * show (none, or out of frames): `<mj-media-tile><span mjMediaTilePlaceholder>…</span></mj-media-tile>`.
 */
@Directive({ selector: '[mjMediaTilePlaceholder]', standalone: true })
export class MediaTilePlaceholderDirective {}

/**
 * How a tile fits a video into its box: `'cover'` fills the box and crops what overflows; `'contain'` shows the whole
 * video, with bars where its shape differs from the box's.
 */
export type MediaTileVideoFit = 'cover' | 'contain';

/**
 * `mj-media-tile`: one participant. Their video (the preferred one, else a shared screen, the camera, the avatar),
 * or their picture or initials when there is none; name, role badge, mute and screen-sharing indicators, an
 * "AI-generated video" label while it shows an avatar, connection quality, an active-speaker ring, an optional audio
 * meter and a pin button. Video fills the tile, except an avatar, which shows whole ({@link AvatarVideoFit}). With
 * {@link StallAfterMs} set, a video that stops sending frames cross-fades to the picture or initials until its frames
 * come back, unless {@link HoldLastFrame} keeps its last frame on show. Content marked
 * {@link MediaTilePlaceholderDirective} takes the picture's place,
 * and content marked `mjMediaTileActions` (such as a "Move to…" menu) sits in the top corner beside the pin, shown on
 * hover or focus: `<mj-media-tile><mj-media-move-menu mjMediaTileActions …></mj-media-move-menu></mj-media-tile>`.
 *
 * The tile never plays audio: a voice must not stop because its tile left the screen, so the host plays each
 * voice once, outside the layout.
 */
@Component({
  selector: 'mj-media-tile',
  standalone: true,
  imports: [MediaAudioMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tile" [class.tile--speaking]="ShowActiveSpeakerRing && Participant?.IsSpeaking" [class.tile--agent]="Participant?.Role === 'agent'">
      <video
        #video
        class="tile__video"
        [class.tile__video--hidden]="!HasVideo"
        [class.tile__video--stalled]="Stalled"
        [class.tile__video--mirrored]="IsMirrored"
        [class.tile__video--whole]="ShowsWholeVideo"
        autoplay
        playsinline
        [muted]="true"
      ></video>

      @if (!HasVideo || Stalled) {
        <div class="tile__placeholder" [class.tile__placeholder--over-video]="Stalled">
          <ng-content select="[mjMediaTilePlaceholder]"></ng-content>
          @if (!Placeholder) {
            @if (AvatarUrl) {
              <img [src]="AvatarUrl" [alt]="Participant?.DisplayName ?? ''" />
            } @else {
              <span class="tile__initials">{{ Initials }}</span>
            }
          }
        </div>
      }

      @if (IsAvatarVideo || IsSharingScreen || AgentCanSee || Status) {
        <div class="tile__chips">
          @if (IsAvatarVideo) {
            <span class="tile__chip"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI-generated video</span>
          }
          @if (IsSharingScreen) {
            <span class="tile__chip"><i class="fa-solid fa-display" aria-hidden="true"></i> Sharing</span>
          }
          @if (AgentCanSee) {
            <span class="tile__chip"><i class="fa-solid fa-eye" aria-hidden="true"></i> Agent can see</span>
          }
          @if (Status) {
            <span class="tile__chip tile__chip--status">{{ Status }}</span>
          }
        </div>
      }

      <div class="tile__actions">
        <span class="tile__actions-slot"><ng-content select="[mjMediaTileActions]"></ng-content></span>
        @if (Pinnable) {
          <button
            type="button"
            class="tile__pin"
            [class.tile__pin--active]="IsPinned"
            [attr.aria-label]="IsPinned ? 'Unpin' : 'Pin'"
            [attr.aria-pressed]="IsPinned"
            [title]="IsPinned ? 'Unpin' : 'Pin'"
            (click)="TogglePin.emit()"
          >
            <i class="fa-solid fa-thumbtack" aria-hidden="true"></i>
          </button>
        }
      </div>

      <div class="tile__footer">
        @if (ShowName) {
          <span class="tile__name">
            @if (Participant?.IsMuted) {
              <i class="fa-solid fa-microphone-slash tile__muted" title="Muted"></i>
            }
            {{ Participant?.DisplayName }}
            @if (Participant?.Role === 'agent') {
              <span class="tile__role">AI</span>
            }
          </span>
        }
        <span class="tile__footer-end">
          @if (ShowMeter && MeterLevel && !Participant?.IsMuted) {
            <mj-audio-meter class="tile__meter" [Level]="MeterLevel" [Settings]="MeterSettings"></mj-audio-meter>
          }
          @if (ShowConnectionQuality && Participant?.ConnectionQuality) {
            <span class="tile__quality tile__quality--{{ Participant?.ConnectionQuality }}" [title]="Participant?.ConnectionQuality">
              <i class="fa-solid fa-signal" aria-hidden="true"></i>
            </span>
          }
        </span>
      </div>
    </div>
  `,
  styleUrls: ['./media-tile.component.css'],
})
export class MediaTileComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private participant: MediaParticipant | null = null;
  private viewReady = false;
  private readonly video = new MediaVideoBinding();
  /** Watches the attached video for frames while {@link StallAfterMs} is set. */
  private frameWatch: VideoFrameWatch | null = null;
  /** The source {@link frameWatch} watches. */
  private watchedSource: MediaVideoSource | null = null;
  /** Whether the attached video's frames are coming: false until its first frame, and after a stall. */
  private framesFlowing = false;
  private holdLastFrame = false;
  /** Whether the current stall keeps the frame on show ({@link HoldLastFrame}). */
  private holdingFrame = false;

  /** Show the active-speaker ring. */
  @Input() public ShowActiveSpeakerRing = true;
  /** Show the name and role badge. */
  @Input() public ShowName = true;
  /** Show the audio meter (when the participant offers a level and isn't muted). */
  @Input() public ShowMeter = true;
  /** Show the connection-quality indicator (when the participant reports one). */
  @Input() public ShowConnectionQuality = true;
  /** A picture shown when there is no video. */
  @Input() public AvatarUrl: string | null = null;
  /** Show the pin button. */
  @Input() public Pinnable = false;
  /** Whether this tile is pinned. */
  @Input() public IsPinned = false;
  /** The meter's smoothing settings. */
  @Input() public MeterSettings: MediaAudioMeterSettings = {};
  /** Mirror the camera, as a self-view does. A shared screen or an avatar is never mirrored. */
  @Input() public Mirror = false;
  /** A short status the tile shows as a chip after its own labels, such as what an agent is doing; `null` for none. */
  @Input() public Status: string | null = null;
  /**
   * After this many milliseconds without a new frame, the video cross-fades to the picture or initials until its frames
   * come back; until its first frame, too. `null` (the default): the video always shows. Read when a video is attached.
   */
  @Input() public StallAfterMs: number | null = null;
  /**
   * Keeps the frame on show while the video is out of frames ({@link StallAfterMs}), instead of cross-fading to the
   * placeholder: for a gap the host expects, such as the call moving to a new connection. Only a frame on show is held,
   * so the placeholder before the first frame, or one already showing when the hold starts, stays. Turned off while the
   * video is still out of frames, the placeholder shows; frames that come back end the hold for that stall.
   */
  @Input()
  public set HoldLastFrame(value: boolean) {
    this.holdLastFrame = value;
    if (!value) {
      this.holdingFrame = false;
    }
  }
  public get HoldLastFrame(): boolean {
    return this.holdLastFrame;
  }
  /**
   * How an avatar fits the tile. `'contain'` (the default) shows the whole avatar, with bars where its shape differs from
   * the tile's, so a portrait avatar keeps its face in any box. `'cover'` fills the tile, as every other video does.
   */
  @Input() public AvatarVideoFit: MediaTileVideoFit = 'contain';

  /** The host's own placeholder, shown instead of the picture or initials. */
  @ContentChild(MediaTilePlaceholderDirective) public Placeholder?: MediaTilePlaceholderDirective;

  /** Emits when the user clicks the pin button. */
  @Output() public TogglePin = new EventEmitter<void>();

  /**
   * Emits whether the watched video's frames are coming, each time that changes while {@link StallAfterMs} is set: `true`
   * at its first frame and when frames come back, `false` after {@link StallAfterMs} without one, held or not.
   */
  @Output() public FramesFlowingChange = new EventEmitter<boolean>();

  /** The participant to show. A different video source replaces the attached one; the same source stays. */
  @Input()
  public set Participant(value: MediaParticipant | null) {
    this.participant = value;
    if (this.viewReady) {
      this.syncVideo();
    }
  }
  public get Participant(): MediaParticipant | null {
    return this.participant;
  }

  /** Up to two initials for the placeholder. */
  public get Initials(): string {
    const parts = (this.Participant?.DisplayName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Whether the participant has a video to show (otherwise the picture or initials show). */
  public get HasVideo(): boolean {
    return this.chooseVideo() !== null;
  }

  /**
   * Whether the video is out of frames ({@link StallAfterMs}) and its placeholder shows: it has sent none yet, or none for
   * that long and {@link HoldLastFrame} is not holding its frame.
   */
  public get Stalled(): boolean {
    return this.StallAfterMs !== null && this.HasVideo && !this.framesFlowing && !this.holdingFrame;
  }

  /** Whether the video shown is mirrored: {@link Mirror} is on and the camera is what shows. */
  public get IsMirrored(): boolean {
    const camera = this.Participant?.Video.camera;
    return this.Mirror && camera !== undefined && this.chooseVideo() === camera;
  }

  /** Whether the participant is sharing a screen. */
  public get IsSharingScreen(): boolean {
    return this.Participant?.Video.screen !== undefined;
  }

  /** Whether an agent can see this participant's camera and shared screen, as the host reports it. */
  public get AgentCanSee(): boolean {
    return this.Participant?.AgentCanSee === true;
  }

  /**
   * Whether the video shown is the participant's avatar. An avatar is generated, and its watermark (where the model adds
   * one) cannot be seen, so the tile says so for as long as it shows one.
   */
  public get IsAvatarVideo(): boolean {
    return this.showsAvatar() && !this.Stalled;
  }

  /** Whether the video shows whole rather than filling the tile: it is the avatar, and {@link AvatarVideoFit} says so. */
  public get ShowsWholeVideo(): boolean {
    return this.AvatarVideoFit === 'contain' && this.showsAvatar();
  }

  /** The participant's level reader, or `null` when there is none to meter. */
  public get MeterLevel(): (() => number) | null {
    return this.Participant?.GetAudioLevel ?? null;
  }

  public ngAfterViewInit(): void {
    this.viewReady = true;
    this.syncVideo();
  }

  public ngOnDestroy(): void {
    this.stopFrameWatch();
    this.video.Release();
  }

  /** Attaches the chosen video when it differs from the attached one, and watches its frames when asked to. */
  private syncVideo(): void {
    this.video.Bind(this.chooseVideo(), this.videoRef?.nativeElement);
    this.syncFrameWatch();
  }

  /** Watches the attached video's frames while {@link StallAfterMs} is set: a new source starts out of frames. */
  private syncFrameWatch(): void {
    const source = this.video.Source;
    const element = this.videoRef?.nativeElement;
    if (!source || !element || this.StallAfterMs === null) {
      this.stopFrameWatch();
      return;
    }
    if (source === this.watchedSource) {
      return;
    }
    this.stopFrameWatch();
    this.watchedSource = source;
    const watch = new VideoFrameWatch(this.StallAfterMs, (stalled) => this.zone.run(() => this.onFramesFlowing(!stalled)));
    this.frameWatch = watch;
    // Frames arrive many times a second; only a change of state enters Angular.
    this.zone.runOutsideAngular(() => watch.Watch(element));
  }

  /** The watched video's frames stopped or came back. A stall while {@link HoldLastFrame} is on keeps the frame on show. */
  private onFramesFlowing(flowing: boolean): void {
    this.holdingFrame = !flowing && this.holdLastFrame && this.framesFlowing;
    this.framesFlowing = flowing;
    this.cdr.markForCheck();
    this.FramesFlowingChange.emit(flowing);
  }

  private stopFrameWatch(): void {
    this.frameWatch?.Stop();
    this.frameWatch = null;
    this.watchedSource = null;
    this.framesFlowing = false;
    this.holdingFrame = false;
  }

  /** The preferred video, else a shared screen, the camera, the avatar. */
  private chooseVideo(): MediaVideoSource | null {
    const video = this.Participant?.Video ?? {};
    const preferred = this.Participant?.PreferredVideo;
    return (preferred ? video[preferred] : undefined) ?? video.screen ?? video.camera ?? video.avatar ?? null;
  }

  /** Whether the video the tile chose is the participant's avatar, frames or not. */
  private showsAvatar(): boolean {
    const avatar = this.Participant?.Video.avatar;
    return avatar !== undefined && this.chooseVideo() === avatar;
  }
}
