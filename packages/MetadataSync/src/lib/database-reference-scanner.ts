import { Metadata, RunView, UserInfo, CompositeKey, EntityInfo } from '@memberjunction/core';
import { FlattenedRecord } from './record-dependency-analyzer';
import { ReverseFKInfo } from './entity-foreign-key-helper';

/**
 * Maximum number of primary-key values placed in a single batched `IN (...)` filter when scanning
 * for database references. Keeps each generated query within SQL Server / provider size limits while
 * still collapsing thousands of per-record lookups into a handful of queries.
 */
const REFERENCE_SCAN_CHUNK_SIZE = 1000;

/**
 * Represents a database record that references a record being deleted
 */
export interface DatabaseReference {
    entityName: string;         // Entity containing the referencing record
    primaryKey: CompositeKey;   // Primary key of the referencing record
    referencingField: string;   // Foreign key field making the reference
    referencedEntity: string;   // Entity being referenced
    referencedKey: CompositeKey; // Primary key of referenced record
    existsInMetadata: boolean;  // Whether this record exists in metadata files
}

/**
 * Scans the database for existing records that reference records marked for deletion
 * This helps identify:
 * 1. Database-only records that will prevent deletion
 * 2. Records that should be included in the deletion plan
 */
export class DatabaseReferenceScanner {
    /** Memoized entity-info lookups so repeated primary-key extraction stays O(1). */
    private entityInfoCache = new Map<string, EntityInfo | undefined>();

    constructor(
        private metadata: Metadata,
        private contextUser: UserInfo
    ) {}

    /**
     * Scan database for records that reference records marked for deletion
     *
     * Queries are batched: all delete-target primary keys of a given entity are checked against
     * each referencing foreign key in a single `IN (...)` query, rather than one query per
     * (record × referencing field). Metadata membership is resolved via a pre-built key set
     * instead of re-scanning every metadata record for each reference found.
     *
     * @param recordsToDelete Records that will be deleted
     * @param reverseFKMap Map of entity -> entities that reference it
     * @param allMetadataRecords All records from metadata (for checking if DB record exists in metadata)
     * @returns Array of database references found
     */
    async scanForReferences(
        recordsToDelete: FlattenedRecord[],
        reverseFKMap: Map<string, ReverseFKInfo[]>,
        allMetadataRecords: FlattenedRecord[]
    ): Promise<DatabaseReference[]> {
        const references: DatabaseReference[] = [];
        const rv = new RunView();

        // Pre-build O(1) membership of "(entity, key) exists somewhere in metadata".
        const metadataKeys = this.buildMetadataKeySet(allMetadataRecords);

        // Group delete targets by entity so all of an entity's primary keys can hit each
        // referencing table in one batched query.
        const groups = this.groupRecordsByEntity(recordsToDelete);

        for (const [referencedEntity, group] of groups) {
            const referencingEntities = reverseFKMap.get(referencedEntity) || [];

            for (const refInfo of referencingEntities) {
                for (const valueChunk of this.chunk(group.pkValues, REFERENCE_SCAN_CHUNK_SIZE)) {
                    await this.scanReferencingFieldBatch(
                        rv,
                        referencedEntity,
                        refInfo,
                        valueChunk,
                        group.keyByValue,
                        metadataKeys,
                        references
                    );
                }
            }
        }

        return references;
    }

    /**
     * Run a single batched lookup for one referencing foreign key against a chunk of
     * delete-target primary keys, appending any matches to {@link out}.
     */
    private async scanReferencingFieldBatch(
        rv: RunView,
        referencedEntity: string,
        refInfo: ReverseFKInfo,
        pkValues: string[],
        keyByValue: Map<string, CompositeKey>,
        metadataKeys: Set<string>,
        out: DatabaseReference[]
    ): Promise<void> {
        if (pkValues.length === 0) {
            return;
        }

        try {
            const inList = pkValues.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
            const filter = `${refInfo.fieldName} IN (${inList})`;

            const result = await rv.RunView({
                EntityName: refInfo.entityName,
                ExtraFilter: filter,
                IgnoreMaxRows: true, // a single batched query can match far more rows than the entity's UserViewMaxRows cap
                ResultType: 'simple' // More efficient - we don't need entity objects
            }, this.contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return;
            }

            for (const dbRecord of result.Results) {
                const refPrimaryKey = this.getPrimaryKeyFromSimpleRecord(dbRecord, refInfo.entityName);
                if (!refPrimaryKey) {
                    console.warn(`Cannot get primary key for ${refInfo.entityName} record`);
                    continue;
                }

                // Map the referencing FK value back to the exact CompositeKey of the deleted record.
                const referencedRaw = dbRecord[refInfo.fieldName];
                const referencedKey = referencedRaw != null
                    ? keyByValue.get(this.normalizeId(referencedRaw.toString()))
                    : undefined;

                out.push({
                    entityName: refInfo.entityName,
                    primaryKey: refPrimaryKey,
                    referencingField: refInfo.fieldName,
                    referencedEntity,
                    referencedKey: referencedKey ?? CompositeKey.FromID(referencedRaw != null ? referencedRaw.toString() : ''),
                    existsInMetadata: metadataKeys.has(this.metadataKey(refInfo.entityName, refPrimaryKey))
                });
            }
        } catch (error) {
            console.error(
                `Error scanning references from ${refInfo.entityName}.${refInfo.fieldName} ` +
                `to ${referencedEntity}:`,
                error
            );
        }
    }

