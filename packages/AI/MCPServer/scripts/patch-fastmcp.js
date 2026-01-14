#!/usr/bin/env node
/**
 * Patches fastmcp to add completions capability required for stdio transport.
 *
 * This is a workaround for a bug in fastmcp where setupCompleteHandlers() is called
 * but the completions capability isn't declared to the MCP SDK, causing an error:
 * "Server does not support completions (required for completion/complete)"
 *
 * This patch adds `this.#capabilities.completions = {};` after the logging capability
 * is set, which allows the completion handlers to be registered.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find fastmcp in node_modules (could be in package's node_modules or root)
// In an npm workspace, dependencies are hoisted to the root node_modules
const possiblePaths = [
    join(__dirname, '..', 'node_modules', 'fastmcp', 'dist', 'FastMCP.js'),
    join(__dirname, '..', '..', '..', 'node_modules', 'fastmcp', 'dist', 'FastMCP.js'),
    join(__dirname, '..', '..', '..', '..', 'node_modules', 'fastmcp', 'dist', 'FastMCP.js'),
    join(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'fastmcp', 'dist', 'FastMCP.js'),
];

let fastmcpPath = null;
for (const p of possiblePaths) {
    if (existsSync(p)) {
        fastmcpPath = p;
        break;
    }
}

if (!fastmcpPath) {
    console.error('Could not find fastmcp/dist/FastMCP.js');
    process.exit(1);
}

console.log(`Patching fastmcp at: ${fastmcpPath}`);

const content = readFileSync(fastmcpPath, 'utf-8');

// Check if already patched
if (content.includes('this.#capabilities.completions = {};')) {
    console.log('fastmcp already patched, skipping.');
    process.exit(0);
}

// Apply patch: add completions capability after logging capability
const patched = content.replace(
    'this.#capabilities.logging = {};',
    'this.#capabilities.logging = {};\n    this.#capabilities.completions = {};'
);

if (patched === content) {
    console.error('Could not find patch location in fastmcp. The library may have been updated.');
    process.exit(1);
}

writeFileSync(fastmcpPath, patched, 'utf-8');
console.log('Successfully patched fastmcp to add completions capability.');
