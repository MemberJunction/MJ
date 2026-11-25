/**
 * @fileoverview Extract reads a source's web pages through its page renderer (5.9).
 *
 * A source naming a renderer (`PageRenderer`) has its pages loaded as a browser would build them; the HTML is
 * then read like any fetched page. A page that answers with an error status fails as an HTTP fetch would, and a
 * source naming no renderer is fetched over plain HTTP as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { BasePageRenderer, PageRenderRequest, StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { HttpError } from '@memberjunction/network-utils';
const { fetchContent, probeContentType } = vi.hoisted(() => ({ fetchContent: vi.fn(), probeContentType: vi.fn() }));
vi.mock('../ContentFetcher.js', () => ({ FetchContent: fetchContent, ProbeContentType: probeContentType }));

import { ExtractStage } from '../stages/ExtractStage.js';
// Registers the Html extractor the HTML file type names, so pages are read as Extract reads them.
import '../extractors/HtmlExtractor.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

const renders: PageRenderRequest[] = [];
let status = 200;
const BUILT = '<!doctype html><html><body><p>Built by script.</p></body></html>';
let renderedHtml = BUILT;
const renderer = {
    Key: 'FakeRenderer',
    Render: async (request: PageRenderRequest) => {
        renders.push(request);
        return { Html: renderedHtml, FinalURL: `${request.URL}?final`, Status: status };
    },
} as unknown as BasePageRenderer;

function context(): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: {},
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => ({ Headers: { Authorization: 'Bearer s' } }),
    };
}

function page(): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://site.test/app/page', 'I1'));
    record.SetExtension('Pipeline', 'contentSourceID', 'SRC-1');
    return record;
}

function source(configuration: Record<string, unknown>): void {
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://site.test/app',
        Settings: {},
        Parameters: {},
        Configuration: configuration,
        TypeConfiguration: {},
        Problems: [],
        IsValid: true,
    } as never);
}

beforeEach(() => {
    vi.restoreAllMocks();
    renders.length = 0;
    status = 200;
    renderedHtml = BUILT;
    fetchContent.mockReset();
    probeContentType.mockReset();
    probeContentType.mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'ContentFileTypes', 'get').mockReturnValue([
        { Name: 'HTML', FileExtension: '.html', ByteSignature: '{"TextPrefix":["<!doctype html","<html"]}', IsText: true, ExtractorKey: 'Html' },
    ] as never);
    vi.spyOn(BasePageRenderer, 'Resolve').mockImplementation((key: string) => (key === 'FakeRenderer' ? renderer : null));
});

describe('Extract through a page renderer', () => {
    it("reads the page as the renderer built it, with the session for the source's origin", async () => {
        source({ PageRenderer: 'FakeRenderer' });
        const record = page();

        const outcome = await new ExtractStage().Run(record, context());

        expect(outcome.Status).toBe('Complete');
        expect(String(record.Get('Text'))).toContain('Built by script.');
        expect(fetchContent).not.toHaveBeenCalled();
        expect(renders[0].AccessOrigins).toEqual(['https://site.test']);
        expect(renders[0].Access?.Headers?.Authorization).toBe('Bearer s');
    });

    it('fails a page the renderer found gone, as an HTTP fetch would', async () => {
        source({ PageRenderer: 'FakeRenderer' });
        status = 404;
        await expect(new ExtractStage().Run(page(), context())).rejects.toThrow(/Cannot fetch 'https:\/\/site.test\/app\/page'/);
    });

    it('fetches over plain HTTP when the source names no renderer', async () => {
        source({});
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('<html><body>static</body></html>'), ResolvedURL: undefined });
        await new ExtractStage().Run(page(), context());
        expect(renders).toHaveLength(0);
        expect(fetchContent).toHaveBeenCalledTimes(1);
    });

    it('refuses a renderer nothing registered', async () => {
        source({ PageRenderer: 'Nope' });
        await expect(new ExtractStage().Run(page(), context())).rejects.toThrow(/PageRenderer 'Nope' is not registered/);
    });

    it('fetches a file plainly, never rendering it, when a HEAD says it is not HTML', async () => {
        source({ PageRenderer: 'FakeRenderer' });
        probeContentType.mockResolvedValue('application/pdf');
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('%PDF-1.7'), ContentType: 'application/pdf' });
        await new ExtractStage().Run(page(), context()).catch(() => undefined);
        expect(renders).toHaveLength(0);
        expect(fetchContent).toHaveBeenCalledTimes(1);
    });

    it('renders a page with the source renderer options', async () => {
        source({ PageRenderer: 'FakeRenderer', PageRendererOptions: { WaitUntil: 'load', ScrollToBottom: true } });
        probeContentType.mockResolvedValue('text/html; charset=utf-8');
        await new ExtractStage().Run(page(), context());
        expect(renders[0].Options).toEqual({ WaitUntil: 'load', ScrollToBottom: true });
    });

    it('in WhenEmpty mode keeps a page with text as fetched, and renders only an empty shell', async () => {
        source({ PageRenderer: 'FakeRenderer', PageRenderMode: 'WhenEmpty', Website: { UserAgent: 'MJ-Test', MaxResponseBytes: 1000 } });
        const full = `<html><body><p>${'Static words on the page. '.repeat(20)}</p></body></html>`;
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode(full), ContentType: 'text/html' });
        const record = page();
        await new ExtractStage().Run(record, context());
        expect(renders).toHaveLength(0);
        expect(String(record.Get('Text'))).toContain('Static words');
        expect(fetchContent.mock.calls[0][0]).toMatchObject({ UserAgent: 'MJ-Test', MaxBytes: 1000 });

        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('<html><body><div id="root"></div><script>x()</script></body></html>'), ContentType: 'text/html' });
        const shell = page();
        await new ExtractStage().Run(shell, context());
        expect(renders).toHaveLength(1);
        expect(String(shell.Get('Text'))).toContain('Built by script.');
    });

    it("decodes a rendered page as the UTF-8 it is, whatever charset the site's own <meta> declares", async () => {
        source({ PageRenderer: 'FakeRenderer' });
        renderedHtml = '<!doctype html><html><head><meta charset="windows-1252"></head><body><p>Un café au comptoir.</p></body></html>';
        const record = page();
        await new ExtractStage().Run(record, context());
        expect(String(record.Get('Text'))).toContain('Un café au comptoir.');
    });

    it('renders a page whose HEAD names a type servers also send for pages (octet-stream)', async () => {
        source({ PageRenderer: 'FakeRenderer' });
        probeContentType.mockResolvedValue('application/octet-stream');
        await new ExtractStage().Run(page(), context());
        expect(renders).toHaveLength(1);
        expect(fetchContent).not.toHaveBeenCalled();
    });

    it('in WhenEmpty mode renders a page the site refused to a plain fetch (403), but not a missing one (404)', async () => {
        source({ PageRenderer: 'FakeRenderer', PageRenderMode: 'WhenEmpty' });
        fetchContent.mockRejectedValue(new HttpError('Request failed with status code 403', { Status: 403, Url: 'https://site.test/app/page', Method: 'GET' }));
        const refused = page();
        await new ExtractStage().Run(refused, context());
        expect(renders).toHaveLength(1);
        expect(String(refused.Get('Text'))).toContain('Built by script.');

        fetchContent.mockRejectedValue(new HttpError('Request failed with status code 404', { Status: 404, Url: 'https://site.test/app/page', Method: 'GET' }));
        await expect(new ExtractStage().Run(page(), context())).rejects.toThrow(/404/);
        expect(renders).toHaveLength(1);
    });
});
