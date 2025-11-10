import { DeletionAudit } from './deletion-auditor';
import { FlattenedRecord } from './record-dependency-analyzer';

/**
 * Generates human-readable reports for deletion audits
 */
export class DeletionReportGenerator {
    /**
     * Generate comprehensive deletion plan report
     */
    static generateReport(audit: DeletionAudit, verbose = false): string {
        const lines: string[] = [];

        lines.push('═'.repeat(80));
        lines.push('DELETION AUDIT REPORT');
        lines.push('═'.repeat(80));
        lines.push('');

        // Summary
        this.addSummary(lines, audit);

        // Explicit deletes (verbose only)
        if (verbose && audit.explicitDeletes.size > 0) {
            this.addExplicitDeletes(lines, audit);
        }

        // Implicit deletes
        if (audit.implicitDeletes.size > 0) {
            this.addImplicitDeletes(lines, audit);
        }

        // Already deleted records
        if (audit.alreadyDeleted.size > 0) {
            this.addAlreadyDeleted(lines, audit);
        }

        // Database-only references
        if (audit.orphanedReferences.length > 0) {
            this.addOrphanedReferences(lines, audit);
        }

        // Deletion order (verbose only)
        if (verbose && audit.deletionLevels.length > 0) {
            this.addDeletionOrder(lines, audit);
        }

        // Circular dependencies
        if (audit.circularDependencies.length > 0) {
            this.addCircularDependencies(lines, audit);
        }

        // Conclusion
        this.addConclusion(lines, audit);

        return lines.join('\n');
    }

    /**
     * Generate summary section
     */
    private static addSummary(lines: string[], audit: DeletionAudit): void {
        const totalMarkedForDeletion = audit.explicitDeletes.size + audit.implicitDeletes.size;
        const needDeletion = totalMarkedForDeletion - audit.alreadyDeleted.size;

        lines.push('SUMMARY:');
        lines.push(`  Records Marked for Deletion: ${totalMarkedForDeletion}`);
        lines.push(`    • Will be deleted: ${needDeletion}`);
        lines.push(`    • Already deleted: ${audit.alreadyDeleted.size}`);
        lines.push(`  Explicit Deletes (marked in metadata): ${audit.explicitDeletes.size}`);
        lines.push(`  Implicit Deletes (required by FK): ${audit.implicitDeletes.size}`);
        lines.push(`  Database-Only References: ${audit.orphanedReferences.length}`);
        lines.push(`  Deletion Levels: ${audit.deletionLevels.length}`);
        lines.push('');
    }

    /**
     * Add explicit deletes section
     */
    private static addExplicitDeletes(lines: string[], audit: DeletionAudit): void {
        lines.push('EXPLICIT DELETES (marked with delete: true):');

        // Group by entity
        const byEntity = this.groupByEntity(Array.from(audit.explicitDeletes.values()));

        for (const [entityName, records] of byEntity) {
            lines.push(`  ${entityName} (${records.length} record${records.length > 1 ? 's' : ''}):`);
            for (const record of records) {
                lines.push(`    ✓ ${this.formatRecordId(record)}`);
                lines.push(`      File: ${record.path}`);
            }
        }
        lines.push('');
    }

    /**
     * Add implicit deletes section
     */
    private static addImplicitDeletes(lines: string[], audit: DeletionAudit): void {
        lines.push('⚠️  IMPLICIT DELETES (required to satisfy FK constraints):');
        lines.push('   These records will be deleted because they depend on explicitly deleted records.');
        lines.push('');

        // Group by entity
        const byEntity = this.groupByEntity(Array.from(audit.implicitDeletes.values()));

        for (const [entityName, records] of byEntity) {
            lines.push(`  ${entityName} (${records.length} record${records.length > 1 ? 's' : ''}):`);
            for (const record of records) {
                lines.push(`    → ${this.formatRecordId(record)}`);
                lines.push(`      File: ${record.path}`);

                // Show what it depends on
                const deps = this.findDependencies(record, audit);
                if (deps.length > 0) {
                    lines.push(`      Depends on: ${deps.join(', ')}`);
                }
            }
        }
        lines.push('');
    }

    /**
     * Add already deleted records section
     */
    private static addAlreadyDeleted(lines: string[], audit: DeletionAudit): void {
        lines.push('ℹ️  ALREADY DELETED (exist in metadata but not in database):');
        lines.push('   These records are marked for deletion but already don\'t exist in the database.');
        lines.push('   No action will be taken for these records.');
        lines.push('');

        // Group by entity
        const byEntity = this.groupByEntity(Array.from(audit.alreadyDeleted.values()));

        for (const [entityName, records] of byEntity) {
            lines.push(`  ${entityName} (${records.length} record${records.length > 1 ? 's' : ''}):`);
            for (const record of records) {
                lines.push(`    ✓ ${this.formatRecordId(record)}`);
            }
        }
        lines.push('');
    }

    /**
     * Add orphaned references section
     */
    private static addOrphanedReferences(lines: string[], audit: DeletionAudit): void {
        lines.push('⚠️  DATABASE-ONLY REFERENCES (not in metadata files):');
        lines.push('   These records exist in the database but not in metadata.');
        lines.push('   May be handled by database cascade delete rules.');
        lines.push('   If not, deletion will fail with FK constraint errors.');
        lines.push('');

        // Group by entity
        const byEntity = new Map<string, typeof audit.orphanedReferences>();
        for (const ref of audit.orphanedReferences) {
            if (!byEntity.has(ref.entityName)) {
                byEntity.set(ref.entityName, []);
            }
            byEntity.get(ref.entityName)!.push(ref);
        }

        for (const [entityName, refs] of byEntity) {
            lines.push(`  ${entityName} (${refs.length} record${refs.length > 1 ? 's' : ''}):`);
            for (const ref of refs) {
                lines.push(`    ⚠️  ID: ${ref.dependentId}`);
                lines.push(`       References: ${ref.recordId} via ${ref.fieldName}`);
                lines.push(`       Note: May be handled by cascade delete OR require manual handling`);
            }
        }
        lines.push('');
    }

