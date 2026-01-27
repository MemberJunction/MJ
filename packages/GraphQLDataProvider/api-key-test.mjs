/**
 * Test script for GraphQLDataProvider with API key authentication
 * Run from MJ repo root: node packages/GraphQLDataProvider/api-key-test.mjs
 */

import { setupGraphQLClient, GraphQLProviderConfigData } from './dist/index.mjs';
import { Metadata, RunView } from '@memberjunction/core';

// Configuration - set MJ_API_KEY environment variable before running
const API_KEY = process.env.MJ_API_KEY;
const GRAPHQL_URL = process.env.MJ_GRAPHQL_URL || 'http://localhost:4001/';
const GRAPHQL_WS_URL = process.env.MJ_GRAPHQL_WS_URL || 'ws://localhost:4001/';

if (!API_KEY) {
    console.error('Error: MJ_API_KEY environment variable is required');
    console.error('Usage: MJ_API_KEY=mj_sk_... node packages/GraphQLDataProvider/api-key-test.mjs');
    process.exit(1);
}

async function main() {
    console.log('=== GraphQL DataProvider API Key Test ===\n');

    try {
        // Step 1: Setup GraphQLDataProvider with API key
        console.log('Step 1: Setting up GraphQLDataProvider with API key...');
        console.log(`  URL: ${GRAPHQL_URL}`);
        console.log(`  API Key: ${API_KEY.substring(0, 15)}...`);

        // Create config using positional parameters:
        // (token, url, wsurl, refreshTokenFunction, MJCoreSchemaName, includeSchemas, excludeSchemas, mjAPIKey, userAPIKey)
        const config = new GraphQLProviderConfigData(
            '', // token - empty since using API key
            GRAPHQL_URL,
            GRAPHQL_WS_URL,
            async () => '', // refresh token function (no-op)
            '__mj', // MJCoreSchemaName
            undefined, // includeSchemas
            undefined, // excludeSchemas
            undefined, // mjAPIKey (system key)
            API_KEY // userAPIKey (user-specific API key)
        );

        // Debug: verify config is set correctly
        console.log('  Config URL:', config.URL);
        console.log('  Config WSURL:', config.WSURL);
        console.log('  Config UserAPIKey:', config.UserAPIKey ? 'set' : 'not set');

        const provider = await setupGraphQLClient(config);

        console.log('  ✓ Provider setup complete\n');

        // Step 2: Get list of entities
        console.log('Step 2: Getting list of entities...');
        const md = new Metadata();
        const entities = md.Entities;
        console.log(`  ✓ Found ${entities.length} entities`);

        // Show first 5 entities as sample
        console.log('  Sample entities:');
        entities.slice(0, 5).forEach(e => {
            console.log(`    - ${e.Name}`);
        });
        console.log();

        // Step 3: Run a view on Actions entity
        console.log('Step 3: Running view on Actions entity...');
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Actions',
            OrderBy: 'Name',
            ResultType: 'simple',
            Fields: ['ID', 'Name', 'Description', 'Status']
        });

        if (result.Success) {
            console.log(`  ✓ View returned ${result.Results.length} rows`);
            console.log('  Sample Actions:');
            result.Results.slice(0, 5).forEach((action) => {
                console.log(`    - ${action.Name} (${action.Status || 'N/A'})`);
            });
        } else {
            console.log(`  ✗ View failed: ${result.ErrorMessage}`);
        }

        console.log('\n=== Test Complete ===');
        process.exit(0);

    } catch (error) {
        console.error('\n✗ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
    }
}

main();
