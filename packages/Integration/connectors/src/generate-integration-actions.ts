#!/usr/bin/env node
/**
 * Generic CLI script to generate integration action metadata files.
 *
 * Instantiates registered integration connectors, calls GetActionGeneratorConfig()
 * to get their object/field metadata, then uses ActionMetadataGenerator to produce
 * mj-sync compatible action JSON files.
 *
 * Usage:
 *   npx tsx src/generate-integration-actions.ts [-- connector-name] [--output-dir <path>]
 *
 * Examples:
 *   npx tsx src/generate-integration-actions.ts                # All connectors
 *   npx tsx src/generate-integration-actions.ts -- hubspot     # HubSpot only
 *   npx tsx src/generate-integration-actions.ts -- salesforce  # Salesforce only
 *   npx tsx src/generate-integration-actions.ts -- rasa        # Rasa.io only
 *   npx tsx src/generate-integration-actions.ts -- ym          # YourMembership only
 *
 * Note: The `--` separator is required before the connector name so `npx` passes
 * it as a script argument rather than interpreting it as an npx option.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    ActionMetadataGenerator,
    type BaseIntegrationConnector,
} from '@memberjunction/integration-engine';
import { HubSpotConnector } from './HubSpotConnector.js';
import { RasaConnector } from './RasaConnector.js';
import { SalesforceConnector } from './SalesforceConnector.js';
import { YourMembershipConnector } from './YourMembershipConnector.js';
import { SageIntacctConnector } from './SageIntacctConnector.js';
import { QuickBooksConnector } from './QuickBooksConnector.js';

/** Shape of an mj-sync record with optional primaryKey/sync populated by `mj sync pull`. */
interface MjSyncRecord {
    fields: Record<string, unknown>;
    primaryKey?: Record<string, string>;
    sync?: { lastModified: string; checksum: string };
    relatedEntities?: Record<string, MjSyncRecord[]>;
}

/** Raw Integration Object field as stored in the mj-sync metadata JSON. */
interface MetadataField {
    fields: {
        Name: string;
        DisplayName?: string;
        Description?: string;
        Type?: string;
        Length?: number;
        IsPrimaryKey?: boolean;
        IsRequired?: boolean;
        IsReadOnly?: boolean;
    };
}

/** Raw Integration Object as stored in the mj-sync metadata JSON. */
interface MetadataObject {
    fields: {
        Name: string;
        DisplayName?: string;
        Description?: string;
        SupportsWrite?: boolean;
        Category?: string;
    };
    relatedEntities?: {
        'MJ: Integration Object Fields'?: MetadataField[];
    };
}

/**
 * Registry of known connector aliases → connector instance, output filename,
 * and optional path to the integration metadata JSON file (relative to metadata/).
 * When metadataFile is set, writable objects defined there but not already covered
 * by GetActionGeneratorConfig() are supplemented into the generated action set.
 */
const CONNECTOR_REGISTRY: Record<string, {
    Connector: BaseIntegrationConnector;
    FileName: string;
    /** Relative path under the metadata/ dir, e.g. 'integrations/.hubspot.json' */
    MetadataFile?: string;
}> = {
    hubspot:     { Connector: new HubSpotConnector(),       FileName: '.hubspot-actions.json',      MetadataFile: 'integrations/.hubspot.json' },
    rasa:        { Connector: new RasaConnector(),           FileName: '.rasa-actions.json' },
    salesforce:  { Connector: new SalesforceConnector(),     FileName: '.salesforce-actions.json' },
    ym:          { Connector: new YourMembershipConnector(), FileName: '.ym-actions.json',         MetadataFile: 'integrations/.your-membership.json' },
    'sage-intacct': { Connector: new SageIntacctConnector(), FileName: '.sage-intacct-actions.json' },
    quickbooks:  { Connector: new QuickBooksConnector(),     FileName: '.quickbooks-actions.json' },
};

