import { Metadata, UserInfo } from '@memberjunction/core';
import {
    FlattenedRecord,
    ReverseDependency,
    RecordDependencyAnalyzer
} from './record-dependency-analyzer';
import { DatabaseReference, DatabaseReferenceScanner } from './database-reference-scanner';
import { EntityForeignKeyHelper } from './entity-foreign-key-helper';
import { SyncEngine } from './sync-engine';
/**
 * Complete audit result for deletion operations
 */
export interface DeletionAudit {
    // Records explicitly marked for deletion (delete: true in metadata)
    explicitDeletes: Map<string, FlattenedRecord>;

    // Records that must be deleted due to FK dependencies
    implicitDeletes: Map<string, FlattenedRecord>;

    // Records marked for deletion that already don't exist in the database
    alreadyDeleted: Map<string, FlattenedRecord>;

    // Database records that reference records being deleted (not in metadata)
    databaseOnlyReferences: DatabaseReference[];

    // Reverse dependency map: recordId -> records that depend on it
    reverseDependencies: Map<string, ReverseDependency[]>;

    // Deletion order (reverse topological sort) - highest dependency level first
    deletionLevels: FlattenedRecord[][];

    // Errors/warnings
    circularDependencies: string[][];
    orphanedReferences: ReverseDependency[];
}

/**
 * Performs comprehensive deletion auditing across all metadata files
 * Identifies all records that need to be deleted, in what order, and potential issues
 */
export class DeletionAuditor {
    constructor(
        private metadata: Metadata,
        private contextUser: UserInfo
    ) {}

    /**
     * Perform comprehensive deletion audit across all metadata files
     *
     * This analyzes:
     * 1. Which records are explicitly marked for deletion
     * 2. Which records must be implicitly deleted (due to FK constraints)
     * 3. Database-only references that will prevent deletion
     * 4. Correct deletion order (reverse topological sort)
     * 5. Circular dependencies
     *
     * @param allRecords All flattened records from all metadata files
     * @returns Complete deletion audit
     */
    async auditDeletions(allRecords: FlattenedRecord[]): Promise<DeletionAudit> {
        // Step 1: Identify records explicitly marked for deletion
        const explicitDeletes = this.findExplicitDeletes(allRecords);

        // Step 2: Build reverse dependency map for all records
        const analyzer = new RecordDependencyAnalyzer();
        const reverseDependencies = analyzer.buildReverseDependencyMap(allRecords);

        // Step 3: Find implicit deletes (records that depend on explicit deletes)
        const implicitDeletes = this.findImplicitDeletes(
            explicitDeletes,
            reverseDependencies,
            allRecords
        );

        // Step 4: Check which records actually exist in the database
        const allDeletes = new Map([...explicitDeletes, ...implicitDeletes]);
        const { existingRecords, alreadyDeleted } = await this.checkRecordExistence(
            Array.from(allDeletes.values())
        );

        // Step 5: Scan database for existing references (only for records that still exist)
        const reverseFKMap = EntityForeignKeyHelper.buildReverseFKMap(this.metadata);
        const scanner = new DatabaseReferenceScanner(this.metadata, this.contextUser);

        const databaseReferences = await scanner.scanForReferences(
            existingRecords,
            reverseFKMap,
            allRecords  // Pass all metadata records for correct exists-in-metadata check
        );

        // Step 6: Identify orphaned references (DB records not in metadata)
        const orphanedReferences = this.findOrphanedReferences(
            databaseReferences,
            allRecords
        );

        // Step 7: Calculate deletion order (reverse topological sort) - only for existing records
        const deletionLevels = analyzer.reverseTopologicalSort(
            existingRecords,
            reverseDependencies
        );

        // Step 8: Check for circular dependencies among records to delete
        const circularDependencies = this.findCircularDependencies(existingRecords);

        return {
            explicitDeletes,
            implicitDeletes,
            alreadyDeleted,
            databaseOnlyReferences: databaseReferences,
            reverseDependencies,
            deletionLevels,
            circularDependencies,
            orphanedReferences
        };
    }

    /**
     * Find all records marked with delete: true
     */
    private findExplicitDeletes(records: FlattenedRecord[]): Map<string, FlattenedRecord> {
        const deletes = new Map<string, FlattenedRecord>();

        for (const record of records) {
            if (record.record.deleteRecord?.delete === true) {
                deletes.set(record.id, record);
            }
        }

        return deletes;
    }

