import { decreaseQuoteLevel, increaseQuoteLevel, makeList } from '../format/block';
import { getNearest } from '../node/utils';
import { getStartBlockOfRange } from '../range/block-range';
import { handleBackspace } from './backspace';
import { handleDelete } from './delete';
import { handleEnter } from './enter';
import { EditingHost } from './host';
import { detectMacPlatform, keyStringFor } from './keys';
import { handleSpace } from './space';
import { handleTab } from './tab';

/**
 * Routing keystrokes and `beforeinput` intents to handlers.
 *
 * Two entry points cover two kinds of input. `keydown` sees physical keys and shortcuts,
 * and is where structural keys (Enter, Backspace, Tab) are intercepted before the browser
 * acts. `beforeinput` sees *intents* — `insertParagraph`, `formatBold`, `historyUndo` — and
 * catches everything that arrives without a matching keydown: virtual keyboards, context
 * menus, the macOS Edit menu, and assistive technology.
 *
 * A keydown that is consumed never produces a `beforeinput`, so there is no double
 * handling on that path. The one overlap is a native deletion the keydown handler *chose*
 * to leave to the browser: the follow-up `beforeinput` must not schedule a second repair,
 * which is what `nativeDeletePending` tracks.
 *
 * Both tables are data, not branches: adding a key or an intent is one row.
 */

/** A keydown handler. Returns true when the event was consumed. */
export type KeyHandler = (host: EditingHost, event: KeyboardEvent, range: Range) => boolean;

/** A command run with the standard envelope (ballast sweep, undo checkpoint, reselect, notify). */
type BlockCommand = (host: EditingHost, range: Range) => void;

/** Keys handled the same on every platform. */
const STRUCTURAL_KEYS: Readonly<Record<string, KeyHandler>> = {
    Enter: (host, _event, range) => {
        handleEnter(host, range, false);
        return true;
    },
    'Shift-Enter': (host, _event, range) => {
        handleEnter(host, range, true);
        return true;
    },
    Backspace: (host, _event, range) => handleBackspace(host, range),
    Delete: (host, _event, range) => handleDelete(host, range),
    Tab: (host, _event, range) => handleTab(host, range, false),
    'Shift-Tab': (host, _event, range) => handleTab(host, range, true),
    Space: (host, _event, range) => handleSpace(host, range),
    // Arrowing across caret ballast would make the caret stop on an invisible character.
    ArrowLeft: (host) => {
        host.RemoveZeroWidthSpaces();
        return false;
    },
    ArrowRight: (host) => {
        host.RemoveZeroWidthSpaces();
        return false;
    },
};

/** Shortcuts, keyed without their primary modifier (Cmd on Apple platforms, Ctrl elsewhere). */
const SHORTCUTS: ReadonlyArray<readonly [key: string, handler: KeyHandler]> = [
    ['b', formatShortcut('B')],
    ['i', formatShortcut('I')],
    ['u', formatShortcut('U')],
    ['Shift-x', formatShortcut('S')],
    ['Shift-7', blockShortcut((host, range) => host.ModifyBlocks(makeList('OL', host.TagAttributes), range))],
    ['Shift-8', blockShortcut((host, range) => host.ModifyBlocks(makeList('UL', host.TagAttributes), range))],
    ['[', blockShortcut(outdent)],
    [']', blockShortcut(indent)],
    ['z', (host) => consume(() => host.Undo())],
    ['y', (host) => consume(() => host.Redo())],
    ['Shift-z', (host) => consume(() => host.Redo())],
];

/** Build the keydown table for the current platform. */
export function createKeyHandlers(isMac: boolean = detectMacPlatform()): Readonly<Record<string, KeyHandler>> {
    const mod = isMac ? 'Meta-' : 'Ctrl-';
    const handlers: Record<string, KeyHandler> = { ...STRUCTURAL_KEYS };
    for (const [key, handler] of SHORTCUTS) {
        handlers[`${mod}${key}`] = handler;
    }
    return handlers;
}

/** Dispatch a keydown. Returns true when the event was consumed (and default prevented). */
export function dispatchKeydown(
    host: EditingHost,
    event: KeyboardEvent,
    handlers: Readonly<Record<string, KeyHandler>>,
): boolean {
    if (event.defaultPrevented || event.isComposing) {
        return false;
    }
    const handler = handlers[keyStringFor(event)];
    if (!handler) {
        return false;
    }
    const range = host.GetSelection();
    const consumed = handler(host, event, range);
    if (consumed) {
        event.preventDefault();
    }
    return consumed;
}

