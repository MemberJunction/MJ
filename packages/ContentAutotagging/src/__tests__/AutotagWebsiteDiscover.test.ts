import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks — referenced in vi.mock factories (which are hoisted above imports)
// ============================================================================

const { mockEngineInstance, mockHttpGet, mockHttpHead } = vi.hoisted(() => ({
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
    mockHttpGet: vi.fn(),
    mockHttpHead: vi.fn(),
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

vi.mock('@memberjunction/network-utils', () => ({
    HttpGet: mockHttpGet,
    HttpHead: mockHttpHead,
}));

import { AutotagWebsite } from '../Websites/generic/AutotagWebsite';
import { MAX_SITEMAP_BYTES, WebsiteCrawlFetchers } from '../Websites/generic/WebsiteCrawlFetchers';
import { BasePageRenderer, DiscoverRequest, PageRenderRequest } from '@memberjunction/content-pipeline-base';

/**
 * The driver's Discover over the crawl (5.9): pages through the source's page renderer with the session for
 * its own origin, and a walk in parts handing its token back and receiving it again. The renderer and HTTP
 * are stand-ins; the crawl's own rules are covered in WebsiteCrawl.test.ts.
 */
const PAGES: Record<string, string> = {
    'https://site.test/docs/start': '<a href="/docs/a">a</a><a href="/docs/b">b</a>',
    'https://site.test/docs/a': '<a href="/docs/a1">a1</a>',
    'https://site.test/docs/b': '',
    'https://site.test/docs/a1': '',
};
const renders: PageRenderRequest[] = [];
const renderer = {
    Key: 'FakeRenderer',
    Render: async (request: PageRenderRequest) => {
        renders.push(request);
        return { Html: `<html><body>${PAGES[request.URL] ?? ''}</body></html>`, FinalURL: request.URL, Status: PAGES[request.URL] === undefined ? 404 : 200 };
    },
} as unknown as BasePageRenderer;

function request(overrides: Partial<DiscoverRequest> = {}): DiscoverRequest {
    return {
        ContentSourceID: 'S1',
        URL: 'https://site.test/docs/start',
        Parameters: {},
        Configuration: { PageRenderer: 'FakeRenderer', Website: { MaxDepth: 2, CrawlDelayMs: 0 } },
        Access: { Headers: { Authorization: 'Bearer s' } },
        ContextUser: {} as never,
        Provider: {} as never,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        ...overrides,
    };
}

async function walk(req: DiscoverRequest): Promise<{ found: string[]; token?: string | null }> {
    const run = (new AutotagWebsite().Discover(req) as AsyncGenerator<{ URL: string }, { ResumeToken?: string | null } | void>);
    const found: string[] = [];
    for (;;) {
        const next = await run.next();
        if (next.done) {
            return { found, token: next.value ? next.value.ResumeToken : undefined };
        }
        found.push(next.value.URL);
    }
}

describe('AutotagWebsite.Discover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        renders.length = 0;
        vi.spyOn(BasePageRenderer, 'Resolve').mockImplementation((key: string) => (key === 'FakeRenderer' ? renderer : null));
    });

    it("reads the site's pages through the source's renderer, with the session for the source's own origin", async () => {
        const { found, token } = await walk(request());

        expect(found).toEqual(['https://site.test/docs/start', 'https://site.test/docs/a', 'https://site.test/docs/b', 'https://site.test/docs/a1']);
        expect(token).toBeUndefined();
        expect(renders[0].AccessOrigins).toEqual(['https://site.test']);
        expect(renders[0].Access?.Headers?.Authorization).toBe('Bearer s');
        expect(mockHttpGet).not.toHaveBeenCalled();
    });

    it('returns a resume token at its deadline and carries on from it', async () => {
        const first = await walk(request({ Deadline: new Date(0) }));
        expect(first.token).toBeTruthy();
        // A page is reported once it is read; its links wait in the token.
        expect(first.found).toEqual(['https://site.test/docs/start']);

        const rest = await walk(request({ ResumeToken: first.token }));
        expect(rest.found).toEqual(['https://site.test/docs/a', 'https://site.test/docs/b', 'https://site.test/docs/a1']);
        expect(rest.token).toBeUndefined();
    });

    it('starts again from the start page when the saved token is not one it wrote', async () => {
        const { found } = await walk(request({ ResumeToken: 'not-a-token' }));
        expect(found[0]).toBe('https://site.test/docs/start');
    });

    it('refuses a renderer nothing registered', async () => {
        await expect(walk(request({ Configuration: { PageRenderer: 'Nope' } }))).rejects.toThrow(/PageRenderer 'Nope' is not registered/);
    });
});

/** A plain HTTP answer as `HttpGet` with `ResponseType: 'stream'` returns it. */
function streamed(body: string, contentType = 'text/html', status = 200) {
    return {
        Data: new Response(body).body,
        Status: status,
        Ok: status >= 200 && status < 300,
        Url: '',
        Headers: { 'content-type': contentType },
    };
}

