#!/usr/bin/env node

/**
 * MemberJunction MCP Server - API Key Management CLI
 *
 * Commands:
 * - generate: Create a new API key
 * - revoke: Revoke an existing API key
 * - list: List API keys for a user
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables BEFORE importing config
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../../');
dotenv.config({ path: join(projectRoot, '.env') });

import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyEntity } from '@memberjunction/core-entities';
import { APIKeyService } from './APIKeyService.js';
import { configInfo } from './config.js';
import sql from 'mssql';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// SQL Server configuration
const poolConfig: sql.config = {
    server: configInfo.dbHost,
    port: configInfo.dbPort,
    user: configInfo.dbUsername,
    password: configInfo.dbPassword,
    database: configInfo.dbDatabase,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: configInfo.dbTrustServerCertificate === 'Y'
    }
};

if (configInfo.dbInstanceName) {
    poolConfig.options!.instanceName = configInfo.dbInstanceName;
}

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<void> {
    const pool = new sql.ConnectionPool(poolConfig);
    await pool.connect();

    const config = new SQLServerProviderConfigData(pool, configInfo.mjCoreSchema);
    await setupSQLServerClient(config);
    console.log('✅ Database connection established\n');
}

/**
 * Find user by email
 */
async function findUserByEmail(email: string, contextUser: UserInfo): Promise<UserInfo | null> {
    const rv = new RunView();
    const result = await rv.RunView<UserInfo>({
        EntityName: 'Users',
        ExtraFilter: `Email='${email}'`,
        Fields: ['ID', 'Email', 'Name', 'FirstName', 'LastName'],
        ResultType: 'entity_object'
    }, contextUser);

    if (!result.Success || !result.Results || result.Results.length === 0) {
        return null;
    }

    return result.Results[0];
}

/**
 * Get available scopes
 */
async function getAvailableScopes(contextUser: UserInfo): Promise<{ Name: string; Category: string; Description: string }[]> {
    const rv = new RunView();
    const result = await rv.RunView<{ Name: string; Category: string; Description: string }>({
        EntityName: 'MJ: API Scopes',
        Fields: ['Name', 'Category', 'Description'],
        OrderBy: 'Category, Name',
        ResultType: 'simple'
    }, contextUser);

    if (!result.Success) {
        throw new Error(`Failed to load scopes: ${result.ErrorMessage}`);
    }

    return result.Results || [];
}

/**
 * Generate a new API key
 */
