/**
 * The DOM rasterizer, as its own download.
 *
 * `html-to-image` and the capture logic are only useful to a page that set `frame-capture`, so they live in a chunk
 * of their own: they never land in the shell, and a call that does not want frames never fetches them.
 * `lib/session/frame-capture-hook.ts` imports this module on demand.
 */
import { EnableChannelFrameCapture } from '@memberjunction/ng-realtime-channels';

/** Registers the default rasterizer; returns the function that removes it. */
export function EnableFrameCapture(): () => void {
  return EnableChannelFrameCapture();
}