describe('AutotagWebsite.Discover rendering only what is HTML', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        renders.length = 0;
        vi.spyOn(BasePageRenderer, 'Resolve').mockImplementation((key: string) => (key === 'FakeRenderer' ? renderer : null));
    });

    it('fetches a file plainly, never rendering it, when a HEAD says it is not HTML', async () => {
        mockHttpHead.mockImplementation(async (url: string) =>
            url.endsWith('.pdf')
                ? { Ok: true, Status: 200, Url: url, Headers: { 'content-type': 'application/pdf' } }
                : { Ok: true, Status: 200, Url: url, Headers: { 'content-type': 'text/html' } },
        );
        PAGES['https://site.test/docs/start'] = '<a href="/docs/guide.pdf">pdf</a>';
        try {
            const { found } = await walk(request());
            expect(found).toEqual(['https://site.test/docs/start', 'https://site.test/docs/guide.pdf']);
            expect(renders.map((r) => r.URL)).toEqual(['https://site.test/docs/start']);
        } finally {
            PAGES['https://site.test/docs/start'] = '<a href="/docs/a">a</a><a href="/docs/b">b</a>';
        }
    });

    it('renders only the pages a plain fetch finds empty in WhenEmpty mode, with the renderer options', async () => {
        mockHttpGet.mockImplementation(async (url: string) =>
            url.endsWith('/start')
                ? streamed(`<html><body><p>${'Real words on the page. '.repeat(20)}</p><a href="/docs/a">a</a></body></html>`)
                : streamed('<html><body><div id="app"></div><script>boot()</script></body></html>'),
        );
        const { found } = await walk(
            request({
                Configuration: {
                    PageRenderer: 'FakeRenderer',
                    PageRenderMode: 'WhenEmpty',
                    PageRendererOptions: { WaitSelector: '#app' },
                    Website: { MaxDepth: 0, CrawlDelayMs: 0, UserAgent: 'MJ-Test' },
                },
            }),
        );
        expect(found).toEqual(['https://site.test/docs/start', 'https://site.test/docs/a']);
        expect(renders.map((r) => r.URL)).toEqual(['https://site.test/docs/a']);
        expect(renders[0].Options?.WaitSelector).toBe('#app');
        expect(mockHttpGet.mock.calls[0][1]).toMatchObject({ ResponseType: 'stream', UserAgent: 'MJ-Test' });
    });

    it('does not report a link whose page answers 404', async () => {
        PAGES['https://site.test/docs/b'] = undefined as unknown as string;
        try {
            const { found } = await walk(request());
            expect(found).not.toContain('https://site.test/docs/b');
        } finally {
            PAGES['https://site.test/docs/b'] = '';
        }
    });
});

describe('the crawl fetchers: what is rendered, and what a sitemap may weigh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        renders.length = 0;
    });

    function fetchersFor(mode: 'Always' | 'WhenEmpty'): WebsiteCrawlFetchers {
        return new WebsiteCrawlFetchers({
            HttpOptions: () => ({}),
            Renderer: renderer,
            RenderMode: mode,
            RenderAccess: () => ({ Access: null, AccessOrigins: [] }),
            MaxResponseBytes: 100,
            Signal: new AbortController().signal,
        });
    }

    it('renders a page whose HEAD names a type servers also send for pages (octet-stream); fetches a PDF plainly', async () => {
        mockHttpHead.mockResolvedValue({ Ok: true, Status: 200, Url: '', Headers: { 'content-type': 'application/octet-stream' } });
        await fetchersFor('Always').Page('https://site.test/docs/a');
        expect(renders.map((r) => r.URL)).toEqual(['https://site.test/docs/a']);

        mockHttpHead.mockResolvedValue({ Ok: true, Status: 200, Url: '', Headers: { 'content-type': 'application/pdf' } });
        const pdf = await fetchersFor('Always').Page('https://site.test/docs/guide.pdf');
        expect(renders).toHaveLength(1);
        expect(pdf?.ContentType).toBe('application/pdf');
    });

    it('in WhenEmpty mode renders a page the site refused to a plain fetch (403), but not a missing one (404)', async () => {
        mockHttpGet.mockResolvedValue(streamed('Forbidden', 'text/html', 403));
        const refused = await fetchersFor('WhenEmpty').Page('https://site.test/docs/a');
        expect(renders.map((r) => r.URL)).toEqual(['https://site.test/docs/a']);
        expect(refused?.Status).toBe(200);

        mockHttpGet.mockResolvedValue(streamed('Not here', 'text/html', 404));
        const missing = await fetchersFor('WhenEmpty').Page('https://site.test/docs/gone');
        expect(renders).toHaveLength(1);
        expect(missing?.Status).toBe(404);
    });

    it("reads a sitemap up to the sitemap protocol's limit, not the source's page limit", async () => {
        mockHttpGet.mockResolvedValue({ Data: '<urlset/>', Status: 200, Ok: true, Url: '', Headers: {} });
        await fetchersFor('Always').Text('https://site.test/sitemap.xml');
        expect(mockHttpGet.mock.calls[0][1]).toMatchObject({ MaxResponseBytes: MAX_SITEMAP_BYTES });
    });
});
