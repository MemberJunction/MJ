#!/usr/bin/env node

/**
 * Post-install script to fix deprecation warnings from nested dependencies
 *
 * Removes nested unzipper@0.10.x from exceljs to force hoisting to unzipper@0.12.3
 * This resolves Node.js DEP0180 deprecation warning (fs.Stats constructor is deprecated)
 *
 * Also removes nested entities@6.x from cheerio/htmlparser2 to use entities@4.5.0
 * This fixes ERR_PACKAGE_PATH_NOT_EXPORTED errors with tsx
 */

import { rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

let fixed = false;

// Fix unzipper
const nestedUnzipperPath = join(rootDir, 'node_modules', 'exceljs', 'node_modules', 'unzipper');
if (existsSync(nestedUnzipperPath)) {
    console.log('🔧 Removing nested unzipper@0.10.x from exceljs...');
    rmSync(nestedUnzipperPath, { recursive: true, force: true });
    console.log('✅ Nested unzipper removed. Top-level unzipper@0.12.3 will be used.');
    fixed = true;
}

// Fix entities in various packages
const nestedEntitiesPaths = [
    join(rootDir, 'node_modules', 'htmlparser2', 'node_modules', 'entities'),
    join(rootDir, 'node_modules', 'parse5', 'node_modules', 'entities'),
    join(rootDir, 'node_modules', 'parse5-sax-parser', 'node_modules', 'entities'),
    join(rootDir, 'node_modules', 'parse5-html-rewriting-stream', 'node_modules', 'entities'),
];

for (const path of nestedEntitiesPaths) {
    if (existsSync(path)) {
        const packageName = path.split('node_modules/')[1].split('/node_modules')[0];
        console.log(`🔧 Removing nested entities@6.x from ${packageName}...`);
        rmSync(path, { recursive: true, force: true });
        console.log(`✅ Nested entities removed from ${packageName}. Top-level entities@4.5.0 will be used.`);
        fixed = true;
    }
}

// Create compatibility shims for entities@2.2.0 to work with parse5@7.x
// parse5 expects entities/decode and entities/escape but entities@2.2.0 only exports from lib/
const entitiesShims = [
    { name: 'decode.js', content: "// Compatibility shim for entities/decode\nmodule.exports = require('./lib/decode.js');\n" },
    { name: 'escape.js', content: "// Compatibility shim for entities/escape\nmodule.exports = require('./lib/index.js').escape;\n" },
    { name: 'encode.js', content: "// Compatibility shim for entities/encode\nmodule.exports = require('./lib/encode.js');\n" },
    { name: 'decode_codepoint.js', content: "// Compatibility shim for entities/decode_codepoint\nmodule.exports = require('./lib/decode_codepoint.js');\n" }
];

for (const shim of entitiesShims) {
    const shimPath = join(rootDir, 'node_modules', 'entities', shim.name);
    if (!existsSync(shimPath)) {
        console.log(`🔧 Creating entities compatibility shim: ${shim.name}`);
        writeFileSync(shimPath, shim.content);
        console.log(`✅ Shim created: ${shim.name}`);
        fixed = true;
    }
}

if (!fixed) {
    console.log('✅ No problematic nested dependencies found. All good!');
}
