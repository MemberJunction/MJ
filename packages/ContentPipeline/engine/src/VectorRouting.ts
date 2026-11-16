/**
 * @fileoverview Where each record's vector lives. Embed and Delete route through here, so a delete
 * reaches the index and namespace the write used. Resolution itself is the autotagger's
 * {@link ContentVectorInfrastructure}.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { ContentVectorInfrastructure, ResolvedVectorInfrastructure } from '@memberjunction/content-autotagging';
import { WorkingRecord } from '@memberjunction/content-pipeline-base';
import { WhereAnyOf } from './Filters.js';

/** Where one record's vector lives. */
export interface VectorRoute {
    /** `<embeddingModelID>|<vectorIndexID>`: records sharing it share one embed call and one store call. */
    GroupKey: string;
    Infrastructure: ResolvedVectorInfrastructure;
    /** Per-record provider routing (a namespace), or undefined when the index needs none. */
    Directives: Record<string, unknown> | undefined;
    /** The Content Item the vector belongs to: the record itself, or a chunk's parent. */
    Item: MJContentItemEntity;
}

/** A record that cannot be routed, and why. Never retried: a routing rule does not start passing. */
export interface VectorRouteFailure {
    Error: string;
}

/**
 * Route every record, keyed by `record.Identity.Key`. Per record, because a page can mix sources and
 * organizations; a record that cannot be routed fails alone.
 */
export async function RouteVectorRecords(
    records: readonly WorkingRecord[],
    infrastructure: ContentVectorInfrastructure,
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<Map<string, VectorRoute | VectorRouteFailure>> {
    const items = await loadItems(records, provider, contextUser);
    const byItem = new Map<string, VectorRoute | VectorRouteFailure>();
    for (const [groupKey, groupItems] of await infrastructure.GroupByInfrastructure([...items.values()])) {
        await routeGroup(groupKey, groupItems, infrastructure, byItem);
    }
    const routes = new Map<string, VectorRoute | VectorRouteFailure>();
    for (const record of records) {
        const itemID = OwningItemID(record);
        const route = itemID ? byItem.get(NormalizeUUID(itemID)) : undefined;
        routes.set(record.Identity.Key, route ?? { Error: `the Content Item behind '${record.Identity.Key}' could not be loaded, so its index cannot be resolved` });
    }
    return routes;
}

/** Whether a route is a failure. */
export function IsRouteFailure(route: VectorRoute | VectorRouteFailure): route is VectorRouteFailure {
    return 'Error' in route;
}

/** The Content Item a record's vector belongs to: itself, or a chunk's parent. */
export function OwningItemID(record: WorkingRecord): string | null {
    if (record.Entity === 'Content Item Chunk') {
        return record.GetExtension<string>('Pipeline', 'contentItemID') ?? null;
    }
    return record.Identity.RecordID ?? null;
}

async function routeGroup(
    groupKey: string,
    items: MJContentItemEntity[],
    infrastructure: ContentVectorInfrastructure,
    routes: Map<string, VectorRoute | VectorRouteFailure>,
): Promise<void> {
    let infra: ResolvedVectorInfrastructure;
    try {
        infra = await infrastructure.Resolve(groupKey);
    } catch (error) {
        const failure = { Error: error instanceof Error ? error.message : String(error) };
        items.forEach((item) => routes.set(NormalizeUUID(item.ID), failure));
        return;
    }
    const { Directives, Rejected } = await infrastructure.BuildDirectives(items, infra);
    for (const { Item, Reason } of Rejected) {
        // Fail closed: writing it to the default namespace instead would leak it.
        routes.set(NormalizeUUID(Item.ID), { Error: `the vector provider rejected '${Item.ID}': ${Reason}` });
    }
    for (const item of items) {
        const key = NormalizeUUID(item.ID);
        if (!routes.has(key)) {
            routes.set(key, { GroupKey: groupKey, Infrastructure: infra, Directives: Directives.get(key), Item: item });
        }
    }
}

/** The owning Content Items, in one query. */
async function loadItems(records: readonly WorkingRecord[], provider: IMetadataProvider, contextUser: UserInfo): Promise<Map<string, MJContentItemEntity>> {
    const ids = [...new Set(records.map(OwningItemID).filter((id): id is string => !!id))];
    const items = new Map<string, MJContentItemEntity>();
    if (ids.length === 0) {
        return items;
    }
    const result = await RunView.FromMetadataProvider(provider).RunView<MJContentItemEntity>(
        { EntityName: 'MJ: Content Items', ExtraFilter: WhereAnyOf('ID', ids), ResultType: 'entity_object' },
        contextUser,
    );
    if (!result.Success) {
        throw new Error(`Loading the Content Items behind this page failed: ${result.ErrorMessage}`);
    }
    result.Results.forEach((item) => items.set(NormalizeUUID(item.ID), item));
    return items;
}
