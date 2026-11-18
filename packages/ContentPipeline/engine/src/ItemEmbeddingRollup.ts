/**
 * @fileoverview {@link ItemEmbeddingRollup} — an item's `EmbeddingStatus` from its chunks.
 *
 * Embed runs over chunks, so a chunk records that it was embedded and the item it belongs to does not:
 * Extract sets the item's `EmbeddingStatus` to Pending and nothing else would ever move it. Anything that
 * asks "is this document embedded?" reads the item, so once an item's chunks have all settled the item
 * takes their verdict here. The pipeline calls it after each Embed page, and the Settle Item Embedding
 * stage calls it for an item a page missed (a process stopped between committing the chunks and rolling up).
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { WhereAnyOf, WhereEqual } from './Filters.js';

/** What an item's embedding comes to once its chunks have settled. */
export type ItemEmbeddingStatus = 'Complete' | 'Failed' | 'Skipped';

/** A chunk in one of these still has embedding work ahead of it. `null` is a chunk no stage has reached. */
const UNSETTLED: ReadonlySet<string | null> = new Set([null, 'Pending', 'MetadataOnly', 'Processing']);

/**
 * The item's status from its live chunks' `EmbeddingStatus`, or `null` to leave the item alone.
 *
 * - no chunks: `null`. Segment's own result settles an item it cut into nothing (see the committer).
 * - any chunk still to embed: `null`. The page that embeds the last one settles the item.
 * - any chunk Failed: `Failed`. Part of the document is missing from the index.
 * - every chunk Skipped: `Skipped`. Nothing of the document was embedded.
 * - otherwise: `Complete`. Skipped chunks among embedded ones held nothing to embed.
 */
export function RollUpItemEmbedding(chunkStatuses: readonly (string | null | undefined)[]): ItemEmbeddingStatus | null {
    if (chunkStatuses.length === 0) {
        return null;
    }
    const statuses = chunkStatuses.map((s) => s ?? null);
    if (statuses.some((s) => UNSETTLED.has(s))) {
        return null;
    }
    if (statuses.includes('Failed')) {
        return 'Failed';
    }
    return statuses.every((s) => s === 'Skipped') ? 'Skipped' : 'Complete';
}

/** One item's outcome from {@link ItemEmbeddingRollup.Settle}. */
export interface SettledItem {
    ItemID: string;
    /** The status the chunks come to, or `null` when they have not all settled. */
    Status: ItemEmbeddingStatus | null;
    /** Whether the item's row was written (false when it already said so, or was left alone). */
    Written: boolean;
}

interface ChunkRow {
    ContentItemID: string;
    EmbeddingStatus: string | null;
}

/** Reads chunks and writes items through the standard entity path. Build one per use. */
export class ItemEmbeddingRollup {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /** Settle the items that own these chunks. */
    public async SettleItemsOfChunks(chunkIDs: readonly string[]): Promise<SettledItem[]> {
        if (chunkIDs.length === 0) {
            return [];
        }
        const owners = await this.query<{ ContentItemID: string }>('MJ: Content Item Chunks', `(${WhereAnyOf('ID', chunkIDs)})`, ['ContentItemID']);
        return owners ? this.Settle(owners.map((o) => o.ContentItemID)) : [];
    }

    /**
     * Settle each item from its live chunks (chunks marked for deletion belong to an earlier cut and do not
     * count). Reads the chunks as they are now, so whichever of two pages over one item's chunks commits last
     * sees them all settled and settles the item.
     *
     * @param write - false to report what each item would become without writing it (a test run).
     */
    public async Settle(itemIDs: readonly string[], write = true): Promise<SettledItem[]> {
        const ids = unique(itemIDs);
        if (ids.length === 0) {
            return [];
        }
        const chunks = await this.query<ChunkRow>(
            'MJ: Content Item Chunks',
            `(${WhereAnyOf('ContentItemID', ids)}) AND ${WhereEqual({ DeleteStatus: null })}`,
            ['ContentItemID', 'EmbeddingStatus'],
        );
        if (!chunks) {
            return [];
        }
        const byItem = new Map<string, (string | null)[]>(ids.map((id) => [NormalizeUUID(id), []]));
        for (const chunk of chunks) {
            byItem.get(NormalizeUUID(chunk.ContentItemID))?.push(chunk.EmbeddingStatus);
        }
        const settled: SettledItem[] = [];
        for (const id of ids) {
            const status = RollUpItemEmbedding(byItem.get(NormalizeUUID(id)) ?? []);
            const written = status !== null && write ? await this.writeItem(id, status) : false;
            settled.push({ ItemID: id, Status: status, Written: written });
        }
        return settled;
    }

    /**
     * Write the item's status, unless it already says so or the item has moved on: Segment is due to cut it
     * again (new chunks are on their way, and their own page settles it), or it is being deleted.
     */
    private async writeItem(itemID: string, status: ItemEmbeddingStatus): Promise<boolean> {
        const item = await this.provider.GetEntityObject<BaseEntity>('MJ: Content Items', this.contextUser);
        if (!(await item.InnerLoad(CompositeKey.FromID(itemID)))) { // first-pk-ok: MJ core content entity, single-column ID
            return false;
        }
        const row = item as unknown as Record<string, unknown>;
        if (row.SegmentationStatus === 'Pending' || row.DeleteStatus != null || row.EmbeddingStatus === status) {
            return false;
        }
        row.EmbeddingStatus = status;
        if (status === 'Complete') {
            row.LastEmbeddedAt = new Date();
        }
        if (!(await item.Save())) {
            LogError(`ItemEmbeddingRollup: could not set item '${itemID}' to ${status}: ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return false;
        }
        return true;
    }

    /** A fresh read (never the cache: the rows were just written), or `null` after logging a failure. */
    private async query<T>(entityName: string, extraFilter: string, fields: string[]): Promise<T[] | null> {
        const result = await RunView.FromMetadataProvider(this.provider).RunView<T>(
            { EntityName: entityName, ExtraFilter: extraFilter, Fields: fields, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true },
            this.contextUser,
        );
        if (!result.Success) {
            LogError(`ItemEmbeddingRollup: could not read ${entityName}: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }
}

function unique(ids: readonly string[]): string[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const key = NormalizeUUID(id);
        if (!id || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
