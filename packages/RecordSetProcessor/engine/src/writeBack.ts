/**
 * @fileoverview Output-mapping write-back — applies a work's structured result back onto the data
 * model per an `OutputMapping` config: update fields on the processed record and/or write child
 * records (inserted, or reconciled on their key so a re-run is idempotent), in one entity transaction.
 * Reads from the result use the generic value-mapping resolver (`$` = the result root).
 * @module @memberjunction/record-set-processor
 */

import { BaseEntity, CompositeKey, DatabaseProviderBase, type EntityFieldInfo, EntityFieldTSType, type EntityInfo, IMetadataProvider, type IRunViewProvider, LogStatus, RunInEntityTransaction, RunView, UserInfo, LogError } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual, resolveMappingRef } from '@memberjunction/global';
import type { RecordProcessorContext, RecordRef, RecordResult, TagWriteBackPreview, WriteBackChildChange, WriteBackFieldChange, WriteBackResult } from '@memberjunction/record-set-processor-base';
import { TagEngine, TaxonomyMode } from '@memberjunction/tag-engine';
import type { MJTagEntity } from '@memberjunction/core-entities';
import { MetadataProviderCapabilities } from '@memberjunction/feature-pipelines';

/** Provenance information about the executing process run, passed down to write-back and mapped via `$run.*`. */
export interface RunProvenance {
    ProcessRunID?: string;
    RecordProcessID?: string;
    PromptID?: string;
    PromptVersionHash?: string;
    AIPromptRunID?: string;
    ExecutedAt?: string;
    FeatureValueCacheID?: string;
}

/**
 * One ownership question write-back asks a {@link HumanValueGuard} about a field that holds a value and is about to
 * change. The values are `unknown` on purpose: a field value of any entity, the type `BaseEntity.Get` returns.
 */
export interface HumanValueQuestion {
    /** The mapped (config-named) field. */
    FieldName: string;
    /** The field's current value; never empty (an empty field holds no human value and is not asked about). */
    CurrentValue: unknown;
    /**
     * Read-only: the stored form of a value the pipeline produced (e.g. a seniority name to its ID) by the mapping's
     * lookup rules. A lookup miss resolves to null ("cannot match"): nothing is created and nothing throws.
     */
    Resolve: (pipelineValue: unknown) => Promise<unknown>;
    /**
     * Whether a stored value equals a resolved pipeline value by the field's type: decimals at the column's scale,
     * dates by instant, UUIDs by `UUIDsEqual`, text with case and trailing spaces ignored (the key collation's sense).
     */
    Equals: (stored: unknown, resolved: unknown) => boolean;
    /** The write-back unit's provider: the guard's reads and writes run on it, inside the unit's transaction. */
    Provider: IMetadataProvider;
}

/** Decides whether a target field's current value was entered by a person, records it, and retires it. */
export interface HumanValueGuard {
    /** True when the field's current value must be preserved. */
    IsHumanOwned(question: HumanValueQuestion): Promise<boolean>;
    /**
     * Records the preserved human value (a `Source='Human'` Feature Value) on the unit's provider.
     * `currentValue` is `unknown` for the reason {@link HumanValueQuestion} gives.
     */
    RecordPreserved(fieldName: string, currentValue: unknown, provider: IMetadataProvider): Promise<void>;
    /**
     * Retires the record's Human value of the field, because a run that overwrites human values wrote it: the field is
     * the pipeline's again. Deletes through the entity layer (Record Changes keeps the history).
     * @returns whether a Human value existed and was retired
     */
    RetireHumanValue(fieldName: string, provider: IMetadataProvider): Promise<boolean>;
}

/**
 * The targets whose answer a record's result withheld (a Feature Pipeline output below its confidence floor): the
 * record's fields, which write-back clears when the pipeline wrote their value (a person's value is kept), and the child
 * entities, whose mappings write-back skips (their rows stay as they are).
 */
export interface WithheldWriteBackTargets {
    /** Fields of the processed record mapped to null, through the human-value guard (names compare case-insensitively). */
    Fields: string[];
    /** Child entities whose mappings to skip (names compare case-insensitively). */
    ChildEntities: string[];
}

/** A processor whose results can withhold some of their write-back targets (InferProcessor's confidence floors). */
export interface WithheldTargetSource {
    /** The targets one successful result withholds; undefined when it withholds none. */
    WithheldWriteBackTargets(result: RecordResult): WithheldWriteBackTargets | undefined;
}

/** Membership checks on {@link WithheldWriteBackTargets}. */
export class WithheldTargets {
    /** Whether `field` is withheld (case-insensitive); false without withheld targets. */
    public static HasField(withheld: WithheldWriteBackTargets | undefined, field: string): boolean {
        return WithheldTargets.includes(withheld?.Fields, field);
    }

    /** Whether the entity's column `field` does not allow null (names compare case-insensitively); false for an undeclared field. */
    public static ColumnRequiresValue(entity: EntityInfo, field: string): boolean {
        const wanted = field.trim().toLowerCase();
        return entity.Fields.find((f) => f.Name.toLowerCase() === wanted)?.AllowsNull === false;
    }

    /** Whether the child entity `entity` is withheld (case-insensitive); false without withheld targets. */
    public static HasChildEntity(withheld: WithheldWriteBackTargets | undefined, entity: string): boolean {
        return WithheldTargets.includes(withheld?.ChildEntities, entity);
    }

    /** Whether a name list holds `name`, trimmed and case-insensitively, as metadata names compare. */
    private static includes(names: string[] | undefined, name: string): boolean {
        const wanted = name.trim().toLowerCase();
        return (names || []).some((n) => n.trim().toLowerCase() === wanted);
    }
}

/** A processor that can say which of its target values a person entered (InferProcessor). */
export interface HumanValueGuardSource {
    /** The guard for one record, or undefined when the run cannot tell (no pipeline, entity or spec). */
    CreateHumanValueGuard(record: RecordRef, context: RecordProcessorContext): HumanValueGuard | undefined;
}

/** Foreign-key lookup configuration for resolving a name or match field to a foreign-key ID. */
export interface FieldLookupConfig {
    /** Target related entity name or ID to look up against. Derived from field metadata if omitted. */
    relatedEntity?: string;
    /** Column on the related entity to match against (default 'Name'). */
    matchField?: string;
    /** Policy when lookup yields no matching record: 'null' (write null), 'fail' (throw error), 'create' (create new record and use its ID). Default 'null'. Note: 'create' creates a new record setting only matchField, intended for lookup/type tables where other columns are nullable or have defaults. */
    onLookupMiss?: 'null' | 'fail' | 'create';
}

/** Child record mapping configuration, supporting optional array fan-out. */
export interface ChildRecordMapping {
    /** Target child entity name. */
    entity: string;
    /** FK field on the child set to the processed record's primary key. */
    parentField: string;
    /** Map of `ChildFieldName -> resultRef`. */
    map: Record<string, string>;
    /** Optional ref resolving to an array for fan-out (one child row per array element). */
    fanOutRef?: string;
    /** Reconcile this mapping's rows on their key instead of always inserting. */
    reconcile?: ChildReconcileConfig;
}

/** How a child mapping's rows are reconciled with existing rows under the same parent (idempotent re-runs). */
export interface ChildReconcileConfig {
    /** Child fields identifying a row within its parent, e.g. ["JobFunctionID"]. */
    keyFields: string[];
    /** Field naming who wrote a row, e.g. "Source". A row whose value differs from derivedSourceValue is human-owned. Without it every row counts as pipeline-written. */
    sourceField?: string;
    /** The sourceField value of pipeline-written rows, e.g. "Derived". */
    derivedSourceValue?: string;
    /**
     * Delete pipeline-written rows the new result no longer contains (default true). An explicit empty answer (the
     * fan-out value is `[]`) proposes nothing, so it deletes every pipeline row; a missing or null answer changes
     * nothing. Human rows are never deleted. Requires `sourceField` and `derivedSourceValue` — without them no row can
     * be told apart as human, so a config with `deleteStale` on and either missing is refused.
     */
    deleteStale?: boolean;
}

/** Tag output mapping configuration for taxonomy linking. */
export interface TagOutputMapping {
    /** Result path resolving to a tag string or string array (e.g. "$.tags"). */
    ref: string;
    /** Root tag this feature's values must live under. Required. */
    rootTagId: string;
    /** How deep below the root a value may be placed/created. 1 = direct children only. */
    maxDepth?: number;
    /** Maps to TagEngine's TaxonomyMode. Default 'constrained'. */
    growth?: 'constrained' | 'auto-grow' | 'hybrid';
    /** Minimum semantic-match score to accept an existing tag. */
    matchThreshold?: number;
    /** Entity the TaggedItem points at. Default: the processed entity. */
    taggedEntityName?: string;
}

/** Declarative description of how a work's structured output is written back. */
export interface OutputMappingConfig {
    /** Map of `EntityFieldName -> resultRef` (e.g. `{ "Satisfaction": "$.satisfaction" }`) applied to the processed record. */
    fields?: Record<string, string>;
    /** Optional foreign-key lookup configurations per target field name. */
    fieldLookups?: Record<string, FieldLookupConfig>;
    /** Optional single child record to write from the result (kept for backward compatibility). */
    childRecord?: ChildRecordMapping;
    /** Optional child records to write from the result, supporting fan-out over arrays and reconcile on a key. */
    childRecords?: ChildRecordMapping[];
    /** Optional tags to link or create via the MJ Tagging system. */
    tags?: TagOutputMapping[];
}

/** One resolved child row to write, and the mapping it came from. */
export interface ChildToWrite {
    /** The child entity name. */
    Entity: string;
    /** Field values, the parent foreign key included. */
    Data: Record<string, unknown>;
    /** Whether the row came from the single `childRecord` mapping (reported as `createdChildID`). */
    IsLegacySingle: boolean;
    /** The mapping that produced the row. */
    Config: ChildRecordMapping;
}

/**
 * One child mapping's answer: the rows the result proposes for it. An empty `Rows` is an explicit "none" (the result
 * held an empty array), which lets a reconcile mapping delete its stale rows. A mapping whose fan-out value is missing
 * or null has no answer at all and is not passed to the writer, so nothing of it changes.
 */
export interface ChildMappingAnswer {
    /** The mapping. */
    Config: ChildRecordMapping;
    /** The rows proposed for it, in result order; may be empty. */
    Rows: ChildToWrite[];
}

