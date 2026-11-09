/**
 * @fileoverview ATTACH VIDEO SOURCE: shows any {@link MediaVideoSource} in a `<video>` element and hands back
 * a function that takes it out again. UI code calls this instead of a vendor's `track.attach(element)`, so a
 * tile renders a camera, a shared screen, a meeting participant or an avatar the same way.
 *
 * - A **stream** source (a camera, a shared screen, a WebRTC track) plays muted and inline. A video surface
 *   never plays audio: the realtime client or the meeting room plays each voice exactly once.
 * - An **element** source (a player that must own the element, such as MSE playout of an avatar's MP4) is
 *   handed the element and decides everything, including its audio: an avatar's voice is in its video.
 *
 * Detaching never stops the source's tracks; whoever opened them stops them.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import type { MediaVideoSource } from './model';

/**
 * Shows a video source in a `<video>` element.
 *
 * @returns A function that takes the source out of the element. Calling it twice does nothing, and it leaves
 *   the element alone if another source has been attached to it since.
 */
export function AttachVideoSource(source: MediaVideoSource, element: HTMLVideoElement): () => void {
    if (source.Kind === 'element') {
        return once(source.Attach(element));
    }
    element.muted = true;
    element.playsInline = true;
    element.autoplay = true;
    element.srcObject = source.Stream;
    void element.play().catch(() => {
        // Muted inline video may play; if the browser still waits (a hidden element), autoplay starts it later.
    });
    return once(() => {
        if (element.srcObject === source.Stream) {
            element.pause();
            element.srcObject = null;
        }
    });
}

/** Wraps a function so that only its first call does anything. */
function once(action: () => void): () => void {
    let done = false;
    return () => {
        if (!done) {
            done = true;
            action();
        }
    };
}
