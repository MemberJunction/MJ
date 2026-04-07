/**
 * IntegrationResultWriter — Writes DBAutoDoc discoveries back to integration metadata files.
 *
 * Takes the DBAutoDoc state output and updates:
 * 1. metadata/integrations/.{platform}.json — IsPrimaryKey, Description, RelatedIntegrationObjectID
 * 2. metadata/integrations/additionalSchemaInfo.json — soft PKs/FKs for CodeGen
 *
 * NEVER overwrites existing values — only fills in what was missing.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseDocumentation } from '../types/state.js';
import type { PKCandidate, FKCandidate } from '../types/discovery.js';
import type { IntegrationSeedResult } from './IntegrationGroundTruthSeeder.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface WriteResult {
    /** Number of IsPrimaryKey fields set */
    PKsWritten: number;
    /** Number of RelatedIntegrationObjectID/FK fields set */
    FKsWritten: number;
    /** Number of descriptions written (table + column) */
    DescriptionsWritten: number;
    /** Number of additionalSchemaInfo entries added */
    SchemaInfoEntriesWritten: number;
    /** Files modified */
    FilesModified: string[];
}

// ─── Writer ───────────────────────────────────────────────────────────────

export class IntegrationResultWriter {
    constructor(private MetadataDir: string) {}