/** What an {@link OutputMappingWriter} writes for. */
export interface OutputMappingWriterOptions {
    /** The processed record. */
    Record: RecordRef;
    /** The unit provider `MetadataProviderCapabilities.RunIsolated` picked for this write-back (an instance minted from the caller's provider, or the caller's provider when it holds a transaction or cannot mint one): every read, save and the transaction run on it. */
    Provider: IMetadataProvider;
    /**
     * The caller's provider. Foreign-key lookups, and a lookup row created on a miss, run on it, including the lookups
     * the human-value guard's `Resolve` makes while the unit is open. That keeps them outside the write transaction
     * (for the reason {@link ApplyOutputMapping} gives) except when the caller holds a transaction on it: then
     * `MetadataProviderCapabilities.RunIsolated` joins that transaction, these lookups run inside it too, and the lookup cache is not used
     * ({@link CanCacheLookups}).
     */
    LookupProvider: IMetadataProvider;
    /** The user every read and write runs as. */
    ContextUser: UserInfo;
    /** The result being built; the writer fills its write fields. */
    Result: WriteBackResult;
    /** Overwrite values a person entered. */
    OverwriteHumanValues: boolean;
    /** Decides which current values a person entered; absent = no guard. */
    HumanGuard?: HumanValueGuard;
    /** The mapping's foreign-key lookup settings per field. */
    FieldLookups?: Record<string, FieldLookupConfig>;
    /**
     * Positive lookup hits shared by every record of the run (`${relatedEntity}|${matchField}|${value}` → key). Not
     * read or written while the caller holds a transaction ({@link CanCacheLookups}).
     */
    LookupCache: Map<string, string | number>;
    /** Compute-only: an `onLookupMiss: 'create'` miss is previewed, not created. */
    DryRun: boolean;
    /**
     * Fields whose answer was withheld (an abstention). The guard always decides them, whatever `OverwriteHumanValues`
     * says (overwriting lets an answer replace a person's value; an abstention is no answer), and their Human values are
     * never retired. With no {@link HumanGuard} a withheld field keeps its value: nothing can confirm the pipeline wrote
     * it. That happens on a run that names no pipeline, and on a direct `Process()` call whose context lacks
     * `recordProcessID` or `entityID` (`InferProcessor.CreateHumanValueGuard` returns no guard then);
     * `RecordProcessExecutor` always passes both.
     */
    Withheld?: WithheldWriteBackTargets;
}

/** A value that is already a key, not a match string: a UUID in any case, surrounding whitespace allowed. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SQL types whose values are stored rounded to the column's scale. */
const SCALED_DECIMAL_TYPES: ReadonlySet<string> = new Set(['decimal', 'numeric', 'money', 'smallmoney']);

/** A value the real write stores in a foreign-key field, so it must exist as a row of the related entity. */
interface ForeignKeyRef {
    /** The entity being written (the processed record's, or a child's). */
    Entity: string;
    /** The foreign-key field. */
    Field: string;
    /** The value written to it, as the write sends it. */
    Value: string | number;
}

/** The related column a database foreign-key constraint checks, and the written values it must find there. */
interface ForeignKeyTarget {
    /** The related entity. */
    Related: EntityInfo;
    /** The related column the constraint references (`RelatedEntityFieldName`, else the related primary key). */
    Column: string;
    /** The values written to fields that reference that column. */
    Refs: ForeignKeyRef[];
}

/** One child row's values the real write stores: every value of an inserted row, the differing ones of an updated row. */
interface PlannedChildWrite {
    /** The proposal the row comes from. */
    Item: ChildToWrite;
    /** The values written. */
    Values: Record<string, unknown>;
}

/** The database's judgement of one sent foreign-key value ({@link OutputMappingWriter.JudgeKeyValues}). */
interface KeyValueJudgement {
    /** The related column's type converts the value. */
    Converts: boolean;
    /** A row of the related column holds it. */
    Found: boolean;
}

/** One row of the judgement read: the value as sent, and 1/0 flags. */
interface KeyValueJudgementRow {
    Value: string;
    Converts: number;
    Found: number;
}

/** What the write does with an existing child row a proposal matches ({@link OutputMappingWriter.RowDecision}). */
type ChildRowDecision = { Kind: 'human' } | { Kind: 'unchanged' } | { Kind: 'update'; Changes: Array<[string, unknown]> };

/** SQL character types, whose `MaxLength` limits a value's length. */
const CHARACTER_TYPES: ReadonlySet<string> = new Set(['char', 'varchar', 'nchar', 'nvarchar']);

/**
 * Writes one record's resolved output mapping: child rows (inserted, or reconciled on their key) and the record's
 * own fields. `ApplyOutputMapping` runs both inside one entity transaction, children first, so a failed child write
 * leaves the parent field unwritten. Each step is a protected method so a subclass can replace one of them.
 */
export class OutputMappingWriter {
    constructor(protected readonly Options: OutputMappingWriterOptions) {}

    /**
     * Whether the metadata provider can also run views. Server and client providers both do (`ProviderBase` implements
     * `IRunViewProvider`); the check narrows the type so a provider that cannot is refused without a cast.
     * @param p - the caller's provider
     */
    public static IsRunViewProvider(p: IMetadataProvider): p is IMetadataProvider & IRunViewProvider {
        return 'RunView' in p && typeof p.RunView === 'function';
    }

    /**
     * Normalises one part of a reconcile key so a proposal matches the existing row the database would treat as the
     * same key. Null and undefined become ''. A uniqueidentifier goes through `NormalizeUUID` (trimmed, lower-cased:
     * either case matches). Any other value is converted with `String()`, its TRAILING whitespace removed (SQL Server
     * ignores trailing spaces when comparing strings; leading spaces are significant and kept) and lower-cased.
     * Assumption: the key column uses a case-insensitive collation (SQL Server's default `_CI_` collations, which MJ
     * installs use), where keys differing only in case collide on the unique index. On a case-sensitive (`_CS_`)
     * column such keys are distinct rows, and this normalisation would wrongly match them.
     * @param field - the key field's metadata, when the entity declares it
     * @param v - a mapped value or an entity field value; `unknown` because both come from config-named fields
     *   (`resolveMappingRef` output and `BaseEntity.Get`), which carry no compile-time type.
     */
    public static NormalizeKeyPart(field: EntityFieldInfo | undefined, v: unknown): string {
        if (v === null || v === undefined) {
            return '';
        }
        return field?.IsUniqueIdentifier ? NormalizeUUID(String(v)) : String(v).trimEnd().toLowerCase();
    }

    /**
     * Whether a stored field value already equals a proposed one, by the field's type: uniqueidentifier via
     * `UUIDsEqual`; dates by instant; decimal/numeric/money rounded to the column's scale (the value the database
     * would store); other numbers numerically; booleans by truth value; text exactly (case and whitespace count).
     * Null and undefined are equal to each other only. A field the entity does not declare compares as exact text,
     * so an unknown type is written rather than wrongly skipped.
     * @param field - the field's metadata, when the entity declares it
     * @param stored - the record's current value (`BaseEntity.Get`)
     * @param proposed - the mapped value; both `unknown` for the reason given on {@link NormalizeKeyPart}
     */
    public static ValuesEqual(field: EntityFieldInfo | undefined, stored: unknown, proposed: unknown): boolean {
        const storedMissing = stored === null || stored === undefined;
        const proposedMissing = proposed === null || proposed === undefined;
        if (storedMissing || proposedMissing) {
            return storedMissing && proposedMissing;
        }
        if (field?.IsUniqueIdentifier) {
            return UUIDsEqual(String(stored), String(proposed));
        }
        switch (field?.TSType) {
            case EntityFieldTSType.Date:
                return OutputMappingWriter.DatesEqual(stored, proposed);
            case EntityFieldTSType.Number:
                return OutputMappingWriter.NumbersEqual(field, stored, proposed);
            case EntityFieldTSType.Boolean:
                return OutputMappingWriter.TruthOf(stored) === OutputMappingWriter.TruthOf(proposed);
            default:
                return String(stored) === String(proposed);
        }
    }

    /** Dates compare by instant; a value that is not a date compares as exact text. */
    protected static DatesEqual(stored: unknown, proposed: unknown): boolean {
        const a = stored instanceof Date ? stored.getTime() : new Date(String(stored)).getTime();
        const b = proposed instanceof Date ? proposed.getTime() : new Date(String(proposed)).getTime();
        return Number.isNaN(a) || Number.isNaN(b) ? String(stored) === String(proposed) : a === b;
    }

    /** Numbers compare numerically, rounded to the column's scale for scaled decimal types. */
    protected static NumbersEqual(field: EntityFieldInfo, stored: unknown, proposed: unknown): boolean {
        const a = Number(stored);
        const b = Number(proposed);
        if (Number.isNaN(a) || Number.isNaN(b)) {
            return String(stored) === String(proposed);
        }
        const scale = field.Scale;
        if (SCALED_DECIMAL_TYPES.has(field.Type.trim().toLowerCase()) && scale !== null && scale !== undefined) {
            return OutputMappingWriter.RoundToScale(a, scale) === OutputMappingWriter.RoundToScale(b, scale);
        }
        return a === b;
    }

    /**
     * Rounds half away from zero to `scale` digits, as SQL Server does on store. The relative-epsilon nudge makes a
     * binary value just under a half (0.12345 is 1234.4999… at scale 4) round the way its decimal digits read.
     */
    protected static RoundToScale(x: number, scale: number): number {
        const factor = 10 ** scale;
        return Math.sign(x) * Math.round(Math.abs(x) * factor * (1 + Number.EPSILON)) / factor;
    }

    /** A bit value's truth: true, 1, '1' and 'true' (any case) are true. */
    protected static TruthOf(v: unknown): boolean {
        return v === true || v === 1 || (typeof v === 'string' && ['1', 'true'].includes(v.trim().toLowerCase()));
    }

    /**
     * Writes every answered child mapping: reconciled mappings on their key (an empty answer deletes their stale
     * rows), the others as inserts.
     */
    public async WriteChildren(answers: ChildMappingAnswer[]): Promise<void> {
        const created = new Map<ChildToWrite, string>();
        for (const answer of answers) {
            if (answer.Config.reconcile) {
                await this.ReconcileChildren(answer.Config, answer.Config.reconcile, answer.Rows, created);
                continue;
            }
            for (const item of answer.Rows) {
                created.set(item, await this.InsertChild(item));
            }
        }
        this.RecordCreated(answers.flatMap((a) => a.Rows), created);
    }

