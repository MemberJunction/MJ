/**
 * @fileoverview Processor that runs an Agent (top-level, ExposeAsAction) over each record. The
 * record is mapped into the agent's `data` via the generic value-mapping resolver (`InputMapping`),
 * and the agent's structured output payload becomes the record result; the AI Agent Run is captured
 * for tracing.
 * @module @memberjunction/record-set-processor
 */

import { UUIDsEqual, resolveValueMapping } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';

/** Runs an Agent for each record, mapping the record into the agent's input data. */
export class AgentRecordProcessor implements IRecordProcessor {
    /**
     * @param agentID - ID of the Agent to run (must be top-level + `ExposeAsAction`).
     * @param inputMapping - Optional mapping config resolved against `{ record, recordId, entityId }`
     *   to build the agent's `data`. When omitted, the whole record is passed as `data`.
     */
    constructor(private readonly agentID: string, private readonly inputMapping?: unknown) {}

    /** Builds the agent `data` payload from the record + optional input mapping. */
    public static buildData(inputMapping: unknown, record: RecordRef): Record<string, unknown> {
        if (!inputMapping) {
            return { record: record.Record ?? {}, recordId: record.RecordID, entityId: record.EntityID };
        }
        const sources = { record: record.Record ?? {}, recordId: record.RecordID, entityId: record.EntityID };
        return resolveValueMapping<Record<string, unknown>>(inputMapping, sources);
    }

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const agent = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, this.agentID));
        if (!agent) {
            return { Status: 'Failed', ErrorMessage: `Agent '${this.agentID}' not found` };
        }

        const runner = new AgentRunner();
        const result = await runner.RunAgent({
            agent,
            conversationMessages: [],
            contextUser: context.contextUser,
            data: AgentRecordProcessor.buildData(this.inputMapping, record),
        });

        return {
            Status: result.success ? 'Succeeded' : 'Failed',
            ResultPayload: result.payload,
            ErrorMessage: result.success ? undefined : (result.agentRun?.ErrorMessage ?? 'Agent failed'),
            AIAgentRunID: result.agentRun?.ID,
        };
    }
}
