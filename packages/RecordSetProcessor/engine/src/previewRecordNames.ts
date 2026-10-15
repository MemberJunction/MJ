/**
 * @fileoverview Display names for the IDs a dry-run preview shows: the processed records, and the related record each
 * foreign-key value points at. The engine names a whole batch of previews at once, after the batch is computed: every
 * related record the batch shows is read in ONE `RunViews` call, one view per related entity (an `IN` list of its
 * keys), and a processed record already loaded is named from its own fields with no read at all. The preview dialog
 * then shows names without a read of its own (ruling QF-B1: one decision, no drift).
 * @module @memberjunction/record-set-processor
 */
import { BaseEntity, CompositeKey, LogError, RunView, type EntityInfo, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, NormalizeUUID } from '@memberjunction/global';
import type { FieldRulesResultPayload, RecordRef, WriteBackChildChange, WriteBackFieldChange, WriteBackResult } from '@memberjunction/record-set-processor-base';
import { OutputMappingWriter, type OutputMappingConfig } from './writeBack';

/** An integer key that arrived as text (a key column of an integer type, read from a JSON payload). */
const INTEGER_TEXT = /^-?\d+$/;

/** The records of one entity a batch asks names for. */
interface WantedEntity {
    /** The entity. */
    Entity: EntityInfo;
    /** Each record's key, by its lookup key ({@link PreviewRecordNames.KeyOf}). */
    Keys: Map<string, CompositeKey>;
}

/** One previewed record of a write-back batch: the processed record and the dry run's write-back result. */
export interface WriteBackPreviewItem {
    /** The processed record (its `Record` is the row the source loaded, when it loaded one). */
    Record: RecordRef;
    /** The dry run's write-back result; its names are filled in place. */
    WriteBack: WriteBackResult;
}

/** One previewed record of a FieldRules batch: the processed record, the loaded entity, and its diff payload. */
export interface FieldRulesPreviewItem {
    /** The processed record. */
    Record: RecordRef;
    /** The record as the processor loaded it: its name comes from its own fields. */
    Loaded: BaseEntity;
    /** The dry run's diff; its names are filled in place. */
    Payload: FieldRulesResultPayload;
}

/**
 * Collects the records a batch of previews names, reads the ones it cannot name from loaded data in one `RunViews`
 * call (one view per entity), and answers each one's name. The views run on the caller's provider under the acting
 * user, so the user's read permissions, row filter and field-level security apply: a record the user may not read,
 * or whose name fields they may not see, has no name, and the preview shows its ID.
 */
export class PreviewRecordNames {
    private readonly wanted = new Map<string, WantedEntity>();
    private readonly names = new Map<string, string>();

    /**
     * @param provider - the caller's provider; the views run on it
     * @param contextUser - the acting user, whose read permissions decide which names are shown
     */
    constructor(private readonly provider: IMetadataProvider, private readonly contextUser: UserInfo) {}

    /**
     * Names a whole batch of write-back previews: the processed records (from their loaded rows where they hold the
     * name fields), and the foreign-key values of each preview's field and child changes. A preview the real write
     * would fail on (`PreviewErrors`) shows its errors and no changes, so only its processed record is named.
     * @param items - the batch's previews
     * @param outputMapping - the mapping that produced them (its `fieldLookups` name a field's related entity)
     * @param provider - the caller's provider
     * @param contextUser - the acting user
     */
    public static async NameWriteBackBatch(items: WriteBackPreviewItem[], outputMapping: OutputMappingConfig,
        provider: IMetadataProvider, contextUser: UserInfo): Promise<void> {
        if (items.length === 0) {
            return;
        }
        const names = new PreviewRecordNames(provider, contextUser);
        for (const item of items) {
            const entity = provider.EntityByID(item.Record.EntityID);
            if (entity) {
                names.AddLoadedRecord(entity, item.Record.RecordID, item.Record.Record);
            }
            if (PreviewRecordNames.ShowsChanges(item.WriteBack)) {
                names.AddWriteBackKeys(entity, item.WriteBack, outputMapping);
            }
        }
        await names.Resolve();
        for (const item of items) {
            const entity = provider.EntityByID(item.Record.EntityID);
            const recordName = entity ? names.RecordName(entity, item.Record.RecordID) : undefined;
            if (recordName) {
                item.WriteBack.RecordName = recordName;
            }
            if (PreviewRecordNames.ShowsChanges(item.WriteBack)) {
                names.ApplyWriteBackNames(entity, item.WriteBack, outputMapping);
            }
        }
    }

