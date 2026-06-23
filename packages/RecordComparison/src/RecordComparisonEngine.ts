import {
    LogError,
    Metadata,
    RunView,
    CompositeKey,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    IMetadataProvider,
    IRunViewProvider
} from '@memberjunction/core';

/**
 * Input to {@link RecordComparisonEngine.CompareRecords}.
 *
 * Describes the set of records (a survivor candidate plus its potential matches)
 * to load and diff field-by-field for a single entity.
 */
export interface RecordComparisonInput {
    /** Registered entity name (e.g. "Accounts"), NOT the physical table name. */
    EntityName: string;
    /**
     * The composite keys of the records to compare. By convention the first key is
     * the survivor candidate and the remainder are potential matches, but the engine
     * treats all records uniformly — ordering is preserved in the output column index.
     */
    Keys: CompositeKey[];
    /**
     * Optional include-list of field names to restrict the comparison to. When omitted,
     * all visible (non-PK, non-system) fields are compared. Field names are matched
     * case-insensitively against the entity's field metadata.
     */
    IncludeFields?: string[];
}

/**
 * One record loaded for comparison. The `Key` correlates this record back to the
 * input column index; `Values` is a plain map of fieldName → value for that record.
 */
export interface RecordComparisonRecord {
    /** Zero-based index aligned with the input `Keys` array (the comparison column). */
    ColumnIndex: number;
    /** The composite key identifying this record (as supplied in the input). */
    Key: CompositeKey;
    /** A human-readable label for the record (name-field value when available, else the key). */
    Label: string;
    /** Plain field-name → value map for this record (only the compared fields). */
    Values: Record<string, RecordFieldValue>;
}

/** A scalar field value as loaded from the database (never a BaseEntity). */
export type RecordFieldValue = string | number | boolean | null;

/**
 * Options for {@link RecordComparisonEngine.CompareRecordsForEntity}.
 */
export interface RecordComparisonOptions {
    /**
     * Optional include-list of field names. When omitted, all visible (non-PK, non-system)
     * fields are compared. Matched case-insensitively against the entity's field metadata.
     */
    IncludeFields?: string[];
    /**
     * An already-constructed `RunView` to load the records through. When supplied, it is used
     * verbatim, so callers can thread their own request-scoped/provider-bound RunView (e.g. the
     * duplicate detector). When omitted, a RunView is built from {@link RecordComparisonOptions.Provider}.
     */
    RunViewInstance?: RunView;
    /** Request-scoped metadata provider (multi-provider safety) used to build a RunView when one isn't supplied. */
    Provider?: IMetadataProvider;
}

/**
 * The per-record value of a single field within a {@link RecordComparisonFieldDelta}.
 */
export interface RecordComparisonFieldCell {
    /** Column index aligned with {@link RecordComparisonRecord.ColumnIndex}. */
    ColumnIndex: number;
    /** The field's value for this record. */
    Value: RecordFieldValue;
    /**
     * True when this cell's value is equal (case-insensitive, trimmed) to the
     * reference cell (column 0, the survivor candidate). Column 0 is always true.
     */
    EqualsReference: boolean;
}

/**
 * The delta for a single field across all compared records.
 */
export interface RecordComparisonFieldDelta {
    /** Field name (matches the entity field metadata Name). */
    FieldName: string;
    /** Display name for the field (falls back to FieldName). */
    DisplayName: string;
    /** Optional grouping category from the field metadata. */
    Category: string | null;
    /** Per-record values for this field, in column order. */
    Cells: RecordComparisonFieldCell[];
    /**
     * True when at least one record's value differs from the reference (column 0).
     * False when every record shares the same value.
     */
    Differs: boolean;
}

/**
 * The serializable result of comparing a set of records: the loaded records plus a
 * per-field delta matrix. This is the LLM "deltas" payload and (eventually) the UI
 * side-by-side model — it is plain-data only and contains no BaseEntity instances.
 */
