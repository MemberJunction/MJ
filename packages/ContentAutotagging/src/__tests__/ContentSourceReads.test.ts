/**
 * Reads whose failure must not be taken as an empty answer, in the content-source providers and the classification
 * context. A provider that could not read a source's stored items must not treat every incoming item as new (each would
 * get a second content item), and a failed lookup must not be cached as "nothing there". Real providers on a typed
 * metadata-provider double whose reads fail.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() }; // each failure is reported; the report is not this test's subject
});
import { UserInfo, type RunViewResult } from '@memberjunction/core';
import { ApplicationSettingEngine } from '@memberjunction/core-entities';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJContentItemEntity } from '@memberjunction/core-entities';
import { AutotagRSSFeed } from '../RSSFeed/generic/AutotagRSSFeed';
import { AutotagCloudStorage } from '../CloudStorage/providers/AutotagCloudStorage';
import { AutotagWebsite } from '../Websites/generic/AutotagWebsite';
import { ClassificationContextResolver } from '../Engine/generic/ClassificationContextResolver';
import type { ContentSourceParams } from '../Engine';

const FAILED: RunViewResult = { Success: false, Results: [], ErrorMessage: 'Connection lost', RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 };

/** A provider whose every read fails. */
function failingProvider(): EntitiesOnlyProvider {
    const provider = new EntitiesOnlyProvider([]);
    vi.spyOn(provider, 'RunView').mockResolvedValue(FAILED);
    vi.spyOn(provider, 'RunViews').mockResolvedValue([FAILED, FAILED]);
    return provider;
}

class TestRSSFeed extends AutotagRSSFeed {
    constructor(private readonly provider: IMetadataProvider) { super(); }
    protected override get ProviderToUse(): IMetadataProvider { return this.provider; }
    public Existing(sourceID: string): Promise<Map<string, MJContentItemEntity>> { return this.LoadExistingContentItems(sourceID); }
}

class TestCloudStorage extends AutotagCloudStorage {
    constructor(private readonly provider: IMetadataProvider) { super(); }
    protected override get ProviderToUse(): IMetadataProvider { return this.provider; }
    public Existing(sourceID: string): Promise<Map<string, MJContentItemEntity>> { return this.LoadExistingContentItems(sourceID); }
}

class TestWebsite extends AutotagWebsite {
    /** Content items this crawl created. */
    public Created = 0;
    constructor(private readonly provider: IMetadataProvider) { super(); }
    protected override get ProviderToUse(): IMetadataProvider { return this.provider; }
    public override async FetchAndExtract(): Promise<{ text: string; checksum: string }> {
        return { text: 'Page text', checksum: 'page-hash' };
    }
    public Process(url: string, params: ContentSourceParams): Promise<MJContentItemEntity | null> {
        return this.processSingleURL(url, params);
    }
}

const PARAMS: ContentSourceParams = {
    contentSourceID: 'source-1', name: 'Site', ContentTypeID: 'ct', ContentFileTypeID: 'cft', ContentSourceTypeID: 'cst', URL: 'https://example.com',
};

describe('content-source reads that fail', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('RSS: a source whose stored items cannot be read is not treated as empty', async () => {
        await expect(new TestRSSFeed(failingProvider()).Existing('source-1')).rejects.toThrow('Connection lost');
    });

    it('cloud storage: a source whose stored items cannot be read is not treated as empty', async () => {
        await expect(new TestCloudStorage(failingProvider()).Existing('source-1')).rejects.toThrow('Connection lost');
    });

    it('website: a page whose stored items cannot be read is not created as new', async () => {
        const provider = failingProvider();
        const getEntityObject = vi.spyOn(provider, 'GetEntityObject');

        await expect(new TestWebsite(provider).Process('https://example.com/a', PARAMS)).rejects.toThrow('Connection lost');
        expect(getEntityObject).not.toHaveBeenCalled();
    });

    it('classification context: a failed application lookup is not cached as "no application"', async () => {
        const provider = failingProvider();
        const runView = vi.spyOn(provider, 'RunView');
        vi.spyOn(ApplicationSettingEngine.Instance, 'Config').mockResolvedValue(undefined);
        const getSetting = vi.spyOn(ApplicationSettingEngine.Instance, 'GetSetting').mockReturnValue('Org context');

        await ClassificationContextResolver.ResolveEffectiveContext(null, '', [], new UserInfo(), provider);
        runView.mockResolvedValue({ ...FAILED, Success: true, Results: [{ ID: 'kh-app' }], ErrorMessage: '' });
        const context = await ClassificationContextResolver.ResolveEffectiveContext(null, '', [], new UserInfo(), provider);

        expect(runView).toHaveBeenCalledTimes(2);
        expect(getSetting).toHaveBeenLastCalledWith('classify.org.context', 'kh-app');
        expect(context).toContain('Org context');
    });
});
