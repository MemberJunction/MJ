/**
 * A failed read of the rows that already exist is not "none exist": each of these reads decides whether a row is
 * created, so treating the failure as empty would create a duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewFn, mockRunViewsFn, mockGetEntityObjectFn } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockRunViewsFn: vi.fn(),
    mockGetEntityObjectFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewFn;
        RunViews = mockRunViewsFn;
    }
    return { ...actual, RunView: MockRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {}, AIEmbeddingRunner: class {} }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn() } } }));
vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('officeparser', () => ({ default: { parseOffice: vi.fn() } }));
vi.mock('@memberjunction/network-utils', () => ({ HttpGet: vi.fn(), HttpHead: vi.fn() }));

import { EntityInfo, LogError, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJContentItemEntity, MJContentItemTagEntity } from '@memberjunction/core-entities';
import { AutotagBaseEngine, type ContentSourceParams } from '../Engine';
import { AutotagRSSFeed } from '../RSSFeed/generic/AutotagRSSFeed';
import { AutotagCloudStorage } from '../CloudStorage/providers/AutotagCloudStorage';
import { AutotagWebsite } from '../Websites/generic/AutotagWebsite';
import { AutotagEntity } from '../Entity/generic/AutotagEntity';

const FAILED = { Success: false, Results: [], ErrorMessage: 'Connection lost' };
const contextUser = new UserInfo();
const provider = { GetEntityObject: mockGetEntityObjectFn, EntityByName: () => ({ ID: 'entity-content-items' }) } as unknown as IMetadataProvider;

/** Entity metadata with the given fields, keyed by ID. */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
    const id = `entity-${name}`;
    return new EntityInfo({
        ID: id, Name: name,
        Fields: ['ID', ...fieldNames].map((field, index) => ({
            ID: `${id}-${field}`, EntityID: id, Entity: name, Sequence: index + 1, Name: field,
            Type: field === 'Weight' ? 'decimal' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

class TestWebsite extends AutotagWebsite {
    constructor() {
        super();
        this._provider = provider;
    }
    public override async FetchAndExtract(): Promise<{ text: string; checksum: string }> {
        return { text: 'Page text', checksum: 'page-hash' };
    }
    public Process(url: string, params: ContentSourceParams): Promise<MJContentItemEntity | null> {
        return this.processSingleURL(url, params);
    }
}

/** The engine with a public constructor and a provider that records creates. */
class TestEngine extends AutotagBaseEngine {
    public constructor() {
        super();
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return provider;
    }
}

describe('reads whose failure is not "none exist"', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewFn.mockResolvedValue(FAILED);
        mockRunViewsFn.mockResolvedValue([FAILED, FAILED]);
        mockGetEntityObjectFn.mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) });
    });

    it('RSS: the stored items of a source', async () => {
        await expect(new AutotagRSSFeed()['loadExistingContentItems']('source-1')).rejects.toThrow('Connection lost');
    });

    it('cloud storage: the stored items of a source', async () => {
        await expect(new AutotagCloudStorage()['loadExistingContentItems']('source-1')).rejects.toThrow('Connection lost');
    });

    it('website: the stored items of a page, so the page is not created as new', async () => {
        const params: ContentSourceParams = { contentSourceID: 'source-1', name: 'Site', ContentTypeID: 'ct', ContentFileTypeID: 'cft', ContentSourceTypeID: 'cst', URL: 'https://example.com' };

        await expect(new TestWebsite().Process('https://example.com/a', params)).rejects.toThrow('Connection lost');
        expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('entity: the existing Entity Record Documents and content items of a source', async () => {
        const autotag = new AutotagEntity();

        await expect(autotag['loadExistingERDs']('doc-1', 'entity-1')).rejects.toThrow('Connection lost');
        await expect(autotag['loadExistingContentItems']('source-1')).rejects.toThrow('Connection lost');
    });

    it('engine: the duplicate-pair check, so no pair is created', async () => {
        const item = new MJContentItemEntity(entityInfo('MJ: Content Items', ['Name', 'Checksum', 'ContentSourceID', 'Text']));
        item.Hydrate({ ID: 'item-A', Checksum: 'same-hash', ContentSourceID: 'source-1' });
        mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] }); // checksum match, then the failed pair check

        await new TestEngine().DetectChecksumDuplicates(item, contextUser);

        expect(mockGetEntityObjectFn).not.toHaveBeenCalledWith('MJ: Content Item Duplicates', contextUser);
        expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
    });

    it('engine: the existing-TaggedItem check, so no TaggedItem is created', async () => {
        const itemTag = new MJContentItemTagEntity(entityInfo('MJ: Content Item Tags', ['ItemID', 'Tag', 'Weight', 'TagID']));
        itemTag.Hydrate({ ID: 'cit-1', ItemID: 'item-A', Tag: 'AI', Weight: 0.9, TagID: null });
        mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-A', EntityRecordDocumentID: null, ContentSourceID: 'source-1' }] });

        await new TestEngine()['createTaggedItemFromContentItemTag'](itemTag, 'tag-1', contextUser);

        expect(mockGetEntityObjectFn).not.toHaveBeenCalledWith('MJ: Tagged Items', contextUser);
        expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
    });
});
