import { describe, it, expect } from 'vitest';
import '../index';
import { BaseContentCleaner } from '../generic/BaseContentCleaner';
import { HtmlContentCleaner } from '../generic/HtmlContentCleaner';
import { PlainTextContentCleaner } from '../generic/PlainTextContentCleaner';
import { ResolveContentCleaner, SuggestCleanerKey } from '../generic/SegmentationResolver';

const html = new HtmlContentCleaner();
const plain = new PlainTextContentCleaner();

const PAGE = `
<html><head><title>T</title><style>.a{color:red}</style><script>var x=1;</script></head>
<body>
  <nav>Home About Contact</nav>
  <header>Site Header</header>
  <div class="ad">Buy now cheap deals</div>
  <main class="article-body">
    <h1>Annual Report</h1>
    <p>Membership grew this year.</p>
    <p>Revenue followed suit.</p>
  </main>
  <aside>Related links</aside>
  <footer>Copyright</footer>
</body></html>`;

describe('HtmlContentCleaner', () => {
    it('registers under its key', () => {
        expect(html.Key).toBe('Html');
        expect(BaseContentCleaner.Resolve('Html')?.Key).toBe('Html');
    });

    it('removes scripts, styles, and chrome by default', () => {
        const result = html.Clean({ Content: PAGE, MimeType: 'text/html' });
        expect(result.Success).toBe(true);
        expect(result.Content).toContain('Membership grew');
        expect(result.Content).not.toContain('var x=1');
        expect(result.Content).not.toContain('color:red');
        expect(result.Content).not.toContain('Home About Contact');
        expect(result.Content).not.toContain('Site Header');
        expect(result.Content).not.toContain('Related links');
        expect(result.Content).not.toContain('Copyright');
    });

    it('keeps only the included selector when one is supplied', () => {
        const result = html.Clean({
            Content: PAGE,
            MimeType: 'text/html',
            Options: { IncludeSelectors: ['.article-body'] },
        });
        expect(result.Content).toContain('Annual Report');
        expect(result.Content).toContain('Revenue followed suit');
        // The ad block lives outside .article-body, so scoping alone removes it.
        expect(result.Content).not.toContain('Buy now cheap deals');
    });

    it('applies exclude selectors for blocks that survive the include', () => {
        const result = html.Clean({
            Content: PAGE,
            MimeType: 'text/html',
            Options: { ExcludeSelectors: ['.ad'] },
        });
        expect(result.Content).not.toContain('Buy now cheap deals');
        expect(result.Content).toContain('Membership grew');
    });

    it('falls back to the next include selector when the first does not match', () => {
        const result = html.Clean({
            Content: PAGE,
            MimeType: 'text/html',
            Options: { IncludeSelectors: ['.does-not-exist', '.article-body'] },
        });
        expect(result.Content).toContain('Annual Report');
    });

    it('preserves paragraph breaks so segmenters can find boundaries', () => {
        const result = html.Clean({ Content: PAGE, MimeType: 'text/html' });
        expect(result.Content).toMatch(/Membership grew this year\.\s*\n\s*\n?\s*Revenue followed suit\./);
    });

    it('ignores an invalid selector rather than failing the clean', () => {
        const result = html.Clean({
            Content: PAGE,
            MimeType: 'text/html',
            Options: { ExcludeSelectors: ['>>>bad<<<'] },
        });
        expect(result.Success).toBe(true);
        expect(result.Content).toContain('Membership grew');
    });

    it('returns the original content when cleaning would empty it', () => {
        // A page that is nothing but chrome: every element is on the default exclude list,
        // so a naive clean would hand an empty string to the embedder. Better to over-include
        // than to silently drop the document.
        const allChrome = '<body><nav>Home</nav><footer>Copyright</footer></body>';
        const result = html.Clean({ Content: allChrome, MimeType: 'text/html' });

        expect(result.Success).toBe(true);
        expect(result.Content.length).toBeGreaterThan(0);
        expect(result.Warnings.join(' ')).toContain('falling back to the original');
    });

    it('can promote image alt text when asked', () => {
        const withImg = '<body><main><img alt="A bar chart of revenue"/><p>Body.</p></main></body>';
        const off = html.Clean({ Content: withImg, MimeType: 'text/html' });
        const on = html.Clean({ Content: withImg, MimeType: 'text/html', Options: { IncludeImageAltText: true } });
        expect(off.Content).not.toContain('bar chart');
        expect(on.Content).toContain('A bar chart of revenue');
    });

    it('reports how much it removed', () => {
        const result = html.Clean({ Content: PAGE, MimeType: 'text/html' });
        expect(result.CharactersRemoved).toBeGreaterThan(0);
    });
});

describe('PlainTextContentCleaner', () => {
    it('normalizes whitespace but preserves paragraph breaks', () => {
        const result = plain.Clean({ Content: 'One   line\t\there.\n\n\n\nSecond    paragraph.' });
        expect(result.Content).toBe('One line here.\n\nSecond paragraph.');
    });

    it('can skip whitespace normalization', () => {
        const result = plain.Clean({ Content: 'a   b', Options: { NormalizeWhitespace: false } });
        expect(result.Content).toBe('a   b');
    });

    it('truncates to MaxLength and warns', () => {
        const result = plain.Clean({ Content: 'abcdefghij', Options: { MaxLength: 4 } });
        expect(result.Content).toBe('abcd');
        expect(result.Warnings.join(' ')).toContain('Truncated');
    });

    it('handles empty input without error', () => {
        const result = plain.Clean({ Content: '   ' });
        expect(result.Success).toBe(true);
        expect(result.Content).toBe('');
    });
});

describe('ResolveContentCleaner', () => {
    it('resolves a registered cleaner', () => {
        expect(ResolveContentCleaner('Html').Key).toBe('Html');
    });

    it('falls back rather than throwing on an unknown key', () => {
        expect(ResolveContentCleaner('NoSuchCleaner').Key).toBe('PlainText');
    });

    it('honours the supplied fallback first', () => {
        expect(ResolveContentCleaner('NoSuchCleaner', 'Html').Key).toBe('Html');
    });
});

describe('SuggestCleanerKey', () => {
    it('suggests the HTML cleaner for markup', () => {
        expect(SuggestCleanerKey('text/html')).toBe('Html');
        expect(SuggestCleanerKey('application/xml')).toBe('Html');
    });

    it('suggests plain text for everything else', () => {
        expect(SuggestCleanerKey('text/plain')).toBe('PlainText');
        expect(SuggestCleanerKey(undefined)).toBe('PlainText');
    });
});
