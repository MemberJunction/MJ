import { IMetadataProvider, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationFieldMap, ICompanyIntegrationEntityMap } from './entity-types.js';
import type { MappedRecord, ConflictResolution } from './types.js';
import { serializeKeyValue } from './KeySerialization.js';

/**
 * The field/value pairs a record is matched on — parallel arrays, so the same criteria can be
 * rendered as a SQL filter AND used as a local lookup key when a batch is resolved in one query.
 */
interface MatchCriteria {
    Fields: string[];
    Values: string[];
}

/** Batch-resolved record-map lookups. See {@link MatchEngine.PrefetchRecordMapEntries}. */
interface RecordMapIndex {
    /** ExternalSystemRecordID exactly as the database returned it → EntityRecordID. */
    Exact: Map<string, string>;
    /**
     * {@link normalizeExternalID}(stored ID) → EntityRecordID, consulted only when the exact
     * lookup misses. Keys that normalize to more than one distinct mapping are moved to
     * {@link Ambiguous} instead.
     */
    Normalized: Map<string, string>;
    /**
     * Normalized keys that more than one distinct mapping folds onto. The index cannot say which
     * one a requested ID meant, so these are resolved by the record's own query — never guessed.
     */
    Ambiguous: Set<string>;
}

/**
 * Folds an external ID the way a default SQL Server collation folds it for `=`
 * (`SQL_Latin1_General_CP1_CI_AS`: case-insensitive, trailing blanks ignored).
 *
 * This exists because the batched prefetch and the per-record query compare differently. The
 * per-record query sends `ExternalSystemRecordID = '<id>'` and lets the DATABASE decide equality;
 * the batch reads a set of rows and then pairs them up in JavaScript with `===`, which is
 * case- and whitespace-exact. So a row the database happily matched can miss in the JS map — and
 * a miss on the record map means "no mapping", which turns an UPDATE into a duplicate CREATE.
 * Normalizing gives the batch path a second, laxer attempt that mirrors the database's own rule.
 */
function normalizeExternalID(id: string): string {
    return id.replace(/\s+$/, '').toLowerCase();
}

/** Batch-resolved identity/key lookups. See {@link MatchEngine.PrefetchKeyMatches}. */
interface KeyMatchIndex {
    /** Criteria key → the matched row's PK values, '|'-joined. */
    Matched: Map<string, string>;
    /** Criteria keys PROVEN to have no matching row (never inferred). */
    Unmatched: Set<string>;
}

/**
 * Resolves mapped records against existing MJ data to determine
 * whether each record should be Created, Updated, Skipped, or Deleted.
 */