    /**
     * Names a whole batch of FieldRules previews: each processed record from its loaded fields, and the foreign-key
     * values of the changes the preview shows (applied, changed, without an error).
     * @param items - the batch's previews
     * @param provider - the caller's provider
     * @param contextUser - the acting user
     */
    public static async NameFieldRulesBatch(items: FieldRulesPreviewItem[], provider: IMetadataProvider, contextUser: UserInfo): Promise<void> {
        if (items.length === 0) {
            return;
        }
        const names = new PreviewRecordNames(provider, contextUser);
        for (const item of items) {
            names.AddLoadedRecord(item.Loaded.EntityInfo, item.Record.RecordID, item.Loaded);
            for (const change of item.Payload.Changes.filter((c) => PreviewRecordNames.IsShownRuleChange(c))) {
                const related = names.RelatedEntityOf(item.Loaded.EntityInfo, change.Field, undefined);
                names.AddForeignKey(related, change.OldValue);
                names.AddForeignKey(related, change.NewValue);
            }
        }
        await names.Resolve();
        for (const item of items) {
            const entity = item.Loaded.EntityInfo;
            const recordName = names.RecordName(entity, item.Record.RecordID);
            if (recordName) {
                item.Payload.RecordName = recordName;
            }
            for (const change of item.Payload.Changes.filter((c) => PreviewRecordNames.IsShownRuleChange(c))) {
                const related = names.RelatedEntityOf(entity, change.Field, undefined);
                const oldName = names.ForeignKeyName(related, change.OldValue);
                const newName = names.ForeignKeyName(related, change.NewValue);
                if (oldName) {
                    change.OldValueName = oldName;
                }
                if (newName) {
                    change.NewValueName = newName;
                }
            }
        }
    }

    /**
     * Asks for a processed record's name. A loaded row (a `BaseEntity` or a plain row) that holds the entity's name
     * fields names it directly; otherwise the record is read with the batch.
     * @param entity - the record's entity
     * @param recordID - the record's ID segment (the compact composite-key segment a `RecordRef` carries)
     * @param loaded - the record as the source or processor loaded it, if at all; `unknown` because a `RecordRef`
     *   carries either a plain row or a `BaseEntity`
     */
    public AddLoadedRecord(entity: EntityInfo, recordID: string, loaded: unknown): void {
        if (!this.MayReadNames(entity)) {
            return;
        }
        const key = CompositeKey.FromURLSegment(entity, recordID);
        const lookupKey = PreviewRecordNames.KeyOf(entity.Name, key);
        const name = PreviewRecordNames.NameFromRow(entity, loaded);
        if (lookupKey && name) {
            this.names.set(lookupKey, name);
            return;
        }
        this.add(entity, key);
    }

    /**
     * Asks for the name of the record a foreign-key value points at. Ignored unless the related entity is in metadata
     * with a single-column key and the value is a key (a UUID, a number, or an integer as text).
     * @param relatedEntityName - the entity the field points at (undefined for a field that is not a foreign key)
     * @param value - the field value; `unknown` because it is whatever a config-named entity field holds
     */
    public AddForeignKey(relatedEntityName: string | undefined, value: unknown): void {
        const target = this.ForeignKeyTarget(relatedEntityName, value);
        if (target) {
            this.add(target.Entity, target.Key);
        }
    }

