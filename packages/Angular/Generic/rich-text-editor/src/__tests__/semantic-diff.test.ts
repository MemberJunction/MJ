import { describe, it, expect } from 'vitest';
import { diffHtml, formatDifferences, isSemanticallyEqual } from '../lib/engine/testing/semantic-diff';

/**
 * The measuring instrument needs its own calibration. A diff that is too lenient would let
 * real fidelity regressions through the round-trip suite unnoticed, which is worse than
 * having no suite at all.
 */
describe('semantic diff', () => {
    describe('tolerated serialization differences', () => {
        it('ignores attribute order', () => {
            expect(isSemanticallyEqual('<p id="a" class="b">x</p>', '<p class="b" id="a">x</p>')).toBe(true);
        });

        it('ignores style declaration order and spacing', () => {
            expect(isSemanticallyEqual('<p style="margin:0; color:red">x</p>', '<p style="color:red;margin:0">x</p>')).toBe(
                true,
            );
        });

        it('ignores class order', () => {
            expect(isSemanticallyEqual('<p class="a b">x</p>', '<p class="b a">x</p>')).toBe(true);
        });

        it('ignores entity spelling the parser resolves', () => {
            expect(isSemanticallyEqual('<p>&amp;</p>', '<p>&#38;</p>')).toBe(true);
        });

        it('collapses whitespace runs inside text', () => {
            expect(isSemanticallyEqual('<p>a  b</p>', '<p>a b</p>')).toBe(true);
        });
    });

    describe('differences it must catch', () => {
        it('catches a changed tag', () => {
            expect(isSemanticallyEqual('<strong>x</strong>', '<b>x</b>')).toBe(false);
        });

        it('catches a dropped attribute', () => {
            expect(isSemanticallyEqual('<p style="margin:0">x</p>', '<p>x</p>')).toBe(false);
        });

        it('catches a changed attribute value', () => {
            expect(isSemanticallyEqual('<p style="margin:0">x</p>', '<p style="margin:1px">x</p>')).toBe(false);
        });

        it('catches changed text', () => {
            expect(isSemanticallyEqual('<p>x</p>', '<p>y</p>')).toBe(false);
        });

        it('catches a dropped comment', () => {
            expect(isSemanticallyEqual('<p>x</p><!--c-->', '<p>x</p>')).toBe(false);
        });

        it('catches a dropped element', () => {
            expect(isSemanticallyEqual('<p>x</p><o:p></o:p>', '<p>x</p>')).toBe(false);
        });

        it('catches restructuring even when the text is identical', () => {
            expect(isSemanticallyEqual('<div>a</div><div>b</div>', '<div>a<br>b</div>')).toBe(false);
        });

        it('catches a dropped nesting level', () => {
            expect(isSemanticallyEqual('<ul><li>a<ul><li>b</li></ul></li></ul>', '<ul><li>a</li><li>b</li></ul>')).toBe(
                false,
            );
        });
    });

    describe('opt-in allowances', () => {
        it('accepts an added filler BR only when asked', () => {
            expect(isSemanticallyEqual('<div></div>', '<div><br></div>')).toBe(false);
            expect(isSemanticallyEqual('<div></div>', '<div><br></div>', { AllowFillerLineBreaks: true })).toBe(true);
        });

        it('does not let the filler allowance hide a real added element', () => {
            expect(isSemanticallyEqual('<div></div>', '<div><img src="x"></div>', { AllowFillerLineBreaks: true })).toBe(
                false,
            );
        });

        it('does not let the filler allowance hide changed siblings', () => {
            expect(isSemanticallyEqual('<div>a</div>', '<div>b<br></div>', { AllowFillerLineBreaks: true })).toBe(false);
        });

        it('ignores formatting whitespace only when asked', () => {
            const indented = '<div>a</div>\n  <div>b</div>';
            const compact = '<div>a</div><div>b</div>';
            expect(isSemanticallyEqual(indented, compact)).toBe(false);
            expect(isSemanticallyEqual(indented, compact, { IgnoreFormattingWhitespace: true })).toBe(true);
        });
    });

    describe('reporting', () => {
        it('names the path and kind of each difference', () => {
            const result = diffHtml('<div><b>x</b></div>', '<div><i>x</i></div>');
            expect(result.Equal).toBe(false);
            expect(result.Differences[0].Kind).toBe('tag');
            expect(result.Differences[0].Path).toContain('DIV');
        });

        it('formats a readable report', () => {
            const report = formatDifferences(diffHtml('<p>x</p>', '<p>y</p>'));
            expect(report).toContain('text');
            expect(report).toContain('"x"');
            expect(report).toContain('"y"');
        });

        it('says so plainly when there is no difference', () => {
            expect(formatDifferences(diffHtml('<p>x</p>', '<p>x</p>'))).toBe('no differences');
        });
    });
});
