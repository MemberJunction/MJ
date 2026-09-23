/**
 * @fileoverview Angular service wrapping server-side Record Cloning remote operations.
 *
 * Implements §11.5 and §12.3 of the Record Cloning architectural blueprint. Resolves
 * the IMetadataProvider (multi-provider aware), delegates directly to the typed
 * BaseRemotableOperation subclasses emitted into @memberjunction/core-entities, and
 * maintains an in-memory session cache of Describe results per entity.
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

@Injectable({ providedIn: 'root' })
export class RecordCloneService {
    private readonly _describeCache = new Map<string, RecordCloneDescribeOutput>();

    /**
     * Inspect an entity (and optionally a specific record key) to discover cloning
     * capabilities, default options, user-editable knobs, and relationship policies.
     * Caches the result per entity name for the duration of the browser session unless
     * `forceRefresh` is true or a specific record key is inspected.
     */
    public async DescribeRecord(
        input: RecordCloneDescribeInput,
        provider?: IMetadataProvider | null,
        forceRefresh = false
    ): Promise<RecordCloneDescribeOutput> {
        const cacheKey = input.EntityName.trim().toLowerCase();
        const isGenericQuery = !input.Key || !input.Key.KeyValuePairs || input.Key.KeyValuePairs.length === 0;

        if (!forceRefresh && isGenericQuery && this._describeCache.has(cacheKey)) {
            return this._describeCache.get(cacheKey)!;
        }

        const p = provider ?? Metadata.Provider;
        const op = new RecordCloneDescribeOperation();
        const result = await op.Execute(input, { provider: p ?? undefined });

        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage || 'Failed to inspect record cloning capability');
        }

        if (isGenericQuery) {
            this._describeCache.set(cacheKey, result.Output);
        }

        return result.Output;
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
    public ClearDescribeCache(entityName?: string): void {
        if (entityName) {
            this._describeCache.delete(entityName.trim().toLowerCase());
        } else {
            this._describeCache.clear();
        }
    }
}