    /**
     * Saves the record's mapped fields that differ from its current values and hold no value a person entered; saves
     * nothing when none differ. A run that overwrites human values then retires the Human value of every mapped
     * field: the fields hold what the pipeline wrote, whether or not this run had to change them.
     * @param entity - the processed record's entity
     * @param fields - the resolved field values (foreign keys already resolved)
     */
    public async WriteRecordFields(entity: EntityInfo, fields: Record<string, unknown>): Promise<void> {
        const obj = await this.LoadRecord(entity);
        if (!obj) {
            throw new Error(`applyOutputMapping: record '${this.Options.Record.RecordID}' of '${entity.Name}' not found`);
        }
        const changes = await this.FieldChanges(entity, obj, fields, true);
        if (changes.length > 0) {
            for (const [field, value] of changes) {
                obj.Set(field, value); // config-driven field names: no compile-time property exists
            }
            if (!(await obj.Save())) {
                throw new Error(`applyOutputMapping: failed updating '${entity.Name}' record '${this.Options.Record.RecordID}': ${obj.LatestResult?.CompleteMessage || 'unknown error'}`);
            }
            this.Options.Result.updatedRecord = true;
            this.Options.Result.changed = true;
        }
        // a withheld field's abstention is no answer, so it never retires the field's Human value
        await this.RetireHumanValues(Object.keys(fields).filter((f) => !WithheldTargets.HasField(this.Options.Withheld, f)));
    }

    /** The processed record, loaded on the writer's provider; null when it does not exist. */
    protected async LoadRecord(entity: EntityInfo): Promise<BaseEntity | null> {
        const obj = await this.Options.Provider.GetEntityObject<BaseEntity>(entity.Name, this.Options.ContextUser);
        // RecordID is the compact CompositeKey segment (bare value for a single column, "F1|v1||F2|v2" for composite).
        return (await obj.InnerLoad(CompositeKey.FromURLSegment(entity, this.Options.Record.RecordID))) ? obj : null;
    }

    /**
     * On a run that overwrites human values, retires each mapped field's Human value (sequentially: the deletes share
     * the unit's transaction). Without a guard, or on a run that keeps human values, nothing happens.
     */
    protected async RetireHumanValues(fieldNames: string[]): Promise<void> {
        const guard = this.Options.HumanGuard;
        if (!guard || !this.Options.OverwriteHumanValues) {
            return;
        }
        for (const field of fieldNames) {
            if (await guard.RetireHumanValue(field, this.Options.Provider)) {
                (this.Options.Result.retiredHumanFields ||= []).push(field);
                this.Options.Result.changed = true;
            }
        }
    }

    /**
     * The mapped fields whose value differs from the record's current value ({@link ValuesEqual}) and that do not hold
     * a value a person entered ({@link PreservesHumanValue}). Sequential: each guard question reads the database.
     * The one decision both the real write and the dry-run preview ({@link PreviewFields}) use.
     * @param recordPreserved - record each preserved human value (the real write); false for the preview, which writes nothing
     */
    protected async FieldChanges(entity: EntityInfo, obj: BaseEntity, fields: Record<string, unknown>,
        recordPreserved: boolean): Promise<Array<[string, unknown]>> {
        const changes: Array<[string, unknown]> = [];
        for (const [field, value] of Object.entries(fields)) {
            const current = obj.Get(field); // config-driven field name
            if (OutputMappingWriter.ValuesEqual(this.FieldInfoOf(entity, field), current, value)) {
                continue;
            }
            if (await this.PreservesHumanValue(entity, field, current, recordPreserved)) {
                continue;
            }
            changes.push([field, value]);
        }
        return changes;
    }

    /**
     * True when the field holds a value a person entered and the run does not overwrite it (a withheld field is never
     * overwritten: see {@link OutputMappingWriterOptions.Withheld}); with `recordPreserved`,
     * the preserved value is recorded through the guard and reported on the result. An empty field holds no human value, so the guard is not asked. The guard resolves
     * the pipeline's earlier answer read-only ({@link ResolveStoredForm}) and compares by the field's type
     * ({@link OwnedValuesEqual}).
     */
    protected async PreservesHumanValue(entity: EntityInfo, field: string, current: unknown, recordPreserved: boolean): Promise<boolean> {
        const guard = this.Options.HumanGuard;
        const fieldInfo = this.FieldInfoOf(entity, field);
        // A withheld field (an abstention) is cleared only when the guard says the pipeline owns its value: overwriting
        // human values lets an answer replace them, not an abstention erase them; without a guard (no pipeline, or a
        // direct Process() call without recordProcessID/entityID) nothing can say so, and the value is kept
        const withheld = WithheldTargets.HasField(this.Options.Withheld, field);
        if (OutputMappingWriter.NormalizeKeyPart(fieldInfo, current) === '') {
            return false;
        }
        if (!guard) {
            return withheld;
        }
        if (this.Options.OverwriteHumanValues && !withheld) {
            return false;
        }
        const owned = await guard.IsHumanOwned({
            FieldName: field, CurrentValue: current, Provider: this.Options.Provider,
            Resolve: (v) => this.ResolveStoredForm(entity, field, v),
            Equals: (stored, resolved) => OutputMappingWriter.OwnedValuesEqual(fieldInfo, stored, resolved),
        });
        if (!owned) {
            return false;
        }
        if (recordPreserved) {
            (this.Options.Result.preservedHumanFields ||= []).push(field);
            await guard.RecordPreserved(field, current, this.Options.Provider);
        }
        return true;
    }

    /**
     * Whether a stored value equals a value the pipeline wrote, for the ownership question. Typed fields (UUID, date,
     * number, boolean) compare by {@link ValuesEqual}: decimals at the column's scale, dates by instant, UUIDs by
     * `UUIDsEqual`. Text, and a field the entity does not declare, compares with case and trailing spaces ignored, as
     * the database's case-insensitive collation compares it: a value equal in that sense is the pipeline's own value,
     * re-read, not a person's edit. A null on either side never equals a value.
     * @param stored - the field's value; `unknown` for the reason given on {@link NormalizeKeyPart}
     * @param resolved - the pipeline's resolved value; likewise `unknown`
     */
    public static OwnedValuesEqual(field: EntityFieldInfo | undefined, stored: unknown, resolved: unknown): boolean {
        const typed = field && (field.IsUniqueIdentifier || field.TSType === EntityFieldTSType.Date
            || field.TSType === EntityFieldTSType.Number || field.TSType === EntityFieldTSType.Boolean);
        if (typed) {
            return OutputMappingWriter.ValuesEqual(field, stored, resolved);
        }
        if (stored === null || stored === undefined || resolved === null || resolved === undefined) {
            return (stored === null || stored === undefined) && (resolved === null || resolved === undefined);
        }
        return OutputMappingWriter.NormalizeKeyPart(field, stored) === OutputMappingWriter.NormalizeKeyPart(field, resolved);
    }

    /**
     * The stored form of one mapped field value: a match string (e.g. 'Director') becomes the related row's key with the
     * mapping's lookup rules (`onLookupMiss` null / fail / create); a UUID, or a value of a field that is not a foreign
     * key, is returned unchanged.
     * @param entity - the processed record's entity
     * @param field - the mapped (config-named) field
     * @param val - the mapped value; `unknown` because it comes from `resolveMappingRef`
     * @returns the value to write; `unknown` for the same reason
     */
    public async ResolveFieldValue(entity: EntityInfo, field: string, val: unknown): Promise<unknown> {
        return this.ResolveKey(entity, field, val, false);
    }

    /**
     * The stored form of a value the pipeline wrote earlier, for the ownership question. Read-only: a lookup miss —
     * under any `onLookupMiss` policy — resolves to null ("cannot match"); nothing is created and nothing throws.
     * @param val - an earlier pipeline answer (a stored Feature Value); `unknown` as on {@link ResolveFieldValue}
     */
    public async ResolveStoredForm(entity: EntityInfo, field: string, val: unknown): Promise<unknown> {
        return this.ResolveKey(entity, field, val, true);
    }

    /**
     * Shared body of {@link ResolveFieldValue} (applies the mapping's miss policy) and {@link ResolveStoredForm}
     * (`readOnly`: every miss is null).
     * @param val - a mapped value or an earlier pipeline answer; `unknown` because both come from config-named refs
     *   (`resolveMappingRef` output, a stored Feature Value's native value), which carry no compile-time type
     * @returns the value to write or compare: the input unchanged for a non-key field (so `unknown` for the same
     *   reason), a related key, or null
     */
    protected async ResolveKey(entity: EntityInfo, field: string, val: unknown, readOnly: boolean): Promise<unknown> {
        if (val === null || val === undefined) {
            return val;
        }
        const fieldInfo = this.FieldInfoOf(entity, field);
        const lookup = this.Options.FieldLookups?.[field];
        if (!lookup && !fieldInfo?.RelatedEntity && !fieldInfo?.RelatedEntityID) {
            return val; // not a foreign key
        }
        if (typeof val === 'string' && UUID_PATTERN.test(val.trim())) {
            return val.trim(); // already a key: no lookup
        }
        const onMiss = readOnly ? 'null' : lookup?.onLookupMiss || 'null';
        const match = OutputMappingWriter.MatchValueOf(val);
        if (match === null) {
            return this.UnresolvedKey(field, onMiss, `value is not a string or number (${Array.isArray(val) ? 'array' : typeof val})`);
        }
        const text = String(match).trim();
        if (text.length === 0) {
            return this.UnresolvedKey(field, onMiss, 'value resolved to an empty string');
        }
        const related = this.RelatedEntityNameOf(fieldInfo, lookup);
        if (!related) {
            return this.UnresolvedKey(field, onMiss, 'related entity unknown in metadata');
        }
        const matchField = lookup?.matchField || 'Name';
        if (!/^[a-zA-Z0-9_]+$/.test(matchField)) {
            throw new Error(`applyOutputMapping: invalid matchField identifier '${matchField}' for entity '${related}'`);
        }
        const cached = this.CanCacheLookups ? this.Options.LookupCache.get(`${related}|${matchField}|${text}`) : undefined;
        return cached !== undefined ? cached : this.LookupRelatedKey(field, related, matchField, text, onMiss);
    }

    /**
     * Whether the run-wide lookup cache may be read and written. Not while the caller holds a transaction on the
     * lookup provider: a row a lookup found or created inside it is gone if that transaction rolls back, and a cached
     * key would then point the next record at a row that does not exist.
     */
    protected get CanCacheLookups(): boolean {
        const provider = this.Options.LookupProvider;
        return !(provider instanceof DatabaseProviderBase && provider.TransactionDepth > 0);
    }