/** A `beforeinput` intent handler. Returns true when the engine handled it. */
type IntentHandler = (host: EditingHost, nativeDeletePending: boolean) => boolean;

/**
 * Intents the engine handles. Anything absent — `insertText`, `insertCompositionText`,
 * `deleteWordBackward`, `insertFromPaste` (the paste event handles that) — stays native.
 */
const INTENTS: Readonly<Record<string, IntentHandler>> = {
    insertParagraph: (host) => consume(() => handleEnter(host, host.GetSelection(), false)),
    insertLineBreak: (host) => consume(() => handleEnter(host, host.GetSelection(), true)),
    // A deletion the keydown handler left to the browser must not be repaired twice.
    deleteContentBackward: (host, pending) => !pending && handleBackspace(host, host.GetSelection()),
    deleteContentForward: (host, pending) => !pending && handleDelete(host, host.GetSelection()),
    formatBold: (host) => consume(() => host.ToggleFormat({ Tag: 'B' })),
    formatItalic: (host) => consume(() => host.ToggleFormat({ Tag: 'I' })),
    formatUnderline: (host) => consume(() => host.ToggleFormat({ Tag: 'U' })),
    formatStrikeThrough: (host) => consume(() => host.ToggleFormat({ Tag: 'S' })),
    historyUndo: (host) => consume(() => host.Undo()),
    historyRedo: (host) => consume(() => host.Redo()),
    insertOrderedList: (host) => consume(() => runBlockCommand(host, (h, range) => h.ModifyBlocks(makeList('OL', h.TagAttributes), range))),
    insertUnorderedList: (host) => consume(() => runBlockCommand(host, (h, range) => h.ModifyBlocks(makeList('UL', h.TagAttributes), range))),
    formatIndent: (host) => consume(() => runBlockCommand(host, indent)),
    formatOutdent: (host) => consume(() => runBlockCommand(host, outdent)),
};

/**
 * Dispatch a `beforeinput`. Returns true when the intent was handled by the engine.
 *
 * `nativeDeletePending` is set by the caller when the preceding keydown left a deletion to
 * the browser; the matching `deleteContent*` intent is then passed through untouched.
 */
export function dispatchBeforeInput(host: EditingHost, event: InputEvent, nativeDeletePending: boolean): boolean {
    if (event.defaultPrevented) {
        return false;
    }
    const handler = INTENTS[event.inputType];
    if (!handler) {
        return false;
    }
    const handled = handler(host, nativeDeletePending);
    if (handled) {
        event.preventDefault();
    }
    return handled;
}

/** Run an action and report it as consumed. */
function consume(action: () => void): true {
    action();
    return true;
}

/** A shortcut that toggles an inline format. */
function formatShortcut(tag: string): KeyHandler {
    return (host) => consume(() => host.ToggleFormat({ Tag: tag }));
}

/** A shortcut that runs a block command with undo and selection handled. */
function blockShortcut(command: BlockCommand): KeyHandler {
    return (host) => consume(() => runBlockCommand(host, command));
}

function runBlockCommand(host: EditingHost, command: BlockCommand): void {
    const range = host.GetSelection();
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);
    command(host, range);
    host.SetSelection(range);
    host.DocumentChanged();
}

/** Indent: deeper list level inside a list, otherwise one more quote level. */
function indent(host: EditingHost, range: Range): void {
    if (isInList(host, range)) {
        host.ChangeListLevel(range, 1);
    } else {
        host.ModifyBlocks(increaseQuoteLevel(host.TagAttributes), range);
    }
}

/** Outdent: shallower list level inside a list, otherwise one less quote level. */
function outdent(host: EditingHost, range: Range): void {
    if (isInList(host, range)) {
        host.ChangeListLevel(range, -1);
    } else {
        host.ModifyBlocks(decreaseQuoteLevel(), range);
    }
}

function isInList(host: EditingHost, range: Range): boolean {
    const block = getStartBlockOfRange(range, host.Root);
    return !!block && (!!getNearest(block, host.Root, 'UL') || !!getNearest(block, host.Root, 'OL'));
}
