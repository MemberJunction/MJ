import { RichTextCommand, RichTextToolbarItem } from '../rich-text-editor.types';

/**
 * What the toolbar knows about each command: how to draw it and how to describe it.
 *
 * Kept as data rather than template branches so a host can render its own toolbar from
 * the same table, and so the accessible names live in exactly one place.
 */
export interface RichTextCommandDescriptor {
    Command: RichTextCommand;
    /** Accessible name and tooltip text. */
    Label: string;
    /** Font Awesome class list. */
    Icon: string;
    /** Small text drawn beside the icon — the heading level. */
    Badge?: string;
    /** Keyboard shortcut, shown in the tooltip. `Mod` is Cmd on Apple platforms, Ctrl elsewhere. */
    Shortcut?: string;
    /** Whether the button reflects a pressed state for the current selection. */
    IsToggle: boolean;
}

/** The toolbar layout used when the host supplies none. */
export const DEFAULT_TOOLBAR_ITEMS: readonly RichTextToolbarItem[] = [
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'separator',
    'heading1',
    'heading2',
    'heading3',
    'separator',
    'bulletList',
    'orderedList',
    'blockquote',
    'separator',
    'link',
    'removeFormat',
    'separator',
    'undo',
    'redo',
];

/** Descriptor for every command the toolbar can surface. */
export const RICH_TEXT_COMMAND_DESCRIPTORS: Readonly<Record<RichTextCommand, RichTextCommandDescriptor>> = {
    bold: { Command: 'bold', Label: 'Bold', Icon: 'fa-solid fa-bold', Shortcut: 'Mod+B', IsToggle: true },
    italic: { Command: 'italic', Label: 'Italic', Icon: 'fa-solid fa-italic', Shortcut: 'Mod+I', IsToggle: true },
    underline: { Command: 'underline', Label: 'Underline', Icon: 'fa-solid fa-underline', Shortcut: 'Mod+U', IsToggle: true },
    strikethrough: {
        Command: 'strikethrough',
        Label: 'Strikethrough',
        Icon: 'fa-solid fa-strikethrough',
        Shortcut: 'Mod+Shift+X',
        IsToggle: true,
    },
    code: { Command: 'code', Label: 'Inline code', Icon: 'fa-solid fa-code', IsToggle: true },
    blockquote: { Command: 'blockquote', Label: 'Quote', Icon: 'fa-solid fa-quote-right', Shortcut: 'Mod+]', IsToggle: true },
    orderedList: {
        Command: 'orderedList',
        Label: 'Numbered list',
        Icon: 'fa-solid fa-list-ol',
        Shortcut: 'Mod+Shift+7',
        IsToggle: true,
    },
    bulletList: {
        Command: 'bulletList',
        Label: 'Bulleted list',
        Icon: 'fa-solid fa-list-ul',
        Shortcut: 'Mod+Shift+8',
        IsToggle: true,
    },
    heading1: { Command: 'heading1', Label: 'Heading 1', Icon: 'fa-solid fa-heading', Badge: '1', IsToggle: true },
    heading2: { Command: 'heading2', Label: 'Heading 2', Icon: 'fa-solid fa-heading', Badge: '2', IsToggle: true },
    heading3: { Command: 'heading3', Label: 'Heading 3', Icon: 'fa-solid fa-heading', Badge: '3', IsToggle: true },
    link: { Command: 'link', Label: 'Link', Icon: 'fa-solid fa-link', IsToggle: true },
    removeFormat: { Command: 'removeFormat', Label: 'Clear formatting', Icon: 'fa-solid fa-eraser', IsToggle: false },
    undo: { Command: 'undo', Label: 'Undo', Icon: 'fa-solid fa-rotate-left', Shortcut: 'Mod+Z', IsToggle: false },
    redo: { Command: 'redo', Label: 'Redo', Icon: 'fa-solid fa-rotate-right', Shortcut: 'Mod+Shift+Z', IsToggle: false },
};

/** Tooltip text: the label, plus the shortcut spelled for this platform. */
export function describeCommand(descriptor: RichTextCommandDescriptor, isMac: boolean): string {
    if (!descriptor.Shortcut) {
        return descriptor.Label;
    }
    const shortcut = descriptor.Shortcut.replace('Mod', () => (isMac ? '⌘' : 'Ctrl'));
    return `${descriptor.Label} (${shortcut})`;
}

/** `aria-keyshortcuts` value: modifier names per the ARIA spec, or null when there is none. */
export function ariaKeyShortcuts(descriptor: RichTextCommandDescriptor, isMac: boolean): string | null {
    if (!descriptor.Shortcut) {
        return null;
    }
    return descriptor.Shortcut.replace('Mod', () => (isMac ? 'Meta' : 'Control'));
}

/**
 * Turn what a user typed into a link field into an `href`.
 *
 * A bare host gets `https://`, a bare address gets `mailto:`; anything already carrying a
 * scheme, or that is relative (`/`, `#`), is kept. Returns `''` for blank input so the
 * caller can treat it as "remove".
 */
export function normalizeHref(input: string): string {
    const value = input.trim();
    if (value === '') {
        return '';
    }
    if (/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(value)) {
        return value;
    }
    if (/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value)) {
        return `mailto:${value}`;
    }
    return `https://${value}`;
}
