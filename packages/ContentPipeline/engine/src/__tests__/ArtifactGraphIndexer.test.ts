/**
 * ArtifactGraphIndexer: which artifacts are indexed is metadata (a push-only source's
 * `Configuration.Artifacts`); saves are debounced per artifact; the latest version is pushed, or
 * the item removed when the artifact or its text is gone; `[[Name]]` links are reconciled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { MJEventType, type MJEvent } from '@memberjunction/global';
import { ArtifactGraphIndexer, ParseArtifactLinks } from '../ArtifactGraphIndexer.js';
import { ContentUploadIngestor } from '../ContentUploadIngestor.js';

const ARTIFACTS_ENTITY_ID = 'a0000000-0000-4000-8000-0000000000e1';
const user = { ID: 'u0000000-0000-4000-8000-000000000001', Name: 'System', UserRoles: [] } as unknown as UserInfo;
const owner = { ID: 'owner', Name: 'Owner', UserRoles: [] } as unknown as UserInfo;

/** `ReadableBy` stands in for the artifact read hooks: when set, only those user IDs see the row. */
interface ArtifactRow { ID: string; Name: string; Description: string | null; Type: string; EnvironmentID: string; UserID: string; ReadableBy?: string[] }
interface LinkRow { ID: string; SourceEntityID: string; SourceRecordID: string; TargetEntityID: string; TargetRecordID: string; LinkType: string }

function sources(config: Record<string, unknown> | null) {
    return [
        { ID: 'SRC-DOCS', ConfigurationObject: config ? { Artifacts: config } : null },
        { ID: 'SRC-PLAIN', ConfigurationObject: { GraphOverlay: { Enabled: true } } },
    ];
}

function mockEngine(config: Record<string, unknown> | null): void {
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'ContentSources', 'get').mockReturnValue(sources(config) as never);
}

