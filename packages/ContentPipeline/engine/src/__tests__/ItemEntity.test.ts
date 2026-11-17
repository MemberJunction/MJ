/**
 * @fileoverview Content Items as a product's IS-A extension of `MJ: Content Items`.
 *
 * Which entity a source's items are is configured (source, then source type, then content type, then the
 * default AI Configuration). The hydrator reads items as that entity so stages see its fields; the committer
 * creates and saves them as it, so a new item gets its extension row and an existing item missing one gets it
 * added; a driver's `Columns` may name the extension's fields. Written against stand-in rows and metadata.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { FatalStageError, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { BASE_ITEM_ENTITY, ItemEntityResolver, ResolvedItemEntity } from '../ItemEntityResolver.js';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import { RealItemEntityResolve } from './setup.js';

const EXTENSION = 'Product Content Items';
const CORE_FIELDS = ['ID', 'URL', 'Name', 'Text', 'ContentSourceID', 'Checksum', 'FieldConfidence', 'ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus', 'DeleteStatus', 'RetryCount', 'RetryAfter'];
const EXTENSION_FIELDS = [...CORE_FIELDS, 'Audience', 'Metadata'];

const entities: Record<string, { Name: string; ParentChain: { Name: string }[] }> = {
    [BASE_ITEM_ENTITY]: { Name: BASE_ITEM_ENTITY, ParentChain: [] },
    [EXTENSION]: { Name: EXTENSION, ParentChain: [{ Name: BASE_ITEM_ENTITY }] },
    'MJ: Users': { Name: 'MJ: Users', ParentChain: [] },
};

// ─── the resolver ─────────────────────────────────────────────────────────────────────────────────────

interface Settings {
    source?: string;
    sourceType?: string;
    contentType?: string;
    aiConfiguration?: string;
}

function stubMetadata(settings: Settings): void {
    const config = (ItemEntity?: string) => (ItemEntity ? { ItemEntity } : {});
    const knowledge = KnowledgeHubMetadataEngine.Instance;
    vi.spyOn(knowledge, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(knowledge, 'ContentSources', 'get').mockReturnValue([
        { ID: 'S1', ContentSourceTypeID: 'ST1', ContentTypeID: 'CT1', ConfigurationObject: config(settings.source) },
    ] as never);
    vi.spyOn(knowledge, 'ContentSourceTypes', 'get').mockReturnValue([{ ID: 'ST1', ConfigurationObject: config(settings.sourceType) }] as never);
    vi.spyOn(knowledge, 'ContentTypes', 'get').mockReturnValue([{ ID: 'CT1', ConfigurationObject: config(settings.contentType) }] as never);
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AIEngine.Instance, 'Configurations', 'get').mockReturnValue([{ ID: 'AC1', IsDefault: true, Status: 'Active' }] as never);
    vi.spyOn(AIEngine.Instance, 'ConfigurationParams', 'get').mockReturnValue(
        (settings.aiConfiguration ? [{ ConfigurationID: 'AC1', Name: 'ContentPipeline.ItemEntity', Value: settings.aiConfiguration }] : []) as never,
    );
}

function realResolver(): ItemEntityResolver {
    const resolver = new ItemEntityResolver({ EntityByName: (name: string) => entities[name] } as never, {} as never);
    resolver.Resolve = RealItemEntityResolve;
    return resolver;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('which entity a source\'s items are', () => {
    it('is the source\'s own setting first', async () => {
        stubMetadata({ source: EXTENSION, sourceType: BASE_ITEM_ENTITY, contentType: BASE_ITEM_ENTITY, aiConfiguration: BASE_ITEM_ENTITY });
        expect(await realResolver().Resolve('S1')).toEqual({ EntityName: EXTENSION, SetBy: 'Content Source', IsExtension: true });
    });

    it('is the source type\'s when the source names none', async () => {
        stubMetadata({ sourceType: EXTENSION, contentType: BASE_ITEM_ENTITY });
        expect((await realResolver().Resolve('S1')).SetBy).toBe('Content Source Type');
    });

    it('is the content type\'s when neither the source nor its type names one', async () => {
        stubMetadata({ contentType: EXTENSION, aiConfiguration: BASE_ITEM_ENTITY });
        expect((await realResolver().Resolve('S1')).SetBy).toBe('Content Type');
    });

    it('is the default AI Configuration\'s ContentPipeline.ItemEntity next: a product sets it once', async () => {
        stubMetadata({ aiConfiguration: EXTENSION });
        expect(await realResolver().Resolve('S1')).toEqual({ EntityName: EXTENSION, SetBy: 'AI Configuration', IsExtension: true });
    });

    it('is the system default for an item with no source', async () => {
        stubMetadata({ source: BASE_ITEM_ENTITY, aiConfiguration: EXTENSION });
        expect((await realResolver().Resolve(null)).EntityName).toBe(EXTENSION);
    });

    it('is plain MJ: Content Items when nothing is set', async () => {
        stubMetadata({});
        expect(await realResolver().Resolve('S1')).toEqual({ EntityName: BASE_ITEM_ENTITY, SetBy: 'Default', IsExtension: false });
    });

    it('fails the item, naming the setting, when the name is not an entity', async () => {
        stubMetadata({ source: 'Product Content Itms' });
        const resolving = realResolver().Resolve('S1');
        await expect(resolving).rejects.toBeInstanceOf(FatalStageError);
        await expect(realResolver().Resolve('S1')).rejects.toThrow(/'Product Content Itms' \(set on the Content Source\) is not an entity/);
    });

    it('fails the item when the entity is not an extension of MJ: Content Items', async () => {
        stubMetadata({ contentType: 'MJ: Users' });
        await expect(realResolver().Resolve('S1')).rejects.toThrow(/'MJ: Users' \(set on the Content Type\) is not an IS-A extension/);
    });
});

// ─── stand-in rows ────────────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** An entity object over a stored row, with only `fields` as columns. `link` sets what `ISAChild` returns. */
function entityObject(name: string, fields: string[], stored: Row | null, log: string[]) {
    let row: Row = stored ?? {};
    let isNew = false;
    const target: Row = {
        EntityInfo: { Name: name },
        Fields: fields.map((Name) => ({ Name })),
        ISAChild: null,
        LatestResult: null,
        InnerLoad: async () => {
            log.push(`load ${name}`);
            return stored !== null;
        },
        NewRecord: () => {
            isNew = true;
            row = {};
        },
        AttachToParent: async (key: { KeyValuePairs: { Value: string }[] }) => {
            log.push(`attach ${name} to ${key.KeyValuePairs[0].Value}`);
            row.ID = key.KeyValuePairs[0].Value;
            return true;
        },
        Save: async () => {
            log.push(`${isNew ? 'insert' : 'update'} ${name}: ${Object.keys(row).filter((k) => k !== 'ID').sort().join(',')}`);
            isNew = false;
            return true;
        },
    };
    const proxy = new Proxy(target, {
        get: (t, prop: string) => (prop in t ? t[prop] : row[prop]),
        set: (t, prop: string, value: unknown) => {
            if (prop in t) {
                t[prop] = value;
            } else {
                row[prop] = value;
            }
            return true;
        },
    });
    return { proxy, row: () => row };
}

