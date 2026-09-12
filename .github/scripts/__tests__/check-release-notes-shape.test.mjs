import { describe, it, expect } from 'vitest';
import { checkReleaseNotesShape, SELF_TEST_FIXTURES, DEFAULT_MIN_BYTES } from '../check-release-notes-shape.mjs';

const pad = (s) => s + '\n<!-- '.padEnd(DEFAULT_MIN_BYTES, 'x') + ' -->\n';

describe('check-release-notes-shape', () => {
    it.each(SELF_TEST_FIXTURES)('%s → flagged: %s', (_name, shouldFlag, content) => {
        expect(checkReleaseNotesShape(pad(content)).length > 0).toBe(shouldFlag);
    });

    // The defect this script exists for: a heading-ORDER check passes this, because the
    // first `## ` is still the TL;DR. Only a preamble check catches it.
    it('names the preamble as the problem when a stray paragraph precedes the TL;DR', () => {
        const content = pad('# A release summary here\n\nThe seventh Edge build of the 6.1 line.\n\n## TL;DR\n- One.\n');
        const codes = checkReleaseNotesShape(content).map((p) => p.code);
        expect(codes).toContain('preamble');
        expect(codes).not.toContain('tldr-first');
    });

    it('does not flag the standing-context line that follows the TL;DR bullets', () => {
        const content = pad('# A release summary here\n\n## TL;DR\n- One.\n\nEdge builds are prereleases.\n\n## Bug Fixes\n- A fix.\n');
        expect(checkReleaseNotesShape(content)).toEqual([]);
    });

    it('reports a thin file even when its shape is correct', () => {
        const codes = checkReleaseNotesShape('# Short\n\n## TL;DR\n- One.\n').map((p) => p.code);
        expect(codes).toEqual(['too-thin']);
    });

    it('reports every problem at once rather than stopping at the first', () => {
        const codes = checkReleaseNotesShape('Not a heading.\n\n## New Features\n- x\n').map((p) => p.code);
        expect(codes).toEqual(expect.arrayContaining(['too-thin', 'h1', 'tldr-first']));
    });

    it('tolerates CRLF line endings', () => {
        const content = pad('# A release summary here\r\n\r\n## TL;DR\r\n- One.\r\n\r\n## Bug Fixes\r\n- A fix.\r\n');
        expect(checkReleaseNotesShape(content)).toEqual([]);
    });
});