/** `ownerUser` is what the user cache returns for the artifact's owner; `null` means the cache does not hold them. */
function makeWorld(ownerUser: UserInfo | null = owner) {
    vi.spyOn(ArtifactGraphIndexer.Instance as unknown as { ResolveOwner: (id: string) => Promise<UserInfo | null> }, 'ResolveOwner').mockResolvedValue(ownerUser);
    const artifacts: ArtifactRow[] = [
        { ID: 'art-1', Name: 'Pricing Policy', Description: 'How we price', Type: 'Markdown Document', EnvironmentID: 'env', UserID: 'owner' },
        { ID: 'art-2', Name: 'Discount Rules', Description: null, Type: 'Markdown Document', EnvironmentID: 'env', UserID: 'owner' },
        { ID: 'art-3', Name: 'Budget', Description: null, Type: 'Excel Spreadsheet', EnvironmentID: 'env', UserID: 'owner' },
        { ID: 'art-4', Name: 'Refunds', Description: null, Type: 'Markdown Document', EnvironmentID: 'env', UserID: 'owner' },
    ];
    const versions: Record<string, string | null> = {
        'art-1': '# Pricing\nSee [[Discount Rules]] and [[discount rules|again]] and [[Missing Doc]].',
        'art-2': 'Discounts.',
        'art-3': 'a,b,c',
        'art-4': '   ',
    };
    const links: LinkRow[] = [
        { ID: 'link-old', SourceEntityID: ARTIFACTS_ENTITY_ID, SourceRecordID: 'art-1', TargetEntityID: ARTIFACTS_ENTITY_ID, TargetRecordID: 'art-4', LinkType: 'LinksTo' },
    ];
    const created: LinkRow[] = [];
    const deleted: string[] = [];
    const nameReaders: string[] = [];
    const runView = async (params: RunViewParams, reader?: UserInfo) => {
        const filter = String(params.ExtraFilter ?? '');
        let rows: object[] = [];
        if (params.EntityName === 'MJ: Artifacts') {
            const id = /\[ID\] = '([^']+)'/.exec(filter)?.[1];
            // Like a case-sensitive collation: `[Name] IN` matches exactly, `LOWER([Name]) IN` ignores case.
            const lowered = filter.includes('LOWER([Name]) IN');
            const names = Array.from(/\[Name\]\)? IN \(([^)]*)\)/.exec(filter)?.[1].matchAll(/'([^']*)'/g) ?? []).map((m) => m[1]);
            if (!id) {
                nameReaders.push(reader?.ID ?? '');
            }
            rows = artifacts
                .filter((a) => (id ? a.ID === id : names.includes(lowered ? a.Name.toLowerCase() : a.Name)))
                .filter((a) => !a.ReadableBy || a.ReadableBy.includes(reader?.ID ?? ''));
        } else if (params.EntityName === 'MJ: Artifact Versions') {
            const id = /\[ArtifactID\] = '([^']+)'/.exec(filter)?.[1] ?? '';
            rows = id in versions ? [{ ID: `${id}-v1`, Content: versions[id], VersionNumber: 1 }] : [];
        } else if (params.EntityName === 'MJ: Record Links') {
            const src = /\[SourceRecordID\] = '([^']+)'/.exec(filter)?.[1];
            const tgt = /\[TargetRecordID\] = '([^']+)'/.exec(filter)?.[1];
            rows = links
                .filter((l) => (l.SourceRecordID === src || (tgt !== undefined && l.TargetRecordID === tgt)) && l.LinkType === 'LinksTo')
                .map((l) => ({ ...l, LatestResult: { CompleteMessage: '' }, Delete: async () => (deleted.push(l.ID), links.splice(links.indexOf(l), 1), true) }));
        }
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    };
    const provider = {
        EntityByName: (name: string) => (name === 'MJ: Artifacts' ? { ID: ARTIFACTS_ENTITY_ID, Name: name } : undefined),
        GetEntityObject: async () => {
            const row: Partial<LinkRow> & { Sequence?: number; Metadata?: string } = {};
            return Object.assign(row, {
                NewRecord: () => true,
                LatestResult: { CompleteMessage: '' },
                Save: async () => (created.push(row as LinkRow), true),
            });
        },
        RunView: runView,
        RunViews: async (list: RunViewParams[]) => Promise.all(list.map((p) => runView(p))),
    } as unknown as IMetadataProvider;
    return { artifacts, versions, links, created, deleted, nameReaders, provider };
}

function saveEvent(entityName: string, fields: Record<string, string>, type: 'save' | 'delete' = 'save'): MJEvent {
    const baseEntity = { EntityInfo: { Name: entityName }, ProviderToUse: null, ...fields };
    return {
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: { type, baseEntity, payload: null },
        component: null as never,
    } as MJEvent;
}

describe('ParseArtifactLinks', () => {
    it('reads [[Name]] and [[Name|label]] once each, case-insensitively, in order', () => {
        expect(ParseArtifactLinks('[[A Doc]] text [[b|label]] [[a doc]] [[ ]] [not a link] [[C]]')).toEqual(['A Doc', 'b', 'C']);
    });

    it('ignores links spanning lines or nested brackets', () => {
        expect(ParseArtifactLinks('[[line\nbreak]] [[a[b]]')).toEqual([]);
    });
});

