import { describe, it, expect } from 'vitest';
import {
    DEFAULT_TOOLBAR_ITEMS,
    RICH_TEXT_COMMAND_DESCRIPTORS,
    ariaKeyShortcuts,
    describeCommand,
    normalizeHref,
} from './toolbar-config';

describe('toolbar-config', () => {
    it('has a descriptor for every command the default toolbar uses', () => {
        for (const item of DEFAULT_TOOLBAR_ITEMS) {
            if (item !== 'separator') {
                expect(RICH_TEXT_COMMAND_DESCRIPTORS[item].Command).toBe(item);
            }
        }
    });

    it('spells shortcuts for the platform in tooltips', () => {
        const bold = RICH_TEXT_COMMAND_DESCRIPTORS.bold;
        expect(describeCommand(bold, false)).toBe('Bold (Ctrl+B)');
        expect(describeCommand(bold, true)).toBe('Bold (\u2318+B)');
        expect(describeCommand(RICH_TEXT_COMMAND_DESCRIPTORS.code, true)).toBe('Inline code');
    });

    it('spells aria-keyshortcuts with ARIA modifier names, or omits them', () => {
        expect(ariaKeyShortcuts(RICH_TEXT_COMMAND_DESCRIPTORS.redo, false)).toBe('Control+Shift+Z');
        expect(ariaKeyShortcuts(RICH_TEXT_COMMAND_DESCRIPTORS.redo, true)).toBe('Meta+Shift+Z');
        expect(ariaKeyShortcuts(RICH_TEXT_COMMAND_DESCRIPTORS.link, true)).toBeNull();
    });

    it('marks only actions as non-toggles', () => {
        const nonToggles = Object.values(RICH_TEXT_COMMAND_DESCRIPTORS)
            .filter((d) => !d.IsToggle)
            .map((d) => d.Command)
            .sort();
        expect(nonToggles).toEqual(['redo', 'removeFormat', 'undo']);
    });

    it('normalizes link input', () => {
        expect(normalizeHref('example.com')).toBe('https://example.com');
        expect(normalizeHref('me@example.com')).toBe('mailto:me@example.com');
        expect(normalizeHref('tel:+15551234')).toBe('tel:+15551234');
        expect(normalizeHref('')).toBe('');
    });
});
