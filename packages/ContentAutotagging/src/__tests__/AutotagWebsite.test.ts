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
        // Engine hook surface used by Autotag's budget setup.
        OnAfterBatch: null as unknown,
        SetSubclassContentSourceType: vi.fn().mockReturnValue('source-type-website'),
        getAllContentSources: vi.fn().mockResolvedValue([]),
        getContentSourceParams: vi.fn().mockResolvedValue(new Map()),
        ExtractTextAndProcessWithLLM: vi.fn().mockResolvedValue(undefined),
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
    public get $URLPattern(): string { return this.URLPattern; }
    public get $RootURL(): string { return this.RootURL; }

    public $normalizeURL(href: string): string { return this.normalizeURL(href); }
    public $extractTextFromHTML(html: string): string { return this.extractTextFromHTML(html); }

    public get $sourceBudgetMap() { return this.sourceBudgetMap; }
    public $installBudgetGate(): void { return this.installBudgetGate(); }
    public async $setupRunBudgets(sources: unknown[]): Promise<void> {
        return this.setupRunBudgets(sources as never);
    }

    public $applyDefaultCrawlSettings(): void { return this.applyDefaultCrawlSettings(); }
    public $applyWebsiteConfigFromSource(source: unknown): void {
        return this.applyWebsiteConfigFromSource(source as never);
    }
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

    describe('RunBudget integration (MaxItemsPerRun)', () => {
        const mockUser = { ID: 'user-1' } as never;

        beforeEach(() => {
            // Reset engine hook between tests so install assertions are clean.
            mockEngineInstance.OnAfterBatch = null;
        });

        it('setupRunBudgets creates one RunBudget per source, even with no knobs configured', async () => {
            const sources = [
                { ID: 'src-a', Name: 'A', ConfigurationObject: null },
                { ID: 'src-b', Name: 'B', ConfigurationObject: null },
            ];
            (subject as unknown as { contextUser: typeof mockUser }).contextUser = mockUser;
            await subject.$setupRunBudgets(sources as never);
            expect(subject.$sourceBudgetMap.size).toBe(2);
        });

        it('setupRunBudgets reads MaxItemsPerRun from ConfigurationObject', async () => {
            const sources = [
                { ID: 'src-a', Name: 'A', ConfigurationObject: { MaxItemsPerRun: 50 } },
            ];
            (subject as unknown as { contextUser: typeof mockUser }).contextUser = mockUser;
            await subject.$setupRunBudgets(sources as never);
            const budget = subject.$sourceBudgetMap.values().next().value!;
            // Push exactly to the cap — should pause.
            budget.recordItemsProcessed(50);
            expect(budget.checkBudgets().reason).toBe('MaxItemsPerRunExceeded');
        });

        it('ContentSourceParam MaxItemsPerRun overrides ConfigurationObject', async () => {
            // The per-instance UI knob should win over the global ConfigurationObject
            // default — this is the only way to make per-source tuning sane.
            mockEngineInstance.getContentSourceParams.mockResolvedValueOnce(
                new Map([['MaxItemsPerRun', '7']])
            );
            const sources = [
                { ID: 'src-a', Name: 'A', ConfigurationObject: { MaxItemsPerRun: 1000 } },
            ];
            (subject as unknown as { contextUser: typeof mockUser }).contextUser = mockUser;
            await subject.$setupRunBudgets(sources as never);
            const budget = subject.$sourceBudgetMap.values().next().value!;
            budget.recordItemsProcessed(7);
            const v = budget.checkBudgets();
            expect(v.ok).toBe(false);
            expect(v.details).toContain('7/7');
        });

        it('installBudgetGate registers an OnAfterBatch hook that increments item counts per source', async () => {
            const sources = [{ ID: 'src-a', Name: 'A', ConfigurationObject: { MaxItemsPerRun: 3 } }];
            (subject as unknown as { contextUser: typeof mockUser }).contextUser = mockUser;
            await subject.$setupRunBudgets(sources as never);
            subject.$installBudgetGate();

            expect(typeof mockEngineInstance.OnAfterBatch).toBe('function');

            // Drive the hook directly with a fake batch — simulates one engine batch.
            const hook = mockEngineInstance.OnAfterBatch as (batch: unknown[], total: number) => Promise<{ continue: boolean; reason?: string }>;
            const v1 = await hook([{ ContentSourceID: 'src-a' }, { ContentSourceID: 'src-a' }], 2);
            expect(v1.continue).toBe(true);

            // Second batch tips us over the 3-item cap → gate returns false.
            const v2 = await hook([{ ContentSourceID: 'src-a' }, { ContentSourceID: 'src-a' }], 4);
            expect(v2.continue).toBe(false);
            expect(v2.reason).toContain('MaxItemsPerRunExceeded');
        });

        it('budget gate scopes item counts to the correct source when batch spans multiple sources', async () => {
            const sources = [
                { ID: 'src-a', Name: 'A', ConfigurationObject: { MaxItemsPerRun: 2 } },
                { ID: 'src-b', Name: 'B', ConfigurationObject: { MaxItemsPerRun: 10 } },
            ];
            (subject as unknown as { contextUser: typeof mockUser }).contextUser = mockUser;
            await subject.$setupRunBudgets(sources as never);
            subject.$installBudgetGate();

            const hook = mockEngineInstance.OnAfterBatch as (batch: unknown[], total: number) => Promise<{ continue: boolean; reason?: string }>;
            // Batch has 5 src-b items and 2 src-a items — only src-a hits its cap.
            const verdict = await hook([
                { ContentSourceID: 'src-b' }, { ContentSourceID: 'src-b' },
                { ContentSourceID: 'src-b' }, { ContentSourceID: 'src-b' }, { ContentSourceID: 'src-b' },
                { ContentSourceID: 'src-a' }, { ContentSourceID: 'src-a' },
            ], 7);
            expect(verdict.continue).toBe(false);
            expect(verdict.reason).toContain('MaxItemsPerRunExceeded');

            // src-b is at 5/10 — well under, would have allowed continue if it
            // were the only source. Confirms the gate scopes per source.
            const bBudget = subject.$sourceBudgetMap.get('src-b')!;
            expect(bBudget.snapshot().items).toBe(5);
        });
    });

    describe('applyWebsiteConfigFromSource (Configuration.Website storage)', () => {
        it('does nothing when the source has no ConfigurationObject', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({ ConfigurationObject: null });
            expect(subject.$MaxDepth).toBe(2);
            expect(subject.$CrawlSitesInLowerLevelDomain).toBe(true);
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(false);
        });

        it('does nothing when ConfigurationObject has no Website sub-object', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({ ConfigurationObject: { MaxItemsPerRun: 50 } });
            // Defaults remain — only the Website sub-object affects crawl knobs.
            expect(subject.$MaxDepth).toBe(2);
        });

        it('applies every Website sub-object field that is set', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({
                ConfigurationObject: {
                    Website: {
                        MaxDepth: 5,
                        CrawlSitesInLowerLevelDomain: false,
                        CrawlOtherSitesInTopLevelDomain: true,
                        URLPattern: '^https://example\\.com/blog/.*',
                        RootURL: 'https://example.com',
                    },
                },
            });
            expect(subject.$MaxDepth).toBe(5);
            expect(subject.$CrawlSitesInLowerLevelDomain).toBe(false);
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(true);
            expect(subject.$URLPattern).toBe('^https://example\\.com/blog/.*');
            expect(subject.$RootURL).toBe('https://example.com');
        });

        it('preserves defaults for unset Website fields (partial overlay)', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({
                ConfigurationObject: { Website: { MaxDepth: 0 } },
            });
            expect(subject.$MaxDepth).toBe(0);
            // Booleans not set — defaults stand.
            expect(subject.$CrawlSitesInLowerLevelDomain).toBe(true);
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(false);
        });

        it('rejects non-finite MaxDepth values (e.g., NaN from corrupt JSON)', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({
                ConfigurationObject: { Website: { MaxDepth: Number.NaN } },
            });
            // Falls back to the default — never applies NaN.
            expect(subject.$MaxDepth).toBe(2);
        });

        it('rejects empty-string URLPattern / RootURL (defaults remain in effect)', () => {
            subject.$applyDefaultCrawlSettings();
            subject.$applyWebsiteConfigFromSource({
                ConfigurationObject: { Website: { URLPattern: '', RootURL: '' } },
            });
            expect(subject.$URLPattern).toBeUndefined();
            expect(subject.$RootURL).toBeUndefined();
        });

        it('applyDefaultCrawlSettings resets after a prior source set non-default values', () => {
            // Simulate the streaming loop's per-source reset: source A sets knobs,
            // applyDefaults restores them before processing source B.
            subject.$applyWebsiteConfigFromSource({
                ConfigurationObject: { Website: { MaxDepth: 7, CrawlOtherSitesInTopLevelDomain: true } },
            });
            expect(subject.$MaxDepth).toBe(7);
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(true);

            subject.$applyDefaultCrawlSettings();
            expect(subject.$MaxDepth).toBe(2);
            expect(subject.$CrawlOtherSitesInTopLevelDomain).toBe(false);
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
