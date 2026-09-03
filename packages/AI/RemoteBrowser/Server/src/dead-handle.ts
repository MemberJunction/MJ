/**
 * "Is this error the browser being GONE, or the browser giving me a bad answer?" (#3598)
 *
 * The engine's live map keeps a handle after the browser behind it has vanished — an external Chrome
 * closed, a backend container recycled, a CDP target lost. Every later call against that handle
 * throws, forever, because nothing discards the mapping. Healing means relaunching; the whole
 * question is WHEN, and getting it wrong in either direction is expensive:
 *
 *   - too narrow ⇒ the original bug survives for whichever phrasing was missed;
 *   - too wide ⇒ a bad selector or a page that refused to load costs a perfectly healthy browser
 *     its entire state — cookies, logged-in session, scroll position — and the user watches their
 *     page reset because a click missed.
 *
 * So this predicate is deliberately a CLOSED list of "the transport or the browser is gone", and
 * everything it does not recognise is treated as a real answer from a live browser. A missed
 * phrasing degrades to today's behaviour (an error the caller reports), never to a surprise
 * relaunch. That asymmetry is the design: recovery is the exceptional path, not the default one.
 */

/**
 * Phrases that mean the browser or its CDP transport is gone. Matched case-insensitively against
 * the error's message. Sourced from what Playwright, `chrome-remote-interface` and MJ's own
 * `PlaywrightBrowserAdapter` actually emit in this state.
 */
const DEAD_HANDLE_PHRASES = [
    'browser not launched',          // MJ's own PlaywrightBrowserAdapter guard — the 232-error case
    'browser has been closed',
    'browser has disconnected',
    'browser closed',
    'target closed',
    'target crashed',
    'page has been closed',
    'page closed',
    'session closed',
    'websocket is not open',
    'websocket connection closed',
    'connection closed',
    'econnrefused',
    'econnreset',
] as const;

/**
 * Page-level network failures. These arrive as `net::ERR_*` and are a live browser reporting that a
 * SITE would not load — the browser itself is fine and must not be relaunched.
 *
 * **This is forward protection, and it is deliberate rather than redundant.** No phrase in the list
 * above matches a `net::` message today, because Chrome spells these with underscores
 * (`net::ERR_CONNECTION_CLOSED`) while the phrases use spaces. That near-miss is exactly the problem:
 * the list is meant to grow, the next phrase someone adds is plausibly `connection refused` or
 * `err_connection`, and the failure that edit introduces is silent and destructive — a user's
 * logged-in browser torn down because they navigated to a site that was down. Checking `net::` first
 * makes "a page failed to load" unreachable from the dead-handle branch no matter how the list
 * evolves, so the cheap guard buys a permanent guarantee instead of a temporary one.
 */
const PAGE_LEVEL_MARKER = 'net::';

/** Pulls a comparable message out of whatever was thrown, without assuming it was an `Error`. */
function messageOf(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (typeof error === 'object' && error !== null) {
        const maybe = (error as { message?: unknown }).message;
        if (typeof maybe === 'string') {
            return maybe;
        }
    }
    return '';
}

/**
 * Whether `error` means the handle is dead and the mapping should be discarded.
 *
 * Explicitly FALSE for the things that look adjacent but are real answers from a working browser:
 * timeouts, "waiting for selector", "no element matching", and every `net::ERR_*` navigation
 * failure. A caller that gets `false` reports the error exactly as it does today.
 */
export function IsDeadBrowserHandleError(error: unknown): boolean {
    const message = messageOf(error).toLowerCase();
    if (message.length === 0 || message.includes(PAGE_LEVEL_MARKER)) {
        return false;
    }
    return DEAD_HANDLE_PHRASES.some((phrase) => message.includes(phrase));
}