    /**
     * The match value inside a mapped value: an array's first element, or an object's `Name`, else the value itself;
     * null when that is not a string or number.
     * @param val - the mapped value; `unknown` because it comes from `resolveMappingRef` or a stored Feature Value
     */
    protected static MatchValueOf(val: unknown): string | number | null {
        const first: unknown = Array.isArray(val) && val.length > 0 ? val[0] : val; // unknown: an element of an untyped array
        const match: unknown = first !== null && typeof first === 'object' && 'Name' in first ? first.Name : first; // unknown: an untyped object's Name
        return typeof match === 'string' || typeof match === 'number' ? match : null;
    }

    /** A foreign key that cannot be resolved: null, or an error under `onLookupMiss: 'fail'`. */
    protected UnresolvedKey(field: string, onMiss: NonNullable<FieldLookupConfig['onLookupMiss']>, reason: string): null {
        if (onMiss === 'fail') {
            throw new Error(`applyOutputMapping: cannot resolve foreign key for field '${field}': ${reason}`);
        }
        return null;
    }

    /** The entity a foreign-key field points at: the lookup's `relatedEntity`, else the field's metadata. */
    protected RelatedEntityNameOf(fieldInfo: EntityFieldInfo | undefined, lookup: FieldLookupConfig | undefined): string | undefined {
        return OutputMappingWriter.RelatedEntityNameFor(this.Options.LookupProvider, fieldInfo, lookup);
    }

    /**
     * The entity a foreign-key field points at: the lookup's `relatedEntity`, else the field's `RelatedEntity`, else its
     * `RelatedEntityID` resolved on the provider. Undefined for a field that is not a foreign key.
     * @param provider - the provider whose metadata resolves `RelatedEntityID`
     * @param fieldInfo - the field's metadata, when the entity declares it
     * @param lookup - the mapping's lookup rules for the field, if any
     */
    public static RelatedEntityNameFor(provider: IMetadataProvider, fieldInfo: EntityFieldInfo | undefined,
        lookup: FieldLookupConfig | undefined): string | undefined {
        return lookup?.relatedEntity
            || fieldInfo?.RelatedEntity
            || (fieldInfo?.RelatedEntityID ? provider.EntityByID(fieldInfo.RelatedEntityID)?.Name : undefined);
    }

    /**
     * The key column of a lookup's related entity. Throws when the entity is not in metadata or has no primary key:
     * guessing `ID` would read or write the wrong column (`.claude/rules/data-access.md`).
     */
    protected PrimaryKeyNameOf(related: string): string {
        const key = this.Options.LookupProvider.EntityByName(related)?.FirstPrimaryKey; // first-pk-ok: a foreign key references a single-column primary key
        if (!key) {
            throw new Error(`applyOutputMapping: related entity '${related}' is not in metadata or has no primary key`);
        }
        return key.Name;
    }

    /**
     * Looks up the related row whose match field equals `text` on the caller's provider and returns its key; a hit is
     * cached for the run ({@link CanCacheLookups}). A miss follows `onMiss`: null (not cached, so a stricter policy
     * elsewhere is never downgraded), an error, or a new row.
     * @throws Error when the related row's key is not a string or number (it cannot be written to a foreign key)
     */
    protected async LookupRelatedKey(field: string, related: string, matchField: string, text: string,
        onMiss: NonNullable<FieldLookupConfig['onLookupMiss']>): Promise<string | number | null> {
        const provider = this.Options.LookupProvider;
        // Lookups run on the caller's provider only: one that cannot run views fails loudly
        // rather than falling back to the process-global connection.
        if (!OutputMappingWriter.IsRunViewProvider(provider)) {
            throw new Error(`applyOutputMapping: cannot resolve foreign key for field '${field}': RunView provider is unavailable`);
        }
        const keyName = this.PrimaryKeyNameOf(related);
        const res = await RunView.FromMetadataProvider(provider).RunView<Record<string, string | number | null>>({
            EntityName: related,
            ExtraFilter: `[${matchField}] = '${EscapeSQLString(text)}'`,
            Fields: [keyName],
            MaxRows: 1,
        }, this.Options.ContextUser);
        if (!res.Success) {
            throw new Error(`applyOutputMapping: RunView failed for lookup on '${related}': ${res.ErrorMessage || 'unknown error'}`);
        }
        const cacheKey = `${related}|${matchField}|${text}`;
        const row = res.Results?.[0];
        if (row) {
            const key = row[keyName]; // config-named key column
            if (typeof key !== 'string' && typeof key !== 'number') {
                throw new Error(`applyOutputMapping: lookup on '${related}' for field '${field}' found a row without a '${keyName}' key`);
            }
            this.CacheLookup(cacheKey, key);
            return key;
        }
        if (onMiss === 'fail') {
            throw new Error(`applyOutputMapping: lookup for '${field}' on entity '${related}' where [${matchField}]='${text}' matched 0 rows (OnLookupMiss=fail)`);
        }
        return onMiss === 'create' ? this.CreateLookupRow(related, matchField, text, keyName, cacheKey) : null;
    }

    /** Caches a lookup's key for the run, when {@link CanCacheLookups} allows. */
    protected CacheLookup(cacheKey: string, key: string | number): void {
        if (this.CanCacheLookups) {
            this.Options.LookupCache.set(cacheKey, key);
        }
    }

