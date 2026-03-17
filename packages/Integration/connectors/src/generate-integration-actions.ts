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
    const outputDir = path.join(outputBase, 'actions/integrations-auto-generated');

    // Determine which connectors to generate for
    const connectorArg = args.find(a => !a.startsWith('--') && args.indexOf(a) !== outputDirArg + 1);
    const targetAliases = connectorArg
        ? [connectorArg.toLowerCase()]
        : Object.keys(CONNECTOR_REGISTRY);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    const generator = new ActionMetadataGenerator();
    let totalActions = 0;

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
        const actionsPath = path.join(outputDir, entry.FileName);
        fs.writeFileSync(actionsPath, JSON.stringify(result.ActionRecords, null, 2) + '\n');
        console.log(`${config.IntegrationName}: generated ${result.ActionRecords.length} actions → ${entry.FileName}`);
        totalActions += result.ActionRecords.length;
    }

    // Write shared .mj-sync.json (only if we generated something)
    if (totalActions > 0) {
        const syncConfig = new ActionMetadataGenerator().Generate({
            IntegrationName: '_', CategoryName: '_', Objects: [],
        }).SyncConfig;
        const syncPath = path.join(outputDir, '.mj-sync.json');
        fs.writeFileSync(syncPath, JSON.stringify(syncConfig, null, 2) + '\n');
    }

    console.log(`\nTotal: ${totalActions} actions generated`);
}

main();
