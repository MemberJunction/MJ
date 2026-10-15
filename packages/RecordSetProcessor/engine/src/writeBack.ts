/**
 * @fileoverview Output-mapping write-back — applies a work's structured result back onto the data
 * model per an `OutputMapping` config: update fields on the processed record and/or write child
 * records (inserted, or reconciled on their key so a re-run is idempotent), in one entity transaction.
 * Reads from the result use the generic value-mapping resolver (`$` = the result root).
 * @module @memberjunction/record-set-processor
 */

import { BaseEntity, CompositeKey, DatabaseProviderBase, type EntityFieldInfo, EntityFieldTSType, type EntityInfo, IMetadataProvider, type IRunViewProvider, LogStatus, RunInEntityTransaction, RunView, UserInfo, LogError } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDSet, UUIDsEqual, resolveMappingRef } from '@memberjunction/global';
import type { RecordProcessorContext, RecordRef, RecordResult, TagWriteBackPreview, WriteBackResult } from '@memberjunction/record-set-processor-base';
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

/** One ownership question write-back asks a {@link HumanValueGuard} about a field that holds a value and is about to change. */
export interface HumanValueQuestion {
    /** The mapped (config-named) field. */
    FieldName: string;
    /** The field's current value; never empty (an empty field holds no human value and is not asked about). */
    CurrentValue: unknown;
    /** Read-only: the stored form of a value the pipeline produced (a lookup miss is null; nothing is created). */
    Resolve: (pipelineValue: unknown) => Promise<unknown>;
    /** Whether a stored value equals a resolved pipeline value by the field's type ({@link OutputMappingWriter.OwnedValuesEqual}). */
    Equals: (stored: unknown, resolved: unknown) => boolean;
    /** The write-back unit's provider: the guard's reads and writes run on it, inside the unit's transaction. */
    Provider: IMetadataProvider;
}

/** Decides whether a target field's current value was entered by a person, records it, and retires it. */
export interface HumanValueGuard {
    /** True when the field's current value must be preserved. */
    IsHumanOwned(question: HumanValueQuestion): Promise<boolean>;
    /** Records the preserved human value (a `Source='Human'` Feature Value) on the unit's provider. */
    RecordPreserved(fieldName: string, currentValue: unknown, provider: IMetadataProvider): Promise<void>;
    /** Retires the record's Human value of the field (an overwriting run made it the pipeline's); true when one existed. */
    RetireHumanValue(fieldName: string, provider: IMetadataProvider): Promise<boolean>;
}

/** The targets a record's result withheld (outputs below their confidence floor): fields to clear, child mappings to skip. */
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
    /** Delete pipeline-written rows the new result no longer contains (default true; needs `sourceField` and `derivedSourceValue`). */
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

/** One child mapping's answer: the rows the result proposes for it (empty for an explicit "none"). */
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
    /** The write-back unit's provider (`MetadataProviderCapabilities.RunIsolated`): every read, save and the transaction run on it. */
    Provider: IMetadataProvider;
    /** The caller's provider: foreign-key lookups (and a lookup row created on a miss) run on it, outside the unit. */
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
    /** Positive lookup hits shared by every record of the run ({@link CanCacheLookups}). */
    LookupCache: Map<string, string | number>;
    /** Compute-only: an `onLookupMiss: 'create'` miss is previewed, not created. */
    DryRun: boolean;
    /** Withheld targets: the guard always decides a withheld field (without one it is kept), and its Human value is never retired. */
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

/** What the write does with an existing child row a proposal matches ({@link OutputMappingWriter.RowDecision}). */
type ChildRowDecision = { Kind: 'human' } | { Kind: 'unchanged' } | { Kind: 'update'; Changes: Array<[string, unknown]> };

/** Writes one record's resolved output mapping: child rows (inserted, or reconciled on their key), then the record's own fields. */
export class OutputMappingWriter {
    constructor(protected readonly Options: OutputMappingWriterOptions) {}

    /** Whether the metadata provider can also run views (narrows the type without a cast). */
    public static IsRunViewProvider(p: IMetadataProvider): p is IMetadataProvider & IRunViewProvider {
        return 'RunView' in p && typeof p.RunView === 'function';
    }

    /**
     * Normalises one part of a reconcile key as a case-insensitive key column compares it: null is '', a
     * uniqueidentifier is `NormalizeUUID`d, anything else is lower-cased with trailing spaces removed.
     * @param field - the key field's metadata, when the entity declares it
     * @param v - a mapped value or an entity field value; `unknown` because config-named fields carry no compile-time type
     */
    public static NormalizeKeyPart(field: EntityFieldInfo | undefined, v: unknown): string {
        if (v === null || v === undefined) {
            return '';
        }
        return field?.IsUniqueIdentifier ? NormalizeUUID(String(v)) : String(v).trimEnd().toLowerCase();
    }

