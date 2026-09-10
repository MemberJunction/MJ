import { Page, expect } from '@playwright/test';
import * as path from 'path';
// Type-only: erased at compile time, so the node-side spec never loads browser code. The
// `window.MJRichText` / `window.engine` globals are declared in ../harness-entry.ts.
import type { RichTextEditorConfig } from '../../src/lib/rich-text-editor.types';
import type {} from '../harness-entry';

/**
 * Drive the engine in a real page. Every helper runs inside the browser, where the engine
 * lives; the test only sees HTML strings back, exactly as a host application would.
 */
export const HARNESS_URL = 'file://' + path.resolve(__dirname, '..', '.harness', 'index.html');

/** Load the page, create an engine over `#root`, and load `html` with the caret placed by `|`. */
export async function openEditor(page: Page, html: string, config: RichTextEditorConfig = {}): Promise<void> {
    await page.goto(HARNESS_URL);
    await page.evaluate(
        ({ html, config }) => {
            const root = document.getElementById('root') as HTMLElement;
            const engine = new window.MJRichText.RichTextEngine(root, config);
            window.engine = engine;
            // The caret marker rides through SetHTML as a private-use character inside the text,
            // which pins the position exactly (a character count would be ambiguous at the seam
            // between two text nodes). It is removed once the caret is placed.
            const MARK = '\uE000';
            engine.SetHTML(html.replace('|', () => MARK));
            engine.Focus();
            if (!html.includes('|')) {
                return;
            }
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node: Text | null = walker.nextNode() as Text | null;
            while (node) {
                const index = node.data.indexOf(MARK);
                if (index >= 0) {
                    node.deleteData(index, 1);
                    const range = document.createRange();
                    if (node.data === '') {
                        const parent = node.parentNode as Node;
                        const position = Array.prototype.indexOf.call(parent.childNodes, node);
                        parent.removeChild(node);
                        range.setStart(parent, position);
                    } else {
                        range.setStart(node, index);
                    }
                    range.collapse(true);
                    engine.SetSelection(range);
                    // SetHTML recorded the loaded document — marker included — as the first undo
                    // entry. Refresh that entry now that the marker is gone.
                    engine.SaveUndoState();
                    return;
                }
                node = walker.nextNode() as Text | null;
            }
        },
        { html, config },
    );
}

export async function html(page: Page): Promise<string> {
    return page.evaluate(() => window.engine.GetHTML());
}

/** HTML with `|` where the (collapsed) caret is, computed in the page. */
export async function htmlWithCaret(page: Page): Promise<string> {
    return page.evaluate(() => {
        const engine = window.engine;
        const range = engine.GetSelection();
        const clone = engine.Root.cloneNode(true) as HTMLElement;
        const pathTo = (node: Node): number[] => {
            const out: number[] = [];
            let current: Node = node;
            while (current !== engine.Root) {
                const parent = current.parentNode as Node;
                out.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
                current = parent;
            }
            return out;
        };
        let target: Node = clone;
        for (const index of pathTo(range.startContainer)) {
            target = target.childNodes[index];
        }
        if (target.nodeType === Node.TEXT_NODE) {
            (target as Text).insertData(range.startOffset, '|');
        } else {
            target.insertBefore(document.createTextNode('|'), target.childNodes[range.startOffset] ?? null);
        }
        return clone.innerHTML.replace(/\u200B/g, '');
    });
}

/** Dispatch a paste with the given clipboard payload, the way the browser would. */
export async function paste(page: Page, data: Record<string, string>): Promise<void> {
    await page.evaluate((data) => {
        const transfer = new DataTransfer();
        for (const [type, value] of Object.entries(data)) {
            transfer.setData(type, value);
        }
        const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
        window.engine.Root.dispatchEvent(event);
    }, data);
}

export { expect };
