/**
 * IntegrationGroundTruthSeeder — Reads integration metadata JSON files and extracts
 * known PKs, FKs, and descriptions as DBAutoDoc ground truth.
 *
 * This seeder converts integration overlay metadata (from `metadata/integrations/.{platform}.json`)
 * into DBAutoDoc's native types: PKCandidate[], FKCandidate[], and GroundTruthConfig.
 *
 * Known constraints are injected as `status: 'confirmed'` with `confidence: 100`,
 * so the discovery engine skips them and only works on gaps.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import type { PKCandidate, FKCandidate, PKEvidence, FKEvidence } from '../types/discovery.js';
import type { GroundTruthConfig, TableGroundTruth, ColumnGroundTruth } from '../types/config.js';

// ─── Types ────────────────────────────────────────────────────────────────

/** Result from seeding integration metadata into DBAutoDoc ground truth.
 *
 * IMPORTANT: This is NOT a binary "documented vs gap" classification.
 * Each table can have ANY combination of present/missing metadata:
 * - Entity description: present or missing (per table)
 * - Field descriptions: present or missing (per INDIVIDUAL field)
 * - Primary key: present or missing (per table)
 * - Foreign keys: present or missing (per INDIVIDUAL field)
 *
 * The seeder locks EACH existing piece as immutable ground truth.
 * DBAutoDoc then fills EVERY remaining blank independently.
 */
export interface IntegrationSeedResult {
    /** Pre-confirmed PKs (from IsPrimaryKey: true in metadata) — locked, won't be re-detected */
    ConfirmedPKs: PKCandidate[];
    /** Pre-confirmed FKs (from IsForeignKey: true in metadata) — locked, won't be re-detected */
    ConfirmedFKs: FKCandidate[];
    /** Ground truth config — locks existing descriptions (table + field level) as immutable */
    GroundTruth: GroundTruthConfig;
    /** Per-table gap analysis — what's missing on EACH table */
    TableGaps: TableGapInfo[];
    /** All table names in this integration */
    AllTables: string[];
    /** Schema name for this integration */
    SchemaName: string;
    /** Integration name */
    IntegrationName: string;
}

/** Per-table breakdown of what exists vs what's missing */
export interface TableGapInfo {
    TableName: string;
    /** Whether this table has an entity description */
    HasEntityDescription: boolean;
    /** Whether this table has a confirmed PK */
    HasPrimaryKey: boolean;
    /** Number of fields that have descriptions */
    FieldsWithDescriptions: number;
    /** Number of fields that are missing descriptions */
    FieldsMissingDescriptions: number;
    /** Number of fields with confirmed FK relationships */
    FieldsWithFKs: number;
    /** Field names that are missing descriptions */
    FieldNamesMissingDescriptions: string[];
    /** Whether ANY gap exists on this table (needs some discovery) */
    HasAnyGap: boolean;
}

/** Shape of a single record in the metadata JSON */
interface MetadataIntegrationRecord {
    fields: {
        Name: string;
        Description?: string;
        ClassName?: string;
        [key: string]: unknown;
    };
    primaryKey?: { ID: string };
    relatedEntities?: {
        'MJ: Integration Objects'?: MetadataObjectRecord[];
    };
}

interface MetadataObjectRecord {
    fields: {
        IntegrationID: string;
        Name: string;
        DisplayName?: string;
        Description?: string;
        SupportsWrite?: boolean;
        [key: string]: unknown;
    };
    primaryKey?: { ID: string };
    relatedEntities?: {
        'MJ: Integration Object Fields'?: MetadataFieldRecord[];
    };
}

interface MetadataFieldRecord {
    fields: {
        IntegrationObjectID: string;
        Name: string;
        DisplayName?: string;
        Description?: string;
        Type?: string;
        IsPrimaryKey?: boolean;
        IsForeignKey?: boolean;
        IsRequired?: boolean;
        IsReadOnly?: boolean;
        IsUniqueKey?: boolean;
        [key: string]: unknown;
    };
    primaryKey?: { ID: string };
}

// ─── Default evidence for pre-seeded candidates ───────────────────────────

const CONFIRMED_PK_EVIDENCE: PKEvidence = {
    uniqueness: 1.0,
    nullCount: 0,
    totalRows: 0,
    dataPattern: 'unknown',
    namingScore: 1.0,
    dataTypeScore: 1.0,
    warnings: ['Pre-seeded from integration metadata overlay'],
};

const CONFIRMED_FK_EVIDENCE: FKEvidence = {
    namingMatch: 1.0,
    valueOverlap: 1.0,
    cardinalityRatio: 1.0,
    dataTypeMatch: true,
    nullPercentage: 0,
    sampleSize: 0,
    orphanCount: 0,
    warnings: ['Pre-seeded from integration metadata overlay'],
};

// ─── Seeder ───────────────────────────────────────────────────────────────

export class IntegrationGroundTruthSeeder {
    constructor(private MetadataDir: string) {}

    /**
     * Seed from all platform metadata files, or a single platform.
     * @param platformFilter — If provided, only process this platform (e.g., "hubspot")
     */
    SeedFromMetadata(platformFilter?: string): IntegrationSeedResult[] {
        const results: IntegrationSeedResult[] = [];
        const files = this.FindMetadataFiles(platformFilter);

        for (const filePath of files) {
            try {
                const result = this.ParsePlatformMetadata(filePath);
                if (result) results.push(result);
            } catch (err) {
                console.warn(`[Seeder] Failed to parse ${filePath}: ${err instanceof Error ? err.message : err}`);
            }
        }

        return results;
    }

