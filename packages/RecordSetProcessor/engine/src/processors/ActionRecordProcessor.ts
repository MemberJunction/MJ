/**
 * @fileoverview Processor that runs an Action over each record. Input is resolved from the record
 * via the generic value-mapping resolver (`InputMapping`); the action's output params become the
 * record result payload, and the Action Execution Log is captured for tracing.
 * @module @memberjunction/record-set-processor
 */

import { UUIDsEqual, resolveValueMapping } from '@memberjunction/global';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';

/** Runs an Action for each record, mapping the record into the action's input parameters. */
export class ActionRecordProcessor implements IRecordProcessor {
    /**
     * @param actionID - ID of the Action to run.
     * @param inputMapping - Optional mapping config resolved against `{ record, recordId, entityId }`
     *   to build the action's input params (e.g. `{ "CustomerID": "record.ID", "Tier": "record.Tier" }`).
     */
    constructor(private readonly actionID: string, private readonly inputMapping?: unknown) {}

    /** Named sources exposed to the input mapping for a record. */
    public static buildSources(record: RecordRef): Record<string, unknown> {
        return { record: record.Record ?? {}, recordId: record.RecordID, entityId: record.EntityID };
    }

    /** Resolves the input mapping into Action input params. */
    public static buildActionParams(inputMapping: unknown, record: RecordRef): ActionParam[] {
        const mapped = inputMapping
            ? resolveValueMapping<Record<string, unknown>>(inputMapping, ActionRecordProcessor.buildSources(record))
            : {};
        return Object.entries(mapped).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const }));
    }

    /** Collects an action's output params into a plain payload object. */
    public static extractOutputs(params?: ActionParam[]): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const p of params ?? []) {
            if (p.Type === 'Output' || p.Type === 'Both') {
                out[p.Name] = p.Value;
            }
        }
        return out;
    }

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await ActionEngineServer.Instance.Config(false, context.contextUser);
        const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, this.actionID));
        if (!action) {
            return { Status: 'Failed', ErrorMessage: `Action '${this.actionID}' not found` };
        }

        const result = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: context.contextUser,
            Params: ActionRecordProcessor.buildActionParams(this.inputMapping, record),
            Filters: [],
        });

        return {
            Status: result.Success ? 'Succeeded' : 'Failed',
            ResultPayload: ActionRecordProcessor.extractOutputs(result.Params),
            ErrorMessage: result.Success ? undefined : (result.Message ?? 'Action failed'),
            ActionExecutionLogID: result.LogEntry?.ID,
        };
    }
}
