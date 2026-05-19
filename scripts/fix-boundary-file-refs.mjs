#!/usr/bin/env node
/**
 * Fix @file: references in state-province metadata to use paths relative
 * to the .mj-sync.json location (metadata/state-provinces/), not relative
 * to the data file's directory.
 *
 * Changes: "@file:boundaries/XX-YY.geojson"
 *      To: "@file:by-country/XX/boundaries/XX-YY.geojson"
 *
 * Also reports any @file: references pointing to files that don't exist.
 *
 * Usage: node scripts/fix-boundary-file-refs.mjs
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const SYNC_ROOT = join(import.meta.dirname, '..', 'metadata', 'state-provinces');
const BY_COUNTRY = join(SYNC_ROOT, 'by-country');

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

async function main() {
    const files = await findJsonFiles(BY_COUNTRY);
    let totalFixed = 0;
    let totalMissing = 0;

    for (const filePath of files) {
        const raw = await readFile(filePath, 'utf-8');
        let records;
        try {
            records = JSON.parse(raw);
        } catch { continue; }
        if (!Array.isArray(records)) continue;

        // Extract country code from path: .../by-country/XX/file.json
        const parts = filePath.split('/');
        const byCountryIdx = parts.indexOf('by-country');
        if (byCountryIdx < 0) continue;
        const countryCode = parts[byCountryIdx + 1];

        let changed = false;

        for (const record of records) {
            const fields = record.fields;
            if (!fields?.BoundaryGeoJSON) continue;
            if (typeof fields.BoundaryGeoJSON !== 'string') continue;
            if (!fields.BoundaryGeoJSON.startsWith('@file:')) continue;

            const currentRef = fields.BoundaryGeoJSON;
            const currentRelPath = currentRef.replace('@file:', '');

            // Check if already has the correct by-country prefix
            if (currentRelPath.startsWith('by-country/')) {
                // Verify the file exists
                const fullFilePath = join(SYNC_ROOT, currentRelPath);
                if (!existsSync(fullFilePath)) {
                    console.log(`  MISSING: ${currentRef} (in ${countryCode})`);
                    totalMissing++;
                }
                continue;
            }

            // Fix: prepend by-country/XX/
            const fixedRelPath = `by-country/${countryCode}/${currentRelPath}`;
            const fixedRef = `@file:${fixedRelPath}`;

            // Verify the fixed path exists
            const fixedFullPath = join(SYNC_ROOT, fixedRelPath);
            if (existsSync(fixedFullPath)) {
                fields.BoundaryGeoJSON = fixedRef;
                changed = true;
                totalFixed++;
            } else {
                console.log(`  MISSING after fix: ${fixedRef} (in ${countryCode})`);
                // Still fix the path even if missing — at least the path structure is correct
                fields.BoundaryGeoJSON = fixedRef;
                changed = true;
                totalFixed++;
                totalMissing++;
            }
        }

        if (changed) {
            await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
        }
    }

    console.log(`\nDone: ${totalFixed} references fixed, ${totalMissing} files missing`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
