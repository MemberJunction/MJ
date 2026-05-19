#!/usr/bin/env node
/**
 * Fix state-province metadata files:
 * 1. Replace "_CountryISO2": "XX" with "CountryID": "@lookup:MJ: Countries.ISO2=XX"
 * 2. Convert escaped JSON strings in "CommonAliases" to actual JSON arrays
 *
 * Usage: node scripts/fix-state-province-metadata.mjs
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const STATE_PROVINCES_DIR = join(import.meta.dirname, '..', 'metadata', 'state-provinces');

async function findJsonFiles(dir) {
    const files = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await findJsonFiles(fullPath));
        } else if (entry.name.endsWith('.json') && entry.name !== '.mj-sync.json') {
            files.push(fullPath);
        }
    }
    return files;
}

async function processFile(filePath) {
    const raw = await readFile(filePath, 'utf-8');
    let records;
    try {
        records = JSON.parse(raw);
    } catch {
        console.warn(`  Skipping ${filePath} — not valid JSON`);
        return { changed: false };
    }

    if (!Array.isArray(records)) {
        console.warn(`  Skipping ${filePath} — not an array`);
        return { changed: false };
    }

    let changeCount = 0;

    for (const record of records) {
        const fields = record.fields;
        if (!fields) continue;

        // 1. Replace _CountryISO2 with CountryID @lookup
        if ('_CountryISO2' in fields) {
            const iso2 = fields._CountryISO2;
            delete fields._CountryISO2;
            fields.CountryID = `@lookup:MJ: Countries.ISO2=${iso2}`;
            changeCount++;
        }

        // 2. Convert escaped JSON string CommonAliases to actual JSON array
        if (typeof fields.CommonAliases === 'string') {
            try {
                const parsed = JSON.parse(fields.CommonAliases);
                if (Array.isArray(parsed)) {
                    fields.CommonAliases = parsed;
                    changeCount++;
                }
            } catch {
                // Not valid JSON string — leave as-is
            }
        }
    }

    if (changeCount > 0) {
        await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
    }

    return { changed: changeCount > 0, changeCount };
}

async function main() {
    console.log('Scanning state-province metadata files...');
    const files = await findJsonFiles(STATE_PROVINCES_DIR);
    console.log(`Found ${files.length} JSON files\n`);

    let totalFiles = 0;
    let totalChanges = 0;

    for (const file of files) {
        const { changed, changeCount } = await processFile(file);
        if (changed) {
            const relative = file.replace(STATE_PROVINCES_DIR + '/', '');
            console.log(`  ✓ ${relative} — ${changeCount} changes`);
            totalFiles++;
            totalChanges += changeCount;
        }
    }

    console.log(`\nDone: ${totalChanges} changes across ${totalFiles} files`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
