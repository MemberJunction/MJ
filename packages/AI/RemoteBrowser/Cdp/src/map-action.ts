/**
 * Lossless translation from the universal **Base** remote-browser action / input vocabulary
 * (`@memberjunction/remote-browser-base`) into the **computer-use** action vocabulary
 * (`@memberjunction/computer-use`) that the enriched `PlaywrightBrowserAdapter` executes over CDP.
 *
 * This is the heart of the DRY kit: the enriched computer-use adapter already does all the real CDP
 * I/O (selector vs. coordinate clicks, selector-or-delta scrolls, wait-for-selector vs. fixed-sleep),
 * so each Base action maps one-to-one onto a computer-use action **without losing information**. The
 * two switches below are EXHAUSTIVE — the `never` default makes any future `Kind` a compile error
 * until it is handled here.
 *
 * @see `packages/AI/RemoteBrowser/Base/src/remote-browser-session.ts` for the Base vocabulary.
 * @see `packages/AI/ComputerUse/src/types/browser.ts` for the computer-use vocabulary.
 */

import {
    RemoteBrowserAction,
    RemoteBrowserHumanInput,
} from '@memberjunction/remote-browser-base';
import {
    BrowserAction,
    ClickAction,
    GoBackAction,
    GoForwardAction,
    KeypressAction,
    MouseMoveAction,
    NavigateAction,
    ScrollAction,
    TypeAction,
    WaitAction,
} from '@memberjunction/computer-use';

/**
 * Maps a single Base {@link RemoteBrowserAction} to the computer-use {@link BrowserAction} the adapter
 * executes. Exhaustive over `action.Kind`; lossless — every Base field that the enriched computer-use
 * action can carry (selector, coordinates, deltas, text, key, wait) is propagated.
 *
 * Field-level mapping notes:
 * - `click` → {@link ClickAction}: propagates `Selector` (preferred when present) AND `X`/`Y` so the
 *   adapter can use robust DOM targeting or fall back to a coordinate click — exactly the dual mode the
 *   enriched `ClickAction` supports.
 * - `type` → {@link TypeAction}: carries `Text` and the optional focus `Selector`.
 * - `key` → {@link KeypressAction}: carries the key/combination string.
 * - `scroll` → {@link ScrollAction}: carries `Selector` (scroll-into-view) AND `DeltaX`/`DeltaY`
 *   (delta scroll); the adapter prefers the selector when set.
 * - `navigate` → {@link NavigateAction}: carries the URL.
 * - `back`/`forward` → {@link GoBackAction}/{@link GoForwardAction}.
 * - `wait` → {@link WaitAction}: carries the optional `Selector` (wait-for-element) AND maps `Ms` →
 *   `DurationMs` (fixed sleep); the adapter prefers the selector when set.
 *
 * @param action The Base action to translate; narrow on `action.Kind`.
 * @returns The equivalent computer-use {@link BrowserAction}.
 */
export function mapRemoteBrowserAction(action: RemoteBrowserAction): BrowserAction {
    switch (action.Kind) {
        case 'navigate': {
            const mapped = new NavigateAction();
            mapped.Url = action.Url;
            return mapped;
        }
        case 'click': {
            const mapped = new ClickAction();
            // Propagate coordinates (defaulting to 0 keeps the adapter's coordinate path well-defined)
            // and the optional selector; the adapter prefers `Selector` when present.
            mapped.X = action.X ?? 0;
            mapped.Y = action.Y ?? 0;
            if (action.Selector !== undefined) {
                mapped.Selector = action.Selector;
            }
            return mapped;
        }
        case 'type': {
            const mapped = new TypeAction();
            mapped.Text = action.Text;
            if (action.Selector !== undefined) {
                mapped.Selector = action.Selector;
            }
            return mapped;
        }
        case 'key': {
            const mapped = new KeypressAction();
            mapped.Key = action.Key;
            return mapped;
        }
        case 'scroll': {
            const mapped = new ScrollAction();
            mapped.DeltaX = action.DeltaX ?? 0;
            mapped.DeltaY = action.DeltaY ?? 0;
            if (action.Selector !== undefined) {
                mapped.Selector = action.Selector;
            }
            return mapped;
        }
        case 'back':
            return new GoBackAction();
        case 'forward':
            return new GoForwardAction();
        case 'wait': {
            const mapped = new WaitAction();
            // Map `Ms` → `DurationMs` only when supplied so the adapter's own default duration applies
            // when neither `Ms` nor `Selector` is present.
            if (action.Ms !== undefined) {
                mapped.DurationMs = action.Ms;
            }
            if (action.Selector !== undefined) {
                mapped.Selector = action.Selector;
            }
            return mapped;
        }
        default:
            // Exhaustive: `action` is `never` here. Adding a new `RemoteBrowserAction` member without
            // handling it above is a compile error, which is exactly what keeps this mapping lossless.
            return assertNeverAction(action);
    }
}

/**
 * Maps a single Base {@link RemoteBrowserHumanInput} (a human-takeover pointer/key event) to the
 * computer-use {@link BrowserAction} the adapter executes. Exhaustive over `input.Kind`.
 *
 * - `pointer-move` → {@link MouseMoveAction} at `X`/`Y` (cursor move, no click).
 * - `pointer-click` → {@link ClickAction} at `X`/`Y`, carrying the chosen mouse `Button`.
 * - `key` → {@link KeypressAction} carrying the key/combination string.
 *
 * @param input The Base human-takeover input to translate; narrow on `input.Kind`.
 * @returns The equivalent computer-use {@link BrowserAction}.
 */
export function mapHumanInput(input: RemoteBrowserHumanInput): BrowserAction {
    switch (input.Kind) {
        case 'pointer-move': {
            const mapped = new MouseMoveAction();
            mapped.X = input.X;
            mapped.Y = input.Y;
            return mapped;
        }
        case 'pointer-click': {
            const mapped = new ClickAction();
            mapped.X = input.X;
            mapped.Y = input.Y;
            // `Button` defaults to 'left' on ClickAction; only override when the input pins one.
            if (input.Button !== undefined) {
                mapped.Button = input.Button;
            }
            return mapped;
        }
        case 'key': {
            const mapped = new KeypressAction();
            mapped.Key = input.Key;
            return mapped;
        }
        default:
            // Exhaustive: `input` is `never` here.
            return assertNeverHumanInput(input);
    }
}

/**
 * Compile-time exhaustiveness guard for {@link mapRemoteBrowserAction}. Receiving a value here means a
 * `RemoteBrowserAction` member was added without a matching `case`; the parameter type forces a build
 * error. At runtime (should it ever be reached) it throws with the offending value for diagnostics.
 *
 * @param action The unhandled action value (typed `never`).
 * @throws Always — an unhandled action kind is a programming error.
 */
function assertNeverAction(action: never): never {
    throw new Error(
        `mapRemoteBrowserAction: unhandled RemoteBrowserAction ${JSON.stringify(action)}`,
    );
}

/**
 * Compile-time exhaustiveness guard for {@link mapHumanInput}. See {@link assertNeverAction}.
 *
 * @param input The unhandled input value (typed `never`).
 * @throws Always — an unhandled input kind is a programming error.
 */
function assertNeverHumanInput(input: never): never {
    throw new Error(`mapHumanInput: unhandled RemoteBrowserHumanInput ${JSON.stringify(input)}`);
}
