import { test } from '@playwright/test';
import { expect, html, htmlWithCaret, openEditor, paste } from './harness';

/** The editing modifier the engine expects on this platform: Cmd on macOS, Ctrl elsewhere. */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * The native paths. Each of these is something jsdom cannot do: the browser types, deletes,
 * and moves the caret itself, and the engine has to keep its invariants around that.
 */
test.describe('native typing', () => {
    test('typed text lands in the document and is reported by GetHTML', async ({ page }) => {
        await openEditor(page, '<div>hello|</div>');
        await page.keyboard.type(' world');
        expect(await html(page)).toBe('<div>hello world</div>');
    });

    test('a pending bold at the caret formats the next typed characters', async ({ page }) => {
        await openEditor(page, '<div>ab|</div>');
        await page.keyboard.press(`${MOD}+b`);
        await page.keyboard.type('cd');
        expect(await html(page)).toBe('<div>ab<b>cd</b></div>');
        await page.keyboard.press(`${MOD}+b`);
        await page.keyboard.type('e');
        expect(await html(page)).toBe('<div>ab<b>cd</b>e</div>');
    });

    test('Enter splits the block and typing continues in the new one', async ({ page }) => {
        await openEditor(page, '<div>ab|cd</div>');
        await page.keyboard.press('Enter');
        expect(await htmlWithCaret(page)).toBe('<div>ab</div><div>|cd</div>');
        await page.keyboard.type('X');
        expect(await html(page)).toBe('<div>ab</div><div>Xcd</div>');
    });

    test('Shift+Enter inserts a line break the caret can type after', async ({ page }) => {
        await openEditor(page, '<div>ab|</div>');
        await page.keyboard.press('Shift+Enter');
        await page.keyboard.type('X');
        // Chromium removes the now-redundant trailing <br> as it types; either shape renders the same.
        expect(await html(page)).toMatch(/^<div>ab<br>X(<br>)?<\/div>$/);
    });
});

test.describe('native deletion and the repair pass', () => {
    test('Backspace mid-text is native and leaves no hollow inline behind', async ({ page }) => {
        await openEditor(page, '<div>a<b>b|</b>c</div>');
        await page.keyboard.press('Backspace');
        // The repair runs on a timer after the browser's own deletion.
        await expect.poll(() => html(page)).toBe('<div>ac</div>');
    });

    test('Backspace at a block start merges with the previous block', async ({ page }) => {
        await openEditor(page, '<div>ab</div><div>|cd</div>');
        await page.keyboard.press('Backspace');
        expect(await htmlWithCaret(page)).toBe('<div>ab|cd</div>');
    });

    test('Backspace into an autolinked address removes the link', async ({ page }) => {
        await openEditor(page, '<div><a href="https://a.bc">https://a.bc|</a></div>');
        await page.keyboard.press('Backspace');
        expect(await html(page)).toBe('<div>https://a.b</div>');
    });

    test('Delete removes one grapheme, including a whole emoji', async ({ page }) => {
        await openEditor(page, '<div>a|😀b</div>');
        await page.keyboard.press('Delete');
        expect(await html(page)).toBe('<div>ab</div>');
    });

    test('deleting a selection across blocks joins them', async ({ page }) => {
        await openEditor(page, '<div>ab</div><div>cd</div>');
        await page.evaluate(() => {
            const root = window.engine.Root;
            const first = root.firstElementChild as Element;
            const last = root.lastElementChild as Element;
            const range = document.createRange();
            range.setStart(first.firstChild as Text, 1);
            range.setEnd(last.firstChild as Text, 1);
            window.engine.SetSelection(range);
        });
        await page.keyboard.press('Backspace');
        expect(await htmlWithCaret(page)).toBe('<div>a|d</div>');
    });
});

test.describe('space and links', () => {
    test('typing a space after a URL links it, and the space lands outside the link', async ({ page }) => {
        await openEditor(page, '<div>see https://example.com|</div>');
        await page.keyboard.type(' now');
        expect(await html(page)).toBe('<div>see <a href="https://example.com">https://example.com</a> now</div>');
    });
});

test.describe('clipboard', () => {
    test('pasted HTML is sanitized and merged into the caret block', async ({ page }) => {
        await openEditor(page, '<div>hel|lo</div>');
        await paste(page, { 'text/html': '<p onclick="x()">X<script>1</script></p><p>Y</p>' });
        expect(await html(page)).toBe('<div>helX</div><p>Ylo</p>');
    });

    test('plain text pastes as blocks with links', async ({ page }) => {
        await openEditor(page, '<div>a|</div>');
        await paste(page, { 'text/plain': 'x\nsee https://q.r' });
        expect(await html(page)).toBe('<div>ax</div><div>see <a href="https://q.r">https://q.r</a></div>');
    });

    test('Ctrl+Shift+V pastes as plain text', async ({ page }) => {
        await openEditor(page, '<div>|</div>');
        await page.keyboard.press(`${MOD}+Shift+v`);
        await paste(page, { 'text/html': '<b>x</b>', 'text/plain': 'x' });
        expect(await html(page)).toBe('<div>x</div>');
    });

    test('copy writes HTML with context and plain text', async ({ page }) => {
        await openEditor(page, '<div>a<b>bc</b>d</div>');
        const written = await page.evaluate(() => {
            const root = window.engine.Root;
            const range = document.createRange();
            range.selectNodeContents(root.querySelector('b') as Element);
            window.engine.SetSelection(range);
            const transfer = new DataTransfer();
            root.dispatchEvent(new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true }));
            return { html: transfer.getData('text/html'), text: transfer.getData('text/plain') };
        });
        expect(written).toEqual({ html: '<b>bc</b>', text: 'bc' });
    });
});

test.describe('undo', () => {
    test('typing, a command, and more typing undo as three steps', async ({ page }) => {
        await openEditor(page, '<div>a|</div>');
        await page.keyboard.type('b');
        await page.keyboard.press(`${MOD}+b`);
        await page.keyboard.type('c');
        expect(await html(page)).toBe('<div>ab<b>c</b></div>');
        await page.keyboard.press(`${MOD}+z`);
        expect(await html(page)).toBe('<div>ab<b></b></div>');
        await page.keyboard.press(`${MOD}+z`);
        expect(await html(page)).toBe('<div>ab</div>');
        await page.keyboard.press(`${MOD}+z`);
        expect(await html(page)).toBe('<div>a</div>');
    });
});
