/**
 * ArtifactGraphIndexer: which artifacts are indexed is metadata (a push-only source's
 * `Configuration.Artifacts`); saves are debounced per artifact; the latest version is pushed, or
 * the item removed when the artifact or its text is gone; durable record-mention links are
 * reconciled directly from token IDs without any server-side name resolution.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { BaseEntity, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { MJEventType, type MJEvent } from '@memberjunction/global';
import { ArtifactGraphIndexer, ParseRecordLinkTokens } from '../ArtifactGraphIndexer.js';
import { ContentUploadIngestor } from '../ContentUploadIngestor.js';

const ARTIFACTS_ENTITY_ID = 'a0000000-0000-4000-8000-0000000000e1';
const ORDER_LINES_ENTITY_ID = 'a0000000-0000-4000-8000-0000000000e2';
const user = { ID: 'u0000000-0000-4000-8000-000000000001', Name: 'System', UserRoles: [] } as unknown as UserInfo;

interface ArtifactRow { ID: string; Name: string; Description: string | null; Type: string }
interface LinkRow { ID: string; SourceEntityID: string; SourceRecordID: string; TargetEntityID: string; TargetRecordID: string; LinkType: string; Metadata?: string }

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

function makeWorld() {
    const discountLink = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Discount Rules', { ID: 'art-2' });
    const compositeLink = ConversationUtility.CreateRecordLink('Order Lines', 'Order 42 Line 3', { OrderID: '42', LineNumber: 3 });
    const missingEntityLink = ConversationUtility.CreateRecordLink('No Such Entity', 'Missing', { ID: 'x-1' });
    const artifacts: ArtifactRow[] = [
        { ID: 'art-1', Name: 'Pricing Policy', Description: 'How we price', Type: 'Markdown Document' },
        { ID: 'art-2', Name: 'Discount Rules', Description: null, Type: 'Markdown Document' },
        { ID: 'art-3', Name: 'Budget', Description: null, Type: 'Excel Spreadsheet' },
        { ID: 'art-4', Name: 'Refunds', Description: null, Type: 'Markdown Document' },
    ];
    const versions: Record<string, string | null> = {
        'art-1': `# Pricing\nSee ${discountLink}, ${compositeLink}, and ${missingEntityLink}. Plain [[Refunds]] stays text.`,
        'art-2': 'Discounts.',
        'art-3': 'a,b,c',
        'art-4': '   ',
    };
    const links: LinkRow[] = [
        { ID: 'link-old', SourceEntityID: ARTIFACTS_ENTITY_ID, SourceRecordID: 'art-1', TargetEntityID: ARTIFACTS_ENTITY_ID, TargetRecordID: 'art-4', LinkType: 'LinksTo' },
    ];
    const created: LinkRow[] = [];
    const deleted: string[] = [];
    const artifactQueries: RunViewParams[] = [];
    const runView = async (params: RunViewParams) => {
        const filter = String(params.ExtraFilter ?? '');
        let rows: object[] = [];
        if (params.EntityName === 'MJ: Artifacts') {
            artifactQueries.push(params);
            const id = /\[ID\] = '([^']+)'/.exec(filter)?.[1];
            rows = id ? artifacts.filter((a) => a.ID === id) : [];
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
    const entities: Record<string, { ID: string; Name: string; PrimaryKeys: Array<{ Name: string }> }> = {
        'MJ: Artifacts': { ID: ARTIFACTS_ENTITY_ID, Name: 'MJ: Artifacts', PrimaryKeys: [{ Name: 'ID' }] },
        'Order Lines': { ID: ORDER_LINES_ENTITY_ID, Name: 'Order Lines', PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNumber' }] },
    };
    const provider = {
        EntityByName: (name: string) => entities[name],
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
    return { artifacts, versions, links, created, deleted, artifactQueries, provider };
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

describe('ParseRecordLinkTokens', () => {
    it('extracts record-mention tokens in order and ignores plain [[Name]] and non-record mentions', () => {
        const artToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-2' });
        const compToken = ConversationUtility.CreateRecordLink('Order Lines', 'Line 3', { OrderID: '42', LineNumber: 3 });
        const agentToken = ConversationUtility.CreateMention('agent', 'ag-1', 'Skip');
        const text = `See ${artToken}, [[Plain Wiki]], ${agentToken}, and ${compToken}.`;

        const tokens = ParseRecordLinkTokens(text);
        expect(tokens.map((t) => ({ EntityName: t.EntityName, Label: t.Label }))).toEqual([
            { EntityName: 'MJ: Artifacts', Label: 'Pricing Policy' },
            { EntityName: 'Order Lines', Label: 'Line 3' },
        ]);
    });

    it('ignores malformed JSON tokens without throwing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            expect(ParseRecordLinkTokens('Broken @{"_mode":"mention","type":"record",bad json} and @{unclosed')).toEqual([]);
        } finally {
            warn.mockRestore();
        }
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

    it('turns record-mention tokens (including composite keys) into LinksTo rows, removes stale links, skips unknown entities, and never queries MJ: Artifacts by name', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);

        expect(result.Links).toEqual({ Created: 2, Removed: 1, Skipped: ['No Such Entity'] });
        expect(w.deleted).toEqual(['link-old']);
        expect(w.created).toHaveLength(2);
        expect(w.created[0]).toMatchObject({
            SourceEntityID: ARTIFACTS_ENTITY_ID,
            SourceRecordID: 'art-1',
            TargetEntityID: ARTIFACTS_ENTITY_ID,
            TargetRecordID: 'art-2',
            LinkType: 'LinksTo',
        });
        expect(w.created[1]).toMatchObject({
            SourceEntityID: ARTIFACTS_ENTITY_ID,
            SourceRecordID: 'art-1',
            TargetEntityID: ORDER_LINES_ENTITY_ID,
            TargetRecordID: 'OrderID|42||LineNumber|3',
            LinkType: 'LinksTo',
        });
        // No name-lookup query ever runs against MJ: Artifacts — only the single ID lookup for art-1 itself.
        expect(w.artifactQueries).toHaveLength(1);
        expect(w.artifactQueries[0].ExtraFilter).toBe("[ID] = 'art-1'");
        expect(w.artifactQueries.every((q) => !String(q.ExtraFilter ?? '').toLowerCase().includes('name'))).toBe(true);
    });

    it('ignores malformed record tokens with missing PK fields and leaves plain [[Name]] unlinked', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        const missingPkToken = '@{"_mode":"mention","type":"record","entityName":"Order Lines","name":"Broken","OrderID":"42"}';
        const brokenJson = '@{"_mode":"mention","type":"record",not-json}';
        w.versions['art-1'] = `See [[Discount Rules]], ${missingPkToken}, and ${brokenJson}.`;
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const result = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
            expect(result.Links).toEqual({ Created: 0, Removed: 1, Skipped: ['Order Lines'] });
            expect(w.created).toHaveLength(0);
            expect(w.deleted).toEqual(['link-old']);
        } finally {
            warn.mockRestore();
        }
    });

    it('reconciles link removals when a token is removed from a subsequent save', async () => {
        mockEngine({ ArtifactTypes: ['Markdown Document'] });
        const w = makeWorld();
        const keepToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Refunds', { ID: 'art-4' });
        w.versions['art-1'] = `Keep ${keepToken}.`;
        vi.spyOn(ContentUploadIngestor, 'IngestText').mockResolvedValue({ ContentItemID: 'item-1', Unchanged: true, ReplacedContentItemID: null, EntityRecordDocumentID: 'erd-1' });

        // First index: existing link-old (to art-4) matches -> 0 created, 0 removed.
        const first = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(first.Links).toEqual({ Created: 0, Removed: 0, Skipped: [] });

        // Second index after removing the token -> link-old is removed.
        w.versions['art-1'] = 'No links anymore.';
        const second = await ArtifactGraphIndexer.Instance.IndexArtifact('art-1', w.provider, user);
        expect(second.Links).toEqual({ Created: 0, Removed: 1, Skipped: [] });
        expect(w.deleted).toEqual(['link-old']);
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
        expect(result.Links).toEqual({ Created: 0, Removed: 2, Skipped: [] });
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
