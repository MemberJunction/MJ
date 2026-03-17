#!/usr/bin/env node
/**
 * Generic CLI script to generate integration action metadata files.
 *
 * Instantiates registered integration connectors, calls GetActionGeneratorConfig()
 * to get their object/field metadata, then uses ActionMetadataGenerator to produce
 * mj-sync compatible action JSON files.
 *
 * Usage:
 *   npx tsx src/generate-integration-actions.ts [connector-name] [--output-dir <path>]
 *
 * Examples:
 *   npx tsx src/generate-integration-actions.ts              # All connectors
 *   npx tsx src/generate-integration-actions.ts hubspot      # HubSpot only
 *   npx tsx src/generate-integration-actions.ts rasa         # Rasa.io only
 *   npx tsx src/generate-integration-actions.ts ym           # YourMembership only
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
import { YourMembershipConnector } from './YourMembershipConnector.js';

/**
 * Registry of known connector aliases → connector instance + output filename.
 * To add a new connector, add an entry here and import the connector class above.
 */
const CONNECTOR_REGISTRY: Record<string, { Connector: BaseIntegrationConnector; FileName: string }> = {
    hubspot:  { Connector: new HubSpotConnector(),           FileName: '.hubspot-actions.json' },
    rasa:     { Connector: new RasaConnector(),               FileName: '.rasa-actions.json' },
    ym:       { Connector: new YourMembershipConnector(),     FileName: '.ym-actions.json' },
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
    const allCategoryRecords: { fields: Record<string, unknown> }[] = [];

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

        // Write action records
        const actionsPath = path.join(actionsDir, entry.FileName);
        fs.writeFileSync(actionsPath, JSON.stringify(result.ActionRecords, null, 2) + '\n');
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
        let existingRecords: Record<string, unknown>[] = [];
        if (fs.existsSync(categoryFile)) {
            existingRecords = JSON.parse(fs.readFileSync(categoryFile, 'utf-8')) as Record<string, unknown>[];
        }
        // Merge: preserve existing records with primaryKeys, replace/add by category Name
        const merged = mergeCategories(existingRecords, allCategoryRecords);
        fs.writeFileSync(categoryFile, JSON.stringify(merged, null, 2) + '\n');
        console.log(`\nWrote ${merged.length} category record(s) → .integration-categories.json`);
    }

    console.log(`\nTotal: ${totalActions} actions generated`);
}

/** Merges new category records into existing ones, preserving primaryKey/sync for matches by Name. */
function mergeCategories(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[]
): Record<string, unknown>[] {
    const byName = new Map<string, Record<string, unknown>>();
    for (const rec of existing) {
        const fields = rec['fields'] as Record<string, unknown> | undefined;
        const name = fields?.['Name'] as string | undefined;
        if (name) byName.set(name.toLowerCase(), rec);
    }
    for (const rec of incoming) {
        const fields = rec['fields'] as Record<string, unknown> | undefined;
        const name = fields?.['Name'] as string | undefined;
        if (!name) continue;
        const key = name.toLowerCase();
        const old = byName.get(key);
        if (old) {
            // Preserve primaryKey and sync from existing, update fields
            const merged: Record<string, unknown> = { fields };
            if (old['primaryKey']) merged['primaryKey'] = old['primaryKey'];
            if (old['sync']) merged['sync'] = old['sync'];
            byName.set(key, merged);
        } else {
            byName.set(key, rec);
        }
    }
    return Array.from(byName.values());
}

main();
