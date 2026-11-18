import { describe, it, expect } from 'vitest';
import { DecodeEntities } from '@/components/markdown/decode-entities';

describe('MarkdownView DecodeEntities', () => {
    it('decodes the entities marked emits', () => {
        expect(DecodeEntities('a &amp; b &lt;x&gt; &quot;q&quot; &#39;s&#x27;')).toBe('a & b <x> "q" \'s\'');
    });

    it('decodes each entity once, so &amp;lt; stays &lt;', () => {
        expect(DecodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    });
});
