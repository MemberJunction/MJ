import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { MediaDevice, MediaDeviceKind, MediaDeviceSelection } from '@memberjunction/ai-realtime-client/media';

/**
 * `mj-media-device-menu`: lets the user pick a microphone, camera and speaker. Presentational: it emits
 * {@link DeviceSelected}, and the host switches the device. A kind with no devices is left out.
 */
@Component({
  selector: 'mj-media-device-menu',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu">
      <header class="menu__head">
        <span><i class="fa-solid fa-gear" aria-hidden="true"></i> Devices</span>
        <button type="button" mjButton Variant="icon" Size="sm" AriaLabel="Close devices menu" class="menu__close" (click)="Close.emit()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      @if (Microphones.length > 0) {
        <label class="menu__field">
          <span><i class="fa-solid fa-microphone" aria-hidden="true"></i> Microphone</span>
          <select [ngModel]="SelectedMicrophoneID" (ngModelChange)="Select('microphone', $event)">
            @for (d of Microphones; track d.DeviceID) {
              <option [value]="d.DeviceID">{{ d.Label || 'Microphone' }}</option>
            }
          </select>
        </label>
      }
      @if (Cameras.length > 0) {
        <label class="menu__field">
          <span><i class="fa-solid fa-video" aria-hidden="true"></i> Camera</span>
          <select [ngModel]="SelectedCameraID" (ngModelChange)="Select('camera', $event)">
            @for (d of Cameras; track d.DeviceID) {
              <option [value]="d.DeviceID">{{ d.Label || 'Camera' }}</option>
            }
          </select>
        </label>
      }
      @if (Speakers.length > 0) {
        <label class="menu__field">
          <span><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Speaker</span>
          <select [ngModel]="SelectedSpeakerID" (ngModelChange)="Select('speaker', $event)">
            @for (d of Speakers; track d.DeviceID) {
              <option [value]="d.DeviceID">{{ d.Label || 'Speaker' }}</option>
            }
          </select>
        </label>
      }

      @if (ShowNoiseFilter || ShowBackgroundBlur) {
        <hr class="menu__sep" />
      }
      @if (ShowNoiseFilter) {
        <label class="menu__switch">
          <span><i class="fa-solid fa-wave-square" aria-hidden="true"></i> Noise filter</span>
          <input type="checkbox" [ngModel]="NoiseFilterEnabled" (ngModelChange)="NoiseFilterToggled.emit($event)" />
        </label>
      }
      @if (ShowBackgroundBlur) {
        <label class="menu__switch">
          <span><i class="fa-solid fa-image" aria-hidden="true"></i> Background blur</span>
          <input type="checkbox" [ngModel]="BackgroundBlurEnabled" (ngModelChange)="BackgroundBlurToggled.emit($event)" />
        </label>
      }
    </div>
  `,
  styleUrls: ['./media-device-menu.component.css'],
})
export class MediaDeviceMenuComponent {
  private devices: readonly MediaDevice[] = [];

  /** The microphones in {@link Devices}. */
  public Microphones: readonly MediaDevice[] = [];
  /** The cameras in {@link Devices}. */
  public Cameras: readonly MediaDevice[] = [];
  /** The speakers in {@link Devices}. */
  public Speakers: readonly MediaDevice[] = [];

  /** The devices to choose from, of every kind. */
  @Input()
  public set Devices(value: readonly MediaDevice[]) {
    this.devices = value ?? [];
    this.Microphones = this.devices.filter((d) => d.Kind === 'microphone');
    this.Cameras = this.devices.filter((d) => d.Kind === 'camera');
    this.Speakers = this.devices.filter((d) => d.Kind === 'speaker');
  }
  public get Devices(): readonly MediaDevice[] {
    return this.devices;
  }

  /** The selected microphone's device id. */
  @Input() public SelectedMicrophoneID: string | null = null;
  /** The selected camera's device id. */
  @Input() public SelectedCameraID: string | null = null;
  /** The selected speaker's device id. */
  @Input() public SelectedSpeakerID: string | null = null;
  /** Show the noise-filter toggle. */
  @Input() public ShowNoiseFilter = false;
  /** Whether the noise filter is on. */
  @Input() public NoiseFilterEnabled = false;
  /** Show the background-blur toggle. */
  @Input() public ShowBackgroundBlur = false;
  /** Whether background blur is on. */
  @Input() public BackgroundBlurEnabled = false;

  /** Emits when the user picks a device. */
  @Output() public DeviceSelected = new EventEmitter<MediaDeviceSelection>();
  /** Emits when the user toggles the noise filter. */
  @Output() public NoiseFilterToggled = new EventEmitter<boolean>();
  /** Emits when the user toggles background blur. */
  @Output() public BackgroundBlurToggled = new EventEmitter<boolean>();
  /** Emits when the user closes the menu. */
  @Output() public Close = new EventEmitter<void>();

  /** Emits a pick of a device of the given kind. */
  public Select(kind: MediaDeviceKind, deviceID: string): void {
    if (deviceID) {
      this.DeviceSelected.emit({ Kind: kind, DeviceID: deviceID });
    }
  }
}
