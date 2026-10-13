import { describe, expect, it } from 'vitest';
import { ResolveEnterAction, ShiftFromKeyEvent, type EnterContext } from '@/chat/composer/enter-key';

/**
 * The Return key's precedence, which has to match the web composer's `onKeyDown`
 * (`mention-editor.component.ts`) exactly — a user who learns Enter on the desktop must not have
 * it mean something else here.
 */

/** A sendable draft, no picker open, hardware keyboard — the plain "Enter sends" case. */
const base: EnterContext = {
    Policy: 'hardware-keyboard',
    ShiftHeld: undefined,
    HardwareKeyboard: true,
    SuggestionsOpen: false,
    CanSend: true,
};

describe('ResolveEnterAction', () => {
    it('sends on a bare Return with a hardware keyboard', () => {
        expect(ResolveEnterAction(base)).toBe('send');
    });

    it('inserts a newline for Shift+Return', () => {
        expect(ResolveEnterAction({ ...base, ShiftHeld: true })).toBe('newline');
    });

    it('gives the press to an open picker that has results', () => {
        // The web only lets Enter reach the editor when the dropdown is closed or empty; an open
        // list with matches owns the key. Sending "@Sa" mid-mention is the bug this prevents.
        expect(ResolveEnterAction({ ...base, SuggestionsOpen: true })).toBe('select-suggestion');
    });

    it('lets an open-but-EMPTY picker fall through to sending', () => {
        // `SuggestionsOpen` means "open with results" for exactly this reason — matching the web,
        // where a button-opened menu showing nothing must not swallow the key.
        expect(ResolveEnterAction({ ...base, SuggestionsOpen: false })).toBe('send');
    });

    it('lets the picker outrank Shift, as the web does', () => {
        expect(ResolveEnterAction({ ...base, SuggestionsOpen: true, ShiftHeld: true })).toBe('select-suggestion');
    });

    it('keeps Return as a newline on a soft keyboard, where there is no Shift to escape to', () => {
        expect(ResolveEnterAction({ ...base, HardwareKeyboard: false })).toBe('newline');
    });

    it('honours the always policy even on a soft keyboard', () => {
        expect(ResolveEnterAction({ ...base, Policy: 'always', HardwareKeyboard: false })).toBe('send');
    });

    it('honours the never policy even on a hardware keyboard', () => {
        expect(ResolveEnterAction({ ...base, Policy: 'never' })).toBe('newline');
    });

    it('degrades an unsendable draft to a newline rather than doing nothing', () => {
        // An empty draft, or one whose turn is still in flight: the press must still do something
        // predictable in the field instead of being silently eaten.
        expect(ResolveEnterAction({ ...base, CanSend: false })).toBe('newline');
        expect(ResolveEnterAction({ ...base, Policy: 'always', CanSend: false })).toBe('newline');
    });

    it('treats an unknown Shift as unmodified rather than as held', () => {
        // Native RN reports no modifiers. Unknown must not be read as "Shift was down", or Return
        // would never send on the platforms that are the whole point of the feature.
        expect(ResolveEnterAction({ ...base, ShiftHeld: undefined })).toBe('send');
    });
});

describe('ShiftFromKeyEvent', () => {
    it('reads the modifier where the platform supplies one', () => {
        expect(ShiftFromKeyEvent({ key: 'Enter', shiftKey: true })).toBe(true);
        expect(ShiftFromKeyEvent({ key: 'Enter', shiftKey: false })).toBe(false);
    });

    it('reports unknown for a native key event, which carries only `key`', () => {
        // This is the real shape: `TextInputKeyPressEventData` is `{ key: string }`.
        expect(ShiftFromKeyEvent({ key: 'Enter' })).toBeUndefined();
        expect(ShiftFromKeyEvent(null)).toBeUndefined();
        expect(ShiftFromKeyEvent(undefined)).toBeUndefined();
    });
});
