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

/** Shape of an mj-sync record with optional primaryKey/sync populated by `mj sync pull`. */
interface MjSyncRecord {
    fields: Record<string, unknown>;
    primaryKey?: Record<string, string>;
    sync?: { lastModified: string; checksum: string };
    relatedEntities?: Record<string, MjSyncRecord[]>;
}

/**
 * Registry of known connector aliases → connector instance + output filename.
 * To add a new connector, add an entry here and import the connector class above.
 */
const CONNECTOR_REGISTRY: Record<string, { Connector: BaseIntegrationConnector; FileName: string }> = {
    hubspot:     { Connector: new HubSpotConnector(),           FileName: '.hubspot-actions.json' },
    rasa:        { Connector: new RasaConnector(),               FileName: '.rasa-actions.json' },
    salesforce:  { Connector: new SalesforceConnector(),         FileName: '.salesforce-actions.json' },
    ym:          { Connector: new YourMembershipConnector(),     FileName: '.ym-actions.json' },
};

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
