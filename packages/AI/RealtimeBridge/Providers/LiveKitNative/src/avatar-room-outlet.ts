/**
 * @fileoverview The room side of an agent's avatar over `@livekit/rtc-node`: a `VideoSource` sized to the avatar, a camera
 * track named `REALTIME_AGENT_AVATAR_TRACK_NAME` (`@memberjunction/ai`, which the room reads too) published with
 * LiveKit's default simulcast layers (the full portrait), frames captured as I420, and the bot's own participant
 * attributes.
 *
 * The camera track and the voice's microphone track name no `stream`, so LiveKit bundles them into one stream by their
 * sources, which browsers can lip-sync as one group (VERIFY with a live run).
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { REALTIME_AGENT_AVATAR_TRACK_NAME } from '@memberjunction/ai';
import { LogError } from '@memberjunction/core';
import type { AvatarVideoFrame } from './avatar-h264-decoder';
import type { AvatarVideoOutlet } from './avatar-publisher';
import type { RtcLocalParticipant, RtcLocalVideoTrack, RtcNodeModule, RtcVideoSource } from './livekit-rtc-node-room';

/** Publishes and feeds the avatar's camera track on one room's local participant. */
export class RtcNodeAvatarOutlet implements AvatarVideoOutlet {
    private source: RtcVideoSource | null = null;
    /** Retained while published: it owns the native handle binding the source to the room (as the voice track does). */
    private track: RtcLocalVideoTrack | null = null;
    private trackSid: string | null = null;
    private reportedCaptureError = false;

    /**
     * @param rtc The loaded `@livekit/rtc-node` module.
     * @param participant The room's local participant (the bot).
     */
    constructor(
        private readonly rtc: RtcNodeModule,
        private readonly participant: RtcLocalParticipant
    ) {}

    /** Whether this module can publish video at all (`VideoSource`, `VideoFrame`, `LocalVideoTrack`). */
    public static CanPublishVideo(rtc: RtcNodeModule): boolean {
        return typeof rtc.VideoSource === 'function' && typeof rtc.VideoFrame === 'function' && typeof rtc.LocalVideoTrack?.createVideoTrack === 'function';
    }

    /** @inheritdoc */
    public async Publish(width: number, height: number): Promise<void> {
        const { VideoSource, LocalVideoTrack } = this.rtc;
        if (!VideoSource || !LocalVideoTrack || !RtcNodeAvatarOutlet.CanPublishVideo(this.rtc)) {
            throw new Error('@livekit/rtc-node has no video publishing (VideoSource, VideoFrame, LocalVideoTrack)');
        }
        const source = new VideoSource(width, height);
        const track = LocalVideoTrack.createVideoTrack(REALTIME_AGENT_AVATAR_TRACK_NAME, source);
        // A camera, with LiveKit's default simulcast layers; codec and bitrates are LiveKit's defaults for the size.
        const options = new this.rtc.TrackPublishOptions({ source: this.rtc.TrackSource.SOURCE_CAMERA, simulcast: true });
        const publication = await this.participant.publishTrack(track, options);
        this.source = source;
        this.track = track;
        this.trackSid = publication?.sid ?? null;
    }

    /**
     * @inheritdoc
     *
     * `frame.Data` must start at the beginning of its buffer: rtc-node hands the buffer's address to the native side.
     */
    public Capture(frame: AvatarVideoFrame): void {
        const VideoFrame = this.rtc.VideoFrame;
        if (!this.source || !VideoFrame) {
            return;
        }
        try {
            this.source.captureFrame(new VideoFrame(frame.Data, frame.Width, frame.Height, this.rtc.VideoBufferType.I420));
        } catch (err) {
            if (!this.reportedCaptureError) {
                this.reportedCaptureError = true;
                LogError(`[RtcNodeAvatarOutlet] capturing an avatar frame failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /** @inheritdoc */
    public async Unpublish(): Promise<void> {
        const sid = this.trackSid;
        const track = this.track;
        this.source = null;
        this.track = null;
        this.trackSid = null;
        if (sid) {
            await this.participant.unpublishTrack?.(sid);
        }
        await track?.close?.();
    }

    /** @inheritdoc */
    public async SetAttributes(attributes: Record<string, string>): Promise<void> {
        if (!this.participant.setAttributes) {
            throw new Error('@livekit/rtc-node cannot set the local participant\'s attributes');
        }
        await this.participant.setAttributes(attributes);
    }
}
