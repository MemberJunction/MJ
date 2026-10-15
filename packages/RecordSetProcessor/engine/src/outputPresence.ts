/**
 * @fileoverview Output presence — which records still hold what an `OutputMapping` writes, for a processor that records
 * its answers as Feature Values (Infer). The watermark gate asks it before skipping a record whose input is unchanged: a
 * record whose outputs were deleted or cleared since it was processed is processed again instead of being skipped
 * until its input changes, while an output the pipeline answered empty stays skipped.
 * @module @memberjunction/record-set-processor
 */

import { CompositeKey, type EntityInfo, type IMetadataProvider, RunView, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import {
    FeatureValueCacheService, type DataFeatureOutput, type LatestFeatureValueRecordRow, type TypedFeatureValue,
} from '@memberjunction/feature-pipelines';
import type { RecordRef } from '@memberjunction/record-set-processor-base';
import { OutputMappingWriter, type ChildRecordMapping, type OutputMappingConfig } from './writeBack';
import { FeaturePipelineHumanValueGuard } from './processors/FeaturePipelineHumanValueGuard';

/**
 * A processor that records every answer, empty ones included, as a `Source='Pipeline'` Feature Value in each record's
 * write-back unit (InferProcessor). Only such a processor's outputs are checked: for one that records nothing, an
 * output that looks missing may be a legitimately empty answer, and re-running it to find out is paid and has side
 * effects (an Action or Agent).
 */
export interface RecordedAnswerSource {
    /** The outputs whose answers are recorded; empty when none are. */
    RecordedAnswerOutputs(): DataFeatureOutput[];
}

/** Where a pipeline's recorded answers are kept. */
export interface RecordedAnswers {
    /** The pipeline (`MJ: Record Processes` ID). */
    RecordProcessID: string;
    /** The processed records' entity. */
    EntityID: string;
    /** The outputs whose answers are recorded. */
    Outputs: DataFeatureOutput[];
}

/** What an output check reads for. */
export interface OutputPresenceOptions {
    /** The output mapping whose targets are checked. */
    OutputMapping: OutputMappingConfig;
    /** The records to check; all of one entity. */
    Records: RecordRef[];
    /** The run's provider: the reads run on it. */
    Provider: IMetadataProvider;
    /** The user the reads run as. */
    ContextUser: UserInfo;
    /** The pipeline's recorded answers: a target that looks missing is present when its latest answer was empty. */
    Answers: RecordedAnswers;
    /** The run's foreign-key lookup cache (positive hits), shared with its write-backs. */
    LookupCache: Map<string, string | number>;
}

/**
 * One row of a target read. `unknown` values: the columns are config-named (the mapping's fields and parent fields), so
 * no entity type describes them.
 */
type OutputRow = Record<string, unknown>;

/** A mapped field of the processed record and the output whose answer it holds. */
interface FieldTarget {
    /** The entity's field name. */
    Field: string;
    /** The output that writes it. */
    Output: DataFeatureOutput;
}

/** A child mapping and the output whose answer its rows hold. */
interface ChildTarget {
    /** The mapping. */
    Config: ChildRecordMapping;
    /** The parent field, as the child entity names it. */
    ParentField: string;
    /** The output that writes the rows. */
    Output: DataFeatureOutput;
}

/** The targets a check reads, and what the batch's reads found. */
interface TargetReads {
    /** The processed records' entity, when a field target is read. */
    Entity?: EntityInfo;
    Fields: FieldTarget[];
    Children: ChildTarget[];
    /** The processed records' rows by comparable key, when a field target is read. */
    Rows: Map<string, OutputRow>;
    /** Per child target, the normalised IDs of the records that have a row. */
    Parents: Set<string>[];
    /** Each record's latest recorded answer per feature (normalised record ID, lower-cased feature name). */
    Answers: Map<string, Map<string, TypedFeatureValue>>;
}

/** Thrown when the outputs cannot be read: they are unknown, so the caller must not treat the records as holding them. */
export class OutputPresenceReadError extends Error {
    constructor(entityName: string, message: string) {
        super(`Reading the outputs in '${entityName}' failed: ${message}`);
        this.name = 'OutputPresenceReadError';
    }
}

/**
 * Checks which records hold the outputs of an output mapping, for a pipeline that records its answers. A target is
 * present when it holds a value (a non-null mapped field; at least one child row under the record), or when the
 * record's latest recorded answer for it was empty: null, `[]`, or for a field a value whose stored form is null (a
 * lookup miss, resolved read-only as the human-value guard resolves "what the pipeline last wrote"). A target that
 * looks missing after a non-empty answer, or with no answer recorded, is missing. A target no recorded output writes
 * is not checked, and neither are tags (linked after the write-back commits). The targets are the ones write-back
 * resolves ({@link OutputMappingWriter.ChildMappingsOf}, {@link OutputMappingWriter.FieldInfoFor},
 * {@link OutputMappingWriter.ParentFieldOf}); every read of a batch — targets and answers — is one `RunViews` call.
 */
export class OutputMappingPresence {
    /**
     * The records that hold every checked output of the mapping.
     * @param opts - the mapping, the records, the recorded answers, and the provider and user to read with
     * @returns the `RecordID`s, as given, of the records holding their outputs; all of them when nothing is checked
     * @throws OutputPresenceReadError when a read fails or the records' entity is not in metadata
     */
    public static async RecordsWithOutputs(opts: OutputPresenceOptions): Promise<Set<string>> {
        const all = new Set(opts.Records.map((r) => r.RecordID));
        if (opts.Records.length === 0) {
            return all;
        }
        const entity = OutputMappingPresence.EntityOf(opts);
        const fields = OutputMappingPresence.FieldTargets(opts, entity);
        const children = OutputMappingPresence.ChildTargets(opts);
        if (fields.length === 0 && children.length === 0) {
            return all;
        }
        const reads = await OutputMappingPresence.Read(opts, entity, fields, children);
        const storedForms = await OutputMappingPresence.ResolveStoredForms(opts, reads);
        return new Set(opts.Records.filter((record) => OutputMappingPresence.HoldsOutputs(record, reads, storedForms)).map((r) => r.RecordID));
    }

    /**
     * The stored form of every distinct non-empty field answer whose target holds nothing, keyed by
     * {@link StoredFormKey}. Each distinct (field, answer) pair is resolved once per batch, all in parallel, with
     * write-back's read-only lookup ({@link OutputMappingWriter.ResolveStoredForm}): a batch whose records share one
     * unmatched answer costs one lookup read, not one per record. The memo is local to the check, so caching a miss here
     * cannot downgrade a stricter lookup policy elsewhere (the lookup is read-only).
     */
    protected static async ResolveStoredForms(opts: OutputPresenceOptions, reads: TargetReads): Promise<Map<string, unknown>> {
        const pending = new Map<string, { Field: string; Value: unknown }>();
        const entity = reads.Entity;
        if (entity) {
            for (const record of opts.Records) {
                for (const target of reads.Fields) {
                    const value = OutputMappingPresence.NonEmptyAnswerOfMissingField(record, target, reads);
                    if (value !== null) {
                        pending.set(OutputMappingPresence.StoredFormKey(target.Field, value), { Field: target.Field, Value: value });
                    }
                }
            }
        }
        const resolved = new Map<string, unknown>();
        if (!entity || pending.size === 0) {
            return resolved;
        }
        const writer = OutputMappingPresence.LookupWriter(opts);
        await Promise.all([...pending].map(async ([key, pair]) => {
            resolved.set(key, await writer.ResolveStoredForm(entity, pair.Field, pair.Value));
        }));
        return resolved;
    }

    /**
     * A record's recorded answer for a field target whose value is missing, when that answer is non-empty (so its
     * stored form decides); null when the field holds a value or the answer is absent or empty.
     * `unknown`: a recorded answer carries no compile-time type.
     */
    protected static NonEmptyAnswerOfMissingField(record: RecordRef, target: FieldTarget, reads: TargetReads): unknown {
        if (!reads.Entity || !OutputMappingPresence.FieldIsMissing(record, target, reads)) {
            return null;
        }
        const answer = OutputMappingPresence.AnswerOf(record, target.Output, reads);
        if (!answer) {
            return null;
        }
        const value = FeatureValueCacheService.NativeValueOf(answer);
        return OutputMappingPresence.IsEmptyAnswer(value) ? null : value;
    }

    /** The memo key of a (field, answer) pair: the field and the answer's JSON. */
    protected static StoredFormKey(field: string, value: unknown): string {
        return `${field.toLowerCase()}|${JSON.stringify(value)}`;
    }

    /**
     * The mapped fields the records' entity declares and a recorded output writes. A mapped field the entity does not
     * declare cannot hold a value (write-back fails on it); one no recorded output writes cannot be told apart from an
     * empty answer, so it is not checked.
     */
    protected static FieldTargets(opts: OutputPresenceOptions, entity: EntityInfo | undefined): FieldTarget[] {
        const targets: FieldTarget[] = [];
        for (const mapped of Object.keys(opts.OutputMapping.fields || {})) {
            const field = OutputMappingWriter.FieldInfoFor(entity, mapped)?.Name;
            const output = FeaturePipelineHumanValueGuard.OutputWritingField(opts.Answers.Outputs, mapped);
            if (field && output) {
                targets.push({ Field: field, Output: output });
            }
        }
        return targets;
    }

    /** The child mappings a recorded output writes (same child entity and parent field, case-insensitively). */
    protected static ChildTargets(opts: OutputPresenceOptions): ChildTarget[] {
        const targets: ChildTarget[] = [];
        for (const { Config } of OutputMappingWriter.ChildMappingsOf(opts.OutputMapping)) {
            const parentField = OutputMappingWriter.ParentFieldOf(Config);
            const output = opts.Answers.Outputs.find((o) => o.Target.Mode === 'child'
                && o.Target.EntityName.toLowerCase() === Config.entity.toLowerCase()
                && o.Target.ParentField.toLowerCase() === parentField.toLowerCase());
            if (output) {
                const childEntity = opts.Provider.EntityByName(Config.entity);
                targets.push({ Config, ParentField: OutputMappingWriter.FieldInfoFor(childEntity, parentField)?.Name || parentField, Output: output });
            }
        }
        return targets;
    }

    /**
     * The records' entity when the mapping writes fields of the record; undefined when it writes none.
     * @throws OutputPresenceReadError when the entity is not in metadata
     */
    protected static EntityOf(opts: OutputPresenceOptions): EntityInfo | undefined {
        if (Object.keys(opts.OutputMapping.fields || {}).length === 0) {
            return undefined;
        }
        const entity = opts.Provider.EntityByID(opts.Records[0].EntityID);
        if (!entity) {
            throw new OutputPresenceReadError(opts.Records[0].EntityID, 'the entity is not in metadata');
        }
        return entity;
    }

    /**
     * Reads the targets and the recorded answers for the batch in one `RunViews` call: the record's fields (one view),
     * each child mapping (one view each), then the latest answers of the targets' outputs
     * ({@link FeatureValueCacheService.LatestValuesView}, the batched form of the read the human-value guard makes).
     * @throws OutputPresenceReadError when a view fails
     */
    protected static async Read(opts: OutputPresenceOptions, entity: EntityInfo | undefined, fields: FieldTarget[], children: ChildTarget[]): Promise<TargetReads> {
        const params: RunViewParams[] = [];
        if (entity && fields.length > 0) {
            params.push(OutputMappingPresence.FieldView(opts, entity, fields));
        }
        params.push(...children.map((c) => OutputMappingPresence.ChildView(opts, c)));
        const features = [...new Set([...fields, ...children].map((t) => t.Output.Name))];
        params.push(FeatureValueCacheService.LatestValuesView({
            RecordProcessID: opts.Answers.RecordProcessID, EntityID: opts.Answers.EntityID,
            RecordIDs: opts.Records.map((r) => r.RecordID), FeatureNames: features, Source: 'Pipeline',
        }));
        const results = await RunView.FromMetadataProvider(opts.Provider).RunViews<OutputRow>(params, opts.ContextUser);
        const rowsOf = (i: number): OutputRow[] => {
            const result = results[i];
            if (!result || !result.Success) {
                throw new OutputPresenceReadError(params[i].EntityName || '', result?.ErrorMessage || 'no result returned');
            }
            return result.Results || [];
        };
        const fieldOffset = entity && fields.length > 0 ? 1 : 0;
        const rows = new Map<string, OutputRow>();
        if (entity && fieldOffset === 1) {
            for (const row of rowsOf(0)) {
                rows.set(OutputMappingPresence.KeyText(CompositeKey.FromEntityRecord(entity, row)), row);
            }
        }
        const parents = children.map((c, i) => new Set(rowsOf(fieldOffset + i).map((row) => NormalizeUUID(String(row[c.ParentField])))));
        const answerRows = rowsOf(params.length - 1).filter(OutputMappingPresence.IsAnswerRow);
        return { Entity: entity, Fields: fields, Children: children, Rows: rows, Parents: parents, Answers: FeatureValueCacheService.LatestValuesOf(answerRows) };
    }

    /**
     * The view of the record's mapped fields: its primary key and the target fields, for the batch's records (an `IN`
     * list for a single-column key, else one clause per record).
     */
    protected static FieldView(opts: OutputPresenceOptions, entity: EntityInfo, fields: FieldTarget[]): RunViewParams {
        const keys = entity.PrimaryKeys.map((pk) => pk.Name);
        const filter = keys.length === 1
            ? `${keys[0]} IN (${opts.Records.map((r) => `'${EscapeSQLString(String(CompositeKey.FromURLSegment(entity, r.RecordID).GetValueByIndex(0)))}'`).join(', ')})`
            : opts.Records.map((r) => `(${CompositeKey.FromURLSegment(entity, r.RecordID).ToWhereClause()})`).join(' OR ');
        return {
            EntityName: entity.Name,
            Fields: [...keys, ...fields.map((f) => f.Field)],
            ExtraFilter: filter,
            BypassCache: true, // the check must see a value cleared moments ago
        };
    }

    /**
     * The view of one child mapping's parent field, for the rows under the batch's records. It matches the parent
     * field to the record's ID exactly as write-back writes and reconciles them (`parentField = RecordID`,
     * `OutputMappingWriter.LoadExistingChildren`), so a parent with a composite key shares write-back's limitation.
     */
    protected static ChildView(opts: OutputPresenceOptions, target: ChildTarget): RunViewParams {
        return {
            EntityName: target.Config.entity,
            Fields: [target.ParentField],
            ExtraFilter: `${target.ParentField} IN (${opts.Records.map((r) => `'${EscapeSQLString(r.RecordID)}'`).join(', ')})`,
            BypassCache: true, // the check must see a row deleted moments ago
        };
    }

    /**
     * Whether a record holds every checked target, or its latest answer for a missing one was empty: null, `[]`, or for
     * a field an answer whose stored form ({@link ResolveStoredForms}) is null. A missing target with a non-empty answer,
     * or with no answer recorded, is missing.
     */
    protected static HoldsOutputs(record: RecordRef, reads: TargetReads, storedForms: Map<string, unknown>): boolean {
        for (const target of reads.Fields) {
            if (!OutputMappingPresence.FieldIsMissing(record, target, reads)) {
                continue;
            }
            const answer = OutputMappingPresence.AnswerOf(record, target.Output, reads);
            if (!answer) {
                return false;
            }
            const value = FeatureValueCacheService.NativeValueOf(answer);
            if (!OutputMappingPresence.IsEmptyAnswer(value)) {
                // ResolveStoredForms resolved every such pair; a non-null stored form means the output was cleared
                const stored = storedForms.get(OutputMappingPresence.StoredFormKey(target.Field, value));
                if (stored !== null && stored !== undefined) {
                    return false;
                }
            }
        }
        for (let i = 0; i < reads.Children.length; i++) {
            if (reads.Parents[i].has(NormalizeUUID(record.RecordID))) {
                continue;
            }
            const answer = OutputMappingPresence.AnswerOf(record, reads.Children[i].Output, reads);
            if (!answer || !OutputMappingPresence.IsEmptyAnswer(FeatureValueCacheService.NativeValueOf(answer))) {
                return false;
            }
        }
        return true;
    }

    /** Whether a field target of the record holds nothing (null, or the record's row was not read back). */
    protected static FieldIsMissing(record: RecordRef, target: FieldTarget, reads: TargetReads): boolean {
        if (!reads.Entity) {
            return false;
        }
        const row = reads.Rows.get(OutputMappingPresence.KeyText(CompositeKey.FromURLSegment(reads.Entity, record.RecordID)));
        const value = row ? row[target.Field] : null;
        return value === null || value === undefined;
    }

    /** The record's latest recorded answer for an output; undefined when none was recorded. */
    protected static AnswerOf(record: RecordRef, output: DataFeatureOutput, reads: TargetReads): TypedFeatureValue | undefined {
        return reads.Answers.get(NormalizeUUID(record.RecordID))?.get(output.Name.toLowerCase());
    }

    /**
     * Whether an answer is empty: null or an empty array. `unknown`: a recorded answer carries no compile-time type.
     */
    protected static IsEmptyAnswer(value: unknown): boolean {
        return value === null || (Array.isArray(value) && value.length === 0);
    }

    /**
     * A writer used only for `ResolveStoredForm`, write-back's read-only lookup of a recorded field answer. It writes
     * nothing; its lookups run on the run's provider with the mapping's lookup settings and the run's lookup cache. Its
     * `Record` is a batch record: the lookup does not read it.
     */
    protected static LookupWriter(opts: OutputPresenceOptions): OutputMappingWriter {
        return new OutputMappingWriter({
            Record: opts.Records[0], Provider: opts.Provider, LookupProvider: opts.Provider, ContextUser: opts.ContextUser,
            Result: { updatedRecord: false, changed: false }, OverwriteHumanValues: false,
            FieldLookups: opts.OutputMapping.fieldLookups, LookupCache: opts.LookupCache, DryRun: true,
        });
    }

    /** Whether a row of the answers view has the columns a recorded answer needs (the view returns config-shaped rows). */
    protected static IsAnswerRow(row: OutputRow): row is OutputRow & LatestFeatureValueRecordRow {
        return typeof row.RecordID === 'string' && typeof row.FeatureName === 'string';
    }

    /**
     * A key's comparable text: field names and values normalised as SQL Server compares them (case-insensitively), so a
     * key read back from the database matches the record's however its UUIDs are cased.
     * @param key - the record's key
     */
    protected static KeyText(key: CompositeKey): string {
        return key.KeyValuePairs.map((p) => `${p.FieldName.toLowerCase()}=${NormalizeUUID(String(p.Value))}`).join('&');
    }
}