    /**
     * Write DBAutoDoc discoveries back to integration metadata.
     * Only updates fields that were previously missing.
     */
    WriteResults(
        state: DatabaseDocumentation,
        seedResult: IntegrationSeedResult,
        metadataFilePath: string
    ): WriteResult {
        const result: WriteResult = {
            PKsWritten: 0,
            FKsWritten: 0,
            DescriptionsWritten: 0,
            SchemaInfoEntriesWritten: 0,
            FilesModified: [],
        };

        // Read the current metadata file
        if (!existsSync(metadataFilePath)) return result;
        const raw = readFileSync(metadataFilePath, 'utf-8');
        const records = JSON.parse(raw) as Array<Record<string, unknown>>;
        if (!records || records.length === 0) return result;

        const integration = records[0] as Record<string, unknown>;
        const relatedEntities = integration['relatedEntities'] as Record<string, unknown[]> | undefined;
        const objects = (relatedEntities?.['MJ: Integration Objects'] ?? []) as Array<Record<string, unknown>>;

        // Extract new discoveries from state (exclude pre-seeded ones — those are already in metadata)
        const newPKs = this.ExtractNewPKs(state, seedResult);
        const newFKs = this.ExtractNewFKs(state, seedResult);
        const newDescriptions = this.ExtractNewDescriptions(state, seedResult);

        // Apply new PKs to metadata
        for (const pk of newPKs) {
            const obj = objects.find(o => {
                const fields = o['fields'] as Record<string, unknown>;
                return (fields['Name'] as string)?.toLowerCase() === pk.tableName.toLowerCase();
            });
            if (!obj) continue;

            const objRelated = obj['relatedEntities'] as Record<string, unknown[]> | undefined;
            const fieldRecords = (objRelated?.['MJ: Integration Object Fields'] ?? []) as Array<Record<string, unknown>>;

            for (const colName of pk.columnNames) {
                const fieldRec = fieldRecords.find(f => {
                    const ff = f['fields'] as Record<string, unknown>;
                    return (ff['Name'] as string)?.toLowerCase() === colName.toLowerCase();
                });
                if (fieldRec) {
                    const ff = fieldRec['fields'] as Record<string, unknown>;
                    if (!ff['IsPrimaryKey']) {
                        ff['IsPrimaryKey'] = true;
                        ff['IsRequired'] = true;
                        ff['IsUniqueKey'] = true;
                        result.PKsWritten++;
                    }
                } else {
                    // Add new field record for the discovered PK
                    fieldRecords.push({
                        fields: {
                            IntegrationObjectID: '@parent:ID',
                            Name: colName,
                            DisplayName: colName,
                            Type: 'nvarchar',
                            Length: 255,
                            IsPrimaryKey: true,
                            IsRequired: true,
                            IsReadOnly: true,
                            IsUniqueKey: true,
                            AllowsNull: false,
                            Sequence: fieldRecords.length + 1,
                            Status: 'Active',
                        },
                    });
                    result.PKsWritten++;
                }
            }
        }

        // Apply new FKs
        for (const fk of newFKs) {
            const obj = objects.find(o => {
                const fields = o['fields'] as Record<string, unknown>;
                return (fields['Name'] as string)?.toLowerCase() === fk.sourceTable.toLowerCase();
            });
            if (!obj) continue;

            const objRelated = obj['relatedEntities'] as Record<string, unknown[]> | undefined;
            const fieldRecords = (objRelated?.['MJ: Integration Object Fields'] ?? []) as Array<Record<string, unknown>>;

            const fieldRec = fieldRecords.find(f => {
                const ff = f['fields'] as Record<string, unknown>;
                return (ff['Name'] as string)?.toLowerCase() === fk.sourceColumn.toLowerCase();
            });
            if (fieldRec) {
                const ff = fieldRec['fields'] as Record<string, unknown>;
                if (!ff['IsForeignKey']) {
                    ff['IsForeignKey'] = true;
                    ff['Description'] = ff['Description'] || `FK → ${fk.targetTable}`;
                    result.FKsWritten++;
                }
            } else {
                fieldRecords.push({
                    fields: {
                        IntegrationObjectID: '@parent:ID',
                        Name: fk.sourceColumn,
                        DisplayName: fk.sourceColumn,
                        Type: 'nvarchar',
                        Length: 255,
                        IsPrimaryKey: false,
                        IsForeignKey: true,
                        IsRequired: false,
                        IsReadOnly: true,
                        AllowsNull: true,
                        Description: `FK → ${fk.targetTable}`,
                        Sequence: fieldRecords.length + 1,
                        Status: 'Active',
                    },
                });
                result.FKsWritten++;
            }
        }

        // Apply new descriptions
        for (const [key, description] of Object.entries(newDescriptions)) {
            const parts = key.split('.');
            if (parts.length === 1) {
                // Table description
                const obj = objects.find(o => {
                    const fields = o['fields'] as Record<string, unknown>;
                    return (fields['Name'] as string)?.toLowerCase() === parts[0].toLowerCase();
                });
                if (obj) {
                    const fields = obj['fields'] as Record<string, unknown>;
                    if (!fields['Description']) {
                        fields['Description'] = description;
                        result.DescriptionsWritten++;
                    }
                }
            } else if (parts.length === 2) {
                // Column description: "table.column"
                const obj = objects.find(o => {
                    const fields = o['fields'] as Record<string, unknown>;
                    return (fields['Name'] as string)?.toLowerCase() === parts[0].toLowerCase();
                });
                if (obj) {
                    const objRelated = obj['relatedEntities'] as Record<string, unknown[]> | undefined;
                    const fieldRecords = (objRelated?.['MJ: Integration Object Fields'] ?? []) as Array<Record<string, unknown>>;
                    const fieldRec = fieldRecords.find(f => {
                        const ff = f['fields'] as Record<string, unknown>;
                        return (ff['Name'] as string)?.toLowerCase() === parts[1].toLowerCase();
                    });
                    if (fieldRec) {
                        const ff = fieldRec['fields'] as Record<string, unknown>;
                        if (!ff['Description']) {
                            ff['Description'] = description;
                            result.DescriptionsWritten++;
                        }
                    }
                }
            }
        }

        // Write back
        if (result.PKsWritten > 0 || result.FKsWritten > 0 || result.DescriptionsWritten > 0) {
            writeFileSync(metadataFilePath, JSON.stringify(records, null, 2));
            result.FilesModified.push(metadataFilePath);
        }

        // Update additionalSchemaInfo.json
        const schemaInfoWritten = this.UpdateAdditionalSchemaInfo(newPKs, newFKs, seedResult.SchemaName);
        result.SchemaInfoEntriesWritten = schemaInfoWritten;
        if (schemaInfoWritten > 0) {
            result.FilesModified.push(join(this.MetadataDir, 'additionalSchemaInfo.json'));
        }

        return result;
    }

    // ─── Private helpers ──────────────────────────────────────────────

    private ExtractNewPKs(state: DatabaseDocumentation, seed: IntegrationSeedResult): PKCandidate[] {
        const phase = state.phases?.keyDetection;
        if (!phase) return [];
        const preSeededTables = new Set(seed.ConfirmedPKs.map(pk => pk.tableName.toLowerCase()));
        return (phase.discovered?.primaryKeys ?? []).filter(
            pk => pk.status === 'confirmed' && !preSeededTables.has(pk.tableName.toLowerCase())
        );
    }

