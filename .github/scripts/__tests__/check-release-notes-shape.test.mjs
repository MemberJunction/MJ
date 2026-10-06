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

    // A heading with nothing under it is the failure this gate exists for, with the
    // heading left behind — and it is the MORE likely agent slip, not the less: the
    // heading is in the prompt, so emitting the scaffold then truncating produces exactly
    // this. Omitting the heading entirely is the case the prompt makes hardest.
    it('flags a TL;DR heading with no content under it', () => {
        const content = pad('# A release summary here\n\n## TL;DR\n\n## Bug Fixes\n- A fix.\n');
        expect(checkReleaseNotesShape(content).map((p) => p.code)).toContain('tldr-empty');
    });

    it('flags a TL;DR holding only whitespace', () => {
        const content = pad('# A release summary here\n\n## TL;DR\n   \n\t\n\n## Bug Fixes\n- A fix.\n');
        expect(checkReleaseNotesShape(content).map((p) => p.code)).toContain('tldr-empty');
    });

    it('does not flag a TL;DR that is the file\'s last section but has content', () => {
        const content = pad('# A release summary here\n\n## TL;DR\nReal summary prose.\n');
        expect(checkReleaseNotesShape(content).map((p) => p.code)).not.toContain('tldr-empty');
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
