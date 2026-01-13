/**
 * @fileoverview CLI-specific types and interfaces
 * @module @memberjunction/testing-cli
 */

/**
 * Output format options for CLI commands
 */
export type OutputFormat = 'console' | 'json' | 'markdown';

/**
 * CLI configuration loaded from mj.config.cjs
 */
export interface CLIConfig {
    defaultEnvironment?: string;
    defaultFormat?: OutputFormat;
    failFast?: boolean;
    parallel?: boolean;
    maxParallelTests?: number;
    timeout?: number;
    database?: {
        host?: string;
        name?: string;
        port?: number;
        username?: string;
        password?: string;
        schema?: string;
    };
}

/**
 * Common flags shared across commands
 */
export interface CommonFlags {
    format?: OutputFormat;
    output?: string;
    verbose?: boolean;
}

/**
 * Flags for run command
 */
export interface RunFlags extends CommonFlags {
    name?: string;
    suite?: string;
    tag?: string;
    category?: string;
    difficulty?: string;
    all?: boolean;
    dryRun?: boolean;
    environment?: string;
    /**
     * Variable values to pass to the test (format: name=value)
     * Can be specified multiple times for multiple variables
     */
    var?: string[];
}

/**
 * Flags for suite command
 */
export interface SuiteFlags extends CommonFlags {
    name?: string;
    parallel?: boolean;
    failFast?: boolean;
    sequence?: string;
    /**
     * Variable values to pass to all tests in the suite (format: name=value)
     * Can be specified multiple times for multiple variables
     */
    var?: string[];
}

/**
 * Flags for list command
 */
export interface ListFlags extends CommonFlags {
    type?: string;
    suites?: boolean;
    types?: boolean;
    tag?: string;
    status?: string;
    /**
     * Show available variables for the test/test type
     */
    showVariables?: boolean;
}

/**
 * Flags for validate command
 */
export interface ValidateFlags extends CommonFlags {
    all?: boolean;
    type?: string;
    saveReport?: boolean;
}

/**
 * Flags for report command
 */
export interface ReportFlags extends CommonFlags {
    suite?: string;
    test?: string;
    from?: string;
    to?: string;
    includeCosts?: boolean;
    includeTrends?: boolean;
}

/**
 * Flags for history command
 */
export interface HistoryFlags extends CommonFlags {
    recent?: number;
    from?: string;
    status?: string;
}

/**
 * Flags for compare command
 */
export interface CompareFlags extends CommonFlags {
    version?: string[];
    commit?: string[];
    diffOnly?: boolean;
}