    /**
     * Creates the related row a `create` miss asks for (only its match field set; meant for lookup tables whose other
     * columns are nullable or defaulted) and caches its key. On a dry-run it returns a preview key and saves nothing.
     */
    protected async CreateLookupRow(related: string, matchField: string, text: string, keyName: string, cacheKey: string): Promise<string | number> {
        if (this.Options.DryRun) {
            return `preview-new-${related}-${text}`;
        }
        const row = await this.Options.LookupProvider.GetEntityObject<BaseEntity>(related, this.Options.ContextUser);
        row.NewRecord();
        row.Set(matchField, text); // config-driven match field
        if (!(await row.Save())) {
            throw new Error(`applyOutputMapping: failed creating new record in '${related}' with ${matchField}='${text}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        const id = row.Get(keyName); // config-named key column
        const key = typeof id === 'string' || typeof id === 'number' ? id : row.PrimaryKey.ToCompactURLSegment();
        this.Options.Result.changed = true; // the lookup row was written
        this.CacheLookup(cacheKey, key);
        return key;
    }

    /** A config-named field's metadata (names compare case-insensitively), or undefined when the entity does not declare it. */
    protected FieldInfoOf(entity: EntityInfo | undefined, field: string): EntityFieldInfo | undefined {
        return OutputMappingWriter.FieldInfoFor(entity, field);
    }

    /**
     * A config-named field's metadata: names compare case-insensitively, as the mapping's field names are matched
     * everywhere write-back resolves them. Undefined when the entity does not declare the field.
     * @param entity - the entity the field belongs to
     * @param field - the mapped (config-named) field
     */
    public static FieldInfoFor(entity: EntityInfo | undefined, field: string): EntityFieldInfo | undefined {
        const name = field.toLowerCase();
        return entity?.Fields?.find((f) => f.Name.toLowerCase() === name);
    }

    /**
     * Every child mapping of an output mapping, in write order: the single `childRecord` (flagged as such) first, then
     * `childRecords`. The one place write-back, and anything that checks what write-back wrote, reads them from.
     * @param outputMapping - the Record Process's output mapping
     */
    public static ChildMappingsOf(outputMapping: OutputMappingConfig): Array<{ Config: ChildRecordMapping; IsLegacySingle: boolean }> {
        const mappings: Array<{ Config: ChildRecordMapping; IsLegacySingle: boolean }> = [];
        if (outputMapping.childRecord) {
            mappings.push({ Config: outputMapping.childRecord, IsLegacySingle: true });
        }
        if (outputMapping.childRecords && Array.isArray(outputMapping.childRecords)) {
            for (const c of outputMapping.childRecords) {
                mappings.push({ Config: c, IsLegacySingle: false });
            }
        }
        return mappings;
    }

    /**
     * A child mapping's parent field, checked to be a plain identifier because it is written into a view filter. The
     * message names no operation: write-back and the output check both call it, and each reports its own context.
     * @param config - the child mapping
     * @throws Error when the parent field is not a plain identifier
     */
    public static ParentFieldOf(config: ChildRecordMapping): string {
        if (!/^[A-Za-z0-9_]+$/.test(config.parentField)) {
            throw new Error(`invalid parentField identifier '${config.parentField}' for '${config.entity}'`);
        }
        return config.parentField;
    }

    /** Inserts one child row; throws with the save's CompleteMessage when the save fails. */
    protected async InsertChild(item: ChildToWrite): Promise<string> {
        const child = await this.Options.Provider.GetEntityObject<BaseEntity>(item.Entity, this.Options.ContextUser);
        child.NewRecord();
        for (const [field, value] of Object.entries(item.Data)) {
            child.Set(field, value); // config-driven field names
        }
        if (!(await child.Save())) {
            throw new Error(`applyOutputMapping: failed creating '${item.Entity}' child: ${child.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        return child.PrimaryKey.ToCompactURLSegment();
    }

    /** Reports the inserted rows on the result (`createdChildID` = the single legacy mapping's row). */
    protected RecordCreated(items: ChildToWrite[], created: Map<ChildToWrite, string>): void {
        if (created.size === 0) {
            return;
        }
        this.Options.Result.createdChildIDs = [...created.values()];
        const single = items.find((i) => i.IsLegacySingle && created.has(i));
        if (single) {
            this.Options.Result.createdChildID = created.get(single);
        }
        this.Options.Result.changed = true;
    }

    /**
     * Reconciles one mapping's proposed rows with the parent's existing rows: inserts new keys, updates or keeps
     * existing ones (human rows are left alone unless overwriting), then deletes stale pipeline rows. `items` may be
     * empty (an explicit empty answer), in which case only the stale delete runs.
     */
    protected async ReconcileChildren(config: ChildRecordMapping, rc: ChildReconcileConfig, items: ChildToWrite[],
        created: Map<ChildToWrite, string>): Promise<void> {
        this.ValidateReconcileConfig(config, rc);
        const childEntity = this.Options.Provider.EntityByName(config.entity);
        const keyed = this.KeyProposals(config, rc, childEntity, items);
        const { Existing, Matches } = await this.MatchExisting(config, rc, childEntity, keyed);
        for (const { Item, Row } of Matches) {
            if (Row) {
                await this.ReconcileRow(config, Row, this.RowDecision(rc, childEntity, Row, Item.Data));
            } else {
                created.set(Item, await this.InsertChild(Item));
            }
        }
        await this.DeleteStaleChildren(config, rc, childEntity, Existing, new Set(keyed.keys()));
    }

    /**
     * The parent's existing rows of a mapping, and each keyed proposal paired with the existing row of its key (none:
     * the proposal is inserted). Shared by the real write ({@link ReconcileChildren}) and the dry-run preview
     * ({@link PlanChildren}).
     */
    protected async MatchExisting(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        keyed: Map<string, ChildToWrite>): Promise<{ Existing: BaseEntity[]; Matches: Array<{ Item: ChildToWrite; Row: BaseEntity | undefined }> }> {
        const existing = await this.LoadExistingChildren(config);
        const byKey = new Map(existing.map((row) => [this.KeyOfRow(rc, childEntity, row), row] as const));
        return { Existing: existing, Matches: [...keyed].map(([key, item]) => ({ Item: item, Row: byKey.get(key) })) };
    }

    /**
     * Refuses a reconcile config that cannot work: no key fields, a key field the map does not set (every proposal
     * would share the key ''), or `deleteStale` without the source field and value that tell pipeline rows from
     * human rows — without them every unproposed row, human-entered ones included, would be deleted.
     */
    protected ValidateReconcileConfig(config: ChildRecordMapping, rc: ChildReconcileConfig): void {
        if (!rc.keyFields || rc.keyFields.length === 0) {
            throw new Error(`applyOutputMapping: reconcile on '${config.entity}' needs at least one keyFields entry`);
        }
        const unmapped = rc.keyFields.filter((f) => !(f in config.map));
        if (unmapped.length > 0) {
            throw new Error(`applyOutputMapping: reconcile key field(s) ${unmapped.join(', ')} of '${config.entity}' are not set by its map`);
        }
        if (rc.deleteStale !== false && (!rc.sourceField || !rc.derivedSourceValue)) {
            throw new Error(`applyOutputMapping: reconcile on '${config.entity}' deletes stale rows, so it needs sourceField and derivedSourceValue to tell pipeline rows from human rows (or set deleteStale: false)`);
        }
    }

    /** The proposals keyed by their reconcile key; throws when the answer proposes one key twice (it would hit the unique key). */
    protected KeyProposals(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        items: ChildToWrite[]): Map<string, ChildToWrite> {
        const { Keyed, Repeated } = this.KeyedProposals(rc, childEntity, items);
        if (Repeated.length > 0) {
            throw new Error(`applyOutputMapping: the answer for '${config.entity}' proposes the reconcile key '${Repeated[0]}' more than once`);
        }
        return Keyed;
    }

    /**
     * The proposals keyed by their reconcile key (the first proposal of a key kept), and each key proposed more than
     * once, in result order. Shared by the real write ({@link KeyProposals}, which refuses a repeated key) and the
     * dry-run preview ({@link DuplicateKeyProblems}, which reports it), so the two judge a repeat the same way.
     */
    protected KeyedProposals(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        items: ChildToWrite[]): { Keyed: Map<string, ChildToWrite>; Repeated: string[] } {
        const keyed = new Map<string, ChildToWrite>();
        const repeated = new Set<string>();
        for (const item of items) {
            const key = this.KeyOfData(rc, childEntity, item.Data);
            if (keyed.has(key)) {
                repeated.add(key);
                continue;
            }
            keyed.set(key, item);
        }
        return { Keyed: keyed, Repeated: [...repeated] };
    }

    /** The parent's existing rows of a child mapping, read fresh (they are updated or deleted in this transaction). */
    protected async LoadExistingChildren(config: ChildRecordMapping): Promise<BaseEntity[]> {
        const res = await RunView.FromMetadataProvider(this.Options.Provider).RunView<BaseEntity>({
            EntityName: config.entity,
            ExtraFilter: `${OutputMappingWriter.ParentFieldOf(config)} = '${EscapeSQLString(this.Options.Record.RecordID)}'`,
            ResultType: 'entity_object', // the rows are saved or deleted below
            BypassCache: true, // a cached read could miss a row this run's transaction must update or delete
        }, this.Options.ContextUser);
        if (!res.Success) {
            throw new Error(`applyOutputMapping: reading existing '${config.entity}' rows failed: ${res.ErrorMessage}`);
        }
        return res.Results || [];
    }

    /** A row's key within its parent: its key fields, normalised and joined. */
    protected KeyOfRow(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, row: BaseEntity): string {
        return rc.keyFields.map((f) => OutputMappingWriter.NormalizeKeyPart(this.FieldInfoOf(childEntity, f), row.Get(f))).join('|'); // config-driven field names
    }

    /** A proposed row's key within its parent. */
    protected KeyOfData(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, data: Record<string, unknown>): string {
        return rc.keyFields.map((f) => OutputMappingWriter.NormalizeKeyPart(this.FieldInfoOf(childEntity, f), data[f])).join('|');
    }

    /** Whether a person owns the row: its source field holds anything but the pipeline's value (exact, as stored). */
    protected IsHumanRow(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, row: BaseEntity): boolean {
        return !!rc.sourceField
            && !OutputMappingWriter.ValuesEqual(this.FieldInfoOf(childEntity, rc.sourceField), row.Get(rc.sourceField), rc.derivedSourceValue); // config-driven field name
    }

    /**
     * What the write does with an existing row a proposal matches: leaves a human row alone (unless overwriting),
     * keeps an identical row, or updates only the fields that differ. The one decision both the real write
     * ({@link ReconcileRow}) and the dry-run preview ({@link PlanChildren}) use.
     */
    protected RowDecision(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, row: BaseEntity,
        data: Record<string, unknown>): ChildRowDecision {
        if (this.IsHumanRow(rc, childEntity, row) && !this.Options.OverwriteHumanValues) {
            return { Kind: 'human' };
        }
        const differing = Object.entries(data).filter(([f, v]) =>
            !OutputMappingWriter.ValuesEqual(this.FieldInfoOf(childEntity, f), row.Get(f), v)); // config-driven field names
        return differing.length === 0 ? { Kind: 'unchanged' } : { Kind: 'update', Changes: differing };
    }

    /** Applies a {@link RowDecision}: records a preserved human row or an unchanged row, or saves the differing fields. */
    protected async ReconcileRow(config: ChildRecordMapping, row: BaseEntity, decision: ChildRowDecision): Promise<void> {
        const id = row.PrimaryKey.ToCompactURLSegment();
        const result = this.Options.Result;
        if (decision.Kind === 'human') {
            (result.preservedHumanChildIDs ||= []).push(id);
            return;
        }
        if (decision.Kind === 'unchanged') {
            (result.unchangedChildIDs ||= []).push(id);
            return;
        }
        for (const [f, v] of decision.Changes) {
            row.Set(f, v); // config-driven field names
        }
        if (!(await row.Save())) {
            throw new Error(`applyOutputMapping: failed updating '${config.entity}' row '${id}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        (result.updatedChildIDs ||= []).push(id);
        result.changed = true;
    }

    /**
     * The existing rows the write deletes as stale: pipeline rows (never human rows) whose key the new result no longer
     * proposes; none when the mapping sets `deleteStale: false`. The one decision both the real write
     * ({@link DeleteStaleChildren}) and the dry-run preview ({@link PlanChildren}) use.
     */
    protected StaleRows(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, existing: BaseEntity[], proposed: Set<string>): BaseEntity[] {
        if (rc.deleteStale === false) {
            return [];
        }
        return existing.filter((row) => !proposed.has(this.KeyOfRow(rc, childEntity, row)) && !this.IsHumanRow(rc, childEntity, row));
    }

    /**
     * Deletes the pipeline's rows the new result no longer proposes; human rows are never deleted. Sequential on
     * purpose: the deletes share the unit provider's open transaction.
     */
    protected async DeleteStaleChildren(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        existing: BaseEntity[], proposed: Set<string>): Promise<void> {
        for (const row of this.StaleRows(rc, childEntity, existing, proposed)) {
            const id = row.PrimaryKey.ToCompactURLSegment();
            if (!(await row.Delete())) {
                throw new Error(`applyOutputMapping: failed deleting stale '${config.entity}' row '${id}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
            }
            (this.Options.Result.deletedChildIDs ||= []).push(id);
            this.Options.Result.changed = true;
        }
    }

    /**
     * What the real child writes would fail on, found without writing: the same reconcile key proposed twice, and
     * written values a database foreign-key constraint would reject (one read per related column, never one per
     * value, see `.claude/rules/data-access.md`). Only the values the real write stores are checked
     * ({@link PlanChildren}). A reconcile config the real write refuses throws here as it does there. Also returns
     * every child row with what the real write does with it, from the same plan (one read of the existing rows).
     * @param answers - every answered child mapping, as {@link WriteChildren} would receive them
     * @returns the problems (one message each; empty when the real child writes would go through) and the child changes
     */
    public async PreviewChildren(answers: ChildMappingAnswer[]): Promise<{ Problems: string[]; Changes: WriteBackChildChange[] }> {
        const problems = this.DuplicateKeyProblems(answers);
        const plan = await this.PlanChildren(answers);
        const targets = this.CollectForeignKeyRefs(plan.Writes, problems);
        problems.push(...(await this.MissingForeignKeyProblems(targets)));
        return { Problems: problems, Changes: plan.Changes };
    }

    /**
     * What the real write of the record's own fields would do and fail on. The record is loaded and the write's own
     * decision ({@link FieldChanges}, without recording anything) drops unchanged fields and human values the run
     * keeps; what remains is `Changes` (each with the record's current value). `Problems` are the values among those
     * the real write would fail on: a value passed through as a key (a UUID, which {@link ResolveFieldValue} writes
     * without a lookup) that a database foreign-key constraint would reject. A value a lookup resolved came from a row;
     * a lookup miss is null or (`create`) a preview key, so neither is checked. That is every value a constraint could
     * reject here: {@link ResolveKey} passes only a UUID through unchanged and resolves any other value (a name, a
     * number) through a lookup. A record that does not exist is a problem: the real write fails loading it.
     * @param entity - the processed record's entity
     * @param fields - the resolved field values, as the real write would store them
     */
    public async PreviewFields(entity: EntityInfo, fields: Record<string, unknown>): Promise<{ Problems: string[]; Changes: WriteBackFieldChange[] }> {
        const obj = await this.LoadRecord(entity);
        if (!obj) {
            return { Problems: [`record '${this.Options.Record.RecordID}' of '${entity.Name}' not found (the real write fails loading it)`], Changes: [] };
        }
        const changes = await this.FieldChanges(entity, obj, fields, false);
        const problems: string[] = [];
        const targets = new Map<string, ForeignKeyTarget>();
        for (const [field, value] of changes) {
            const fieldInfo = this.FieldInfoOf(entity, field);
            if (typeof value === 'string' && UUID_PATTERN.test(value.trim()) && this.IsConstrainedForeignKey(fieldInfo)) {
                this.AddForeignKeyRef(targets, problems, fieldInfo, { Entity: entity.Name, Field: field, Value: value });
            }
        }
        problems.push(...(await this.MissingForeignKeyProblems(targets)));
        return { Problems: problems, Changes: changes.map(([field, value]) => ({ Field: field, OldValue: obj.Get(field), NewValue: value })) }; // config-driven field name
    }

    /**
     * Reconcile keys a mapping's answer proposes more than once ({@link KeyedProposals}): the real write refuses
     * them, since the second row would hit the unique key. Checked per mapping, as {@link ReconcileChildren} is, after
     * {@link ValidateReconcileConfig} (which throws, as in the real write).
     */
    protected DuplicateKeyProblems(answers: ChildMappingAnswer[]): string[] {
        const problems: string[] = [];
        for (const { Config: config, Rows: rows } of answers) {
            const rc = config.reconcile;
            if (!rc) {
                continue;
            }
            this.ValidateReconcileConfig(config, rc);
            const { Repeated } = this.KeyedProposals(rc, this.Options.Provider.EntityByName(config.entity), rows);
            for (const key of Repeated) {
                problems.push(`'${config.entity}' would receive the reconcile key (${rc.keyFields.join(', ')}) = '${key}' twice (the real write fails on its unique key)`);
            }
        }
        return problems;
    }

    /**
     * The child values the real write stores, by the write's own decisions: every row of a plain mapping is inserted;
     * a reconciled proposal is inserted when no existing row has its key, otherwise {@link RowDecision} says whether
     * it writes nothing (a human row kept, an identical row) or only the differing fields; a stale pipeline row is
     * deleted. Reads the existing rows as the real write does ({@link MatchExisting}); a repeated key keeps its first
     * proposal (the preview reports it).
     * @returns `Writes`: the values stored (what the foreign-key check judges); `Changes`: every row with its action
     */
    protected async PlanChildren(answers: ChildMappingAnswer[]): Promise<{ Writes: PlannedChildWrite[]; Changes: WriteBackChildChange[] }> {
        const writes: PlannedChildWrite[] = [];
        const changes: WriteBackChildChange[] = [];
        for (const { Config: config, Rows: rows } of answers) {
            const rc = config.reconcile;
            if (!rc) {
                writes.push(...rows.map((item) => ({ Item: item, Values: item.Data })));
                changes.push(...rows.map((item) => ({ Entity: config.entity, Action: 'insert' as const, Values: item.Data })));
                continue;
            }
            const childEntity = this.Options.Provider.EntityByName(config.entity);
            const keyed = this.KeyedProposals(rc, childEntity, rows).Keyed;
            const { Existing, Matches } = await this.MatchExisting(config, rc, childEntity, keyed);
            for (const { Item, Row } of Matches) {
                const decision = Row ? this.RowDecision(rc, childEntity, Row, Item.Data) : undefined;
                if (!decision) {
                    writes.push({ Item, Values: Item.Data });
                    changes.push({ Entity: config.entity, Action: 'insert', Values: Item.Data });
                } else if (decision.Kind === 'update') {
                    writes.push({ Item, Values: Object.fromEntries(decision.Changes) });
                    changes.push({ Entity: config.entity, Action: 'update', Values: Object.fromEntries(decision.Changes) });
                } else {
                    changes.push({ Entity: config.entity, Action: 'none', Values: Item.Data });
                }
            }
            for (const row of this.StaleRows(rc, childEntity, Existing, new Set(keyed.keys()))) {
                changes.push({ Entity: config.entity, Action: 'delete', Values: Object.fromEntries(rc.keyFields.map((f) => [f, row.Get(f)])) }); // config-driven field names
            }
        }
        return { Writes: writes, Changes: changes };
    }

    /**
     * Every non-null written child value of a constrained foreign-key field (the parent key excepted: it is the
     * record being processed), grouped by the related column. A child entity missing from metadata, and a value that
     * cannot be a key (not a string or number), are reported to `problems` directly.
     */
    protected CollectForeignKeyRefs(writes: PlannedChildWrite[], problems: string[]): Map<string, ForeignKeyTarget> {
        const targets = new Map<string, ForeignKeyTarget>();
        const unknownEntities = new Set<string>();
        for (const { Item: item, Values: values } of writes) {
            const info = this.Options.Provider.EntityByName(item.Entity);
            if (!info) {
                unknownEntities.add(item.Entity);
                continue;
            }
            for (const [field, value] of Object.entries(values)) {
                const fieldInfo = this.FieldInfoOf(info, field);
                if (value === null || value === undefined || field === item.Config.parentField || !this.IsConstrainedForeignKey(fieldInfo)) {
                    continue;
                }
                if (typeof value !== 'string' && typeof value !== 'number') {
                    problems.push(`'${item.Entity}.${field}' holds a value of type ${Array.isArray(value) ? 'array' : typeof value}, which cannot be a key of '${this.RelatedEntityNameOf(fieldInfo, undefined)}'`);
                    continue;
                }
                this.AddForeignKeyRef(targets, problems, fieldInfo, { Entity: item.Entity, Field: field, Value: value });
            }
        }
        problems.push(...[...unknownEntities].map((e) => `child entity '${e}' is not in metadata`));
        return targets;
    }

    /**
     * Whether the database checks the field with a foreign-key constraint: it relates to an entity in metadata and is
     * not a soft foreign key (a metadata-only relation, `IsSoftForeignKey`). A relation only a mapping's
     * `fieldLookups.relatedEntity` names is not a constraint either, so field metadata alone decides.
     */
    protected IsConstrainedForeignKey(fieldInfo: EntityFieldInfo | undefined): fieldInfo is EntityFieldInfo {
        return !!fieldInfo && fieldInfo.IsSoftForeignKey !== true && !!this.RelatedEntityNameOf(fieldInfo, undefined);
    }

    /**
     * Adds a written value to the group of the related column its constraint references: the field's
     * `RelatedEntityFieldName`, else the related entity's primary key. A related entity or column missing from
     * metadata is reported instead.
     */
    protected AddForeignKeyRef(targets: Map<string, ForeignKeyTarget>, problems: string[], fieldInfo: EntityFieldInfo, ref: ForeignKeyRef): void {
        const relatedName = this.RelatedEntityNameOf(fieldInfo, undefined) || '';
        const related = this.Options.LookupProvider.EntityByName(relatedName);
        const column = fieldInfo.RelatedEntityFieldName || related?.FirstPrimaryKey?.Name; // first-pk-ok: a foreign key without a named related column references the related primary key (one column)
        if (!related || !column) {
            problems.push(`'${ref.Entity}.${ref.Field}' references '${relatedName}', which is not in metadata or has no key column`);
            return;
        }
        const groupKey = `${related.Name}|${column}`;
        const target = targets.get(groupKey) || { Related: related, Column: column, Refs: [] };
        target.Refs.push(ref);
        targets.set(groupKey, target);
    }

    /** {@link MissingForeignKeys} of every related column; the reads are independent, so they run in parallel. */
    protected async MissingForeignKeyProblems(targets: Map<string, ForeignKeyTarget>): Promise<string[]> {
        const perTarget = await Promise.all([...targets.values()].map((t) => this.MissingForeignKeys(t)));
        return perTarget.flat();
    }

    /**
     * The written values a foreign-key constraint would reject, in one read of the related column
     * ({@link JudgeKeyValues}): a value the column's type does not convert, and a value with no row. Text longer than
     * a character column holds is reported without being sent (the database would compare a truncated value). The
     * read runs through the provider's own SQL execution against the related base table, so — like the constraint —
     * it sees every row: no user view filter or row-level permission applies. A failed read is itself reported.
     * Latent asymmetry: a provider that does not execute SQL itself (a client provider, whose server enforces the
     * constraint) is not checked, so its dry run cannot report a missing row.
     */
    protected async MissingForeignKeys(target: ForeignKeyTarget): Promise<string[]> {
        const provider = this.Options.LookupProvider;
        if (!(provider instanceof DatabaseProviderBase)) {
            return [];
        }
        const columnInfo = this.FieldInfoOf(target.Related, target.Column);
        const related = target.Related.Name;
        const problems: string[] = [];
        const sendable: ForeignKeyRef[] = [];
        for (const ref of target.Refs) {
            if (OutputMappingWriter.ExceedsColumnLength(columnInfo, String(ref.Value))) {
                problems.push(`'${ref.Entity}.${ref.Field}' = '${ref.Value}' is longer than '${related}.${target.Column}' holds (the real write fails truncating it)`);
            } else {
                sendable.push(ref);
            }
        }
        if (sendable.length === 0) {
            return problems;
        }
        let judged: Map<string, KeyValueJudgement>;
        try {
            judged = await this.JudgeKeyValues(provider, target, columnInfo, [...new Set(sendable.map((r) => String(r.Value)))]);
        } catch (e) {
            return [...problems, `checking '${related}' for the written values failed: ${e instanceof Error ? e.message : String(e)}`];
        }
        for (const ref of sendable) {
            const judgement = judged.get(String(ref.Value));
            if (!judgement?.Converts) {
                problems.push(`'${ref.Entity}.${ref.Field}' = '${ref.Value}' is not a valid ${columnInfo?.SQLFullType || 'key'} value for '${related}.${target.Column}' (the real write fails converting it)`);
            } else if (!judgement.Found) {
                problems.push(`'${ref.Entity}.${ref.Field}' = '${ref.Value}' does not exist in '${related}' (the real write fails on its foreign key)`);
            }
        }
        return problems;
    }

    /**
     * The database's judgement of each sent value, in one statement: whether the related column's type converts it,
     * and whether a row holds it. Each value is sent exactly as the write sends it, never normalised, as
     * a literal the dialect keeps intact (`StringLiteralPrefix`: `N'…'` for text outside ASCII). A value of a
     * non-character column goes through the dialect's `TryConvert`, so one that does not convert is judged rather
     * than failing the statement; a character column compares the text as sent (converting would silently truncate
     * it). The comparison is `=` against the column, so its own type and collation decide a match, as they do for the
     * constraint. Values come back exactly as sent.
     * @param values - distinct values as the write sends them
     */
    protected async JudgeKeyValues(provider: DatabaseProviderBase, target: ForeignKeyTarget, columnInfo: EntityFieldInfo | undefined,
        values: string[]): Promise<Map<string, KeyValueJudgement>> {
        const dialect = provider.Dialect;
        const sentValue = `${provider.QuoteIdentifier('Sent')}.${provider.QuoteIdentifier('Value')}`;
        const type = columnInfo?.Type?.trim().toLowerCase() || '';
        const typed = columnInfo && !CHARACTER_TYPES.has(type) ? dialect.TryConvert(sentValue, columnInfo.SQLFullType) : sentValue;
        const literals = values.map((v) => `(${dialect.StringLiteralPrefix(v)}${dialect.QuoteStringLiteral(v)})`).join(', ');
        const rows = await provider.ExecuteSQL<KeyValueJudgementRow>(
            `SELECT ${sentValue}, CASE WHEN ${typed} IS NULL THEN 0 ELSE 1 END AS ${provider.QuoteIdentifier('Converts')}, `
            + `CASE WHEN EXISTS (SELECT 1 FROM ${provider.QuoteSchemaAndView(target.Related.SchemaName, target.Related.BaseTable)} `
            + `WHERE ${provider.QuoteIdentifier(target.Column)} = ${typed}) THEN 1 ELSE 0 END AS ${provider.QuoteIdentifier('Found')} `
            + `FROM (VALUES ${literals}) AS ${provider.QuoteIdentifier('Sent')}(${provider.QuoteIdentifier('Value')})`,
            undefined, undefined, this.Options.ContextUser);
        return new Map(rows.map((row) => [row.Value, { Converts: row.Converts === 1, Found: row.Found === 1 }]));
    }

    /**
     * Whether text is longer than a character column holds (`MaxLength`, in characters); false for any other type and
     * for a column without a declared limit (MAX).
     * @param column - the related column's metadata, when the related entity declares it
     */
    public static ExceedsColumnLength(column: EntityFieldInfo | undefined, text: string): boolean {
        const max = column && CHARACTER_TYPES.has(column.Type.trim().toLowerCase()) ? column.MaxLength : 0;
        return max > 0 && text.length > max;
    }
}

/**
 * Computes the depth of a tag relative to a root tag.
 * Returns 0 if tagID === rootTagID, 1 for direct children, 2 for grandchildren, etc.
 * Returns -1 if the tag is not a descendant of rootTagID.
 */
function computeTagDepth(
    tagID: string,
    rootTagID: string,
    tagEngine: { GetTagByID: (id: string) => { ID: string; ParentID: string | null } | undefined }
): number {
    if (UUIDsEqual(tagID, rootTagID)) {
        return 0;
    }
    let currentID: string | null = tagID;
    let depth = 0;
    while (currentID) {
        const currentTag = tagEngine.GetTagByID(currentID);
        if (!currentTag) {
            return -1;
        }
        if (UUIDsEqual(currentTag.ParentID ?? '', rootTagID)) {
            return depth + 1;
        }
        currentID = currentTag.ParentID;
        depth++;
        if (depth > 50) {
            return -1;
        }
    }
    return -1;
}

/** The weight the real write gives every tag link it creates or re-saves. */
const TAG_LINK_WEIGHT = 1.0;

/**
 * The entity a mapping's tags are linked on: its `taggedEntityName`'s entity, else the processed record's entity.
 * Undefined when the named entity is not in metadata. The one resolution both the real tag write and its dry-run
 * preview use.
 */
function TaggedEntityIDOf(provider: IMetadataProvider, mapping: TagOutputMapping, record: RecordRef): string | undefined {
    return mapping.taggedEntityName ? provider.EntityByName(mapping.taggedEntityName)?.ID : record.EntityID;
}

/**
 * Applies an {@link OutputMappingConfig} against a work result.
 * Supports updating fields (both single-key and composite-key entities), writing child records
 * (with array fan-out; a mapping with `reconcile` is matched to existing rows on its key, so a re-run
 * is idempotent), and linking/creating tags via TagEngine. Child rows and fields are written by an
 * {@link OutputMappingWriter} inside one entity transaction on `provider`, children first: a failed
 * child write rolls back and leaves the parent's fields unwritten. The transaction runs on its own
 * provider instance (see {@link MetadataProviderCapabilities.RunIsolated}), so concurrent records never share it
 * and no other statement on `provider` can land inside it. Exception: when the caller already holds a
 * transaction on `provider`, the write-back joins it (as a savepoint) and the caller owns atomicity —
 * nothing is durable until the caller commits.
 *
 * `unitWork` runs first inside the same unit (a pipeline's Feature Values, so they commit or roll back
 * with the write-back). A field whose current value a person entered is left in place unless
 * `overwriteHumanValues` is set: `humanGuard` decides, reading and recording on the unit's provider
 * (an empty field, or one already holding the new value, is never asked about). A run that overwrites
 * retires the Human value of each mapped field.
 *
 * Two writes deliberately sit outside that transaction (latent asymmetries), except when the caller
 * holds a transaction on `provider` — then `MetadataProviderCapabilities.RunIsolated` joins it, both run inside it, and the run-wide
 * lookup cache is neither read nor written (`OutputMappingWriter.CanCacheLookups`):
 * - A lookup row created by `onLookupMiss: 'create'` is saved on `provider` while the fields resolve,
 *   before the unit. A later rollback of the unit leaves it in place, unreferenced; a re-run finds and
 *   reuses it by its match field rather than creating another. It stays outside because `lookupCache`
 *   (shared across a run's records) caches its ID: inside the transaction a rollback would leave a
 *   cached ID pointing to a row that no longer exists, and the next record would write that dangling ID.
 * - Tags are linked after the commit. A tag failure fails the record while its fields and child rows
 *   stay committed; tagging is a separate taxonomy write and is not undone with them.
 *
 * Values resolve from `$` (result), `record` (parent row) and `$run` (provenance).
 */
export async function ApplyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    /** The caller's provider. FK lookups, a lookup row created on a miss, and tags run on it; the unit (`unitWork`, child and field writes, the human-value guard) runs on the unit provider `MetadataProviderCapabilities.RunIsolated` picks from it (its own instance, or this provider when it holds a transaction). Never the process-global provider by default. */
    provider: IMetadataProvider;
    /** When true, compute + validate the mapping but do NOT save anything (returns a preview instead). */
    dryRun?: boolean;
    /** Optional run provenance information mapped via `$run.*`. */
    run?: RunProvenance;
    /** Optional memoization cache mapping `${relatedEntityName}|${matchField}|${matchValue}` -> resolved PK. Caches positive hits only to prevent downgrading onLookupMiss policies. */
    lookupCache?: Map<string, string | number>;
    /** Overwrite values a person entered (default false), and retire their Human values. */
    overwriteHumanValues?: boolean;
    /** Decides which of the record's current field values a person entered; absent = every value may be overwritten. */
    humanGuard?: HumanValueGuard;
    /**
     * Work that must commit or roll back with this write-back, run first inside its unit on the unit's provider (a
     * pipeline's Feature Values: "what the pipeline last wrote" is then always a committed write-back). Not run on a
     * dry-run.
     */
    unitWork?: (unitProvider: IMetadataProvider) => Promise<void>;
    /** Targets to leave as they are: the answer withheld them (see {@link WithheldWriteBackTargets}). */
    withheld?: WithheldWriteBackTargets;
}): Promise<WriteBackResult> {
    const { outputMapping, result, record, contextUser, dryRun, run, provider } = opts;
    let payload = result;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            // leave as string if not JSON
        }
    }
    const sources: Record<string, unknown> = {
        $: payload,
        record: record.Record ?? {},
        $run: run ?? {},
    };
    const out: WriteBackResult = { updatedRecord: false, changed: false };
    if (dryRun) {
        out.dryRun = true;
    }
    // Field resolution runs on the caller's provider; the write unit below gets the same options on its unit provider.
    const writerOptions: OutputMappingWriterOptions = {
        Record: record, Provider: provider, LookupProvider: provider, ContextUser: contextUser, Result: out,
        OverwriteHumanValues: opts.overwriteHumanValues === true, HumanGuard: opts.humanGuard,
        FieldLookups: outputMapping.fieldLookups, LookupCache: opts.lookupCache || new Map<string, string | number>(), DryRun: dryRun === true,
        Withheld: opts.withheld,
    };
    const writer = new OutputMappingWriter(writerOptions);
    // Set when there are field mappings: the processed record's entity and its resolved values, written in step 3.
    let fieldEntity: EntityInfo | undefined;
    let fieldsToWrite: Record<string, unknown> | undefined;
    // On a dry run: what the real write would fail on (WriteBackResult.PreviewErrors).
    const previewErrors: string[] = [];

    // 1) Resolve the fields of the processed record.
    if (outputMapping.fields && Object.keys(outputMapping.fields).length > 0) {
        const entity = provider.EntityByID(record.EntityID);
        if (!entity) {
            throw new Error(`applyOutputMapping: entity '${record.EntityID}' not found in metadata`);
        }
        // Resolve the mapped values once — shared by the dry-run preview and the real apply. A withheld field (the
        // answer abstained) maps to null: the human-value guard keeps a person's value, and clears one the pipeline wrote.
        const resolved: Record<string, unknown> = {};
        for (const [field, ref] of Object.entries(outputMapping.fields)) {
            const withheld = WithheldTargets.HasField(opts.withheld, field);
            if (withheld) {
                (out.withheldFields ||= []).push(field);
                if (WithheldTargets.ColumnRequiresValue(entity, field)) {
                    // A column that does not allow null cannot be cleared: its value stays, and the result says why
                    (out.withheldKeptFields ||= []).push(field);
                    continue;
                }
            }
            resolved[field] = withheld ? null : resolveMappingRef(ref, sources);
        }

        // Foreign-key fields whose mapped value is a match string (e.g. 'Director') resolve to the related row's key.
        for (const [field, val] of Object.entries(resolved)) {
            resolved[field] = await writer.ResolveFieldValue(entity, field, val);
        }
        if (dryRun) {
            // Compute-only: surface what an apply WOULD write, and what it would fail on; persist nothing.
            out.previewFields = resolved;
            const preview = await writer.PreviewFields(entity, resolved);
            out.previewFieldChanges = preview.Changes;
            previewErrors.push(...preview.Problems);
        } else {
            fieldEntity = entity;
            fieldsToWrite = resolved;
        }
    }

    // 2) Resolve the child records (single childRecord and/or childRecords with fan-out). Each mapping with an answer
    //    becomes one ChildMappingAnswer; an empty array is an answer ("none"), a missing/null fan-out value is not.
    const childAnswers: ChildMappingAnswer[] = [];
    const childConfigs = OutputMappingWriter.ChildMappingsOf(outputMapping);

    if (childConfigs.length > 0) {
        for (const { Config: childConfig, IsLegacySingle: isLegacySingle } of childConfigs) {
            if (WithheldTargets.HasChildEntity(opts.withheld, childConfig.entity)) {
                // Withheld: not an answer, so nothing of this mapping changes (a reconcile mapping deletes nothing)
                (out.withheldChildEntities ||= []).push(childConfig.entity);
                continue;
            }
            const rows: ChildToWrite[] = [];
            if (childConfig.fanOutRef) {
                const fanOutVal = resolveMappingRef(childConfig.fanOutRef, sources);
                let items: unknown[];
                if (Array.isArray(fanOutVal)) {
                    items = fanOutVal;
                } else if (fanOutVal !== null && fanOutVal !== undefined && typeof fanOutVal === 'object') {
                    items = [fanOutVal];
                } else {
                    // No answer for this mapping (missing, null, or not a list): nothing of it changes — in particular a
                    // reconcile mapping deletes nothing, because "not answered" is not "none".
                    if (fanOutVal !== null && fanOutVal !== undefined) {
                        LogStatus(`applyOutputMapping: fanOutRef '${childConfig.fanOutRef}' resolved to non-array/non-object value of type '${typeof fanOutVal}'`);
                    }
                    continue;
                }
                for (const item of items) {
                    const itemSources: Record<string, unknown> = {
                        $: item,
                        item,
                        parent: payload,
                        record: record.Record ?? {},
                        $run: run ?? {},
                    };
                    const childMap: Record<string, unknown> = { [childConfig.parentField]: record.RecordID };
                    for (const [field, ref] of Object.entries(childConfig.map)) {
                        childMap[field] = resolveMappingRef(ref, itemSources);
                    }
                    rows.push({ Entity: childConfig.entity, Data: childMap, IsLegacySingle: isLegacySingle, Config: childConfig });
                }
            } else {
                const childMap: Record<string, unknown> = { [childConfig.parentField]: record.RecordID };
                for (const [field, ref] of Object.entries(childConfig.map)) {
                    childMap[field] = resolveMappingRef(ref, sources);
                }
                rows.push({ Entity: childConfig.entity, Data: childMap, IsLegacySingle: isLegacySingle, Config: childConfig });
            }
            childAnswers.push({ Config: childConfig, Rows: rows });
        }

        const childRows = childAnswers.flatMap((a) => a.Rows);
        if (dryRun && childRows.length > 0) {
            out.previewChildren = childRows.map((c) => c.Data);
            const singleChild = childRows.find((c) => c.IsLegacySingle);
            if (singleChild) {
                out.previewChild = singleChild.Data;
            }
        }
        if (dryRun) {
            // An empty answer is checked too: its reconcile config is validated as the real write validates it.
            const preview = await writer.PreviewChildren(childAnswers);
            previewErrors.push(...preview.Problems);
            out.previewChildChanges = preview.Changes;
        }
    }

    // 3) Write the unit work, children, then the record's fields, as one unit of work: a failed write rolls back and
    //    leaves the parent field (and the Feature Values) unwritten, so a half-written record never looks complete.
    //    The unit runs on its own provider instance so its transaction is its alone.
    if (!dryRun) {
        await MetadataProviderCapabilities.RunIsolated(provider, async (unitProvider) => {
            const unitWriter = new OutputMappingWriter({ ...writerOptions, Provider: unitProvider });
            // A provider without the transaction capability (a client provider) runs the work untransacted, per
            // RunInEntityTransaction's contract for a null provider.
            await RunInEntityTransaction(MetadataProviderCapabilities.IsTransactionalProvider(unitProvider) ? unitProvider : null, async () => {
                if (opts.unitWork) {
                    await opts.unitWork(unitProvider);
                }
                if (childAnswers.length > 0) {
                    await unitWriter.WriteChildren(childAnswers);
                }
                if (fieldEntity && fieldsToWrite) {
                    await unitWriter.WriteRecordFields(fieldEntity, fieldsToWrite);
                }
            });
        });
    }

    // 4) Apply tags via MJ Tagging system (after the commit above).
    if (outputMapping.tags && outputMapping.tags.length > 0) {
        const previewTags: TagWriteBackPreview[] = [];
        const createdTaggedItemIDs: string[] = [];

        await TagEngine.Instance.Config(false, contextUser);

        for (const tagMapping of outputMapping.tags) {
            const rawTagVal = resolveMappingRef(tagMapping.ref, sources);
            const tagNames: string[] = [];
            if (typeof rawTagVal === 'string') {
                tagNames.push(rawTagVal);
            } else if (Array.isArray(rawTagVal)) {
                for (const item of rawTagVal) {
                    if (typeof item === 'string') {
                        tagNames.push(item);
                    } else if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
                        tagNames.push(item.name);
                    }
                }
            }

            const taggedEntityID = TaggedEntityIDOf(provider, tagMapping, record);
            if (dryRun && !taggedEntityID && tagNames.some((t) => t.trim().length > 0)) {
                // The real write refuses it when it links this mapping's first tag.
                previewErrors.push(`taggedEntityName '${tagMapping.taggedEntityName}' not found in metadata`);
            }
            const growthMode = (tagMapping.growth ?? 'constrained') as TaxonomyMode;
            const matchThreshold = tagMapping.matchThreshold ?? 0.8;

            const mappingPreviewsFrom = previewTags.length;
            for (const tagName of tagNames) {
                if (!tagName || typeof tagName !== 'string' || tagName.trim().length === 0) {
                    continue;
                }
                const trimmedName = tagName.trim();

                if (dryRun) {
                    let matchedTag: MJTagEntity | null = null;
                    try {
                        matchedTag = await TagEngine.Instance.ResolveTag(
                            trimmedName,
                            1.0,
                            'constrained',
                            tagMapping.rootTagId,
                            matchThreshold,
                            contextUser,
                            { dryRun: true }
                        );
                    } catch (error) {
                        LogError(`writeBack: ResolveTag dryRun failed: ${error instanceof Error ? error.message : String(error)}`);
                        matchedTag = null;
                    }

                    if (matchedTag) {
                        const depth = computeTagDepth(matchedTag.ID, tagMapping.rootTagId, TagEngine.Instance);
                        const isNonDescendant = depth < 0;
                        const errorMsg = isNonDescendant
                            ? `Matched tag '${matchedTag.Name}' is not a descendant of root tag '${tagMapping.rootTagId}'`
                            : (tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth)
                                ? `Match exceeds maxDepth (${depth} > ${tagMapping.maxDepth})`
                                : undefined;
                        previewTags.push({
                            tagText: trimmedName,
                            resolvedTagID: matchedTag.ID,
                            resolvedTagName: matchedTag.Name,
                            matched: true,
                            created: false,
                            rootTagID: tagMapping.rootTagId,
                            depth,
                            error: errorMsg,
                        });
                        if (errorMsg) {
                            previewErrors.push(`tag '${trimmedName}': ${errorMsg}`); // the real write throws on both
                        }
                    } else {
                        if (growthMode === 'auto-grow') {
                            const depth = 1;
                            const exceedsMaxDepth = tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth;
                            const createdError = exceedsMaxDepth ? `Created tag exceeds maxDepth (${depth} > ${tagMapping.maxDepth})` : undefined;
                            previewTags.push({
                                tagText: trimmedName,
                                matched: false,
                                created: true,
                                rootTagID: tagMapping.rootTagId,
                                depth,
                                error: createdError,
                            });
                            if (createdError) {
                                previewErrors.push(`tag '${trimmedName}': ${createdError}`); // the real write throws on it
                            }
                        } else {
                            previewTags.push({
                                tagText: trimmedName,
                                matched: false,
                                created: false,
                                rootTagID: tagMapping.rootTagId,
                            });
                        }
                    }
                } else {
                    let wasCreated = false;
                    const resolvedTag = await TagEngine.Instance.ResolveTag(
                        trimmedName,
                        1.0,
                        growthMode,
                        tagMapping.rootTagId,
                        matchThreshold,
                        contextUser,
                        {
                            onTagCreated: () => {
                                wasCreated = true;
                            },
                        }
                    );

                    if (!resolvedTag) {
                        continue;
                    }

                    const depth = computeTagDepth(resolvedTag.ID, tagMapping.rootTagId, TagEngine.Instance);
                    if (depth < 0) {
                        throw new Error(`applyOutputMapping: tag '${resolvedTag.Name}' is not a descendant of root tag '${tagMapping.rootTagId}'`);
                    }
                    if (tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth) {
                        throw new Error(`applyOutputMapping: tag '${resolvedTag.Name}' depth (${depth}) exceeds maxDepth (${tagMapping.maxDepth}) under root '${tagMapping.rootTagId}'`);
                    }

                    if (!taggedEntityID) {
                        throw new Error(`applyOutputMapping: taggedEntityName '${tagMapping.taggedEntityName}' not found in metadata`);
                    }

                    const taggedItem = await TagEngine.Instance.CreateTaggedItem(
                        resolvedTag.ID,
                        taggedEntityID,
                        record.RecordID,
                        TAG_LINK_WEIGHT,
                        contextUser
                    );
                    if (taggedItem) {
                        const itemKey = taggedItem.PrimaryKey.ToCompactURLSegment();
                        createdTaggedItemIDs.push(itemKey.length > 0 ? itemKey : taggedItem.ID);
                    }
                }
            }
            if (dryRun && taggedEntityID) {
                // One read for all this mapping's matched tags, by the lookup the real write decides link-or-create with.
                const matched = previewTags.slice(mappingPreviewsFrom).filter((t) => t.matched && t.resolvedTagID);
                const lookup = await TagEngine.Instance.FindTaggedItems(taggedEntityID, record.RecordID, matched.flatMap((t) => (t.resolvedTagID ? [t.resolvedTagID] : [])), contextUser);
                if (!lookup.Success) {
                    previewErrors.push(`checking the existing links of the record's tags failed: ${lookup.ErrorMessage}`);
                }
                for (const tag of matched) {
                    const link = lookup.Items.find((item) => UUIDsEqual(item.TagID, tag.resolvedTagID));
                    tag.alreadyLinked = !!link;
                    tag.reweighted = !!link && Number(link.Weight) !== TAG_LINK_WEIGHT;
                }
            }
        }

        if (dryRun) {
            out.previewTags = previewTags;
        } else {
            out.createdTaggedItemIDs = createdTaggedItemIDs;
            if (createdTaggedItemIDs.length > 0) {
                out.changed = true;
            }
        }
    }

    if (previewErrors.length > 0) {
        out.PreviewErrors = previewErrors;
    }
    return out;
}

/** @deprecated Use {@link ApplyOutputMapping}. */
export async function applyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    provider: IMetadataProvider;
    /** When true, compute + validate the mapping but do NOT save anything (returns a preview instead). */
    dryRun?: boolean;
}): Promise<WriteBackResult> {
    return ApplyOutputMapping(opts);
}