    /**
     * Group delete-target records by entity, collecting each entity's primary-key values and a
     * normalized value -> CompositeKey map for mapping query results back to the original record.
     */
    private groupRecordsByEntity(
        records: FlattenedRecord[]
    ): Map<string, { pkValues: string[]; keyByValue: Map<string, CompositeKey> }> {
        const groups = new Map<string, { pkValues: string[]; keyByValue: Map<string, CompositeKey> }>();

        for (const record of records) {
            const primaryKey = this.extractPrimaryKey(record);
            if (!primaryKey) {
                console.warn(`Cannot scan references for ${record.entityName}: no primary key found`);
                continue;
            }

            const pkValue = primaryKey.KeyValuePairs.length === 1
                ? primaryKey.KeyValuePairs[0].Value
                : primaryKey.ToConcatenatedString();

            let group = groups.get(record.entityName);
            if (!group) {
                group = { pkValues: [], keyByValue: new Map() };
                groups.set(record.entityName, group);
            }

            const normalized = this.normalizeId(pkValue);
            if (!group.keyByValue.has(normalized)) {
                group.keyByValue.set(normalized, primaryKey);
                group.pkValues.push(pkValue);
            }
        }

        return groups;
    }

    /**
     * Build a set of `entityName::normalizedKey` strings for every metadata record, enabling O(1)
     * "does this record exist in metadata" checks.
     */
    private buildMetadataKeySet(records: FlattenedRecord[]): Set<string> {
        const set = new Set<string>();
        for (const record of records) {
            const pk = this.extractPrimaryKey(record);
            if (pk) {
                set.add(this.metadataKey(record.entityName, pk));
            }
        }
        return set;
    }

    /** Composite map/set key for an (entity, primary key) pair, normalized for case-insensitive match. */
    private metadataKey(entityName: string, primaryKey: CompositeKey): string {
        return `${entityName}::${this.normalizeId(primaryKey.ToConcatenatedString())}`;
    }

    /** Normalize an identifier for case-insensitive comparison (UUIDs differ in case across SQL Server / PostgreSQL). */
    private normalizeId(value: string): string {
        return value.trim().toUpperCase();
    }

    /** Split an array into chunks of at most `size`. */
    private chunk<T>(items: T[], size: number): T[][] {
        if (items.length <= size) {
            return items.length ? [items] : [];
        }
        const result: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
            result.push(items.slice(i, i + size));
        }
        return result;
    }

    /** Memoized entity lookup by name (avoids repeated O(N) scans of the entity list). */
    private entityInfoByName(entityName: string): EntityInfo | undefined {
        if (this.entityInfoCache.has(entityName)) {
            return this.entityInfoCache.get(entityName);
        }
        const info = this.metadata.Entities.find(e => e.Name === entityName);
        this.entityInfoCache.set(entityName, info);
        return info;
    }

    /**
     * Extract primary key from a flattened record
     */
    private extractPrimaryKey(record: FlattenedRecord): CompositeKey | null {
        const entityInfo = this.entityInfoByName(record.entityName);
        if (!entityInfo) {
            return null;
        }

        const primaryKeys = entityInfo.PrimaryKeys;
        if (primaryKeys.length === 0) {
            return null;
        }

        // Single primary key
        if (primaryKeys.length === 1) {
            const pkField = primaryKeys[0].Name;
            const pkValue = record.record.primaryKey?.[pkField] || record.record.fields?.[pkField];

            if (!pkValue) {
                return null;
            }

            return CompositeKey.FromID(pkValue.toString());
        }

        // Composite primary key
        const keyPairs: { FieldName: string; Value: string }[] = [];
        for (const pk of primaryKeys) {
            const value = record.record.primaryKey?.[pk.Name] || record.record.fields?.[pk.Name];
            if (!value) {
                return null;
            }
            keyPairs.push({ FieldName: pk.Name, Value: value.toString() });
        }

        return CompositeKey.FromKeyValuePairs(keyPairs);
    }

    /**
     * Get primary key from a simple record (plain object from RunView with ResultType: 'simple')
     */
    private getPrimaryKeyFromSimpleRecord(record: Record<string, unknown>, entityName: string): CompositeKey | null {
        const entityInfo = this.entityInfoByName(entityName);
        if (!entityInfo) {
            return null;
        }

        const primaryKeys = entityInfo.PrimaryKeys;
        if (primaryKeys.length === 0) {
            return null;
        }

        // Single primary key
        if (primaryKeys.length === 1) {
            const pkField = primaryKeys[0].Name;
            const pkValue = record[pkField];

            if (!pkValue) {
                return null;
            }

            return CompositeKey.FromID(pkValue.toString());
        }

        // Composite primary key
        const keyPairs: { FieldName: string; Value: string }[] = [];
        for (const pk of primaryKeys) {
            const value = record[pk.Name];
            if (!value) {
                return null;
            }
            keyPairs.push({ FieldName: pk.Name, Value: value.toString() });
        }

        return CompositeKey.FromKeyValuePairs(keyPairs);
    }

    /**
     * Get orphaned references (database-only records not in metadata)
     * These will prevent deletion unless handled
     */
    getOrphanedReferences(references: DatabaseReference[]): DatabaseReference[] {
        return references.filter(ref => !ref.existsInMetadata);
    }

    /**
     * Get metadata references (records in metadata that reference deletion targets)
     * These should already be marked for deletion if the user set things up correctly
     */
    getMetadataReferences(references: DatabaseReference[]): DatabaseReference[] {
        return references.filter(ref => ref.existsInMetadata);
    }
}
