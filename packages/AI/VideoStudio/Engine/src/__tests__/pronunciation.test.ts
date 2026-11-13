import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PRONUNCIATION_RULES,
    MapWordTimingsToDisplay,
    NormalizeNarrationText,
    ParsePronunciationNotes,
} from '../narration/pronunciation.js';

describe('ParsePronunciationNotes', () => {
    it('reads "written => spoken" rules from lines or ";" and keeps free-text notes aside', () => {
        const parsed = ParsePronunciationNotes(
            'MemberJunction => Member Junction\n# comment\nSQL -> sequel; Kubernetes → koo-ber-net-eez\nSay "Skip" with a short i.\n => nothing\n\n',
        );
        expect(parsed.Rules).toEqual([
            { Pattern: 'MemberJunction', Replacement: 'Member Junction' },
            { Pattern: 'SQL', Replacement: 'sequel' },
            { Pattern: 'Kubernetes', Replacement: 'koo-ber-net-eez' },
        ]);
        expect(parsed.IgnoredLines).toEqual(['# comment', 'Say "Skip" with a short i.', '=> nothing']);
        expect(ParsePronunciationNotes(undefined)).toEqual({ Rules: [], IgnoredLines: [] });
    });
});

describe('NormalizeNarrationText', () => {
    it('collapses upper-case dotted acronyms, keeping a sentence-final period', () => {
        expect(NormalizeNarrationText('Our A.I. tools serve the U.S.A., fast.').SpokenText).toBe('Our AI tools serve the USA, fast.');
        expect(NormalizeNarrationText('Built for A.I.').SpokenText).toBe('Built for AI.');
        expect(NormalizeNarrationText('Open at 9 a.m. daily.').SpokenText).toBe('Open at 9 a.m. daily.');
    });

    it('applies the built-in abbreviations', () => {
        expect(DEFAULT_PRONUNCIATION_RULES.length).toBeGreaterThan(0);
        expect(NormalizeNarrationText('Tools, e.g. search & chat, i.e. agents vs. scripts.').SpokenText).toBe(
            'Tools, for example search and chat, that is agents versus scripts.',
        );
    });

    it('applies brand rules case-insensitively, across words, with punctuation and possessives kept', () => {
        const rules = ParsePronunciationNotes('MemberJunction => Member Junction\nSkip AI => Skip A I\nA.I. => artificial intelligence').Rules;
        const out = NormalizeNarrationText('“memberjunction’s” agents, like Skip AI, use A.I.', rules);
        expect(out.SpokenText).toBe("“Member Junction's” agents, like Skip A I, use artificial intelligence.");
        expect(out.Changed).toBe(true);
    });

    it('reports alignment groups that cover every token', () => {
        const out = NormalizeNarrationText('Hello MemberJunction world', ParsePronunciationNotes('MemberJunction => Member Junction').Rules);
        expect(out.DisplayTokens).toEqual(['Hello', 'MemberJunction', 'world']);
        expect(out.SpokenTokens).toEqual(['Hello', 'Member', 'Junction', 'world']);
        expect(out.Groups).toEqual([
            { DisplayStart: 0, DisplayCount: 1, SpokenStart: 0, SpokenCount: 1 },
            { DisplayStart: 1, DisplayCount: 1, SpokenStart: 1, SpokenCount: 2 },
            { DisplayStart: 2, DisplayCount: 1, SpokenStart: 3, SpokenCount: 1 },
        ]);
    });

    it('leaves plain text unchanged', () => {
        const out = NormalizeNarrationText('  Own   your data. ');
        expect(out.SpokenText).toBe('Own your data.');
        expect(out.Changed).toBe(false);
    });
});

describe('MapWordTimingsToDisplay', () => {
    const t = (word: string, start: number, end: number) => ({ Word: word, StartSeconds: start, EndSeconds: end });

    it('merges spoken words back into one display word', () => {
        const normalized = NormalizeNarrationText('Hello MemberJunction world', ParsePronunciationNotes('MemberJunction => Member Junction').Rules);
        const mapped = MapWordTimingsToDisplay(normalized, [t('Hello', 0, 0.4), t('Member', 0.5, 0.9), t('Junction', 0.9, 1.4), t('world', 1.5, 1.9)]);
        expect(mapped).toEqual([t('Hello', 0, 0.4), t('MemberJunction', 0.5, 1.4), t('world', 1.5, 1.9)]);
    });

    it('splits one spoken span evenly across several display words', () => {
        const normalized = NormalizeNarrationText('Skip AI rocks', ParsePronunciationNotes('Skip AI => Skippy').Rules);
        const mapped = MapWordTimingsToDisplay(normalized, [t('Skippy', 0, 1), t('rocks', 1, 2)]);
        expect(mapped).toEqual([t('Skip', 0, 0.5), t('AI', 0.5, 1), t('rocks', 1, 2)]);
    });

    it('falls back to a proportional spread when the TTS word count differs, and returns [] without timings', () => {
        const normalized = NormalizeNarrationText('one two three four');
        const mapped = MapWordTimingsToDisplay(normalized, [t('one-two', 0, 1), t('three-four', 1, 2)]);
        expect(mapped).toEqual([t('one', 0, 1), t('two', 0, 1), t('three', 1, 2), t('four', 1, 2)]);
        expect(MapWordTimingsToDisplay(normalized, [])).toEqual([]);
    });
});