/** A provider over one core row and, unless `missing`, its extension row. */
function providerOver(core: Row, extension: Row | null, opts: { linkChild?: boolean } = {}) {
    const log: string[] = [];
    const created: string[] = [];
    const provider = {
        GetEntityObject: async (name: string) => {
            created.push(name);
            if (name === EXTENSION) {
                return entityObject(EXTENSION, EXTENSION_FIELDS, extension, log).proxy;
            }
            const coreObject = entityObject(BASE_ITEM_ENTITY, CORE_FIELDS, core, log).proxy as unknown as Row;
            if (opts.linkChild && extension) {
                coreObject.ISAChild = entityObject(EXTENSION, EXTENSION_FIELDS, extension, log).proxy;
            }
            return coreObject;
        },
        RunView: async () => ({ Success: true, Results: [] }),
        EntityByName: (name: string) => entities[name],
    };
    return { provider, log, created };
}

function useExtension(answer: Partial<ResolvedItemEntity> = {}): void {
    vi.spyOn(ItemEntityResolver.prototype, 'Resolve').mockResolvedValue({ EntityName: EXTENSION, SetBy: 'AI Configuration', IsExtension: true, ...answer });
}

const coreRow = (): Row => ({ ID: 'I1', URL: 'https://x.test/a', Text: 'body', ContentSourceID: 'S1', ExtractionStatus: 'Complete' });

// ─── the hydrator ─────────────────────────────────────────────────────────────────────────────────────

describe('reading an item', () => {
    beforeEach(() => useExtension());

    it('reads it as its extension, using the row MJ already linked when it loaded the core row', async () => {
        const { provider, created } = providerOver(coreRow(), { ...coreRow(), Text: 'read through the extension' }, { linkChild: true });

        const record = await new WorkingRecordHydrator(provider as never, {} as never).Hydrate('Content Item', 'I1');

        expect(record.Get('Text')).toBe('read through the extension');
        expect(record.GetExtension('Pipeline', 'itemEntity')).toBe(EXTENSION);
        expect(created).toEqual([BASE_ITEM_ENTITY]); // no second load
    });

    it('loads it as its extension when MJ did not link one', async () => {
        const { provider, created } = providerOver(coreRow(), { ...coreRow(), Text: 'loaded as the extension' });

        const record = await new WorkingRecordHydrator(provider as never, {} as never).Hydrate('Content Item', 'I1');

        expect(record.Get('Text')).toBe('loaded as the extension');
        expect(created).toEqual([BASE_ITEM_ENTITY, EXTENSION]);
    });

    it('reads an item that has no extension row yet from its core row, and marks the entity for the committer', async () => {
        const { provider } = providerOver(coreRow(), null);

        const record = await new WorkingRecordHydrator(provider as never, {} as never).Hydrate('Content Item', 'I1');

        expect(record.Get('Text')).toBe('body');
        expect(record.GetExtension('Pipeline', 'itemEntity')).toBe(EXTENSION);
    });

    it('leaves a source with no extension as it was', async () => {
        useExtension({ EntityName: BASE_ITEM_ENTITY, IsExtension: false, SetBy: 'Default' });
        const { provider, created } = providerOver(coreRow(), { ...coreRow(), Text: 'not read' }, { linkChild: true });

        const record = await new WorkingRecordHydrator(provider as never, {} as never).Hydrate('Content Item', 'I1');

        expect(record.Get('Text')).toBe('body');
        expect(created).toEqual([BASE_ITEM_ENTITY]);
    });
});

