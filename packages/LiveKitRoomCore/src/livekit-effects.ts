/**
 * @fileoverview Lazy adapters for the optional LiveKit Cloud media-processor SDKs — the Krisp noise
 * filter (`@livekit/krisp-noise-filter`) and camera background effects (`@livekit/track-processors`).
 *
 * These are loaded with dynamic `import()` deliberately (CLAUDE rule 8 exception #2/#3): they are optional,
 * heavy (WASM) cloud features, so deferring the load keeps them off the critical path and lets the room
 * degrade gracefully when a feature is unused. Both packages ARE declared in this package's dependencies.
 *
 * @module @memberjunction/livekit-room-core
 */

import type { LocalAudioTrack, LocalVideoTrack } from 'livekit-client';
import type { LiveKitBackgroundEffect } from './types';

/**
 * Applies (or removes) the Krisp noise filter on a local microphone track.
 *
 * @param track The local audio track to process.
 * @param enabled Whether to enable the filter.
 * @returns `true` if applied/removed successfully; `false` if unsupported or the SDK is unavailable.
 */
export async function applyNoiseFilter(track: LocalAudioTrack, enabled: boolean): Promise<boolean> {
    try {
        const mod = await import('@livekit/krisp-noise-filter');
        if (!enabled) {
            await track.stopProcessor();
            return true;
        }
        if (!mod.isKrispNoiseFilterSupported()) {
            return false;
        }
        await track.setProcessor(mod.KrispNoiseFilter());
        return true;
    } catch {
        return false;
    }
}

/**
 * Applies a background effect (blur / virtual background) to a local camera track, or clears it.
 *
 * @param track The local video track to process.
 * @param effect The effect to apply (`'none'` clears any active processor).
 * @returns `true` if applied/cleared successfully; `false` if the SDK is unavailable.
 */
export async function applyBackgroundEffect(track: LocalVideoTrack, effect: LiveKitBackgroundEffect): Promise<boolean> {
    try {
        const mod = await import('@livekit/track-processors');
        if (effect.Kind === 'none') {
            await track.stopProcessor();
            return true;
        }
        const processor =
            effect.Kind === 'blur'
                ? mod.BackgroundBlur(effect.Radius ?? 10)
                : mod.VirtualBackground(effect.ImageUrl);
        await track.setProcessor(processor);
        return true;
    } catch {
        return false;
    }
}