// ─── Metadata Supplement ─────────────────────────────────────────────

/**
 * Maps SQL column types from mj-sync metadata JSON to the simplified type strings
 * used by IntegrationFieldInfo. Falls back to 'string' for unmapped types.
 */
function sqlTypeToFieldType(sqlType: string | undefined, length?: number): string {
    switch ((sqlType ?? '').toLowerCase()) {
        case 'bigint':
        case 'int':
        case 'smallint':
        case 'tinyint':
            return 'number';
        case 'decimal':
        case 'numeric':
        case 'float':
        case 'real':
        case 'money':
        case 'smallmoney':
            return 'number';
        case 'bit':
            return 'boolean';
        case 'datetime':
        case 'datetime2':
        case 'datetimeoffset':
        case 'smalldatetime':
            return 'datetime';
        case 'date':
            return 'date';
        case 'nvarchar':
        case 'varchar':
        case 'char':
        case 'nchar':
            // -1 length = MAX → treat as text (nvarchar(MAX))
            return length === -1 ? 'text' : 'string';
        case 'ntext':
        case 'text':
            return 'text';
        default:
            return 'string';
    }
}

/**
 * Reads the integration metadata JSON and returns IntegrationObjectInfo entries
 * for every Integration Object that:
 *   1. Has SupportsWrite: true
 *   2. Is not already known to the connector at all — meaning not in
 *      allConnectorObjectNames (which includes CRM ancillary objects like calls/notes
 *      that have IncludeInActionGeneration: false, plus the 6 core CRM objects).
 *
 * This bridges the gap between the static metadata file (single source of truth for
 * non-CRM field schemas) and the action generator (which reads from connector memory).
 *
 * @param allConnectorObjectNames - ALL objects known to the connector regardless of
 *   IncludeInActionGeneration flag. Pass Set of lowercase names. Objects in this set
 *   are skipped even if they appear in the metadata with SupportsWrite: true.
 */
function buildObjectsFromMetadata(
    metadataPath: string,
    allConnectorObjectNames: Set<string>
): import('@memberjunction/integration-engine').IntegrationObjectInfo[] {
    if (!fs.existsSync(metadataPath)) {
        console.warn(`  Metadata file not found: ${metadataPath}`);
        return [];
    }

    const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as MjSyncRecord[];
    // Integration metadata files have one top-level record (the integration itself)
    const integrationRecord = raw[0];
    const allObjects = (
        integrationRecord?.relatedEntities?.['MJ: Integration Objects'] ?? []
    ) as MetadataObject[];

    // Exclude anything the connector already handles (directly or via IncludeInActionGeneration: false)
    const existingNames = allConnectorObjectNames;

    const result: import('@memberjunction/integration-engine').IntegrationObjectInfo[] = [];

    for (const obj of allObjects) {
        const name = obj.fields.Name;
        if (!name) continue;
        if (existingNames.has(name.toLowerCase())) continue;  // already generated by connector
        if (!obj.fields.SupportsWrite) continue;              // read-only — skip write actions

        // Skip association tables (named assoc_*) — they're managed differently
        if (name.startsWith('assoc_')) continue;

        const rawFields = obj.relatedEntities?.['MJ: Integration Object Fields'] ?? [];

        result.push({
            Name: name,
            DisplayName: obj.fields.DisplayName ?? name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            Description: obj.fields.Description,
            SupportsWrite: true,
            IncludeInActionGeneration: true,
            Fields: rawFields.map(f => ({
                Name: f.fields.Name,
                DisplayName: f.fields.DisplayName ?? f.fields.Name,
                Description: f.fields.Description,
                Type: sqlTypeToFieldType(f.fields.Type, f.fields.Length),
                IsRequired: f.fields.IsRequired ?? false,
                IsReadOnly: f.fields.IsReadOnly ?? false,
                IsPrimaryKey: f.fields.IsPrimaryKey ?? false,
            })),
        });
    }

    return result;
}

