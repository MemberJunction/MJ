/**
 * @fileoverview {@link VectorRecordRouter} — where each record's vector lives, and how to reach it.
 *
 * Embed and Delete both need the same three answers for every record: which index (from the
 * record's Content Source), which provider directives (a Pinecone namespace, a shard key — whatever
 * the provider derives from the source row), and which row those directives are derived from. They
 * must get the SAME answers, or a delete looks for a vector somewhere other than where the write put
 * it and reports success having removed nothing.
 *
 * **Routing policy is not decided here.** MJ already has the generic mechanism: a provider declares
 * the source-record fields it needs (`GetSourceRecordFieldPaths`) and derives its directives from
 * them (`BuildProviderDirectives`), driven entirely by `VectorIndex.ProviderConfig`. Routing each
 * tenant to its own Pinecone namespace is therefore configuration — `{"namespaceField":
 * "ContentSourceID.OrganizationID"}` — resolved through IS-A, so a field living on a layer above
 * MJ's Content Source works without MJ knowing it exists. Where configuration is not enough, the
 * layer that owns the policy registers a subclass at {@link VECTOR_RECORD_ROUTER} and overrides
 * {@link VectorRecordRouter.EnrichSourceRecord} or {@link VectorRecordRouter.BuildDirectives}.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemEntity } from '@memberjunction/core-entities';
import { MJGlobal, NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { FieldPathResolver } from '@memberjunction/content-autotagging';
import { WorkingRecord } from '@memberjunction/content-pipeline-base';
import { ResolvedVectorTarget, VectorTargetResolver } from './VectorTarget.js';
import { WhereAnyOf } from './Filters.js';

/** The registration key. A deployment's own router registers at the same key. */
export const VECTOR_RECORD_ROUTER = 'VectorRecordRouter';

/** Where one record's vector lives. */
export interface VectorRoute {
    /** The index, provider and embedding model. */
    Target: ResolvedVectorTarget;
    /** Per-record provider routing, or undefined when the index needs none. */
    Directives: Record<string, unknown> | undefined;
    /** The Content Item the vector belongs to — the record itself, or a chunk's parent. */
    Item: MJContentItemEntity;
}

/** A record that cannot be routed, and why. Never retried: a routing rule does not start passing. */
export interface VectorRouteFailure {
    Error: string;
}

/**
 * Resolves routes for a page of records in a handful of queries: one for the owning items, one per
 * declared field path, and one target resolution per source.
 *
 * One instance per page. It caches targets per source, so five hundred chunks of one source share a
 * provider instance and a credential lookup.
 */
@RegisterClass(VectorRecordRouter, VECTOR_RECORD_ROUTER)
export class VectorRecordRouter {
    private provider!: IMetadataProvider;
    private contextUser!: UserInfo;
    private targets!: VectorTargetResolver;

    /** The registered router — a deployment's subclass when one is registered, this otherwise. */
    public static Create(provider: IMetadataProvider, contextUser: UserInfo): VectorRecordRouter {
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<VectorRecordRouter>(
            VectorRecordRouter,
            VECTOR_RECORD_ROUTER,
        );
        const router = result.Resolved && result.Instance ? result.Instance : new VectorRecordRouter();
        router.Initialize(provider, contextUser);
        return router;
    }

    /** Bind to a provider and user. Separate from construction so a subclass needs no constructor. */
    public Initialize(provider: IMetadataProvider, contextUser: UserInfo): void {
        this.provider = provider;
        this.contextUser = contextUser;
        this.targets = new VectorTargetResolver(provider, contextUser);
    }

