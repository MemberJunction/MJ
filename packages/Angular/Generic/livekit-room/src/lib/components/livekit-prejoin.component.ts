import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { LiveKitMediaPreview, ToMediaDevice, type LiveKitDevice } from '@memberjunction/livekit-room-core';
import { CameraCheckComponent, type MediaCameraCheckChoices } from '@memberjunction/ng-realtime-media';
import type { MediaDevice, MediaDeviceSelection, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';

/** The choices a user confirms on the PreJoin screen, handed to the room connect options. */
export interface LiveKitPreJoinChoices {
  /** The display name to join as. */
  DisplayName: string;
  /** Whether to join with the microphone enabled. */
  MicrophoneEnabled: boolean;
  /** Whether to join with the camera enabled. */
  CameraEnabled: boolean;
  /** The chosen microphone device id, if any. */
  MicrophoneDeviceId?: string;
  /** The chosen camera device id, if any. */
  CameraDeviceId?: string;
}

/**
 * `mj-livekit-prejoin`: a device-preview lobby shown before joining a room. It runs the room-free
 * {@link LiveKitMediaPreview} (camera, microphone level, devices) and renders `mj-camera-check`, then emits
 * {@link Join} with the chosen {@link LiveKitPreJoinChoices}.
 *
 * @deprecated Render `mj-camera-check` (`CameraCheckComponent`) from `@memberjunction/ng-realtime-media` and run the
 * preview yourself: give it the camera as a source and the microphone level as a reader. This wrapper does exactly
 * that with `LiveKitMediaPreview`. The room still renders it until task F2 moves the preview into the room.
 */
@Component({
  selector: 'mj-livekit-prejoin',
  standalone: true,
  imports: [CameraCheckComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-prejoin">
      <mj-camera-check
        [Heading]="Heading"
        [ConfirmLabel]="JoinLabel"
        [InitialDisplayName]="InitialDisplayName"
        [ShowDisplayName]="RequireDisplayName || ShowDisplayName"
        [RequireDisplayName]="RequireDisplayName"
        [ShowDeviceSelection]="ShowDeviceSelection"
        [MicrophoneOn]="MicEnabled"
        [CameraOn]="CameraEnabled"
        [CameraSource]="CameraSource"
        [MicrophoneLevel]="MicrophoneLevel"
        [Devices]="MediaDevices"
        [SelectedMicrophoneID]="SelectedMic"
        [SelectedCameraID]="SelectedCam"
        (MicrophoneToggled)="ToggleMic()"
        (CameraToggled)="ToggleCamera()"
        (DeviceSelected)="OnDeviceSelected($event)"
        (Confirmed)="OnConfirmed($event)"
      ></mj-camera-check>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .lk-prejoin {
        height: 100%;
        background: var(--mj-bg-page);
      }
    `,
  ],
})
export class LiveKitPreJoinComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly preview = new LiveKitMediaPreview();

  /** Heading shown above the controls. */
  @Input() public Heading = 'Ready to join?';
  /** The join button label. */
  @Input() public JoinLabel = 'Join now';
  /** Pre-fill the display name. */
  @Input() public InitialDisplayName: string | null = null;
  /** Require a non-empty display name before join is allowed. */
  @Input() public RequireDisplayName = true;
  /** Show the display-name field even when not required. */
  @Input() public ShowDisplayName = true;
  /** Show the microphone/camera device dropdowns. */
  @Input() public ShowDeviceSelection = true;
  /** Start with the camera previewing/enabled. */
  @Input() public StartWithCamera = false;

  /** Emits the user's confirmed choices when they join. */
  @Output() public Join = new EventEmitter<LiveKitPreJoinChoices>();

  /** The display name joined with: the initial name, then the one confirmed. */
  public displayName = '';
  /** Whether the mic will be enabled on join. */
  public MicEnabled = true;

  /** @deprecated Use {@link MicEnabled}. */
  public get micEnabled() {
    return this.MicEnabled;
  }
  /** @deprecated Use {@link MicEnabled}. */
  public set micEnabled(value) {
    this.MicEnabled = value;
  }
  /** Whether the camera will be enabled on join (also drives the preview). */
  public CameraEnabled = false;

  /** @deprecated Use {@link CameraEnabled}. */
  public get cameraEnabled() {
    return this.CameraEnabled;
  }
  /** @deprecated Use {@link CameraEnabled}. */
  public set cameraEnabled(value) {
    this.CameraEnabled = value;
  }
  /** The live microphone level as a percentage. */
  public get MicLevelPct(): number {
    return Math.round(this.preview.ReadMicLevel() * 100);
  }

  /** @deprecated Use {@link MicLevelPct}. */
  public get micLevelPct(): number {
    return this.MicLevelPct;
  }
  /** Available microphones. */
  public Microphones: LiveKitDevice[] = [];

  /** @deprecated Use {@link Microphones}. */
  public get microphones(): LiveKitDevice[] {
    return this.Microphones;
  }
  /** @deprecated Use {@link Microphones}. */
  public set microphones(value: LiveKitDevice[]) {
    this.Microphones = value;
  }
  /** Available cameras. */
  public Cameras: LiveKitDevice[] = [];

  /** @deprecated Use {@link Cameras}. */
  public get cameras(): LiveKitDevice[] {
    return this.Cameras;
  }
  /** @deprecated Use {@link Cameras}. */
  public set cameras(value: LiveKitDevice[]) {
    this.Cameras = value;
  }
  /** Selected microphone device id. */
  public SelectedMic: string | null = null;

  /** @deprecated Use {@link SelectedMic}. */
  public get selectedMic(): string | null {
    return this.SelectedMic;
  }
  /** @deprecated Use {@link SelectedMic}. */
  public set selectedMic(value: string | null) {
    this.SelectedMic = value;
  }
  /** Selected camera device id. */
  public SelectedCam: string | null = null;

  /** @deprecated Use {@link SelectedCam}. */
  public get selectedCam(): string | null {
    return this.SelectedCam;
  }
  /** @deprecated Use {@link SelectedCam}. */
  public set selectedCam(value: string | null) {
    this.SelectedCam = value;
  }

  /** The camera preview as a `/media` source, while the camera previews. */
  public CameraSource: MediaVideoSource | null = null;
  /** The microphones and cameras as `/media` devices, for the camera check. */
  public MediaDevices: MediaDevice[] = [];
  /** Reads the preview's microphone level, 0..1, for the camera check's meter. */
  public readonly MicrophoneLevel = (): number => this.preview.ReadMicLevel();

  /** Whether the join button is enabled. */
  public get CanJoin(): boolean {
    return !this.RequireDisplayName || this.displayName.trim().length > 0;
  }

  /** @deprecated Use {@link CanJoin}. */
  public get canJoin(): boolean {
    return this.CanJoin;
  }

  public async ngOnInit(): Promise<void> {
    this.displayName = this.InitialDisplayName ?? '';
    this.CameraEnabled = this.StartWithCamera;
    await this.preview.StartAudio();
    if (this.CameraEnabled) {
      await this.startVideoPreview();
    }
    await this.enumerateDevices();
    this.cdr.markForCheck();
  }

  public async ngOnDestroy(): Promise<void> {
    await this.preview.Stop();
  }

  /** Toggles the microphone intent (and starts/stops the preview audio). */
  public async ToggleMic(): Promise<void> {
    this.MicEnabled = !this.MicEnabled;
    if (this.MicEnabled) {
      await this.preview.StartAudio(this.SelectedMic ?? undefined);
    } else {
      await this.preview.StopAudio();
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleMic}. */
  public async toggleMic(): Promise<void> {
    return this.ToggleMic();
  }

  /** Toggles the camera intent (and starts/stops the preview video). */
  public async ToggleCamera(): Promise<void> {
    this.CameraEnabled = !this.CameraEnabled;
    if (this.CameraEnabled) {
      await this.startVideoPreview();
    } else {
      await this.preview.StopVideo();
      this.CameraSource = null;
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleCamera}. */
  public async toggleCamera(): Promise<void> {
    return this.ToggleCamera();
  }

  /** Restarts the preview audio on the newly selected microphone. */
  public async OnMicDeviceChange(): Promise<void> {
    if (this.MicEnabled) {
      await this.preview.StartAudio(this.SelectedMic ?? undefined);
    }
  }

  /** @deprecated Use {@link OnMicDeviceChange}. */
  public async onMicDeviceChange(): Promise<void> {
    return this.OnMicDeviceChange();
  }

  /** Restarts the preview video on the newly selected camera. */
  public async OnCamDeviceChange(): Promise<void> {
    if (this.CameraEnabled) {
      await this.startVideoPreview();
    }
  }

  /** @deprecated Use {@link OnCamDeviceChange}. */
  public async onCamDeviceChange(): Promise<void> {
    return this.OnCamDeviceChange();
  }

  /** Takes a device picked in the camera check and restarts the preview on it. */
  public OnDeviceSelected(selection: MediaDeviceSelection): void {
    if (selection.Kind === 'microphone') {
      this.SelectedMic = selection.DeviceID;
      void this.OnMicDeviceChange();
    } else if (selection.Kind === 'camera') {
      this.SelectedCam = selection.DeviceID;
      void this.OnCamDeviceChange();
    }
  }

  /** Joins with the name the camera check confirmed. */
  public OnConfirmed(choices: MediaCameraCheckChoices): void {
    this.displayName = choices.DisplayName;
    this.join();
  }

  /** Emits the confirmed choices. */
  public join(): void {
    if (!this.CanJoin) {
      return;
    }
    this.Join.emit({
      DisplayName: this.displayName.trim(),
      MicrophoneEnabled: this.MicEnabled,
      CameraEnabled: this.CameraEnabled,
      MicrophoneDeviceId: this.SelectedMic ?? undefined,
      CameraDeviceId: this.SelectedCam ?? undefined,
    });
  }

  /** Starts (or restarts) the preview video and hands it to the camera check as a source. */
  private async startVideoPreview(): Promise<void> {
    const track = await this.preview.StartVideo(this.SelectedCam ?? undefined);
    this.CameraSource = {
      Kind: 'element',
      Attach: (element: HTMLVideoElement) => {
        track.attach(element);
        return () => {
          track.detach(element);
        };
      },
    };
    this.cdr.markForCheck();
  }

  /** Enumerates available devices (labels populate once preview permission is granted). */
  private async enumerateDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.Microphones = devices.filter((d) => d.kind === 'audioinput').map((d) => ({ DeviceId: d.deviceId, Label: d.label, Kind: 'audioinput' }));
    this.Cameras = devices.filter((d) => d.kind === 'videoinput').map((d) => ({ DeviceId: d.deviceId, Label: d.label, Kind: 'videoinput' }));
    this.MediaDevices = [...this.Microphones, ...this.Cameras].map(ToMediaDevice);
    this.SelectedMic ??= this.Microphones[0]?.DeviceId ?? null;
    this.SelectedCam ??= this.Cameras[0]?.DeviceId ?? null;
  }
}