// ─── Main ────────────────────────────────────────────────────────────

function main(): void {
    const args = process.argv.slice(2);
    const outputDirArg = args.indexOf('--output-dir');
    const outputBase = outputDirArg >= 0 && args[outputDirArg + 1]
        ? args[outputDirArg + 1]
        : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../metadata');
    const actionsDir = path.join(outputBase, 'actions/integrations-auto-generated');
    const categoriesDir = path.join(outputBase, 'action-categories');

    // Determine which connectors to generate for
    const connectorArg = args.find(a => !a.startsWith('--') && args.indexOf(a) !== outputDirArg + 1);
    const targetAliases = connectorArg
        ? [connectorArg.toLowerCase()]
        : Object.keys(CONNECTOR_REGISTRY);

    // Ensure output directories exist
    fs.mkdirSync(actionsDir, { recursive: true });
    fs.mkdirSync(categoriesDir, { recursive: true });

    const generator = new ActionMetadataGenerator();
    let totalActions = 0;
    const allCategoryRecords: MjSyncRecord[] = [];

    for (const alias of targetAliases) {
        const entry = CONNECTOR_REGISTRY[alias];
        if (!entry) {
            console.error(`Unknown connector: "${alias}". Known: ${Object.keys(CONNECTOR_REGISTRY).join(', ')}`);
            process.exit(1);
        }

        const config = entry.Connector.GetActionGeneratorConfig();
        if (!config) {
            console.warn(`WARNING: Connector "${alias}" returned no action config — skipping`);
            continue;
        }

        // Supplement with writable objects from the static metadata file.
        // This covers non-CRM objects whose fields are defined in the integration JSON
        // but are not in the connector's in-memory GetIntegrationObjects() at all.
        // We exclude everything the connector knows about (including ancillary CRM objects
        // like calls/notes that have IncludeInActionGeneration: false) so they don't get
        // spurious write actions from the metadata pass.
        if (entry.MetadataFile) {
            const metadataPath = path.join(outputBase, entry.MetadataFile);
            const allConnectorNames = new Set(
                entry.Connector.GetIntegrationObjects().map(o => o.Name.toLowerCase())
            );
            const supplemental = buildObjectsFromMetadata(metadataPath, allConnectorNames);
            if (supplemental.length > 0) {
                config.Objects.push(...supplemental);
                console.log(`${config.IntegrationName}: supplemented ${supplemental.length} non-CRM objects from metadata`);
            }
        }

        const result = generator.Generate(config);

        // Merge with existing file to preserve primaryKey/sync from prior mj-sync pulls
        const actionsPath = path.join(actionsDir, entry.FileName);
        let existingActions: MjSyncRecord[] = [];
        if (fs.existsSync(actionsPath)) {
            existingActions = JSON.parse(fs.readFileSync(actionsPath, 'utf-8')) as MjSyncRecord[];
        }
        const mergedActions = mergeActionRecords(existingActions, result.ActionRecords as MjSyncRecord[]);
        fs.writeFileSync(actionsPath, JSON.stringify(mergedActions, null, 2) + '\n');
        console.log(`${config.IntegrationName}: generated ${result.ActionRecords.length} actions → ${entry.FileName}`);
        totalActions += result.ActionRecords.length;

        // Collect category records
        if (result.CategoryRecords.length > 0) {
            allCategoryRecords.push(...result.CategoryRecords);
            console.log(`${config.IntegrationName}: generated ${result.CategoryRecords.length} category record(s)`);
        }
    }

    // Write shared .mj-sync.json for actions (only if we generated something)
    if (totalActions > 0) {
        const syncConfig = new ActionMetadataGenerator().Generate({
            IntegrationName: '_', CategoryName: '_', Objects: [],
        }).SyncConfig;
        const syncPath = path.join(actionsDir, '.mj-sync.json');
        fs.writeFileSync(syncPath, JSON.stringify(syncConfig, null, 2) + '\n');
    }

    // Write integration category records (merge with existing file if present)
    if (allCategoryRecords.length > 0) {
        const categoryFile = path.join(categoriesDir, '.integration-categories.json');
        let existingRecords: MjSyncRecord[] = [];
        if (fs.existsSync(categoryFile)) {
            existingRecords = JSON.parse(fs.readFileSync(categoryFile, 'utf-8')) as MjSyncRecord[];
        }
        // Merge: preserve existing records with primaryKeys, replace/add by category Name
        const merged = mergeCategories(existingRecords, allCategoryRecords);
        fs.writeFileSync(categoryFile, JSON.stringify(merged, null, 2) + '\n');
        console.log(`\nWrote ${merged.length} category record(s) → .integration-categories.json`);
    }

    console.log(`\nTotal: ${totalActions} actions generated`);
}

