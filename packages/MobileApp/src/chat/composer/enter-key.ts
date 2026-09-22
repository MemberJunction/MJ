import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * @fileoverview What the Return key does in the composer — the mobile counterpart to the web
 * composer's `onKeyDown` handler in `mention-editor.component.ts`.
 *
 * The web rule is three-way and we match it exactly: while the mention dropdown is open WITH
 * results Enter picks the highlighted suggestion; Shift+Enter inserts a newline; otherwise Enter
 * sends. Getting the precedence wrong is how a composer sends "@Sa" instead of completing the
 * mention the user was mid-way through.
 *
 * One thing native React Native genuinely cannot do, stated plainly rather than faked: its key
 * event carries NO modifier bits. `TextInputKeyPressEventData` is `{ key: string }` and nothing
 * else — see `react-native/Libraries/Components/TextInput/TextInput.d.ts`. So on iOS and Android a
 * hardware Shift+Return is indistinguishable from a plain Return. React-native-web DOES populate
 * `shiftKey`, so the resolver takes it as an optional input and honours it wherever the platform
 * supplies it, rather than branching on `Platform.OS` and being wrong on the next target.
 *
 * That limitation is also why the default policy is `hardware-keyboard` rather than `always`. On a
 * phone's on-screen keyboard there IS no Shift+Enter to escape to, so making Return send would
 * leave a user with no way at all to type a second line — which is why every mainstream phone chat
 * app leaves Return as newline and sends from the button. When a hardware keyboard is attached
 * (a simulator, an iPad, a tablet with a case keyboard) the desktop expectation is the right one
 * and Return sends.
 */

/** When Return should send rather than insert a newline. */
export type EnterPolicy =
    /** Return sends only while a hardware keyboard is attached (default — see the file header). */
    | 'hardware-keyboard'
    /** Return always sends. Hosts that ship their own newline affordance can opt in. */
    | 'always'
    /** Return always inserts a newline; sending is the button's job only. */
    | 'never';

/** What a Return press resolves to. */
export type EnterAction = 'send' | 'newline' | 'select-suggestion';

/** Everything the decision depends on. Pure input so the precedence is testable without a device. */
export type EnterContext = {
    /** The host's configured policy. */
    Policy: EnterPolicy;
    /**
     * Whether Shift was held, or `undefined` when the platform does not report modifiers (native
     * RN). `undefined` is deliberately NOT the same as `false`: it means "unknown", and the
     * resolver must not claim the user did not hold Shift when it simply cannot tell.
     */
    ShiftHeld: boolean | undefined;
    /** Whether a hardware keyboard appears to be attached (see {@link useHardwareKeyboard}). */
    HardwareKeyboard: boolean;
    /** Whether a mention/skill picker is open AND has at least one result to pick. */
    SuggestionsOpen: boolean;
    /** Whether the draft is actually sendable (non-empty, not mid-send). */
    CanSend: boolean;
};

/**
 * Resolves a Return press, in the web composer's precedence order.
 *
 * An open picker with results outranks everything — that press belongs to the picker, exactly as
 * it does on the web, where Enter is only allowed to fall through to the editor when the dropdown
 * is closed or empty. Shift (where reported) then wins over any send policy. Finally the policy
 * decides, and a Return that cannot send degrades to a newline rather than doing nothing at all.
 */
export function ResolveEnterAction(context: EnterContext): EnterAction {
    if (context.SuggestionsOpen) {
        return 'select-suggestion';
    }
    if (context.ShiftHeld === true) {
        return 'newline';
    }
    switch (context.Policy) {
        case 'never':
            return 'newline';
        case 'always':
            return context.CanSend ? 'send' : 'newline';
        case 'hardware-keyboard':
            return context.HardwareKeyboard && context.CanSend ? 'send' : 'newline';
    }
}

/**
 * Height below which a reported keyboard is an accessory bar rather than a real on-screen keyboard.
 *
 * iOS with a hardware keyboard attached still reports a `keyboardDidShow` for the ~55pt shortcut
 * bar; a genuine software keyboard is 216pt+ on the shortest device in the matrix. 120 sits well
 * clear of both.
 */
const SOFT_KEYBOARD_MIN_HEIGHT = 120;

/**
 * True while NO on-screen keyboard is up — the signal that the user is typing on hardware.
 *
 * There is no RN API that names a hardware keyboard, but the platforms tell us indirectly: they
 * only raise the software keyboard when there isn't a physical one. So "focused and no soft
 * keyboard showed" is the observable. The initial value is `true` because on a device with only a
 * soft keyboard there is no way to press Return before that keyboard has appeared — so the first
 * real press always has an answer by the time it matters.
 */
export function useHardwareKeyboard(): boolean {
    const [hardware, setHardware] = useState(true);

    useEffect(() => {
        // `keyboardDidShow` reports final geometry on both platforms; the `Will` variants are
        // iOS-only, so using `Did` keeps one code path.
        const shown = Keyboard.addListener('keyboardDidShow', (e) => {
            const height = e?.endCoordinates?.height ?? 0;
            setHardware(height < SOFT_KEYBOARD_MIN_HEIGHT);
        });
        const hidden = Keyboard.addListener('keyboardDidHide', () => {
            // Nothing is up, so nothing contradicts a hardware keyboard. The next show corrects it.
            setHardware(true);
        });
        return () => {
            shown.remove();
            hidden.remove();
        };
    }, []);

    // On web there is no on-screen keyboard to observe and `shiftKey` is reported anyway, so the
    // desktop rule applies unconditionally.
    return Platform.OS === 'web' ? true : hardware;
}

/**
 * Reads `shiftKey` off a key event when the platform supplies one.
 *
 * Native RN's `TextInputKeyPressEventData` is `{ key }`, so this returns `undefined` there and the
 * resolver treats the modifier as unknown. React-native-web forwards the DOM event's `shiftKey`.
 */
export function ShiftFromKeyEvent(nativeEvent: unknown): boolean | undefined {
    const shift = (nativeEvent as { shiftKey?: unknown } | null | undefined)?.shiftKey;
    return typeof shift === 'boolean' ? shift : undefined;
}
