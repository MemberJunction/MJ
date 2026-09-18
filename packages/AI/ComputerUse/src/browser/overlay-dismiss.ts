/**
 * Recognizing and clearing an overlay that is blocking a click.
 *
 * Playwright auto-waits for actionability, which is exactly the wrong behavior
 * here: a backdrop over an open popover/menu/dialog does not go away on its own,
 * so the wait can never succeed and the action burns its entire budget before
 * failing. A person presses Escape and clicks again.
 *
 * Both act paths need this — the element-grounded one (index → locator) and the
 * selector one (every replayed script) — so which overlays are dismissable and
 * how to dismiss them live here, once. The two paths differ in what they do when
 * the retry also fails (the grounded path falls through to a selector heal, the
 * selector path reports the failure), so they compose these parts rather than
 * sharing one control flow.
 *
 * App-agnostic: the pattern names widget-toolkit backdrop conventions
 * (CDK/Kendo/Material/Bootstrap), never an app's own markup.
 */

/** Backdrop class names that identify a dismissable overlay in Playwright's actionability log. */
const DISMISSABLE_OVERLAY_PATTERN = /(cdk-overlay-backdrop|k-overlay|k-animation-container|mat-mdc-dialog|modal-backdrop|mj-overlay-backdrop)/i;

/**
 * The slice of Playwright's `Page` this module needs. Narrowing it keeps the
 * helpers unit-testable without a browser; a real `Page` satisfies it structurally.
 */
export interface OverlayDismissablePage {
    keyboard: { press(key: string): Promise<void> };
}

/** Whether a failed action failed *because* a dismissable overlay covered the target. */
export function isBlockedByDismissableOverlay(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('intercepts pointer events') && DISMISSABLE_OVERLAY_PATTERN.test(message);
}

/** Clear the blocking overlay the way a person would. */
export async function dismissOverlay(page: OverlayDismissablePage): Promise<void> {
    await page.keyboard.press('Escape');
}

/**
 * The retry's own budget, once the overlay is gone.
 *
 * The first attempt has already consumed the caller's action timeout waiting for
 * an actionability check that a backdrop can never satisfy, so there is nothing
 * left to divide. A cleared overlay makes the click land immediately, so a short
 * fixed window is enough — and it caps the worst case at roughly one budget plus
 * this, rather than the two full budgets the retry used to cost.
 */
export const OVERLAY_RETRY_TIMEOUT_MS = 1500;

/**
 * Run `attempt`; if it failed only because a dismissable overlay was in the way,
 * clear the overlay and run it once more on a short budget. Any other error — and
 * a second failure — propagates, so a genuinely unreachable target still fails fast.
 *
 * `attempt` receives the timeout to use, so the retry is bounded rather than
 * repeating the caller's full action timeout.
 */
export async function retryPastDismissableOverlay<T>(
    page: OverlayDismissablePage,
    attempt: (timeoutMs: number) => Promise<T>,
    actionTimeoutMs: number
): Promise<T> {
    try {
        return await attempt(actionTimeoutMs);
    } catch (error) {
        if (!isBlockedByDismissableOverlay(error)) {
            throw error;
        }
        await dismissOverlay(page);
        return await attempt(OVERLAY_RETRY_TIMEOUT_MS);
    }
}
