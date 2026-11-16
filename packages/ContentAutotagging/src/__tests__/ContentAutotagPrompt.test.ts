import { describe, expect, it } from 'vitest';
import { NormalizeAutotagKeywords } from '../Engine/generic/ContentAutotagPrompt';

/** The one keyword parser the autotagger and the pipeline's Tag stage share. */
describe('NormalizeAutotagKeywords', () => {
    it('accepts both shapes the prompt has returned: bare strings and weighted objects', () => {
        expect(NormalizeAutotagKeywords(['alpha', { tag: 'beta', weight: 0.4, parentTag: 'Root', rationale: ' mentioned once ' }, { keyword: 'gamma' }])).toEqual([
            { Tag: 'alpha', Weight: 1, ParentTag: null, Reasoning: null },
            { Tag: 'beta', Weight: 0.4, ParentTag: 'Root', Reasoning: 'mentioned once' },
            { Tag: 'gamma', Weight: 0.5, ParentTag: null, Reasoning: null },
        ]);
    });

    it('clamps weights to 0-1 and drops entries with no tag text', () => {
        expect(NormalizeAutotagKeywords([{ tag: 'odd', weight: 4 }, { tag: 'neg', weight: -1 }, '  ', { weight: 0.9 }, null])).toEqual([
            { Tag: 'odd', Weight: 1, ParentTag: null, Reasoning: null },
            { Tag: 'neg', Weight: 0, ParentTag: null, Reasoning: null },
        ]);
    });

    it('returns nothing when keywords is not an array', () => {
        expect(NormalizeAutotagKeywords(undefined)).toEqual([]);
    });
});