    /**
     * Find all records that depend on records being deleted (implicit deletes)
     * Uses BFS to find transitive dependents
     */
    private findImplicitDeletes(
        explicitDeletes: Map<string, FlattenedRecord>,
        reverseDependencies: Map<string, ReverseDependency[]>,
        allRecords: FlattenedRecord[]
    ): Map<string, FlattenedRecord> {
        const implicitDeletes = new Map<string, FlattenedRecord>();
        const visited = new Set<string>();

        // BFS to find all transitive dependents
        const queue = Array.from(explicitDeletes.keys());

        while (queue.length > 0) {
            const recordId = queue.shift()!;
            if (visited.has(recordId)) continue;
            visited.add(recordId);

            const dependents = reverseDependencies.get(recordId) || [];

            for (const dep of dependents) {
                // Add dependent to implicit deletes if not already explicit
                if (!explicitDeletes.has(dep.dependentId) &&
                    !implicitDeletes.has(dep.dependentId)) {

                    const record = allRecords.find(r => r.id === dep.dependentId);
                    if (record) {
                        implicitDeletes.set(dep.dependentId, record);
                        queue.push(dep.dependentId);
                    }
                }
            }
        }

        return implicitDeletes;
    }

    /**
     * Check which records actually exist in the database
     * Returns records separated into existing (need deletion) and already deleted
     */
    private async checkRecordExistence(
        records: FlattenedRecord[]
    ): Promise<{ existingRecords: FlattenedRecord[]; alreadyDeleted: Map<string, FlattenedRecord> }> {
        const existingRecords: FlattenedRecord[] = [];
        const alreadyDeleted = new Map<string, FlattenedRecord>();

        // Import SyncEngine to check record existence
        const syncEngine = new SyncEngine(this.contextUser);

        for (const record of records) {
            try {
                // Check if record exists in database
                const existingEntity = await syncEngine.loadEntity(
                    record.entityName,
                    record.record.primaryKey || {}
                );

                if (existingEntity) {
                    existingRecords.push(record);
                } else {
                    alreadyDeleted.set(record.id, record);
                }
            } catch (error) {
                // If we can't check, assume it exists to be safe
                existingRecords.push(record);
            }
        }

        return { existingRecords, alreadyDeleted };
    }

    /**
     * Find orphaned references (database records not in metadata files)
     * These will prevent deletion unless handled
     */
    private findOrphanedReferences(
        databaseReferences: DatabaseReference[],
        allRecords: FlattenedRecord[]
    ): ReverseDependency[] {
        const orphaned: ReverseDependency[] = [];

        for (const ref of databaseReferences) {
            if (!ref.existsInMetadata) {
                orphaned.push({
                    recordId: ref.referencedKey.ToConcatenatedString(),
                    dependentId: ref.primaryKey.ToConcatenatedString(),
                    entityName: ref.entityName,
                    fieldName: ref.referencingField,
                    filePath: '<DATABASE ONLY>'
                });
            }
        }

        return orphaned;
    }

    /**
     * Check for circular dependencies among records to delete
     * This would prevent safe deletion order
     */
    private findCircularDependencies(records: FlattenedRecord[]): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const detectCycle = (record: FlattenedRecord, path: string[]): boolean => {
            visited.add(record.id);
            recursionStack.add(record.id);
            path.push(`${record.entityName}:${this.getRecordDisplayName(record)}`);

            for (const depId of record.dependencies) {
                // Only check dependencies among records being deleted
                const depRecord = records.find(r => r.id === depId);
                if (!depRecord) continue;

                if (!visited.has(depId)) {
                    if (detectCycle(depRecord, [...path])) {
                        return true;
                    }
                } else if (recursionStack.has(depId)) {
                    // Found a cycle
                    const cycleStart = path.findIndex(p => p.startsWith(depRecord.entityName));
                    const cycle = path.slice(cycleStart);
                    cycle.push(`${depRecord.entityName}:${this.getRecordDisplayName(depRecord)}`);
                    cycles.push(cycle);
                    return true;
                }
            }

            recursionStack.delete(record.id);
            return false;
        };

        // Check all records for cycles
        for (const record of records) {
            if (!visited.has(record.id)) {
                detectCycle(record, []);
            }
        }

        return cycles;
    }

    /**
     * Get a display name for a record (for error messages)
     */
    private getRecordDisplayName(record: FlattenedRecord): string {
        return record.record.fields?.Name ||
               record.record.primaryKey?.ID ||
               record.record.fields?.ID ||
               record.id;
    }

    /**
     * Check if deletion audit has blocking issues
     */
    isValid(audit: DeletionAudit): boolean {
        return audit.orphanedReferences.length === 0 &&
               audit.circularDependencies.length === 0;
    }

    /**
     * Check if deletion audit requires user confirmation
     * (due to implicit deletes)
     */
    requiresConfirmation(audit: DeletionAudit): boolean {
        return audit.implicitDeletes.size > 0;
    }
}