export interface RecordComparisonResult {
    /** Whether the comparison succeeded. */
    Success: boolean;
    /** Populated when {@link Success} is false. */
    ErrorMessage?: string;
    /** Registered entity name that was compared. */
    EntityName: string;
    /** The loaded records, in input column order. */
    Records: RecordComparisonRecord[];
    /** The per-field delta matrix. Only fields with at least one non-empty value are included. */
    Fields: RecordComparisonFieldDelta[];
}

/**
 * Framework-agnostic engine that loads a set of records for one entity and computes a
 * structured field-level delta between them.
 *
 * This is the shared comparison primitive used by the LLM reasoning path (it feeds the
 * "deltas" context to the reasoning provider) and, opportunistically, by the UI
 * side-by-side comparison panel. It performs a read-only load (`RunView` with
 * `ResultType: 'simple'` + targeted `Fields`) — it never mutates records.
 *
 * No Angular, no Router, no resolver coupling. Server-side: always thread `contextUser`
 * and (in multi-provider scenarios) the request-scoped `provider`.
 */
export class RecordComparisonEngine {
    /**
     * Loads the requested records and computes the field-delta matrix.
     *
     * @param input the entity, keys, and optional field include-list to compare
     * @param contextUser the server-side context user (REQUIRED for correct isolation)
     * @param provider optional request-scoped metadata provider (multi-provider safety)
     */
    public async CompareRecords(
        input: RecordComparisonInput,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<RecordComparisonResult> {
        const md = provider ?? Metadata.Provider;
        const entity = md?.EntityByName(input.EntityName);
        if (!entity) {
            return this.errorResult(input.EntityName, `Entity '${input.EntityName}' not found in metadata`);
        }
        return this.CompareRecordsForEntity(entity, input.Keys, contextUser, {
            IncludeFields: input.IncludeFields,
            Provider: provider
        });
    }

    /**
     * The lower-level comparison entry point: given an already-resolved {@link EntityInfo}
     * (no by-name metadata lookup), load the keyed records and compute the field-delta matrix.
     *
     * Callers that already hold the entity and a request-scoped `RunView` (e.g. the duplicate
     * detector) use this directly via {@link RecordComparisonOptions.RunViewInstance}, avoiding a
     * redundant metadata resolution. The by-name {@link RecordComparisonEngine.CompareRecords}
     * resolves the entity and delegates here.
     *
     * @param entity the resolved entity to compare records within
     * @param keys the composite keys to compare (column 0 is the reference/survivor candidate)
     * @param contextUser the server-side context user (thread for correct isolation)
     * @param options include-list, an injected RunView, and/or the request-scoped provider
     */
    public async CompareRecordsForEntity(
        entity: EntityInfo,
        keys: CompositeKey[],
        contextUser?: UserInfo,
        options?: RecordComparisonOptions
    ): Promise<RecordComparisonResult> {
        try {
            if (!keys || keys.length === 0) {
                return this.errorResult(entity.Name, 'No keys supplied to compare');
            }

            const fields = this.selectFields(entity, options?.IncludeFields);
            const rawRecords = await this.loadRecords(entity, keys, fields, contextUser, options);
            if (rawRecords === null) {
                return this.errorResult(entity.Name, 'Failed to load records for comparison');
            }

            const records = this.buildRecords(entity, keys, fields, rawRecords);
            const deltas = this.buildFieldDeltas(fields, records);
            return {
                Success: true,
                EntityName: entity.Name,
                Records: records,
                Fields: deltas
            };
        } catch (e) {
            LogError(e);
            return this.errorResult(entity.Name, e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolves the set of fields to compare: the include-list (case-insensitive) when
     * supplied, otherwise all non-PK, non-system fields. Sorted name-field → DefaultInView → Sequence.
     */
    protected selectFields(entity: EntityInfo, includeFields?: string[]): EntityFieldInfo[] {
        const includeSet = includeFields && includeFields.length > 0
            ? new Set(includeFields.map(f => f.trim().toLowerCase()))
            : null;

        const candidates = entity.Fields.filter(f => this.isComparableField(f, includeSet));
        return candidates.sort((a, b) => this.compareFieldOrder(a, b));
    }

    /** True when a field should participate in the comparison. */
    protected isComparableField(field: EntityFieldInfo, includeSet: Set<string> | null): boolean {
        if (includeSet) {
            return includeSet.has(field.Name.toLowerCase());
        }
        if (field.IsPrimaryKey) {
            return false;
        }
        return !this.isSystemField(field.Name);
    }

    /** True for MemberJunction system/internal columns that should not be diffed. */
    protected isSystemField(fieldName: string): boolean {
        return fieldName.startsWith('__mj_');
    }

    /** Orders fields name-field first, then DefaultInView, then by Sequence/Name. */
    protected compareFieldOrder(a: EntityFieldInfo, b: EntityFieldInfo): number {
        if (a.IsNameField !== b.IsNameField) {
            return a.IsNameField ? -1 : 1;
        }
        if (a.DefaultInView !== b.DefaultInView) {
            return a.DefaultInView ? -1 : 1;
        }
        const seqA = a.Sequence ?? 0;
        const seqB = b.Sequence ?? 0;
        if (seqA !== seqB) {
            return seqA - seqB;
        }
        return a.Name.localeCompare(b.Name);
    }

    /**
     * Loads the records via a single read-only RunView OR-ing every supplied key.
     * Returns plain rows (ResultType 'simple') or null on failure.
     */
    protected async loadRecords(
        entity: EntityInfo,
        keys: CompositeKey[],
        fields: EntityFieldInfo[],
        contextUser: UserInfo | undefined,
        options?: RecordComparisonOptions
    ): Promise<Record<string, RecordFieldValue>[] | null> {
        const filter = this.buildKeysFilter(keys);
        if (!filter) {
            return null;
        }

        // Prefer a caller-supplied RunView (already bound to the request-scoped provider).
        // Otherwise build one from the provider: concrete MJ providers implement both
        // IMetadataProvider and IRunViewProvider, so the cast threads it into RunView for
        // multi-provider safety.
        const rv = options?.RunViewInstance ?? new RunView((options?.Provider as unknown as IRunViewProvider) ?? null);
        const result = await rv.RunView<Record<string, RecordFieldValue>>(
            {
                EntityName: entity.Name,
                ExtraFilter: filter,
                Fields: this.buildSelectFieldNames(entity, fields),
                ResultType: 'simple',
                MaxRows: keys.length
            },
            contextUser
        );

        if (!result.Success) {
            LogError(`RecordComparisonEngine.loadRecords failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results ?? [];
    }

    /** Builds the field-name select list: PK fields + the compared fields (deduped). */
    protected buildSelectFieldNames(entity: EntityInfo, fields: EntityFieldInfo[]): string[] {
        const names = new Set<string>();
        for (const pk of entity.PrimaryKeys) {
            names.add(pk.Name);
        }
        for (const f of fields) {
            names.add(f.Name);
        }
        return Array.from(names);
    }

    /** Builds an OR-ed WHERE clause across all keys, e.g. "(ID='a') OR (ID='b')". */
    protected buildKeysFilter(keys: CompositeKey[]): string | null {
        const clauses = keys
            .filter(k => k.HasValue)
            .map(k => `(${k.ToWhereClause()})`);
        return clauses.length > 0 ? clauses.join(' OR ') : null;
    }

    /**
     * Correlates each input key (by column index) with its loaded row and builds the
     * per-record value maps. Missing rows yield a record with all-null values.
     */
    protected buildRecords(
        entity: EntityInfo,
        keys: CompositeKey[],
        fields: EntityFieldInfo[],
        rawRecords: Record<string, RecordFieldValue>[]
    ): RecordComparisonRecord[] {
        return keys.map((key, columnIndex) => {
            const row = this.findRowForKey(entity, key, rawRecords);
            const values = this.extractFieldValues(fields, row);
            return {
                ColumnIndex: columnIndex,
                Key: key,
                Label: this.buildRecordLabel(entity, key, row),
                Values: values
            };
        });
    }

    /** Finds the loaded row whose primary-key values match the supplied composite key. */
    protected findRowForKey(
        entity: EntityInfo,
        key: CompositeKey,
        rawRecords: Record<string, RecordFieldValue>[]
    ): Record<string, RecordFieldValue> | null {
        return rawRecords.find(row => this.rowMatchesKey(entity, key, row)) ?? null;
    }

    /** True when every PK value on the row equals the key's value (case-insensitive). */
    protected rowMatchesKey(
        entity: EntityInfo,
        key: CompositeKey,
        row: Record<string, RecordFieldValue>
    ): boolean {
        return entity.PrimaryKeys.every(pk => {
            const keyValue = key.GetValueByFieldName(pk.Name);
            return this.valuesEqual(row[pk.Name], keyValue as RecordFieldValue);
        });
    }

    /** Extracts the compared-field values from a loaded row (null when row missing). */
    protected extractFieldValues(
        fields: EntityFieldInfo[],
        row: Record<string, RecordFieldValue> | null
    ): Record<string, RecordFieldValue> {
        const values: Record<string, RecordFieldValue> = {};
        for (const f of fields) {
            values[f.Name] = row ? this.normalizeValue(row[f.Name]) : null;
        }
        return values;
    }

    /** Produces a readable label: the name-field value when present, else the key string. */
    protected buildRecordLabel(
        entity: EntityInfo,
        key: CompositeKey,
        row: Record<string, RecordFieldValue> | null
    ): string {
        const nameField = entity.Fields.find(f => f.IsNameField);
        if (row && nameField) {
            const v = row[nameField.Name];
            if (v !== null && v !== undefined && String(v).trim().length > 0) {
                return String(v);
            }
        }
        return key.Values();
    }

    /**
     * Builds the per-field delta matrix from the loaded records. Column 0 is the
     * reference (survivor candidate); every other cell is compared against it.
     * Fields where every record's value is empty are dropped.
     */
    protected buildFieldDeltas(
        fields: EntityFieldInfo[],
        records: RecordComparisonRecord[]
    ): RecordComparisonFieldDelta[] {
        const deltas: RecordComparisonFieldDelta[] = [];
        for (const field of fields) {
            const cells = this.buildFieldCells(field, records);
            if (this.allCellsEmpty(cells)) {
                continue;
            }
            deltas.push({
                FieldName: field.Name,
                DisplayName: field.DisplayNameOrName,
                Category: field.Category ?? null,
                Cells: cells,
                Differs: cells.some(c => !c.EqualsReference)
            });
        }
        return deltas;
    }

    /** Builds the per-record cells for one field, flagging equality against column 0. */
    protected buildFieldCells(
        field: EntityFieldInfo,
        records: RecordComparisonRecord[]
    ): RecordComparisonFieldCell[] {
        const referenceValue = records.length > 0 ? records[0].Values[field.Name] ?? null : null;
        return records.map(record => {
            const value = record.Values[field.Name] ?? null;
            return {
                ColumnIndex: record.ColumnIndex,
                Value: value,
                EqualsReference: this.valuesEqual(value, referenceValue)
            };
        });
    }

    /** True when every cell's value is null/empty (such a field carries no signal). */
    protected allCellsEmpty(cells: RecordComparisonFieldCell[]): boolean {
        return cells.every(c => c.Value === null || c.Value === '' || c.Value === undefined);
    }

    /** Case-insensitive, trimmed equality used for both diff highlighting and PK matching. */
    protected valuesEqual(a: RecordFieldValue, b: RecordFieldValue): boolean {
        if (a === null || a === undefined) {
            return b === null || b === undefined;
        }
        if (b === null || b === undefined) {
            return false;
        }
        return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    }

    /** Coerces a loaded value into a comparable scalar; passes scalars through, else null. */
    protected normalizeValue(value: RecordFieldValue | undefined): RecordFieldValue {
        if (value === undefined) {
            return null;
        }
        return value;
    }

    /** Builds a failed-shape result. */
    protected errorResult(entityName: string, message: string): RecordComparisonResult {
        return {
            Success: false,
            ErrorMessage: message,
            EntityName: entityName,
            Records: [],
            Fields: []
        };
    }
}
