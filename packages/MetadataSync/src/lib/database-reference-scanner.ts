import { Metadata, RunView, UserInfo, CompositeKey } from '@memberjunction/core';
import { FlattenedRecord } from './record-dependency-analyzer';
import { ReverseFKInfo } from './entity-foreign-key-helper';

/**
 * Maximum number of primary-key values to include in a single batched IN() filter when scanning
 * for database references. Keeps each generated query within SQL Server / provider size limits
 * while still collapsing thousands of per-record lookups into a handful of queries.
 */
const REFERENCE_SCAN_CHUNK_SIZE = 500;

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
    constructor(
        private metadata: Metadata,
        private contextUser: UserInfo
    ) {}

    /**
     * Scan database for records that reference records marked for deletion
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

        // Group the records-to-delete by entity, capturing each one's primary-key value.
        // We then issue ONE batched RunView per (target entity, FK field) using an IN() filter,
        // instead of one query per (record × FK field). Deleting thousands of records (e.g. a
        // re-seeded connector's Integration Objects) previously meant thousands of serial round
        // trips against large tables; batching collapses that to a handful of queries.
        const recordsByEntity = this.groupDeletesByEntity(recordsToDelete);

        for (const [entityName, deletes] of recordsByEntity) {
            const referencingEntities = reverseFKMap.get(entityName) || [];
            if (referencingEntities.length === 0) {
                continue;
            }

            // Normalized-PK -> referenced CompositeKey, used to attribute each found DB row back
            // to the specific record being deleted. GUIDs differ in case across SQL Server (upper)
            // and PostgreSQL (lower), so we key the map case-insensitively.
            const referencedKeyByPk = new Map<string, CompositeKey>();
            for (const d of deletes) {
                referencedKeyByPk.set(d.pkValue.toLowerCase(), d.key);
            }
            const allPkValues = deletes.map(d => d.pkValue);

            for (const refInfo of referencingEntities) {
                for (const chunk of this.chunkArray(allPkValues, REFERENCE_SCAN_CHUNK_SIZE)) {
                    try {
                        const inList = chunk.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
                        const filter = `${refInfo.fieldName} IN (${inList})`;

                        const result = await rv.RunView({
                            EntityName: refInfo.entityName,
                            ExtraFilter: filter,
                            ResultType: 'simple' // More efficient - we don't need entity objects
                        }, this.contextUser);

                        if (!result.Success || !result.Results || result.Results.length === 0) {
                            continue;
                        }

                        // Found database records that reference one of the records being deleted
                        for (const dbRecord of result.Results) {
                            const refPrimaryKey = this.getPrimaryKeyFromSimpleRecord(
                                dbRecord,
                                refInfo.entityName
                            );

                            if (!refPrimaryKey) {
                                console.warn(`Cannot get primary key for ${refInfo.entityName} record`);
                                continue;
                            }

                            // Map this DB row back to the exact record it references via its FK value.
                            const fkValue = dbRecord[refInfo.fieldName];
                            const referencedKey = fkValue != null
                                ? referencedKeyByPk.get(String(fkValue).toLowerCase())
                                : undefined;

                            if (!referencedKey) {
                                // FK value didn't match any record in this delete batch — skip defensively.
                                continue;
                            }

                            references.push({
                                entityName: refInfo.entityName,
                                primaryKey: refPrimaryKey,
                                referencingField: refInfo.fieldName,
                                referencedEntity: entityName,
                                referencedKey,
                                existsInMetadata: this.checkIfInMetadata(
                                    refInfo.entityName,
                                    refPrimaryKey,
                                    allMetadataRecords  // Check against ALL metadata, not just deletes
                                )
                            });
                        }
                    } catch (error) {
                        console.error(
                            `Error scanning references from ${refInfo.entityName}.${refInfo.fieldName} ` +
                            `to ${entityName}:`,
                            error
                        );
                    }
                }
            }
        }

        return references;
    }

    /**
     * Group records-to-delete by entity name, resolving each one's single-value primary key.
     * Records whose primary key cannot be resolved are skipped (with a warning), matching the
     * prior behavior. Composite keys fall back to their concatenated-string form.
     */
    private groupDeletesByEntity(
        recordsToDelete: FlattenedRecord[]
    ): Map<string, { pkValue: string; key: CompositeKey }[]> {
        const byEntity = new Map<string, { pkValue: string; key: CompositeKey }[]>();

        for (const record of recordsToDelete) {
            const key = this.extractPrimaryKey(record);
            if (!key) {
                console.warn(`Cannot scan references for ${record.entityName}: no primary key found`);
                continue;
            }

            const pkValue = key.KeyValuePairs.length === 1
                ? String(key.KeyValuePairs[0].Value)
                : key.ToConcatenatedString();

            const existing = byEntity.get(record.entityName);
            if (existing) {
                existing.push({ pkValue, key });
            } else {
                byEntity.set(record.entityName, [{ pkValue, key }]);
            }
        }

        return byEntity;
    }

    /**
     * Split an array into chunks of at most `size` elements. Used to keep batched IN() filters
     * within SQL Server / provider query-size limits.
     */
    private chunkArray<T>(items: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Extract primary key from a flattened record
     */
    private extractPrimaryKey(record: FlattenedRecord): CompositeKey | null {
        const entityInfo = this.metadata.Entities.find(e => e.Name === record.entityName);
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
        const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
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
     * Check if a database record exists in metadata files
     */
    private checkIfInMetadata(
        entityName: string,
        primaryKey: CompositeKey,
        records: FlattenedRecord[]
    ): boolean {
        const keyString = primaryKey.ToConcatenatedString();

        for (const record of records) {
            if (record.entityName !== entityName) {
                continue;
            }

            const recordKey = this.extractPrimaryKey(record);
            if (recordKey && recordKey.ToConcatenatedString() === keyString) {
                return true;
            }
        }

        return false;
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