    /**
     * Whether a stored field value already equals a proposed one, by the field's type: UUIDs case-insensitively, dates
     * by instant, decimals at the column's scale, numbers numerically, booleans by truth, anything else as exact text.
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

    /** Rounds half away from zero to `scale` digits, as SQL Server stores it (the epsilon corrects binary halves). */
    protected static RoundToScale(x: number, scale: number): number {
        const factor = 10 ** scale;
        return Math.sign(x) * Math.round(Math.abs(x) * factor * (1 + Number.EPSILON)) / factor;
    }

    /** A bit value's truth: true, 1, '1' and 'true' (any case) are true. */
    protected static TruthOf(v: unknown): boolean {
        return v === true || v === 1 || (typeof v === 'string' && ['1', 'true'].includes(v.trim().toLowerCase()));
    }

    /** Writes every answered child mapping: reconciled mappings on their key, the others as inserts. */
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
     * Saves the record's mapped fields that differ from its current values and hold no value a person entered. A run
     * that overwrites human values then retires the Human value of every mapped field.
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

    /** On a run that overwrites human values, retires each mapped field's Human value (sequentially, in the unit's transaction). */
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
     * The mapped fields whose value differs from the record's ({@link ValuesEqual}) and holds no value a person entered,
     * for the real write and the dry-run check ({@link PreviewFieldProblems}).
     * @param recordPreserved - record each preserved human value (the real write); false for the preview
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
     * True when the field holds a value a person entered and the run does not overwrite it (see
     * {@link OutputMappingWriterOptions.Withheld}); with `recordPreserved` the value is recorded and reported. An empty
     * field is never asked about.
     */
    protected async PreservesHumanValue(entity: EntityInfo, field: string, current: unknown, recordPreserved: boolean): Promise<boolean> {
        const guard = this.Options.HumanGuard;
        const fieldInfo = this.FieldInfoOf(entity, field);
        // an abstention clears only a value the guard says the pipeline owns, even on a run that overwrites human values
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
     * Whether a stored value equals a value the pipeline wrote, for the ownership question: typed fields by
     * {@link ValuesEqual}, text (and undeclared fields) with case and trailing spaces ignored, as the collation compares.
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
     * The stored form of one mapped field value: a match string becomes the related row's key by the mapping's lookup
     * rules; a UUID, or a value of a field that is not a foreign key, is returned unchanged.
     * @param val - the mapped value; `unknown` because it comes from `resolveMappingRef`
     */
    public async ResolveFieldValue(entity: EntityInfo, field: string, val: unknown): Promise<unknown> {
        return this.ResolveKey(entity, field, val, false);
    }

    /**
     * The stored form of a value the pipeline wrote earlier, read-only: any lookup miss is null; nothing is created.
     * @param val - an earlier pipeline answer (a stored Feature Value); `unknown` as on {@link ResolveFieldValue}
     */
    public async ResolveStoredForm(entity: EntityInfo, field: string, val: unknown): Promise<unknown> {
        return this.ResolveKey(entity, field, val, true);
    }

    /**
     * Shared body of {@link ResolveFieldValue} and {@link ResolveStoredForm} (`readOnly`: every miss is null).
     * @param val - a mapped value or an earlier pipeline answer; `unknown` because config-named refs carry no type
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

    /** Whether the run-wide lookup cache may be used: not inside a caller's transaction, whose rollback would undo a cached row. */
    protected get CanCacheLookups(): boolean {
        const provider = this.Options.LookupProvider;
        return !(provider instanceof DatabaseProviderBase && provider.TransactionDepth > 0);
    }

    /** The match value inside a mapped value (an array's first element, an object's `Name`); null when not a string or number. */
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

    /** The entity a foreign-key field points at: the lookup's `relatedEntity`, else the field's metadata; undefined for a non-key. */
    public static RelatedEntityNameFor(provider: IMetadataProvider, fieldInfo: EntityFieldInfo | undefined,
        lookup: FieldLookupConfig | undefined): string | undefined {
        return lookup?.relatedEntity
            || fieldInfo?.RelatedEntity
            || (fieldInfo?.RelatedEntityID ? provider.EntityByID(fieldInfo.RelatedEntityID)?.Name : undefined);
    }

    /** The key column of a lookup's related entity; throws when it is not in metadata or has no primary key. */
    protected PrimaryKeyNameOf(related: string): string {
        const key = this.Options.LookupProvider.EntityByName(related)?.FirstPrimaryKey; // first-pk-ok: a foreign key references a single-column primary key
        if (!key) {
            throw new Error(`applyOutputMapping: related entity '${related}' is not in metadata or has no primary key`);
        }
        return key.Name;
    }

    /**
     * Looks up the related row whose match field equals `text` and returns its key (a hit is cached for the run); a miss
     * follows `onMiss`: null (never cached), an error, or a new row.
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

    /** Creates the related row a `create` miss asks for (match field only) and caches its key; a dry run returns a preview key. */
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

    /** A config-named field's metadata, names compared case-insensitively; undefined when the entity does not declare it. */
    public static FieldInfoFor(entity: EntityInfo | undefined, field: string): EntityFieldInfo | undefined {
        const name = field.toLowerCase();
        return entity?.Fields?.find((f) => f.Name.toLowerCase() === name);
    }

    /** Every child mapping of an output mapping, in write order: the single `childRecord` (flagged) first, then `childRecords`. */
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
     * A child mapping's parent field, checked to be a plain identifier (it is written into a view filter).
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
     * Reconciles one mapping's proposed rows with the parent's existing rows: inserts new keys, updates or keeps existing
     * ones (human rows only when overwriting), then deletes stale pipeline rows.
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

    /** The parent's existing rows of a mapping, and each keyed proposal paired with the existing row of its key. */
    protected async MatchExisting(config: ChildRecordMapping, rc: ChildReconcileConfig, childEntity: EntityInfo | undefined,
        keyed: Map<string, ChildToWrite>): Promise<{ Existing: BaseEntity[]; Matches: Array<{ Item: ChildToWrite; Row: BaseEntity | undefined }> }> {
        const existing = await this.LoadExistingChildren(config);
        const byKey = new Map(existing.map((row) => [this.KeyOfRow(rc, childEntity, row), row] as const));
        return { Existing: existing, Matches: [...keyed].map(([key, item]) => ({ Item: item, Row: byKey.get(key) })) };
    }

    /** Refuses a reconcile config that cannot work: no key fields, a key field the map does not set, or `deleteStale` without a source. */
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

    /** The proposals keyed by their reconcile key (the first of a key kept), and each key proposed more than once. */
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
     * keeps an identical row, or updates the differing fields. Shared by the write and {@link PlanChildren}.
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

    /** The existing pipeline rows (never human rows) whose key the result no longer proposes; none with `deleteStale: false`. */
    protected StaleRows(rc: ChildReconcileConfig, childEntity: EntityInfo | undefined, existing: BaseEntity[], proposed: Set<string>): BaseEntity[] {
        if (rc.deleteStale === false) {
            return [];
        }
        return existing.filter((row) => !proposed.has(this.KeyOfRow(rc, childEntity, row)) && !this.IsHumanRow(rc, childEntity, row));
    }

    /** Deletes the pipeline's rows the new result no longer proposes (sequentially, in the unit's transaction). */
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
     * What the real child writes would fail on, found without writing: a reconcile key proposed twice, and stored values
     * with no row in their related entity ({@link PlanChildren}, {@link MissingForeignKeys}).
     */
    public async PreviewChildProblems(answers: ChildMappingAnswer[]): Promise<string[]> {
        const problems = this.DuplicateKeyProblems(answers);
        const targets = this.CollectForeignKeyRefs(await this.PlanChildren(answers), problems);
        problems.push(...(await this.MissingForeignKeyProblems(targets)));
        return problems;
    }

    /**
     * What the real write of the record's own fields would fail on: a changed UUID value with no row in its related
     * entity, or a record that does not exist.
     */
    public async PreviewFieldProblems(entity: EntityInfo, fields: Record<string, unknown>): Promise<string[]> {
        const obj = await this.LoadRecord(entity);
        if (!obj) {
            return [`record '${this.Options.Record.RecordID}' of '${entity.Name}' not found (the real write fails loading it)`];
        }
        const problems: string[] = [];
        const targets = new Map<string, ForeignKeyTarget>();
        for (const [field, value] of await this.FieldChanges(entity, obj, fields, false)) {
            const fieldInfo = this.FieldInfoOf(entity, field);
            if (typeof value === 'string' && UUID_PATTERN.test(value.trim()) && this.IsConstrainedForeignKey(fieldInfo)) {
                this.AddForeignKeyRef(targets, problems, fieldInfo, { Entity: entity.Name, Field: field, Value: value });
            }
        }
        problems.push(...(await this.MissingForeignKeyProblems(targets)));
        return problems;
    }

    /** Reconcile keys a mapping's answer proposes more than once: the real write refuses them (unique key). */
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
     * The child values the real write stores, by its own decisions: every row of a plain mapping; a reconciled
     * proposal's values when no existing row has its key, else only the fields {@link RowDecision} updates.
     */
    protected async PlanChildren(answers: ChildMappingAnswer[]): Promise<PlannedChildWrite[]> {
        const writes: PlannedChildWrite[] = [];
        for (const { Config: config, Rows: rows } of answers) {
            const rc = config.reconcile;
            if (!rc) {
                writes.push(...rows.map((item) => ({ Item: item, Values: item.Data })));
                continue;
            }
            const childEntity = this.Options.Provider.EntityByName(config.entity);
            const { Matches } = await this.MatchExisting(config, rc, childEntity, this.KeyedProposals(rc, childEntity, rows).Keyed);
            for (const { Item, Row } of Matches) {
                const decision = Row ? this.RowDecision(rc, childEntity, Row, Item.Data) : undefined;
                if (!decision) {
                    writes.push({ Item, Values: Item.Data });
                } else if (decision.Kind === 'update') {
                    writes.push({ Item, Values: Object.fromEntries(decision.Changes) });
                }
            }
        }
        return writes;
    }

    /** Every written child value of a constrained foreign-key field (the parent key excepted), grouped by related column. */
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

    /** Whether the database checks the field with a foreign-key constraint (a related entity in metadata, not a soft key). */
    protected IsConstrainedForeignKey(fieldInfo: EntityFieldInfo | undefined): fieldInfo is EntityFieldInfo {
        return !!fieldInfo && fieldInfo.IsSoftForeignKey !== true && !!this.RelatedEntityNameOf(fieldInfo, undefined);
    }

    /** Adds a written value to the group of the related column its constraint references, or reports a missing one. */
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

    /** {@link MissingForeignKeys} of every related column, in parallel. */
    protected async MissingForeignKeyProblems(targets: Map<string, ForeignKeyTarget>): Promise<string[]> {
        const perTarget = await Promise.all([...targets.values()].map((t) => this.MissingForeignKeys(t)));
        return perTarget.flat();
    }

    /**
     * The written values with no row in their related entity: one `RunView` of the related column per entity. A value
     * that is not a UUID cannot be a key of a uniqueidentifier column; a related column of another type is not checked.
     */
    protected async MissingForeignKeys(target: ForeignKeyTarget): Promise<string[]> {
        if (!this.FieldInfoOf(target.Related, target.Column)?.IsUniqueIdentifier) {
            return [];
        }
        const related = target.Related.Name;
        const problems: string[] = [];
        const keyed = target.Refs.filter((ref) => {
            const isKey = UUID_PATTERN.test(String(ref.Value).trim());
            if (!isKey) {
                problems.push(`'${ref.Entity}.${ref.Field}' = '${ref.Value}' is not a valid key of '${related}' (the real write fails converting it)`);
            }
            return isKey;
        });
        if (keyed.length === 0) {
            return problems;
        }
        const ids = [...new Set(keyed.map((ref) => String(ref.Value).trim()))];
        const result = await RunView.FromMetadataProvider(this.Options.LookupProvider).RunView<Record<string, string>>({
            EntityName: related,
            ExtraFilter: `[${target.Column}] IN (${ids.map((id) => `'${id}'`).join(',')})`,
            Fields: [target.Column],
            ResultType: 'simple',
        }, this.Options.ContextUser);
        if (!result.Success) {
            return [...problems, `checking '${related}' for the written values failed: ${result.ErrorMessage}`];
        }
        const found = new UUIDSet(result.Results.map((r) => r[target.Column]));
        for (const ref of keyed) {
            if (!found.Has(String(ref.Value).trim())) {
                problems.push(`'${ref.Entity}.${ref.Field}' = '${ref.Value}' does not exist in '${related}' (the real write fails on its foreign key)`);
            }
        }
        return problems;
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

/** The entity a mapping's tags are linked on (its `taggedEntityName`'s, else the record's); undefined when unknown. */
function TaggedEntityIDOf(provider: IMetadataProvider, mapping: TagOutputMapping, record: RecordRef): string | undefined {
    return mapping.taggedEntityName ? provider.EntityByName(mapping.taggedEntityName)?.ID : record.EntityID;
}

/**
 * Applies an {@link OutputMappingConfig} against a work result.
 * Supports updating fields (both single-key and composite-key entities), writing child records
 * (with array fan-out; a `reconcile` mapping is matched to existing rows on its key), and linking/creating
 * tags via TagEngine. `unitWork`, the child rows and the fields are written in one entity transaction on its
 * own provider instance; tags after it. A field a person entered is kept unless `overwriteHumanValues` is set.
 *
 * Values resolve from `$` (result), `record` (parent row) and `$run` (provenance).
 */
export async function ApplyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    /** The caller's provider: lookups and tags run on it, the write unit on an instance minted from it. */
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
    /** Work that commits or rolls back with this write-back, run first in its unit (a pipeline's Feature Values); not on a dry run. */
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
            previewErrors.push(...(await writer.PreviewFieldProblems(entity, resolved)));
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
            previewErrors.push(...(await writer.PreviewChildProblems(childAnswers)));
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
