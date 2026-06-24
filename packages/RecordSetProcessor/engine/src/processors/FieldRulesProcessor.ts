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
import { UUIDsEqual, type FieldChange, type FieldRuleSet, type PromptResolver } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, MJEntityDocumentEntityExtended } from '@memberjunction/ai-core-plus';
import { TemplateEngineServer } from '@memberjunction/templates';
import { RegisterFieldRulesTransforms } from '@memberjunction/field-rules-transforms';
import type { EntityDocumentResolver } from '@memberjunction/global';
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
    constructor(private readonly options: FieldRulesProcessorOptions) {
        // Make the extended transforms (jsonpath / xpath) available to rules. Idempotent — registers
        // the plugins into the global transform registry the first time a processor is created.
        RegisterFieldRulesTransforms();
    }

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const started = Date.now();
        try {
            const obj = await this.loadRecord(record, context);
            if (typeof obj === 'string') {
                return { Status: 'Failed', ErrorMessage: obj, DurationMs: Date.now() - started };
            }
            const rules = new EntityFieldRules(context.contextUser, this.buildPromptResolver(context), this.buildEntityDocumentResolver(context));
            const result = await rules.ApplyToEntity(obj, this.options.RuleSet, { DryRun: this.options.DryRun });
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

    /**
     * Supplies core's `EntityFieldRules` with a real `AIPromptRunner`-backed resolver for `prompt` rule
     * sources (core can't depend on the AI stack itself). Each prompt source runs the named prompt with
     * the record (or its shaped data) as input; the prompt's output becomes the field value. One model
     * call per record per prompt-rule — pair with dry-run + bounded concurrency on large sets.
     */
    private buildPromptResolver(context: RecordProcessorContext): PromptResolver {
        return async ({ PromptID, Data }) => {
            await AIEngine.Instance.Config(false, context.contextUser);
            const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, PromptID));
            if (!prompt) {
                throw new Error(`AI Prompt '${PromptID}' not found`);
            }
            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = Data;
            params.contextUser = context.contextUser;
            const result = await new AIPromptRunner().ExecutePrompt(params);
            if (!result.success) {
                throw new Error(result.errorMessage ?? 'AI prompt execution failed');
            }
            return result.result;
        };
    }

    /**
     * Supplies core's `EntityFieldRules` with a resolver for `entityDocument` rule sources, backed by the
     * existing Entity Document + Template render infrastructure (core can't depend on templates itself).
     * Renders the named Entity Document's template against the record and returns the text — typically
     * fed into a `prompt` source's `Data` to give the LLM a curated rendering of the record.
     */
    private buildEntityDocumentResolver(context: RecordProcessorContext): EntityDocumentResolver {
        return async ({ EntityDocumentID, Record }) => {
            if (!EntityDocumentID) {
                throw new Error('an entityDocument source requires an EntityDocumentID');
            }
            // Configure the template engine first so the EntityDocument's virtual TemplateText resolves.
            await TemplateEngineServer.Instance.Config(false, context.contextUser);
            const doc = await context.provider.GetEntityObject<MJEntityDocumentEntityExtended>('MJ: Entity Documents', context.contextUser);
            if (!(await doc.Load(EntityDocumentID))) {
                throw new Error(`Entity Document '${EntityDocumentID}' not found`);
            }
            const rendered = await TemplateEngineServer.Instance.RenderTemplateSimple(doc.TemplateText, Record);
            if (!rendered.Success) {
                throw new Error(rendered.Message ?? 'entity document render failed');
            }
            return rendered.Output ?? '';
        };
    }
}
