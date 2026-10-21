/**
 * @fileoverview PLAYBACK CLOCK: where the voice is, so a video player can show each frame when the voice reaches it and
 * the face moves with the voice.
 *
 * The voice is the master clock, as in the meeting bot: a driver that times both its PCM and its video frames on one media
 * timeline gives the player its PCM playback (`RealtimePcmPlayback`) as `VideoPlayoutOptions.Clock`. The chunk and image
 * decoders then show a frame when the clock reaches its `PresentationTimeMs`. MSE needs no clock: an MP4 that carries the
 * voice plays voice and face together on its own timestamps.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

/** Where the voice is: the clock a video player shows frames against, so the face moves with the voice. */
export interface IPlaybackClock {
    /**
     * The media time, in milliseconds on the stream's timeline, of the audio heard now; `null` while no timed audio plays
     * (nothing is queued, or the audio queued carries no media times).
     */
    readonly CurrentTimeMs: number | null;
}
