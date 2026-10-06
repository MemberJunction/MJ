import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { MediaDevice, MediaDeviceKind, MediaDeviceSelection, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { MediaAudioMeterComponent, type MediaAudioMeterSettings } from './audio-meter.component';
import { MediaControlsComponent } from './media-controls.component';
import { MediaVideoBinding } from '../media-video-binding';

/** What the user settled on in `mj-camera-check`. */
export interface MediaCameraCheckChoices {
  /** The name to show, trimmed; empty when the check asks for none. */
  DisplayName: string;
  MicrophoneOn: boolean;
  CameraOn: boolean;
  /** The picked microphone's device id, if any. */
  MicrophoneID?: string;
  /** The picked camera's device id, if any. */
  CameraID?: string;
}

/**
 * `mj-camera-check`: a look at the camera and a listen to the microphone before anything is shared. The camera shows
 * mirrored, as in a mirror, beside a level meter, microphone and camera buttons, device pickers and, optionally, a
 * name. Presentational: the host runs the preview. It passes the camera as {@link CameraSource} and the level as
 * {@link MicrophoneLevel}, and starts, stops or switches devices when the check asks. {@link Confirmed} hands over
 * the choices.
 */
@Component({
  selector: 'mj-camera-check',
  standalone: true,
  imports: [FormsModule, MJButtonDirective, MediaAudioMeterComponent, MediaControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="check">
      <div class="check__preview">
        <video #video class="check__video" [class.check__video--hidden]="!ShowsCamera" autoplay playsinline [muted]="true"></video>
        @if (!ShowsCamera) {
          <div class="check__camera-off">
            <i class="fa-solid" [class.fa-video]="CameraOn" [class.fa-video-slash]="!CameraOn" aria-hidden="true"></i>
            {{ CameraOn ? 'Starting camera…' : 'Camera off' }}
          </div>
        }
        @if (MicrophoneOn && MicrophoneLevel) {
          <mj-audio-meter class="check__meter" [Level]="MicrophoneLevel" [Settings]="MeterSettings"></mj-audio-meter>
        }
      </div>

      <div class="check__controls">
        <h3 class="check__heading">{{ Heading }}</h3>

        @if (ShowDisplayName) {
          <label class="check__field">
            <span>Your name</span>
            <input type="text" [(ngModel)]="DisplayName" placeholder="Enter your name" />
          </label>
        }

        <mj-media-controls
          [ShowShare]="false"
          [MicrophoneOn]="MicrophoneOn"
          [CameraOn]="CameraOn"
          (MicrophoneToggled)="MicrophoneToggled.emit($event)"
          (CameraToggled)="CameraToggled.emit($event)"
        ></mj-media-controls>

        @if (ShowDeviceSelection && Microphones.length > 0) {
          <label class="check__field">
            <span><i class="fa-solid fa-microphone" aria-hidden="true"></i> Microphone</span>
            <select [ngModel]="SelectedMicrophoneID" (ngModelChange)="Select('microphone', $event)">
              @for (d of Microphones; track d.DeviceID) {
                <option [value]="d.DeviceID">{{ d.Label || 'Microphone' }}</option>
              }
            </select>
          </label>
        }
        @if (ShowDeviceSelection && Cameras.length > 0) {
          <label class="check__field">
            <span><i class="fa-solid fa-video" aria-hidden="true"></i> Camera</span>
            <select [ngModel]="SelectedCameraID" (ngModelChange)="Select('camera', $event)">
              @for (d of Cameras; track d.DeviceID) {
                <option [value]="d.DeviceID">{{ d.Label || 'Camera' }}</option>
              }
            </select>
          </label>
        }

        <button type="button" mjButton Variant="primary" class="check__confirm" [disabled]="!CanConfirm" (click)="Confirm()">
          {{ ConfirmLabel }}
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./camera-check.component.css'],
})
export class CameraCheckComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  private cameraSource: MediaVideoSource | null = null;
  private devices: readonly MediaDevice[] = [];
  private viewReady = false;
  private readonly video = new MediaVideoBinding();

  /** The microphones in {@link Devices}. */
  public Microphones: readonly MediaDevice[] = [];
  /** The cameras in {@link Devices}. */
  public Cameras: readonly MediaDevice[] = [];
  /** The name being typed. */
  public DisplayName = '';

  /** The heading above the controls. */
  @Input() public Heading = 'Ready to join?';
  /** The confirm button's label. */
  @Input() public ConfirmLabel = 'Continue';
  /** Ask for a name. */
  @Input() public ShowDisplayName = false;
  /** Keep the confirm button off until a name is typed. */
  @Input() public RequireDisplayName = false;
  /** Show the microphone and camera pickers. */
  @Input() public ShowDeviceSelection = true;
  /** Whether the microphone is on. */
  @Input() public MicrophoneOn = true;
  /** Whether the camera is on. */
  @Input() public CameraOn = false;
  /** Reads the microphone's level, 0..1, for the meter. */
  @Input() public MicrophoneLevel: (() => number) | null = null;
  /** The meter's smoothing settings. */
  @Input() public MeterSettings: MediaAudioMeterSettings = {};
  /** The selected microphone's device id. */
  @Input() public SelectedMicrophoneID: string | null = null;
  /** The selected camera's device id. */
  @Input() public SelectedCameraID: string | null = null;

  /** The name the field starts with. */
  @Input()
  public set InitialDisplayName(value: string | null) {
    this.DisplayName = value ?? '';
  }

  /** The camera preview. A different source replaces the shown one; the same source stays. */
  @Input()
  public set CameraSource(value: MediaVideoSource | null) {
    this.cameraSource = value;
    if (this.viewReady) {
      this.video.Bind(value, this.videoRef?.nativeElement);
    }
  }
  public get CameraSource(): MediaVideoSource | null {
    return this.cameraSource;
  }

  /** The devices to pick from. Speakers are left out. */
  @Input()
  public set Devices(value: readonly MediaDevice[]) {
    this.devices = value ?? [];
    this.Microphones = this.devices.filter((d) => d.Kind === 'microphone');
    this.Cameras = this.devices.filter((d) => d.Kind === 'camera');
  }
  public get Devices(): readonly MediaDevice[] {
    return this.devices;
  }

  /** The user asked to turn the microphone on (`true`) or off (`false`). */
  @Output() public MicrophoneToggled = new EventEmitter<boolean>();
  /** The user asked to turn the camera on (`true`) or off (`false`). */
  @Output() public CameraToggled = new EventEmitter<boolean>();
  /** The user picked a device. */
  @Output() public DeviceSelected = new EventEmitter<MediaDeviceSelection>();
  /** The user confirmed their choices. */
  @Output() public Confirmed = new EventEmitter<MediaCameraCheckChoices>();

  /** Whether the preview shows the camera: it is on and the host gave a source. */
  public get ShowsCamera(): boolean {
    return this.CameraOn && this.cameraSource !== null;
  }

  /** Whether the confirm button is on. */
  public get CanConfirm(): boolean {
    return !this.RequireDisplayName || this.DisplayName.trim().length > 0;
  }

  public ngAfterViewInit(): void {
    this.viewReady = true;
    this.video.Bind(this.cameraSource, this.videoRef?.nativeElement);
  }

  public ngOnDestroy(): void {
    this.video.Release();
  }

  /** Emits a pick of a device of the given kind. */
  public Select(kind: MediaDeviceKind, deviceID: string): void {
    if (deviceID) {
      this.DeviceSelected.emit({ Kind: kind, DeviceID: deviceID });
    }
  }

  /** Hands over the choices, when they can be confirmed. */
  public Confirm(): void {
    if (!this.CanConfirm) {
      return;
    }
    this.Confirmed.emit({
      DisplayName: this.ShowDisplayName ? this.DisplayName.trim() : '',
      MicrophoneOn: this.MicrophoneOn,
      CameraOn: this.CameraOn,
      ...(this.SelectedMicrophoneID ? { MicrophoneID: this.SelectedMicrophoneID } : {}),
      ...(this.SelectedCameraID ? { CameraID: this.SelectedCameraID } : {}),
    });
  }
}
