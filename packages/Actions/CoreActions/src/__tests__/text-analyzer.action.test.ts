import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/actions-base', () => ({}));

import { ExtractSentences } from '../custom/demo/text-analyzer.action';

describe('ExtractSentences', () => {
    it.each([
        ['One. Two! Three?', ['One.', 'Two!', 'Three?']],
        ['Wait... what?! Yes.', ['Wait...', 'what?!', 'Yes.']],
        ['Done. trailing words', ['Done.']],
        ['...leading dots. Next.', ['leading dots.', 'Next.']],
        ['no terminator at all', ['no terminator at all']],
        ['', ['']],
        ['line one.\nline two.', ['line one.', 'line two.']],
    ])('splits %j', (text, expected) => {
        expect(ExtractSentences(text)).toEqual(expected);
    });

    it('keeps a sentence that is only its terminator', () => {
        expect(ExtractSentences('  .  !')).toEqual(['.', '!']);
    });

    it('reads 100k spaces with no terminator in linear time', () => {
        const text = ' '.repeat(100_000);
        const started = Date.now();
        expect(ExtractSentences(text)).toEqual([text]);
        expect(Date.now() - started).toBeLessThan(2500);
    });
});
