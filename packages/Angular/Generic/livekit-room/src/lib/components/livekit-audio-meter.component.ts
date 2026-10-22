import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AUDIO_METER_BIN_COUNT, type LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { MediaAudioMeterComponent } from '@memberjunction/ng-realtime-media';
import { LIVEKIT_METER_SETTINGS } from '../models';

/**
 * `mj-livekit-audio-meter`: a participant's audio level as animated bars.
 *
 * @deprecated Use `mj-audio-meter` (`MediaAudioMeterComponent`) from `@memberjunction/ng-realtime-media` with a
 * level reader and {@link LIVEKIT_METER_SETTINGS}, which this renders: the bars move as they always did.
 */
@Component({
  selector: 'mj-livekit-audio-meter',
  standalone: true,
  imports: [MediaAudioMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mj-audio-meter [Level]="Level" [Settings]="Settings"></mj-audio-meter>`,
  styles: [':host { display: inline-flex; align-items: center; height: 100%; }'],
})
export class LiveKitAudioMeterComponent {
  private participant: LiveKitParticipantView | null = null;

  /** Reads the participant's live level, or `null` without a participant. */
  public Level: (() => number) | null = null;

  /** The room's meter settings. */
  public readonly Settings = LIVEKIT_METER_SETTINGS;

  /** The bar slots. */
  public readonly Bars = new Array(AUDIO_METER_BIN_COUNT).fill(0);

  /** @deprecated Use {@link Bars}. */
  public get bars() {
    return this.Bars;
  }

  /** The participant whose audio level this meter renders. */
  @Input()
  public set Participant(value: LiveKitParticipantView | null) {
    this.participant = value;
    this.Level = value ? () => value.Raw.audioLevel : null;
  }
  public get Participant(): LiveKitParticipantView | null {
    return this.participant;
  }
}