    /**
     * Find all .{platform}.json files in the metadata directory.
     */
    private FindMetadataFiles(platformFilter?: string): string[] {
        if (!existsSync(this.MetadataDir)) return [];

        const files = readdirSync(this.MetadataDir)
            .filter(f => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json' && f !== '.integrations.json');

        if (platformFilter) {
            const target = `.${platformFilter.toLowerCase()}.json`;
            return files.filter(f => f.toLowerCase() === target).map(f => join(this.MetadataDir, f));
        }

        return files.map(f => join(this.MetadataDir, f));
    }

    /**
     * Parse a single platform's metadata file and extract ground truth.
     */
    private ParsePlatformMetadata(filePath: string): IntegrationSeedResult | null {
        const raw = readFileSync(filePath, 'utf-8');
        const records = JSON.parse(raw) as MetadataIntegrationRecord[];
        if (!records || records.length === 0) return null;

        const integration = records[0];
        const integrationName = integration.fields.Name;
        // Schema name = integration name lowercased, spaces removed
        const schemaName = integrationName.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

        const objects = integration.relatedEntities?.['MJ: Integration Objects'] ?? [];
        if (objects.length === 0) return null; // Dynamic connectors (NetSuite, MJ-to-MJ) have no static objects

        const confirmedPKs: PKCandidate[] = [];
        const confirmedFKs: FKCandidate[] = [];
        const groundTruth: GroundTruthConfig = { tables: {} };
        const tableGaps: TableGapInfo[] = [];
        const allTableNames: string[] = [];

        // Build object ID → name map for FK resolution
        const objectIdToName = new Map<string, string>();
        for (const obj of objects) {
            if (obj.primaryKey?.ID) {
                objectIdToName.set(obj.primaryKey.ID, obj.fields.Name);
            }
        }

        for (const obj of objects) {
            const tableName = obj.fields.Name;
            allTableNames.push(tableName);
            const fields = obj.relatedEntities?.['MJ: Integration Object Fields'] ?? [];

            // ─── Lock each existing piece as ground truth ──────────
            const tableGT: TableGroundTruth = {};
            const hasEntityDescription = !!obj.fields.Description;
            if (hasEntityDescription) {
                tableGT.description = obj.fields.Description;
            }
            const columnGT: Record<string, ColumnGroundTruth> = {};

            let hasPK = false;
            let fieldsWithDescriptions = 0;
            let fieldsMissingDescriptions = 0;
            let fieldsWithFKs = 0;
            const fieldNamesMissingDescriptions: string[] = [];

            for (const field of fields) {
                // Lock existing PK
                if (field.fields.IsPrimaryKey) {
                    hasPK = true;
                    confirmedPKs.push({
                        schemaName,
                        tableName,
                        columnNames: [field.fields.Name],
                        confidence: 100,
                        evidence: CONFIRMED_PK_EVIDENCE,
                        discoveredInIteration: 0,
                        validatedByLLM: false,
                        status: 'confirmed',
                    });
                }

                // Lock existing FK
                if (field.fields.IsForeignKey) {
                    fieldsWithFKs++;
                    const fkMatch = (field.fields.Description ?? '').match(/FK\s*[→→-]+\s*(\w+)/);
                    const targetTable = fkMatch ? fkMatch[1] : '';
                    if (targetTable) {
                        confirmedFKs.push({
                            schemaName,
                            sourceTable: tableName,
                            sourceColumn: field.fields.Name,
                            targetSchema: schemaName,
                            targetTable,
                            targetColumn: 'Id',
                            confidence: 100,
                            evidence: CONFIRMED_FK_EVIDENCE,
                            discoveredInIteration: 0,
                            validatedByLLM: false,
                            status: 'confirmed',
                        });
                    }
                }

                // Lock existing field description (per-field granularity)
                if (field.fields.Description && !field.fields.Description.startsWith('FK')) {
                    columnGT[field.fields.Name] = { description: field.fields.Description };
                    fieldsWithDescriptions++;
                } else {
                    fieldsMissingDescriptions++;
                    fieldNamesMissingDescriptions.push(field.fields.Name);
                }
            }

            // Store whatever ground truth exists for this table
            if (Object.keys(columnGT).length > 0) {
                tableGT.columns = columnGT;
            }
            if (Object.keys(tableGT).length > 0) {
                groundTruth.tables = groundTruth.tables ?? {};
                groundTruth.tables[`${schemaName}.${tableName}`] = tableGT;
            }

            // Per-table gap analysis (NOT binary — tracks each concern independently)
            const hasAnyGap = !hasEntityDescription || !hasPK || fieldsMissingDescriptions > 0;
            // Note: FK gaps are always possible (we can't know what SHOULD be an FK until discovery runs)
            tableGaps.push({
                TableName: tableName,
                HasEntityDescription: hasEntityDescription,
                HasPrimaryKey: hasPK,
                FieldsWithDescriptions: fieldsWithDescriptions,
                FieldsMissingDescriptions: fieldsMissingDescriptions,
                FieldsWithFKs: fieldsWithFKs,
                FieldNamesMissingDescriptions: fieldNamesMissingDescriptions,
                HasAnyGap: hasAnyGap,
            });
        }

        return {
            ConfirmedPKs: confirmedPKs,
            ConfirmedFKs: confirmedFKs,
            GroundTruth: groundTruth,
            TableGaps: tableGaps,
            AllTables: allTableNames,
            SchemaName: schemaName,
            IntegrationName: integrationName,
        };
    }
}
