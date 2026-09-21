/**
 * @fileoverview WatermarkService — manages change-detection watermarks for Record Processes (P1-7b).
 * Supports Checksum (SHA-256 basis hash stored in MJ: Record Process Watermarks), UpdatedAt
 * (__mj_UpdatedAt comparison against lastRunAt, stores nothing), and None (disabled).
 * @module @memberjunction/record-set-processor
 */

import { BaseSingleton, ComputeContentHashAsync, EscapeSQLString } from '@memberjunction/global';
import { BaseEntity, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJRecordProcessWatermarkEntity } from '@memberjunction/core-entities';
import type { IRecordProcessor, RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';

export type WatermarkStrategy = MJRecordProcessEntity['WatermarkStrategy'];

/** Outcome of evaluating watermark for a single record. */
export interface WatermarkDecision {
    /** True if the record has not changed and can be skipped. */
    shouldSkip: boolean;
    /** The computed basis hash (present when strategy is Checksum). */
    basisHash?: string;
    /** Existing watermark entity loaded during batch check, if found. */
    existingWatermark?: MJRecordProcessWatermarkEntity;
}

/** Parameters for checking watermarks across a batch of records. */
export interface CheckBatchWatermarksParams {
    recordProcessID: string;
    entityID: string;
    records: RecordRef[];
    strategy: WatermarkStrategy;
    skipUnchanged?: boolean;
    lastRunAt?: Date | null;
    processor?: IRecordProcessor;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
    processRunID?: string;
    maxConcurrency?: number;
    excludeFields?: string[];
}

/** Parameters for updating/upserting a watermark after a successful process. */
export interface UpdateWatermarkParams {
    recordProcessID: string;
    entityID: string;
    recordID: string;
    basisHash: string;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
    existingWatermark?: MJRecordProcessWatermarkEntity;
}

interface ProcessorWithBasisHash {
    ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string | undefined>;
}

function hasComputeBasisHash(processor: unknown): processor is ProcessorWithBasisHash {
    return (
        typeof processor === 'object' &&
        processor !== null &&
        'ComputeBasisHash' in processor &&
        typeof (processor as ProcessorWithBasisHash).ComputeBasisHash === 'function'
    );
}

/**
 * Service managing record-level watermarking and change detection.
 */
export class WatermarkService extends BaseSingleton<WatermarkService> {
    public static get Instance(): WatermarkService {
        return super.getInstance<WatermarkService>();
    }

    protected constructor() {
        super();
    }

    /**
     * Evaluates watermarks for a batch of records. Returns a map of RecordID -> WatermarkDecision.
     */
    public async CheckBatchWatermarks(params: CheckBatchWatermarksParams): Promise<Map<string, WatermarkDecision>> {
        const results = new Map<string, WatermarkDecision>();
        if (!params.skipUnchanged || params.strategy === 'None' || params.records.length === 0) {
            for (const r of params.records) {
                results.set(r.RecordID, { shouldSkip: false });
            }
            return results;
        }

        if (params.strategy === 'UpdatedAt') {
            return this.checkUpdatedAtBatch(params);
        }

        // Checksum strategy
        return this.checkChecksumBatch(params);
    }

    /**
     * Evaluates UpdatedAt strategy: compares each record's __mj_UpdatedAt / UpdatedAt against lastRunAt.
     */
    private checkUpdatedAtBatch(params: CheckBatchWatermarksParams): Map<string, WatermarkDecision> {
        const results = new Map<string, WatermarkDecision>();
        if (!params.lastRunAt) {
            for (const r of params.records) {
                results.set(r.RecordID, { shouldSkip: false });
            }
            return results;
        }

        const lastRunTime = new Date(params.lastRunAt).getTime();
        for (const r of params.records) {
            const updatedAt = this.extractUpdatedAt(r);
            if (updatedAt) {
                const recTime = new Date(updatedAt).getTime();
                // Strictly < ensures records modified during the last run's timestamp window are not permanently skipped
                results.set(r.RecordID, { shouldSkip: recTime < lastRunTime });
            } else {
                results.set(r.RecordID, { shouldSkip: false });
            }
        }
        return results;
    }

    /**
     * Evaluates Checksum strategy: computes basis hashes and compares against MJ: Record Process Watermarks.
     */
    private async checkChecksumBatch(params: CheckBatchWatermarksParams): Promise<Map<string, WatermarkDecision>> {
        const results = new Map<string, WatermarkDecision>();
        const provider = params.provider ?? Metadata.Provider;
        const recordContext: RecordProcessorContext = {
            contextUser: params.contextUser,
            provider,
            processRunID: params.processRunID,
        };

        // Step 1: Compute basis hash for each record with bounded concurrency
        const computedHashes = new Map<string, string>();
        const queue = [...params.records];
        const concurrency = Math.max(1, params.maxConcurrency ?? 1);
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (queue.length > 0) {
                const record = queue.shift();
                if (!record) break;
                try {
                    const hash = await this.computeRecordBasisHash(record, params.processor, recordContext, { excludeFields: params.excludeFields });
                    if (hash) {
                        computedHashes.set(record.RecordID, hash);
                    }
                } catch (e) {
                    LogError(`WatermarkService: failed computing basis hash for record '${record.RecordID}': ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        });
        await Promise.all(workers);

        if (computedHashes.size === 0) {
            for (const r of params.records) {
                results.set(r.RecordID, { shouldSkip: false });
            }
            return results;
        }

        // Step 2: Query existing watermarks in batch
        const existingWatermarks = await this.loadExistingWatermarks(
            params.recordProcessID,
            params.entityID,
            Array.from(computedHashes.keys()),
            params.contextUser,
            provider
        );

        // Step 3: Compare hashes
        for (const r of params.records) {
            const currentHash = computedHashes.get(r.RecordID);
            const existing = existingWatermarks.get(r.RecordID);
            if (!currentHash) {
                results.set(r.RecordID, { shouldSkip: false });
            } else if (existing && existing.Hash === currentHash) {
                results.set(r.RecordID, { shouldSkip: true, basisHash: currentHash, existingWatermark: existing });
            } else {
                results.set(r.RecordID, { shouldSkip: false, basisHash: currentHash, existingWatermark: existing });
            }
        }

        return results;
    }

    /**
     * Computes the basis hash for a record. Delegates to processor.ComputeBasisHash if available,
     * otherwise falls back to BaseEntity.ComputeContentHash() or ComputeContentHashAsync on record data.
     */
    public async computeRecordBasisHash(
        record: RecordRef,
        processor: IRecordProcessor | undefined,
        context: RecordProcessorContext,
        options?: { excludeFields?: string[] }
    ): Promise<string | undefined> {
        if (processor && hasComputeBasisHash(processor)) {
            const hash = await processor.ComputeBasisHash(record, context);
            if (hash) {
                return hash;
            }
        }

        if (record.Record instanceof BaseEntity) {
            return record.Record.ComputeContentHash({ ExcludeFields: options?.excludeFields });
        }

        if (record.Record && typeof record.Record === 'object') {
            const copy = { ...(record.Record as Record<string, unknown>) };
            if (options?.excludeFields) {
                for (const ef of options.excludeFields) {
                    delete copy[ef];
                }
            }
            return ComputeContentHashAsync(copy);
        }

        return undefined;
    }

    /**
     * Loads existing watermark rows for a set of record IDs in one query.
     */
    private async loadExistingWatermarks(
        recordProcessID: string,
        entityID: string,
        recordIDs: string[],
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Map<string, MJRecordProcessWatermarkEntity>> {
        const map = new Map<string, MJRecordProcessWatermarkEntity>();
        if (recordIDs.length === 0) {
            return map;
        }

        const quotedIDs = recordIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        const filter = `RecordProcessID = '${EscapeSQLString(recordProcessID)}' AND EntityID = '${EscapeSQLString(entityID)}' AND RecordID IN (${quotedIDs})`;

        const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
        const res = await rv.RunView<MJRecordProcessWatermarkEntity>(
            {
                EntityName: 'MJ: Record Process Watermarks',
                ExtraFilter: filter,
                ResultType: 'entity_object',
            },
            contextUser
        );

        if (!res.Success) {
            LogError(`WatermarkService: failed loading existing watermarks: ${res.ErrorMessage || 'unknown error'}`);
            return map;
        }

        if (res.Results) {
            for (const wm of res.Results) {
                map.set(wm.RecordID, wm);
            }
        }
        return map;
    }

    /**
     * Upserts a watermark row for a record on success.
     */
    public async UpdateWatermark(params: UpdateWatermarkParams): Promise<void> {
        const provider = params.provider ?? Metadata.Provider;
        let wm = params.existingWatermark;

        if (!wm) {
            const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
            const filter = `RecordProcessID = '${EscapeSQLString(params.recordProcessID)}' AND EntityID = '${EscapeSQLString(params.entityID)}' AND RecordID = '${EscapeSQLString(params.recordID)}'`;
            const res = await rv.RunView<MJRecordProcessWatermarkEntity>(
                {
                    EntityName: 'MJ: Record Process Watermarks',
                    ExtraFilter: filter,
                    ResultType: 'entity_object',
                },
                params.contextUser
            );
            if (res.Success && res.Results && res.Results.length > 0) {
                wm = res.Results[0];
            } else {
                wm = await provider.GetEntityObject<MJRecordProcessWatermarkEntity>('MJ: Record Process Watermarks', params.contextUser);
                wm.NewRecord();
                wm.RecordProcessID = params.recordProcessID;
                wm.EntityID = params.entityID;
                wm.RecordID = params.recordID;
            }
        }

        wm.Hash = params.basisHash;
        wm.LastProcessedAt = new Date();
        const saved = await wm.Save();
        if (!saved) {
            LogError(`WatermarkService: failed to save watermark for record '${params.recordID}' on process '${params.recordProcessID}': ${wm.LatestResult?.CompleteMessage || 'Save returned false'}`);
        }
    }

    private extractUpdatedAt(record: RecordRef): Date | string | undefined {
        if (record.Record instanceof BaseEntity) {
            const val = record.Record.Get('__mj_UpdatedAt') ?? record.Record.Get('UpdatedAt');
            if (val instanceof Date || typeof val === 'string') {
                return val;
            }
        }
        if (record.Record && typeof record.Record === 'object') {
            const rec = record.Record as Record<string, unknown>;
            const val = rec.__mj_UpdatedAt ?? rec.UpdatedAt;
            if (val instanceof Date || typeof val === 'string') {
                return val;
            }
        }
        return undefined;
    }
}
