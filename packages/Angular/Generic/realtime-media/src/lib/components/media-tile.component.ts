import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { MediaAudioMeterComponent, type MediaAudioMeterSettings } from './audio-meter.component';
import { MediaVideoBinding } from '../media-video-binding';

/**
 * `mj-media-tile`: one participant. Their video (the preferred one, else a shared screen, the camera, the avatar),
 * or their picture or initials when there is none; name, role badge, mute and screen-sharing indicators, an
 * "AI-generated video" label while it shows an avatar, connection quality, an active-speaker ring, an optional audio
 * meter and a pin button.
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
        [class.tile__video--mirrored]="IsMirrored"
        autoplay
        playsinline
        [muted]="true"
      ></video>

      @if (!HasVideo) {
        <div class="tile__placeholder">
          @if (AvatarUrl) {
            <img [src]="AvatarUrl" [alt]="Participant?.DisplayName ?? ''" />
          } @else {
            <span class="tile__initials">{{ Initials }}</span>
          }
        </div>
      }

      @if (IsAvatarVideo || IsSharingScreen) {
        <div class="tile__chips">
          @if (IsAvatarVideo) {
            <span class="tile__chip"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI-generated video</span>
          }
          @if (IsSharingScreen) {
            <span class="tile__chip"><i class="fa-solid fa-display" aria-hidden="true"></i> Sharing</span>
          }
        </div>
      }

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

  private participant: MediaParticipant | null = null;
  private viewReady = false;
  private readonly video = new MediaVideoBinding();


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

  /** Emits when the user clicks the pin button. */
  @Output() public TogglePin = new EventEmitter<void>();

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

  /** Whether the video shown is mirrored: {@link Mirror} is on and the camera is what shows. */
  public get IsMirrored(): boolean {
    const camera = this.Participant?.Video.camera;
    return this.Mirror && camera !== undefined && this.chooseVideo() === camera;
  }

  /** Whether the participant is sharing a screen. */
  public get IsSharingScreen(): boolean {
    return this.Participant?.Video.screen !== undefined;
  }

  /**
   * Whether the video shown is the participant's avatar. An avatar is generated, and its watermark (where the model adds
   * one) cannot be seen, so the tile says so for as long as it shows one.
   */
  public get IsAvatarVideo(): boolean {
    const avatar = this.Participant?.Video.avatar;
    return avatar !== undefined && this.chooseVideo() === avatar;
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
    this.video.Release();
  }

  /** Attaches the chosen video when it differs from the attached one. */
  private syncVideo(): void {
    this.video.Bind(this.chooseVideo(), this.videoRef?.nativeElement);
  }

  /** The preferred video, else a shared screen, the camera, the avatar. */
  private chooseVideo(): MediaVideoSource | null {
    const video = this.Participant?.Video ?? {};
    const preferred = this.Participant?.PreferredVideo;
    return (preferred ? video[preferred] : undefined) ?? video.screen ?? video.camera ?? video.avatar ?? null;
  }
}