    /**
     * Reads every record still unnamed, in ONE `RunViews` call: one view per entity, its keys in an `IN` list (an OR
     * of key matches for a composite key), its fields the key and name fields. A failed read is logged once for the
     * batch and leaves those names absent: the names only label the preview, which stays as it is, showing IDs.
     */
    public async Resolve(): Promise<void> {
        const reads = [...this.wanted.values()]
            .map((w) => ({ Wanted: w, Params: this.ViewFor(w) }))
            .filter((r): r is { Wanted: WantedEntity; Params: RunViewParams } => r.Params !== null);
        if (reads.length === 0) {
            return;
        }
        try {
            const results = await RunView.FromMetadataProvider(this.provider).RunViews<Record<string, unknown>>(reads.map((r) => r.Params), this.contextUser);
            const failures: string[] = [];
            results.forEach((result, i) => {
                if (!result.Success) {
                    failures.push(`${reads[i].Wanted.Entity.Name}: ${result.ErrorMessage}`);
                    return;
                }
                for (const row of result.Results) {
                    this.Remember(reads[i].Wanted.Entity, row);
                }
            });
            if (failures.length > 0) {
                LogError(`Dry-run preview: reading record names failed, the preview shows IDs (${failures.join('; ')})`);
            }
        } catch (e) {
            LogError(`Dry-run preview: reading record names failed, the preview shows IDs: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** The name of a record asked for with {@link AddLoadedRecord}, once named. */
    public RecordName(entity: EntityInfo, recordID: string): string | undefined {
        return this.nameOf(entity.Name, CompositeKey.FromURLSegment(entity, recordID));
    }

    /** The name of the record a foreign-key value points at, asked for with {@link AddForeignKey}, once {@link Resolve} read it. */
    public ForeignKeyName(relatedEntityName: string | undefined, value: unknown): string | undefined {
        const target = this.ForeignKeyTarget(relatedEntityName, value);
        return target ? this.nameOf(target.Entity.Name, target.Key) : undefined;
    }

    /**
     * The entity a field points at, by the same relation the write resolves it with
     * ({@link OutputMappingWriter.RelatedEntityNameFor}); undefined for a field that is not a foreign key.
     * @param entity - the field's entity, when known
     * @param field - the (config-named) field
     * @param outputMapping - the mapping whose `fieldLookups` may name the field's related entity
     */
    public RelatedEntityOf(entity: EntityInfo | undefined, field: string, outputMapping: OutputMappingConfig | undefined): string | undefined {
        return entity
            ? OutputMappingWriter.RelatedEntityNameFor(this.provider, OutputMappingWriter.FieldInfoFor(entity, field), outputMapping?.fieldLookups?.[field])
            : undefined;
    }

    /**
     * A record's display name from a row: its name fields' ({@link EntityInfo.RecordNameFields}) non-empty values joined
     * by spaces, as the database provider builds it. Undefined unless the row holds EVERY name field (a plain row that
     * lacks one is read instead, so a name is never built from part of its fields) and at least one has a value.
     * @param row - a `BaseEntity` (it holds every field of its entity) or a plain row; `unknown` because a `RecordRef`
     *   carries either
     */
    public static NameFromRow(entity: EntityInfo, row: unknown): string | undefined {
        if (row === null || typeof row !== 'object') {
            return undefined;
        }
        const nameFields = entity.RecordNameFields;
        const isEntity = row instanceof BaseEntity;
        if (nameFields.length === 0 || (!isEntity && !nameFields.every((f) => Object.prototype.hasOwnProperty.call(row, f.Name)))) {
            return undefined;
        }
        const valueOf = (field: string): unknown => (row instanceof BaseEntity ? row.Get(field) : Object.getOwnPropertyDescriptor(row, field)?.value);
        const parts = nameFields
            .map((f) => valueOf(f.Name))
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
            .map((v) => String(v));
        return parts.length > 0 ? parts.join(' ') : undefined;
    }

    /** Whether a value can be a key a name is read for: a UUID, a finite number, or an integer as text. */
    public static IsKeyValue(value: unknown): value is string | number {
        return (typeof value === 'number' && Number.isFinite(value))
            || (typeof value === 'string' && (IsValidUUID(value) || INTEGER_TEXT.test(value.trim())));
    }

    /**
     * One record's lookup key: its entity and each key field's value (a UUID compared in either case); null for a key
     * without a value.
     */
    protected static KeyOf(entityName: string, key: CompositeKey | undefined): string | null {
        const pairs = key?.KeyValuePairs || [];
        if (pairs.length === 0 || pairs.some((kv) => kv.Value === undefined || kv.Value === null)) {
            return null;
        }
        const parts = pairs.map((kv) => {
            const text = typeof kv.Value === 'string' && IsValidUUID(kv.Value) ? NormalizeUUID(kv.Value) : String(kv.Value).trim();
            return `${String(kv.FieldName).trim().toLowerCase()}=${text}`;
        });
        return `${entityName.trim().toLowerCase()}|${parts.join('&')}`;
    }

    /** Whether a preview shows changes (and so names their values): one the real write would fail on shows only its errors. */
    protected static ShowsChanges(writeBack: WriteBackResult): boolean {
        return !writeBack.PreviewErrors || writeBack.PreviewErrors.length === 0;
    }

    /** Whether the preview dialog shows a FieldRules change: applied, changed, without an error. */
    protected static IsShownRuleChange(change: FieldRulesResultPayload['Changes'][number]): boolean {
        return change.Applied && change.Changed && !change.Error;
    }

    /** Asks for the foreign-key values of a write-back preview's field and child changes. */
    protected AddWriteBackKeys(entity: EntityInfo | undefined, writeBack: WriteBackResult, outputMapping: OutputMappingConfig): void {
        for (const change of writeBack.previewFieldChanges || []) {
            const related = this.RelatedEntityOf(entity, change.Field, outputMapping);
            this.AddForeignKey(related, change.OldValue);
            this.AddForeignKey(related, change.NewValue);
        }
        for (const child of writeBack.previewChildChanges || []) {
            const childEntity = this.provider.EntityByName(child.Entity);
            for (const [field, value] of Object.entries(child.Values)) {
                this.AddForeignKey(this.RelatedEntityOf(childEntity, field, undefined), value);
            }
        }
    }

    /** Puts the names read onto a write-back preview's field and child changes; a value without a name keeps none. */
    protected ApplyWriteBackNames(entity: EntityInfo | undefined, writeBack: WriteBackResult, outputMapping: OutputMappingConfig): void {
        for (const change of writeBack.previewFieldChanges || []) {
            this.NameFieldChange(change, this.RelatedEntityOf(entity, change.Field, outputMapping));
        }
        for (const child of writeBack.previewChildChanges || []) {
            this.NameChildChange(child);
        }
    }

    /** Names a field change's old and new values. */
    protected NameFieldChange(change: WriteBackFieldChange, related: string | undefined): void {
        const oldName = this.ForeignKeyName(related, change.OldValue);
        const newName = this.ForeignKeyName(related, change.NewValue);
        if (oldName) {
            change.OldValueName = oldName;
        }
        if (newName) {
            change.NewValueName = newName;
        }
    }

    /** Names a child row's foreign-key values (child values are not lookup-resolved, so the field's metadata decides). */
    protected NameChildChange(child: WriteBackChildChange): void {
        const childEntity = this.provider.EntityByName(child.Entity);
        const valueNames: Record<string, string> = {};
        for (const [field, value] of Object.entries(child.Values)) {
            const name = this.ForeignKeyName(this.RelatedEntityOf(childEntity, field, undefined), value);
            if (name) {
                valueNames[field] = name;
            }
        }
        if (Object.keys(valueNames).length > 0) {
            child.ValueNames = valueNames;
        }
    }

    /**
     * The record a foreign-key value points at: the related entity and the value as its key. Null unless the entity is
     * in metadata with a single-column key and the value is a key.
     */
    protected ForeignKeyTarget(relatedEntityName: string | undefined, value: unknown): { Entity: EntityInfo; Key: CompositeKey } | null {
        const related = relatedEntityName ? this.provider.EntityByName(relatedEntityName) : undefined;
        const keyField = related && related.PrimaryKeys.length === 1 ? related.FirstPrimaryKey : undefined; // first-pk-ok: only an entity with a single-column key is named (checked here); a foreign key references a single-column key
        if (!related || !keyField || !PreviewRecordNames.IsKeyValue(value) || !this.MayReadNames(related)) {
            return null;
        }
        return { Entity: related, Key: CompositeKey.FromKeyValuePair(keyField.Name, typeof value === 'string' ? value.trim() : value) };
    }

    /**
     * The view that reads one entity's wanted records: its key and name fields, filtered to their keys. Null for an
     * entity without name fields (its records have no name to read).
     */
    protected ViewFor(wanted: WantedEntity): RunViewParams | null {
        const nameFields = wanted.Entity.RecordNameFields;
        if (nameFields.length === 0) {
            return null;
        }
        const keyFields = wanted.Entity.PrimaryKeys.map((k) => k.Name);
        return {
            EntityName: wanted.Entity.Name,
            ExtraFilter: PreviewRecordNames.KeyFilter(keyFields, [...wanted.Keys.values()]),
            Fields: [...new Set([...keyFields, ...nameFields.map((f) => f.Name)])],
            IgnoreMaxRows: true,
        };
    }

    /**
     * The filter matching a set of keys: `[ID] IN ('…', …)` for a single-column key, else an OR of each key's field
     * matches. Every value is escaped: a foreign-key value was validated as a key (a UUID or an integer), a processed
     * record's key comes from its `RecordID` segment unvalidated.
     */
    protected static KeyFilter(keyFields: string[], keys: CompositeKey[]): string {
        const literal = (v: unknown): string => (typeof v === 'number' ? String(v) : `'${EscapeSQLString(String(v))}'`);
        if (keyFields.length === 1) {
            return `[${keyFields[0]}] IN (${keys.map((k) => literal(k.KeyValuePairs[0].Value)).join(', ')})`;
        }
        return keys.map((k) => `(${k.KeyValuePairs.map((kv) => `[${kv.FieldName}] = ${literal(kv.Value)}`).join(' AND ')})`).join(' OR ');
    }

    /** Records a read row's name under its key. */
    protected Remember(entity: EntityInfo, row: Record<string, unknown>): void {
        const key = new CompositeKey(entity.PrimaryKeys.map((k) => ({ FieldName: k.Name, Value: row[k.Name] })));
        const lookupKey = PreviewRecordNames.KeyOf(entity.Name, key);
        const name = PreviewRecordNames.NameFromRow(entity, row);
        if (lookupKey && name) {
            this.names.set(lookupKey, name);
        }
    }

    /**
     * Whether the acting user may see this entity's record names at all ({@link EntityInfo.CanUserReadRecordName}):
     * every name field readable, so a name is shown whole or not at all, by the same rule as the database provider's
     * record-name read. When they may not, the entity is neither read nor named from a loaded row, and the preview
     * shows the key.
     */
    protected MayReadNames(entity: EntityInfo): boolean {
        return entity.CanUserReadRecordName(this.contextUser);
    }

    /** Adds a record to the batch's read, once however often it is asked for, unless it is already named. */
    private add(entity: EntityInfo, key: CompositeKey): void {
        const lookupKey = PreviewRecordNames.KeyOf(entity.Name, key);
        if (!lookupKey || this.names.has(lookupKey)) {
            return;
        }
        const group = this.wanted.get(entity.Name.toLowerCase()) || { Entity: entity, Keys: new Map<string, CompositeKey>() };
        group.Keys.set(lookupKey, key);
        this.wanted.set(entity.Name.toLowerCase(), group);
    }

    /** The name known for a record, if any. */
    private nameOf(entityName: string, key: CompositeKey): string | undefined {
        const lookupKey = PreviewRecordNames.KeyOf(entityName, key);
        return lookupKey ? this.names.get(lookupKey) : undefined;
    }
}
