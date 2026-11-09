import { describe, it, expect } from 'vitest';
import { decodeEntities } from '@/components/markdown/decode-entities';

describe('MarkdownView decodeEntities', () => {
    it('decodes the entities marked emits', () => {
        expect(decodeEntities('a &amp; b &lt;x&gt; &quot;q&quot; &#39;s&#x27;')).toBe('a & b <x> "q" \'s\'');
    });

    it('decodes each entity once, so &amp;lt; stays &lt;', () => {
        expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    });
});
