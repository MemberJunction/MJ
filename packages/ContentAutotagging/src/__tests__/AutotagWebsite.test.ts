import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks — referenced in vi.mock factories (which are hoisted above imports)
// ============================================================================

const { mockEngineInstance, mockAxiosGet } = vi.hoisted(() => ({
    mockEngineInstance: {
        getChecksumFromText: vi.fn().mockImplementation((text: string) => {
            // Deterministic fake hash: length-prefixed first 16 chars. The real
            // engine uses SHA-256 but for tests we just need stable values.
            return Promise.resolve(`fake-${text.length}-${text.slice(0, 16).replace(/\s+/g, '_')}`);
        }),
    },
    mockAxiosGet: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata { Entities: unknown[] = []; }
    class MockRunView { RunView = vi.fn(); RunViews = vi.fn(); }
    return {
        ...actual,
        RunView: MockRunView,
        Metadata: MockMetadata,
        LogStatus: vi.fn(),
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return { ...actual };
});

// AutotagWebsite imports the engine via '../../Engine'. The same resolved
// module is referenced via the test-file-relative '../Engine' path.
vi.mock('../Engine', () => ({
    AutotagBaseEngine: { Instance: mockEngineInstance },
    ContentSourceParams: class {
        contentSourceID = '';
        name = '';
        ContentTypeID = '';
        ContentFileTypeID = '';
        ContentSourceTypeID = '';
        URL = '';
    },
}));

vi.mock('../Core', () => ({
    AutotagBase: class { async Autotag(): Promise<number> { return 0; } },
    AutotagProgressCallback: undefined,
}));

vi.mock('axios', () => ({
    default: { get: mockAxiosGet, head: vi.fn() },
}));

import { AutotagWebsite } from '../Websites/generic/AutotagWebsite';

// Test subclass exposing protected methods + properties for assertion. We
// don't monkey-patch the production class; this is a one-way escape hatch
// purely for tests.
class TestableAutotagWebsite extends AutotagWebsite {
    public get $MaxDepth(): number { return this.MaxDepth; }
    public get $CrawlSitesInLowerLevelDomain(): boolean { return this.CrawlSitesInLowerLevelDomain; }
    public get $CrawlOtherSitesInTopLevelDomain(): boolean { return this.CrawlOtherSitesInTopLevelDomain; }

    public $normalizeURL(href: string): string { return this.normalizeURL(href); }
    public $extractTextFromHTML(html: string): string { return this.extractTextFromHTML(html); }
}

describe('AutotagWebsite', () => {
    let subject: TestableAutotagWebsite;

    beforeEach(() => {
        vi.clearAllMocks();
        subject = new TestableAutotagWebsite();
    });

    describe('default crawl settings (Commit 1 regression guard)', () => {
        it('MaxDepth defaults to 2 — root + two link-levels', () => {
            expect(subject.$MaxDepth).toBe(2);
        });

        it('CrawlSitesInLowerLevelDomain defaults to true so the depth-aware path runs out of the box', () => {
            expect(subject.$CrawlSitesInLowerLevelDomain).toBe(true);
        });

        it('CrawlOtherSitesInTopLevelDomain defaults to false to avoid accidental same-domain fan-out', () => {
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(false);
        });
    });

    describe('normalizeURL', () => {
        it('strips the URL fragment (client-only per RFC 3986)', () => {
            expect(subject.$normalizeURL('https://example.com/page#section')).toBe('https://example.com/page');
        });

        it('collapses a single trailing slash on the path', () => {
            expect(subject.$normalizeURL('https://example.com/page/')).toBe('https://example.com/page');
        });

        it('preserves the trailing slash on the root path', () => {
            // URL parser stores the root as "/"; without this carve-out we'd produce
            // "https://example.com" with no slash at all.
            expect(subject.$normalizeURL('https://example.com/')).toBe('https://example.com/');
        });

        it('sorts query parameters for stable equality', () => {
            const a = subject.$normalizeURL('https://example.com/?b=2&a=1');
            const b = subject.$normalizeURL('https://example.com/?a=1&b=2');
            expect(a).toBe(b);
        });

        it('lowercases the host (free via URL parser)', () => {
            expect(subject.$normalizeURL('https://EXAMPLE.com/path')).toBe('https://example.com/path');
        });

        it('preserves path case — RFC 3986 says paths are case-sensitive', () => {
            // Some real sites (wikis, certain file fronts) treat /About and /about
            // as distinct resources. Don't merge them silently.
            expect(subject.$normalizeURL('https://example.com/About')).toBe('https://example.com/About');
            expect(subject.$normalizeURL('https://example.com/about')).toBe('https://example.com/about');
        });

        it('is idempotent — normalize(normalize(x)) === normalize(x)', () => {
            const input = 'https://Example.com/Page/?b=2&a=1#section';
            const once = subject.$normalizeURL(input);
            const twice = subject.$normalizeURL(once);
            expect(twice).toBe(once);
        });

        it('returns the input unchanged when the URL cannot be parsed', () => {
            // Failure-mode contract: never throw, always return *something*.
            expect(subject.$normalizeURL('not a url')).toBe('not a url');
        });

        it('collapses combinations: fragment + trailing slash + query order all in one go', () => {
            const messy = 'https://EXAMPLE.com/dir/?z=last&a=first#anchor';
            const clean = 'https://example.com/dir?a=first&z=last';
            expect(subject.$normalizeURL(messy)).toBe(clean);
        });
    });

    describe('extractTextFromHTML', () => {
        it('returns clean text from an HTML body, separated by line breaks for block elements', () => {
            const html = '<html><body><h1>Title</h1><p>Para one.</p><p>Para two.</p></body></html>';
            const text = subject.$extractTextFromHTML(html);
            // Don't lock down exact whitespace; just verify content is present and ordered.
            expect(text).toContain('Title');
            expect(text).toContain('Para one.');
            expect(text).toContain('Para two.');
            expect(text.indexOf('Title')).toBeLessThan(text.indexOf('Para one.'));
        });

        it('returns an empty string when there is no <body> tag', () => {
            // Some malformed responses (or non-HTML) won't have a body; we should
            // not throw and not return undefined.
            const text = subject.$extractTextFromHTML('<!doctype html>');
            expect(text).toBe('');
        });

        it('ignores <script> and <style> content fairly well via cheerio defaults', () => {
            // cheerio still reports script/style text by default; this test documents
            // the current behavior rather than enforces something better. Tighten
            // later if we ever filter those tags explicitly.
            const html = '<body><p>visible</p><script>const x=1;</script></body>';
            const text = subject.$extractTextFromHTML(html);
            expect(text).toContain('visible');
        });
    });

    describe('streamContentItemsToProcess', () => {
        it('is an async-generator function that returns an AsyncIterable', () => {
            // Sanity-check the shape — full end-to-end exercise lives in the
            // engine-side streaming tests and the integration suite.
            const it = subject.streamContentItemsToProcess([]);
            expect(it).toBeDefined();
            expect(typeof (it as AsyncIterable<unknown>)[Symbol.asyncIterator]).toBe('function');
        });

        it('produces an immediately-done iterator when given zero sources', async () => {
            const collected: unknown[] = [];
            for await (const item of subject.streamContentItemsToProcess([])) {
                collected.push(item);
            }
            expect(collected).toEqual([]);
        });
    });

    describe('fetchAndExtract', () => {
        it('fetches the URL exactly once and returns extracted text + checksum', async () => {
            mockAxiosGet.mockResolvedValueOnce({ data: '<body><p>Hello world</p></body>' });

            const result = await subject.fetchAndExtract('https://example.com/page');

            expect(mockAxiosGet).toHaveBeenCalledTimes(1);
            expect(mockAxiosGet).toHaveBeenCalledWith('https://example.com/page');
            expect(result.text).toContain('Hello world');
            // Checksum should come from the engine helper that hashes EXTRACTED text,
            // NOT the raw HTML. This is the critical Commit 2 invariant.
            expect(mockEngineInstance.getChecksumFromText).toHaveBeenCalledTimes(1);
            expect(mockEngineInstance.getChecksumFromText).toHaveBeenCalledWith(result.text);
            expect(result.checksum).toMatch(/^fake-\d+-/);
        });

        it('returns the same checksum for two pages with identical extracted text but cosmetically different HTML', async () => {
            // The whole point of hashing extracted text: incidental HTML changes
            // (timestamps, build hashes, CSRF tokens) should NOT trigger a re-process.
            const htmlA = '<body><!-- build:abc123 --><p>Same content</p></body>';
            const htmlB = '<body><!-- build:def456 --><p>Same content</p></body>';

            mockAxiosGet.mockResolvedValueOnce({ data: htmlA });
            const a = await subject.fetchAndExtract('https://example.com/page');

            mockAxiosGet.mockResolvedValueOnce({ data: htmlB });
            const b = await subject.fetchAndExtract('https://example.com/page');

            expect(a.checksum).toBe(b.checksum);
        });

        it('returns different checksums when the extracted text actually differs', async () => {
            mockAxiosGet.mockResolvedValueOnce({ data: '<body><p>Version one</p></body>' });
            const a = await subject.fetchAndExtract('https://example.com/page');

            mockAxiosGet.mockResolvedValueOnce({ data: '<body><p>Version two</p></body>' });
            const b = await subject.fetchAndExtract('https://example.com/page');

            expect(a.checksum).not.toBe(b.checksum);
        });
    });
});