    private ExtractNewFKs(state: DatabaseDocumentation, seed: IntegrationSeedResult): FKCandidate[] {
        const phase = state.phases?.keyDetection;
        if (!phase) return [];
        const preSeededKeys = new Set(
            seed.ConfirmedFKs.map(fk => `${fk.sourceTable}.${fk.sourceColumn}`.toLowerCase())
        );
        return (phase.discovered?.foreignKeys ?? []).filter(
            fk => fk.status === 'confirmed' && !preSeededKeys.has(`${fk.sourceTable}.${fk.sourceColumn}`.toLowerCase())
        );
    }

    private ExtractNewDescriptions(state: DatabaseDocumentation, seed: IntegrationSeedResult): Record<string, string> {
        const descriptions: Record<string, string> = {};
        const existingKeys = new Set(Object.keys(seed.GroundTruth.tables ?? {}));

        for (const schema of (state.schemas ?? [])) {
            for (const table of (schema.tables ?? [])) {
                const tableKey = table.name;
                const fullKey = `${schema.name}.${table.name}`;

                // Table description (if new)
                if (table.description && !existingKeys.has(fullKey)) {
                    descriptions[tableKey] = table.description;
                }

                // Column descriptions
                for (const col of (table.columns ?? [])) {
                    if (col.description) {
                        const colKey = `${tableKey}.${col.name}`;
                        const existingTable = seed.GroundTruth.tables?.[fullKey];
                        const existingCol = existingTable?.columns?.[col.name];
                        if (!existingCol?.description) {
                            descriptions[colKey] = col.description;
                        }
                    }
                }
            }
        }

        return descriptions;
    }

    private UpdateAdditionalSchemaInfo(
        newPKs: PKCandidate[], newFKs: FKCandidate[], schemaName: string
    ): number {
        const infoPath = join(this.MetadataDir, 'additionalSchemaInfo.json');
        let existing: Record<string, unknown[]> = {};
        if (existsSync(infoPath)) {
            existing = JSON.parse(readFileSync(infoPath, 'utf-8')) as Record<string, unknown[]>;
        }

        const schemaEntries = (existing[schemaName] ?? []) as Array<Record<string, unknown>>;
        let entriesWritten = 0;

        for (const pk of newPKs) {
            let tableEntry = schemaEntries.find(
                e => (e['TableName'] as string)?.toLowerCase() === pk.tableName.toLowerCase()
            ) as Record<string, unknown> | undefined;

            if (!tableEntry) {
                tableEntry = { TableName: pk.tableName, PrimaryKey: [], ForeignKeys: [] };
                schemaEntries.push(tableEntry);
            }

            const pkArray = (tableEntry['PrimaryKey'] ?? []) as Array<Record<string, unknown>>;
            for (const col of pk.columnNames) {
                if (!pkArray.some(p => (p['FieldName'] as string)?.toLowerCase() === col.toLowerCase())) {
                    pkArray.push({ FieldName: col, Description: 'Discovered by DBAutoDoc' });
                    entriesWritten++;
                }
            }
            tableEntry['PrimaryKey'] = pkArray;
        }

        for (const fk of newFKs) {
            let tableEntry = schemaEntries.find(
                e => (e['TableName'] as string)?.toLowerCase() === fk.sourceTable.toLowerCase()
            ) as Record<string, unknown> | undefined;

            if (!tableEntry) {
                tableEntry = { TableName: fk.sourceTable, PrimaryKey: [], ForeignKeys: [] };
                schemaEntries.push(tableEntry);
            }

            const fkArray = (tableEntry['ForeignKeys'] ?? []) as Array<Record<string, unknown>>;
            if (!fkArray.some(f =>
                (f['FieldName'] as string)?.toLowerCase() === fk.sourceColumn.toLowerCase() &&
                (f['RelatedTable'] as string)?.toLowerCase() === fk.targetTable.toLowerCase()
            )) {
                fkArray.push({
                    FieldName: fk.sourceColumn,
                    SchemaName: schemaName,
                    RelatedTable: fk.targetTable,
                    RelatedField: fk.targetColumn,
                });
                entriesWritten++;
            }
            tableEntry['ForeignKeys'] = fkArray;
        }

        if (entriesWritten > 0) {
            existing[schemaName] = schemaEntries;
            writeFileSync(infoPath, JSON.stringify(existing, null, 2));
        }

        return entriesWritten;
    }
}
