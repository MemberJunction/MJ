import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MJDialogComponent } from '@memberjunction/ng-ui-components';
import { CameraCheckComponent } from '@memberjunction/ng-realtime-media';
import type { MediaDevice, MediaDeviceSelection, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeCaptureState } from '@memberjunction/realtime-runtime';

/**
 * `mj-realtime-camera-check-card`: the camera check over the call. The first time the user turns the camera on in a call,
 * the camera opens for them alone ({@link RealtimeCaptureState.Checking}) and this card shows it, mirrored, with the
 * cameras to choose from. It checks the camera only: it gives `mj-camera-check` no microphones, no level and no buttons. "Turn on camera" lets the agent see it ({@link Confirmed}); "Not now", the close button,
 * Escape and a click outside turn it off ({@link Declined}).
 *
 * Presentational: the overlay gives it the camera's state and a way to {@link Switch} cameras, and calls the session for
 * each answer.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-camera-check-card',
  imports: [MJDialogComponent, CameraCheckComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-dialog [Visible]="true" Title="Check your camera" Size="auto" (Close)="Declined.emit()">
      <p class="camera-check__note">{{ AgentName }} sees your camera once you turn it on.</p>
      <mj-camera-check
        Heading=""
        ConfirmLabel="Turn on camera"
        CancelLabel="Not now"
        [ShowControls]="false"
        [CameraOn]="true"
        [CameraSource]="Source"
        [Devices]="Devices"
        [SelectedCameraID]="SelectedCameraID"
        (Confirmed)="Confirmed.emit()"
        (Cancelled)="Declined.emit()"
        (DeviceSelected)="OnDeviceSelected($event)"
      ></mj-camera-check>
    </mj-dialog>
  `,
  styleUrls: ['./realtime-camera-check-card.component.css'],
})
export class RealtimeCameraCheckCardComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private camera: RealtimeCaptureState | null = null;
  private source: MediaVideoSource | null = null;
  /** The camera being switched to, while the switch runs. */
  private switchingTo: string | null = null;

  /** Who the user is about to show the camera to. */
  @Input() public AgentName = 'The assistant';

  /** Moves the camera to another device and resolves once it has, or has gone back to the one in use. */
  @Input() public Switch: ((deviceId: string) => Promise<unknown>) | null = null;

  /** The camera being checked: its stream, the camera in use and the cameras to choose from. */
  @Input()
  public set Camera(value: RealtimeCaptureState | null) {
    this.camera = value;
    this.source = sourceFor(value?.Stream ?? null, this.source);
  }
  public get Camera(): RealtimeCaptureState | null {
    return this.camera;
  }

  /** The user turned the camera on for the agent. */
  @Output() public Confirmed = new EventEmitter<void>();
  /** The user said not now. */
  @Output() public Declined = new EventEmitter<void>();

  /** The preview: the camera's stream, the same object while the stream is the same. */
  public get Source(): MediaVideoSource | null {
    return this.source;
  }

  /** The cameras to choose from. */
  public get Devices(): readonly MediaDevice[] {
    return this.camera?.Devices ?? [];
  }

  /** The picker's camera: the one being switched to, else the one in use. */
  public get SelectedCameraID(): string | null {
    return this.switchingTo ?? this.camera?.DeviceID ?? null;
  }

  /**
   * A camera picked in the check. The picker shows it while the camera switches, then the camera in use: the new one, or
   * the old one when the new one could not open. A pick of the camera in use changes nothing.
   */
  public async OnDeviceSelected(selection: MediaDeviceSelection): Promise<void> {
    if (selection.Kind !== 'camera' || selection.DeviceID === this.camera?.DeviceID || !this.Switch) {
      return;
    }
    this.switchingTo = selection.DeviceID;
    this.cdr.markForCheck();
    try {
      await this.Switch(selection.DeviceID);
    } finally {
      this.switchingTo = null;
      this.cdr.markForCheck();
    }
  }
}

/** The preview for a stream: the previous one while the stream is the same, so the check keeps its video bound. */
function sourceFor(stream: MediaStream | null, previous: MediaVideoSource | null): MediaVideoSource | null {
  if (!stream) {
    return null;
  }
  return previous?.Kind === 'stream' && previous.Stream === stream ? previous : { Kind: 'stream', Stream: stream };
}