// ─── the committer ────────────────────────────────────────────────────────────────────────────────────

describe('saving an item', () => {
    beforeEach(() => useExtension());

    it('creates a new item as its extension, so its save writes the extension row too', async () => {
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined as never);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue(
            { ID: 'S1', ContentTypeID: 'CT1', ContentSourceTypeID: 'ST1', ContentFileTypeID: 'FT1' } as never,
        );
        const { provider, log } = providerOver(coreRow(), null);
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/new'));
        child.SetExtension('Pipeline', 'customColumns', { Audience: 'Members' });

        await new WorkingRecordCommitter(provider as never, {} as never).CommitChild(child, { ContentSourceID: 'S1' }, 'ExtractionStatus', 'Pending');

        expect(log.at(-1)).toMatch(new RegExp(`^insert ${EXTENSION}: .*Audience`));
    });

    it('adds the extension row to an existing item that has none, and saves it in one call with its extension columns', async () => {
        const { provider, log } = providerOver(coreRow(), null);
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.SetExtension('Pipeline', 'itemEntity', EXTENSION);
        record.SetExtension('Pipeline', 'customColumns', { Audience: 'Staff' });

        await new WorkingRecordCommitter(provider as never, {} as never).Commit(record, 'TaggingStatus', 'Complete');

        expect(log).toEqual([
            `load ${EXTENSION}`,
            `attach ${EXTENSION} to I1`,
            expect.stringMatching(new RegExp(`^insert ${EXTENSION}: .*Audience.*TaggingStatus`)),
        ]);
    });

    it('accepts Columns that name an extension field, and still refuses framework-owned ones including RetryCount/RetryAfter/DiscoverState', async () => {
        const { provider } = providerOver(coreRow(), { ...coreRow(), Audience: null });
        const committer = new WorkingRecordCommitter(provider as never, {} as never);
        const record = (columns: Row) => {
            const r = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
            r.SetExtension('Pipeline', 'itemEntity', EXTENSION);
            r.SetExtension('Pipeline', 'customColumns', columns);
            return r;
        };

        await expect(committer.Commit(record({ Audience: 'Members' }), 'TaggingStatus', 'Complete')).resolves.toBeTruthy();
        for (const owned of ['EmbeddingStatus', 'RetryCount', 'RetryAfter', 'DiscoverState']) {
            await expect(committer.Commit(record({ [owned]: 'x' }), 'TaggingStatus', 'Complete')).rejects.toThrow(
                `Column '${owned}' on ${EXTENSION} is owned by the pipeline framework`,
            );
        }
        await expect(committer.Commit(record({ Nope: 1 }), 'TaggingStatus', 'Complete')).rejects.toThrow(`Column 'Nope' does not exist on ${EXTENSION}`);
    });

    it('refuses an extension field on a source whose items are plain', async () => {
        useExtension({ EntityName: BASE_ITEM_ENTITY, IsExtension: false, SetBy: 'Default' });
        const { provider } = providerOver(coreRow(), null);
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.SetExtension('Pipeline', 'customColumns', { Audience: 'Members' });

        await expect(new WorkingRecordCommitter(provider as never, {} as never).Commit(record, 'TaggingStatus', 'Complete')).rejects.toThrow(
            `Column 'Audience' does not exist on ${BASE_ITEM_ENTITY}`,
        );
    });

    it('resolves a record once: the entity rides on the record', async () => {
        const resolve = vi.spyOn(ItemEntityResolver.prototype, 'Resolve');
        const { provider } = providerOver(coreRow(), { ...coreRow() });
        const committer = new WorkingRecordCommitter(provider as never, {} as never);
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.SetExtension('Pipeline', 'contentSourceID', 'S1');

        await committer.Commit(record, 'TaggingStatus', 'Complete');
        await committer.Commit(record, 'SegmentationStatus', 'Complete');

        expect(resolve).toHaveBeenCalledTimes(1);
        expect(record.GetExtension('Pipeline', 'itemEntity')).toBe(EXTENSION);
    });
});
