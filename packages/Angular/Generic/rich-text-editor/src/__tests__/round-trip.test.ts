import { describe, it, expect, beforeEach } from 'vitest';
import { getHTML, setHTML } from '../lib/engine/html';
import { resetNodeCategoryCache } from '../lib/engine/node/category';
import { diffHtml, formatDifferences } from '../lib/engine/testing/semantic-diff';
import { ROUND_TRIP_FIXTURES, RoundTripFixture } from './fixtures/round-trip-fixtures';
import { RichTextEditorConfig } from '../lib/rich-text-editor.types';

/**
 * **The fidelity contract, executable.**
 *
 * This suite is the reason the package exists. A failure here is not a bug in a feature —
 * it means the editor has started rewriting content it was told not to touch, and the
 * architecture has regressed regardless of what else the change fixed.
 *
 * Three assertions per fixture, matching Acceptance A:
 *   1. load → serialize with zero edits is semantically identical to the input;
 *   2. a keystroke's worth of change stays local to the block it happened in;
 *   3. `SetHTML(GetHTML(x))` is a fixed point.
 */

/** Build an editor root attached to the document, as the real component would. */
function createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    document.body.appendChild(root);
    return root;
}

function configFor(fixture: RoundTripFixture): RichTextEditorConfig {
    return { SanitizeProfile: fixture.Profile };
}

function load(root: HTMLElement, fixture: RoundTripFixture, html?: string): void {
    setHTML(root, html ?? fixture.Html, { Config: configFor(fixture) });
}

/**
 * The permitted transformations, stated once.
 *
 * `AllowFillerLineBreaks` covers the blank-line guarantee; whitespace between blocks is
 * source indentation, not content. Nothing else is allowed — no tag rewriting, no attribute
 * dropping, no restructuring.
 */
const ALLOWANCES = { AllowFillerLineBreaks: true, IgnoreFormattingWhitespace: true } as const;

describe('round-trip fidelity', () => {
    beforeEach(() => {
        resetNodeCategoryCache();
        document.body.innerHTML = '';
    });

    describe.each(ROUND_TRIP_FIXTURES.map((fixture) => [fixture.Name, fixture] as const))(
        '%s',
        (_name, fixture) => {
            it(`survives load → serialize unchanged (${fixture.Rationale})`, () => {
                const root = createRoot();
                load(root, fixture);

                // A fixture only compares against something other than its own input when
                // it has explicitly recorded a known sanitizer limit.
                const expected = fixture.ExpectedHtml ?? fixture.Html;
                const result = diffHtml(expected, getHTML(root), ALLOWANCES);
                expect(result.Equal, `\n${formatDifferences(result)}\n`).toBe(true);
            });

            it('is a fixed point under reload', () => {
                const root = createRoot();
                load(root, fixture);
                const once = getHTML(root);

                load(root, fixture, once);
                const twice = getHTML(root);

                const result = diffHtml(once, twice, ALLOWANCES);
                expect(result.Equal, `\n${formatDifferences(result)}\n`).toBe(true);
            });

            it('keeps an edit local to the block it happened in', () => {
                const root = createRoot();
                load(root, fixture);
                const before = getHTML(root);

                // Simulate the smallest possible user edit: one character appended to the
                // first text node that holds real content.
                const edited = appendCharacterToFirstText(root);
                if (!edited) {
                    // A fixture with no editable text (pure structure) has nothing to test
                    // here; the other two assertions still cover it.
                    return;
                }

                const after = getHTML(root);
                expect(after).not.toBe(before);
                expect(countDifferingBlocks(before, after)).toBeLessThanOrEqual(1);
            });
        },
    );

    it('covers the fixture corpus', () => {
        // Guards against a fixture file that silently empties out.
        expect(ROUND_TRIP_FIXTURES.length).toBeGreaterThanOrEqual(10);
    });
});

/** Append one character to the first non-empty text node. Returns false if there is none. */
function appendCharacterToFirstText(root: Element): boolean {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (;;) {
        const node = walker.nextNode() as Text | null;
        if (!node) {
            return false;
        }
        if (node.data.trim().length > 0) {
            node.appendData('X');
            return true;
        }
    }
}

/**
 * Count how many top-level blocks differ between two serializations.
 *
 * The locality guarantee: one keystroke must not ripple. If a change to one paragraph
 * shows up as a change in three, some normalization pass is running that should not be.
 */
function countDifferingBlocks(before: string, after: string): number {
    const beforeBlocks = topLevelBlocks(before);
    const afterBlocks = topLevelBlocks(after);
    if (beforeBlocks.length !== afterBlocks.length) {
        return Number.MAX_SAFE_INTEGER;
    }
    let differing = 0;
    for (let index = 0; index < beforeBlocks.length; index += 1) {
        if (beforeBlocks[index] !== afterBlocks[index]) {
            differing += 1;
        }
    }
    return differing;
}

/** Serialize each top-level child separately. */
function topLevelBlocks(html: string): string[] {
    const host = document.createElement('div');
    host.innerHTML = html;
    return Array.from(host.childNodes).map((node) =>
        node.nodeType === Node.ELEMENT_NODE ? (node as Element).outerHTML : (node.nodeValue ?? ''),
    );
}
