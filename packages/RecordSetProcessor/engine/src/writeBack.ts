/**
 * @fileoverview Output-mapping write-back — applies a work's structured result back onto the data
 * model per an `OutputMapping` config: update fields on the processed record and/or write child
 * records (inserted, or reconciled on their key so a re-run is idempotent), in one entity transaction.
 * Reads from the result use the generic value-mapping resolver (`$` = the result root).
 * @module @memberjunction/record-set-processor
 */

import { BaseEntity, CompositeKey, DatabaseProviderBase, type EntityFieldInfo, EntityFieldTSType, type EntityInfo, type IEntityDataProvider, IMetadataProvider, type IRunViewProvider, LogStatus, RunInEntityTransaction, RunView, UserInfo, LogError } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual, resolveMappingRef } from '@memberjunction/global';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { TagEngine, TaxonomyMode } from '@memberjunction/tag-engine';
import type { MJTagEntity } from '@memberjunction/core-entities';

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

/** Preview outcome for a single resolved tag. */
export interface TagWriteBackPreview {
    tagText: string;
    resolvedTagID?: string;
    resolvedTagName?: string;
    matched: boolean;
    created: boolean;
    rootTagID: string;
    depth?: number;
    error?: string;
}

/** Outcome of {@link ApplyOutputMapping}. */
export interface WriteBackResult {
    /** True if the processed record's fields were actually updated (false on a dry-run, and when every mapped field already held its value). */
    updatedRecord: boolean;
    /** True when anything was written (record field, child insert/update/delete, tag). False for an identical re-run. */
    changed: boolean;
    /** ID of the created child record, when a single child mapping was applied (absent on a dry-run). */
    createdChildID?: string;
    /** IDs of created child records when childRecords (or fan-out) was applied (absent on a dry-run). */
    createdChildIDs?: string[];
    /** IDs of reconciled child rows that were updated. */
    updatedChildIDs?: string[];
    /** IDs of reconciled child rows that were deleted (stale pipeline rows). */
    deletedChildIDs?: string[];
    /** IDs of reconciled child rows that already held the proposed values. */
    unchangedChildIDs?: string[];
    /** IDs of human-owned child rows the result also proposed and that were left untouched. */
    preservedHumanChildIDs?: string[];
    /** Fields whose human-entered value write-back left in place. */
    preservedHumanFields?: string[];
    /** Fields whose Human value a run that overwrites human values retired (the field is the pipeline's again). */
    retiredHumanFields?: string[];
    /** IDs of created tagged item records (absent on a dry-run). */
    createdTaggedItemIDs?: string[];
    /** True when this was a dry-run: values were computed (and field names validated) but NOTHING was saved. */
    dryRun?: boolean;
    /** On a dry-run, the resolved field values that WOULD be written to the processed record — the write-back preview. */
    previewFields?: Record<string, unknown>;
    /** On a dry-run with a single child mapping, the resolved child values that WOULD be created. */
    previewChild?: Record<string, unknown>;
    /** On a dry-run with childRecords (or fan-out), the array of resolved child records that WOULD be created. */
    previewChildren?: Array<Record<string, unknown>>;
    /** On a dry-run with tag mappings, the resolved tag previews. */
    previewTags?: TagWriteBackPreview[];
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
    /** The unit provider `RunIsolated` picked for this write-back (an instance minted from the caller's provider, or the caller's provider when it holds a transaction or cannot mint one): every read, save and the transaction run on it. */
    Provider: IMetadataProvider;
    /**
     * The caller's provider. Foreign-key lookups, and a lookup row created on a miss, run on it, including the lookups
     * the human-value guard's `Resolve` makes while the unit is open. That keeps them outside the write transaction
     * (for the reason {@link ApplyOutputMapping} gives) except when the caller holds a transaction on it: then
     * `RunIsolated` joins that transaction, these lookups run inside it too, and the lookup cache is not used
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
}

/** A value that is already a key, not a match string: a UUID in any case, surrounding whitespace allowed. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SQL types whose values are stored rounded to the column's scale. */
const SCALED_DECIMAL_TYPES: ReadonlySet<string> = new Set(['decimal', 'numeric', 'money', 'smallmoney']);

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
     * Whether the provider exposes the entity-transaction members (`IEntityDataProvider`'s `SupportsEntityTransactions`
     * and `BeginEntityTransaction`). `RunInEntityTransaction` then decides from `SupportsEntityTransactions` whether a
     * transaction is actually opened; a provider without the members runs the work untransacted.
     * @param p - the provider a write-back unit runs on
     */
    public static IsTransactionalProvider(p: IMetadataProvider): p is IMetadataProvider & Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> {
        return 'BeginEntityTransaction' in p && typeof p.BeginEntityTransaction === 'function';
    }

