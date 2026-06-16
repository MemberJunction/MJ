import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { LiveKitDeviceLists, LiveKitDeviceSelection } from '../models';

/**
 * Device-settings menu — lets the user pick microphone, camera, and speaker. Presentational: it emits
 * {@link DeviceSelected}; the host calls {@link LiveKitRoomController.SwitchDevice}.
 */
@Component({
  selector: 'mj-livekit-device-menu',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-devices">
      <header class="lk-devices__head">
        <span><i class="fa-solid fa-gear"></i> Devices</span>
        <button type="button" class="lk-devices__close" (click)="Close.emit()"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <label class="lk-devices__field">
        <span><i class="fa-solid fa-microphone"></i> Microphone</span>
        <select [ngModel]="SelectedMicrophoneId" (ngModelChange)="emit('audioinput', $event)">
          @for (d of Devices.Microphones; track d.DeviceId) {
            <option [value]="d.DeviceId">{{ d.Label || 'Microphone' }}</option>
          }
        </select>
      </label>
      <label class="lk-devices__field">
        <span><i class="fa-solid fa-video"></i> Camera</span>
        <select [ngModel]="SelectedCameraId" (ngModelChange)="emit('videoinput', $event)">
          @for (d of Devices.Cameras; track d.DeviceId) {
            <option [value]="d.DeviceId">{{ d.Label || 'Camera' }}</option>
          }
        </select>
      </label>
      <label class="lk-devices__field">
        <span><i class="fa-solid fa-volume-high"></i> Speaker</span>
        <select [ngModel]="SelectedSpeakerId" (ngModelChange)="emit('audiooutput', $event)">
          @for (d of Devices.Speakers; track d.DeviceId) {
            <option [value]="d.DeviceId">{{ d.Label || 'Speaker' }}</option>
          }
        </select>
      </label>

      @if (ShowNoiseFilter || ShowBackgroundEffects) {
        <hr class="lk-devices__sep" />
      }
      @if (ShowNoiseFilter) {
        <label class="lk-devices__switch">
          <span><i class="fa-solid fa-wave-square"></i> Noise filter</span>
          <input type="checkbox" [ngModel]="NoiseFilterEnabled" (ngModelChange)="NoiseFilterToggled.emit($event)" />
        </label>
      }
      @if (ShowBackgroundEffects) {
        <label class="lk-devices__switch">
          <span><i class="fa-solid fa-image"></i> Background blur</span>
          <input type="checkbox" [ngModel]="BackgroundBlurEnabled" (ngModelChange)="BackgroundBlurToggled.emit($event)" />
        </label>
      }
    </div>
  `,
  styles: [
    `
      .lk-devices {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        min-width: 260px;
        background: var(--mj-bg-surface-elevated, #fff);
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      }
      .lk-devices__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        color: var(--mj-text-primary, #334155);
      }
      .lk-devices__close {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--mj-text-muted, #64748b);
      }
      .lk-devices__field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.78rem;
        color: var(--mj-text-secondary, #475569);
      }
      .lk-devices__field select {
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default, #e2e8f0);
        background: var(--mj-bg-surface, #fff);
        color: var(--mj-text-primary, #334155);
      }
      .lk-devices__sep {
        border: none;
        border-top: 1px solid var(--mj-border-subtle, #eef2f7);
        margin: 2px 0;
      }
      .lk-devices__switch {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.82rem;
        color: var(--mj-text-secondary, #475569);
      }
    `,
  ],
})
export class LiveKitDeviceMenuComponent {
  /** The available devices to choose from. */
  @Input() public Devices: LiveKitDeviceLists = { Microphones: [], Cameras: [], Speakers: [] };
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

  /** Emits a device selection for the given kind. */
  public emit(kind: LiveKitDeviceSelection['Kind'], deviceId: string): void {
    if (deviceId) {
      this.DeviceSelected.emit({ Kind: kind, DeviceId: deviceId });
    }
  }
}
