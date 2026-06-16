import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    NgZone,
    OnDestroy,
    Output,
    ViewChild,
    inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LiveKitMediaPreview, type LiveKitDevice } from '@memberjunction/livekit-room-core';

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
 * `mj-livekit-prejoin` — a device-preview lobby shown before joining a room. Previews the camera, meters
 * the microphone, lets the user pick devices + a name, and toggle mic/cam, then emits {@link Join} with
 * the chosen {@link LiveKitPreJoinChoices}. Uses the room-free {@link LiveKitMediaPreview} from the core.
 */
@Component({
    selector: 'mj-livekit-prejoin',
    standalone: true,
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="lk-prejoin">
            <div class="lk-prejoin__preview">
                <video #video class="lk-prejoin__video" [class.lk-prejoin__video--off]="!cameraEnabled" autoplay playsinline [muted]="true"></video>
                @if (!cameraEnabled) {
                    <div class="lk-prejoin__camera-off"><i class="fa-solid fa-video-slash"></i></div>
                }
                <div class="lk-prejoin__mic-meter" [style.width.%]="micLevelPct" aria-hidden="true"></div>
            </div>

            <div class="lk-prejoin__controls">
                <h3 class="lk-prejoin__heading">{{ Heading }}</h3>

                @if (RequireDisplayName || ShowDisplayName) {
                    <label class="lk-prejoin__field">
                        <span>Your name</span>
                        <input type="text" class="lk-prejoin__input" [(ngModel)]="displayName" name="displayName" placeholder="Enter your name" />
                    </label>
                }

                <div class="lk-prejoin__toggles">
                    <button type="button" class="lk-prejoin__toggle" [class.lk-prejoin__toggle--off]="!micEnabled" (click)="toggleMic()">
                        <i class="fa-solid" [class.fa-microphone]="micEnabled" [class.fa-microphone-slash]="!micEnabled"></i>
                    </button>
                    <button type="button" class="lk-prejoin__toggle" [class.lk-prejoin__toggle--off]="!cameraEnabled" (click)="toggleCamera()">
                        <i class="fa-solid" [class.fa-video]="cameraEnabled" [class.fa-video-slash]="!cameraEnabled"></i>
                    </button>
                </div>

                @if (ShowDeviceSelection) {
                    <label class="lk-prejoin__field">
                        <span><i class="fa-solid fa-microphone"></i> Microphone</span>
                        <select [(ngModel)]="selectedMic" name="mic" (ngModelChange)="onMicDeviceChange()">
                            @for (d of microphones; track d.DeviceId) {
                                <option [value]="d.DeviceId">{{ d.Label || 'Microphone' }}</option>
                            }
                        </select>
                    </label>
                    <label class="lk-prejoin__field">
                        <span><i class="fa-solid fa-video"></i> Camera</span>
                        <select [(ngModel)]="selectedCam" name="cam" (ngModelChange)="onCamDeviceChange()">
                            @for (d of cameras; track d.DeviceId) {
                                <option [value]="d.DeviceId">{{ d.Label || 'Camera' }}</option>
                            }
                        </select>
                    </label>
                }

                <button type="button" class="lk-prejoin__join" [disabled]="!canJoin" (click)="join()">
                    {{ JoinLabel }}
                </button>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
            }
            .lk-prejoin {
                display: flex;
                gap: 20px;
                align-items: center;
                justify-content: center;
                flex-wrap: wrap;
                height: 100%;
                padding: 20px;
                background: var(--mj-bg-page, #0b1220);
            }
            .lk-prejoin__preview {
                position: relative;
                width: 420px;
                max-width: 100%;
                aspect-ratio: 16 / 9;
                background: #000;
                border-radius: 12px;
                overflow: hidden;
            }
            .lk-prejoin__video {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transform: scaleX(-1);
            }
            .lk-prejoin__video--off {
                display: none;
            }
            .lk-prejoin__camera-off {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2rem;
                color: var(--mj-text-disabled, #94a3b8);
            }
            .lk-prejoin__mic-meter {
                position: absolute;
                left: 0;
                bottom: 0;
                height: 4px;
                background: var(--mj-status-success, #22c55e);
                transition: width 80ms linear;
            }
            .lk-prejoin__controls {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 300px;
                max-width: 100%;
                color: var(--mj-text-inverse, #fff);
            }
            .lk-prejoin__heading {
                margin: 0;
            }
            .lk-prejoin__field {
                display: flex;
                flex-direction: column;
                gap: 4px;
                font-size: 0.8rem;
                color: var(--mj-text-inverse, #fff);
                opacity: 0.9;
            }
            .lk-prejoin__input,
            .lk-prejoin__field select {
                padding: 8px 10px;
                border-radius: 8px;
                border: 1px solid var(--mj-border-default, #334155);
                background: var(--mj-bg-surface, #1e293b);
                color: var(--mj-text-inverse, #fff);
            }
            .lk-prejoin__toggles {
                display: flex;
                gap: 10px;
            }
            .lk-prejoin__toggle {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                color: var(--mj-text-inverse, #fff);
                background: var(--mj-bg-surface, #1e293b);
            }
            .lk-prejoin__toggle--off {
                background: var(--mj-status-error, #ef4444);
            }
            .lk-prejoin__join {
                margin-top: 6px;
                padding: 11px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                color: var(--mj-text-inverse, #fff);
                background: var(--mj-brand-primary, #0076b6);
            }
            .lk-prejoin__join:disabled {
                opacity: 0.5;
                cursor: default;
            }
        `,
    ],
})
export class LiveKitPreJoinComponent implements AfterViewInit, OnDestroy {
    private readonly zone = inject(NgZone);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly preview = new LiveKitMediaPreview();
    @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
    private rafId: number | null = null;

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

    /** Current display-name draft. */
    public displayName = '';
    /** Whether the mic will be enabled on join. */
    public micEnabled = true;
    /** Whether the camera will be enabled on join (also drives the preview). */
    public cameraEnabled = false;
    /** Live mic level percentage for the preview meter. */
    public micLevelPct = 0;
    /** Available microphones. */
    public microphones: LiveKitDevice[] = [];
    /** Available cameras. */
    public cameras: LiveKitDevice[] = [];
    /** Selected microphone device id. */
    public selectedMic: string | null = null;
    /** Selected camera device id. */
    public selectedCam: string | null = null;

    /** Whether the join button is enabled. */
    public get canJoin(): boolean {
        return !this.RequireDisplayName || this.displayName.trim().length > 0;
    }

    public async ngAfterViewInit(): Promise<void> {
        this.displayName = this.InitialDisplayName ?? '';
        this.cameraEnabled = this.StartWithCamera;
        await this.preview.StartAudio();
        if (this.cameraEnabled) {
            await this.startVideoPreview();
        }
        await this.enumerateDevices();
        this.startMeterLoop();
        this.cdr.markForCheck();
    }

    public async ngOnDestroy(): Promise<void> {
        this.stopMeterLoop();
        await this.preview.Stop();
    }

    /** Toggles the microphone intent (and starts/stops the preview audio). */
    public async toggleMic(): Promise<void> {
        this.micEnabled = !this.micEnabled;
        if (this.micEnabled) {
            await this.preview.StartAudio(this.selectedMic ?? undefined);
        } else {
            await this.preview.StopAudio();
        }
    }

    /** Toggles the camera intent (and starts/stops the preview video). */
    public async toggleCamera(): Promise<void> {
        this.cameraEnabled = !this.cameraEnabled;
        if (this.cameraEnabled) {
            await this.startVideoPreview();
        } else {
            await this.preview.StopVideo();
        }
        this.cdr.markForCheck();
    }

    /** Restarts the preview audio on the newly selected microphone. */
    public async onMicDeviceChange(): Promise<void> {
        if (this.micEnabled) {
            await this.preview.StartAudio(this.selectedMic ?? undefined);
        }
    }

    /** Restarts the preview video on the newly selected camera. */
    public async onCamDeviceChange(): Promise<void> {
        if (this.cameraEnabled) {
            await this.startVideoPreview();
        }
    }

    /** Emits the confirmed choices. */
    public join(): void {
        if (!this.canJoin) {
            return;
        }
        this.Join.emit({
            DisplayName: this.displayName.trim(),
            MicrophoneEnabled: this.micEnabled,
            CameraEnabled: this.cameraEnabled,
            MicrophoneDeviceId: this.selectedMic ?? undefined,
            CameraDeviceId: this.selectedCam ?? undefined,
        });
    }

    /** Starts (or restarts) the preview video and attaches it to the element. */
    private async startVideoPreview(): Promise<void> {
        const track = await this.preview.StartVideo(this.selectedCam ?? undefined);
        const el = this.videoRef?.nativeElement;
        if (el) {
            track.attach(el);
        }
    }

    /** Enumerates available devices (labels populate once preview permission is granted). */
    private async enumerateDevices(): Promise<void> {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
            return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.microphones = devices.filter((d) => d.kind === 'audioinput').map((d) => ({ DeviceId: d.deviceId, Label: d.label, Kind: 'audioinput' }));
        this.cameras = devices.filter((d) => d.kind === 'videoinput').map((d) => ({ DeviceId: d.deviceId, Label: d.label, Kind: 'videoinput' }));
        this.selectedMic ??= this.microphones[0]?.DeviceId ?? null;
        this.selectedCam ??= this.cameras[0]?.DeviceId ?? null;
    }

    /** Runs the mic-level meter loop outside Angular and writes the percentage. */
    private startMeterLoop(): void {
        this.zone.runOutsideAngular(() => {
            const tick = (): void => {
                const next = Math.round(this.preview.ReadMicLevel() * 100);
                if (next !== this.micLevelPct) {
                    this.micLevelPct = next;
                    this.cdr.detectChanges();
                }
                this.rafId = requestAnimationFrame(tick);
            };
            this.rafId = requestAnimationFrame(tick);
        });
    }

    /** Cancels the meter loop. */
    private stopMeterLoop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}
