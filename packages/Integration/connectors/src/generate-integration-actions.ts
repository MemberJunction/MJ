#!/usr/bin/env node
/**
 * Internal CLI script that regenerates action metadata for MJ's bundled
 * connectors (HubSpot, Salesforce, Rasa.io, YourMembership, Sage Intacct,
 * QuickBooks). Delegates the actual file-IO + merge work to
 * `ActionGenerationRunner` so MJ-internal regeneration and downstream
 * consumers (via `mj codegen integration-actions`) share the same code path.
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

import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    ActionGenerationRunner,
    type BaseIntegrationConnector,
    type ConnectorRunInput,
} from '@memberjunction/integration-engine';
import { HubSpotConnector } from './HubSpotConnector.js';
import { RasaConnector } from './RasaConnector.js';
import { SalesforceConnector } from './SalesforceConnector.js';
import { YourMembershipConnector } from './YourMembershipConnector.js';
import { SageIntacctConnector } from './SageIntacctConnector.js';
import { QuickBooksConnector } from './QuickBooksConnector.js';

/**
 * Registry of known connector aliases → connector instance + output filename.
 * To add a new connector, add an entry here and import the connector class above.
 */
const CONNECTOR_REGISTRY: Record<string, { Connector: BaseIntegrationConnector; FileName: string }> = {
    hubspot:        { Connector: new HubSpotConnector(),           FileName: '.hubspot-actions.json' },
    rasa:           { Connector: new RasaConnector(),               FileName: '.rasa-actions.json' },
    salesforce:     { Connector: new SalesforceConnector(),         FileName: '.salesforce-actions.json' },
    ym:             { Connector: new YourMembershipConnector(),     FileName: '.ym-actions.json' },
    'sage-intacct': { Connector: new SageIntacctConnector(),        FileName: '.sage-intacct-actions.json' },
    quickbooks:     { Connector: new QuickBooksConnector(),         FileName: '.quickbooks-actions.json' },
};

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const outputDirArg = args.indexOf('--output-dir');
    const outputBase = outputDirArg >= 0 && args[outputDirArg + 1]
        ? args[outputDirArg + 1]
        : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../metadata');

    const connectorArg = args.find(a => !a.startsWith('--') && args.indexOf(a) !== outputDirArg + 1);
    const targetAliases = connectorArg
        ? [connectorArg.toLowerCase()]
        : Object.keys(CONNECTOR_REGISTRY);

    const connectorInputs: ConnectorRunInput[] = [];
    for (const alias of targetAliases) {
        const entry = CONNECTOR_REGISTRY[alias];
        if (!entry) {
            console.error(`Unknown connector: "${alias}". Known: ${Object.keys(CONNECTOR_REGISTRY).join(', ')}`);
            process.exit(1);
        }
        connectorInputs.push({ Connector: entry.Connector, FileName: entry.FileName });
    }

    const runner = new ActionGenerationRunner();
    const result = await runner.Run({
        Connectors: connectorInputs,
        OutputDir: outputBase,
        OnProgress: (msg) => console.log(msg),
    });

    console.log(`\nTotal: ${result.TotalActions} actions generated across ${result.Connectors.length} connector(s)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