    /**
     * Add deletion order section
     */
    private static addDeletionOrder(lines: string[], audit: DeletionAudit): void {
        lines.push('DELETION ORDER (reverse topological sort):');
        lines.push('Records will be deleted in this order (highest dependency level first):');
        lines.push('');

        for (let i = 0; i < audit.deletionLevels.length; i++) {
            const level = audit.deletionLevels[i];
            const levelNumber = audit.deletionLevels.length - i; // Reverse numbering for clarity

            lines.push(`  Level ${levelNumber} (${level.length} record${level.length > 1 ? 's' : ''}):`);

            // Group by entity within level
            const byEntity = this.groupByEntity(level);
            for (const [entityName, records] of byEntity) {
                if (records.length === 1) {
                    lines.push(`    - ${entityName}: ${this.formatRecordId(records[0])}`);
                } else {
                    lines.push(`    - ${entityName} (${records.length} records):`);
                    for (const record of records) {
                        lines.push(`        ${this.formatRecordId(record)}`);
                    }
                }
            }
        }
        lines.push('');
    }

    /**
     * Add circular dependencies section
     */
    private static addCircularDependencies(lines: string[], audit: DeletionAudit): void {
        lines.push('❌ CIRCULAR DEPENDENCIES DETECTED:');
        lines.push('   The following circular dependencies prevent safe deletion:');
        lines.push('');

        for (let i = 0; i < audit.circularDependencies.length; i++) {
            const cycle = audit.circularDependencies[i];
            lines.push(`  Cycle ${i + 1}:`);
            lines.push(`    ${cycle.join(' → ')}`);
        }
        lines.push('');
        lines.push('  To resolve:');
        lines.push('  1. Review the relationships creating the cycle');
        lines.push('  2. Break the cycle by removing one of the dependencies');
        lines.push('  3. Consider using NULL values or restructuring relationships');
        lines.push('');
    }

    /**
     * Add conclusion section
     */
    private static addConclusion(lines: string[], audit: DeletionAudit): void {
        lines.push('═'.repeat(80));

        if (audit.circularDependencies.length > 0) {
            lines.push('STATUS: ❌ CANNOT PROCEED');
            lines.push('');
            lines.push('Circular dependencies detected. Please resolve the cycles above.');
        } else if (audit.implicitDeletes.size > 0 || audit.orphanedReferences.length > 0) {
            lines.push('STATUS: ⚠️  REVIEW REQUIRED');
            lines.push('');
            if (audit.implicitDeletes.size > 0) {
                lines.push(`${audit.implicitDeletes.size} implicit deletion${audit.implicitDeletes.size > 1 ? 's' : ''} will occur.`);
                lines.push('Review the implicit deletes above and confirm this is intended.');
            }
            if (audit.orphanedReferences.length > 0) {
                if (audit.implicitDeletes.size > 0) {
                    lines.push('');
                }
                lines.push(`${audit.orphanedReferences.length} database-only reference${audit.orphanedReferences.length > 1 ? 's' : ''} detected.`);
                lines.push('These may be handled by cascade delete rules or may cause FK errors.');
            }
        } else {
            lines.push('STATUS: ✓ SAFE TO PROCEED');
            lines.push('');
            lines.push('All deletions are explicitly marked and have no dependencies.');
        }

        lines.push('═'.repeat(80));
    }

    /**
     * Format a record ID for display
     */
    private static formatRecordId(record: FlattenedRecord): string {
        return record.record.fields?.Name ||
               record.record.primaryKey?.ID ||
               record.record.fields?.ID ||
               record.id;
    }

    /**
     * Group records by entity name
     */
    private static groupByEntity(records: FlattenedRecord[]): Map<string, FlattenedRecord[]> {
        const byEntity = new Map<string, FlattenedRecord[]>();

        for (const record of records) {
            if (!byEntity.has(record.entityName)) {
                byEntity.set(record.entityName, []);
            }
            byEntity.get(record.entityName)!.push(record);
        }

        return byEntity;
    }

    /**
     * Find what an implicit delete depends on (for display)
     */
    private static findDependencies(
        record: FlattenedRecord,
        audit: DeletionAudit
    ): string[] {
        const deps: string[] = [];

        for (const depId of record.dependencies) {
            const explicitRecord = audit.explicitDeletes.get(depId);
            if (explicitRecord) {
                deps.push(`${explicitRecord.entityName}:${this.formatRecordId(explicitRecord)}`);
            } else {
                const implicitRecord = audit.implicitDeletes.get(depId);
                if (implicitRecord) {
                    deps.push(`${implicitRecord.entityName}:${this.formatRecordId(implicitRecord)}`);
                }
            }
        }

        return deps;
    }

    /**
     * Generate a concise summary for logging
     */
    static generateSummary(audit: DeletionAudit): string {
        const parts: string[] = [];

        if (audit.explicitDeletes.size > 0) {
            parts.push(`${audit.explicitDeletes.size} explicit`);
        }

        if (audit.implicitDeletes.size > 0) {
            parts.push(`${audit.implicitDeletes.size} implicit`);
        }

        if (audit.orphanedReferences.length > 0) {
            parts.push(`${audit.orphanedReferences.length} orphaned refs`);
        }

        if (audit.circularDependencies.length > 0) {
            parts.push(`${audit.circularDependencies.length} cycles`);
        }

        return parts.length > 0 ? parts.join(', ') : 'no deletions';
    }
}
