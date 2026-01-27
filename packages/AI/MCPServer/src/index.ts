#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the MemberJunction MCP Server.
 *
 * This module provides the command-line interface for starting and managing
 * the MCP server. It supports:
 * - Starting the server with optional tool filtering
 * - Listing available tools without starting the server
 * - Loading filter configuration from JSON files
 *
 * @example
 * ```bash
 * # Start server with all tools
 * npx @memberjunction/ai-mcp-server
 *
 * # Start with filtered tools
 * npx @memberjunction/ai-mcp-server --include "Get_*,Run_Agent"
 *
 * # List available tools
 * npx @memberjunction/ai-mcp-server --list-tools
 * ```
 *
 * @module @memberjunction/ai-mcp-server/cli
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initializeServer, listAvailableTools, ToolFilterOptions } from './Server.js';

/** CLI argument types */
interface CLIArguments {
    /** Comma-separated tool patterns to include */
    include?: string;
    /** Comma-separated tool patterns to exclude */
    exclude?: string;
    /** Path to JSON file with filter configuration */
    toolsFile?: string;
    /** If true, list tools and exit without starting server */
    listTools: boolean;
}

/**
 * Main CLI entry point.
 * Parses command-line arguments and either lists tools or starts the server.
 */
async function main(): Promise<void> {
    const argv = await yargs(hideBin(process.argv))
        .option('include', {
            alias: 'i',
            type: 'string',
            description: 'Comma-separated tool name patterns to include (supports wildcards: *, Get_*, *_Record)',
            coerce: (arg: string) => arg
        })
        .option('exclude', {
            alias: 'e',
            type: 'string',
            description: 'Comma-separated tool name patterns to exclude (supports wildcards)',
            coerce: (arg: string) => arg
        })
        .option('tools-file', {
            alias: 'f',
            type: 'string',
            description: 'Path to a JSON file containing tool filter configuration',
            coerce: (arg: string) => arg
        })
        .option('list-tools', {
            alias: 'l',
            type: 'boolean',
            default: false,
            description: 'List all available tools and exit without starting the server'
        })
        .example('$0', 'Start server with all configured tools')
        .example('$0 --include "Get_Users_Record,Run_Agent"', 'Start with only specific tools')
        .example('$0 --include "Get_*" --exclude "Get_AuditLogs_*"', 'Include pattern with exclusions')
        .example('$0 --list-tools', 'Show all available tool names')
        .example('$0 --tools-file ./my-tools.json', 'Load tool filter from file')
        .help()
        .alias('help', 'h')
        .version()
        .alias('version', 'v')
        .parse() as CLIArguments;

    // Build filter options from CLI arguments
    const filterOptions: ToolFilterOptions = {};

    // Handle --tools-file option
    if (argv.toolsFile) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const filePath = path.resolve(process.cwd(), argv.toolsFile);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);

            if (fileConfig.include) {
                filterOptions.includePatterns = Array.isArray(fileConfig.include)
                    ? fileConfig.include
                    : [fileConfig.include];
            }
            if (fileConfig.exclude) {
                filterOptions.excludePatterns = Array.isArray(fileConfig.exclude)
                    ? fileConfig.exclude
                    : [fileConfig.exclude];
            }
        } catch (error) {
            console.error(`Error reading tools file: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    }

    // CLI arguments override file configuration
    if (argv.include) {
        filterOptions.includePatterns = argv.include.split(',').map(p => p.trim());
    }
    if (argv.exclude) {
        filterOptions.excludePatterns = argv.exclude.split(',').map(p => p.trim());
    }

    // Handle --list-tools option
    if (argv.listTools) {
        await listAvailableTools(filterOptions);
        process.exit(0);
    }

    // Start the server with filter options
    await initializeServer(filterOptions);
}

main().catch(error => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});
