/**
 * @fileoverview The `@memberjunction/ai-realtime-client/media` entry point: the browser media code that
 * no provider driver sits behind (frame capture and sampling, display capture, the local camera and
 * microphone controller, the video source arbiter, frame pacing, the channel video bridge, the audio meter).
 *
 * A consumer that only needs media, such as the LiveKit room, imports this entry and bundles no driver
 * and no `@google/genai`. Everything reachable from here may import only other `/media` modules,
 * `audio/audioMeter`, `@memberjunction/ai`, `@memberjunction/global` and `rxjs`; `media-entry-boundary.test.ts`
 * fails the build otherwise. The main entry exports all of this too.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

export * from './attachVideoSource';
export * from './frameCapture';
export * from './frameSampler';
export * from './localMediaController';
export * from './mediaStage';
export * from './model';
export * from './channelVideoSource';
export * from './displayCapture';
export * from './videoPacing';
export * from './videoPlayout';
export * from './videoSourceArbiter';
export * from '../audio/audioMeter';