export class MatchEngine {
    /** Optional provider override; falls back to Metadata.Provider when not set. */
    private _provider?: IMetadataProvider;

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Resolves change types for a batch of mapped records by checking for existing
     * MJ records via key field matching and record map lookups.
     *
     * @param records - Mapped records with preliminary change types
     * @param entityMap - The entity map configuration for this object
     * @param fieldMaps - Active field maps for identifying key fields
     * @param contextUser - User context for data access
     * @returns Updated mapped records with resolved ChangeType and MatchedMJRecordID
     */
    public async Resolve(
        records: MappedRecord[],
        entityMap: ICompanyIntegrationEntityMap,
        fieldMaps: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MappedRecord[]> {
        if (provider) this._provider = provider;
        const keyFields = fieldMaps.filter(fm => fm.IsKeyField && fm.Status === 'Active');
        const conflictResolution = entityMap.ConflictResolution as ConflictResolution;

        // One query for the batch's record-map lookups instead of one per record
        // (tasks.md PR 2 item 5). Every record consults the map — on the deleted path directly,
        // on the live path as the fallback when identity/key matching finds nothing — so on a
        // 500-record batch this replaces up to 500 single-row reads with a single `IN` read.
        const [mapIndex, keyIndex] = await Promise.all([
            this.PrefetchRecordMapEntries(records, entityMap, contextUser),
            this.PrefetchKeyMatches(records, keyFields, contextUser),
        ]);

        const results: MappedRecord[] = [];
        for (const record of records) {
            const resolved = await this.ResolveSingleRecord(
                record,
                entityMap,
                keyFields,
                conflictResolution,
                contextUser,
                mapIndex,
                keyIndex
            );
            results.push(resolved);
        }
        return results;
    }

    /**
     * Reads the record-map rows for an entire batch of external IDs in one query.
     *
     * Returns an index containing only the IDs that HAVE a mapping; a miss is therefore
     * represented by absence, which is exactly what the per-record lookup needed to distinguish.
     * Returns null if the read fails, which makes callers fall back to their original per-record
     * query rather than silently treating every record as unmapped — that mistake would turn an
     * incremental sync into a batch of duplicate creates.
     *
     * The index carries a second, normalized view of the same rows. The `IN (…)` read is evaluated
     * by the database under its own collation, so a row stored as `abc` comes back for a requested
     * `ABC`; pairing the result up in JavaScript with `===` would then miss it. See
     * {@link normalizeExternalID}.
     */
    private async PrefetchRecordMapEntries(
        records: MappedRecord[],
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<RecordMapIndex | null> {
        const externalIDs = Array.from(new Set(
            records.map(r => r.ExternalRecord.ExternalID).filter(id => id != null && id !== '')
        ));
        if (externalIDs.length === 0) return { Exact: new Map(), Normalized: new Map(), Ambiguous: new Set() };

        const inList = externalIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const rv = new RunView();
        const result = await rv.RunView<{ ExternalSystemRecordID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${entityMap.CompanyIntegrationID}' ` +
                `AND EntityID='${entityMap.EntityID}' ` +
                `AND ExternalSystemRecordID IN (${inList})`,
            Fields: ['ExternalSystemRecordID', 'EntityRecordID'],
            IgnoreMaxRows: true, // a batch can exceed the entity's default row cap
            ResultType: 'simple',
            // Same reason the per-record lookup bypasses the cache: this decides CREATE vs UPDATE,
            // and a stale miss re-creates a record that already exists.
            BypassCache: true,
        }, contextUser);

        if (!result.Success) return null;
        return this.buildRecordMapIndex(result.Results);
    }

    /** Builds the exact + normalized views of a record-map read, separating out ambiguous folds. */
    private buildRecordMapIndex(
        rows: { ExternalSystemRecordID: string; EntityRecordID: string }[]
    ): RecordMapIndex {
        const index: RecordMapIndex = { Exact: new Map(), Normalized: new Map(), Ambiguous: new Set() };
        const ambiguous = index.Ambiguous;

        for (const row of rows) {
            // A mapping with no external ID cannot be looked up by one. Skipping it keeps a bad
            // row out of the index instead of taking the whole batch's matching down with it.
            const externalID = row.ExternalSystemRecordID;
            if (typeof externalID !== 'string' || externalID === '') continue;

            index.Exact.set(externalID, row.EntityRecordID);

            const norm = normalizeExternalID(externalID);
            const seen = index.Normalized.get(norm);
            if (seen === undefined) index.Normalized.set(norm, row.EntityRecordID);
            else if (seen !== row.EntityRecordID) ambiguous.add(norm);
        }

        for (const key of ambiguous) index.Normalized.delete(key);
        return index;
    }

    /**
     * Resolves a single record by checking for an existing MJ match.
     */
    private async ResolveSingleRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        keyFields: ICompanyIntegrationFieldMap[],
        conflictResolution: ConflictResolution,
        contextUser: UserInfo,
        mapIndex?: RecordMapIndex | null,
        keyIndex?: KeyMatchIndex | null
    ): Promise<MappedRecord> {
        if (record.ExternalRecord.IsDeleted) {
            return this.ResolveDeletedRecord(record, entityMap, contextUser, mapIndex);
        }

        const existingID = await this.FindExistingRecord(
            record, entityMap, keyFields, contextUser, mapIndex, keyIndex
        );

        if (existingID) {
            return this.ResolveExistingRecord(record, existingID, conflictResolution);
        }

        return { ...record, ChangeType: 'Create' };
    }