describe('ArtifactGraphIndexer.IndexArtifact', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('pushes the latest version into each source configured for the type, linked to the artifact', async () => {
        mockEngine({ ArtifactTypes: ['markdown document'] });
        const w = makeWorld();
        const ingest = vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: false, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(ingest).toHaveBeenCalledTimes(1);
        expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
            ContentSourceID: 'SRC-DOCS',
            Origin: { EntityName: 'MJ: Artifacts', RecordID: 'art-1' },
            Name: 'Pricing Policy',
            Description: 'How we price',
            Text: w.versions['art-1'],
            RunNow: true,
            ContextUser: user,
        }));
        expect(result.Outcomes).toEqual([{ ContentSourceID: 'SRC-DOCS', Status: 'Indexed', ContentItemID: 'item-1' }]);
    });

    it('reconciles [[...]] links: creates the resolved ones, removes the ones no longer in the text, reports the unresolved', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(result.Links).toEqual({ Created: 1, Removed: 1, Unresolved: ['Missing Doc'] });
        expect(w.deleted).toEqual(['link-old']);
        expect(w.created).toHaveLength(1);
        expect(w.created[0]).toMatchObject({ SourceRecordID: 'art-1', TargetRecordID: 'art-2', LinkType: 'LinksTo', SourceEntityID: ARTIFACTS_ENTITY_ID, TargetEntityID: ARTIFACTS_ENTITY_ID });
    });

    it('resolves [[...]] targets as the owner, so an artifact the owner cannot open is never linked', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        // Readable by the indexing (system) user, but not by the owner of the linking document.
        w.artifacts[1].ReadableBy = [user.ID];
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(w.nameReaders).toEqual(['owner']);
        expect(result.Links).toEqual({ Created: 0, Removed: 1, Unresolved: ['Discount Rules', 'Missing Doc'] });
        expect(w.created).toHaveLength(0);
    });

    it('leaves the links alone when the owner is not in the user cache', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld(null);
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(result.Links).toBeNull();
        expect(w.deleted).toEqual([]);
        expect(w.created).toHaveLength(0);
        expect(w.nameReaders).toEqual([]);
    });

    it('matches names case-insensitively even on a case-sensitive collation', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        w.versions['art-1'] = 'See [[discount RULES]].';
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(result.Links?.Unresolved).toEqual([]);
        expect(w.created.map((l) => l.TargetRecordID)).toEqual(['art-2']);
    });

    it('deletes the links to and from a deleted artifact, and no others', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        w.links.push(
            { ID: 'link-out', SourceEntityID: ARTIFACTS_ENTITY_ID, SourceRecordID: 'art-gone', TargetEntityID: ARTIFACTS_ENTITY_ID, TargetRecordID: 'art-2', LinkType: 'LinksTo' },
            { ID: 'link-in', SourceEntityID: ARTIFACTS_ENTITY_ID, SourceRecordID: 'art-2', TargetEntityID: ARTIFACTS_ENTITY_ID, TargetRecordID: 'art-gone', LinkType: 'LinksTo' },
        );
        vi.spyOn(ContentUploadIngestor, 'RemoveText').mockResolvedValue(null);
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-gone', w.provider, user);
        expect(result.Links).toEqual({ Created: 0, Removed: 2, Unresolved: [] });
        expect(w.deleted.sort()).toEqual(['link-in', 'link-out']);
        expect(w.links.map((l) => l.ID)).toEqual(['link-old']);
    });

    it('removes the item when the artifact is gone, its text is empty, or its type is not configured', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        const ingest = vi.spyOn(ContentUploadIngestor, 'IngestText');
        const remove = vi.spyOn(ContentUploadIngestor, 'RemoveText').mockResolvedValue({ ContentItemIDs: ['x'], DependentsMarked: 0 });
        for (const id of ['art-missing', 'art-4', 'art-3']) {
            const result = await ArtifactGraphIndexer.Instance.IndexArtifact(id, w.provider, user);
            expect(result.Outcomes).toEqual([{ ContentSourceID: 'SRC-DOCS', Status: 'Removed' }]);
        }
        expect(ingest).not.toHaveBeenCalled();
        expect(remove).toHaveBeenCalledTimes(3);
        expect(remove).toHaveBeenCalledWith(expect.objectContaining({ ContentSourceID: 'SRC-DOCS', Origin: { EntityName: 'MJ: Artifacts', RecordID: 'art-missing' }, RunNow: true }));
    });

    it('does nothing when no source indexes artifacts, or the only one is disabled', async () => {
        for (const config of [null, { ArtifactTypes: ['Markdown Document'], Enabled: false }, { ArtifactTypes: [] }]) {
            vi.restoreAllMocks();
            mockEngine(config);
            const w = makeWorld();
            const ingest = vi.spyOn(ContentUploadIngestor, 'IngestText');
            const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
            expect(result).toEqual({ ArtifactID: 'art-1', Outcomes: [], Links: null });
            expect(ingest).not.toHaveBeenCalled();
        }
    });

    it('reports a failed push without throwing, so other sources still run', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockRejectedValue(new Error('source is not push-only'));
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-2', w.provider, user);
        expect(result.Outcomes).toEqual([{ ContentSourceID: 'SRC-DOCS', Status: 'Failed', Message: 'source is not push-only' }]);
    });
});

