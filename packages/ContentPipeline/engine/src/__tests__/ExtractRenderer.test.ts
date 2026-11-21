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
const fetchContent = vi.hoisted(() => vi.fn());
vi.mock('../ContentFetcher.js', () => ({ FetchContent: fetchContent }));

import { ExtractStage } from '../stages/ExtractStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

const renders: PageRenderRequest[] = [];
let status = 200;
const renderer = {
    Key: 'FakeRenderer',
    Render: async (request: PageRenderRequest) => {
        renders.push(request);
        return { Html: '<!doctype html><html><body><p>Built by script.</p></body></html>', FinalURL: `${request.URL}?final`, Status: status };
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
    fetchContent.mockReset();
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
});
