/**
 * @fileoverview FieldRulesProcessor — applies a declarative {@link FieldRuleSet} to each record: the
 * rules-based bulk-update unit of work for the Record Set Processor.
 *
 * It is intentionally thin: the record set + batching / concurrency / pause-resume come from the engine,
 * and the actual rule logic (compute → metadata-validate → type-coerce → write/preview, plus the
 * RunView-backed lookup resolver) lives in {@link EntityFieldRules} in `@memberjunction/core`. This
 * processor just maps a {@link RecordRef} to a loaded entity and translates the apply result into a
 * {@link RecordResult}. The transform/rule substrate beneath `EntityFieldRules` is the pure
 * field-rules engine in `@memberjunction/global` — the same one the integration field-mapping engine uses.
 * @module @memberjunction/record-set-processor
 */
import { BaseEntity, CompositeKey, EntityFieldRules, type EntityFieldRulesResult } from '@memberjunction/core';
import type { FieldChange, FieldRuleSet } from '@memberjunction/global';
import {
    type IRecordProcessor,
    type RecordProcessorContext,
    type RecordRef,
    type RecordResult,
} from '@memberjunction/record-set-processor-base';

/** Options for a {@link FieldRulesProcessor}. */
export interface FieldRulesProcessorOptions {
    /** The rules to apply to each record. */
    RuleSet: FieldRuleSet;
    /** When true, COMPUTE the changes but do NOT save — each result payload carries the per-field diff. */
    DryRun?: boolean;
}

/** The structured payload recorded on each Process Run Detail (the per-record diff). */
export interface FieldRulesResultPayload {
    DryRun: boolean;
    Changes: FieldChange[];
    ChangedFields: string[];
}

/**
 * Applies field rules to a single record via {@link EntityFieldRules}. Single-primary-key entities only
 * (composite keys return a clear Failed result). On a real run the record is persisted via
 * `BaseEntity.Save()`, so MJ's built-in Record Changes versioning captures the before/after automatically.
 */
export class FieldRulesProcessor implements IRecordProcessor {
    constructor(private readonly options: FieldRulesProcessorOptions) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const started = Date.now();
        try {
            const obj = await this.loadRecord(record, context);
            if (typeof obj === 'string') {
                return { Status: 'Failed', ErrorMessage: obj, DurationMs: Date.now() - started };
            }
            const result = await new EntityFieldRules(context.contextUser).ApplyToEntity(obj, this.options.RuleSet, { DryRun: this.options.DryRun });
            return this.toRecordResult(result, started);
        } catch (err) {
            return { Status: 'Failed', ErrorMessage: err instanceof Error ? err.message : String(err), DurationMs: Date.now() - started };
        }
    }

    /** Maps the entity-level apply result onto the record-level outcome. */
    private toRecordResult(result: EntityFieldRulesResult, started: number): RecordResult {
        const ResultPayload: FieldRulesResultPayload = { DryRun: result.DryRun, Changes: result.Changes, ChangedFields: result.AppliedFields };
        const DurationMs = Date.now() - started;
        if (result.Errors.length > 0) {
            return { Status: 'Failed', ResultPayload, ErrorMessage: result.Errors.join('; '), DurationMs };
        }
        if (result.DryRun) {
            return { Status: 'Succeeded', ResultPayload, DurationMs }; // preview — the diff is the deliverable
        }
        if (result.AppliedFields.length === 0) {
            return { Status: 'Skipped', ResultPayload, DurationMs };
        }
        if (!result.Saved) {
            return { Status: 'Failed', ResultPayload, ErrorMessage: result.SaveError ?? 'save failed', DurationMs };
        }
        return { Status: 'Succeeded', ResultPayload, DurationMs };
    }

    /** Loads the BaseEntity for a record, or returns an error string. */
    private async loadRecord(record: RecordRef, context: RecordProcessorContext): Promise<BaseEntity | string> {
        const entity = context.provider.EntityByID(record.EntityID);
        if (!entity) {
            return `entity '${record.EntityID}' not found in metadata`;
        }
        if (entity.PrimaryKeys.length !== 1) {
            return `field-rules updates support single-primary-key entities only ('${entity.Name}')`;
        }
        const obj = await context.provider.GetEntityObject<BaseEntity>(entity.Name, context.contextUser);
        const loaded = await obj.InnerLoad(CompositeKey.FromKeyValuePair(entity.FirstPrimaryKey.Name, record.RecordID));
        if (!loaded) {
            return `record '${record.RecordID}' of '${entity.Name}' not found`;
        }
        return obj;
    }
}