/**
 * Merges newly generated action records with existing ones, preserving primaryKey/sync
 * blocks that were populated by a prior `mj sync pull`. Matches actions by Name.
 * Also preserves primaryKey/sync on nested relatedEntities (e.g., Action Params).
 */
function mergeActionRecords(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const existingByName = buildNameIndex(existing);

    return incoming.map(newRec => {
        const name = newRec.fields['Name'] as string | undefined;
        if (!name) return newRec;

        const oldRec = existingByName.get(name.toLowerCase());
        if (!oldRec) return newRec;

        const merged: MjSyncRecord = { ...newRec };
        if (oldRec.primaryKey) merged.primaryKey = oldRec.primaryKey;
        if (oldRec.sync) merged.sync = oldRec.sync;

        // Merge relatedEntities (preserving primaryKey/sync on child records like Action Params)
        if (newRec.relatedEntities && oldRec.relatedEntities) {
            const mergedRelated: Record<string, MjSyncRecord[]> = {};
            for (const [entityName, newChildren] of Object.entries(newRec.relatedEntities)) {
                const oldChildren = oldRec.relatedEntities[entityName];
                if (!oldChildren) {
                    mergedRelated[entityName] = newChildren;
                    continue;
                }
                mergedRelated[entityName] = mergeChildRecords(oldChildren, newChildren);
            }
            merged.relatedEntities = mergedRelated;
        }

        return merged;
    });
}

/** Merges child records (e.g., Action Params) by matching on Name field. */
function mergeChildRecords(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const existingByName = buildNameIndex(existing);

    return incoming.map(newRec => {
        const name = newRec.fields['Name'] as string | undefined;
        if (!name) return newRec;

        const oldRec = existingByName.get(name.toLowerCase());
        if (!oldRec) return newRec;

        const merged: MjSyncRecord = { ...newRec };
        if (oldRec.primaryKey) merged.primaryKey = oldRec.primaryKey;
        if (oldRec.sync) merged.sync = oldRec.sync;
        return merged;
    });
}

/** Merges new category records into existing ones, preserving primaryKey/sync for matches by Name. */
function mergeCategories(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const byName = buildNameIndex(existing);
    for (const rec of incoming) {
        const name = rec.fields['Name'] as string | undefined;
        if (!name) continue;
        const key = name.toLowerCase();
        const old = byName.get(key);
        if (old) {
            const merged: MjSyncRecord = { fields: rec.fields };
            if (old.primaryKey) merged.primaryKey = old.primaryKey;
            if (old.sync) merged.sync = old.sync;
            byName.set(key, merged);
        } else {
            byName.set(key, rec);
        }
    }
    return Array.from(byName.values());
}

/** Builds a Map from lowercase Name → record for quick lookup. */
function buildNameIndex(records: MjSyncRecord[]): Map<string, MjSyncRecord> {
    const index = new Map<string, MjSyncRecord>();
    for (const rec of records) {
        const name = rec.fields['Name'] as string | undefined;
        if (name) index.set(name.toLowerCase(), rec);
    }
    return index;
}

main();
