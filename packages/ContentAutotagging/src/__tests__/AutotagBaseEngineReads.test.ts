/**
 * Engine reads whose failure must not be taken as an empty answer: a failed read of the stored rows is "unknown", so
 * the engine neither creates a row it cannot prove absent (a duplicate pair, a TaggedItem) nor proceeds as if there
 * were nothing (no tags, no source params, no item). Each failure is reported. Real entity objects; only the data
 * layer, the tag engine and the engine's heavy dependencies are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewFn, mockGetEntityObjectFn } = vi.hoisted(() => ({
  mockRunViewFn: vi.fn(),
  mockGetEntityObjectFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockRunView {
    RunView = mockRunViewFn;
    static FromMetadataProvider(): MockRunView { return new MockRunView(); }
  }
  return { ...actual, RunView: MockRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {}, AIEmbeddingRunner: class {} }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn() } } }));
vi.mock('@memberjunction/tag-engine', () => ({
  TagEngine: { Instance: { Config: vi.fn(), Tags: [], GetTaxonomyTree: vi.fn().mockReturnValue([]), ResolveTag: vi.fn() } },
}));
vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('officeparser', () => ({ default: { parseOffice: vi.fn() } }));
vi.mock('@memberjunction/network-utils', () => ({ HttpGet: vi.fn(), HttpHead: vi.fn() }));

import { EntityInfo, LogError, UserInfo } from '@memberjunction/core';
import { MJContentItemEntity, MJContentItemTagEntity, MJContentSourceEntity, MJTagEntity } from '@memberjunction/core-entities';
import { TagEngine } from '@memberjunction/tag-engine';
import { AutotagBaseEngine } from '../Engine/generic/AutotagBaseEngine';

const mockContextUser = new UserInfo();

/** A content item with the given fields. */
function contentItem(values: Record<string, unknown>): MJContentItemEntity {
  const item = new MJContentItemEntity(entityInfo('MJ: Content Items', ['Name', 'Checksum', 'ContentSourceID', 'Text']));
  item.Hydrate(values);
  return item;
}

/** Entity metadata keyed by ID, with the given fields. */
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

/** The engine, with a public constructor and its protected reads exposed. */
class ReadingEngine extends AutotagBaseEngine {
  public constructor() {
    super();
  }
  public Different(itemID: string, sourceID: string, user: UserInfo): Promise<boolean> {
    return this.IsFromDifferentSource(itemID, sourceID, user);
  }
  public Tags(items: MJContentItemEntity[], user: UserInfo): Promise<Map<string, string[]>> {
    return this.LoadTagsForItems(items, user);
  }
}

describe('engine reads that fail', () => {
  const failed = { Success: false, Results: [], ErrorMessage: 'Connection lost' };
  let engine: ReadingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntityObjectFn.mockResolvedValue({ NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) });
    engine = new ReadingEngine();
    Object.defineProperty(engine, 'ProviderToUse', {
      get() {
        return { GetEntityObject: mockGetEntityObjectFn, EntityByName: () => ({ ID: 'entity-content-items' }) };
      },
      configurable: true,
    });
    mockRunViewFn.mockResolvedValue(failed);
  });

  it('does not create a duplicate pair when the pair-existence check cannot be read', async () => {
    mockRunViewFn
      .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] }) // checksum match
      .mockResolvedValueOnce(failed);                                       // pair-existence check

    await engine.DetectChecksumDuplicates(contentItem({ ID: 'item-A', Checksum: 'same-hash', ContentSourceID: 'source-1' }), mockContextUser);

    expect(mockGetEntityObjectFn).not.toHaveBeenCalledWith('MJ: Content Item Duplicates', mockContextUser);
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
  });

  it('does not answer "same source" when the matched item cannot be read', async () => {
    await expect(engine.Different('item-B', 'source-1', mockContextUser)).rejects.toThrow('Connection lost');
  });

  it('does not return "no tags" when the tags cannot be read', async () => {
    await expect(engine.Tags([contentItem({ ID: 'item-A' })], mockContextUser)).rejects.toThrow('Connection lost');
  });

  it('does not fall back to default params when the source params cannot be read', async () => {
    const source = new MJContentSourceEntity(entityInfo('MJ: Content Sources', ['Name']));
    source.Hydrate({ ID: 'source-1', Name: 'Feed' });

    await expect(engine.GetContentSourceParams(source, mockContextUser)).rejects.toThrow('Connection lost');
  });

  it('reports a failed read of a content item by URL as a failed read, not as "not found"', async () => {
    const params = { contentSourceID: 'source-1', name: 'Feed', ContentTypeID: 'ct', ContentFileTypeID: 'cft', ContentSourceTypeID: 'cst', URL: 'https://example.com/a' };

    await expect(engine.GetContentItemIDFromURL(params, mockContextUser)).rejects.toThrow(/could not read.*Connection lost/);
  });

  it('does not create a TaggedItem when the existing-TaggedItem check cannot be read', async () => {
    const formalTag = new MJTagEntity(entityInfo('MJ: Tags', ['Name']));
    formalTag.Hydrate({ ID: 'tag-1', Name: 'AI' });
    vi.mocked(TagEngine.Instance.ResolveTag).mockResolvedValue(formalTag);
    const itemTag = new MJContentItemTagEntity(entityInfo('MJ: Content Item Tags', ['ItemID', 'Tag', 'Weight', 'TagID']));
    itemTag.Hydrate({ ID: 'cit-1', ItemID: 'item-A', Tag: 'AI', Weight: 0.9, TagID: null });
    vi.spyOn(itemTag, 'Save').mockResolvedValue(true);
    mockRunViewFn
      .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-A', EntityRecordDocumentID: null, ContentSourceID: 'source-1' }] })
      .mockResolvedValueOnce(failed); // existing TaggedItem check
    await engine.InitializeTaxonomyBridge(mockContextUser);

    await engine.OnContentItemTagSaved?.(itemTag, null, mockContextUser);

    expect(mockGetEntityObjectFn).not.toHaveBeenCalledWith('MJ: Tagged Items', mockContextUser);
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
  });

  it('does not create a TaggedItem when the content item cannot be read, and reports it', async () => {
    const formalTag = new MJTagEntity(entityInfo('MJ: Tags', ['Name']));
    formalTag.Hydrate({ ID: 'tag-1', Name: 'AI' });
    vi.mocked(TagEngine.Instance.ResolveTag).mockResolvedValue(formalTag);
    const itemTag = new MJContentItemTagEntity(entityInfo('MJ: Content Item Tags', ['ItemID', 'Tag', 'Weight', 'TagID']));
    itemTag.Hydrate({ ID: 'cit-1', ItemID: 'item-A', Tag: 'AI', Weight: 0.9, TagID: null });
    vi.spyOn(itemTag, 'Save').mockResolvedValue(true);
    await engine.InitializeTaxonomyBridge(mockContextUser);

    await engine.OnContentItemTagSaved?.(itemTag, null, mockContextUser);

    expect(mockGetEntityObjectFn).not.toHaveBeenCalledWith('MJ: Tagged Items', mockContextUser);
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
  });
});
