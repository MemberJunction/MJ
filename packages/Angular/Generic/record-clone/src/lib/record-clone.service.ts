/**
 * @fileoverview Angular service wrapping server-side Record Cloning remote operations.
 *
 * Implements §11.5 and §12.3 of the Record Cloning architectural blueprint. Resolves
 * the IMetadataProvider (multi-provider aware), delegates directly to the typed
 * BaseRemotableOperation subclasses emitted into @memberjunction/core-entities, and
 * maintains an in-memory session cache of Describe results per provider and entity.
 */

import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import {
    RecordCloneDescribeOperation,
    RecordClonePlanOperation,
    RecordCloneExecuteOperation,
    RecordCloneGetLineageOperation,
    type RecordCloneDescribeInput,
    type RecordCloneDescribeOutput,
    type RecordClonePlanInput,
    type RecordClonePlanOutput,
    type RecordCloneExecuteInput,
    type RecordCloneExecuteOutput,
    type RecordCloneGetLineageInput,
    type RecordCloneGetLineageOutput,
} from '@memberjunction/core-entities';

/** Cache bucket used when no provider can be resolved (tests, early bootstrap). */
const NO_PROVIDER = {};

/**
 * Client for the four RecordClone remote operations. Every method takes an optional
 * provider so multi-provider hosts target the right server; omitted, it uses `Metadata.Provider`.
 */
@Injectable({ providedIn: 'root' })
export class RecordCloneService {
    /** Describe answers per provider, then per entity. Holds the promise so concurrent callers share one request. */
    private readonly _describeCache = new WeakMap<object, Map<string, Promise<RecordCloneDescribeOutput>>>();

    /**
     * Inspect an entity (and optionally a specific record key) to discover cloning
     * capabilities, default options, user-editable knobs, and relationship policies.
     * Caches the result per provider and entity name for the session unless
     * `forceRefresh` is true or a specific record key is inspected. A failed call is not cached.
     */
    public async DescribeRecord(
        input: RecordCloneDescribeInput,
        provider?: IMetadataProvider | null,
        forceRefresh = false
    ): Promise<RecordCloneDescribeOutput> {
        const p = provider ?? Metadata.Provider;
        const isGenericQuery = !input.Key || !input.Key.KeyValuePairs || input.Key.KeyValuePairs.length === 0;
        if (!isGenericQuery) {
            return this.describe(input, p);
        }

        const bucket = this.cacheBucket(p);
        const cacheKey = input.EntityName.trim().toLowerCase();
        const cached = bucket.get(cacheKey);
        if (cached && !forceRefresh) {
            return cached;
        }

        const pending = this.describe(input, p);
        bucket.set(cacheKey, pending);
        pending.catch(() => {
            if (bucket.get(cacheKey) === pending) bucket.delete(cacheKey);
        });
        return pending;
    }

    /**
     * Compute a complete clone plan (dry run) for a source record graph without writing
     * any database changes. Returns the planned nodes, edges, field changes, and warnings.
     */
    public async PlanClone(
        input: RecordClonePlanInput,
        provider?: IMetadataProvider | null
    ): Promise<RecordClonePlanOutput> {
        const p = provider ?? Metadata.Provider;
        const op = new RecordClonePlanOperation();
        const result = await op.Execute(input, { provider: p ?? undefined });

        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage || 'Failed to compute clone plan');
        }

        return result.Output;
    }

    /**
     * Execute a planned record clone graph with optional overrides. Supports optimistic
     * plan hashing (ExpectedPlanHash), progress reporting, and full transactional rollback.
     */
    public async ExecuteClone(
        input: RecordCloneExecuteInput,
        provider?: IMetadataProvider | null
    ): Promise<RecordCloneExecuteOutput> {
        const p = provider ?? Metadata.Provider;
        const op = new RecordCloneExecuteOperation();
        const result = await op.Execute(input, { provider: p ?? undefined });

        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage || 'Failed to execute record clone');
        }

        return result.Output;
    }

    /**
     * Retrieve the clone lineage for a record — traversing ClonedFrom links upward to
     * ancestors and downward to descendant clones.
     */
    public async GetLineage(
        input: RecordCloneGetLineageInput,
        provider?: IMetadataProvider | null
    ): Promise<RecordCloneGetLineageOutput> {
        const p = provider ?? Metadata.Provider;
        const op = new RecordCloneGetLineageOperation();
        const result = await op.Execute(input, { provider: p ?? undefined });

        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage || 'Failed to retrieve clone lineage');
        }

        return result.Output;
    }

    /**
     * Clear the in-memory session Describe cache for a specific entity or all entities.
     */
    public ClearDescribeCache(entityName?: string, provider?: IMetadataProvider | null): void {
        const bucket = this.cacheBucket(provider ?? Metadata.Provider);
        if (entityName) {
            bucket.delete(entityName.trim().toLowerCase());
        } else {
            bucket.clear();
        }
    }

    private cacheBucket(provider: IMetadataProvider | null | undefined): Map<string, Promise<RecordCloneDescribeOutput>> {
        const owner: object = provider ?? NO_PROVIDER;
        let bucket = this._describeCache.get(owner);
        if (!bucket) {
            bucket = new Map();
            this._describeCache.set(owner, bucket);
        }
        return bucket;
    }

    private async describe(input: RecordCloneDescribeInput, provider: IMetadataProvider | null | undefined): Promise<RecordCloneDescribeOutput> {
        const op = new RecordCloneDescribeOperation();
        const result = await op.Execute(input, { provider: provider ?? undefined });
        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage || 'Failed to inspect record cloning capability');
        }
        return result.Output;
    }
}
