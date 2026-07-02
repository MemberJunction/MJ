#!/usr/bin/env node
/**
 * Inline all PNG screenshots into report.html as base64 data URIs,
 * producing a single self-contained report.standalone.html.
 *
 * Usage:
 *   node docker/regression/scripts/inline-report.cjs            # latest run
 *   node docker/regression/scripts/inline-report.cjs <run-dir>  # specific run
 */

const fs = require('fs');
const path = require('path');

const runDir = path.resolve(
    process.argv[2] || path.join(__dirname, '..', 'test-results', 'latest')
);

const inputPath = path.join(runDir, 'report.html');
const outputPath = path.join(runDir, 'report.standalone.html');

if (!fs.existsSync(inputPath)) {
    console.error(`report.html not found at ${inputPath}`);
    process.exit(1);
}

const cache = new Map();
function toDataUri(relPath) {
    if (cache.has(relPath)) return cache.get(relPath);
    const abs = path.join(runDir, relPath);
    const data = fs.readFileSync(abs);
    const uri = `data:image/png;base64,${data.toString('base64')}`;
    cache.set(relPath, uri);
    return uri;
}

let html = fs.readFileSync(inputPath, 'utf8');
let count = 0;

html = html.replace(
    /(src|data-src)="(screenshots\/[^"]+\.png)"/g,
    (_, attr, relPath) => {
        count++;
        return `${attr}="${toDataUri(relPath)}"`;
    }
);

fs.writeFileSync(outputPath, html);

const sizeMB = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`Inlined ${cache.size} unique image(s) across ${count} reference(s)`);
console.log(`Wrote ${outputPath} (${sizeMB} MB)`);
