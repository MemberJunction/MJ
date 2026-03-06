/**
 * @fileoverview Configuration loader for CLI
 * @module @memberjunction/testing-cli
 */

import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';
import path from 'path';
import { CLIConfig } from '../types';

// Load environment variables BEFORE loading config
// This ensures process.env is populated when mj.config.cjs is evaluated
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });

export interface MJConfig {
    // Database settings
    dbHost?: string;
    dbDatabase?: string;
    dbPort?: number | string;
    dbUsername?: string;
    dbPassword?: string;
    coreSchema?: string;

    // Testing CLI specific settings
    testing?: {
        defaultEnvironment?: string;
        defaultFormat?: 'console' | 'json' | 'markdown';
        failFast?: boolean;
        parallel?: boolean;
        maxParallelTests?: number;
        timeout?: number;
    };

    // Legacy format database config
    database?: {
        host?: string;
        name?: string;
        port?: number;
        username?: string;
        password?: string;
        schema?: string;
    };
}

let cachedConfig: MJConfig | null = null;

/**
 * Load MJ configuration from mj.config.cjs
 *
 * @returns Full MJ configuration
 */
export async function loadMJConfig(): Promise<MJConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }

    // Clear any existing require cache for mj.config.cjs to ensure env vars are re-evaluated
    // This is necessary because mj.config.cjs uses process.env.DB_DATABASE directly
    const configPath = path.resolve(process.cwd(), 'mj.config.cjs');
    delete require.cache[configPath];

    // Create a new explorer instance to ensure fresh config load with current env vars
    const explorer = cosmiconfig('mj', {
        cache: false  // Disable caching to ensure fresh load
    });
    const result = await explorer.search();

    if (!result) {
        throw new Error(`No mj.config.cjs configuration found. Ensure you're running from the MJ repository root.`);
    }

    cachedConfig = result.config as MJConfig;
    return cachedConfig;
}

/**
 * Load testing CLI configuration with defaults
 *
 * @returns CLI configuration
 */
export function loadCLIConfig(): CLIConfig {
    // Synchronous version for backward compatibility
    // Uses cached config if available, otherwise returns defaults
    const testingConfig = cachedConfig?.testing || {};

    return {
        defaultEnvironment: testingConfig.defaultEnvironment || process.env.MJ_TEST_ENV || 'dev',
        defaultFormat: testingConfig.defaultFormat || 'console',
        failFast: testingConfig.failFast ?? false,
        parallel: testingConfig.parallel ?? false,
        maxParallelTests: testingConfig.maxParallelTests || 5,
        timeout: testingConfig.timeout || 300000,  // 5 minutes
        database: cachedConfig?.database || {
            host: cachedConfig?.dbHost || 'localhost',
            name: cachedConfig?.dbDatabase,
            port: typeof cachedConfig?.dbPort === 'string' ? parseInt(cachedConfig.dbPort) : cachedConfig?.dbPort,
            username: cachedConfig?.dbUsername,
            password: cachedConfig?.dbPassword,
            schema: cachedConfig?.coreSchema || '__mj'
        }
    };
}
