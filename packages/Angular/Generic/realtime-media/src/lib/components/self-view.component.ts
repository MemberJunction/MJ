import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaParticipant } from '@memberjunction/ai-realtime-client/media';
import { MediaTileComponent } from './media-tile.component';
import type { MediaAudioMeterSettings } from './audio-meter.component';

/**
 * `mj-self-view`: the user's own tile, as `mj-media-tile` draws it, with the camera mirrored as in a mirror (a
 * shared screen is not mirrored). "Agent can see this" shows while the host says the user's frames reach an agent.
 * The Hide button asks the host to take the tile away; the camera stays on, so others still see the user. Content
 * marked `mjMediaTileActions` goes to the tile's top corner, before the Hide button.
 */
@Component({
  selector: 'mj-self-view',
  standalone: true,
  imports: [MediaTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-media-tile
      [Participant]="Participant"
      [Mirror]="true"
      [ShowActiveSpeakerRing]="ShowActiveSpeakerRing"
      [ShowName]="ShowName"
      [ShowMeter]="ShowMeter"
      [ShowConnectionQuality]="ShowConnectionQuality"
      [AvatarUrl]="AvatarUrl"
      [MeterSettings]="MeterSettings"
    >
      <ng-container ngProjectAs="[mjMediaTileActions]">
        <ng-content select="[mjMediaTileActions]"></ng-content>
        @if (ShowHide) {
          <button type="button" class="self__hide" aria-label="Hide self-view" title="Hide self-view (others still see you)" (click)="HideRequested.emit()">
            <i class="fa-solid fa-eye-slash" aria-hidden="true"></i>
          </button>
        }
      </ng-container>
    </mj-media-tile>
    @if (AgentCanSee) {
      <span class="self__badge"><i class="fa-solid fa-eye" aria-hidden="true"></i> Agent can see this</span>
    }
  `,
  styleUrls: ['./self-view.component.css'],
})
export class SelfViewComponent {
  /** The user, as a `/media` participant: their camera, or their picture or initials while it is off. */
  @Input() public Participant: MediaParticipant | null = null;
  /** Show "Agent can see this": the host knows the user's frames reach an agent. */
  @Input() public AgentCanSee = false;
  /** Show the Hide button. */
  @Input() public ShowHide = true;
  /** Show the active-speaker ring. */
  @Input() public ShowActiveSpeakerRing = true;
  /** Show the name. */
  @Input() public ShowName = true;
  /** Show the audio meter. */
  @Input() public ShowMeter = true;
  /** Show the connection-quality indicator. */
  @Input() public ShowConnectionQuality = true;
  /** A picture shown while the camera is off. */
  @Input() public AvatarUrl: string | null = null;
  /** The meter's smoothing settings. */
  @Input() public MeterSettings: MediaAudioMeterSettings = {};

  /** The user asked to hide their self-view. */
  @Output() public HideRequested = new EventEmitter<void>();
}
