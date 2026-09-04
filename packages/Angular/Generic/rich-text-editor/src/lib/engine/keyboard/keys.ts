/**
 * Keystroke naming.
 *
 * A key event is reduced to a string like `'Ctrl-Shift-z'` or `'Shift-Enter'`, and the
 * handler table is keyed by those strings. Modifiers are listed in a fixed order so there
 * is exactly one spelling per combination.
 */

/** Build the handler-table key for an event. */
export function keyStringFor(event: KeyboardEvent): string {
    let key = event.key;
    if (key === ' ') {
        key = 'Space';
    } else if (key.length === 1) {
        // Letters are matched case-insensitively — Shift is reported separately.
        key = key.toLowerCase();
    }
    let modifiers = '';
    if (event.altKey) {
        modifiers += 'Alt-';
    }
    if (event.ctrlKey) {
        modifiers += 'Ctrl-';
    }
    if (event.metaKey) {
        modifiers += 'Meta-';
    }
    if (event.shiftKey) {
        modifiers += 'Shift-';
    }
    return modifiers + key;
}

/**
 * Whether the host platform uses Cmd rather than Ctrl for editing shortcuts.
 * Guarded so the engine can be constructed where `navigator` is absent.
 */
export function detectMacPlatform(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }
    const platform = navigator.platform ?? '';
    const agent = navigator.userAgent ?? '';
    return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(agent);
}
