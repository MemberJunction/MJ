import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ToLiveKitDeviceKind, ToMediaDevice } from '@memberjunction/livekit-room-core';
import { MediaDeviceMenuComponent } from '@memberjunction/ng-realtime-media';
import type { MediaDevice, MediaDeviceSelection } from '@memberjunction/ai-realtime-client/media';
import type { LiveKitDeviceLists, LiveKitDeviceSelection } from '../models';

/**
 * `mj-livekit-device-menu`: microphone, camera and speaker pickers. Presentational: it emits
 * {@link DeviceSelected}; the host calls `LiveKitRoomController.SwitchDevice`.
 *
 * @deprecated Use `mj-media-device-menu` (`MediaDeviceMenuComponent`) from `@memberjunction/ng-realtime-media`
 * with devices mapped by `ToMediaDevice`. This renders it and maps the lists and selections both ways.
 */
@Component({
  selector: 'mj-livekit-device-menu',
  standalone: true,
  imports: [MediaDeviceMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-media-device-menu
      [Devices]="MediaDevices"
      [SelectedMicrophoneID]="SelectedMicrophoneId"
      [SelectedCameraID]="SelectedCameraId"
      [SelectedSpeakerID]="SelectedSpeakerId"
      [ShowNoiseFilter]="ShowNoiseFilter"
      [NoiseFilterEnabled]="NoiseFilterEnabled"
      [ShowBackgroundBlur]="ShowBackgroundEffects"
      [BackgroundBlurEnabled]="BackgroundBlurEnabled"
      (DeviceSelected)="OnMediaDeviceSelected($event)"
      (NoiseFilterToggled)="NoiseFilterToggled.emit($event)"
      (BackgroundBlurToggled)="BackgroundBlurToggled.emit($event)"
      (Close)="Close.emit()"
    ></mj-media-device-menu>
  `,
})
export class LiveKitDeviceMenuComponent {
  private devices: LiveKitDeviceLists = { Microphones: [], Cameras: [], Speakers: [] };

  /** {@link Devices} as one `/media` list. */
  public MediaDevices: MediaDevice[] = [];

  /** The available devices to choose from. */
  @Input()
  public set Devices(value: LiveKitDeviceLists) {
    this.devices = value;
    this.MediaDevices = [...value.Microphones, ...value.Cameras, ...value.Speakers].map(ToMediaDevice);
  }
  public get Devices(): LiveKitDeviceLists {
    return this.devices;
  }

  /** The currently selected microphone device id. */
  @Input() public SelectedMicrophoneId: string | null = null;
  /** The currently selected camera device id. */
  @Input() public SelectedCameraId: string | null = null;
  /** The currently selected speaker device id. */
  @Input() public SelectedSpeakerId: string | null = null;
  /** Show the noise-filter toggle. */
  @Input() public ShowNoiseFilter = false;
  /** Whether the noise filter is currently enabled. */
  @Input() public NoiseFilterEnabled = false;
  /** Show the background-blur toggle. */
  @Input() public ShowBackgroundEffects = false;
  /** Whether background blur is currently enabled. */
  @Input() public BackgroundBlurEnabled = false;

  /** Emits when the user selects a device. */
  @Output() public DeviceSelected = new EventEmitter<LiveKitDeviceSelection>();
  /** Emits when the user toggles the noise filter. */
  @Output() public NoiseFilterToggled = new EventEmitter<boolean>();
  /** Emits when the user toggles background blur. */
  @Output() public BackgroundBlurToggled = new EventEmitter<boolean>();
  /** Emits when the user closes the menu. */
  @Output() public Close = new EventEmitter<void>();

  /** Hands the inner menu's pick on as a LiveKit selection. */
  public OnMediaDeviceSelected(selection: MediaDeviceSelection): void {
    this.Emit(ToLiveKitDeviceKind(selection.Kind), selection.DeviceID);
  }

  /** Emits a device selection for the given kind. */
  public Emit(kind: LiveKitDeviceSelection['Kind'], deviceId: string): void {
    if (deviceId) {
      this.DeviceSelected.emit({ Kind: kind, DeviceId: deviceId });
    }
  }

  /** @deprecated Use {@link Emit}. */
  public emit(kind: LiveKitDeviceSelection['Kind'], deviceId: string): void {
    return this.Emit(kind, deviceId);
  }
}
