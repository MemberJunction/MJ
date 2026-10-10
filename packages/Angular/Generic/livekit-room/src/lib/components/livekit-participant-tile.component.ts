import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ToMediaParticipant, type LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { MediaTileComponent } from '@memberjunction/ng-realtime-media';
import type { MediaParticipant } from '@memberjunction/ai-realtime-client/media';
import { LiveKitParticipantAudioComponent } from './livekit-participant-audio.component';
import { LIVEKIT_METER_SETTINGS } from '../models';

/**
 * `mj-livekit-participant-tile`: one participant's tile, playing their voice as the tile always did.
 *
 * @deprecated Render `mj-media-tile` (`MediaTileComponent`) from `@memberjunction/ng-realtime-media` with
 * `ToMediaParticipant`, and play voices with `mj-livekit-participant-audio` outside the layout, as the room does: a
 * voice played by its tile stops when the tile leaves the screen. This wrapper renders both.
 */
@Component({
  selector: 'mj-livekit-participant-tile',
  standalone: true,
  imports: [MediaTileComponent, LiveKitParticipantAudioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-media-tile
      [Participant]="MediaParticipant"
      [ShowActiveSpeakerRing]="ShowActiveSpeakerRing"
      [ShowName]="ShowNameBadge"
      [ShowMeter]="ShowAudioMeter"
      [ShowConnectionQuality]="ShowConnectionQuality"
      [AvatarUrl]="AvatarUrl"
      [Pinnable]="ShowPinButton"
      [IsPinned]="IsPinned"
      [MeterSettings]="MeterSettings"
      (TogglePin)="TogglePin.emit()"
    ></mj-media-tile>
    <mj-livekit-participant-audio [Participant]="Participant"></mj-livekit-participant-audio>
  `,
  styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class LiveKitParticipantTileComponent {
  @ViewChild(MediaTileComponent) private tile?: MediaTileComponent;

  /** The room's meter settings. */
  public readonly MeterSettings = LIVEKIT_METER_SETTINGS;

  /** The participant to render. */
  @Input() public Participant: LiveKitParticipantView | null = null;
  /** Show the active-speaker ring around the tile. */
  @Input() public ShowActiveSpeakerRing = true;
  /** Show the name + role badge. */
  @Input() public ShowNameBadge = true;
  /** Show the per-tile audio meter. */
  @Input() public ShowAudioMeter = true;
  /** Show the connection-quality indicator. */
  @Input() public ShowConnectionQuality = true;
  /** Optional avatar image URL shown when the participant has no video. */
  @Input() public AvatarUrl: string | null = null;
  /** Show the pin/unpin button (hover-revealed). */
  @Input() public ShowPinButton = false;
  /** Whether this tile is currently pinned. */
  @Input() public IsPinned = false;

  /** Emitted when the user clicks the pin button. */
  @Output() public TogglePin = new EventEmitter<void>();

  /** {@link Participant} as the generic tile renders it. */
  public get MediaParticipant(): MediaParticipant | null {
    return this.Participant ? ToMediaParticipant(this.Participant) : null;
  }

  /** Whether the tile shows video. */
  public get HasVideo(): boolean {
    return this.tile?.HasVideo ?? false;
  }

  /** @deprecated Use {@link HasVideo}. */
  public get hasVideo(): boolean {
    return this.HasVideo;
  }

  /** The participant's initials for the avatar fallback. */
  public get Initials(): string {
    return this.tile?.Initials ?? '?';
  }

  /** @deprecated Use {@link Initials}. */
  public get initials(): string {
    return this.Initials;
  }
}