    /**
     * Picks the provider one write-back unit runs on, and runs it:
     *
     * - **A `DatabaseProviderBase` on which the caller holds a transaction** (`TransactionDepth > 0`): the unit runs on
     *   `provider` and its transaction joins the caller's as a savepoint, as `RunInWorkQueueTransaction` does with a
     *   caller executor. The caller then owns atomicity: the unit's failure rolls back to its savepoint and rethrows, and nothing it wrote is
     *   durable until the caller commits. Joining is required, not a preference: on a separate connection the unit
     *   would wait on rows the caller's open transaction has locked (the record the caller wrote, a lookup row created
     *   on `provider`) until the request timeout, since the caller cannot commit while it awaits the unit.
     * - **Any other `DatabaseProviderBase`**: the unit runs on its own instance from
     *   `DatabaseProviderBase.CreateIndependentInstance()` — same connection pool, its own transaction stack — released
     *   afterwards (`ReleaseIndependentInstance`, which rolls back anything left open and never closes the pool). Why:
     *   MJ's ambient transaction is a field of the provider instance. Opened on the caller's shared provider, it would
     *   take in every statement anyone else runs through that instance while it is open — another record's
     *   write-back, the run tracker's detail rows, watermark updates — and a rollback would undo them too, after they
     *   were reported done. On its own instance nothing else can join it, so concurrent records need no lock.
     *   The instance's metadata is NOT taken from `provider`: `CreateIndependentInstance` takes no argument and the new
     *   instance's `Config` adopts the process-global `Metadata.Provider`'s loaded metadata (or loads it in full when no
     *   global provider is registered). Every server host registers a global provider on the same database, so this is
     *   the same metadata there.
     *   A `DatabaseProviderBase` subclass that has not implemented `CreateIndependentInstance` throws from the base
     *   class; that error propagates — a loud failure, never a silent fallback to the shared transaction.
     * - **A provider that is not a `DatabaseProviderBase`** (a client provider such as `GraphQLDataProvider`, which has
     *   no local transaction to protect): the unit runs on `provider`.
     * @param provider - the caller's provider
     * @param work - the unit, given the provider every read, save and the transaction must use
     */
    public static async RunIsolated<T>(provider: IMetadataProvider, work: (unitProvider: IMetadataProvider) => Promise<T>): Promise<T> {
        // The transaction members live on DatabaseProviderBase; any other provider (a client provider) runs the unit on itself.
        if (!(provider instanceof DatabaseProviderBase) || provider.TransactionDepth > 0) {
            return work(provider);
        }
        const unit = await provider.CreateIndependentInstance();
        try {
            return await work(unit);
        } finally {
            await unit.ReleaseIndependentInstance();
        }
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
        const obj = await this.Options.Provider.GetEntityObject<BaseEntity>(entity.Name, this.Options.ContextUser);
        // RecordID is the compact CompositeKey segment (bare value for a single column, "F1|v1||F2|v2" for composite).
        if (!(await obj.InnerLoad(CompositeKey.FromURLSegment(entity, this.Options.Record.RecordID)))) {
            throw new Error(`applyOutputMapping: record '${this.Options.Record.RecordID}' of '${entity.Name}' not found`);
        }
        const changes = await this.FieldChanges(entity, obj, fields);
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
        await this.RetireHumanValues(Object.keys(fields));
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
     */
    protected async FieldChanges(entity: EntityInfo, obj: BaseEntity, fields: Record<string, unknown>): Promise<Array<[string, unknown]>> {
        const changes: Array<[string, unknown]> = [];
        for (const [field, value] of Object.entries(fields)) {
            const current = obj.Get(field); // config-driven field name
            if (OutputMappingWriter.ValuesEqual(this.FieldInfoOf(entity, field), current, value)) {
                continue;
            }
            if (await this.PreservesHumanValue(entity, field, current)) {
                continue;
            }
            changes.push([field, value]);
        }
        return changes;
    }

    /**
     * True when the field holds a value a person entered and the run does not overwrite it; the preserved value is
     * recorded through the guard. An empty field holds no human value, so the guard is not asked. The guard resolves
     * the pipeline's earlier answer read-only ({@link ResolveStoredForm}) and compares by the field's type
     * ({@link OwnedValuesEqual}).
     */
    protected async PreservesHumanValue(entity: EntityInfo, field: string, current: unknown): Promise<boolean> {
        const guard = this.Options.HumanGuard;
        const fieldInfo = this.FieldInfoOf(entity, field);
        if (!guard || this.Options.OverwriteHumanValues || OutputMappingWriter.NormalizeKeyPart(fieldInfo, current) === '') {
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
        (this.Options.Result.preservedHumanFields ||= []).push(field);
        await guard.RecordPreserved(field, current, this.Options.Provider);
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
        return lookup?.relatedEntity
            || fieldInfo?.RelatedEntity
            || (fieldInfo?.RelatedEntityID ? this.Options.LookupProvider.EntityByID(fieldInfo.RelatedEntityID)?.Name : undefined);
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
        // Lookups run on the caller's provider only (coding standards §6): one that cannot run views fails loudly
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
        const name = field.toLowerCase();
        return entity?.Fields?.find((f) => f.Name.toLowerCase() === name);
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
        const existing = await this.LoadExistingChildren(config);
        const byKey = new Map(existing.map((row) => [this.KeyOfRow(rc, childEntity, row), row] as const));
        for (const [key, item] of keyed) {
            const row = byKey.get(key);
            if (row) {
                await this.ReconcileRow(config, rc, childEntity, row, item.Data);
            } else {
                created.set(item, await this.InsertChild(item));
            }
        }
        if (rc.deleteStale !== false) {
            await this.DeleteStaleChildren(config, rc, childEntity, existing, new Set(keyed.keys()));
        }
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
        const keyed = new Map<string, ChildToWrite>();
        for (const item of items) {
            const key = this.KeyOfData(rc, childEntity, item.Data);
            if (keyed.has(key)) {
                throw new Error(`applyOutputMapping: the answer for '${config.entity}' proposes the reconcile key '${key}' more than once`);
            }
            keyed.set(key, item);
        }
        return keyed;
    }

    /** The parent's existing rows of a child mapping, read fresh (they are updated or deleted in this transaction). */
    protected async LoadExistingChildren(config: ChildRecordMapping): Promise<BaseEntity[]> {
        if (!/^[A-Za-z0-9_]+$/.test(config.parentField)) {
            throw new Error(`applyOutputMapping: invalid parentField identifier '${config.parentField}' for '${config.entity}'`);
        }
        const res = await RunView.FromMetadataProvider(this.Options.Provider).RunView<BaseEntity>({
            EntityName: config.entity,
            ExtraFilter: `${config.parentField} = '${EscapeSQLString(this.Options.Record.RecordID)}'`,
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

    /** Leaves a human row alone (unless overwriting), keeps an identical row, and saves only the fields that differ. */
    protected async ReconcileRow(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        row: BaseEntity, data: Record<string, unknown>): Promise<void> {
        const id = row.PrimaryKey.ToCompactURLSegment();
        const result = this.Options.Result;
        if (this.IsHumanRow(rc, childEntity, row) && !this.Options.OverwriteHumanValues) {
            (result.preservedHumanChildIDs ||= []).push(id);
            return;
        }
        const differing = Object.entries(data).filter(([f, v]) =>
            !OutputMappingWriter.ValuesEqual(this.FieldInfoOf(childEntity, f), row.Get(f), v)); // config-driven field names
        if (differing.length === 0) {
            (result.unchangedChildIDs ||= []).push(id);
            return;
        }
        for (const [f, v] of differing) {
            row.Set(f, v); // config-driven field names
        }
        if (!(await row.Save())) {
            throw new Error(`applyOutputMapping: failed updating '${config.entity}' row '${id}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        (result.updatedChildIDs ||= []).push(id);
        result.changed = true;
    }

    /**
     * Deletes the pipeline's rows the new result no longer proposes; human rows are never deleted. Sequential on
     * purpose: the deletes share the unit provider's open transaction (coding standards §6).
     */
    protected async DeleteStaleChildren(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        existing: BaseEntity[], proposed: Set<string>): Promise<void> {
        const stale = existing.filter((row) => !proposed.has(this.KeyOfRow(rc, childEntity, row)) && !this.IsHumanRow(rc, childEntity, row));
        for (const row of stale) {
            const id = row.PrimaryKey.ToCompactURLSegment();
            if (!(await row.Delete())) {
                throw new Error(`applyOutputMapping: failed deleting stale '${config.entity}' row '${id}': ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
            }
            (this.Options.Result.deletedChildIDs ||= []).push(id);
            this.Options.Result.changed = true;
        }
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

/**
 * Applies an {@link OutputMappingConfig} against a work result.
 * Supports updating fields (both single-key and composite-key entities), writing child records
 * (with array fan-out; a mapping with `reconcile` is matched to existing rows on its key, so a re-run
 * is idempotent), and linking/creating tags via TagEngine. Child rows and fields are written by an
 * {@link OutputMappingWriter} inside one entity transaction on `provider`, children first: a failed
 * child write rolls back and leaves the parent's fields unwritten. The transaction runs on its own
 * provider instance (see {@link OutputMappingWriter.RunIsolated}), so concurrent records never share it
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
 * holds a transaction on `provider` — then `RunIsolated` joins it, both run inside it, and the run-wide
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
    /** The caller's provider. FK lookups, a lookup row created on a miss, and tags run on it; the unit (`unitWork`, child and field writes, the human-value guard) runs on the unit provider `OutputMappingWriter.RunIsolated` picks from it (its own instance, or this provider when it holds a transaction). Never the process-global provider by default. */
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
    };
    const writer = new OutputMappingWriter(writerOptions);
    // Set when there are field mappings: the processed record's entity and its resolved values, written in step 3.
    let fieldEntity: EntityInfo | undefined;
    let fieldsToWrite: Record<string, unknown> | undefined;

    // 1) Resolve the fields of the processed record.
    if (outputMapping.fields && Object.keys(outputMapping.fields).length > 0) {
        const entity = provider.EntityByID(record.EntityID);
        if (!entity) {
            throw new Error(`applyOutputMapping: entity '${record.EntityID}' not found in metadata`);
        }
        // Resolve the mapped values once — shared by the dry-run preview and the real apply.
        const resolved: Record<string, unknown> = {};
        for (const [field, ref] of Object.entries(outputMapping.fields)) {
            resolved[field] = resolveMappingRef(ref, sources);
        }

        // Foreign-key fields whose mapped value is a match string (e.g. 'Director') resolve to the related row's key.
        for (const [field, val] of Object.entries(resolved)) {
            resolved[field] = await writer.ResolveFieldValue(entity, field, val);
        }
        if (dryRun) {
            // Compute-only: surface what an apply WOULD write, persist nothing.
            out.previewFields = resolved;
        } else {
            fieldEntity = entity;
            fieldsToWrite = resolved;
        }
    }

    // 2) Resolve the child records (single childRecord and/or childRecords with fan-out). Each mapping with an answer
    //    becomes one ChildMappingAnswer; an empty array is an answer ("none"), a missing/null fan-out value is not.
    const childAnswers: ChildMappingAnswer[] = [];
    const childConfigs: Array<{ config: ChildRecordMapping; isLegacySingle: boolean }> = [];
    if (outputMapping.childRecord) {
        childConfigs.push({ config: outputMapping.childRecord, isLegacySingle: true });
    }
    if (outputMapping.childRecords && Array.isArray(outputMapping.childRecords)) {
        for (const c of outputMapping.childRecords) {
            childConfigs.push({ config: c, isLegacySingle: false });
        }
    }

    if (childConfigs.length > 0) {
        for (const { config: childConfig, isLegacySingle } of childConfigs) {
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
    }

    // 3) Write the unit work, children, then the record's fields, as one unit of work: a failed write rolls back and
    //    leaves the parent field (and the Feature Values) unwritten, so a half-written record never looks complete.
    //    The unit runs on its own provider instance so its transaction is its alone.
    if (!dryRun) {
        await OutputMappingWriter.RunIsolated(provider, async (unitProvider) => {
            const unitWriter = new OutputMappingWriter({ ...writerOptions, Provider: unitProvider });
            // A provider without the transaction capability (a client provider) runs the work untransacted, per
            // RunInEntityTransaction's contract for a null provider.
            await RunInEntityTransaction(OutputMappingWriter.IsTransactionalProvider(unitProvider) ? unitProvider : null, async () => {
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

            const growthMode = (tagMapping.growth ?? 'constrained') as TaxonomyMode;
            const matchThreshold = tagMapping.matchThreshold ?? 0.8;

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
                        const exceedsMaxDepth = isNonDescendant || (tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth);
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
                    } else {
                        if (growthMode === 'auto-grow') {
                            const depth = 1;
                            const exceedsMaxDepth = tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth;
                            previewTags.push({
                                tagText: trimmedName,
                                matched: false,
                                created: true,
                                rootTagID: tagMapping.rootTagId,
                                depth,
                                error: exceedsMaxDepth ? `Created tag exceeds maxDepth (${depth} > ${tagMapping.maxDepth})` : undefined,
                            });
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

                    let targetEntityID = record.EntityID;
                    if (tagMapping.taggedEntityName) {
                        const taggedEntity = provider.EntityByName(tagMapping.taggedEntityName);
                        if (!taggedEntity) {
                            throw new Error(`applyOutputMapping: taggedEntityName '${tagMapping.taggedEntityName}' not found in metadata`);
                        }
                        targetEntityID = taggedEntity.ID;
                    }

                    const taggedItem = await TagEngine.Instance.CreateTaggedItem(
                        resolvedTag.ID,
                        targetEntityID,
                        record.RecordID,
                        1.0,
                        contextUser
                    );
                    if (taggedItem) {
                        const itemKey = taggedItem.PrimaryKey.ToCompactURLSegment();
                        createdTaggedItemIDs.push(itemKey.length > 0 ? itemKey : taggedItem.ID);
                    }
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