async function generateKey(argv: any): Promise<void> {
    try {
        await initializeDatabase();

        const adminUser = UserCache.Instance.Users[0];
        const userEmail = argv.user;
        const keyName = argv.name;
        const scopeNames = argv.scopes.split(',').map((s: string) => s.trim());
        const expiresInDays = argv.expires;

        // Find target user
        const targetUser = await findUserByEmail(userEmail, adminUser);
        if (!targetUser) {
            console.error(`❌ User not found: ${userEmail}`);
            process.exit(1);
        }

        console.log(`Creating API key for user: ${targetUser.Email} (${targetUser.Name})`);
        console.log(`Scopes: ${scopeNames.join(', ')}`);

        // Calculate expiration date
        let expiresAt: Date | undefined;
        if (expiresInDays > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);
            console.log(`Expires: ${expiresAt.toISOString()}`);
        } else {
            console.log(`Expires: Never`);
        }

        console.log('');

        // Generate API key
        const result = await APIKeyService.GenerateAPIKey(
            targetUser.ID,
            scopeNames,
            adminUser.ID,
            keyName,
            expiresAt,
            adminUser
        );

        if (!result.success) {
            console.error(`❌ Failed to generate API key: ${result.errorMessage}`);
            process.exit(1);
        }

        // Set rate limits if provided (requires migration V202601152000 to be run)
        if (argv.rateLimit || argv.rateWindow) {
            try {
                const md = new Metadata();
                const apiKeyEntity = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', adminUser);
                await apiKeyEntity.Load(result.keyId!);

                // Try to set rate limit fields (will work if migration was run)
                if (apiKeyEntity.GetFieldByName('RateLimitRequests')) {
                    apiKeyEntity.Set('RateLimitRequests', argv.rateLimit || 1000);
                    apiKeyEntity.Set('RateLimitWindowSeconds', argv.rateWindow || 3600);
                    await apiKeyEntity.Save();
                    console.log(`✅ Rate limit configured: ${argv.rateLimit} requests per ${argv.rateWindow}s\n`);
                } else {
                    console.log(`⚠️  Rate limit fields not available. Run migration V202601152000 to enable rate limiting.\n`);
                }
            } catch (error) {
                console.log(`⚠️  Could not set rate limits: ${error instanceof Error ? error.message : String(error)}\n`);
            }
        }

        console.log('🎉 API Key Generated Successfully!\n');
        console.log('='.repeat(70));
        console.log('⚠️  IMPORTANT: Save this key now - it will never be shown again!');
        console.log('='.repeat(70));
        console.log('');
        console.log(`API Key:  ${result.apiKey}`);
        console.log(`Key ID:   ${result.keyId}`);
        console.log('');
        console.log('='.repeat(70));
        console.log('');
        console.log('Usage:');
        console.log('  Add to Authorization header:');
        console.log(`    Authorization: Bearer ${result.apiKey}`);
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * Revoke an API key
 */
async function revokeKey(argv: any): Promise<void> {
    try {
        await initializeDatabase();

        const adminUser = UserCache.Instance.Users[0];
        const keyId = argv.keyId;

        console.log(`Revoking API key: ${keyId}...\n`);

        const result = await APIKeyService.RevokeAPIKey(keyId, adminUser);

        if (!result.success) {
            console.error(`❌ Failed to revoke key: ${result.errorMessage}`);
            process.exit(1);
        }

        console.log('✅ API key revoked successfully\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * List API keys for a user
 */
async function listKeys(argv: any): Promise<void> {
    try {
        await initializeDatabase();

        const adminUser = UserCache.Instance.Users[0];
        const userEmail = argv.user;

        // Find target user
        const targetUser = await findUserByEmail(userEmail, adminUser);
        if (!targetUser) {
            console.error(`❌ User not found: ${userEmail}`);
            process.exit(1);
        }

        console.log(`API keys for: ${targetUser.Email} (${targetUser.Name})\n`);

        // Load keys for user
        const rv = new RunView();
        const result = await rv.RunView<APIKeyEntity>({
            EntityName: 'MJ: API Keys',
            ExtraFilter: `UserID='${targetUser.ID}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object'
        }, adminUser);

        if (!result.Success) {
            console.error(`❌ Failed to load keys: ${result.ErrorMessage}`);
            process.exit(1);
        }

        const keys = result.Results || [];

        if (keys.length === 0) {
            console.log('No API keys found for this user.\n');
            process.exit(0);
        }

        console.log(`Found ${keys.length} API key(s):\n`);

        for (const key of keys) {
            const status = key.Status === 'Active' ? '✅' : '❌';
            const name = key.Name || '(unnamed)';
            const created = key.Get('__mj_CreatedAt') as Date;
            const expires = key.ExpiresAt ? new Date(key.ExpiresAt) : null;
            const lastUsed = key.LastUsedAt ? new Date(key.LastUsedAt) : null;

            console.log(`${status} ${name}`);
            console.log(`   ID:        ${key.ID}`);
            console.log(`   Status:    ${key.Status}`);
            console.log(`   Created:   ${created.toISOString()}`);
            console.log(`   Expires:   ${expires ? expires.toISOString() : 'Never'}`);
            console.log(`   Last Used: ${lastUsed ? lastUsed.toISOString() : 'Never'}`);
            console.log('');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * List available scopes
 */
async function listScopes(): Promise<void> {
    try {
        await initializeDatabase();

        const adminUser = UserCache.Instance.Users[0];
        console.log('Available API Key Scopes:\n');

        const scopes = await getAvailableScopes(adminUser);

        let currentCategory = '';
        for (const scope of scopes) {
            if (scope.Category !== currentCategory) {
                currentCategory = scope.Category;
                console.log(`\n${currentCategory}:`);
            }
            console.log(`  • ${scope.Name.padEnd(25)} ${scope.Description}`);
        }

        console.log('');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// CLI Configuration
yargs(hideBin(process.argv))
    .scriptName('mj-api-keys')
    .usage('$0 <command> [options]')
    .command(
        'generate',
        'Generate a new API key',
        (yargs) => {
            return yargs
                .option('user', {
                    alias: 'u',
                    type: 'string',
                    description: 'User email address',
                    demandOption: true
                })
                .option('scopes', {
                    alias: 's',
                    type: 'string',
                    description: 'Comma-separated list of scopes (use "list-scopes" to see available scopes)',
                    demandOption: true
                })
                .option('name', {
                    alias: 'n',
                    type: 'string',
                    description: 'Friendly name for the key',
                    default: undefined
                })
                .option('expires', {
                    alias: 'e',
                    type: 'number',
                    description: 'Expiration in days (0 = never expires)',
                    default: 0
                })
                .option('rate-limit', {
                    type: 'number',
                    description: 'Maximum requests per window (default: 1000)',
                    default: 1000
                })
                .option('rate-window', {
                    type: 'number',
                    description: 'Rate limit window in seconds (default: 3600 = 1 hour)',
                    default: 3600
                });
        },
        generateKey
    )
    .command(
        'revoke',
        'Revoke an API key',
        (yargs) => {
            return yargs.option('key-id', {
                alias: 'k',
                type: 'string',
                description: 'API key ID to revoke',
                demandOption: true
            });
        },
        revokeKey
    )
    .command(
        'list',
        'List API keys for a user',
        (yargs) => {
            return yargs.option('user', {
                alias: 'u',
                type: 'string',
                description: 'User email address',
                demandOption: true
            });
        },
        listKeys
    )
    .command(
        'list-scopes',
        'List all available scopes',
        () => {},
        listScopes
    )
    .demandCommand(1, 'You must specify a command')
    .help()
    .alias('help', 'h')
    .version('1.0.0')
    .alias('version', 'v')
    .parse();
