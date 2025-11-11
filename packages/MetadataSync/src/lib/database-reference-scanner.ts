import { Metadata, RunView, UserInfo, CompositeKey } from '@memberjunction/core';
import { FlattenedRecord } from './record-dependency-analyzer';
import { ReverseFKInfo } from './entity-foreign-key-helper';

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

        for (const record of recordsToDelete) {
            const entityName = record.entityName;
            const primaryKey = this.extractPrimaryKey(record);

            if (!primaryKey) {
                console.warn(`Cannot scan references for ${entityName}: no primary key found`);
                continue;
            }

            // Find all entities that could reference this one
            const referencingEntities = reverseFKMap.get(entityName) || [];

            for (const refInfo of referencingEntities) {
                try {
                    // Query database for existing references
                    // Use the actual value from the primary key, not the concatenated string format
                    const pkValue = primaryKey.KeyValuePairs.length === 1
                        ? primaryKey.KeyValuePairs[0].Value
                        : primaryKey.ToConcatenatedString();

                    const filter = `${refInfo.fieldName} = '${pkValue}'`;

                    const result = await rv.RunView({
                        EntityName: refInfo.entityName,
                        ExtraFilter: filter,
                        ResultType: 'simple' // More efficient - we don't need entity objects
                    }, this.contextUser);

                    if (result.Success && result.Results && result.Results.length > 0) {
                        // Found database records that reference this record
                        for (const dbRecord of result.Results) {
                            const refPrimaryKey = this.getPrimaryKeyFromSimpleRecord(
                                dbRecord,
                                refInfo.entityName
                            );

                            if (!refPrimaryKey) {
                                console.warn(`Cannot get primary key for ${refInfo.entityName} record`);
                                continue;
                            }

                            references.push({
                                entityName: refInfo.entityName,
                                primaryKey: refPrimaryKey,
                                referencingField: refInfo.fieldName,
                                referencedEntity: entityName,
                                referencedKey: primaryKey,
                                existsInMetadata: this.checkIfInMetadata(
                                    refInfo.entityName,
                                    refPrimaryKey,
                                    allMetadataRecords  // Check against ALL metadata, not just deletes
                                )
                            });
                        }
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

        return references;
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
