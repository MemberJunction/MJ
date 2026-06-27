import { MediaPlaybackState } from '../media-player.types';

/**
 * The native HTMLMediaElement event names that drive the {@link MediaPlaybackState}
 * machine. We bind exactly these on the PRIMARY media element.
 */
export type MediaStateEvent =
  | 'loadstart'
  | 'loadedmetadata'
  | 'canplay'
  | 'canplaythrough'
  | 'waiting'
  | 'seeking'
  | 'seeked'
  | 'playing'
  | 'play'
  | 'pause'
  | 'ended'
  | 'error'
  | 'stalled'
  | 'suspend'
  | 'emptied';

/**
 * Context the reducer needs beyond the raw event + current state. These are read off the
 * media element at the moment the event fires (kept as plain inputs so the reducer stays
 * a pure, fully unit-testable function with no DOM dependency).
 */
export interface MediaStateContext {
  /** Whether the user intends playback (the element is not paused). Drives ready-vs-playing
   *  and whether conservative events (`stalled`/`suspend`) should show buffering. */
  IsPlaying: boolean;
  /** The element's `readyState` (HAVE_NOTHING=0 … HAVE_ENOUGH_DATA=4). Used by `seeked` to
   *  decide whether we can clear buffering immediately or must wait for `canplay`. */
  ReadyState: number;
  /** Whether the element has ended (mirrors `el.ended`). Suppresses benign buffering. */
  Ended: boolean;
}

/** `HTMLMediaElement.HAVE_FUTURE_DATA` — enough to advance at least one frame. */
const HAVE_FUTURE_DATA = 3;

/**
 * Pure transition function for the media playback state machine.
 *
 * Given the native media event, the current high-level state, and a small context read
 * off the element, returns the next {@link MediaPlaybackState}. This is the single source
 * of truth for the component's state — the component binds native events to this reducer
 * and reflects the result; it never invents transitions of its own.
 *
 * Design rules baked in here:
 * - `error` always wins (an errored element can still emit stray `suspend`/`stalled`).
 * - `seeking` → `buffering` so a ±30s skip / scrub into un-buffered territory shows the
 *   indicator during the seek; `seeked` clears it only when the element actually has data
 *   (else we stay `buffering` until `canplay`).
 * - `stalled` / `suspend` are CONSERVATIVE: they only buffer when the user is actively
 *   trying to play (not paused, not ended) — `suspend` fires benignly after a normal load,
 *   and we must not flash a spinner then.
 * - `playing` always clears loading/buffering (the element resumed on its own after a seek).
 *
 * @param event   the native media event that fired
 * @param current the current high-level playback state
 * @param ctx     element-derived context (play intent, readyState, ended)
 * @returns the next playback state
 */
export function nextPlaybackState(
  event: MediaStateEvent,
  current: MediaPlaybackState,
  ctx: MediaStateContext,
): MediaPlaybackState {
  // `error` is terminal until a new source resets via `emptied`.
  if (current === 'error' && event !== 'emptied' && event !== 'loadstart') {
    return 'error';
  }

  switch (event) {
    case 'error':
      return 'error';

    case 'emptied':
      // Track switch / source cleared — back to the start of the lifecycle.
      return 'loading';

    case 'loadstart':
      return 'loading';

    case 'loadedmetadata':
      // Metadata is in but we may not have playable data yet — stay in loading until
      // `canplay`. Don't regress out of a more-advanced state if it arrives late.
      return current === 'idle' || current === 'loading' ? 'loading' : current;

    case 'canplay':
    case 'canplaythrough':
      // Enough data buffered to play — clear loading/buffering.
      return ctx.IsPlaying ? 'playing' : 'ready';

    case 'waiting':
      // Ran out of buffered data mid-playback.
      return 'buffering';

    case 'seeking':
      // Seeking into (possibly) un-buffered territory — show the indicator during the seek.
      return 'buffering';

    case 'seeked':
      // Clear buffering only if the element now has playable data; else wait for `canplay`.
      if (ctx.ReadyState >= HAVE_FUTURE_DATA) {
        return ctx.IsPlaying ? 'playing' : 'ready';
      }
      return 'buffering';

    case 'playing':
      // Authoritative "we are now playing" — clears loading + buffering.
      return 'playing';

    case 'play':
      // Play was requested; if we're already past loading keep showing the right state,
      // otherwise the load/buffer indicator stays until data arrives.
      if (current === 'loading' || current === 'buffering') {
        return current;
      }
      return 'playing';

    case 'pause':
      // Don't override a terminal ended state with paused.
      return ctx.Ended ? 'ended' : 'paused';

    case 'ended':
      return 'ended';

    case 'stalled':
    case 'suspend':
      // Conservative: only treat as buffering when actively trying to play. `suspend`
      // fires benignly after a normal metadata load — must not flash a spinner then.
      if (ctx.IsPlaying && !ctx.Ended) {
        return 'buffering';
      }
      return current;

    default:
      return current;
  }
}
