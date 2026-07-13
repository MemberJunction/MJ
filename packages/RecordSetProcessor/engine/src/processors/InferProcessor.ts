/**
 * @fileoverview Infer processor — for each record, runs an AI Prompt over the record's data and
 * returns the structured result as the record's `ResultPayload`. Write-back is NOT done here: the
 * `WriteBackProcessor` wrapper (added by `RecordProcessExecutor` when an OutputMapping is set)
 * applies the Record Process's OutputMapping uniformly across Action / Agent / Infer work types.
 * @module @memberjunction/record-set-processor
 */

import { UUIDsEqual, resolveValueMapping } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';

/** Runs an AI Prompt per record and returns its structured output (write-back is the wrapper's job). */
export class InferProcessor implements IRecordProcessor {
    /**
     * @param promptID - The `MJ: AI Prompts` ID to run for each record.
     * @param inputMapping - Optional mapping shaping the data passed to the prompt (default: `{ record }`).
     */
    constructor(
        private readonly promptID: string,
        private readonly inputMapping?: Record<string, string>,
    ) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, this.promptID));
        if (!prompt) {
            return { Status: 'Failed', ErrorMessage: `AI Prompt '${this.promptID}' not found` };
        }

        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = this.buildPromptData(record);
        params.contextUser = context.contextUser;

        const result = await new AIPromptRunner().ExecutePrompt(params);
        const aiPromptRunID = result.promptRun?.ID;
        if (!result.success) {
            return { Status: 'Failed', ErrorMessage: result.errorMessage ?? 'AI prompt execution failed', AIPromptRunID: aiPromptRunID };
        }
        return { Status: 'Succeeded', ResultPayload: result.result ?? {}, AIPromptRunID: aiPromptRunID };
    }

    /** Builds the data object passed to the prompt — the record's fields under `record`, optionally remapped. */
    private buildPromptData(record: RecordRef): Record<string, unknown> {
        const recordData = this.recordToPlain(record);
        if (!this.inputMapping) {
            return { record: recordData };
        }
        const mapped = resolveValueMapping(this.inputMapping, { record: recordData });
        return mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : { record: recordData };
    }

    /** Extracts a plain field map from the record (BaseEntity → GetAll(), plain object → as-is). */
    private recordToPlain(record: RecordRef): Record<string, unknown> {
        const r = record.Record as { GetAll?: () => Record<string, unknown> } | Record<string, unknown> | undefined;
        if (r && typeof (r as { GetAll?: unknown }).GetAll === 'function') {
            return (r as { GetAll: () => Record<string, unknown> }).GetAll();
        }
        if (r && typeof r === 'object') {
            return r as Record<string, unknown>;
        }
        return { RecordID: record.RecordID, EntityID: record.EntityID };
    }
}