describe('ArtifactGraphIndexer.HandleEvent', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.useFakeTimers();
    });
    afterEach(() => {
        ArtifactGraphIndexer.Instance.Stop();
        vi.useRealTimers();
    });

    it('debounces saves per artifact and indexes once after the quiet period', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'], DebounceMs: 5000 });
        const index = vi.spyOn(ArtifactGraphIndexer.Instance, 'IndexArtifact').mockResolvedValue({ ArtifactID: 'art-1', Outcomes: [], Links: null });
        const indexer = ArtifactGraphIndexer.Instance;
        indexer.HandleEvent(saveEvent('MJ: Artifact Versions', { ArtifactID: 'art-1' }));
        await vi.advanceTimersByTimeAsync(3000);
        indexer.HandleEvent(saveEvent('MJ: Artifact Versions', { ArtifactID: 'art-1' }));
        await vi.advanceTimersByTimeAsync(4999);
        expect(index).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(index).toHaveBeenCalledTimes(1);
        expect(index.mock.calls[0][0]).toBe('art-1');
    });

    it('schedules a deleted artifact, and ignores other entities, loads and configurations with no artifact source', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'], DebounceMs: 10 });
        const index = vi.spyOn(ArtifactGraphIndexer.Instance, 'IndexArtifact').mockResolvedValue({ ArtifactID: 'x', Outcomes: [], Links: null });
        const indexer = ArtifactGraphIndexer.Instance;
        indexer.HandleEvent(saveEvent('MJ: Artifacts', { ID: 'art-9' }, 'delete'));
        indexer.HandleEvent(saveEvent('MJ: Conversations', { ID: 'conv-1' }));
        await vi.advanceTimersByTimeAsync(20);
        expect(index.mock.calls.map((c) => c[0])).toEqual(['art-9']);

        vi.restoreAllMocks();
        mockEngine(null);
        const none = vi.spyOn(ArtifactGraphIndexer.Instance, 'IndexArtifact');
        indexer.HandleEvent(saveEvent('MJ: Artifact Versions', { ArtifactID: 'art-1' }));
        await vi.advanceTimersByTimeAsync(20_000);
        expect(none).not.toHaveBeenCalled();
    });

    it('runs a save that arrives mid-index once more after the running index finishes', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'], DebounceMs: 10 });
        let release: () => void = () => undefined;
        const index = vi
            .spyOn(ArtifactGraphIndexer.Instance, 'IndexArtifact')
            .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ ArtifactID: 'art-1', Outcomes: [], Links: null }))))
            .mockResolvedValue({ ArtifactID: 'art-1', Outcomes: [], Links: null });
        const indexer = ArtifactGraphIndexer.Instance;
        indexer.HandleEvent(saveEvent('MJ: Artifact Versions', { ArtifactID: 'art-1' }));
        await vi.advanceTimersByTimeAsync(10);
        indexer.HandleEvent(saveEvent('MJ: Artifact Versions', { ArtifactID: 'art-1' }));
        await vi.advanceTimersByTimeAsync(10);
        expect(index).toHaveBeenCalledTimes(1);
        release();
        await vi.advanceTimersByTimeAsync(1);
        expect(index).toHaveBeenCalledTimes(2);
    });
});
