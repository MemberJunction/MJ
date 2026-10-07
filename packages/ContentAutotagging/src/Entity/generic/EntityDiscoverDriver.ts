/**
 * @fileoverview The entity-records walk, as a Discover driver.
 *
 * An Entity content source treats the rows of some MJ entity as content. The walk is therefore a
 * paged read of that entity, one discovered item per row.
 *
 * It differs from {@link AutotagEntity} in what it filters on. The autotagger asks for rows modified
 * since the last run, which makes correctness depend on a run-date watermark surviving every failure
 * and restart. This yields every row and reports `__mj_UpdatedAt` as the checksum, so the pipeline's
 * own change detection decides what is new — a row that has not moved is a no-op whether or not a
 * watermark was recorded, and a run that dies halfway leaves nothing to reconcile.
 *
 * Rendering a row into text through its EntityDocument template stays with Extract, which is the
 * stage that produces text.
 *
 * @module @memberjunction/content-autotagging
 */

import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, RunView } from '@memberjunction/core';
import { BaseDiscoverDriver, DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';

/** How many rows to read per round trip. */
const PageSize = 500;

/** Registered under the name `ContentSourceType.DriverClass` already carries for this source type. */
@RegisterClass(BaseDiscoverDriver, 'AutotagEntity')
export class EntityDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'AutotagEntity';

    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        const entityID = request.Parameters.EntityID ?? (request.Configuration.EntityID as string | undefined);
        if (!entityID) {
            throw new Error('This Entity source names no entity. Set EntityID on the Content Source.');
        }
        const entityInfo = request.Provider.EntityByID(entityID);
        if (!entityInfo) {
            throw new Error(`Entity '${entityID}' is not in metadata`);
        }

        const rv = RunView.FromMetadataProvider(request.Provider);
        let page = 0;
        for (;;) {
            if (request.Signal.aborted) {
                return;
            }
            const result = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: entityInfo.Name,
                    ResultType: 'simple',
                    StartRow: page * PageSize,
                    MaxRows: PageSize,
                },
                request.ContextUser,
            );
            if (!result.Success) {
                throw new Error(`Could not read '${entityInfo.Name}': ${result.ErrorMessage ?? 'unknown error'}`);
            }
            for (const record of result.Results) {
                if (request.Signal.aborted) {
                    return;
                }
                // Identity for ANY key shape — the bare value for a single-column key, the compact
                // composite form otherwise. Never the first column alone.
                const recordID = CompositeKey.FromEntityRecord(entityInfo, record).ToCompactURLSegment();
                const updatedAt = record.__mj_UpdatedAt;
                yield {
                    URL: recordID,
                    Checksum: updatedAt instanceof Date ? String(updatedAt.getTime()) : (updatedAt as string | undefined),
                    Extensions: { EntityID: entityID, EntityName: entityInfo.Name, Record: record },
                };
            }
            if (result.Results.length < PageSize) {
                return;
            }
            page++;
            request.ReportProgress(`read ${page * PageSize} record(s)`);
        }
    }
}
