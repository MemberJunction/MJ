/**
 * @fileoverview A processor decorator that runs an inner processor (Action/Agent/Infer) and then
 * applies the Record Process's `OutputMapping` write-back (fields / child record) using the inner
 * result's payload. Lets any work type share the same declarative write-back.
 * @module @memberjunction/record-set-processor
 */

import { LogError } from '@memberjunction/core';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';
import { OutputMappingConfig, RunProvenance, applyOutputMapping } from '../writeBack';

/** Wraps a processor and applies output-mapping write-back to each successful result. */
export class WriteBackProcessor implements IRecordProcessor {
    /**
     * @param inner - The processor that produces the work result.
     * @param outputMapping - The `OutputMapping` config to apply to each successful result.
     * @param dryRun - When true, the inner work still runs but the write-back only computes a
     *   preview (no entity is saved / no child is created), so a dry-run of any wrapped work type
     *   reports its effect without mutating data. Mirrors `FieldRulesProcessor`'s dry-run.
     * @param run - Optional run provenance information stamped on write-back operations.
     */
    constructor(
        private readonly inner: IRecordProcessor,
        private readonly outputMapping: OutputMappingConfig,
        private readonly dryRun: boolean = false,
        private readonly run?: RunProvenance,
    ) {}

    public get OutputMapping(): OutputMappingConfig {
        return this.outputMapping;
    }

    public getWriteBackFields(): string[] {
        return Object.keys(this.outputMapping.fields ?? {});
    }

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const result = await this.inner.ProcessRecord(record, context);
        if (result.Status !== 'Succeeded') {
            return result;
        }
        try {
            const runProvenance: RunProvenance = {
                ...this.run,
                ProcessRunID: context.processRunID ?? this.run?.ProcessRunID,
                AIPromptRunID: result.AIPromptRunID ?? this.run?.AIPromptRunID,
                PromptVersionHash: result.PromptVersionHash ?? this.run?.PromptVersionHash,
                FeatureValueCacheID: result.FeatureValueCacheID ?? this.run?.FeatureValueCacheID,
                ExecutedAt: this.run?.ExecutedAt ?? new Date().toISOString(),
            };
            if ('beforeWriteBack' in this.inner && typeof (this.inner as { beforeWriteBack?: unknown }).beforeWriteBack === 'function') {
                await (this.inner as { beforeWriteBack: (m: OutputMappingConfig | undefined, res: unknown, rec: RecordRef, ctx: RecordProcessorContext) => Promise<void> }).beforeWriteBack(
                    this.outputMapping,
                    result.ResultPayload,
                    record,
                    context
                );
            }
            const writeBack = await applyOutputMapping({
                outputMapping: this.outputMapping,
                result: result.ResultPayload,
                record,
                contextUser: context.contextUser,
                provider: context.provider,
                dryRun: this.dryRun,
                run: runProvenance,
            });
            return { ...result, ResultPayload: { output: result.ResultPayload, writeBack } };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`WriteBackProcessor: write-back failed for record '${record.RecordID}': ${message}`);
            return { ...result, Status: 'Failed', ErrorMessage: `Write-back failed: ${message}` };
        }
    }

    /**
     * Delegates basis hash computation to the inner processor if supported.
     */
    public async ComputeBasisHash(record: RecordRef, context: RecordProcessorContext): Promise<string | undefined> {
        if ('ComputeBasisHash' in this.inner && typeof (this.inner as { ComputeBasisHash?: unknown }).ComputeBasisHash === 'function') {
            return (this.inner as { ComputeBasisHash: (r: RecordRef, ctx: RecordProcessorContext) => Promise<string | undefined> }).ComputeBasisHash(record, context);
        }
        return undefined;
    }

    /**
     * Delegates batch processing to the inner processor when supported, and applies
     * output mapping write-back to each successful result.
     */
    public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        if ('ProcessBatch' in this.inner && typeof (this.inner as { ProcessBatch?: unknown }).ProcessBatch === 'function') {
            const innerResults = await (this.inner as { ProcessBatch: (recs: RecordRef[], ctx: RecordProcessorContext) => Promise<Map<string, RecordResult>> }).ProcessBatch(records, context);
            const outResults = new Map<string, RecordResult>();

            for (const record of records) {
                const res = innerResults.get(record.RecordID);
                if (!res || res.Status !== 'Succeeded') {
                    outResults.set(record.RecordID, res ?? { Status: 'Failed', ErrorMessage: 'No result returned from batch processor' });
                    continue;
                }

                try {
                    const runProvenance: RunProvenance = {
                        ...this.run,
                        ProcessRunID: context.processRunID ?? this.run?.ProcessRunID,
                        AIPromptRunID: res.AIPromptRunID ?? this.run?.AIPromptRunID,
                        PromptVersionHash: res.PromptVersionHash ?? this.run?.PromptVersionHash,
                        FeatureValueCacheID: res.FeatureValueCacheID ?? this.run?.FeatureValueCacheID,
                        ExecutedAt: this.run?.ExecutedAt ?? new Date().toISOString(),
                    };
                    if ('beforeWriteBack' in this.inner && typeof (this.inner as { beforeWriteBack?: unknown }).beforeWriteBack === 'function') {
                        await (this.inner as { beforeWriteBack: (m: OutputMappingConfig | undefined, res: unknown, rec: RecordRef, ctx: RecordProcessorContext) => Promise<void> }).beforeWriteBack(
                            this.outputMapping,
                            res.ResultPayload,
                            record,
                            context
                        );
                    }
                    const writeBack = await applyOutputMapping({
                        outputMapping: this.outputMapping,
                        result: res.ResultPayload,
                        record,
                        contextUser: context.contextUser,
                        provider: context.provider,
                        dryRun: this.dryRun,
                        run: runProvenance,
                    });
                    outResults.set(record.RecordID, { ...res, ResultPayload: { output: res.ResultPayload, writeBack } });
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    LogError(`WriteBackProcessor: write-back failed for record '${record.RecordID}': ${message}`);
                    outResults.set(record.RecordID, { ...res, Status: 'Failed', ErrorMessage: `Write-back failed: ${message}` });
                }
            }
            return outResults;
        }

        // Fall back to processing each record
        const results = new Map<string, RecordResult>();
        for (const record of records) {
            results.set(record.RecordID, await this.ProcessRecord(record, context));
        }
        return results;
    }
}
