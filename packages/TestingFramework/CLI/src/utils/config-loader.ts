/**
 * @fileoverview Configuration loader for CLI
 * @module @memberjunction/testing-cli
 */

import { CLIConfig } from '../types';

/**
 * Load testing configuration from mj.config.cjs
 *
 * @returns CLI configuration with defaults
 *
 * Note: Currently returns default values. Full config loading requires
 * accessing MJ config system which may not be available in CLI context.
 */
export function loadCLIConfig(): CLIConfig {
    // TODO: Load from process.env or config file when available
    // For now, return defaults
    return {
        defaultEnvironment: process.env.MJ_TEST_ENV || 'dev',
        defaultFormat: 'console',
        failFast: false,
        parallel: false,
        maxParallelTests: 5,
        timeout: 300000  // 5 minutes
    };
}