    /**
     * Handles records marked as deleted in the external system.
     */
    private async ResolveDeletedRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo,
        mapIndex?: RecordMapIndex | null
    ): Promise<MappedRecord> {
        const existingID = await this.FindRecordMapEntry(
            entityMap.CompanyIntegrationID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            contextUser,
            mapIndex
        );

        if (existingID) {
            return { ...record, ChangeType: 'Delete', MatchedMJRecordID: existingID };
        }

        return { ...record, ChangeType: 'Skip' };
    }

    /**
     * Determines change type for a record that matches an existing MJ record.
     */
    private ResolveExistingRecord(
        record: MappedRecord,
        existingID: string,
        conflictResolution: ConflictResolution
    ): MappedRecord {
        if (conflictResolution === 'Manual') {
            return { ...record, ChangeType: 'Skip', MatchedMJRecordID: existingID };
        }
        return { ...record, ChangeType: 'Update', MatchedMJRecordID: existingID };
    }

    /**
     * Attempts to find an existing MJ record by identity (PK) or, failing that, by the
     * configured key fields — then falls back to the CompanyIntegrationRecordMap.
     *
     * The direct lookup is attempted whenever it CAN resolve something:
     *  - the mapped record carries a complete PK (single OR composite) — the identity case,
     *    and the same key the apply path will address the row by; or
     *  - key fields are configured — the fallback case, for mapping external records onto
     *    pre-existing MJ rows whose PK the external system does not know.
     *
     * Previously a single-PK entity with no configured key fields skipped this entirely and
     * relied on the record map alone — so a record whose map row was missing (or truncated;
     * see `LoadAllRecordMaps`) re-CREATED a row whose PK already existed. Integration shadow
     * tables are exactly this shape: a single soft PK holding the external ID.
     */
    private async FindExistingRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo,
        mapIndex?: RecordMapIndex | null,
        keyIndex?: KeyMatchIndex | null
    ): Promise<string | null> {
        if (keyFields.length > 0 || this.hasCompleteMappedPrimaryKey(record)) {
            const idByKeys = await this.LookupByKeyFields(record, keyFields, contextUser, keyIndex);
            if (idByKeys) return idByKeys;
        }

        return this.FindRecordMapEntry(
            entityMap.CompanyIntegrationID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            contextUser,
            mapIndex
        );
    }

    /**
     * Answers the identity/key lookup from the batch prefetch when it can, and only issues the
     * per-record query when the prefetch neither found the record nor proved it absent.
     */
    private async LookupByKeyFields(
        record: MappedRecord,
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo,
        keyIndex?: KeyMatchIndex | null
    ): Promise<string | null> {
        if (keyIndex) {
            const criteria = this.BuildMatchCriteria(record, keyFields);
            if (criteria) {
                const key = this.CriteriaKey(criteria.Fields, criteria.Values);
                const matched = keyIndex.Matched.get(key);
                if (matched) return matched;
                if (keyIndex.Unmatched.has(key)) return null;
            }
        }
        return this.FindByKeyFields(record, keyFields, contextUser);
    }

    /**
     * Returns the entity's primary-key fields (soft PKs included — integration shadow tables
     * carry no physical key, so `PrimaryKeys` is populated from `additionalSchemaInfo` and is
     * still the natural identity).
     */
    private primaryKeyFieldsFor(mjEntityName: string): Array<{ Name: string }> {
        const entityInfo = this.ProviderToUse.EntityByName(mjEntityName);
        return entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);
    }

    /** True when the mapped data carries a value for EVERY PK field — i.e. it asserts an identity. */
    private hasCompleteMappedPrimaryKey(record: MappedRecord): boolean {
        const pkFields = this.primaryKeyFieldsFor(record.MJEntityName);
        if (pkFields.length === 0) return false;
        return pkFields.every(f => record.MappedFields[f.Name] != null);
    }

    /**
     * Searches for an existing MJ record, using ONE definition of identity.
     *
     * **The unified rule (tasks.md PR 2 item 3).** The entity's primary key — including a
     * soft PK, which is what integration shadow tables carry — is the single definition of
     * record identity, for matching AND for saving. Configured key fields (`IsKeyField`) are
     * a *fallback lookup* for records whose PK the mapped data does not carry, never a
     * competing identity.
     *
     * Concretely: when the mapped record carries a COMPLETE PK, match on the PK alone. The
     * apply path already addresses the record by its PK (`CreateRecord.extractMappedPrimaryKey`
     * → `InnerLoad`), so matching on anything else is exactly how a record could match one row
     * and then be written to another — or match a row whose PK then collides on save. When the
     * PK is absent or partial (e.g. mapping external records onto pre-existing MJ rows keyed by
     * a server-assigned UUID), fall back to the configured key fields, plus whatever PK parts
     * ARE present to narrow the result.
     *
     * The returned ID is always the PK values in `PrimaryKeys` order, '|'-joined — the same
     * format `ExternalID`/`EntityRecordID` use — so the caller can load the row directly.
     */
    private async FindByKeyFields(
        record: MappedRecord,
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo
    ): Promise<string | null> {
        const pkFields = this.primaryKeyFieldsFor(record.MJEntityName);
        const match = this.BuildMatchCriteria(record, keyFields);
        if (!match) return null;

        const rv = new RunView();
        const result = await rv.RunView<Record<string, string>>({
            EntityName: record.MJEntityName,
            ExtraFilter: this.CriteriaToSQL(match),
            Fields: pkFields.map(f => f.Name),
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;

        // Return all PK values joined with '|' — matches the ExternalID format
        // written by BaseRESTIntegrationConnector.ToExternalRecord for composite PKs.
        return pkFields.map(f => result.Results[0][f.Name] ?? '').join('|');
    }

    /**
     * Builds the field/value criteria that identify a record, applying the item-3 identity rule:
     * a COMPLETE primary key matches on the PK alone; otherwise the configured key fields plus
     * whatever PK parts are present. Returns null when nothing can be matched on.
     *
     * Field/value pairs (rather than pre-rendered SQL) so the same criteria can be rendered as a
     * filter clause AND used as a local lookup key when a whole batch is resolved in one query.
     */
    private BuildMatchCriteria(
        record: MappedRecord,
        keyFields: ICompanyIntegrationFieldMap[]
    ): MatchCriteria | null {
        const pkFields = this.primaryKeyFieldsFor(record.MJEntityName);
        if (pkFields.length === 0) return null;

        // serializeKeyValue mirrors the write-side coercion (objects → JSON, not "[object Object]")
        // so an object-valued key filters against the value actually stored in the column.
        const pk: MatchCriteria = { Fields: [], Values: [] };
        for (const pkField of pkFields) {
            const value = record.MappedFields[pkField.Name];
            if (value == null) continue;
            pk.Fields.push(pkField.Name);
            pk.Values.push(serializeKeyValue(value));
        }

        // Complete PK → identity match, on the PK alone. Configured key fields are deliberately
        // NOT and-ed in here: a key field that disagrees with the PK would turn a correct
        // identity match into a miss, and a miss becomes a duplicate INSERT downstream.
        if (pk.Fields.length === pkFields.length) return pk;

        // Partial/absent PK → key fields first, then the PK parts we do have, to narrow.
        // A field can be both a key field and a PK part; `A='x' AND A='x'` is noise, so dedup
        // by name (both read the same MappedFields entry, so the values cannot disagree).
        const merged: MatchCriteria = { Fields: [], Values: [] };
        const add = (field: string, value: string) => {
            if (merged.Fields.includes(field)) return;
            merged.Fields.push(field);
            merged.Values.push(value);
        };
        for (const kf of keyFields) {
            const value = record.MappedFields[kf.DestinationFieldName];
            if (value == null) continue;
            add(kf.DestinationFieldName, serializeKeyValue(value));
        }
        for (let i = 0; i < pk.Fields.length; i++) add(pk.Fields[i], pk.Values[i]);

        return merged.Fields.length > 0 ? merged : null;
    }

    /**
     * Renders criteria as a filter clause.
     *
     * ANSI double-quoted identifiers — portable across SQL Server (QUOTED_IDENTIFIER ON, the
     * driver default) and Postgres (exact-case; integration columns are lowercase). Plain
     * identifiers break on a column named for a reserved word (e.g. a soft PK named
     * `open`/`order`); brackets would fix SQL Server but break Postgres, so double-quote.
     */
    private CriteriaToSQL(criteria: MatchCriteria): string {
        return criteria.Fields
            .map((f, i) => `"${f}" = '${criteria.Values[i].replace(/'/g, "''")}'`)
            .join(' AND ');
    }

    /** Order-independent local lookup key for a criteria set (and for a row read back for it). */
    private CriteriaKey(fields: string[], values: string[]): string {
        return fields
            .map((f, i) => [f, values[i]] as const)
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            .map(([f, v]) => `${f} ${v}`)
            .join('');
    }

    /**
     * Resolves the identity/key lookup for a WHOLE batch in one query per criteria shape,
     * instead of one query per record (tasks.md PR 2 item 5).
     *
     * Records are grouped by entity + the exact set of fields they match on, so every record in
     * a group produces a structurally identical AND-clause; the group's clauses are OR-ed into a
     * single read and the rows attributed back locally by the same field/value pairs that built
     * the filter. A 500-record batch of an integration shadow table (single soft PK) collapses
     * from 500 reads to 1.
     *
     * Attribution is deliberately conservative. `Matched` holds records we found a row for;
     * `Unmatched` holds records we can PROVE have no row — only populated when the group's read
     * returned nothing at all, so a record whose row exists but whose local key comparison
     * differs from the database's (case-insensitive collation, numeric/date formatting) is left
     * in neither set and falls back to its own query. A false "unmatched" would create a
     * duplicate, so it is never inferred.
     *
     * Returns null if any group read fails — callers then use the original per-record path.
     */
    private async PrefetchKeyMatches(
        records: MappedRecord[],
        keyFields: ICompanyIntegrationFieldMap[],
        contextUser: UserInfo
    ): Promise<KeyMatchIndex | null> {
        const groups = new Map<string, { EntityName: string; Criteria: MatchCriteria[] }>();
        for (const record of records) {
            if (record.ExternalRecord.IsDeleted) continue;
            if (keyFields.length === 0 && !this.hasCompleteMappedPrimaryKey(record)) continue;
            const criteria = this.BuildMatchCriteria(record, keyFields);
            if (!criteria) continue;
            const signature = `${record.MJEntityName}${[...criteria.Fields].sort().join(',')}`;
            const group = groups.get(signature) ?? { EntityName: record.MJEntityName, Criteria: [] };
            group.Criteria.push(criteria);
            if (!groups.has(signature)) groups.set(signature, group);
        }

        const index: KeyMatchIndex = { Matched: new Map(), Unmatched: new Set() };
        if (groups.size === 0) return index;

        for (const group of groups.values()) {
            const pkFields = this.primaryKeyFieldsFor(group.EntityName);
            if (pkFields.length === 0) continue;

            // Distinct clause sets only — a batch commonly repeats the same external record.
            const clauses = new Map<string, MatchCriteria>();
            for (const c of group.Criteria) clauses.set(this.CriteriaKey(c.Fields, c.Values), c);

            const filter = Array.from(clauses.values())
                .map(c => `(${this.CriteriaToSQL(c)})`)
                .join(' OR ');
            const lookupFields = group.Criteria[0].Fields;
            const fields = Array.from(new Set([...pkFields.map(f => f.Name), ...lookupFields]));

            const rv = new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: group.EntityName,
                ExtraFilter: filter,
                Fields: fields,
                IgnoreMaxRows: true, // a batch's matches can exceed the entity's default row cap
                ResultType: 'simple',
            }, contextUser);

            if (!result.Success) return null;

            for (const row of result.Results) {
                const rowKey = this.CriteriaKey(
                    lookupFields,
                    lookupFields.map(f => serializeKeyValue(row[f]))
                );
                if (index.Matched.has(rowKey)) continue; // first row wins, as MaxRows:1 did
                index.Matched.set(
                    rowKey,
                    pkFields.map(f => (row[f.Name] as string | null) ?? '').join('|')
                );
            }

            // Only a completely empty read proves absence for the whole group (see doc above).
            if (result.Results.length === 0) {
                for (const key of clauses.keys()) index.Unmatched.add(key);
            }
        }

        return index;
    }

    /**
     * Checks the CompanyIntegrationRecordMap for a previous external↔MJ mapping.
     */
    private async FindRecordMapEntry(
        companyIntegrationID: string,
        externalID: string,
        entityID: string,
        contextUser: UserInfo,
        mapIndex?: RecordMapIndex | null
    ): Promise<string | null> {
        // The batch prefetch read every mapping for this batch's external IDs in one query, so
        // a hit here is the same answer the per-record query would give.
        //
        // Concluding ABSENCE from the index is the delicate part, and it is only sound because the
        // index is consulted the same two ways the database compared: exactly, then folded the way
        // a default collation folds (normalizeExternalID). Two cases the index cannot speak for —
        // an ambiguous fold, and an empty ID that was never in the `IN (…)` list — fall through to
        // the per-record query below and let the database answer.
        if (mapIndex && externalID) {
            const exact = mapIndex.Exact.get(externalID);
            if (exact !== undefined) return exact;
            const folded = normalizeExternalID(externalID);
            const near = mapIndex.Normalized.get(folded);
            if (near !== undefined) return near;
            // Ambiguous fold: several mappings collapse onto this key and the index cannot say
            // which one the database would pick. Fall through and let it decide.
            if (!mapIndex.Ambiguous.has(folded)) return null;
        }

        const rv = new RunView();
        const escapedExternalID = externalID.replace(/'/g, "''");
        const result = await rv.RunView<{ EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegrationID}' ` +
                `AND ExternalSystemRecordID='${escapedExternalID}' ` +
                `AND EntityID='${entityID}'`,
            Fields: ['EntityRecordID'],
            MaxRows: 1,
            ResultType: 'simple',
            // CRITICAL: this lookup decides CREATE vs UPDATE for an incoming record. It MUST read
            // committed state — a cached null (from a lookup made before this record's map existed)
            // would make a re-sync of a changed record wrongly CREATE → duplicate-key on the dest.
            BypassCache: true,
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;
        return result.Results[0].EntityRecordID;
    }
}
