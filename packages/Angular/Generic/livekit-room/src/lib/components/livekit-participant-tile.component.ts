import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnDestroy,
    ViewChild,
    inject,
} from '@angular/core';
import { Track } from 'livekit-client';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { LiveKitAudioMeterComponent } from './livekit-audio-meter.component';

/**
 * Renders ONE participant tile: their video (camera or screen-share), an avatar/initials fallback when
 * no video is published, name + role badge, mute / screen indicators, connection-quality dots, an
 * active-speaker ring, and an optional audio meter. Owns the livekit-client track-attach lifecycle for
 * the participant (video → a muted `<video>`, remote microphone → a hidden `<audio>` so it's audible).
 */
@Component({
    selector: 'mj-livekit-participant-tile',
    standalone: true,
    imports: [LiveKitAudioMeterComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div
            class="lk-tile"
            [class.lk-tile--speaking]="ShowActiveSpeakerRing && Participant?.IsSpeaking"
            [class.lk-tile--agent]="Participant?.Role === 'agent'"
        >
            <video #video class="lk-tile__video" [class.lk-tile__video--hidden]="!hasVideo" autoplay playsinline [muted]="true"></video>
            <audio #audio autoplay></audio>

            @if (!hasVideo) {
                <div class="lk-tile__avatar">
                    @if (AvatarUrl) {
                        <img [src]="AvatarUrl" [alt]="Participant?.DisplayName" />
                    } @else {
                        <span class="lk-tile__initials">{{ initials }}</span>
                    }
                </div>
            }

            @if (Participant?.IsScreenSharing) {
                <span class="lk-tile__chip lk-tile__chip--screen"><i class="fa-solid fa-display"></i> Sharing</span>
            }

            <div class="lk-tile__footer">
                @if (ShowNameBadge) {
                    <span class="lk-tile__name">
                        @if (!Participant?.HasAudio) {
                            <i class="fa-solid fa-microphone-slash lk-tile__muted-icon" title="Muted"></i>
                        }
                        {{ Participant?.DisplayName }}
                        @if (Participant?.Role === 'agent') {
                            <span class="lk-tile__role">AI</span>
                        }
                    </span>
                }
                <span class="lk-tile__footer-right">
                    @if (ShowAudioMeter && Participant?.HasAudio) {
                        <mj-livekit-audio-meter class="lk-tile__meter" [Participant]="Participant"></mj-livekit-audio-meter>
                    }
                    @if (ShowConnectionQuality) {
                        <span class="lk-tile__quality lk-tile__quality--{{ Participant?.ConnectionQuality }}" [title]="Participant?.ConnectionQuality">
                            <i class="fa-solid fa-signal"></i>
                        </span>
                    }
                </span>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            .lk-tile {
                position: relative;
                width: 100%;
                height: 100%;
                min-height: 120px;
                border-radius: 12px;
                overflow: hidden;
                background: var(--mj-bg-surface-sunken, #0f172a);
                border: 2px solid transparent;
                transition: border-color 140ms ease, box-shadow 140ms ease;
            }
            .lk-tile--speaking {
                border-color: var(--mj-brand-primary, #0076b6);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary, #0076b6) 25%, transparent);
            }
            .lk-tile--agent {
                background: linear-gradient(160deg, color-mix(in srgb, var(--mj-brand-primary, #0076b6) 22%, var(--mj-bg-surface-sunken, #0f172a)), var(--mj-bg-surface-sunken, #0f172a));
            }
            .lk-tile__video {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                background: #000;
            }
            .lk-tile__video--hidden {
                display: none;
            }
            .lk-tile__avatar {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .lk-tile__avatar img {
                width: 72px;
                height: 72px;
                border-radius: 50%;
                object-fit: cover;
            }
            .lk-tile__initials {
                width: 72px;
                height: 72px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.6rem;
                font-weight: 600;
                color: var(--mj-text-inverse, #fff);
                background: var(--mj-brand-primary, #0076b6);
            }
            .lk-tile__chip {
                position: absolute;
                top: 8px;
                left: 8px;
                font-size: 0.72rem;
                padding: 2px 8px;
                border-radius: 999px;
                color: var(--mj-text-inverse, #fff);
                background: rgba(0, 0, 0, 0.55);
            }
            .lk-tile__footer {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 6px 10px;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
            }
            .lk-tile__name {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 0.82rem;
                color: var(--mj-text-inverse, #fff);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
                max-width: 70%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .lk-tile__role {
                font-size: 0.6rem;
                font-weight: 700;
                letter-spacing: 0.04em;
                padding: 1px 5px;
                border-radius: 4px;
                background: var(--mj-brand-primary, #0076b6);
                color: var(--mj-text-inverse, #fff);
            }
            .lk-tile__muted-icon {
                color: var(--mj-status-error, #ef4444);
            }
            .lk-tile__footer-right {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                height: 16px;
            }
            .lk-tile__meter {
                width: 28px;
                height: 14px;
            }
            .lk-tile__quality {
                font-size: 0.72rem;
                color: var(--mj-text-disabled, #94a3b8);
            }
            .lk-tile__quality--excellent,
            .lk-tile__quality--good {
                color: var(--mj-status-success, #22c55e);
            }
            .lk-tile__quality--poor {
                color: var(--mj-status-warning, #f59e0b);
            }
            .lk-tile__quality--lost {
                color: var(--mj-status-error, #ef4444);
            }
        `,
    ],
})
export class LiveKitParticipantTileComponent implements AfterViewInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
    @ViewChild('audio') private audioRef?: ElementRef<HTMLAudioElement>;

    private participant: LiveKitParticipantView | null = null;
    private viewReady = false;
    private attachedVideoSid: string | null = null;
    private attachedAudioSid: string | null = null;

    /** Whether a video track is currently attached (drives the avatar fallback). */
    public hasVideo = false;

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

    /** The participant to render. Setting it re-syncs the attached media tracks. */
    @Input()
    public set Participant(value: LiveKitParticipantView | null) {
        this.participant = value;
        if (this.viewReady) {
            this.syncMedia();
        }
    }
    public get Participant(): LiveKitParticipantView | null {
        return this.participant;
    }

    /** The participant's initials for the avatar fallback. */
    public get initials(): string {
        const name = this.Participant?.DisplayName ?? '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
            return '?';
        }
        return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    }

    public ngAfterViewInit(): void {
        this.viewReady = true;
        this.syncMedia();
    }

    public ngOnDestroy(): void {
        this.detachVideo();
        this.detachAudio();
    }

    /** Attaches/detaches the participant's current video + audio tracks to this tile's media elements. */
    private syncMedia(): void {
        this.syncVideo();
        this.syncAudio();
        this.cdr.markForCheck();
    }

    /** Picks the screen-share track if sharing, else the camera track, and attaches it to the video element. */
    private syncVideo(): void {
        const p = this.participant;
        const el = this.videoRef?.nativeElement;
        if (!p || !el) {
            this.detachVideo();
            this.hasVideo = false;
            return;
        }
        const source = p.IsScreenSharing ? Track.Source.ScreenShare : Track.Source.Camera;
        const pub = p.Raw.getTrackPublication(source);
        const track = pub?.track;
        if (!track || pub?.isMuted) {
            this.detachVideo();
            this.hasVideo = false;
            return;
        }
        if (this.attachedVideoSid !== track.sid) {
            this.detachVideo();
            track.attach(el);
            this.attachedVideoSid = track.sid ?? null;
        }
        this.hasVideo = true;
    }

    /** Attaches the participant's microphone track to the hidden audio element (skipped for the local user). */
    private syncAudio(): void {
        const p = this.participant;
        const el = this.audioRef?.nativeElement;
        if (!p || !el || p.IsLocal) {
            this.detachAudio();
            return;
        }
        const pub = p.Raw.getTrackPublication(Track.Source.Microphone);
        const track = pub?.track;
        if (!track) {
            this.detachAudio();
            return;
        }
        if (this.attachedAudioSid !== track.sid) {
            this.detachAudio();
            track.attach(el);
            this.attachedAudioSid = track.sid ?? null;
        }
    }

    /** Detaches and clears the currently attached video track from the video element. */
    private detachVideo(): void {
        const el = this.videoRef?.nativeElement;
        const p = this.participant;
        if (el && this.attachedVideoSid && p) {
            const screen = p.Raw.getTrackPublication(Track.Source.ScreenShare)?.track;
            const cam = p.Raw.getTrackPublication(Track.Source.Camera)?.track;
            screen?.detach(el);
            cam?.detach(el);
        }
        this.attachedVideoSid = null;
    }

    /** Detaches the currently attached audio track. */
    private detachAudio(): void {
        const el = this.audioRef?.nativeElement;
        const p = this.participant;
        if (el && this.attachedAudioSid && p) {
            p.Raw.getTrackPublication(Track.Source.Microphone)?.track?.detach(el);
        }
        this.attachedAudioSid = null;
    }
}