    /**
     * Route every record, keyed by `record.Identity.Key`.
     *
     * One record that cannot be routed fails alone; the rest of the page proceeds.
     */
    public async Route(records: readonly WorkingRecord[]): Promise<Map<string, VectorRoute | VectorRouteFailure>> {
        const routes = new Map<string, VectorRoute | VectorRouteFailure>();
        const items = await this.loadItems(records);

        const pending: { record: WorkingRecord; item: MJContentItemEntity; target: ResolvedVectorTarget }[] = [];
        for (const record of records) {
            const itemID = OwningItemID(record);
            const item = itemID ? items.get(NormalizeUUID(itemID)) : undefined;
            if (!item) {
                routes.set(record.Identity.Key, {
                    Error: `the Content Item behind '${record.Identity.Key}' could not be loaded, so its index cannot be resolved`,
                });
                continue;
            }
            try {
                pending.push({ record, item, target: await this.targets.Resolve(item.ContentSourceID) });
            } catch (error) {
                routes.set(record.Identity.Key, { Error: error instanceof Error ? error.message : String(error) });
            }
        }

        const enriched = await this.resolveFieldPaths(pending);
        for (const { record, item, target } of pending) {
            try {
                const source = await this.EnrichSourceRecord(
                    { ...(item.GetAll() as Record<string, unknown>), ...(enriched.get(NormalizeUUID(item.ID)) ?? {}) },
                    item,
                    target,
                );
                routes.set(record.Identity.Key, {
                    Target: target,
                    Directives: this.BuildDirectives(source, target),
                    Item: item,
                });
            } catch (error) {
                // A provider may reject a record — a mandatory tenant field it cannot find. That is
                // the fail-closed check: writing it to the default namespace instead would leak it.
                routes.set(record.Identity.Key, {
                    Error: `the vector provider rejected '${record.Identity.Key}': ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
        return routes;
    }

    /**
     * Add to the row the provider derives its directives from.
     *
     * The seam for routing that configuration cannot express — a value from a service rather than a
     * related row, say. The default adds nothing.
     */
    protected async EnrichSourceRecord(
        source: Record<string, unknown>,
        _item: MJContentItemEntity,
        _target: ResolvedVectorTarget,
    ): Promise<Record<string, unknown>> {
        return source;
    }

    /**
     * The provider's directives for this record.
     *
     * Asked only when the index has a ProviderConfig — the same rule the autotagger applies — so an
     * index needing no routing never pays for it. May throw to reject the record.
     */
    protected BuildDirectives(
        source: Record<string, unknown>,
        target: ResolvedVectorTarget,
    ): Record<string, unknown> | undefined {
        if (!target.ProviderConfig) {
            return undefined;
        }
        const directives = target.Database.BuildProviderDirectives(source, target.ProviderConfig);
        return Object.keys(directives).length > 0 ? directives : undefined;
    }

    /** The owning Content Items, in one query. */
    private async loadItems(records: readonly WorkingRecord[]): Promise<Map<string, MJContentItemEntity>> {
        const ids = [...new Set(records.map(OwningItemID).filter((id): id is string => !!id))];
        const items = new Map<string, MJContentItemEntity>();
        if (ids.length === 0) {
            return items;
        }
        const result = await RunView.FromMetadataProvider(this.provider).RunView<MJContentItemEntity>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: WhereAnyOf('ID', ids),
                ResultType: 'entity_object',
            },
            this.contextUser,
        );
        if (!result.Success) {
            throw new Error(`Loading the Content Items behind this page failed: ${result.ErrorMessage}`);
        }
        for (const item of result.Results) {
            items.set(NormalizeUUID(item.ID), item);
        }
        return items;
    }

    /**
     * Resolve the field paths each provider declares — `ContentSourceID.OrganizationID` and the
     * like — onto the item, in one query per path rather than one per record.
     */
    private async resolveFieldPaths(
        pending: readonly { item: MJContentItemEntity; target: ResolvedVectorTarget }[],
    ): Promise<Map<string, Record<string, unknown>>> {
        const bags = new Map<string, Record<string, unknown>>();
        const byPath = new Map<string, MJContentItemEntity[]>();
        for (const { item, target } of pending) {
            if (!target.ProviderConfig) {
                continue;
            }
            for (const path of target.Database.GetSourceRecordFieldPaths(target.ProviderConfig)) {
                byPath.set(path, [...(byPath.get(path) ?? []), item]);
            }
        }
        if (byPath.size === 0) {
            return bags;
        }
        const resolver = new FieldPathResolver(this.provider, this.contextUser, 'MJ: Content Items');
        for (const [path, items] of byPath) {
            const values = await resolver.ResolveForItems(items, path);
            for (const item of items) {
                const key = NormalizeUUID(item.ID);
                // Injected under the full path key, which is how a provider reads it back.
                bags.set(key, { ...(bags.get(key) ?? {}), [path]: values.get(key) });
            }
        }
        return bags;
    }
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
