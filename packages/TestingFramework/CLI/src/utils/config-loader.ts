/**
 * @fileoverview Configuration loader for CLI
 * @module @memberjunction/testing-cli
 */

import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';
import path from 'path';
import { CLIConfig } from '../types';

// Load environment variables BEFORE loading config, so process.env is populated
// when mj.config.cjs is evaluated.
//
// `override` is deliberately FALSE (dotenv's default): a variable already set in
// the environment must win over `.env`. With `override: true`, an explicit
// `DB_DATABASE=MJ_scratch mj test ...` was silently discarded and the suite ran —
// including mutation tests — against whatever `.env` pointed at. That makes the
// "one database per agent" rule (migrations/CLAUDE.md) unenforceable, and it
// diverged from every other `mj` command (`migrate`, `codegen`, `sync push` all
// honour the environment). Filling in only what is unset preserves the original
// intent without hijacking a deliberate override.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

export interface MJConfig {
    // Database settings
    /**
     * Which backend to connect to. Absent means SQL Server, so every existing config keeps its
     * behaviour; `initializeMJProvider` falls back to the DB_PLATFORM env var when this is unset,
     * which is how a repo whose mj.config.cjs predates this key still switches platform.
     */
    dbPlatform?: 'sqlserver' | 'postgresql';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    dbHost?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    dbDatabase?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    dbPort?: number | string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    dbUsername?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    dbPassword?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    coreSchema?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

    // Testing CLI specific settings
    testing?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
        /**
         * Module specifiers side-effect-imported before `mj test` resolves any integration
         * bundle — each import registers its check bundles on the IntegrationCheckRegistry.
         * In this repo: ['@memberjunction/integration-test-suite'] (the private content
         * package the published CLI must not depend on). See utils/check-module-loader.ts.
         */
        checkModules?: string[];
        defaultEnvironment?: string;
        defaultFormat?: 'console' | 'json' | 'markdown';
        failFast?: boolean;
        parallel?: boolean;
        maxParallelTests?: number;
        timeout?: number;
    };

    // Legacy format database config
    database?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
export async function LoadMJConfig(): Promise<MJConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }

    // Clear any existing require cache for mj.config.cjs to ensure env vars are re-evaluated.
    // require.cache is only available in CommonJS; in ESM, cosmiconfig's cache:false handles this.
    const configPath = path.resolve(process.cwd(), 'mj.config.cjs');
    if (typeof require !== 'undefined') {
        delete require.cache[configPath];
    }

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

/** @deprecated Use {@link LoadMJConfig}. */
export async function loadMJConfig(): Promise<MJConfig> {
    return LoadMJConfig();
}

/**
 * Load testing CLI configuration with defaults
 *
 * @returns CLI configuration
 */
export function LoadCLIConfig(): CLIConfig {
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

/** @deprecated Use {@link LoadCLIConfig}. */
export function loadCLIConfig(): CLIConfig {
    return LoadCLIConfig();
}
